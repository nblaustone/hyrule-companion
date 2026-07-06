# Guardrails — the mechanical sweep

The repo's own written laws, **mechanically swept** by `node build/guardrails.test.mjs` (zero
dependencies — plain `node`, no package.json needed, file scoping via `git ls-files`). Every invariant
cites where the law is written; the sweep invents no new rules. A red sweep means a law is being broken:
fix the tree, never the matcher. Run it as the sanity-check half of the house rule *"build and
sanity-check before pushing."*

> **THE WIDEN-ONLY RULE** (inherited from nala's guardrails and the family safety spine): adding a new
> forbidden pattern or tightening a matcher is ALWAYS allowed without sign-off; removing or narrowing a
> matcher — or growing an allowlist (the icon allowlist, the inert-URL posture) — requires the owner's
> explicit sign-off and a new ADR. Never weaken a matcher to make a violation pass.

## The invariants (law → matcher → scope)

| # | Law (where written) | Matcher | Scope |
|---|---------------------|---------|-------|
| 1 | **Offline / airplane mode** — the built app makes zero external *static* requests (ADR 0002, ADR 0004, CLAUDE.md "Not a networked app") | build.mjs's own gate re-asserted on the committed artifacts: no `src=`/`href=` `https?://`, no `@import url(https?:` in the HTML; **no** external URL at all in `sw.js`; manifest `icons[].src`/`start_url`/`scope` local | `index.html`, `docs/index.html`, `sw.js`, `docs/sw.js`, both `manifest.webmanifest` |
| 2 | **Original art only / asset-clean repo** — never a Nintendo screenshot, sprite, map tile, font, or audio file (ADR 0003; v29.0 "no Nintendo audio"; ADR 0009 publish-clean) | no tracked file with a raster/font/audio/video/`pdf`/`epub`/`zip` extension, except the 4 build-generated Sheikah-eye icons (which must exist) | all of `git ls-files` |
| 3 | **The Bookshelf belt** — the owner's book copies never enter the repo (ADR 0009) | `.gitignore` still carries the five declared lines (`*.hbook.zip`, `*.cbr`, `*.cbz`, `_companion-packs/`, `books/`) **and** no tracked path matches them (catches a force-add past the belt) | `.gitignore` + all of `git ls-files` |
| 4 | **Single-file discipline** — one React component, one built deliverable (ADR 0001) | tracked `.jsx`/`.tsx` == exactly `HyruleCompanion.jsx`; tracked `.html` == exactly `index.html` + `docs/index.html` | `git ls-files` |
| 5 | **Build coherence** — `index.html` is generated, `docs/` is its GitHub-Pages mirror, never deploy a white-screen (ADR 0004; build.mjs step 6; house rule "Always ship it") | `docs/{index.html,sw.js,manifest.webmanifest,icon-*.png}` byte-equal the root copies; `docs/.nojekyll` exists; `window.__APP_VERSION__` (index.html) == `VERSION` (sw.js) | the 5 mirrored artifacts |
| 6 | **The hooks law** — any hook the `.jsx` uses must be in build.mjs's hardcoded `const {…}=React;` head or the app white-screens (CLAUDE.md gotchas; ADR 0006 — bit us in v9 with `useRef`) | hooks *called* in the `.jsx` (excluding `X.useY(` method calls and hooks defined in-file) ⊆ the head list, **parsed live from build.mjs** so the two can't drift | `HyruleCompanion.jsx` + `build/build.mjs` |
| 7 | **App-source hygiene** — no `<form>` (onClick only), no Tailwind, single `<style>` block, even backtick count, `store` adapter present (CLAUDE.md "Build/edit gotchas"; ADR 0001/0002) | literal counts on the source (+ `tailwind` also swept in `index.html`) | `HyruleCompanion.jsx`, `index.html` |
| 8 | **The honesty gates on committed data** — BotW reconciles to **120 shrines / 15 towers / 4 fairies, 0 dup names**; the cooking table is **120 ingredients covering all 11 effects**; TotK holds **152 shrines / 15 Skyview Towers / 4 fairies** (CLAUDE.md build table; `assemble-knowledge.mjs`; `assemble-cooking.mjs`; v17.12/v13.3) | counts + dup-name checks on the parsed JSON; the 11-effect list is parsed from `assemble-cooking.mjs` (its source of truth) | `knowledge/{shrines,towers,great-fairies,cooking-ingredients}.json`, `knowledge/totk/{shrines,towers,great-fairies}.json` |
| 9 | **Progress-id integrity** — ids are globally unique per game and side quests use stable slugs, or saved progress corrupts (CLAUDE.md "IDs must be globally unique"; `merge-walkthrough.mjs`; ADR 0010; the v17.13 audit) | region/section/step ids present + unique per game; side-quest slug ids present + unique per game; BotW's 78 side quests intact | every `knowledge/<game>/{walkthrough,app-data}.json` + `knowledge/side-quests.json` |
| 10 | **Verification meta never reaches the UI** (the v13.2 rule; ADR 0010 / knowledge/README "strips sources/corrections") | zero `"sources"`/`"corrections"`/`"confidence"` keys in any wholesale-inlined bundle; no `notes` on `BESTIARY`/`COOKING`/`WORLD` (the render-lede spots). `KOROKS.notes` explicitly allowed ("real caveat"); `_raw-research.json` keeps provenance by design | every `knowledge/<game>/app-data.json` |

## Written laws deliberately NOT mechanized (and why)

- **Don't invent (law #1).** Content *accuracy* can't be grepped — the repo's own mechanism is the sourced
  author→adversarial-verify Workflows (ADR 0010). Only their countable outputs (the #8 gates, #9 ids,
  #10 meta) are swept.
- **Balanced `{}`/`()` in the `.jsx`.** Prose strings legitimately unbalance a naive count (measured
  +1 `{` / −17 `(` on a *valid* tree) — a text matcher would lie. esbuild owns parse-soundness; the build
  fails loudly on a broken tree (ADR 0004). The backtick/`<style>` counts, which ARE clean signals, are swept (#7).
- **Unique step-ids inside the hand-authored BotW walkthrough in the `.jsx`.** The data lives as JS in the
  component (not in `GEN:DATA`), so checking it needs execution, not grep. The knowledge-side bundles for
  all ten other games ARE swept (#9); BotW's walkthrough ids are covered by the post-edit sanity habit +
  in-browser verification.
- **Additive-never-destructive, spoiler-aware/beginner-first, mobile-first, the voice/lore style bar.**
  Editorial/semantic laws — enforced by review and the in-browser verify pass, not regex.
- **"Always ship it" (build + push).** A process law; this sweep is its sanity-check half, not its executor.
- **Rebuild-equality (index.html reproducible from the `.jsx`).** The build inlines Google-Fonts subsets
  *when reachable* (ADR 0004), so a byte-level rebuild-and-compare is nondeterministic offline. #5's
  mirror + version coherence is the honest committed-artifact proxy.

## Running it

```bash
node build/guardrails.test.mjs   # 26 checks; exits 1 and names the offending file on any violation
```

No test runner, no dependency — the repo deliberately has no `package.json` (the build itself only
touches `npx esbuild` + vendored React, ADR 0004). Run it after any edit, before any push, alongside
`node build/build.mjs`. Both directions were proven at introduction: 26/26 green on the clean tree, and
one planted violation per invariant (14 plants) each turned the sweep red naming the planted file, then
was reverted (ADR 0013).
