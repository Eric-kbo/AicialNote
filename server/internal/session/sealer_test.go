package session

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newSealer(t *testing.T) *Sealer {
	t.Helper()
	s, err := NewSealer(make([]byte, 32), true)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

type payload struct {
	A string `json:"a"`
}

func TestRoundTrip(t *testing.T) {
	s := newSealer(t)
	rec := httptest.NewRecorder()
	if err := s.Set(rec, "c", payload{A: "hello"}, CookieOptions{Path: "/", TTL: time.Hour}); err != nil {
		t.Fatal(err)
	}
	cookie := rec.Result().Cookies()[0]
	if !cookie.HttpOnly || !cookie.Secure {
		t.Fatal("cookie must be HttpOnly and Secure")
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(cookie)
	var got payload
	if err := s.Get(req, "c", &got); err != nil || got.A != "hello" {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestRejectsTamperingRenamingAndExpiry(t *testing.T) {
	s := newSealer(t)
	value, _ := s.seal("c", payload{A: "x"}, time.Hour)

	var p payload
	if err := s.open("other", value, &p); err == nil {
		t.Fatal("value must be bound to its cookie name")
	}
	tampered := value[:len(value)-2] + "AA"
	if err := s.open("c", tampered, &p); err == nil {
		t.Fatal("tampered value must be rejected")
	}
	expired, _ := s.seal("c", payload{A: "x"}, -time.Second)
	if err := s.open("c", expired, &p); err == nil {
		t.Fatal("expired value must be rejected")
	}

	other, _ := NewSealer(append(make([]byte, 31), 1), true)
	if err := other.open("c", value, &p); err == nil {
		t.Fatal("value sealed with another key must be rejected")
	}
}
