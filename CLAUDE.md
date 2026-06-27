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
- **Not copyright-infringing.** We describe and re-draw; we never embed Nintendo assets *in the published
  build*. (ADR 0003) The v12 Bookshelf is the one nuance: the owner may import **his own** book/comic copies
  into **private on-device storage** (IndexedDB) through neutral reader tooling — never uploaded, never in the
  repo or the built `index.html`. The published artifact stays 100% asset-clean. (ADR 0009)

## Posture (the three laws — inherited from the brain family)
1. **Don't invent.** Every step/fact traces to a real BotW source, or it's marked uncertain. An honest "unsure"
   beats a confident wrong answer.
2. **Additive, never destructive.** Grow the guide; never silently drop a region, item, or the user's progress.
3. **The repo is the memory.** Decisions live in `journal/decisions/`, not in chat. Supersede with a new ADR;
   never rewrite history.

## Agent Workflow
For any multi-step agentic task, follow the policy in [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md): **serial cascade by
default; fan out only when subtasks are truly independent.** When you DO fan out over many like items (shrines,
quests, item cards), **BATCH them — one agent per group of ~12, never one-per-item** (the single biggest token
saver here). Run **≤2 Workflows at once** (3+ trips 529 overload); `resumeFromRunId` mops up failures.

## The games (multi-game as of v8; ELEVEN games as of v17)
Eleven games now live behind a **console/era game shelf** (v16; topbar `● <short> ▾` button + a Status "Now playing"
banner → a full-screen `GameShelf` overlay grouped by console, newest first via `meta.consoleRank`). Grouped:
**Switch** — Breath of the Wild · Tears of the Kingdom; **3DS** — A Link Between Worlds (game 7, v17); **GameCube** —
The Wind Waker (game 8, v17); **GBA** — The Minish Cap (game 9, v17); **GBC** — Oracle of Seasons (game 10) +
Oracle of Ages (game 11, v17); **N64** — Ocarina of Time (game 3, v14) · Majora's Mask (game 4, v15); **SNES** —
A Link to the Past (game 5, v16); **Game Boy** — Link's Awakening (game 6, v16). `GAMES = { botw, totk, oot, mm,
alttp, la, albw, ww, minish, oos, ooa }` (built by `inline-data.mjs` — every game except BotW is read wholesale from
`knowledge/<game>/app-data.json`; the v16/v17 additions are read in a single loop over their ids); the
`HyruleCompanion` wrapper owns the active game (`hyrule:game`) and remounts `<HyruleGame key={game}>`, which shadows
the data globals with `GAMES[game]` and namespaces storage (`<id>:*`). Per-game `terms`/`guideSegs`/`postRegionId`
adapt labels + surfaces, and a per-game **`meta`** block (console/consoleRank/year/era/accent/accent2/cover — the
SINGLE source is the `META` map in `inline-data.mjs`) drives the shelf cards + original-SVG `GameCover` emblems (cover
keys: slate/tears/ocarina/moon/triforce/windfish/painting/sail/cap/season/harp). **Missing datasets degrade
gracefully** (every game except BotW/TotK lacks shrines/cooking/maps/… — the canaries for "does this feature
degrade?"). See ADR 0005. Data: `knowledge/<id>/` each with its own `build/assemble-<id>.mjs`. Most non-BotW games
set `terms.worldName` (Termina / Hyrule / Koholint / the Great Sea / Holodrum / Labrynna …) used by the Enemies lede —
falls back to "Hyrule" otherwise. **CompendiumView's category COLS now cover the classic cats** (sword/song/key) so
those entries render; empty columns auto-hide (BotW/OoT/MM unaffected).

## Layout
```
HyruleCompanion.jsx   the source of truth — one React component; reference data inlined in a GEN:DATA block
index.html            BUILT, self-contained, offline PWA (open this on your phone)  ← the deliverable
build/build.mjs       esbuild pipeline: jsx → transformed js → inlined into index.html (React + fonts inlined)
build/assemble-knowledge.mjs  research output → reconciled knowledge/*.json (the 120/15/4 honesty gate)
build/inline-data.mjs        knowledge/*.json → the .jsx GEN:DATA block (strips agent `notes`)
build/gen-*-workflow.mjs     content authoring (older pattern): each emits a self-contained author→adversarial-
                      verify Workflow script (embeds its input as consts; v12.7+). Pair with a `build/merge-*.mjs`
                      that splices ONLY the new field(s) back into knowledge/*.json (additive; strips sources).
                      Used for: shrine solutions, battle guides, armor/economy/korok depth, side quests, compendium.
build/wf-*.mjs        content authoring (v16+, direct Workflow-tool scripts): self-contained `export const meta`
                      + `agent()/pipeline()` scripts run via the **Workflow tool** (`scriptPath`), NOT emitted.
                      `wf-<game>-{walkthrough,depth,compendium}.mjs` author→verify a classic game's content; pair
                      with `build/merge-walkthrough.mjs` (opening + chapters, asserts unique ids) and
                      `build/merge-game-depth.mjs` (writes the 4 overlay JSONs). Run HEAVY walkthrough wf SOLO.
build/vendor/         pinned React + ReactDOM UMD (vendored so the build needs no network at runtime)
manifest.webmanifest  PWA manifest (name, icons, standalone display) · icon-512/180.png  generated Sheikah eye
knowledge/            researched, verified BotW data (sourced JSON). `_raw-research.json` = the full workflow
                      output (provenance + agent notes); the rest are the clean, app-facing datasets —
                      shrines · towers · great-fairies · side-quests · armor · bestiary · cooking ·
                      cooking-ingredients · koroks · world · region-maps · economy · compendium · lore
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
| `node build/assemble-cooking.mjs` | v10 cooking-tool ingredient sweep (`/tmp/cook-raw.json`) → reconciled `knowledge/cooking-ingredients.json` (120 ingredients; normalizes effects, encodes Hearty `hearty:+N`, dedups). Refuses to write unless all 11 effects are covered. |
| `node build/inline-data.mjs` | inlines `knowledge/*.json` (incl. `cooking-ingredients.json` → `COOK_INGREDIENTS`) into the `.jsx` GEN:DATA block (strips agent `notes` so verification meta never reaches the UI) |
| `node build/pack-books.mjs [id…]` | **LOCAL only, never part of the build** (v12, ADR 0009). Turns the owner's own iCloud book files (CBR/PDF/EPUB) into downscaled, store-only `<id>.hbook.zip` packs in `iCloud/Zelda/_companion-packs/` for private on-device import. Books never enter the repo (gitignored). |
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
- **Step**: `{ id, k, t, stuck?, items?:[] }`.
  - `k` (kind): `step | loot | optional | reward` are **checkable**; `tip | warn` are info-only.
  - `stuck?` (v9): a hidden "Stuck? tap for the exact how" hint (`StuckReveal`) — sourced + spoiler-aware,
    authored by the `extract-walkthrough → gen-stuck-workflow → Workflow → apply-stuck` chain (ADR 0006).
  - `items[]`: `{ name, cat, note, orb?, rune? }`. Collecting the step adds these to the pouch.
  - `cat` ∈ `rune | weapon | bow | shield | armor | key | material` (see `CATS`).
  - `orb:true` → counts toward the Spirit-Orb tracker (4 orbs = 1 upgrade). `rune:'magnesis'|...` → pouch glyph.
- **IDs must be globally unique** (progress is a flat `{stepId: true}` map). Prefix per region; never reuse an id.
  Side quests use **stable `sq_<slug>` ids** (v12.11) — NOT positional — so the list can grow without corrupting
  saved checks; a one-time name-based migration (`SQ_LEGACY` + `botw:sqmig`) carried the old positional checks over.
  Shrine quests aren't separately tracked: their done-state mirrors the shrine's own `shr_*` checkbox.
- **Data consts** (inlined by `inline-data.mjs`, bundled into `GAMES[game]`): the originals plus `ECONOMY`
  (Money guide, v12.9) and `COMPENDIUM` (the 410-entry item catalog, v12.13–14). Any BotW-only const must degrade
  when the active game lacks it — destructure it, guard its render, and the Items tab falls back to `PouchView`
  when `COMPENDIUM` is empty (TotK). **TotK is the canary for "does this feature degrade?"**
- **Status panels** key off specific step IDs: `STATUS_RUNES` (rune→step), `CHAMPIONS` (ability→step). Wire new
  beasts/runes here.
- **Persistence keys**: `botw:progress` (JSON stepId→true — also holds tracker toggles `shr_* gf_* arm_* sq_<slug>`
  and the memory steps `m_l*`), `botw:ui` (tab/region/openSections/guideSub), `botw:koroks` (int), `botw:notes`
  (id→text), `botw:armortier` (set-index→0..4), `botw:recipes` (v10 saved-cooking array), `botw:shrinepin` +
  `botw:shrinerecents` (the "I'm here" pin + recents, v12.3), `botw:sqmig` (one-shot side-quest id-migration flag).
  The `store` helper is **async** (`await store.get/set`) — it uses `window.storage` if present (Claude artifact)
  **and falls back to `localStorage`** (standalone/phone); a sync `if (store.get(k))` is always truthy (a Promise),
  so always `await` inside an async IIFE in effects. Backup = base64 of
  `{progress,koroks,notes,armorTier,recipes,shrinePin,shrineRecents}` (blob **v8**).
  Counters use the functional updater `setKoroks(k=>…)` (stale-closure guard).
  Lore/reader state is top-level `hyrule:reading`/`hyrule:bookmarks`/`hyrule:readerprefs`/`hyrule:loreart`.
  **App prefs are top-level `hyrule:prefs`** (shared across games): `{spoiler, atmos:{motion,sound,haptics}}` — the
  v18 "Living Slate" atmosphere toggles ride here (cosmetic; deliberately NOT in the backup blob). The atmosphere
  engine itself is the module-level `SlateAudio` singleton (synthesized Web-Audio, outside React) + the
  `SlateBackground` canvas; both degrade to absent if the browser lacks Web-Audio/Canvas/Vibration.
  **v12 Bookshelf:** the small book index is `hyrule:books` (in `store`); the big page **blobs** live in a
  dedicated **IndexedDB** db `hyrule-books` (store `pages`, key `bookId/filename`) — see `booksDB` + `readHbook`
  near the top of the `.jsx`. Books are device-local; never in `store`/backup/repo (ADR 0009).
- **Glyphs** are inline SVG in `Glyph()` — add a `case` for a new icon. **Styling** is one injected `<style>` in
  `StyleBlock()`. Dark teal base; ember-orange = "to do", activated-cyan = "done" (mirrors Sheikah tech state).

## Build/edit gotchas
- File is large (~100KB). When rewriting wholesale, build in chunks so output limits can't truncate it. Sanity
  check after: balanced `{}`/`()`, even backtick count, single `<style>`/`</style>`, `store` present, IDs unique.
- No `<form>` tags; onClick handlers only. No Tailwind (custom CSS). No external fonts/scripts at runtime in the
  built `index.html` (the artifact `.jsx` may use a Google-Fonts @import; the build strips/inlines for offline).
- **React hooks come off the global `React`** via a hardcoded destructure in `build.mjs` (`const {useState,
  useEffect,useMemo,useCallback,useRef}=React;`). If you use a hook not in that list, the built app white-screens
  with `ReferenceError: <hook> is not defined` — add it to that `head` line. (Bit us in v9 with `useRef`.)

## House rules
- **Honest over flattering.** Mark anything uncertain; a dash-with-a-reason beats a fake fact.
- **Spoiler-aware, beginner-first.** Hints, not lore-dumps. Assume a player who has never touched the game.
- **Mobile-first.** 560px max width, thumb-reachable tab bar, big tap targets, reduced-motion honored.
- **Always ship it (standing approval).** This is the owner's private personal app — there's nothing to fear in
  publishing. After any change, **commit and push to `main`** so GitHub Pages redeploys (the installed PWA then
  offers "Update"). No need to ask each time — the owner has granted standing permission. The one guardrail:
  **build (`node build/build.mjs`) and sanity-check before pushing** so we never deploy a white-screen.

## Tabs & features (v6–v14)
**The 7 tabs:** **Status · Journey · Shrines · Items · Cook · Guide · Lore**, plus the topbar **global search**
(magnifier, `SearchOverlay`). Current per-tab state (after the v12.7–v12.14 build-out):
- **Status** — overall %, the **Resume "you're here"** pin, the **"What to do next" coach** (`nextUp` memo,
  v12.9), the full Hyrule map, and Shrines/Collectibles meters. Spirit Orbs = `shrineStats.done` (1 shrine = 1 orb).
- **Journey** — the main-quest walkthrough (Plateau → 4 beasts → Master Sword → Ganon) with `StuckReveal` hints.
- **Shrines** — all 120, region-grouped + per-region maps; each row has a **spoiler-gated full `solution`**
  (v12.7) and a tappable **"· Quest: X ›"** cross-link to its shrine quest (v12.11).
- **Items** — now the **Compendium** (`CompendiumView`, v12.13–14): a **410-entry** browsable catalog (weapons ·
  bows · shields · armor · materials · creatures), search + category filters, **tap any entry for its stats /
  effect / where / sell**. Falls back to the old auto-pouch (`PouchView`) only when `COMPENDIUM` is empty (TotK).
- **Cook** — the interactive pot simulator + finder + ingredient browser + Cookbook (v10).
- **Guide** — a **10-segment** hub: Runes · Tips · Armor · Fairies · Towers · **Quests** · **Enemies** ·
  Koroks · **Money** · World. Armor shows **per-★ upgrade recipes + where-to-farm** (v12.9); Enemies has a
  **Combat Basics primer + per-boss "how to win" guides** (v12.8); Quests holds the complete **78 side quests**
  (each with a spoiler-gated `how`) **+ all 38 shrine quests** cross-linked to their shrines (v12.11); **Money**
  (`EconomyView`) is rupee earners + material farming + tips (v12.9); Koroks has the search/category **solver**.
- **Lore** — the page-turn reader + the on-device Bookshelf.
- **Global search is answer-first** (v12.12): each hit **expands inline to the actual answer** (shrine solution,
  fight guide, quest how-to, armor recipe, an item's stats+sell, cooking, walkthrough hint) with a secondary
  "Open the full page ›" deep-link. Categories lead with the panic ones (Shrines · Enemies · Items · Side quests).

**v12:** the **Lore** tab now also carries a **Bookshelf** (`LibraryView` extended + `BookReader` + `BookSpine`)
— a private, on-device reader for the owner's own books/comics (ADR 0009). Import `.hbook.zip` packs (made by
`build/pack-books.mjs`) → page blobs go to IndexedDB (`booksDB`), parsed by the zero-dep `readHbook`. Comics +
PDF guides render as swipeable page images (`BookReader`, fit-page ↔ fit-width); the EPUB reflows through the
existing `LoreReader`. Reading position/bookmarks/Continue-reading are shared with the lore tales. Nothing is
uploaded or committed — the published build stays asset-clean (`.gitignore` blocks all book artifacts).
Tabs: **Status · Journey · Shrines · Items · Cook · Guide · Lore** (7) + a **global-search** overlay (topbar magnifier,
`SearchOverlay`) across everything. **v9 additions:** a persistent **Resume "you're here"** affordance (topbar
pin + Status hero, `resumeTarget`/`jumpToStep` → opens + flashes your first uncompleted step); a **joy pass**
(`box-flash` Sheikah check-pulse, section/tab fades, `:active` press — all under the global reduced-motion
kill-switch); **progressive spoiler reveal** (the Settings toggle now veils champions/rewards of regions *ahead*
of you, per-item tap-to-reveal); and **"Stuck?" hints** (`StuckReveal`) hanging off walkthrough steps. **v10:**
the **Cook** tab is now an interactive tool (`CookView` + the pure `cookResult` engine + `COOK_INGREDIENTS`, a
120-ingredient sourced table) — a **pot simulator** that predicts the dish (effect/tier/hearts/≈duration/crit) and
**warns before you waste** (effect-cancel, invalid-elixir, Dubious/Rock-Hard, Monster-Extract-kills-crit,
max-tier, Hearty +25 cap), a **goal-first finder** ("I'm cold → Spicy"), an **ingredient browser** (effect shown
up front + location + sell), and a **Cookbook** (saved builds, `botw:recipes`). Degrades to `CookReference` when a
game has no ingredient table (TotK). Status carries the **full Hyrule map** (`HyruleMap` — original SVG, 15
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
- **v8 (done):** **service worker** (network-first auto-updates + offline + "new version" banner); **Settings**
  segment + **spoiler toggle**; **multi-game** `GAMES` wrapper + game picker; and **Tears of the Kingdom** as
  game 2 (9-chapter walkthrough, 152 shrines, abilities, armor, bestiary, cooking, world). Verified both games,
  isolated storage, zero console errors.
- **v9 (done):** **polish one companion** (ADR 0006) — the **joy pass** (Sheikah check-pulse, section/tab fades,
  tactile press), **Resume "you're here"** (topbar pin + hero → your first uncompleted step), **progressive
  spoiler reveal** (path-aware veil of future champions/rewards), and sourced **"Stuck?" hints** on the
  walkthrough (author→adversarial-verify workflow, one agent per region). `build.mjs` now also exposes `useRef`.
  Verified in-browser, 0 live console errors. **v9.1–9.2 (done):** Resume now follows the main-quest spine
  (`k:"step"` only, so skipped loot/optional never traps "you're here"); two **honesty audits** fixed 5 memory
  routes (incl. the user-caught `m_l7`) + 3 walkthrough errors (Zora Helm, Hestu's tower chest, Rito direction).
- **v10 (done):** **interactive cooking tool** (ADR 0007) — research-led (player-pain + 120-ingredient sourced
  table, two workflows) → a **pot simulator** with **waste-warnings**, a **goal-first finder**, an **ingredient
  browser**, and a **Cookbook**. Pure `cookResult` engine; hearts/duration shown as honest ≈. Verified both
  games (TotK falls back to the reference Cook), 0 live console errors.
- **v11 (done):** the **Lore Library** (ADR 0008) — a 7th **Lore** tab: a from-scratch, offline **page-turn
  reader** (`LibraryView` + `LoreReader`; CSS multi-column engine, themes slate/sepia/night, A−/A+ font steps,
  Continue-reading, bookmarks, progress rings) over original, **sourced** Zelda lore (`knowledge/lore.json` →
  `LORE`, shared cross-game; `ReadBlock[]` with `canon`/`creator`/`theory` tags). Voice **locked** to a
  lyrical-folklore master-novelist register (`docs/lore-style-bible.md`); v1 = 7 chapters (creation → Demise's
  curse → the timeline → Master Sword → the Calamity → the Champions → the peoples). Authored via a
  source→draft→adversarial-edit **writers'-room Workflow**; verified in-browser, 0 console errors. Reading state
  is top-level `hyrule:reading`/`hyrule:bookmarks`/`hyrule:readerprefs`. Deferred: per-chapter SVG art (`t:"art"`).
- **v12 (done):** the **on-device Bookshelf** (ADR 0009) — the Lore tab gains a private reader for the owner's
  **own** book/comic copies (*Hyrule Historia*, the *OoT* manga, the official *BotW Explorer's Guide*, the Yuw
  *BotW Game Guide*, *OoT: Pathways*). `build/pack-books.mjs` (local; sips downscale + store-only zip) →
  `.hbook.zip` packs in iCloud → import once → page blobs in IndexedDB (`booksDB`), read by a zero-dep
  `readHbook`. `BookReader` (swipe page-images, fit-page ↔ fit-width) for comics/PDF guides; the EPUB reflows
  through `LoreReader`. ~250MB source → ~159MB packs; the **published build stays ~1MB and asset-clean** (books
  never touch the repo — `.gitignore` + offline-check). Verified in-browser end-to-end (import → IndexedDB →
  page render → reflow), 0 console errors. **Accuracy cross-reference (done):** a 7-agent verified Workflow
  checked the BotW main-quest spine against the *official* Explorer's Guide (each conflict re-read from the page
  image) → **0 verified conflicts / 28 confirms**; applied 3 tiny additive tweaks (STATUS_RUNES "Remote Bombs",
  softened `om1` torch line, Cryonis-shatters-ice).
- **v12.2 (done):** reader polish — both readers (`BookReader`/`LoreReader`) are now full-screen overlays
  **portaled to `document.body`** (`portal()` helper) so they escape the tab content's stacking context + any
  ancestor transform. Fixed the "bottom bar floats in the middle" bug; `.body` fadeIn is now opacity-only (a
  transform there became the containing block for fixed children); `.lore-view` is `flex:1` so the footer pins
  flush. **Rule of thumb: portal any full-screen overlay to body.**
- **v12.3 (done):** mid-game usability (real-play feedback) — **Items Pouch** gains search + category filter
  chips (`PouchView`); **Shrines** gains a **Quick-Find** (search now matches region/town/hint/shrine-quest/
  **puzzle type**), an **"I'm here" pin** (`shrinePin` → "You're here" card + per-row pin) and **Recents** chips
  (`shrineRecents`) that focus-scroll+flash a row; **global search now jumps to the exact shrine**. New keys
  `botw:shrinepin`/`botw:shrinerecents`.
- **v12.4 (done):** reader unbricked + a real toolset. **Critical fix:** the full-screen readers' top bars had
  no `env(safe-area-inset-top)`, so on a real iPhone the "‹ Library" back + top controls hid under the notch
  (had to force-quit to escape). Added top/left/right safe-area insets to `.bk-rbar`/`.lore-rbar`
  (`viewport-fit=cover` already set). **New tools** (ported from the owner's `~/Desktop/preg` reader, read-only):
  BookReader gets tap-center **chrome toggle**, a **draggable page scrubber**, **jump-to-page** (tap the
  counter), **double-tap zoom**, **night-dim**; LoreReader gets the scrubber. Bars hide via
  `.reader-chrome-off`. Verified by simulating a 48px notch in-browser (back button clears it) + exercising
  every control, 0 console errors. **Rule: anything replacing the topbar as top-most chrome must re-add
  `env(safe-area-inset-top)`.**
- **v12.5 (done):** Resume "you're here" is now **frontier-based** — it anchors on the *furthest* completed
  main-quest (`k:"step"`) step and points to the next incomplete step *after* it, instead of the first gap. A
  skipped-but-walked-past step (the classic: never grabbed the optional Warm Doublet) can no longer drag Resume
  into the past. Also reclassified the "Stay Warm First" steps (`wd1/wd2/wd3`) to `k:"optional"` (they are).
  `resumeIdx` now tracks the frontier, so the spoiler veil reveals everything you've actually reached. **Rule:
  "where am I" in a non-linear game = max(progress), never min(gaps).** **Next:** Hyrule Historia → new canon
  Lore chapters; OoT Pathways → seed the OoT (game 3) walkthrough.
- **v12.6 (done):** reader typography (ported from the `~/Desktop/preg` reader). The LoreReader gains a settings
  sheet: **Theme** (added a light **Day** → slate/sepia/day/night), **Text size** (6 steps), **Typeface**
  (serif/sans/easy-read), **Line spacing**, **Margins** (dynamic `.lore-view` pad + measure), **Brightness**
  (`.lore-dim` overlay), + Cover. New prefs ride in `hyrule:readerprefs` (`LORE_FONTS/LORE_LH/LORE_MARGINS/
  LORE_BRIGHT`). BookReader's night-dim is now warm. **Column-engine note:** a `relayout` flag toggles
  `.lore-cols-still{transition:none}` on dims/size/font/margin change so the column **snaps** to its new aligned
  position (no half-column slide) while page *turns* keep the smooth `.26s` transition. Verified each control
  applies/persists/re-paginates aligned, 0 console errors. Deferred from preg: TOC, search-in-book, multi-page
  bookmarks, highlights/notes.
- **v12.7 (done):** **shrine solutions — all 120** — a spoiler-gated `solution` field on each shrine, rendered via
  the existing `StuckReveal` ("Stuck? Tap for the exact how") on shrine rows. For puzzle/combat shrines = the
  actual trick; for the 33 remaining **hidden** (shrine-quest) shrines = **how to make it appear** + solve;
  blessing shrines = the free orb + chest. Authored by an author→adversarial-verify **Workflow** (web-sourced
  Game8/Zelda Dungeon/Thonky/Zeldapedia, independent second-source fact-check — caught real errors). The early
  20-shrine sample (Great Plateau + Dueling Peaks + Hateno) was hand-vetted first; the **other 100 (12 regions)**
  were then done by **`build/gen-shrine-solutions-workflow.mjs`** (per-shrine author→verify pipeline, 200 agents)
  → `build/merge-shrine-solutions.mjs` splices only the `solution` field into `knowledge/shrines.json` →
  `inline-data` (preserves the field) → UI. Verified in-browser (Lanayru reveals render, 0 console errors).
- **v12.8 (done):** **combat guides** (Guide→Enemies) — the user (mid-game, with his son) asked for boss/enemy
  fight help; his deeper pain was *feeling overwhelmed by systems*, so this ships two halves. (1) A collapsible
  **Combat Basics primer** (7 cards: flurry rush, perfect guard/parry, sneakstrike, weak-points, elements,
  durability, and a **"what to bring" loadout** that cuts the menu-overwhelm) at the top of `EnemiesView`, from
  `BESTIARY.basics`. (2) A spoiler-gated **"Stuck? How to win this fight"** reveal on the **26 marquee enemies**
  (4 Blights, both Ganon phases, 4 Lynels, 5 Guardians, Hinox/Stalnox, 5 Taluses, Molduga, Wizzrobe, both Yiga)
  — each `battle` guide *leads with gear/food*, then opening → core loop → a safe/"cheese" option → drops.
  `StuckReveal` gained `label`/`openLabel` props (reused as-is). Authored by the same author→adversarial-verify
  Workflow (`build/gen-battle-guides-workflow.mjs`, 54 agents → `build/merge-battle-guides.mjs` splices `battle`
  by name + the `basics` array into `knowledge/bestiary.json`). Verify pass caught real errors (flurry-dodge
  directions inverted; **Igneo Talus needs 2★ Flamebreaker to climb — a Fireproof Elixir does NOT stop the
  touch-burn**; Thunderblight's omitted 3rd phase; Talus drop/tier fixes). Verified in-browser (7 cards + Igneo
  reveal render, 0 console errors). **Note:** `inline-data` strips only *top-level* `notes/confidence/changes`,
  so `bestiary.basics` (top-level array) and per-enemy `battle` survive — don't name a data field `notes`.
- **v12.9 (done):** **playthrough-depth bundle** — four features the user greenlit together. (1) An **armor
  upgrade tracker**: each set gets `tiers` (★1–★4 full-set materials + rupees) + a `farm` note (where to get
  them); `ArmorView` shows the *next* star's shopping list inside the existing tier stepper (the 2 non-
  upgradeable sets — Gerudo Vai, Royal Guard — carry a clean "can't be upgraded" note). (2) A **"What to do
  next" coach** on Status (`nextUp` memo, pure logic over progress): prioritized jump-cards — continue the main
  quest, shrines in your pinned region, vessel ready, next memory, a Great Fairy, armor worth chasing, Hestu.
  (3) A **Korok solver** (`KorokSolver`): search + category chips over 19 enriched puzzle types (see/do). (4) A
  new **Money** guide segment (`EconomyView`, `knowledge/economy.json`: rupee earners + material farming + tips).
  Data authored by one 3-phase Workflow (`build/gen-depth-workflow.mjs`, 38 agents → `build/merge-depth.mjs`).
  Verify pass caught real armor errors (SegmentNext's wrong ★4 Champion's Tunic = Silent Princess ×10 not ×3;
  SAMURAI GAMERS' Amber ×30; sites confusing Great-Fairy **awakening fees** 100/500/1k/10k with upgrade rupees —
  left at 0 where unconfirmable, honesty law). New wiring: `ECONOMY` added to `inline-data` data + GAMES bundle +
  a `["economy","Money"]` guideSeg. Verified in-browser, 0 console errors. **Gotcha:** the published app's
  **service worker caches `localhost:<port>`**, so after a rebuild the preview serves the STALE build — verify
  on a fresh port/origin (or unregister SW + clear caches) or you'll "verify" the old bundle. Also: the preview
  tool's own python server can wedge (macOS local-network permission gate); a plain `python3 -m http.server` on a
  new port + `window.location.href` works around it.
- **v12.10 (done):** **full audit + polish pass** — a 6-dimension verified-review Workflow (bugs/core/data/UX/
  a11y/gaps, 46 agents, each finding adversarially re-checked → 36 real, 4 false positives) then fixed. Headline:
  the **coach's Korok card white-screened TotK** (KOROKS is null there, and TotK has no koroks segment to escape
  via) — now guarded (`KOROKS && …`) + `KoroksView` early-returns on null. Other real fixes: Shrines meter
  hardcoded `/120` → dynamic `stats.total` (TotK has 152); **Spirit Orbs now = `shrineStats.done`** everywhere
  (was walkthrough-item orbs, capped ~12, disagreeing with the shrine total); economy.json **Gut Check Rock** was
  mislabeled Gerudo Highlands → **northeastern Eldin** (our own shrines.json contradicted it); spoiler-free mode
  now actually **hides shrine solutions** (the reveal ignored it, contradicting the Settings copy); `MAP_BEASTS`
  read from the active game. Polish: dropped the coach's redundant "Continue main quest" card (the Resume hero
  owns that); gated the armor-chase card + the prio-pill to BotW's `{beginner,mid,late}` vocab (TotK was
  recommending the *starter rags* and rendering sentence-long pills); the **armor star-stepper only shows for
  upgradeable sets** (was dead UI on non-upgradeable + all TotK sets); long `farm` prose collapsed into a
  `StuckReveal`; memory card gated to after the Plateau; SW banner got a **"Later"**. Nits: stars are real
  `<button>`s w/ 30px tap targets + `:focus-visible` outlines; Korok chips Capitalized; memory denominator 12→13;
  **backup blob v8** now carries `shrinePin`/`shrineRecents`. Data: backfilled the standard **30/150/600/1500**
  upgrade rupees on the 7 ordinary sets that omitted them (Champion's Tunic + Ancient left off, honesty); added a
  **horses & stables** Tips card. Re-verified in-browser BotW + TotK (TotK coach now empty, no crash), 0 console
  errors. **Rule reinforced: any BotW-only feature (coach card, armor tiers, map beasts) must degrade when the
  active game lacks that dataset — TotK is the canary.**
- **v12.11 (done):** **side quests completed + shrine quests cross-linked** (the "perfect BotW shell" the owner
  wants every future game to inherit). (1) **Side quests 56 → 78** (the full base-game set, no DLC), per-region
  author→verify Workflow (`build/gen-sidequests-workflow.mjs`, 28 agents → `build/merge-sidequests.mjs`); each
  quest now has giver/location/reward/oneLine **+ a spoiler-gated `how` reveal** (StuckReveal, parity with shrine
  solutions). Workflow excluded shrine quests + DLC; merge **deduped 10 cross-region boundary dups** (Rito quests
  claimed by both Tabantha & Hebra → kept in Tabantha; Hebra legitimately ends with 0 logged side quests, and
  `QuestsView` now hides empty region groups). 3 legacy names were corrected (Cucco Conundrum→Flown the Coop,
  etc.). (2) **Shrine Quests** are now a first-class section in `QuestsView`, **derived from shrines.json** (all
  **38**, was 8 in the tracker) — each mirrors its shrine's done-state and has a "Find shrine →" jump; the shrine
  row's "· Quest: X ›" is now a tappable cross-link the other way (`focusShrineQuest`/`questFlash`). (3) **Shell
  hardening:** side quests moved from **positional `sq_<ri>_<qi>` keys to stable `sq_<slug>` ids** (so future
  expansion can't corrupt saved progress), with a **one-time name-based migration** (`SQ_LEGACY` snapshot +
  `botw:sqmig` flag + an ALIAS map for the renamed pair). Verified in-browser: 78 quests, both cross-link
  directions flash, migration mapped seeded checks (incl. alias) to slug keys, 0 console errors. **Gotcha banked:
  `store.get`/`store.set` are ASYNC (return Promises) — a sync `if (store.get(k))` is always truthy; always
  `await` inside an async IIFE in effects.** **Pattern: stable slug ids + a legacy-snapshot migration is the way
  to expand any positional dataset without losing progress.**
- **v12.12 (done):** **answer-first search** — reframed around the moment-of-need ("I'm playing, I pull out the
  companion because I'm stuck *right now*"). The global `SearchOverlay` (topbar magnifier, one tap) used to make
  every result a LINK that navigated you to a tab where you still had to scroll + tap a reveal (≈4 taps to the
  answer). Now each result **expands inline to the actual answer**: shrine `solution`, enemy `battle` guide, side-
  quest `how` (+reward), armor effect+upgrade recipe+farm, cooking effect+ingredients, walkthrough `stuck`, tower
  location — with a secondary **"Open the full page ›"** that still deep-links for full context. Results reordered
  to lead with the panic categories (Shrines · Enemies · Side quests) then Armor/Cooking/Walkthrough/Towers.
  Implementation: each search hit carries a `detail` string (armor composes a multi-line recipe; `.srch-detail`
  uses `white-space:pre-line`); an `open` state drives the accordion; reused chevrons + a cyan answer panel.
  Verified in-browser (Waterblight → full fight plan inline; Kaya Wan/Snowquill/Tarrey/spicy all expand), 0
  console errors. The user picked ONLY this from a 4-option menu and then **explicitly declined the other three**
  (panic buttons, search-as-home, recent/nearby chips) as "not genuinely useful" — do NOT re-propose them;
  answer-first search + the Status coach already cover the moment-of-need. **Principle: content we already have is
  only as good as the taps to reach it; the magnifier is now the "help me now" button.**
- **v12.13 (done):** **equipment Compendium** — the user: the auto-pouch was useless (gear churns too fast to
  "track") and tons of gear was missing (e.g. no Guardian Shield line). Reframed the **Items tab** from a
  walkthrough-pickup pouch into a complete, browsable **catalog** (`CompendiumView`): search + category filters
  (Weapons/Bows/Shields/Armor), **tap any item → its stats + effect + where-to-find**. Data from a deep-research
  author→verify Workflow (`build/gen-compendium-workflow.mjs`, 8 categories → `build/merge-compendium.mjs` →
  `knowledge/compendium.json`, flat array, `cat`∈weapon/bow/shield/armor): **272 base-game items** (127 weapons —
  one-handed/two-handed/spears; 26 bows; 33 shields incl. **Guardian Shield/+/++**; 86 armor pieces head/body/
  legs). Also added a **Gear** category to the global answer-first search. `COMPENDIUM` wired into `inline-data` +
  GAMES bundle; the Items tab **falls back to the old `PouchView`** when `COMPENDIUM` is empty (TotK). Verified
  in-browser (272 items, filters, Hylian Shield → Guard 90/Dur 800/where, "guardian shield" surfaces in both the
  catalog and global search), 0 console errors. **Workflow gotcha banked: a verify agent died on a 529 Overload →
  that category (one-handed) dropped from the result; `resumeFromRunId` re-ran ONLY the failed agent (author
  cached) and recovered it. Resume is the fix for transient agent failures — don't re-run the whole workflow.**
  Materials/food remain covered by Cook + Economy; a materials/creatures compendium is the obvious next extension.
- **v12.14 (done):** **materials + creatures compendium** — rounded out the catalog to **410 entries**. A second
  deep-research author→verify Workflow (`build/gen-materials-workflow.mjs`, 6 categories: monster parts, ores &
  gems, dragon parts, ancient parts, special, creatures → `build/merge-materials.mjs`, which **additively** merges
  into the existing equipment `compendium.json`). Added **63 materials** (monster parts framed by their armor-
  upgrade set + sell value, the previously-missing **ores/gems** and **ancient parts**, dragon parts, and Star
  Fragment/Korok Seed/Spirit Orb) + **75 creatures** (what each yields/where). `CompendiumView` gained **Materials**
  + **Creatures** filter columns and cat-aware badges (type, **Sell N**); the global search "Items" lane now spans
  them too (with sell). Deliberately framed by USES (not cooking effect) so it complements Cook rather than
  duplicating it — though monster/dragon parts intentionally live in BOTH (Cook = elixir effect; Compendium =
  upgrade/sell use). Merge dedupes by cat+name (the "special" agent re-listed dragon/ancient parts; the dedicated-
  category copy wins). Verified in-browser (Lynel Guts → "Monster Part · Sell 200 · tops out Barbarian/Radiant…",
  Diamond → "Gem · Sell 500 · mine Rare Ore Deposits", all 6 filters), 0 console errors.
- **v13 — TotK parity (Guide tab COMPLETE; two content gaps left):** brought Tears of the Kingdom up to par
  with BotW. **Architecture:** `assemble-totk.mjs` folds OPTIONAL `knowledge/totk/*.json` overlays into
  `app-data.json` idempotently — drop a dataset file and re-assemble; `guideSegs` rebuilds from which datasets
  populate. Each dataset has its own **author→adversarial-verify** generator `build/gen-totk-*-workflow.mjs`
  (mirrors the BotW ones; emits `/tmp/totk-*-workflow.mjs` to run with the **Workflow** tool). All edits go to
  `knowledge/totk/*` sources, never the built file. Capture a finished workflow's data from its task **output
  file** (`.result` key), write to `knowledge/totk/<name>.json`, then `assemble-totk → inline-data → build`.
  - **v13.0** (b46c732): **Stuck hints** — 59 across all 9 chapters (`apply-totk-stuck.mjs` → `walkthrough.json`);
    **Combat guides** — 7-card Basics primer + 20 marquee battle guides, Gleeoks/temple bosses split out of the
    lumped rows (`battle.json`; assemble drops the `LUMPED` placeholders); **Overview map** — hand-authored
    `map-nodes.json` (12 regions + sage-temple markers). UI parametrized TotK-safe (Towers→Skyview, Fairies
    unlock-not-fee, Korok seed totals via `data.maxSeeds/totalSeeds`).
  - **v13.1** (8ba87ea): **Side quests** — 173 Side Quests + Side Adventures across 12 regions (`side-quests.json`;
    assemble stamps stable `sq_<slug>` ids). Guide→Quests now appears for TotK.
  - **v13.2** (49e792b): **Interactive cooking** — 121-ingredient `cooking-ingredients.json` flips the Cook tab to
    the pot simulator (engine verified on TotK data: Hearty Radish+Salmon → +8 bonus). **Also fixed a meta-leak
    regression I introduced in v13.0:** assemble was passing `globals.bestiary.notes` (agent verification meta)
    into `BESTIARY.notes`, which `EnemiesView` renders as its lede → "Adversarial verify done…" showed in the UI.
    Now stripped (also `COOKING.notes`/`WORLD.notes`); Korok notes kept (real caveat). **Rule: TotK app-data is
    inlined WHOLESALE (no `noNotes()` like BotW) — strip any `notes`/verification meta in assemble-totk before it
    reaches a render site.** Caught only by an in-browser screenshot → always visually verify.
  - **v13.3** (9908d4a): **Depth bundle** (`gen-totk-depth`, 44 agents → 5 overlays): armor ★1–4 tiers+farm
    (16/17 sets), 15 Skyview Towers, 4 Great Fairies (Tera/Cotera/Kaysa/Mija, troupe-unlock), Koroks (19 types +
    verified 1000 seeds/421-to-max), Money (10 earners/16 farms/8 tips). **TotK Guide tab is now at FULL parity:
    Abilities · Tips · Armor · Fairies · Towers · Quests · Enemies · Koroks · Money · World · Settings.** All
    v13.0–13.3 verified in-browser (0 console errors, 0 meta leaks).
  - **TotK region maps DONE (v14.6)** — `gen-totk-region-maps` (24 agents) → `region-maps.json` (all 152 shrines
    on per-region 0-100 grids + towers/landmarks); the Shrines-tab RegionMap now renders for TotK like BotW.
  - **TotK shrine solutions DONE (v17.12)** — all **152** spoiler-gated solutions authored + adversarially
    verified (Stuck-reveal on every shrine row + answer-first global search). `build/gen-totk-shrine-solutions-workflow.mjs`
    was **rewritten to BATCH per AGENT_WORKFLOW.md** (~12 region-coherent shrines/agent → **19 author + 19 verify =
    38 agents** in ONE solo workflow, vs the old ~304 one-per-item) → `knowledge/totk/shrine-solutions.json` →
    assemble-totk splices `solution` by region+name. Verified in-browser (reveal + search render, 0 console errors,
    0 meta leaks). **TotK is now FULLY at parity** save the lower-priority Items-tab compendium.
  - **TotK Items-tab compendium DONE (v17.13):** `gen-totk-compendium-workflow.mjs` (12 categories → 12 author +
    12 verify = 24 agents, ONE solo workflow) → `knowledge/totk/compendium.json` (**478 entries**: 92 weapons · 30
    bows · 33 shields · 137 armor · 146 materials · 40 creatures). assemble-totk folds `compendium.json` → COMPENDIUM
    → the TotK Items tab is now `CompendiumView` (was PouchView). Merge deduped 20 dragon-part dups (the monster-parts
    agent re-listed them; the dedicated dragon-elemental copy wins — same rule as BotW v12.14). Verify caught real
    BotW/fabricated `where` errors (Sea-Breeze Boomerang, Sword of the Hero, Gloom Sword, decayed-MS durability).
    Verified in-browser, 0 console errors. **TotK now has NO content gaps — fully matched to BotW's feature shape**
    (save BotW-unique depth like the 410-vs-478 catalog scale, which is by game).
  - **⚠ RATE-LIMIT RULE (learned the hard way, twice):** the worst combo is **one-agent-per-item × multiple
    concurrent workflows**. **3+ Workflows concurrently** (~360 agents) trips server-side **529** (shrine-solutions
    once came back 2/152); and even **2 one-per-item workflows launched at the same instant** (16 web-fetching agents
    firing together) trips it INSTANTLY → 0/152 in ~36s. Two fixes, both required: **(1) BATCH ~12 items/agent**
    (AGENT_WORKFLOW.md's #1 token lever — 304→38 agents) and **(2) run ONE solo workflow** for a heavy web sweep.
    `resumeFromRunId` mops up partials (cached successes return instantly). A successful batched run ≈ 2.5M tokens.
- **v14 — Ocarina of Time as game 3 (STARTED):** **v14.0** (801506f) scaffolded OoT into the `GAMES` picker
  (now **BotW · TotK · OoT**). `build/assemble-oot.mjs`: `knowledge/oot/{walkthrough,globals}.json` →
  `app-data.json` (same bundle shape; derives STATUS_RUNES, wires the 3 Spiritual Stones/CHAMPIONS to their grant
  steps; every absent dataset defaults empty & degrades — TotK was the canary). `inline-data.mjs` wires
  `oot: OOT`. globals.json = OoT identity (terms: Heart Containers/Items & Songs/Spiritual Stones/Dungeon; items
  reference; roadmap; tips; guideSegs Items·Tips·Settings). walkthrough.json = hand-authored opening (Kokiri
  Forest + Inside the Great Deku Tree → Queen Gohma → Kokiri's Emerald + Fairy Ocarina, with Stuck hints). Status
  "Shrines" panel gated to `shrineStats.total > 0`. **v14.1** (e7949e9): **full OoT main quest** — `gen-oot-
  walkthrough-workflow.mjs` (author→verify, 20 agents, web-sourced) authored the remaining 10 chapters (Hyrule
  Field/Zelda → Dodongo's Cavern → Jabu-Jabu → Door of Time/Master Sword → Forest/Fire/Water/Shadow/Spirit
  Temples → Ganon's Castle), appended after the opening → **12 chapters, 217 steps, 112 Stuck hints.** All 9
  Spiritual Stones + Medallions grant-as-item and wire to the Status tracker (assemble-oot's stepGranting). The
  merge (`/tmp/oot-merge.mjs` pattern) strips region `sources`/`corrections` and asserts globally-unique step ids
  + champion-grant coverage before writing. **v14.2** (974b8fa): **OoT depth** — `assemble-oot.mjs` now folds
  OPTIONAL `knowledge/oot/*.json` overlays (like assemble-totk) + rebuilds guideSegs. One workflow
  (`gen-oot-depth`, 36 agents) → 4 datasets: **Items & Songs** reference (40 cards = 28 items + 12 songs →
  `items-songs.json` → RUNES, Guide→Items), **Enemies** (6-card combat primer + 21 enemies + 11 boss how-to-win
  guides → `bestiary.json`, Guide→Enemies; boss `battle` spliced onto the enemy list by name), **Great Fairies**
  (6 fountains + the spell/upgrade each grants → `great-fairies.json`, Guide→Fairies), **Side quests** (31:
  Biggoron trade chain · collectibles · minigames → `side-quests.json` w/ stable `sq_<slug>` ids, Guide→Quests).
  OoT Guide went **3→6 segments** (Items·Tips·Fairies·Quests·Enemies·Settings). Cross-game copy fixes (neutral
  for all 3): Enemies default lede dropped "flurry rush" (BotW-only); Items lede dropped "shrine"; FairiesView
  lede is spell-aware when fairies grant magic. Meta stripped at merge (v13.2 lesson). Verified in-browser, 0
  console errors, 0 leaks. **v14.3–14.5 — OoT polish pass** (new reusable shell features, all data-driven):
    - **v14.3** (dcd90d7): **completion trackers** — a new `COLLECTIBLES` bundle field → counter rows in the
      Status "Collectibles" panel (OoT: Pieces of Heart 0/36, Gold Skulltulas 0/100; −1/+1/+5 + bar). Counts
      persist per game in `<game>:collect` (JSON map), ride in the backup blob (**v8→v9**), clear on reset. Any
      game can define `COLLECTIBLES:[{id,label,total,glyph,note}]` and get trackers free; BotW/TotK define none.
      Added a "heart" glyph.
    - **v14.4** (e4034fe): **per-game tab gating** — the fixed 7-tab bar hid empty tabs: Shrines gated to
      `hasShrines` (SHRINES.length>0), Cook to `hasCook` (RECIPES||COOK_INGREDIENTS) + a guard effect bounces the
      active tab to Status if it lands on a hidden one. OoT now shows **5 tabs** (Status·Journey·Items·Guide·Lore);
      BotW/TotK keep 7.
    - **v14.5** (80c4bdf): coach copy fix — the "what to do next" Great Fairy card no longer says "raises every
      armor upgrade" for OoT (game-aware → "grants a spell or a magic/defense upgrade").
  **OoT is now at strong parity + polished** — full main quest + Items/Enemies/Fairies/Quests reference +
  Heart Piece/Skulltula trackers + a clean OoT-appropriate tab set. The shrine-progress overview map + cooking
  are deliberately N/A for OoT (no shrines/cooking system); OoT is the owner's favorite → self-verifiable.
  - **v14.6 — the "lighter extras"** (two workflows, run concurrently): **TotK per-region maps** (above) +
    **OoT Items-tab Compendium** (`gen-oot-compendium`, 12 agents + a bow-category resume → `compendium.json`,
    58 entries: 6 weapons · 6 bows · 3 shields · 9 wearables · 26 items/spells/upgrades · 8 masks). assemble-oot
    folds `compendium.json` → COMPENDIUM → the OoT Items tab is now `CompendiumView` (was the auto-pouch);
    CompendiumView gained **Items + Masks** category columns (additive — BotW/TotK unaffected). **OoT is now
    fully at parity** (full quest + all reference tabs + trackers + catalog + game-appropriate tab set).
- **v15 — Majora's Mask as game 4 (DONE, at full OoT parity):** scaffolded + built out in one session, mirroring
  the OoT pattern exactly. `build/assemble-mm.mjs` (clone of assemble-oot) folds OPTIONAL `knowledge/mm/*.json`
  overlays into `app-data.json`, derives STATUS_RUNES (the 3 transformation masks + Ocarina), wires the **four
  Remains** (the "Stones & Medallions" analog → `terms.championsLabel:"Remains"`) to their boss-reward steps, and
  rebuilds guideSegs. `inline-data.mjs` wires `mm: MM`. Added a `mask` Glyph (also upgraded the Compendium Masks-
  column glyph for all games). The defining 3-day clock + transformation masks live in TIPS + Stuck hints + the
  walkthrough (no schema change). MM-appropriate **5-tab set** (Status·Journey·Items·Guide·Lore — no shrines/cook).
  - **v15.0** (scaffold): `knowledge/mm/{globals,walkthrough}.json` — terms (Heart Containers/hearts · Masks &
    Songs · Remains · Temple · **worldName:"Termina"**), CATS (mask/song/sword/shield/bow/item/key/material),
    CHAMPIONS = the 4 Remains, COLLECTIBLES (Masks 24 · Pieces of Heart 52). Hand-authored Clock Town opening
    (5 sections: the curse → Clock Tower Final Day → Song of Time reset → Song of Healing → Deku Mask) as the
    voice/shape anchor for the walkthrough workflow.
  - **v15.1** (full main quest): `gen-mm-walkthrough-workflow.mjs` (author→verify, 10 agents) → the 5 remaining
    chapters (Southern Swamp/Woodfall→Odolwa, Snowhead→Goht, Great Bay→Gyorg, Ikana/Stone Tower→Twinmold,
    the Moon→Majora). **6 chapters, 128 steps**, all 4 Remains granted-as-item + wired. Verifier caught real
    errors (Koume/Kotake swap, an invented "Tijo", the Great-Fairy-grants-Magic-Power-as-Deku nuance).
  - **v15.2** (Items compendium): `gen-mm-compendium-workflow.mjs` (10 agents) → `compendium.json`, **64 entries**
    (7 weapons · 5 bows/arrows · 2 shields · **all 24 masks** · 26 items) → the Items tab is now CompendiumView.
  - **v15.3** (depth): `gen-mm-depth-workflow.mjs` (author→verify, 36 agents) → 4 overlays → Guide tab at full
    parity (**Masks · Tips · Fairies · Quests · Enemies · Settings**): items-songs (64 = 24 masks + 13 songs +
    27 items), bestiary (24 enemies + 6 basics + 8 spliced boss/mini-boss guides incl. Majora's 3 forms), the
    5 Great Fairies, and 51 side quests across 4 groups (Bombers' Notebook & **Anju–Kafei**, Romani Ranch, the
    20 Masks, Minigames & Collectibles). **A transient 529 killed the Masks/bestiary authors mid-run;
    `resumeFromRunId` recovered them (battles/fairies/quests cached) — the documented fix held.**
  All v15 verified in-browser, 0 console errors, **no meta leaks** (merge scripts pick named fields only; MM is
  inlined wholesale like TotK/OoT, so the v13.2 lesson applies). Three cross-game copy fixes shipped alongside:
  the Enemies lede uses `worldName`; the Quests lede drops its shrine clause when a game has no shrines (also fixes
  OoT); the coach Great-Fairy card now says "a new power or upgrade" (correct for OoT spells AND MM magic/spin/sword).
- **v16 — A Link to the Past (SNES) + Link's Awakening (Game Boy) as games 5 & 6, + the console/era game shelf
  (DONE, both at full OoT/MM parity):** the owner asked to add the SNES/Game-Boy classics AND to better organize
  "how you get into the companion for each game" now that there are >4. Two halves, shipped as v16.0–16.5:
  - **v16.0 — the game shelf** (the organization ask): replaced the flat `game-pill` row with a dedicated,
    full-screen **`GameShelf`** overlay (portaled to body) that groups games by console (Switch · N64 · SNES ·
    Game Boy, newest first via `meta.consoleRank`) — each a rich card with an original-SVG **`GameCover`** emblem
    in the game's accent, title, console·year, and that game's own progress % (read straight from `<id>:progress`,
    since only the active game lives in component state). Reachable from a topbar **`● <short> ▾`** switch button
    + a Status **"Now playing"** banner (`GameSwitchTrigger`). New: a single-source **`META`** map in
    `inline-data.mjs` (console/consoleRank/year/era/accent/accent2/cover) injected as `.meta` onto every bundle.
  - **v16.1 — both shells scaffolded** (mirrors the MM v15.0 scaffold): `knowledge/{alttp,la}/{globals,walkthrough}.json`
    + `build/assemble-{alttp,la}.mjs` (clones of assemble-mm) + inline-data reads. ALttP = Hyrule's two worlds
    (terms Heart Containers/Items/**Pendants & Crystals**; CHAMPIONS = 3 Pendants + 7 Crystals; COLLECTIBLES Pieces
    of Heart 24 + Bottles 4). LA = **Koholint** (no Triforce/Ganon; terms **Instruments**; CHAMPIONS = the 8
    Instruments of the Sirens; COLLECTIBLES Pieces of Heart 12 + Secret Seashells 26 — web-verified). Each got a
    hand-authored opening chapter as the voice anchor. Both render at the OoT-style **5-tab set**
    (Status·Journey·Items·Guide·Lore — no shrines/cook).
  - **v16.2 / v16.3 — full main quests:** author→adversarial-verify Workflows (`build/wf-{alttp,la}-walkthrough.mjs`,
    web-sourced) → ALttP **13 chapters / 184 steps** (Eastern→Desert→Hera→Master Sword/Agahnim→7 crystal dungeons→
    Ganon's Tower), LA **10 chapters / 143 steps** (Tail Cave→…→Turtle Rock→the Wind Fish's Egg). All trophies +
    iconic items granted-as-item and wired (`build/merge-walkthrough.mjs` keeps the opening + asserts unique ids).
  - **v16.4 — depth:** `build/wf-{alttp,la}-depth.mjs` → 4 overlays each (items-songs · bestiary {basics+boss guides}
    · great-fairies · side-quests) via `build/merge-game-depth.mjs`. Both Guide tabs now **Items·Tips·Fairies·
    Quests·Enemies·Settings** (full parity). Also fixed a cross-game nit: the Combat-Basics header hardcoded "7"
    → dynamic `basics.length` (OoT/MM/ALttP/LA all have 6).
  - **v16.5 — Items-tab Compendium:** `build/wf-{alttp,la}-compendium.mjs` → ALttP **47** / LA **40** entries; the
    Items tab is now `CompendiumView` for both. **Fix:** CompendiumView's category `COLS` were hardcoded around
    BotW's `weapon` cat, so the classic cats `sword`/`key`/`song` rendered no column AND dropped those items (LA
    would've lost the 8 Instruments) — added Swords/Songs/Key-Items columns (empty ones auto-hide → BotW/OoT/MM
    unchanged) + show the `type` badge for stat-less entries.
  **Workflow lesson reinforced (the hard way again):** two HEAVY walkthrough workflows (~24 web-fetching agents,
  ~800k tokens each) run **concurrently** tripped server-side **529** and — because the pipeline drops an item when
  its verify stage throws — silently lost the un-verified chapters (ALttP kept 3/12, LA 5/9). `resumeFromRunId`
  recovered everything (cached authors returned instantly; only failed verifies re-ran) when run **one at a time**.
  Rule: heavy walkthrough workflows run SOLO; lighter depth/compendium (≤8 agents) are fine 2-up. Defensive tweak:
  depth/compendium verify stages now fall back to the author draft on failure (`v || draft`) so a dataset is never
  lost outright. All v16 verified in-browser (6 games grouped in the shelf, both classics' quests/guide/items
  render, MM/BotW unregressed, 0 console errors).
- **v17 — five more games to full parity (DONE): A Link Between Worlds (3DS) · The Wind Waker (GameCube) · The
  Minish Cap (GBA) · Oracle of Seasons + Oracle of Ages (GBC).** The owner picked these after the v16 classics; the
  companion went **6 → 11 games across 8 console groups**. Each followed the exact v16 rhythm — shell (globals +
  hand-authored opening + `assemble-<id>.mjs`, cloned via sed from assemble-albw) → **walkthrough Workflow (run
  SOLO)** → **depth + compendium Workflows (2-up)** → merge → build → verify → commit, ONE game at a time. New
  scripts: `build/wf-{albw,ww,minish,oos,ooa}-{walkthrough,depth,compendium}.mjs`. Per-game results:
  - **A Link Between Worlds** (v17.0–17.2): 13ch/192 steps (3 Pendants → Master Sword → 7 Sages in Lorule → Yuga
    Ganon; wall-merge + Ravio rental shop) · items 40 · enemies 22 (10 boss guides) · 5 fairies · 22 quests ·
    compendium 38. CHAMPIONS = 3 Pendants + 7 Sages (Sage→dungeon verified). COLLECTIBLES Pieces of Heart 28 + Maiamai 100.
  - **The Wind Waker** (v17.3–17.4): 10ch/145 steps (3 Pearls → Tower of the Gods/Master Sword → Forsaken Fortress
    → Earth/Wind Temples + the 2 Sages → Triforce hunt → Ganondorf; sailing + the Wind Waker baton) · items 37
    (all 6 songs) · enemies 24 (10 boss guides) · 8 Great Fairies · 19 quests · compendium 53. CHAMPIONS = 3 Pearls
    + Medli & Makar; Triforce Shards (8) as a collectible. Pieces of Heart 44.
  - **The Minish Cap** (v17.5–17.6): 7ch/104 steps (4 Element dungeons + Fortress of Winds + Dark Hyrule Castle;
    shrink-with-Ezlo + Kinstone fusion) · items 33 · enemies 25 (9 boss guides) · 3 Great Fairies · 19 quests ·
    compendium 38. CHAMPIONS = the 4 Elements. COLLECTIBLES Pieces of Heart 44 + Kinstone Fusions 100.
  - **Oracle of Seasons** (v17.7–17.8): 10ch/138 steps (8 Essence-of-Nature dungeons + Onox; Rod of Seasons +
    Subrosia + seeds) · items 35 · enemies 25 (14 boss guides) · 7 fairies/helpers · 21 quests · compendium 41.
    CHAMPIONS = 8 Essences of Nature. COLLECTIBLES Pieces of Heart 12 + Magic Rings 64.
  - **Oracle of Ages** (v17.9–17.10): 10ch/145 steps (8 Essence-of-Time dungeons + Veran; Harp of Ages time-travel)
    · items 38 · enemies 23 (9 boss guides) · 8 fairies/helpers · 13 quests · compendium 53. CHAMPIONS = 8 Essences
    of Time. COLLECTIBLES Pieces of Heart 12 + Magic Rings 64.
  All shells/openings + collectible totals + dungeon→item/trophy mappings were **web-verified up front**; every
  walkthrough/depth/compendium was **author→adversarial-verify** with a second-source web check. **Every SOLO
  walkthrough run had 0 failures** — the v16 "heavy workflows run SOLO" lesson held all five times. 5 new
  `GameCover` emblems (painting/sail/cap/season/harp); META re-ranked for the new consoles. All verified in-browser
  (11 games grouped, each at its game-appropriate tab set, 0 console errors, BotW/MM unregressed).
- **v17.12 — TotK shrine solutions (DONE): all 152.** Closed the single biggest remaining functional gap in the
  whole app. Every TotK shrine row now has a spoiler-gated `solution` Stuck-reveal and answer-first search payload,
  authored + adversarially verified (second-source web check). The big lesson: I first did it WRONG —
  one-agent-per-shrine (304 agents) AND two workflows launched at once → instant 529, 0 results. Rebuilt per
  AGENT_WORKFLOW.md: **batched ~12 region-coherent shrines/agent (38 agents) in ONE solo workflow** → 152/152,
  0 failures, ~2.45M tokens. `gen-totk-shrine-solutions-workflow.mjs` now emits the batched form (region-coherent
  chunks of ≤12, `args` = regionKeys for resume). Verified in-browser (reveal + global search render, 0 console
  errors, 0 meta leaks). **TotK is now FULLY at parity** with the deeply-built games.
- **v17.13 — TotK Items compendium (DONE) + app-wide gap audit.** Built the TotK compendium (478 entries, above),
  which was the last content gap. Ran a full **parity matrix + data-integrity audit across all 11 games** (duplicate
  step ids, CHAMPIONS/STATUS_RUNES wiring, side-quest slug collisions, meta leaks, compendium-cat→column coverage):
  **everything clean** — 0 dup ids, all trophies/runes wired, all 11 games' side-quest slugs unique, every compendium
  cat has a CompendiumView column. In-browser re-verified TotK (478-item Items tab) + spot-checked LA (Songs/Key-Items
  cats render) + BotW (7 tabs); 0 console errors across game switches.
- **v18 — "The Living Slate" (atmosphere layer; ADR 0011, STARTED).** With all content at parity, the owner asked
  to make the app "out of this world — futuristic, spectacular." North star: **stop describing Hyrule; finish
  building the Sheikah Slate itself** (an in-world device the player holds IRL). **v18.0** ships the first piece, an
  atmosphere layer that's **100% generated on-device** (so the offline/asset-clean law is untouched — `build.mjs`
  offline check still passes): (1) **`SlateAudio`** — a module-level singleton (outside React, survives the
  per-game remount) that boots a Web-Audio `AudioContext` on a user gesture and SYNTHESIZES a calm drone (chord
  morphs per tab) + pentatonic shimmer + boot arpeggio + check tick from oscillators — NO audio files; default OFF.
  (2) **`SlateBackground`** — a fixed `<canvas>` circuit field (drifting linked nodes) behind the app (z-index:0,
  pointer-events:none); JS reduced-motion guard paints a static frame; only mounted when Motion is on. (3)
  **Haptics** — guarded `navigator.vibrate(12)` on check-on (mobile only). Controls live in Guide→Settings ("The
  Living Slate": Ancient circuitry · Ambient sound · Haptic pulse) + a topbar speaker toggle; persisted in
  `hyrule:prefs` (`{spoiler, atmos:{motion,sound,haptics}}`); NOT in the backup blob (cosmetic, not progress). Two
  new Glyphs (sound/mute). Verified in-browser: circuit renders, toggles flip+persist+share state, motion mounts/
  unmounts the canvas, 0 console errors, build offline-clean. **Gotcha banked: `position:fixed;inset:0` does NOT
  stretch a `<canvas>`** (it's a replaced element with intrinsic 300×150) — needs explicit `width/height:100%`.
  **NEXT in this arc: the offline AI oracle ("Ask the Slate")** — an on-device LLM (WebLLM/WebGPU) RAG-grounded on
  the app's own JSON, voice in/out, loaded device-local via the [[ADR 0009]] IndexedDB pattern so the published
  artifact stays ~1 MB and asset-clean. (Bigger build; queued, owner greenlit the arc.)
- **v18.1 — "Ask the Slate" oracle, Phase 1 (DONE; ADR 0012).** A conversational, voice-capable companion you
  ask in plain language ("how do I beat a Lynel?", "fastest rupees?"). **Phase 1 ships the grounded RETRIEVAL
  oracle — 100% offline, asset-clean, in the build, no model.** `slateRetrieve()` tokenizes the question and
  ranks records across the app's OWN verified data (shrines+solutions · enemy battle guides · side-quest hows ·
  armor · cooking · COMPENDIUM · walkthrough stuck-hints · towers · ECONOMY/Money) → a best answer + related,
  each deep-linked. **Honesty law is structural: it only retrieves, never generates — no match ⇒ it says so**
  ("I won't guess"). `SlateOracle` overlay (portaled, safe-area) with **SpeechSynthesis** read-aloud +
  **SpeechRecognition** voice-in (online-assisted; typing always offline); data-derived suggestion chips
  guarantee strong first hits. Entry: topbar ✦ (`spark` glyph) + `mic` glyph. **Phase 2 (planned, ADR 0012):**
  opt-in on-device LLM (WebLLM `@mlc-ai/web-llm@0.2.84` via runtime `import("https://esm.run/...")`, model cached
  to Cache API/IndexedDB → offline after a one-time download; WebGPU-gated, iOS 26+) that SYNTHESIZES over the
  Phase-1 retrieval (RAG grounding, cite-or-refuse) — device-local per [[ADR 0009]] so the build stays asset-clean;
  the dynamic `import()` is a runtime request so the offline check still passes (verify vs build.mjs first).
  **Topbar gotcha fixed:** adding a 5th control overflowed narrow phones → brand now `min-width:0`/shrinks,
  `topbar-r` is `flex-shrink:0`, and ≤430px shows the **eye logo only** (hide `.brand>div`) — clean, not a
  clipped "H.". Verified in-browser (grounded answers, money fix, honest no-match, voice buttons, mobile topbar,
  0 console errors, offline-clean).
- **v18.2 — "Ask the Slate" Phase 2: the opt-in on-device LLM (DONE; ADR 0012, pending on-device verification).**
  `SlateLLM` = a module-level singleton (outside React, survives remount): on opt-in it dynamically
  `import(SLATE_LLM_CDN)` (`https://esm.run/@mlc-ai/web-llm@0.2.84`), requests `navigator.storage.persist()`, picks a
  small prebuilt model (`SLATE_LLM_PREFER` → `Llama-3.2-1B-Instruct-q4f16_1-MLC`; **falls back to whatever's in
  `lib.prebuiltAppConfig.model_list` so a model-id drift can't brick it**), `CreateMLCEngine(initProgressCallback)`,
  caches weights (Cache API/IndexedDB) → offline after one download. `ask()` feeds Phase-1's top ~4 retrieved
  records as context + a **grounding system prompt (use ONLY these entries; say you don't know otherwise; cite
  them)** → `engine.chat.completions.create({stream:true})` → streams a synthesized answer. The oracle shows a
  brain bar (Enable → progress% → ready / unsupported / error+Retry), a purple **"Slate AI"** answer card with a
  **Sources** list (the records), and **degrades to Phase-1 whenever the brain is off/loading/unsupported/errored**
  (`{(!llm||llm.error) && <Phase1 card>}`). Opt-in persisted `hyrule:slatebrain` (auto-loads from cache next open).
  **Offline law held:** the dynamic `import()` is NOT a static `src/href`, so the build's offline check passes
  (esm.run counts as 1 inert string literal); **first load fetches nothing** — confirmed in-browser via the network
  panel (zero external hosts at load/ask). WebGPU feature-gated (`navigator.gpu`; iOS 26+/Chrome). **esbuild runs
  in TRANSFORM mode (`--jsx=transform`, no `--bundle`), so `import(variable)` passes through to a runtime import —
  the load-bearing reason this works in a single-file build.** Verified: enable button (WebGPU present), Phase-1
  fallback, 0 console errors, offline-clean. **NOT verifiable in the headless sandbox: the real 0.9 GB download +
  inference — needs a WebGPU device; `try/catch` makes any failure fall back to Phase-1.**
- **v18.3 — Ask-the-Slate polish: model-size chooser + intent-aware retrieval.** (1) **Two model tiers** via
  `SLATE_LLM_TIERS` — **Balanced** (~0.9 GB, Llama-3.2-1B) and **Light** (~0.4 GB, prefers Qwen2.5-0.5B / SmolLM2-360M,
  smallest-instruct fallback). The idle brain bar offers BOTH as a chooser; `enableBrain(tier)` persists
  `hyrule:slatemodel`; a "Switch to Light/Balanced" link on the ready bar calls `SlateLLM.reload(tier)`
  (`engine.unload()` → re-`boot()`); auto-load reads the saved tier. (2) **Intent boost in `slateRetrieve`:** the raw
  question is scanned for verb/topic words (cook/recipe/cold · beat/defeat · rupee/earn/sell · farm · armor · quest ·
  tower) and the matching category gets a score bonus — fixes "what should I cook for cold resistance" returning a
  cold-region *shrine* instead of the Spicy recipe (the intent word "cook" is a stop-word for token-matching but
  still routes the category). Verified in-browser: chooser renders, cook→Cooking, beat→Enemy, rupees→Money, Phase-1
  fallback, mobile layout, 0 console errors, offline-clean.
- **v18.4 — Ask-the-Slate STABILITY pass (from real-device testing on iPhone).** The owner tested on an installed
  iOS PWA: the **Balanced 1B model crashed the Safari tab (OOM)**, and because the oracle **auto-loaded on every
  open**, it became a **crash loop** (open AI → auto-load too-big model → tab dies → back to Status); the **mic
  hard-froze the screen** (iOS home-screen-app SpeechRecognition + main-thread inference). Fixes: **(1) inference now
  runs in a Web Worker** — `boot()` builds a blob module-worker (`new webllm.WebWorkerMLCEngineHandler()`) +
  `CreateWebWorkerMLCEngine`, with a try/catch fallback to main-thread `CreateMLCEngine`; keeps the UI responsive.
  **(2) NO auto-load** — removed the on-open `SlateLLM.load()`; the player taps to start each session (kills the
  crash loop). **(3) Default to Light, recommended-first; Balanced marked "can be heavy on phones."** **(4) Recovery:
  `SlateLLM.forget()` (unload engine + terminate worker → idle) wired to a "Turn off" button on the ready/error
  bars; error copy now says "may have run out of memory — try Light."** **(5) cache-load label** ("Loading from your
  device…" when `prog.text` mentions cache, vs "Downloading…"). **(6) mic hidden in iOS installed PWA**
  (`navigator.standalone === true` → `canMic=false`; typing always works) + a 10s safety auto-stop timeout.
  `reload()` also terminates the old worker. Verified in-browser: prior-opt-in no longer auto-loads (idle + chooser),
  Light-first chooser, Phase-1 fallback, 0 console errors, offline-clean. **Still owner-on-device to confirm: that
  the Light model now loads + runs in the worker without OOM.** New persisted value `hyrule:slatebrain` can be "0".
- **v18.5 — Ask-the-Slate answer-quality fix (Light works on iPhone; the answer was wrong).** Owner confirmed the
  **Light model loads + runs (no crash)** but an answer was wrong + overstated: "where do I get warm clothes" → "the
  ONLY place is a shrine" (false — Snowquill is bought in Rito Village; Warm Doublet is free on the Plateau). Root
  cause was **retrieval, not the model**: a vocabulary gap — the player says "warm clothes," the data says "cold
  resistance / Snowquill / armor," so keyword retrieval only matched a cold-region shrine and fed THAT to the LLM.
  Fixes: **(1) `SLATE_SYN` synonym expansion** in `slateRetrieve` — query words expand to the data's vocabulary
  (warm→cold resistance/snowquill/warm doublet; clothes→armor/tunic/doublet; hot→heat resistance/fireproof;
  shock→rubber; etc.), matched at a lower weight so concept queries surface the right records. **(2) Armor intent
  boost widened** (clothes/clothing/wear/warm/gear). **(3) hardened LLM grounding prompt** — answer ONLY from the
  records, give MULTIPLE options when present, and **NEVER say "the only / always / never" unless a record says so**;
  temp 0.3→0.2. **(4)** an "AI summary — the Sources below are the verified truth" note under AI answers, and
  **(5) Balanced hidden in the installed iPhone app** (`navigator.standalone`) since it reliably OOMs there (note
  shown). Verified in-browser: "where do I get warm clothes" now tops **Snowquill Set** (Rito Village) with **Warm
  Doublet** + "Stay Warm First" in related — both correct sources now feed the LLM. 0 console errors, offline-clean.
  **Lesson: a grounded LLM is only as good as retrieval; for an offline keyword index, a small hand-tuned synonym map
  is the cheap fix for the player-word↔data-word gap (true semantic search would need an embedding model).**
- **v18.6 — Ask-the-Slate "truth-first" redesign (the tiny model hallucinated even with good sources).** Real-device
  screenshots showed the 0.5B Light model **ignoring correct retrieved records and inventing facts** ("warm clothes →
  buy at the Ventest Boutique in Hateno"; "not die from lightning → use a sturdy shield" — DANGEROUS; "buy it at the
  Shrine to Quomo"). No prompt-tuning fixes a model that small ignoring its grounding, so the fix is **structural**:
  **(1) the verified, sourced retrieval record is now ALWAYS the headline answer** (was replaced by the AI) — the AI
  is demoted to a small, clearly-labeled "In plain words · AI — may be imperfect; trust the answer above" paraphrase
  BELOW it. **(2) Voice reads the VERIFIED answer**, not the AI. **(3) AI is gated** — only runs when the top
  retrieval score ≥ 4 (no confabulating on weak matches; on a miss → the honest "couldn't find" card). **(4) Retrieval
  coverage + word-gap fixes:** indexed **TIPS + BESTIARY.basics** (were invisible); stop-worded noise (die/death/
  survive/avoid/not); widened `SLATE_SYN` (lightning→rubber/electric/thunderstorm/metal; stamina&hearts→spirit orb/
  goddess statue/vessel; warm→cold resistance/snowquill); added a shock/lightning intent boost; **dedupe results by
  cat+label.** Verified in-browser: "warm clothes"→**Snowquill Set** (Rito Village), "stay warm"→Snowquill, "not die
  from lightning"→**Rubber Set** (electric immunity — safe), "more stamina"→**Spirit Orb→Goddess Statue** — all
  correct verified headlines now. 0 console errors, offline-clean. **Lesson banked: a sub-1B on-device model can't be
  trusted to stay grounded for facts — make the retrieved record the answer and treat the LLM as an optional,
  clearly-labeled rephrase, never the source of truth. Whack-a-mole word-gaps are bounded by a hand-tuned synonym map;
  true semantic search (embeddings) is the heavier alternative if needed.**
- **v19 — "The Slate Map": a real, accurate, datamined map of Hyrule (BotW; DONE).** The owner's complaint was
  blunt and correct: the maps "still aren't good enough" — inaccurate and ugly. Root cause was **structural, not
  cosmetic**: every coordinate in the app was *eyeballed* — `MAP_NODES` region circles hand-placed, and the per-region
  `region-maps.json` shrine dots agent-guessed on **disconnected 0–100 grids** — so nothing lined up with the in-game
  map and it read as 15 unrelated diagrams. Fixed BOTH axes:
  - **Accuracy = real datamined coords.** New `knowledge/map-coords.json` (built by `build/gen-map-coords.mjs` from
    the committed slim `build/map-coords-src.json`) holds true in-game world coords **[X,Z]** (X east+, Z south+) for
    **120 shrines + 15 towers** (extracted from AceZephyr/botw-route-map `data.js` — datamined; shrine names matched
    **1:1 to shrines.json, 0 mismatches**), **4 Great Fairies** (`Npc_DressFairy_*`), **4 Divine Beasts** (`Remains*`),
    **Hyrule Castle** (`Grudge_HyruleCastle`) — all from the objmap actor dump. **+7 towns** anchored on their in-town
    datamined shrine, **+15 stables** (`TwnObj_StableHostel_A_01` coords, named by region+nearest-tower). Coordinates
    are GAME FACTS (no Nintendo art → ADR 0003 intact). One coherent frame + per-region centroids/bounds drive
    everything. Validation gate: all 120 shrines fall nearest their own curated region centroid. **Key lesson: the
    accuracy fix was DATA, not art — datamined coords exist and are the right source; an LLM coordinate-research
    workflow would have hallucinated numbers (we nearly built one). Mine the data, don't ask a model for it.**
  - **Graphics + usefulness = a real map.** New `SlateMap` (full-screen portaled overlay): an original **holographic
    Sheikah scan** — computed convex-hull coastline (glow), soft region zones + labels, terrain anchors
    (volcano/lake/castle) — with **pan + pinch/scroll zoom** (rAF-committed `view` state; markers inverse-scaled to
    stay constant on screen; manual tap hit-test so drag/tap never conflict), **search fly-to**, **layer toggles**,
    **tap-a-shrine → card** (mark cleared + spoiler-gated solution via `StuckReveal` + open-in-list), and the beloved
    **"I'm here" pin made SPATIAL** — drop it anywhere, recenter button (`<game>:mappin`, backup blob **v9→v10**).
    `MapPreview` (Status) + `RegionMiniMap` (Shrines, numbered to the list) reuse the same `mapDims()` frame and
    **replace the old eyeballed `HyruleMap`/`RegionMap` for BotW**. Topbar **map button**; Glyphs `map`/`target`.
  - **Degrades cleanly (TotK = canary):** `MAP_COORDS` is now in the **`const {…}=G` destructure** (the bug I shipped
    then caught: without it, the component fell back to the module-level BotW `MAP_COORDS` global and TotK wrongly got
    a map). Games without coords hide the button + fall back to the old overview map. **Rule reinforced: a BotW-only
    dataset MUST be destructured from G so it shadows per-game — a bare module global leaks into every game.**
  - Verified in-browser (regions/beasts/fairies/castle/towns all correctly placed, fly-to+card+solution+cleared-sync+
    pin-drop work, TotK degrades, **0 console errors, offline-clean**). **NEXT (queued): replicate to TotK** — same
    pipeline, needs TotK's datamined shrine/tower coords (152 shrines) into `knowledge/totk/map-coords.json`.
- **v20 — Slate Map gets REAL terrain (BotW; DONE).** Owner feedback on v19: accuracy was there but it still
  "looked the same" — glowing dots + lines, no relief; zoomed-in labels were tiny/unreadable; couldn't zoom out far
  enough (edges jammed to the phone sides). He shared a reference of the actual hand-painted BotW map for the *look*
  (can't embed it — Nintendo art; ADR 0003). Rebuilt the renderer **SVG → Canvas** and added an ORIGINAL,
  on-device-generated **terrain engine** (`buildTerrain`, cached): biome colour wash per region (snow Hebra/Tabantha,
  sand Gerudo, volcanic Eldin + a Death-Mountain glow, autumn Akkala, jungle Faron, grass central, etc.), procedural
  **hill-shading** (value-noise fbm + a NW light, low-res→upscaled soft-light = "hills"), forest dapple, Lake Hylia,
  coast glow + coastline — rendered ONCE to an offscreen canvas, then one `drawImage` into the live map at any
  pan/zoom (rich AND fast; ~2400px offscreen). Markers/labels draw on the same canvas in **screen px**, so: **labels
  are a constant readable size at every zoom** (the v19 bug was inverse-scaling to ~5px), haloed for contrast on any
  biome, and **shrine NAMES appear once you zoom into a region** (like the reference). Transform is now screen-space
  (`k` = px/world-unit); **zoom-out floor is `fitK*0.7`** so the whole map sits with margin on all sides (was clamped
  at fit-to-width). MapPreview (Status) is a matching terrain canvas; RegionMiniMap stays SVG. Kept all v19 interactivity
  (pan/pinch/wheel, tap-shrine→card+solution, search fly-to, layer chips, spatial pin) — re-verified on canvas
  (tap/card/mark-cleared/pin-drop/persist, TotK degrades, **0 console errors, offline-clean**). **Lessons: (1) for a
  real terrain map use Canvas, not SVG dots — biome fills + value-noise hill-shade read as a world. (2) inside an
  SVG `<g scale(k)>`, `fontSize*(1/k)` is constant in VIEWBOX units = tiny on screen; size labels in real screen px
  (canvas) or `screenPx/(base*k)`. (3) the offscreen-terrain + one-drawImage pattern keeps a rich map at 60fps.**
- **v21 — Slate Map: bring-your-own real map + everything clickable + fixes (BotW; DONE).** Owner (frustrated)
  wanted the ACTUAL game map ("look exactly the same"), every point clickable like shrines, and flagged two bugs
  (couldn't pan to the bottom edge when zoomed; the "I'm here" pin wasn't placing). The copyright line held but the
  resolution is the **[[ADR 0009]] pattern** (already used for the Bookshelf): the published build ships ZERO
  Nintendo art, but the owner can **import their OWN map image** into device-local IndexedDB (`mapDB`, new db
  `hyrule-map`, keyed per game) — never uploaded, never in the repo/build — and the Slate Map overlays the accurate,
  clickable markers on it. (We do NOT download/embed the image ourselves; the user provides the file.)
  - **Content-space refactor:** SlateMap now renders a unified "content" (the generated terrain OR the imported
    image) via `{a,b,c,d,MW,MH,src}`; `W2C`/`C2W` map world↔content px. Imported images get a **2-tap calibration**
    ("Align" → tap Great Plateau Tower, then Akkala Tower → solves a/b/c/d, persisted `<game>:mapcal`) so markers
    land exactly on the user's map. Controls: Use-my-own / Align / Replace / Remove. Image labels are suppressed in
    image mode (the map already has them); markers stay as the clickable layer.
  - **Everything clickable:** `handleTap` now hit-tests ALL layers (shrines · towers · fairies · beasts · towns ·
    stables) → a type-aware card. Towers/fairies enriched from TOWERS/GREAT_FAIRIES (location + climb tip / cost).
    Every card has an **"I'm here"** button that drops the pin exactly on that marker (the reliable fix for "the GPS
    wasn't working" — placing-mode tap also works, now with a clear banner + a looser 12px tap tolerance).
  - **Bug fixes:** pan **clamp got overscroll padding** (`P = min(W,H)*0.5`) so the bottom edge clears the bottom
    chrome (chips/controls) — was hard-clamped at the screen edge; **zoom-out floor lowered to `fitK*0.6`**.
  - Verified in-browser: tower/fairy/etc cards open, "I'm here" sets the pin on the marker, a synthetic image
    imports + aligns + renders as the base with markers overlaid + Remove restores terrain, pan reaches the south
    edge, TotK degrades, **0 console errors, offline-clean**. **Lesson: the copyright tension on user-supplied
    assets is always resolved by the ADR 0009 shape — ship no asset, let the owner import their own to device-local
    IndexedDB, overlay our original work on top. Don't fetch/embed it for them.**
- **v22 — Slate Map multi-point alignment + bring-your-own MUSIC (DONE).** Two owner asks: (1) line our markers up
  *exactly* on their imported custom map (a fan-made, Nintendo-derivative map — held the line: not embedded/committed,
  but it's already device-local via v21, so the fix is a better align tool, not redistribution); (2) the synthesized
  hum is "terrible" — let them import their own background track, same as the map.
  - **Multi-point alignment:** calibration upgraded from a 2-tap axis-aligned fit to an **N-point least-squares
    AFFINE** `m=[a,b,c,d,e,f]` (`fitAffine`+`solve3`) that corrects scale, offset AND **rotation/skew** — so markers
    snap tightly onto a custom map even if it's slightly turned. Align mode now cycles spread reference towers
    (Great Plateau · Akkala · Gerudo · Hebra · Lanayru · …); the owner taps the ones they can find, **Skip**/**Apply
    (≥2)**/**Cancel**; ≥3 → full affine, 2 → axis-aligned fallback. SlateMap's `content.m` + `W2C`/`C2W` are now the
    6-param affine (terrain uses the identity-scale form). Persisted `<game>:mapcal` is now `{m:[6]}`.
  - **Bring-your-own music:** `audioDB` (new IndexedDB db `hyrule-audio`, store `track`) + `SlateMusic` module
    singleton (an `Audio` element, `loop`, gesture-started). Settings → Ambient sound gains **Use my own background
    music / Replace / Remove (back to hum)**. The sound toggle (Settings + topbar) now routes: a custom track loops
    if imported, else the synthesized `SlateAudio` hum (`SlateAudio.disable()` when music is on; scene-morph only
    applies to the synth). Track is device-local, never uploaded/committed (ADR 0009). Persists across reloads.
  - Verified in-browser: 3-point align computed a 6-param affine with non-zero cross-terms (rotation captured);
    audio imports → "Your own track is loaded" → toggle routes to it → Remove restores the hum; default terrain +
    all-clickable markers + pin unaffected; **0 console errors, offline-clean.** (Actual audio playout isn't
    observable headless — autoplay/no-device — but the wiring + try/catch guards are in place; plays on the owner's
    device on the toggle gesture.)
  - **Lesson reinforced: every "use my own X" (map image, music, books) resolves to the SAME ADR 0009 shape —
    device-local IndexedDB + a module singleton/overlay; ship no copyrighted asset, never fetch/embed it for them.
    And for fitting user-supplied imagery, a least-squares affine from a few reference taps beats a rigid 2-point fit.**
- **v23 — the Jukebox: multiple custom songs (DONE).** Extended the v22 single custom track into a playlist. `audioDB`
  now stores many blobs (keyed by generated track id); the index `[{id,name}]` rides in `hyrule:music` + current id in
  `hyrule:musiccur` (the old single `"track"` key auto-migrates into the list). `SlateMusic` gained `setLoop` (loop when
  one track, else `setOnEnded`→auto-advance) and the play-on-next-gesture retry from v22.1. Settings → Ambient sound is
  now a **Jukebox**: add many MP3/M4A files (`multiple`), each a row (play indicator · name · remove), tap to play,
  Prev/Next, auto-advance at track end; the sound toggle still routes jukebox(if any) vs the synth hum. Importing the
  FIRST song auto-plays; later adds don't interrupt what's playing. Device-local (ADR 0009). Verified in-browser
  (add 2 → select/next/remove all correct, 0 errors, offline-clean). **The honest YouTube-walkthrough idea (play the
  clip of a shrine from a long playthrough video) is QUEUED, not built — the only legitimate path is the official
  YouTube IFrame embed deep-linked to a timestamp (NOT ripping/redistributing), which is online-only + opt-in (like the
  AI oracle), and needs a shrine→timestamp map the owner supplies (capture-current-time while watching, or the video's
  chapter list). Awaiting owner's go + how they want to populate timestamps.**
- **Biggest remaining CONTENT build: NONE.** Every game is at its game-appropriate parity. Open-ended arcs:
  **(a)** the Living/Thinking Slate (v18 atmosphere shipped; AI oracle + 3D map/galaxy + generative Chronicle
  queued) and **(b) Lore** era-chapters for the newer games (needs the writers'-room workflow + the no-AI-slop bar —
  vet a sample before scaling, owner's standing guidance, [[zelda-lore-no-ai-slop]]).
