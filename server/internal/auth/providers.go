package auth

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"golang.org/x/oauth2/microsoft"

	"aicialnote/internal/config"
)

// Provider is an OAuth identity + storage provider.
type Provider struct {
	ID      string
	Name    string
	OAuth   *oauth2.Config
	// Extra parameters for the authorization URL.
	AuthParams []oauth2.AuthCodeOption
	// RequiredScopes must all be granted. Google's consent screen lets users
	// untick individual scopes, which would sign them in without Drive access.
	RequiredScopes []string
}

// missingScopes lists the required scopes absent from the token's granted
// "scope" field. A token without that field is trusted: not every provider
// returns it, and the API calls still fail loudly if access is missing.
func (p *Provider) missingScopes(tok *oauth2.Token) []string {
	granted, _ := tok.Extra("scope").(string)
	if granted == "" {
		return nil
	}
	have := map[string]bool{}
	for _, s := range strings.Fields(granted) {
		have[s] = true
	}
	var missing []string
	for _, s := range p.RequiredScopes {
		if !have[s] {
			missing = append(missing, s)
		}
	}
	return missing
}

// Account is the signed-in identity, shown in the UI and used to keep local
// caches of different accounts apart.
type Account struct {
	Provider string `json:"provider"`
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
}

const googleDriveFile = "https://www.googleapis.com/auth/drive.file"

func Providers(cfg *config.Config) []*Provider {
	redirect := func(id string) string { return cfg.Origin() + cfg.PublicURL.Path + "/auth/" + id + "/callback" }
	var out []*Provider

	if cfg.Google.Enabled() {
		out = append(out, &Provider{
			ID:   "google",
			Name: "Google Drive",
			OAuth: &oauth2.Config{
				ClientID:     cfg.Google.ID,
				ClientSecret: cfg.Google.Secret,
				Endpoint:     google.Endpoint,
				RedirectURL:  redirect("google"),
				// drive.file: only files created by AicialNote. Non-sensitive scope,
				// no Google security assessment required.
				Scopes: []string{"openid", "email", "profile", googleDriveFile},
			},
			RequiredScopes: []string{googleDriveFile},
			AuthParams: []oauth2.AuthCodeOption{
				oauth2.AccessTypeOffline,
				// Always show consent so Google issues a refresh token.
				oauth2.SetAuthURLParam("prompt", "consent"),
				oauth2.SetAuthURLParam("include_granted_scopes", "true"),
			},
		})
	}

	if cfg.Microsoft.Enabled() {
		out = append(out, &Provider{
			ID:   "microsoft",
			Name: "OneDrive",
			OAuth: &oauth2.Config{
				ClientID:     cfg.Microsoft.ID,
				ClientSecret: cfg.Microsoft.Secret,
				Endpoint:     microsoft.AzureADEndpoint(cfg.MicrosoftTenant),
				RedirectURL:  redirect("microsoft"),
				// AppFolder: only "Apps/AicialNote" in the user's OneDrive.
				Scopes: []string{"openid", "email", "profile", "offline_access", "Files.ReadWrite.AppFolder"},
			},
			AuthParams: []oauth2.AuthCodeOption{
				oauth2.SetAuthURLParam("prompt", "select_account"),
			},
		})
	}
	return out
}

// accountFromToken reads the identity from the OpenID Connect id_token.
//
// The token comes straight from the provider's token endpoint over TLS, which
// OpenID Connect Core §3.1.3.7 accepts in place of signature validation.
func accountFromToken(provider string, tok *oauth2.Token) (Account, error) {
	raw, _ := tok.Extra("id_token").(string)
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return Account{}, errors.New("auth: provider returned no id_token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Account{}, err
	}
	var claims struct {
		Sub               string `json:"sub"`
		OID               string `json:"oid"`
		Email             string `json:"email"`
		PreferredUsername string `json:"preferred_username"`
		Name              string `json:"name"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return Account{}, err
	}
	id := claims.Sub
	if claims.OID != "" {
		id = claims.OID
	}
	email := claims.Email
	if email == "" {
		email = claims.PreferredUsername
	}
	if id == "" {
		return Account{}, errors.New("auth: id_token has no subject")
	}
	return Account{Provider: provider, ID: id, Email: email, Name: claims.Name}, nil
}
