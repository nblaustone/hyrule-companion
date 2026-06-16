# Hyrule Companion — Project Spine (CLAUDE.md)

> A mobile, offline, Sheikah-Slate-styled companion for **The Legend of Zelda: Breath of the Wild** (Switch).
> A living walkthrough + auto-syncing pouch + status dashboard + shrine/armor/cooking references — built so a
> first-timer can play the whole game with one thumb. This file is the **working memory**: read it first, and a
> fresh session can resume without re-deriving the architecture, conventions, or sources.

## What this IS
- A **single React component** (`HyruleCompanion.jsx`) that also builds to a **single self-contained, offline
  `index.html`** you can open on a phone and "Add to Home Screen."
- A **sourced, honest guide** — every step is cross-checked against real BotW guides (Game8, Zelda Dungeon,
  Zeldapedia, GameFAQs). Original art/icons only (inline SVG) — **no Nintendo screenshots, sprites, or fonts.**
- **Progress that persists locally** (checkmarks, pouch, UI state) with zero account, zero server, zero tracking.

## What this is NOT
- **Not a networked app.** No backend, no analytics, no external asset at runtime. It must work in airplane mode.
- **Not a data-dump.** It's a *path* through the game (Plateau → 4 Divine Beasts → Master Sword → Ganon) with
  reference tabs hanging off it — not a wiki. Depth is curated, spoiler-aware, beginner-first.
- **Not copyright-infringing.** We describe and re-draw; we never embed Nintendo assets. (ADR 0003)

## Posture (the three laws — inherited from the brain family)
1. **Don't invent.** Every step/fact traces to a real BotW source, or it's marked uncertain. An honest "unsure"
   beats a confident wrong answer.
2. **Additive, never destructive.** Grow the guide; never silently drop a region, item, or the user's progress.
3. **The repo is the memory.** Decisions live in `journal/decisions/`, not in chat. Supersede with a new ADR;
   never rewrite history.

## The game we're on
**Game 1 of N: Breath of the Wild.** The data model is already game-agnostic enough to wrap in a `GAMES` array
later (TotK, OoT…). For now everything is BotW. See ADR 0005.

## Layout
```
HyruleCompanion.jsx   the source of truth — one React component; reference data inlined in a GEN:DATA block
index.html            BUILT, self-contained, offline PWA (open this on your phone)  ← the deliverable
build/build.mjs       esbuild pipeline: jsx → transformed js → inlined into index.html (React + fonts inlined)
build/assemble-knowledge.mjs  research output → reconciled knowledge/*.json (the 120/15/4 honesty gate)
build/inline-data.mjs        knowledge/*.json → the .jsx GEN:DATA block (strips agent `notes`)
build/vendor/         pinned React + ReactDOM UMD (vendored so the build needs no network at runtime)
manifest.webmanifest  PWA manifest (name, icons, standalone display) · icon-512/180.png  generated Sheikah eye
knowledge/            researched, verified BotW data (sourced JSON). `_raw-research.json` = the full workflow
                      output (provenance + agent notes); the rest are the clean, app-facing datasets
journal/
  decisions/          numbered ADRs (the project's law)
  learning-log.md     append-only reasoning log, newest at top — read on every session
docs/                 design + content specs
PROGRESS.md           the original v1–v4 build-memory (kept; the pre-brain continuity doc)
CLAUDE.md             this file
```

## How to build & run (get it on the phone)
The pipeline has three reproducible steps (run in order only when the data changed; otherwise just `build.mjs`):
| run | does |
|-----|------|
| `node build/assemble-knowledge.mjs` | research output (`knowledge/_raw-research.json`) → clean, **reconciled** datasets (`knowledge/shrines.json` …). Refuses to write unless it sums to **120 shrines / 15 towers / 4 Great Fairies, 0 dup names**. |
| `node build/inline-data.mjs` | inlines `knowledge/*.json` into the `.jsx` GEN:DATA block (strips agent `notes` so verification meta never reaches the UI) |
| `node build/build.mjs` | compile `HyruleCompanion.jsx` → self-contained offline `index.html` (+ `manifest.webmanifest`, `icon-*.png`) |
| open `index.html`      | works by double-click in any browser; on iPhone Safari → Share → **Add to Home Screen** |
| (host) push `index.html` + `manifest.webmanifest` + `icon-512.png` to GitHub Pages | gives a tap-to-install URL |

The build **inlines React + the app + the styles + the fonts** into one file with **zero external requests**, so
it runs fully offline once it's on the device. First load needs no network. The offline guarantee is mechanical:
`build.mjs` fails if any external `src`/`href`/`@import` survives in the output.

## Architecture / conventions (read before editing the app)
- **One component**, default export `HyruleCompanion`. All reference data lives in top-level `const` objects; the
  UI just reads them. Adding content = add to a data const + (sometimes) a small UI block.
