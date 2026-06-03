---
name: Token-bearing endpoints must be log-redacted
description: New routes that return link tokens must be added to the request-logger redaction list.
---

The Express request logger in `server/index.ts` logs every `/api/*` request path
and (for non-secret paths) the JSON response body. It maintains an explicit
allowlist of "secret" paths whose path + body are redacted.

**Rule:** When you add any endpoint that returns or carries a link token
(invites, share links, password-reset, etc.), add its path prefix to the
redaction logic in `server/index.ts` so neither the path nor the response body
(which contains the raw token / shareUrl) is written to logs.

**Why:** Anyone with log access could otherwise replay the link and bypass
auth — the whole point of an unguessable token is defeated if it lands in logs.
A code review flagged exactly this for the share-links feature.

**How to apply:** Mirror the existing `isInvitePath` / `isSharePath` handling —
redact the path to `/api/<feature>/[redacted]` and skip appending the captured
JSON body for those paths.
