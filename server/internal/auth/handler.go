// Package auth is the OAuth broker. It exchanges authorization codes, keeps the
// refresh token in an encrypted HttpOnly cookie and hands short-lived access
// tokens to the browser. It never sees or stores user data: the browser talks
// to Google Drive / OneDrive directly.
package auth

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"golang.org/x/oauth2"

	"aicialnote/internal/config"
	"aicialnote/internal/session"
)

const (
	cookiePath  = "/auth/"
	flowTTL     = 10 * time.Minute
	sessionTTL  = 400 * 24 * time.Hour // browsers cap cookie lifetime at 400 days
	csrfHeader  = "X-AicialNote"
	flowCookie  = "an_flow"
	sessionPref = "an_s_"
)

type flowState struct {
	Provider string `json:"p"`
	State    string `json:"s"`
	Verifier string `json:"v"`
}

type sessionState struct {
	RefreshToken string  `json:"rt"`
	Account      Account `json:"a"`
}

type Handler struct {
	cfg       *config.Config
	sealer    *session.Sealer
	providers map[string]*Provider
	order     []*Provider
}

func NewHandler(cfg *config.Config, sealer *session.Sealer) *Handler {
	h := &Handler{cfg: cfg, sealer: sealer, providers: map[string]*Provider{}}
	for _, p := range Providers(cfg) {
		h.providers[p.ID] = p
		h.order = append(h.order, p)
	}
	return h
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /auth/providers", h.listProviders)
	mux.HandleFunc("GET /auth/{provider}/login", h.login)
	mux.HandleFunc("GET /auth/{provider}/callback", h.callback)
	mux.HandleFunc("POST /auth/{provider}/token", h.token)
	mux.HandleFunc("POST /auth/{provider}/logout", h.logout)
}

func (h *Handler) listProviders(w http.ResponseWriter, _ *http.Request) {
	type item struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	out := []item{}
	for _, p := range h.order {
		out = append(out, item{ID: p.ID, Name: p.Name})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	p, ok := h.providers[r.PathValue("provider")]
	if !ok {
		http.NotFound(w, r)
		return
	}
	flow := flowState{Provider: p.ID, State: oauth2.GenerateVerifier(), Verifier: oauth2.GenerateVerifier()}
	// Lax: the cookie has to survive the top-level redirect back from the provider.
	err := h.sealer.Set(w, flowCookie, flow, session.CookieOptions{Path: cookiePath, TTL: flowTTL, SameSite: http.SameSiteLaxMode})
	if err != nil {
		h.fail(w, r, "internal", err)
		return
	}
	opts := append([]oauth2.AuthCodeOption{oauth2.S256ChallengeOption(flow.Verifier)}, p.AuthParams...)
	if hint := r.URL.Query().Get("login_hint"); hint != "" {
		opts = append(opts, oauth2.SetAuthURLParam("login_hint", hint))
	}
	http.Redirect(w, r, p.OAuth.AuthCodeURL(flow.State, opts...), http.StatusFound)
}

func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	p, ok := h.providers[r.PathValue("provider")]
	if !ok {
		http.NotFound(w, r)
		return
	}
	var flow flowState
	err := h.sealer.Get(r, flowCookie, &flow)
	h.sealer.Clear(w, flowCookie, cookiePath)
	if err != nil || flow.Provider != p.ID {
		h.fail(w, r, "expired", err)
		return
	}
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		// e.g. access_denied when the user cancels
		h.fail(w, r, e, nil)
		return
	}
	if subtle.ConstantTimeCompare([]byte(q.Get("state")), []byte(flow.State)) != 1 {
		h.fail(w, r, "state", nil)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	tok, err := p.OAuth.Exchange(ctx, q.Get("code"), oauth2.VerifierOption(flow.Verifier))
	if err != nil {
		h.fail(w, r, "exchange", err)
		return
	}
	if missing := p.missingScopes(tok); len(missing) > 0 {
		// Don't create a session that can sign in but can't reach the drive.
		h.fail(w, r, "missing_scope", nil)
		return
	}
	if tok.RefreshToken == "" {
		h.fail(w, r, "no_refresh_token", nil)
		return
	}
	account, err := accountFromToken(p.ID, tok)
	if err != nil {
		h.fail(w, r, "identity", err)
		return
	}
	if err := h.saveSession(w, p.ID, sessionState{RefreshToken: tok.RefreshToken, Account: account}); err != nil {
		h.fail(w, r, "internal", err)
		return
	}
	http.Redirect(w, r, h.appURL(url.Values{"connected": {p.ID}}), http.StatusFound)
}

// token returns a fresh access token. Called by the app on start and whenever
// the previous token is about to expire.
func (h *Handler) token(w http.ResponseWriter, r *http.Request) {
	p, ok := h.providers[r.PathValue("provider")]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if !h.sameOrigin(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	var s sessionState
	if err := h.sealer.Get(r, sessionPref+p.ID, &s); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "signed_out"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	tok, err := refresh(ctx, p, s.RefreshToken)
	if err != nil {
		if errors.As(err, new(errReauth)) {
			// Revoked, expired or password changed: the user must sign in again.
			h.sealer.Clear(w, sessionPref+p.ID, cookiePath)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "signed_out"})
			return
		}
		slog.Warn("token refresh failed", "provider", p.ID, "err", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "provider_unavailable"})
		return
	}

	// Microsoft rotates refresh tokens; keep the newest. Re-setting the cookie
	// also slides its expiry forward.
	if tok.RefreshToken != "" {
		s.RefreshToken = tok.RefreshToken
	}
	if err := h.saveSession(w, p.ID, s); err != nil {
		slog.Warn("could not refresh session cookie", "err", err)
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"accessToken": tok.AccessToken,
		"expiresAt":   tok.Expiry.UnixMilli(),
		"account":     s.Account,
	})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if !h.sameOrigin(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	// Only forget the session in this browser. Revoking the grant at the
	// provider would also sign out the user's other devices.
	h.sealer.Clear(w, sessionPref+r.PathValue("provider"), cookiePath)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) saveSession(w http.ResponseWriter, provider string, s sessionState) error {
	return h.sealer.Set(w, sessionPref+provider, s, session.CookieOptions{
		Path:     cookiePath,
		TTL:      sessionTTL,
		SameSite: http.SameSiteStrictMode,
	})
}

// sameOrigin blocks cross-site requests. The custom header forces a CORS
// preflight, which this server never approves; Origin is checked when present.
func (h *Handler) sameOrigin(r *http.Request) bool {
	if r.Header.Get(csrfHeader) != "1" {
		return false
	}
	origin := r.Header.Get("Origin")
	return origin == "" || origin == h.cfg.Origin()
}

func (h *Handler) appURL(q url.Values) string {
	base := h.cfg.PublicURL.Path + "/"
	if len(q) > 0 {
		base += "?" + q.Encode()
	}
	return base
}

func (h *Handler) fail(w http.ResponseWriter, r *http.Request, code string, err error) {
	if err != nil {
		slog.Warn("auth failed", "code", code, "path", r.URL.Path, "err", err)
	}
	http.Redirect(w, r, h.appURL(url.Values{"auth_error": {code}}), http.StatusFound)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
