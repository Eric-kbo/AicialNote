# Security policy

AicialNote stores passwords and 2FA secrets, so we treat security reports as the highest priority.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately instead:

- Preferred: [GitHub private vulnerability reporting](https://github.com/Eric-kbo/AicialNote/security/advisories/new)
- Or email **support@aicialnotes.com** with "Security" in the subject

Include what you found, how to reproduce it, and what an attacker could do with it. We will acknowledge your report
within 3 working days and keep you updated until it is fixed. Once a fix is released we are happy to credit you,
unless you'd rather stay anonymous.

## Scope

In scope:

- the web app (`web/`, `packages/`), for example XSS, leaking secrets into logs, search indexes or exported files,
  or data loss through the sync engine
- the OAuth broker (`server/`), for example session cookie handling, CSRF on `/auth/*`, open redirects, token
  leakage
- the official instance at `aicialnotes.com`

Out of scope:

- the fact that data files are not encrypted at rest. This is documented in the README; optional end-to-end
  encryption is planned.
- attacks that need an already compromised device, browser or cloud account
- self-hosted instances run by third parties (report those to their operators)
- missing hardening headers without a concrete attack

## Supported versions

Only the latest commit on `main` is supported. Fixes are not backported.
