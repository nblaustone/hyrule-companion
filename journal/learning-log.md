# Hyrule Companion — learning log

Append-only. Read this first on each session so reasoning accumulates and we never re-derive a settled call or
re-make a rejected one. Newest at top.

---

## 2026-06-15 — v7: per-region maps (map phase 2) + the iOS-refresh support answer

- **Support, not code, first:** Nathan couldn't refresh the Home Screen web app. Explained the standalone-mode
  reality (no reload button; GitHub Pages `max-age=600`): **force-quit + reopen** is the lever; data is NOT lost
  by reopening (localStorage is origin-keyed, IDs are stable per ADR 0002); deleting the icon is the only real
  risk, so **back up first** (the v6 backup code). Offered a service worker (declined-for-now "true offline")
  as the proper long-term update mechanism if the friction persists.
- **Per-region maps** (the agreed map phase 2): a `botw-region-coords` workflow (15 agents, one per region)
  placed each region's shrines + tower + Great Fairy + 2–5 landmarks on a relative 0–100 grid (north-up),
  web-checked. Output → `knowledge/region-maps.json` (assembly clamps to 5–95 and nudges exact overlaps;
  **0 coverage gaps, 0 overlaps**). `RegionMap` renders a per-region schematic inside each expanded Shrines
  group: **numbered dots** (cyan=cleared, tap to toggle) that match numbered list rows, a Tower marker, the
  fairy, and faint labeled landmarks. Verified all 15 regions render the right dot count (Plateau 4 … Hebra 13
  … Gerudo Desert 12); even Hebra's 13 lay out readably. Map dots and the list share the same `shr_*` ids, so a
  tap on either updates both. Coordinates are honest schematic placements (no Nintendo map tiles, ADR 0003).
- **`args` gotcha:** the coord workflow first crashed with `pipeline() expects an array` — the Workflow `args`
  global didn't arrive as the array I passed. Fix: inline the region/shrine list as a `const` in the script
  instead of relying on `args`. (Lesson: for Workflow data, embedding in the script is more reliable than `args`.)

---

## 2026-06-15 — v6: map, four trackers, and QoL (driven by Nathan playing it on his phone)

- **What prompted it:** Nathan installed v5 on his phone and gave field feedback. Confirmed answers first
  (no edits until he okayed): updates are auto (same GitHub Pages URL/icon, refetches on open) and **progress
  is NOT lost on update** — `localStorage` is keyed to the origin, not the file, and the additive-ID rule
  (ADR 0002) means we never orphan checkmarks. Then we brainstormed and he picked: full Hyrule map → per-region
  maps; all four trackers; export/notes/global-search; stay on BotW.
- **Two confirmed fixes shipped first** (so his phone stopped looking cramped): the topbar now pads with
  `env(safe-area-inset-top)` so the title clears the iPhone status bar; added the **Traveler's Sword**
  (Stalkoblins drop it at night near Oman Au — a real gap he caught).
- **Full Hyrule map** (`HyruleMap`, Status tab): original schematic of the 15 shrine regions positioned
  geographically, each a node with a **progress ring** (shrines cleared), a faint landmass, beast labels, and a
  Ganon/castle marker. Tap a region → jumps to its shrine group. All original art (ADR 0003). Per-region maps
  are the deferred phase 2.
- **Four trackers**, all folded into the existing `progress` map (boolean ids) so Reset clears them and backup
  captures them: shrines (`shr_*`, already), Great Fairies (`gf_*`) + armor owned (`arm_*`) with a tier stepper
  (`botw:armortier`), side quests (`sq_<region>_<i>`), memories (existing `m_l*` steps), and a Korok counter
  (`botw:koroks`, **functional `setKoroks(k=>…)`** — a synchronous double-tap test exposed a stale-closure bug
  with `setKoroks(koroks+5)`; the updater form is mandatory here). A Status "Collectibles" panel meters them.
- **QoL:** export/import a base64 save code (`BackupBox`, offline backup — the ADR-0002-honest alternative to a
  server); per-step/shrine **notes** (`botw:notes`, a `NoteAffordance` in the step/shrine body); and a **global
  search** overlay (topbar magnifier) across walkthrough/shrines/armor/enemies/quests/cooking/towers that jumps
  to the result.
- **Lesson — never surface an agent's `notes` field** (already learned in v5, reaffirmed): all user-facing copy
  is typed/structured data; free-text agent notes are backstage.
- New persistence keys: `botw:koroks` · `botw:notes` · `botw:armortier` (joined `botw:progress` + `botw:ui`).
  Verified in-browser: 7 tabs (well, 6 + search overlay), 9 guide segments, map jumps, trackers persist, notes
  save, search navigates — zero console errors. Hosted at github.com/nblaustone/hyrule-companion (Pages /docs).

---

## 2026-06-15 — v5 landed: 120 shrines wired, app shipped, verified in-browser

