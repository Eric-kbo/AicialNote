package auth

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"golang.org/x/oauth2"

	"aicialnote/internal/config"
	"aicialnote/internal/session"
)

// fakeProvider is a minimal OAuth token endpoint.
func fakeProvider(t *testing.T) (*httptest.Server, *[]url.Values) {
	t.Helper()
	var calls []url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		calls = append(calls, r.PostForm)
		w.Header().Set("Content-Type", "application/json")
		switch r.PostForm.Get("grant_type") {
		case "authorization_code":
			if r.PostForm.Get("code_verifier") == "" {
				http.Error(w, `{"error":"invalid_request"}`, 400)
				return
			}
			claims, _ := json.Marshal(map[string]string{"sub": "u1", "email": "a@b.com", "name": "Ann"})
			idToken := "x." + base64.RawURLEncoding.EncodeToString(claims) + ".y"
			body := map[string]any{
				"access_token": "at1", "refresh_token": "rt1", "expires_in": 3600, "token_type": "Bearer", "id_token": idToken,
			}
			// The code stands in for what the user ticked on the consent screen.
			switch r.PostForm.Get("code") {
			case "partial":
				body["scope"] = "openid email"
			case "full":
				body["scope"] = "openid email Files.ReadWrite.AppFolder"
			}
			_ = json.NewEncoder(w).Encode(body)
		case "refresh_token":
			if r.PostForm.Get("refresh_token") == "revoked" {
				w.WriteHeader(400)
				_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "at2", "refresh_token": "rt2", "expires_in": 3600, "token_type": "Bearer",
			})
		}
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func newTestHandler(t *testing.T, tokenURL string) (*Handler, *http.ServeMux) {
	t.Helper()
	public, _ := url.Parse("https://app.example")
	cfg := &config.Config{PublicURL: public}
	sealer, _ := session.NewSealer(make([]byte, 32), true)
	p := &Provider{
		ID: "microsoft", Name: "Test",
		OAuth: &oauth2.Config{
			ClientID: "cid", ClientSecret: "secret",
			Endpoint:    oauth2.Endpoint{AuthURL: "https://idp.example/authorize", TokenURL: tokenURL},
			RedirectURL: "https://app.example/auth/microsoft/callback",
			Scopes:      []string{"openid", "Files.ReadWrite.AppFolder"},
		},
	}
	h := &Handler{cfg: cfg, sealer: sealer, providers: map[string]*Provider{p.ID: p}, order: []*Provider{p}}
	mux := http.NewServeMux()
	h.Register(mux)
	return h, mux
}

func do(mux *http.ServeMux, req *http.Request, cookies []*http.Cookie) *http.Response {
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec.Result()
}

