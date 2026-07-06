# ADR 0013 — The guardrail sweep: the written laws become a red/green test

**Status:** accepted · **Date:** 2026-07-06 · **Builds on:** [0001](0001-single-file-component.md), [0002](0002-offline-first-localstorage.md), [0003](0003-original-art-only.md), [0004](0004-build-pipeline.md), [0009](0009-on-device-bookshelf.md), [0010](0010-content-workflows-and-reference-layer.md)

## Context
The project's laws — offline/airplane-mode, original-art/asset-clean, the ADR 0009 book belt, single-file,
the 120/15/4 honesty gates, unique progress ids, meta-never-in-the-UI — were each enforced at exactly one
moment: `build.mjs` checks the offline guarantee *when it runs*, the assemblers gate *when they write*,
`.gitignore` blocks *what git happens to see*, and everything else lived in CLAUDE.md's "sanity-check"
habit. Nothing re-checked the **committed tree** as a whole, so a hand edit, a force-add, a stale
`docs/` mirror, or a drifted dataset could sit in the repo indefinitely with every individual gate still
"passing." Sibling repos in the family (nala first) already carry a mechanical guardrail sweep —
numbered invariants, zero-dep `node:assert`, each failure naming the offending file. This repo was the
one sibling without one.

## Decision
Add **`build/guardrails.test.mjs`** — a zero-dependency sweep (`node build/guardrails.test.mjs`; no
package.json, matching this repo's `node build/*.mjs` grain) that mechanically enforces **ten numbered
invariants derived ONLY from laws this repo had already written**, each matcher citing its source ADR /
CLAUDE.md line. File scoping runs off `git ls-files`, so the sweep judges what actually ships. The
mapping (invariant → matcher → scope) lives in **`docs/guardrails.md`**, including the list of written
laws deliberately NOT mechanized (content accuracy, brace-balance, in-`.jsx` walkthrough ids — each with
the honest reason why a grep would lie).

1. Offline/airplane-mode: zero external static `src`/`href`/`@import` in the built artifacts (build.mjs's
   own regex, re-asserted on the *committed* files; the ADR 0012 inert-string posture preserved).
2. Original-art/asset-clean: no tracked raster/font/audio/video/book binary except the 4 generated icons.
3. The ADR 0009 belt: the five `.gitignore` patterns present AND no tracked path matches them.
4. Single-file: `HyruleCompanion.jsx` is the only app source; `index.html` (+ `docs/` mirror) the only pages.
5. Build coherence: `docs/` byte-mirrors the root build; `__APP_VERSION__` == sw `VERSION`.
6. The hooks law: hooks used in the `.jsx` ⊆ build.mjs's `const {…}=React;` head (parsed live from build.mjs).
7. Source hygiene: no `<form>`, no Tailwind, one `<style>`, even backticks, `store` present.
8. The honesty gates re-asserted on committed JSON: 120/15/4 + 0 dups (BotW), 120 ingredients/11 effects
   (list parsed from `assemble-cooking.mjs`), 152/15/4 (TotK).
9. Progress-id integrity: walkthrough + side-quest ids present and unique in every per-game bundle.
10. Meta never reaches the UI: no `sources`/`corrections`/`confidence` in any `app-data.json`; no
    `BESTIARY/COOKING/WORLD.notes` lede (`KOROKS.notes` stays allowed).

**The widen-only rule is adopted verbatim from the family spine:** tightening a matcher or adding a
forbidden pattern never needs sign-off; loosening one, or growing an allowlist, requires the owner and a
new ADR. Never weaken a matcher to make a violation pass.

## Proof at introduction
Green direction: 26/26 on the clean tree — meaning **zero live violations existed** (the mirror was
byte-identical, versions coherent, data gates exact, no stray assets; nothing needed fixing or weakening).
Red direction: one planted violation per invariant (14 plants — external script, sw.js URL, rogue PNG,
dropped gitignore line, force-added `.cbz`, second `.jsx`, mirror drift, version drift, unknown hook,
`<form>`, odd backtick, 119 shrines, missing effect, dup step id, missing slug, `sources` leak,
`notes` lede) — each turned the sweep red **naming the planted file**, then was reverted. Notably the
`.cbz` plant needed `git add -f` because plain `git add` was already refused by the ADR 0009 gitignore
belt — the sweep is the suspenders for exactly that force-add case.

## Rejected
- *A package.json + npm test runner* — the repo deliberately has no package.json (ADR 0004's whole build
  is `node` + `npx esbuild` + vendored React); adding one for a test alias changes the repo's shape for
  zero capability. Plain `node build/guardrails.test.mjs` matches every existing command.
- *Rebuild-and-compare to prove `index.html` is untouched* — the font-subset fetch makes builds
  legitimately nondeterministic offline (ADR 0004 degrades gracefully); mirror + version coherence (#5)
  is the honest committed-artifact proxy.
- *Sweeping brace/paren balance and in-`.jsx` walkthrough ids* — a naive count/regex provably lies on a
  valid tree (measured before writing the matcher); esbuild and the in-browser verify own those. Refusing
  a dishonest matcher IS the honesty law applied to tests.
- *A trademark/naming matcher* — never a law here; this is a Zelda companion by design. Only what the
  repo wrote is enforced.

## Consequences
- The pre-push habit gains a mechanical half: `node build/build.mjs && node build/guardrails.test.mjs`
  before committing — CLAUDE.md's command table + house rule now say so.
- Future laws should land WITH a matcher here (or an explicit "not mechanizable because…" line in
  `docs/guardrails.md`), keeping the sweep the single honest register of what's enforced vs. entrusted.
- The sweep reads two build scripts as sources of truth (the React head in `build.mjs`, EFFECTS in
  `assemble-cooking.mjs`); renaming those constructs means updating the sweep's parsers — they fail loudly
  (assert on parse), never silently.
