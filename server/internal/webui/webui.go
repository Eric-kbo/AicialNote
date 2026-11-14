// Package webui serves the built web app, embedded into the binary.
//
// `pnpm build` writes web/dist; the Dockerfile / Makefile copy it into
// ./dist before `go build`.
package webui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var embedded embed.FS

func Handler() http.Handler {
	dist, _ := fs.Sub(embedded, "dist")
	if _, err := fs.Stat(dist, "index.html"); err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("AicialNote web app is not built into this binary.\n" +
				"Run `make build`, or use `pnpm dev` and open http://localhost:5173 during development.\n"))
		})
	}
	files := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(dist, p); err != nil {
			if path.Ext(p) != "" {
				http.NotFound(w, r)
				return
			}
			// Client-side route: serve the app shell.
			p = "index.html"
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		if strings.HasPrefix(p, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}
