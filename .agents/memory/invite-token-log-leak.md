---
name: Request logger leaks secrets in URL/response
description: The Express request logger in server/index.ts dumps req.path + full JSON response for every /api/* call; anything secret in a URL path or response body lands in logs.
---

The global request logger in `server/index.ts` logs `req.path` and the full
captured JSON response body for every `/api/*` request.

**Why:** Any feature that puts a secret in the URL (e.g. single-use invite tokens
at `/api/invite/:token`) or returns one in the response body (e.g. `inviteUrl`
containing a token) will write that secret to logs, enabling takeover by anyone
with log access.

**How to apply:** When adding endpoints that carry tokens/secrets in the path or
response, add a redaction branch to the logger (path → `[redacted]`, and skip the
response body when it contains the sensitive key). Prefer not putting secrets in
URLs at all, but the invite flow needs a clickable link, so redaction is the guard.
