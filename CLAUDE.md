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

## The games (multi-game as of v8)
Two games now live behind a **game picker** (Status tab): **Breath of the Wild** and **Tears of the Kingdom**.
`GAMES = { botw, totk }` (built by `inline-data.mjs`); the `HyruleCompanion` wrapper owns the active game and
remounts `<HyruleGame key={game}>`, which shadows the data globals with `GAMES[game]` and namespaces storage
(`botw:*` / `totk:*`). Per-game `terms`/`guideSegs`/`postRegionId` adapt labels + surfaces; missing datasets
degrade gracefully (TotK v1 has no maps/fairies/towers/quests/koroks). OoT etc. would slot in the same way.
See ADR 0005. TotK data: `knowledge/totk/` (assembled by `build/assemble-totk.mjs`).

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
- **Status panels** key off specific step IDs: `STATUS_RUNES` (rune→step), `CHAMPIONS` (ability→step). Wire new
  beasts/runes here.
- **Persistence keys**: `botw:progress` (JSON stepId→true — also holds tracker toggles `shr_* gf_* arm_* sq_*`
  and the memory steps `m_l*`), `botw:ui` (tab/region/openSections/guideSub), `botw:koroks` (int), `botw:notes`
  (id→text), `botw:armortier` (set-index→0..4), `botw:recipes` (v10 saved-cooking array). The `store` helper uses
  `window.storage` if present (Claude artifact) **and falls back to `localStorage`** (standalone/phone). Backup =
  base64 of `{progress,koroks,notes,armorTier,recipes}` (blob v7).
  Counters use the functional updater `setKoroks(k=>…)` (stale-closure guard).
  Lore/reader state is top-level `hyrule:reading`/`hyrule:bookmarks`/`hyrule:readerprefs`/`hyrule:loreart`.
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

## Tabs & features (v6–v12)
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
- **Next (TotK depth):** TotK per-region + overview maps (`TOTK_MAP_NODES` + a coords pass); TotK fairies/
  towers/side-quests/Korok datasets → enable those Guide segments; orb panel sourced from `shrineStats`; a TotK
  **"Stuck?" sweep** + a **TotK cooking table** (same `CookView`/engine). **Beyond:** Ocarina of Time as game 3
  (same `GAMES` slot-in) — the user's favorite, beaten many times, so each step is self-verifiable.
