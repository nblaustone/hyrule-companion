# Hyrule Companion — Build Memory (PROGRESS.md)

A continuity doc for the BotW walkthrough app (`HyruleCompanion.jsx`). If a future
session has this file (keep the project in a **Claude Project**, or paste this back),
it can resume without re-deriving the architecture, conventions, or sources.

> Honest note on how this works: this file is a **handoff document**, not live AI
> memory. A new chat does not auto-read it. Keep it with the project so it can be
> referenced. The app's own progress (checkmarks/pouch) lives in `window.storage`,
> separate from this file.

---

## What this is
A single-file React artifact: a Sheikah-Slate-themed BotW (Switch) walkthrough +
auto-syncing inventory + status dashboard + cooking book. Mobile-first, max-width 560px.
Original art only (no Nintendo screenshots/fonts — copyright). Progress persists via
`window.storage` (NOT localStorage — forbidden in artifacts).

## Current version: v4 — full main quest, end to end
Ten regions, five bottom tabs (Status · Journey · Items · Cook · Guide).

## Region status (depth) — ALL main-quest chapters are FULL
| # | Region | Quest | Notes |
|---|---|---|---|
| 1 | Great Plateau | Tutorial | every shrine puzzle, Warm Doublet, paraglider; schematic map |
| 2 | Kakariko | Seek Out Impa | Dueling Peaks → Hestu → Ta'loh Naeg → Impa |
| 3 | Hateno | Locked Mementos | blue flame → Purah → Camera Rune → back to Impa |
| 4 | Captured Memories | (optional) | all 12 + 13th, album order, tap-to-track |
| 5 | Vah Ruta | Zora's Domain + beast | Sidon, 20 shock arrows, 5 terminals, Waterblight, Mipha's Grace |
| 6 | Vah Medoh | Rito Village + beast | Snowquill, Teba's test, 4 cannons, Windblight, Revali's Gale |
| 7 | Vah Rudania | Death Mtn + beast | Flamebreaker, Yunobo cannonball, sentries, Fireblight, Daruk's Protection |
| 8 | Vah Naboris | Gerudo + beast | vai outfit, Thunder Helm/Kohga, sand seal, Thunderblight, Urbosa's Fury |
| 9 | Master Sword | Korok Forest | 13 hearts, Lost Woods embers, Great Deku Tree |
| 10 | Destroy Ganon | Hyrule Castle | castle loot, Calamity Ganon, Dark Beast + Bow of Light |

`ROADMAP` now renders under the **Destroy Ganon** region as a **post-game / 100%**
overview (120 shrines, 900 Koroks, Great Fairies/armor, side quests/Tarrey Town,
DLC/Master Mode). These are pointers, not full chapters.

The main story is therefore **complete**: Plateau → all 4 Divine Beasts → Master
Sword → Ganon. CHAMPIONS step-wiring: Mipha=r20, Revali=md_b3, Daruk=rd_b3,
Urbosa=nb_b3. STATUS_RUNES includes Camera=h6.

## Architecture / conventions (read before editing)
- **One file**, default export `HyruleCompanion`. Reference data lives in top-level
  `const` objects; UI reads them.
- **Region object**: `{ id, name, sub, kind:'region'|'beast', tagline, champion?, sections:[] }`.
- **Section**: `{ id, name, sub, reward?, steps:[] }`.
- **Step**: `{ id, k, t, items?:[] }`.
  - `k` (kind): `step | loot | optional | reward` are **checkable**; `tip | warn` are info-only.
  - `items[]`: `{ name, cat, note, orb?, rune? }`. Collecting the step adds these to the pouch.
  - `cat` ∈ `rune | weapon | bow | shield | armor | key | material` (see `CATS`).
  - `orb:true` → counts toward the Spirit Orb tracker (4 orbs = 1 upgrade).
  - `rune:'magnesis'|...` → uses that glyph in the pouch.
- **IDs must be globally unique.** Prefixes: Plateau = `awk/om/tw/oa/jb/wd/od/kn/gs/pg/lv`;
  Kakariko `k*`/`k_*`; Hateno `h*`/`h_*`; Memories `m*`/`m_l*`/`m_*`; Vah Ruta `r*`/`r_*`.
