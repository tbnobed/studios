---
name: attached_assets is temporary
description: Why app code must not import from attached_assets/ and where logos/images belong instead
---

# attached_assets/ is scratch space, not a permanent asset store

App/source code must NOT import images from `attached_assets/` (the `@assets` Vite alias). Files there are temporary user uploads and can disappear, which crashes the Vite build with "Failed to resolve import ...".

**Why:** A logo imported via `@assets/...` went missing and crashed the app. Substituting a different asset to un-break it changed the user's branding and upset them.

**How to apply:**
- Put durable images in `client/src/assets/` and import via the `@/assets/...` alias (`@` = `client/src`). Public static files can also go in `client/public/`.
- If a referenced `attached_assets` file is missing, recover the exact original from git history (`git show <commit>:<path> > <path>`) rather than swapping in a look-alike — branding files must stay byte-identical.
- The OB play-button brand logo is `client/src/assets/ob-logo.png` (1024x1024). Auth background is `client/src/assets/auth-background.png`.