func cookie(res *http.Response, name string) *http.Cookie {
	for _, c := range res.Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestFullFlow(t *testing.T) {
	idp, calls := fakeProvider(t)
	_, mux := newTestHandler(t, idp.URL)

	// 1. login → redirect to provider with PKCE, flow cookie set
	res := do(mux, httptest.NewRequest("GET", "/auth/microsoft/login", nil), nil)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("login status %d", res.StatusCode)
	}
	loc, _ := url.Parse(res.Header.Get("Location"))
	if loc.Query().Get("code_challenge_method") != "S256" || loc.Query().Get("state") == "" {
		t.Fatalf("missing PKCE/state: %s", loc)
	}
	flow := cookie(res, flowCookie)
	if flow == nil || flow.SameSite != http.SameSiteLaxMode {
		t.Fatal("flow cookie must be set with SameSite=Lax")
	}

	// 2. callback with wrong state is rejected
	bad := do(mux, httptest.NewRequest("GET", "/auth/microsoft/callback?code=c&state=nope", nil), []*http.Cookie{flow})
	if !strings.Contains(bad.Header.Get("Location"), "auth_error=state") {
		t.Fatalf("bad state not rejected: %s", bad.Header.Get("Location"))
	}

	// 3. callback → session cookie with refresh token
	cb := httptest.NewRequest("GET", "/auth/microsoft/callback?code=c&state="+loc.Query().Get("state"), nil)
	res = do(mux, cb, []*http.Cookie{flow})
	if got := res.Header.Get("Location"); got != "/?connected=microsoft" {
		t.Fatalf("callback redirect %q", got)
	}
	sess := cookie(res, sessionPref+"microsoft")
	if sess == nil || !sess.HttpOnly || sess.SameSite != http.SameSiteStrictMode {
		t.Fatal("session cookie must be HttpOnly + SameSite=Strict")
	}
	if strings.Contains(sess.Value, "rt1") {
		t.Fatal("refresh token must not be readable in the cookie")
	}

	// 4. token without CSRF header is refused
	res = do(mux, httptest.NewRequest("POST", "/auth/microsoft/token", nil), []*http.Cookie{sess})
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("missing CSRF header: status %d", res.StatusCode)
	}
	// …and from another origin
	req := httptest.NewRequest("POST", "/auth/microsoft/token", nil)
	req.Header.Set(csrfHeader, "1")
	req.Header.Set("Origin", "https://evil.example")
	if res = do(mux, req, []*http.Cookie{sess}); res.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin: status %d", res.StatusCode)
	}

	// 5. token → fresh access token, refresh token rotated, scope sent for Microsoft
	req = httptest.NewRequest("POST", "/auth/microsoft/token", nil)
	req.Header.Set(csrfHeader, "1")
	req.Header.Set("Origin", "https://app.example")
	res = do(mux, req, []*http.Cookie{sess})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("token status %d", res.StatusCode)
	}
	var body struct {
		AccessToken string  `json:"accessToken"`
		Account     Account `json:"account"`
	}
	_ = json.NewDecoder(res.Body).Decode(&body)
	if body.AccessToken != "at2" || body.Account.Email != "a@b.com" {
		t.Fatalf("unexpected body %+v", body)
	}
	last := (*calls)[len(*calls)-1]
	if last.Get("refresh_token") != "rt1" || last.Get("scope") == "" {
		t.Fatalf("refresh request %v", last)
	}
	if cookie(res, sessionPref+"microsoft") == nil {
		t.Fatal("session cookie should be re-issued with the rotated refresh token")
	}
}

func TestCallbackRejectsMissingScope(t *testing.T) {
	idp, _ := fakeProvider(t)
	h, mux := newTestHandler(t, idp.URL)
	h.providers["microsoft"].RequiredScopes = []string{"Files.ReadWrite.AppFolder"}

	callback := func(code string) *http.Response {
		res := do(mux, httptest.NewRequest("GET", "/auth/microsoft/login", nil), nil)
		loc, _ := url.Parse(res.Header.Get("Location"))
		cb := httptest.NewRequest("GET", "/auth/microsoft/callback?code="+code+"&state="+loc.Query().Get("state"), nil)
		return do(mux, cb, []*http.Cookie{cookie(res, flowCookie)})
	}

	res := callback("partial")
	if got := res.Header.Get("Location"); got != "/?auth_error=missing_scope" {
		t.Fatalf("partial grant redirect %q", got)
	}
	if cookie(res, sessionPref+"microsoft") != nil {
		t.Fatal("a partial grant must not create a session")
	}

	res = callback("full")
	if got := res.Header.Get("Location"); got != "/?connected=microsoft" {
		t.Fatalf("full grant redirect %q", got)
	}
	if cookie(res, sessionPref+"microsoft") == nil {
		t.Fatal("a full grant should create a session")
	}
}

func TestRevokedRefreshTokenSignsOut(t *testing.T) {
	idp, _ := fakeProvider(t)
	h, mux := newTestHandler(t, idp.URL)

	rec := httptest.NewRecorder()
	if err := h.saveSession(rec, "microsoft", sessionState{RefreshToken: "revoked"}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/auth/microsoft/token", nil)
	req.Header.Set(csrfHeader, "1")
	res := do(mux, req, rec.Result().Cookies())
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d", res.StatusCode)
	}
	if c := cookie(res, sessionPref+"microsoft"); c == nil || c.MaxAge >= 0 {
		t.Fatal("session cookie should be cleared")
	}
}
