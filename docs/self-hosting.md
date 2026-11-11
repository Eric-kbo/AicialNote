# Self-hosting

AicialNote is a single binary (or Docker image) that serves the web app and a small OAuth broker. It has no database. User
data never passes through it: browsers talk to Google Drive or OneDrive directly.

## 1. Register the OAuth apps

You need your own OAuth clients. Use `https://<your-domain>` below, or `http://localhost:5173` for development.

### Google Drive

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: choose _External_, fill in the app name, support email and the
   links to your home page and privacy policy.
4. Add these scopes: `openid`, `email`, `profile`, `.../auth/drive.file`.
   `drive.file` is a non-sensitive scope: AicialNote can only see files it created itself, and Google doesn't
   require a security assessment for it.
5. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorised redirect URI: `https://<your-domain>/auth/google/callback`
6. Copy the client ID and secret.
7. **Publish the app.** While it is in _Testing_, Google expires refresh tokens after 7 days and users have to sign in
   again every week.

### OneDrive

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/), go to **App registrations → New
   registration**.
   - Supported account types: _Accounts in any organizational directory and personal Microsoft accounts_.
   - Redirect URI: platform **Web**, `https://<your-domain>/auth/microsoft/callback`
2. **Certificates & secrets → New client secret.** Copy the value right away; it isn't shown again.
3. **API permissions → Microsoft Graph → Delegated**: add `Files.ReadWrite.AppFolder`, `offline_access`,
   `openid`, `email` and `profile`.
4. Copy the _Application (client) ID_.

The registration's display name becomes the folder name under `Apps/` in users' OneDrive. Call it **AicialNote**.

## 2. Configure

| Variable                                          | Required     | Description                                                                         |
| ------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `AICIALNOTE_PUBLIC_URL`                           | yes          | Origin users open, e.g. `https://notes.example.com`                                 |
| `AICIALNOTE_SESSION_KEY`                          | yes          | 32 random bytes, base64: `openssl rand -base64 32`. Changing it signs everyone out. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`       | for Google   | from step 1                                                                         |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | for OneDrive | from step 1                                                                         |
| `MICROSOFT_TENANT`                                | no           | `common` (default) or `consumers`                                                   |
| `AICIALNOTE_ADDR`                                 | no           | listen address, default `:8080`                                                     |

These are read when the **web app is built**, not at run time. Set them, or your build shows the official
instance's domain and contact address on the privacy policy and terms pages (which Google's consent screen links to).

| Variable             | Default                                  | Shown as                                            |
| -------------------- | ---------------------------------------- | --------------------------------------------------- |
| `VITE_SITE_HOST`     | `aicialnotes.com`                        | the site name in the privacy policy and terms       |
| `VITE_CONTACT_EMAIL` | `support@aicialnotes.com`                | the contact address in the privacy policy and terms |
| `VITE_REPO_URL`      | `https://github.com/Eric-kbo/AicialNote` | the GitHub link in the header and account menu      |

With Docker, pass them as build args: `docker build --build-arg VITE_SITE_HOST=notes.example.com …`. With
`pnpm build`, set them in the environment or in `web/.env.local`.

## 3. Run

```sh
docker build -t aicialnote .
docker run -p 8080:8080 --env-file server/.env aicialnote
```

Or build the binary yourself: `pnpm install && pnpm build`, then run `server/bin/aicialnote`. To build a Linux
server binary on any OS, run `pnpm build:linux`, which writes `server/bin/aicialnote-linux-amd64` (static, no cgo).
The binary reads the variables above from its environment, and also from a `.env` file in its working directory if
one exists.

Put it behind HTTPS (Caddy, nginx, Cloudflare, Fly.io, Cloud Run …). Cookies are marked `Secure` whenever
`AICIALNOTE_PUBLIC_URL` starts with `https://`.

## How sign-in works

```
browser ── /auth/google/login ──▶ AicialNote ── redirect ──▶ Google consent
Google ── code ──▶ /auth/google/callback ── exchanges code (PKCE + client secret)
AicialNote ── Set-Cookie: an_s_google=<AES-GCM encrypted refresh token>; HttpOnly; SameSite=Strict
browser ── POST /auth/google/token (X-AicialNote: 1) ──▶ fresh 1-hour access token, kept in memory
browser ── access token ──▶ googleapis.com (directly)
```

- The refresh token sits only in that encrypted, HttpOnly cookie. JavaScript can't read it and the server doesn't
  store it.
- `/auth/*/token` needs a custom header and a same-origin `Origin`, which blocks CSRF.
- Signing out clears the cookie and the browser's local cache. It doesn't revoke the grant, so the user's other
  devices stay signed in.