- **The honest-sourcing chain paid off — twice.** The research workflow (41 agents) returned 128 shrines / 15
  towers / **5** fairies — and the **completeness audit caught it**: BotW's southwest is *two* tower regions
  (Gerudo + Wasteland), so two agents enumerated the same desert → a 12-shrine duplicate + a duplicate Tera
  fairy; Mozo Shenno was double-filed; the Gerudo Highlands shrines were missing. A web-verified fix agent
  rebuilt the desert split (Highlands 6 + Desert 12) and returned authoritative per-region counts summing to 120.
- **The 121st was a DLC shrine in disguise.** After fixing the desert, assembly still showed 121. The extra was
  **Shira Gomar** in Hyrule Ridge — the research agent had *honestly labeled* it "EX Champion Revali's Song (The
  Champions' Ballad DLC)". Because we keep provenance instead of confident bare facts, a `grep` found it; it's a
  DLC shrine, not one of the 120, so it's excluded. `build/assemble-knowledge.mjs` now reconciles to exactly
  **120 / 15 / 4, 0 duplicate names** and refuses to write if it doesn't (the mechanical honesty gate).
- **Don't render agent `notes`.** The verifiers' `notes` fields are correction logs ("CORRECTIONS made after web
  verification…", with literal `\n`). One leaked into the Armor view as the lede. Fix: `build/inline-data.mjs`
  strips `notes`/`confidence`/`changes` from the inlined app data (kept in `knowledge/` for provenance). Lesson:
  treat any free-text `notes` from a research agent as backstage, never UI copy — only the typed/structured
  fields are user-facing.
- **Shipped + verified in a real browser** (preview, localStorage path, no `window.storage`): 6 tabs
  (Status · Journey · **Shrines** · Items · Cook · Guide); the Shrines tab tracks all 120 (meter + Spirit-Orb
  math, region-grouped, searchable, persists); Guide is a 9-segment hub (Runes · Tips · Armor · Fairies ·
  Towers · Quests · Enemies · Koroks · World); Cook gained go-to recipes + dragon parts; Status gained a Shrines
  panel. Zero console errors; offline check passes; progress survives reload.
- **Pipeline is reproducible:** `assemble-knowledge.mjs` (research → clean knowledge/) → `inline-data.mjs`
  (knowledge/ → inlined GEN:DATA block in the .jsx) → `build.mjs` (.jsx → offline index.html). Re-runnable.

---

## 2026-06-15 — v5: the brain, the phone build, and the deep-content sweep

- **Why this session exists.** The app (v4) was a strong, sourced BotW main-quest walkthrough — but it only ran
  inside a **Claude artifact** (it used `window.storage`, which a normal browser doesn't have, and pulled fonts
  from a CDN). So it couldn't actually live on Nathan's phone, which is the whole point. Nathan also wanted (a) a
  proper **repo brain** like his other projects, and (b) **far more game detail "in all of its parts."**
- **The brain.** Stood up `CLAUDE.md` (spine), this log, and ADRs 0001–0005, mirroring the `brain/` family's
  conventions (three laws: don't-invent / additive / repo-is-the-memory). Kept the original `PROGRESS.md` as the
  v1–v4 continuity doc rather than deleting it (additive law). `knowledge/` holds verified research output.
- **Getting it on the phone (the #1 ask).** Decided: keep the `.jsx` as the source of truth, and add a **build**
  (`build/build.mjs`, esbuild) that emits one **self-contained, offline `index.html`** — React inlined, styles
  inlined, no external request — that uses `localStorage` and supports iOS "Add to Home Screen." The `store`
  adapter now prefers `window.storage` (artifact) and falls back to `localStorage` (phone), so ONE source serves
  both. See ADRs 0002 + 0004. The offline guarantee is mechanical: a built file with any `http(s)://` or
  `@import url(` in it is a bug.
- **Deep content via agents.** Launched a research **Workflow** (`botw-research`, run wf_426b04f1-8fb): one agent
  per the **15 Sheikah-Tower regions** (each enumerates its shrines + tower + any Great Fairy + side quests),
  plus global agents for armor, bestiary, cooking, koroks, and world-systems. Each draft is **adversarially
  verified** (a skeptic returns the corrected dataset), then a **completeness audit** checks the union reconciles
  to **120 shrines / 15 towers / 4 Great Fairies** — the honest tripwire against a short or invented roster.
  Output lands in `knowledge/` and is inlined into the app.
- **House decision carried over from v4:** duplicates are real, not bugs (3 Traveler's Bows on the Plateau);
  one cooking effect per dish; original art only. All still law (ADR 0003).

### Open threads for next time
- After the research lands: integrate Shrines (trackable, feeds the orb tracker), Armor + Great Fairy upgrades,
  Towers, Side Quests, Bestiary, deeper Cooking into the app UI; then rebuild + verify on a phone viewport.
- Consider an **export/import progress** string (the offline-honest alternative to cloud sync, ADR 0002).
- The `GAMES` multi-game wrapper stays deferred until game 2 (ADR 0005).
