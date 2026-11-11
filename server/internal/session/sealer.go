// Package session stores small pieces of state (refresh tokens, OAuth flow
// state) in encrypted cookies, so the server itself stays stateless.
package session

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

var ErrInvalid = errors.New("session: invalid or expired cookie")

// Sealer encrypts and authenticates values with AES-256-GCM. The cookie name
// is bound as additional data, so a value can't be replayed under another name.
type Sealer struct {
	aead   cipher.AEAD
	secure bool
}

func NewSealer(key []byte, secure bool) (*Sealer, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Sealer{aead: aead, secure: secure}, nil
}

type envelope struct {
	Exp  int64           `json:"exp"`
	Data json.RawMessage `json:"d"`
}

func (s *Sealer) seal(name string, v any, ttl time.Duration) (string, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	plain, err := json.Marshal(envelope{Exp: time.Now().Add(ttl).Unix(), Data: data})
	if err != nil {
		return "", err
	}
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	out := s.aead.Seal(nonce, nonce, plain, []byte(name))
	return base64.RawURLEncoding.EncodeToString(out), nil
}

func (s *Sealer) open(name, value string, v any) error {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) < s.aead.NonceSize() {
		return ErrInvalid
	}
	n := s.aead.NonceSize()
	plain, err := s.aead.Open(nil, raw[:n], raw[n:], []byte(name))
	if err != nil {
		return ErrInvalid
	}
	var env envelope
	if err := json.Unmarshal(plain, &env); err != nil || time.Now().Unix() > env.Exp {
		return ErrInvalid
	}
	if err := json.Unmarshal(env.Data, v); err != nil {
		return ErrInvalid
	}
	return nil
}

// CookieOptions control where and how a sealed cookie is sent.
type CookieOptions struct {
	Path     string
	TTL      time.Duration
	SameSite http.SameSite
}

// Set writes v as an encrypted, HttpOnly cookie.
func (s *Sealer) Set(w http.ResponseWriter, name string, v any, o CookieOptions) error {
	value, err := s.seal(name, v, o.TTL)
	if err != nil {
		return err
	}
	if len(value) > 4000 {
		return errors.New("session: cookie too large")
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     o.Path,
		MaxAge:   int(o.TTL.Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: o.SameSite,
	})
	return nil
}

// Get decrypts the named cookie into v.
func (s *Sealer) Get(r *http.Request, name string, v any) error {
	c, err := r.Cookie(name)
	if err != nil {
		return ErrInvalid
	}
	return s.open(name, c.Value, v)
}

// Clear deletes the named cookie.
func (s *Sealer) Clear(w http.ResponseWriter, name, path string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     path,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}
