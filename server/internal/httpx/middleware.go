// Package httpx holds HTTP middleware shared by all routes.
package httpx

import (
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// contentSecurityPolicy only allows the app to talk to itself and to the
// storage providers' APIs.
var contentSecurityPolicy = strings.Join([]string{
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https://*.googleusercontent.com https://graph.microsoft.com",
	"font-src 'self'",
	// OneDrive file content comes from pre-authenticated download URLs on other
	// hosts. Personal accounts now use *.microsoftpersonalcontent.com.
	"connect-src 'self' https://www.googleapis.com https://graph.microsoft.com" +
		" https://*.sharepoint.com https://*.1drv.com https://*.livefilestore.com https://*.onedrive.com" +
		" https://*.microsoftpersonalcontent.com",
	"frame-ancestors 'none'",
	"base-uri 'none'",
	"form-action 'self'",
	"object-src 'none'",
}, "; ")

func SecurityHeaders(secure bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if secure {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Logging logs requests without query strings (they can contain OAuth codes).
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			return
		}
		slog.Info("http", "method", r.Method, "path", r.URL.Path, "status", rec.status, "dur", time.Since(start).Round(time.Millisecond))
	})
}

func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				slog.Error("panic", "path", r.URL.Path, "err", v)
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