- **Region object**: `{ id, name, sub, kind:'region'|'beast', tagline, champion?, sections:[] }`.
- **Section**: `{ id, name, sub, reward?, steps:[] }`.
- **Step**: `{ id, k, t, items?:[] }`.
  - `k` (kind): `step | loot | optional | reward` are **checkable**; `tip | warn` are info-only.
  - `items[]`: `{ name, cat, note, orb?, rune? }`. Collecting the step adds these to the pouch.
  - `cat` ∈ `rune | weapon | bow | shield | armor | key | material` (see `CATS`).
  - `orb:true` → counts toward the Spirit-Orb tracker (4 orbs = 1 upgrade). `rune:'magnesis'|...` → pouch glyph.
- **IDs must be globally unique** (progress is a flat `{stepId: true}` map). Prefix per region; never reuse an id.
- **Status panels** key off specific step IDs: `STATUS_RUNES` (rune→step), `CHAMPIONS` (ability→step). Wire new
  beasts/runes here.
- **Persistence keys**: `botw:progress` (JSON stepId→true — also holds tracker toggles `shr_* gf_* arm_* sq_*`
  and the memory steps `m_l*`), `botw:ui` (tab/region/openSections/guideSub), `botw:koroks` (int), `botw:notes`
  (id→text), `botw:armortier` (set-index→0..4). The `store` helper uses `window.storage` if present (Claude
  artifact) **and falls back to `localStorage`** (standalone/phone). Backup = base64 of `{progress,koroks,notes,armorTier}`.
  Counters use the functional updater `setKoroks(k=>…)` (stale-closure guard).
- **Glyphs** are inline SVG in `Glyph()` — add a `case` for a new icon. **Styling** is one injected `<style>` in
  `StyleBlock()`. Dark teal base; ember-orange = "to do", activated-cyan = "done" (mirrors Sheikah tech state).

## Build/edit gotchas
- File is large (~100KB). When rewriting wholesale, build in chunks so output limits can't truncate it. Sanity
  check after: balanced `{}`/`()`, even backtick count, single `<style>`/`</style>`, `store` present, IDs unique.
- No `<form>` tags; onClick handlers only. No Tailwind (custom CSS). No external fonts/scripts at runtime in the
  built `index.html` (the artifact `.jsx` may use a Google-Fonts @import; the build strips/inlines for offline).

## House rules
- **Honest over flattering.** Mark anything uncertain; a dash-with-a-reason beats a fake fact.
- **Spoiler-aware, beginner-first.** Hints, not lore-dumps. Assume a player who has never touched the game.
- **Mobile-first.** 560px max width, thumb-reachable tab bar, big tap targets, reduced-motion honored.

## Tabs & features (v6–v7)
Tabs: **Status · Journey · Shrines · Items · Cook · Guide** (6) + a **global-search** overlay (topbar magnifier,
`SearchOverlay`) across everything. Status carries the **full Hyrule map** (`HyruleMap` — original SVG, 15
regions with shrine-progress rings, tap → that region's shrines) plus Shrines + Collectibles meters. Shrines =
all 120, region-grouped, trackable; each expanded region shows a **per-region schematic map** (`RegionMap`,
coords from `knowledge/region-maps.json`) — numbered dots (tap to toggle) that match the numbered list, plus
tower/fairy/landmarks. Guide is a 9-segment hub: **Runes · Tips · Armor · Fairies · Towers · Quests · Enemies ·
Koroks · World** — Fairies/Armor/Quests are **checkable trackers** (Armor has a tier stepper), Koroks has a live
**seed counter**. **Notes** (`NoteAffordance`) hang off every walkthrough step and shrine; **backup/restore**
(`BackupBox`) lives in Guide→Tips. View components live just after `TabBtn`; `MAP_NODES` = the overview-map
layout, `REGION_MAPS` = the per-region coords.

## Roadmap
- **v1–v4 (done):** full main quest — Plateau → 4 Divine Beasts → Master Sword → Ganon, pouch, status, cooking.
  (See `PROGRESS.md` for the v1–v4 build history.)
- **v5 (done):** the brain, the offline phone PWA, and the verified deep-content sweep (120 shrines reconciled
  120/15/4, armor, fairies, towers, side quests, bestiary, koroks, world, deeper cooking).
- **v6 (done):** safe-area topbar fix + Traveler's Sword; the **full Hyrule map** (Status); **four trackers**
  (Great Fairy + armor-tier, side quests, Koroks counter, memories meter); **export/import backup**, **per-step/
  shrine notes**, **global search**. Verified in-browser, hosted on GitHub Pages.
- **v7 (done):** **per-region maps** (map phase 2) — a `RegionMap` schematic inside each expanded Shrines group,
  from a 15-agent coordinate sweep (`knowledge/region-maps.json`); numbered tappable dots matching the list.
- **Next:** multi-game `GAMES` wrapper (TotK/OoT, ADR 0005); spoiler-toggle for hints; service-worker
  true-offline + "new version" prompt (the proper fix for the iOS Home-Screen refresh friction, if wanted).
