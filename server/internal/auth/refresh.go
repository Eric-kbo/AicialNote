package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type refreshed struct {
	AccessToken  string
	RefreshToken string
	Expiry       time.Time
}

// errReauth means the refresh token is no longer valid.
type errReauth struct{ code string }

func (e errReauth) Error() string { return "auth: refresh token rejected: " + e.code }

var httpClient = &http.Client{Timeout: 15 * time.Second}

// refresh exchanges a refresh token for a new access token. Written by hand
// rather than with oauth2.TokenSource because Microsoft requires the `scope`
// parameter on refresh requests.
func refresh(ctx context.Context, p *Provider, refreshToken string) (*refreshed, error) {
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {p.OAuth.ClientID},
		"client_secret": {p.OAuth.ClientSecret},
	}
	if p.ID == "microsoft" {
		form.Set("scope", strings.Join(p.OAuth.Scopes, " "))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.OAuth.Endpoint.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int64  `json:"expires_in"`
		Error        string `json:"error"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("auth: token endpoint returned %d", res.StatusCode)
	}
	if out.Error == "invalid_grant" || (res.StatusCode == http.StatusBadRequest && out.Error == "interaction_required") {
		return nil, errReauth{code: out.Error}
	}
	if res.StatusCode != http.StatusOK || out.AccessToken == "" {
		return nil, fmt.Errorf("auth: token endpoint returned %d %s", res.StatusCode, out.Error)
	}
	if out.ExpiresIn <= 0 {
		out.ExpiresIn = 3600
	}
	return &refreshed{
		AccessToken:  out.AccessToken,
		RefreshToken: out.RefreshToken,
		Expiry:       time.Now().Add(time.Duration(out.ExpiresIn) * time.Second),
	}, nil
}
