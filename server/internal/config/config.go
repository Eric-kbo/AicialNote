// Package config reads server settings from the environment (and an optional
// .env file for local development).
package config

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"strings"
)

type OAuthClient struct {
	ID     string
	Secret string
}

func (c OAuthClient) Enabled() bool { return c.ID != "" && c.Secret != "" }

type Config struct {
	// Addr is the listen address, e.g. ":8080".
	Addr string
	// PublicURL is the origin users open in their browser. OAuth redirect URIs
	// are derived from it: <PublicURL>/auth/<provider>/callback.
	PublicURL *url.URL
	// SessionKey encrypts the session cookies (32 bytes).
	SessionKey []byte

	Google          OAuthClient
	Microsoft       OAuthClient
	MicrosoftTenant string
}

func (c *Config) Secure() bool { return c.PublicURL.Scheme == "https" }

func (c *Config) Origin() string { return c.PublicURL.Scheme + "://" + c.PublicURL.Host }

func Load() (*Config, error) {
	loadDotEnv(".env")

	public := env("AICIALNOTE_PUBLIC_URL", "http://localhost:5173")
	u, err := url.Parse(strings.TrimRight(public, "/"))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("AICIALNOTE_PUBLIC_URL must be an absolute URL, got %q", public)
	}

	key, err := sessionKey()
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		Addr:       env("AICIALNOTE_ADDR", ":8080"),
		PublicURL:  u,
		SessionKey: key,
		Google: OAuthClient{
			ID:     os.Getenv("GOOGLE_CLIENT_ID"),
			Secret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		},
		Microsoft: OAuthClient{
			ID:     os.Getenv("MICROSOFT_CLIENT_ID"),
			Secret: os.Getenv("MICROSOFT_CLIENT_SECRET"),
		},
		MicrosoftTenant: env("MICROSOFT_TENANT", "common"),
	}
	if !cfg.Google.Enabled() && !cfg.Microsoft.Enabled() {
		slog.Warn("no OAuth provider configured; set GOOGLE_CLIENT_ID/SECRET and/or MICROSOFT_CLIENT_ID/SECRET")
	}
	return cfg, nil
}

func sessionKey() ([]byte, error) {
	raw := os.Getenv("AICIALNOTE_SESSION_KEY")
	if raw == "" {
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, err
		}
		slog.Warn("AICIALNOTE_SESSION_KEY not set; using a random key. Everyone is signed out when the server restarts. " +
			"Generate one with: openssl rand -base64 32")
		return key, nil
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		key, err = base64.RawURLEncoding.DecodeString(raw)
	}
	if err != nil || len(key) != 32 {
		return nil, errors.New("AICIALNOTE_SESSION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)")
	}
	return key, nil
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv sets variables from a KEY=VALUE file without overriding the real
// environment. Missing file is fine.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(strings.TrimPrefix(k, "export "))
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if _, exists := os.LookupEnv(k); !exists {
			os.Setenv(k, v)
		}
	}
}
