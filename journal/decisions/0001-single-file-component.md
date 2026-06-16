# 0001 — One file, data-driven, default export

**Status:** accepted · 2026-06-15

**Chose:** The whole app is a single React component, `HyruleCompanion.jsx`, with its default export named
`HyruleCompanion`. All game content lives in **top-level `const` data objects** (regions, runes, recipes,
shrines…); the UI is a thin renderer over that data.

**Why:** It started life as a Claude artifact (one file is the constraint there), and the constraint turned out
to be a feature. A data-driven single file means "add content" = "add to an array," not "wire a new module." It's
trivially portable — it builds to one offline HTML with no bundler graph to reason about — and a fresh session can
hold the entire app in context at once. There's no framework ceremony between an idea and a step on the screen.

**Rejected:**
- *A multi-file React/Vite project* — more correct at 10× the size; unnecessary at this one, and it would break
  the "drop it in a Claude artifact" path and the "one file you can email yourself" path.
- *A CMS / external data file the app fetches* — kills offline-first (ADR 0002) and adds a moving part.

**Consequences:** The file is large (~100KB). Edits are surgical (`str_replace`) or chunked rewrites with a
post-write sanity check (balanced braces, even backticks, unique step IDs). Content and presentation share a file,
so we keep them visually sectioned with banner comments. Reference data may be **authored from** `knowledge/*.json`
but is **inlined** into the component at build/edit time — the running app fetches nothing.
