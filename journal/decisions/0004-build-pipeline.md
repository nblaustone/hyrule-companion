# 0004 — The build inlines everything (the offline guarantee is mechanical)

**Status:** accepted · 2026-06-15

**Chose:** `node build/build.mjs` is the one way to produce the shippable app. It (1) reads `HyruleCompanion.jsx`,
(2) transforms the JSX to plain JS with **esbuild** (classic runtime, hooks pulled off the `React` global), and
(3) writes `index.html` with **React, ReactDOM, the app, and the styles all inlined** — plus the PWA meta and a
tiny mount script. The output makes **zero external network requests**.

**Why:** ADR 0002 says "offline-first"; this makes it *checkable* instead of aspirational. The rule is mechanical:
after a build, `grep` the HTML for `http://`/`https://`/`src=`/`@import url(` — there should be none (a search
hit is a bug). React is pinned and inlined from a vendored UMD copy so even the first load needs nothing. esbuild
runs via `npx` (cached after first fetch); React UMD is vendored under `build/vendor/`.

**Rejected:**
- *Ship the raw `.jsx`* — browsers don't run JSX; and the artifact `window.storage`/Google-Fonts `@import` aren't
  offline/phone-safe. The build is where we strip those.
- *In-browser Babel* — a runtime dependency and slow on phones (ADR 0002).
- *A heavy bundler (Vite/webpack)* — more than one file and one command needs.

**Consequences:** Editing the app = edit `HyruleCompanion.jsx`, then rebuild. Don't hand-edit `index.html` (it's
generated; changes get overwritten). The build is the seam where artifact-isms (Google-Fonts @import, the
`window.storage`-first adapter) become phone-isms (inlined styles, `localStorage` fallback). If esbuild or the
vendored React is unavailable, the build fails loudly rather than emitting a file that needs the network.