- **Status panels** key off specific step IDs: `STATUS_RUNES` (rune→step), `CHAMPIONS`
  (ability→step, e.g. Mipha's Grace = `r20`). When adding beasts, wire the champion's
  unlock step into `CHAMPIONS` and add its runes/items.
- **Persistence keys**: `botw:progress` (JSON map of stepId→true), `botw:ui`
  (tab, region, openSections, guideSub). Helper = `store.get/set` (guards missing storage).
- **Glyphs** are inline SVG in `Glyph()`. Add a `case` for new icons.
- **Styling**: one injected `<style>` template literal in `StyleBlock()`. Google Fonts via
  @import (Cinzel display / Rajdhani UI / Inter body), with fallbacks. Dark teal base,
  ember-orange = "to do", activated-cyan = "done" (mirrors Sheikah tech state).

## Build/edit gotchas
- File is large (~82KB). When rewriting, **build in chunks** (create_file for part 1,
  then `cat >> file << 'QUOTED_EOF'`) so output length limits can't truncate it.
  Use a **quoted** heredoc delimiter so `${}` and backticks stay literal.
- After writing, sanity-check: balanced `{}` and `()`, even backtick count, single
  `<style>`/`</style>`, no `localStorage`, `window.storage` present.
- No `<form>` tags; use onClick handlers. Tailwind not used (custom CSS).

## Sourcing (for accuracy — this is the whole point)
Cross-checked against: Game8, Zelda Dungeon (+wiki), GameFAQs, Zeldapedia/Fandom,
ZeldaCentral, Gamer Guides, Thonky, Shacknews. Verified specifically:
- Multiple Traveler's Bows on the Plateau (Temple of Time + Oman Au + behind Owa Daim) — not a bug.
- Cooking: one effect per dish; stack to extend; Chilly = desert heat only (NOT Death Mountain);
  Fireproof = elixir only; recipes per effect.
- Captured Memories: 12 + 13th (Blatchery Plain), album order, Champion's Tunic for 1st.
- Vah Ruta: Sidon, 20 shock arrows (Ploymus/Red-Maned Lynel — can sneak), 4 pink orbs,
  5 terminals + trunk/water control, Waterblight Ganon, Mipha's Grace + Heart Container + Lightscale Trident.

## Backlog / next ideas (level 3+)
1. **120-shrine tracker** + **Korok seed counter** (completion UI + orb tracker already scale).
2. **Per-section personal notes** (persist under `botw:notes`).
3. **Side-quest / Great Fairy / armor-upgrade chapters** (turn the post-game ROADMAP cards into real trackers).
4. **Multi-game support** (game picker → TotK / OoT) — wrap REGIONS in a GAMES array.
5. Optional: let user drop in their own screenshots per step.

## Changelog
- v1: Great Plateau only (walkthrough + map + persistence).
- v2: Inventory pouch, Status dashboard (orbs/runes), Cooking book.
- v3: Multi-region (Kakariko, Hateno, Captured Memories, Vah Ruta); region selector;
  Champion Abilities panel; Camera added to rune row; overall (cross-region) progress.
- v4: Full main quest — added Vah Medoh, Vah Rudania, Vah Naboris, Master Sword,
  Destroy Ganon (10 regions). Wired all 4 champion abilities. ROADMAP repurposed to
  post-game/100%. File ~100KB; assembled via chunked appends (str_replace for wiring).
  Sources added: Game8, Gamer Guides, GameFAQs, Neoseeker, Zelda Dungeon, Shacknews,
  Dexerto for each beast + Master Sword + Calamity/Dark Beast Ganon.
- v5: **Now a real phone app + a project brain.** This doc is superseded by `CLAUDE.md`
  (the spine) + `journal/` (ADRs 0001–0005 + the learning log) — read those first now.
  Built `index.html`: a single self-contained, OFFLINE PWA (React + app + fonts + an
  original Sheikah-eye icon all inlined; localStorage with a window.storage fallback;
  Add-to-Home-Screen). Added a verified-research sweep (41 agents + adversarial verify +
  a 120/15/4 completeness audit + a web-verified desert fix) → a **Shrines** tab (all 120,
  trackable) and an expanded **Guide** (Armor · Fairies · Towers · Quests · Enemies ·
  Koroks · World) + deeper **Cook**. Build pipeline: `assemble-knowledge` → `inline-data`
  → `build`. Data lives in `knowledge/*.json`, inlined into the .jsx GEN:DATA block.
- v6: field feedback from playing it on the phone. Fixed the topbar under the iPhone
  status bar (`env(safe-area-inset-top)`) + added the missing Plateau Traveler's Sword.
  Added the **full Hyrule map** (Status, original SVG, tap a region → its shrines);
  **four trackers** (Great Fairy + armor-tier, side quests, Korok counter, memories meter)
  + a Collectibles panel; **export/import backup**, **per-step/shrine notes**, and a
  **global search** overlay. New keys: botw:koroks, botw:notes, botw:armortier.
- v7: **per-region maps** — each expanded Shrines region shows a schematic mini-map
  (numbered tappable dots matching the list + tower/fairy/landmarks), from a 15-agent
  coordinate sweep → `knowledge/region-maps.json`. Also answered the iOS Home-Screen
  refresh question (force-quit & reopen; data is safe; back up via the v6 code).
- v8: a **service worker** (network-first auto-updates so reopening online is fresh, +
  offline + a "new version" banner — the durable refresh fix); a **Settings** segment +
  **spoiler toggle**; and the big one — a **multi-game** `GAMES` wrapper + game picker
  with **Tears of the Kingdom** as game 2 (9-chapter walkthrough, 152 shrines, 5 abilities,
  armor, bestiary, cooking, world; from a 57-agent verified sweep). Storage namespaces per
  game (botw:* / totk:*); TotK data in `knowledge/totk/` via `build/assemble-totk.mjs`.
