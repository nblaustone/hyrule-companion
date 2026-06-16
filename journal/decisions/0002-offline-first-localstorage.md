# 0002 — Offline-first; persistence degrades gracefully

**Status:** accepted · 2026-06-15

**Chose:** The app must run with **zero network**. The built `index.html` inlines everything (React, app, styles,
icons) so it makes **no external request** at runtime. Progress persists through a small `store` adapter that uses
`window.storage` when it exists (the Claude-artifact runtime) and **falls back to `localStorage`** everywhere else
(a phone browser, a saved file). The same source therefore runs in both worlds.

**Why:** The point is to play the game with this open on your phone — often somewhere with bad signal, and as an
installed home-screen app. A runtime CDN dependency or a server would make it fail exactly when you need it. The
artifact runtime forbids `localStorage` and provides `window.storage`; a normal browser has `localStorage` and no
`window.storage`. One adapter that prefers the first and falls back to the second covers both without forking the
code.

**Rejected:**
- *`localStorage` only* — breaks inside the Claude artifact (it's blocked there).
- *A backend / cloud sync* — overkill, adds accounts/privacy surface, and kills offline. Progress is one device's
  business. (If cross-device sync is ever wanted, an export/import string is the additive way — not a server.)
- *CDN React + in-browser Babel* — needs the network on first load and is slow on phones. We inline instead.

**Consequences:** `store.get/set` are async and guard a missing backend (never throw). Keys: `botw:progress`
(stepId→true) and `botw:ui` (tab/region/openSections/guideSub). The build step is what guarantees "no external
request" — see ADR 0004. Clearing the browser's site data clears progress; a future **export-progress** button is
the honest backup, not a server.
