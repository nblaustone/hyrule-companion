# ADR 0010 — Sourced content-workflows + the reference layer (the "perfect BotW shell")

**Status:** accepted (v12.7–v12.14) · **Date:** 2026-06-19 · **Builds on:** [0001](0001-single-file-component.md), [0004](0004-build-pipeline.md), [0006](0006-polish-one-companion.md)

## Context
The owner is playing BotW over ~a year (with his son) and asked to make BotW a **gold-standard "shell"** every
future game inherits — complete enough that, mid-play, pulling out the companion *answers the question in front of
him*. That required a large content build-out (every shrine's solution, boss fight guides, armor upgrade recipes,
the full side-quest set, a complete item catalog) far beyond the v5 research sweep, plus a re-think of how help is
*reached*. The single-file model (0001) and offline build (0004) had to be preserved.

## Decision

1. **Deep reference content is authored by sourced author→adversarial-verify Workflows.**
   The pattern: `build/gen-<topic>-workflow.mjs` emits a self-contained Workflow script (embedding its input as
   consts — never via `args`, which serializes wrong) that, **per item/region/category**, has an author agent
   web-research from real guides (Game8 / Zelda Dungeon / Thonky / Zeldapedia) and an **independent verifier**
   re-source and correct every claim. A matching `build/merge-<topic>.mjs` splices **only the new field(s)** into
   the clean `knowledge/*.json` (additive; strips `sources`/`corrections` so verification meta never reaches the
   UI). These extend existing records and **bypass** the 120/15/4 assembler (0004 still owns base reconciliation).
   This is now the standard way to add depth. It earned its keep — verify passes caught real errors every run
   (inverted flurry-dodge directions; Igneo Talus needs 2★ Flamebreaker not a Fireproof Elixir; a wrong ★4 armor
   recipe; Gut Check Rock mislocated). Honesty law holds: unconfirmable values are omitted, not guessed.

2. **The Items tab is a reference *catalog* (Compendium), not an inventory tracker.**
   Real gear churns far too fast to "track what I own." So the Items tab became `CompendiumView` — a complete,
   searchable, tap-for-description catalog (410 entries: weapons/bows/shields/armor/materials/creatures), each
   with stats/effect/where/sell. The old auto-pouch (`PouchView`) is the fallback only when no catalog exists.

3. **Help is answer-first.** The global search expands each result **inline to the actual answer** (shrine
   solution, fight guide, quest how-to, item stats, recipe), with a secondary "Open the full page ›" deep-link.
   Principle: *content is only as good as the taps to reach it.* (The owner considered and **declined** panic
   buttons / search-as-home / recent-nearby — don't re-propose.)

4. **Shell-hardening for reuse.** Growable datasets use **stable slug ids** (e.g. `sq_<slug>`), never positional
   keys, with a one-time legacy-snapshot migration when converting — so future expansion can't corrupt saved
   progress. Every BotW-only feature/const must **degrade** when the active game lacks its data; **TotK is the
   canary** (verify there that nothing crashes or shows empty/wrong).

## Consequences
- BotW is the complete template; new games slot into the same `GAMES` shell + the same gen/merge pipeline.
- `store.get/set` are **async** — a sync `if (store.get(k))` is always truthy; always `await` in an async IIFE.
- Verify rebuilds on a **fresh port/origin** (the SW caches `localhost:<port>`); for transient agent failures use
  `Workflow({resumeFromRunId})` to re-run only the failed agent, not the whole run.
- No change to 0001/0003/0004: still one component, original art only, offline build with the mechanical gate.
