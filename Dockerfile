# syntax=docker/dockerfile:1

# --- web ---------------------------------------------------------------------
FROM node:22-alpine AS web
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/storage/package.json packages/storage/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY web web
# Optional: what the public pages show (see docs/self-hosting.md). Empty keeps the defaults.
ARG VITE_REPO_URL=""
ARG VITE_SITE_HOST=""
ARG VITE_CONTACT_EMAIL=""
RUN pnpm --filter @aicialnote/web build

# --- server ------------------------------------------------------------------
FROM golang:1.26-alpine AS server
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server ./
COPY --from=web /src/web/dist ./internal/webui/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /aicialnote ./cmd/aicialnote

# --- runtime -----------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /aicialnote /aicialnote
ENV AICIALNOTE_ADDR=:8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/aicialnote"]
