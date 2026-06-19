# Hyrule Companion — learning log

Append-only. Read this first on each session so reasoning accumulates and we never re-derive a settled call or
re-make a rejected one. Newest at top.

---

## 2026-06-18 — v12.2: reader polish — the fixed-overlay/containing-block trap

- **Smoke test from the user (playing with his son): the book reader was glitchy** — "the bottom bar
  floats in the middle," stray page scrolling. Reproduced in the preview and measured: the reader was
  `position:static; min-height:calc(100vh-52px)` so its own footer fell *below* the viewport and behind
  the fixed `.tabbar`, and the page scrolled. The LoreReader had the identical latent bug (footer behind
  the tab bar) — fixed both.
- **Two CSS gotchas, stacked, both about `position:fixed` not meaning "relative to the viewport":**
  1. **Containing block:** `.body` (the tab-content wrapper) ran a `fadeIn` that animated
     `transform:translateY(3px)`. *Any* transform on an ancestor makes it the containing block for a
     fixed descendant — so the reader's `top:0` resolved to `.body`'s top (y=103), not the viewport.
     Fix: made the fade **opacity-only** (a transform on the main content wrapper will silently break any
     fixed overlay inside it).
  2. **Stacking context:** `.body` has `z-index:1`, so the reader (even at `z-index:60`) was trapped
     under it and the sibling `.tabbar` (z-index:30) painted *over* the full-screen reader. Geometry was
     right; paint order was wrong.
- **The fix that kills both at once: portal the readers to `document.body`.** Added a tiny `portal()`
  helper (`ReactDOM.createPortal` — `ReactDOM` is already a global since the build mounts with it) and
  wrapped both reader returns. Now they're direct children of `<body>`: no ancestor transform, no
  stacking trap, `top:0`=viewport-top. Also switched both readers to `position:fixed; height:100dvh`
  (dvh tracks the iOS URL bar) and made `.lore-view` `flex:1` so the footer pins flush (its old
  `innerHeight-top-116` magic constant was tuned for the broken layout). Verified: both readers cover the
  full screen, footers flush, page-turn works, closing returns to the shelf at scrollY 0, 0 console errors.
- **Lesson banked:** for any full-screen overlay in this app, **portal to body** — the centered 560px
  column (`.app`) and the joy-pass animations create both a stacking context and (intermittently) a
  transform containing block. Don't rely on `z-index` + `position:fixed` from inside the tab content.

## 2026-06-18 — v12: the on-device Bookshelf (read-my-own-copy vs. publish)

- **The user reframed the whole request, and was right to.** He handed over a folder of real Zelda books/comics
  (from a shadow library) and said "add all of it to our library + use it to cross-check accuracy." My first
  instinct was the project's reflex: don't embed, just *mine* the books as sources (the v11 method). He pushed
  back — "change the rule, this is private, on my phone." The lesson banked: **ADR 0003 was always about
  *publishing*, not about him reading his own copies.** The honest split (ADR 0009) keeps 0003's hard line for
  the published artifact and adds a private, on-device reader. Don't conflate "we won't redistribute" with "you
  can't read what you own."
- **The real wall wasn't copyright — it was plumbing.** I verified before asserting: the repo is **public** and
  auto-pushes, and GitHub rejects files >100MB (*Hyrule Historia* is 181MB). So "embed all the books" literally
  can't be committed. That hard fact — surfaced, not hand-waved — is what made on-device-only the obviously-right
  architecture, and the user picked it himself. Check the remote/visibility before designing.
- **Avoid shipping a library you don't need.** CBR=RAR, which is painful to parse in-browser. Sidestepped it
  entirely: pre-process on the Mac (bsdtar + sips + `zip -0`) into **store-only** zips. JPEGs are already
  compressed, so STORE costs nothing — and the reader needs a ~30-line `readHbook` (central-dir walk + byte
  slice), **zero decompression lib**. The offline build stayed ~1MB. When a format is hard, move the hard work to
  build time and ship the dumbest possible runtime.
- **Two storage tiers, on purpose.** localStorage can't hold 159MB; page blobs went to a dedicated **IndexedDB**
  db, only the tiny index rode in `store`. Reused `hyrule:reading`/`bookmarks` so Continue-reading + progress
  rings worked across books and tales for free. The EPUB reused `LoreReader` (reflow); only comics/PDF guides
  needed the new `BookReader` (page images).
- **Verified end-to-end headless.** Drove the real file `<input>` via a synthetic `DataTransfer` + change event
  in `preview_eval` (fetch pack → File → dispatch), then asserted IndexedDB import → spine appears → page image
  renders (1500×1029) → nav advances → EPUB opens in the reflow reader. 0 console errors. Packs are gitignored;
  test copies were deleted before commit.
- **Accuracy cross-reference (the second ask) — done, and it vindicated the app.** A 7-agent Workflow checked the
  main-quest spine (Plateau, runes, champions/beasts, Master Sword, memories, cooking) against the **official**
  Explorer's Guide, with every flagged conflict re-verified against the actual page *image* (so jumbled
  multi-column OCR couldn't manufacture a false correction). Result: **0 verified conflicts, 28 confirms.** The
  two raised "conflicts" (campfire torch, Plateau shrine order) verified as *app-is-right*. The one cooking
  "gap" the agent flagged was **already covered** in `COOK_RULES` (line 371) — exactly why the workflow reported
  for review instead of auto-editing. Applied 3 tiny additive tweaks only: STATUS_RUNES "Bombs"→"Remote Bombs"
  (matches RUNES + the guide), softened `om1`'s unconfirmed "offers you a Torch", and added Cryonis-shatters-ice.
  Lesson: a "report-then-review" workflow beats auto-fix when the source is noisy — most flags were the *source
  read* being wrong, not the app.

## 2026-06-16 — v10: the interactive cooking tool (research → build)

- **The user found the wedge by feel, not features.** After I floated a feature menu and a "three souls" reframe
  (both missed), the user landed on "make the cooking thing way more interactive and very useful." Lesson banked:
  this user reaches the right idea through *feeling* and rejection — give vivid concrete things to push against,
  don't list. Cooking was the perfect target: it's the one system BotW refuses to explain.
- **Research first, as asked.** Two workflows: (1) **player-pain study** — 6 angles (Reddit, GameFAQs, UX
  critiques, existing calculators) → ranked spec. Unambiguous: #1 pain is **opacity** (raw ingredients hide their
  effect symbol — "the most baffling design choice"), worst hurt is **silent waste** (mixing 2 effects cancels
  both, no refund), no in-game cookbook, elixirs an unexplained 2nd system, Spicy/Chilly backwards. (2) a sourced
  **120-ingredient table** — 8 categories × finder→adversarial-verifier, web-checked → `cooking-ingredients.json`.
  Key realization that de-risked everything: the *most-painful* pains need correct **logic**, not exact numbers —
  so the tool can be bulletproof where it matters and honest (`≈`) where it estimates.
- **The build.** `CookView` (5 modes: Make / I need… / Ingredients / Cookbook / Rules) over a pure, deterministic
  `cookResult(items)` engine. The differentiator is the **guardrails** — real-time warnings the calculators skip:
  effect-cancel, critter-needs-monster-part, monster-part-in-food→Dubious, Monster-Extract-kills-crit, past-max-
  tier, Hearty +25 cap, Fireproof-is-elixir-only. Verified in-browser: 5 Big Hearty Radish → "full heal + 25
  bonus" (exact cap); 4 Mighty Bananas + Dinraal's Claw → "Mighty Lv 3 (max) + crit"; Fireproof Lizard alone →
  "add a monster part"; mixing Spicy + Hearty → "two effects cancel". 0 live console errors.
- **Data wiring + honesty.** `assemble-cooking.mjs` reconciles the workflow output (the verifiers had reinterpreted
  fields — e.g. Hearty's "potency" = yellow-heart count, "hearts" = raw not cooked): it normalizes effects to the
  11 buffs, re-encodes Hearty yellow-hearts as a `hearty:+N` bonus the engine parses, tags dragon (effect=null
  duration+crit boosters) / special semantics, shortens locations, dedups, and refuses to write unless all 11
  effects are present. Then `inline-data.mjs` inlines it → `COOK_INGREDIENTS` in `GEN:DATA`, exposed per-game on
  `GAMES.botw` (so TotK's is absent → `CookView` falls back to `CookReference`, verified no crash).
- **Two gotchas:** (1) had a stray `)` in the first dataset-workflow's pipeline verifier line (`[] }),` vs `[] },`)
  — the Workflow tool rejects with a JS parse error before running; fix and resubmit. (2) Moving `COOK_INGREDIENTS`
  from a hand-authored placeholder const into `GEN:DATA` means you MUST delete the placeholder first or you get a
  duplicate-const error — spliced it out by bracket-matching, then added the json to `inline-data`'s data map.
- **Honest-over-perfect, again:** rejected an LLM recipe generator (the popular AI cooking tools hallucinate combos
  — breaks law #1) and a frame-perfect calculator (BotW's hearts/duration math has finicky edges); the engine is
  deterministic on the logic and labels hearts/duration with `≈`. (ADR 0007.)

---

## 2026-06-16 — v9: polish one companion (joy · resume · progressive spoiler · "Stuck?" hints)

- **The brainstorm landed on restraint.** A long Claude.ai session kept proposing bigger architecture (a 3-lens
  map, then 3 "companion personalities"); the user cut both, twice, down to *one companion, made amazing*. The
  north star is the GameFAQs walkthrough they grew up with — linear, trustworthy, there-when-stuck — but one
  that **knows where you are, never spoils you by accident, one tap from the thing you're stuck on.** v9 builds
  exactly that, no new tabs. (ADR 0006.) Lesson worth keeping: when the user talks scope *down*, that's the
  design decision — don't reopen the thing they removed.
- **Four features, all in `HyruleCompanion.jsx`, all offline, all verified in-browser (0 live console errors):**
  1. *Joy pass* — `box-flash` Sheikah check-pulse (ember→cyan `::after` ring + `box-bounce`, driven by a
     transient `flash` state set only on check-*on* via a `progressRef`, so it never mass-animates on load),
     `stepsIn` section fade, `key={tab}` + `fadeIn` cross-tab fade, `:active` press on tap targets. All ride
     above the pre-existing global `prefers-reduced-motion` kill-switch — confirmed reduced-motion users get none.
  2. *Resume "you're here"* — `resumeTarget` (first incomplete checkable step, linear order) → persistent topbar
     pin (one-thumb reach from every tab) + Status hero; `jumpToStep` opens the section, centers + flashes the
     step (`step-hl`). Nearly free given the flat `{stepId:true}` map.
  3. *Progressive spoiler reveal* — the v8 shrine-only toggle became path-aware: regions with `index > resumeIdx`
     (and not while searching) veil champion banner + section reward banners + `k:"reward"` payoffs behind
     per-item "tap to reveal." Verified `grants ••• → grants Revali's Gale`; revealing one keeps the rest hidden.
  4. *"Stuck?" hints* — a new optional `stuck` field renders `StuckReveal` ("Stuck? tap for the exact how"),
     hidden by default so the step stays scannable. **71 hints** authored by a sourced fan-out workflow.
- **The "Stuck?" content was a real research job, not polish — and treated as one.** The walkthrough is
  hand-authored in the `.jsx` (not in `GEN:DATA` / not in `regions.json`), so: `extract-walkthrough.mjs` pulls
  the 172 steps → `gen-stuck-workflow.mjs` embeds them in a Workflow script → 10 author + 10 verify agents
  (one per region, web-checked vs Game8/Zelda Dungeon, **713K tokens**) → `apply-stuck.mjs` splices `stuck:`
  after each step's `k:` token (idempotent; reported 71/71 placed, 0 missing). Agents were told quality over
  coverage — they added hints only to stallable steps (Plateau 18, but Master Sword/Ganon 4 each), and an empty
  set is an honest answer. This is the same author→adversarial-verify pattern as the v5/v7/v8 sweeps.
- **Bug caught + fixed:** the build only destructured 4 hooks from the global React; `useRef` (new in the resume
  logic) white-screened the app with `ReferenceError: useRef is not defined`. Added it to `build.mjs`'s `head`
  line. **Any new hook must go there** — recorded in CLAUDE.md gotchas + ADR 0006.
- **Honesty-law catch (user-flagged, mid-session):** memory step `m_l7` said "glide from **Ja Baij Shrine** to
  the big tree across the river" — geographically impossible (Ja Baij is on the Great Plateau; Memory #7 is in
  West Necluda by the Hylia River). Web-verified (Nintendo Life, GamesRadar) the real route and rewrote it to
  "from Scout's Hill, paraglide over the Hylia River to the lone tree opposite — it has a rock at its base."
  This was *original* hand-authored content, not a workflow hint; the v9 "Stuck?" agents did NOT write an m_l7
  hint, so nothing propagated. Worth a future audit pass over the other memory routes with the same rigor.
- **Verify-in-browser gotchas (reconfirmed):** the SW caches aggressively — `getRegistrations().unregister()` +
  `caches.delete()` then hard-reload to see a fresh build. And `botw:ui` persists the open region/section, so a
  test that assumes "Plateau" must explicitly click the region chip, not trust the default.

### v9 follow-ups (same day, post-ship)

- **Resume bug — it trapped on skipped collectibles.** User report: BotW has multiple sources for the same item
  (Traveler's Bow from the Temple of Time *and* from Oman Au; the Ja Baij Claymore is easy to miss), so they
  leave those `loot` boxes unchecked — and Resume, which scanned the first incomplete step of *any* checkable
  kind, anchored on that early unchecked loot forever. Fix: **`resumeTarget` now follows the main-quest spine
  (`k:"step"`) only**, ignoring `loot`/`optional`/`reward` checkmarks. Verified: with all Plateau steps done but
  the bow/Claymore/orbs unchecked, Resume correctly advances to Kakariko ("Cross to the Dueling Peaks") instead
  of trapping at `awk2`. Side effect, accepted: reward-only sections (Master Sword, the final blow on Ganon)
  aren't Resume *anchors* — they have no checkable step and you pass them by being there. The duplicate-item
  pouch behavior is left as-is — it's documented as intentional (bows break; spares help). `resumeIdx` (spoiler
  veil) keys off this too, so the veil now tracks main-path position, which is more correct.
- **Memory-route audit (the m_l7 sibling errors).** Audited all 12 memory location steps against Nintendo Life +
  per-memory cross-checks (RPG Site, Zelda Dungeon, Game8). Found **4 more wrong** beyond m_l7, all fixed:
  m_l1 (said "in the forest" + hint said paraglide *south* — it's open Hyrule Field, *north* from Central
  Tower), m_l3 (vague "south of Tabantha Great Bridge" → Piper Ridge near Tena Ko'sah), m_l5 ("between Hyrule
  Castle and Great Hyrule Forest" → overlooking Goronbi Lake between Woodland/Eldin Towers), m_l11 (falsely
  required cold resistance — the gate is at the base; cold is up the promenade; guarded by Moblins/Bokoblins).
  Confirmed *correct* and left alone: m_l6 ("southeast of Serenne Stable" checks out), m_l2/4/8/10/12/13.
  **Lesson:** the original v1–v4 hand-authored walkthrough predates the honesty gate and carries unsourced
  geography — worth a broader audit of the non-memory regions' route claims with the same rigor before OoT.
- **Full walkthrough honesty audit (the broader sweep).** Ran it: `gen-audit-workflow.mjs` → 9 non-memory
  regions × (finder → adversarial verifier), web-sourced, 18 agents / 552K tokens. Deliberately conservative
  prompts (only flag a claim a source directly contradicts; empty per region is the expected honest result; the
  verifier drops false positives). Result: **6 of 9 regions clean**, only **3 confirmed corrections**, all
  high-confidence — which is the reassuring outcome (the rest of the walkthrough holds up). Fixed:
  (1) **r15 Vah Ruta** — the Toto Lake Magnesis chest holds the **Zora Helm** (completes the Zora set you need
  for the Ruta questline), NOT "Ice Arrows ×10"; the wrong item was in the step `t`, the `stuck` hint, AND the
  `items` pouch chip, so all three were corrected (the audit only flagged `t` — fixing the *fact* means fixing
  every instance of it). (2) **k8 Kakariko** — Hestu's maracas chest is on TOP of the Bokoblin lookout tower
  (must climb), not "at the back of the camp." (3) **md2 Vah Medoh** — Rito Village is **north** of Tabantha
  Tower, not "northeast" (northeast points at Tanagar Canyon). Sources: Game8, Zelda Dungeon, Zeldapedia,
  TheGamer, Thonky. **Takeaway:** the finder-flags-one-field but the fix may span `t`/`stuck`/`items` — always
  grep the whole step for the wrong fact, don't trust the flagged field alone.

---

## 2026-06-16 — v8: service worker, settings/spoiler, and **multi-game + Tears of the Kingdom**

- **Service worker** (`build.mjs` emits `sw.js`, versioned by an app-content hash): **network-first for
  navigations** so reopening online pulls the fresh build — the durable fix for the iOS Home-Screen
  "can't refresh" problem — plus a cached shell for offline and a "new version is ready — Update" banner.
  Allow `localhost` as a secure context so it's testable in the preview.
- **Settings** (new Guide segment): spoiler-free-shrines toggle, version/update info, backup/reset moved here.
  Prefs persist game-agnostically under `hyrule:prefs`.
- **Multi-game (ADR 0005 realized).** A thin `HyruleCompanion` wrapper owns `game` and renders
  `<HyruleGame key={game}>` — the **key remount** loads each game's storage cleanly with no race. HyruleGame
  **shadows the data globals** with `GAMES[game]` and namespaces storage via `K=(s)=>game+":"+s` (so BotW's
  `botw:*` data is untouched). Per-game `terms`/`guideSegs`/`postRegionId` drive labels, the Guide segment set,
  and the roadmap; empty datasets degrade gracefully (TotK has no maps/fairies/towers/quests/koroks yet, so
  those surfaces hide). Sub-components that read globals (`HyruleMap`, `SearchOverlay`, `ShrinesView`) now take
  game data as **props**; `WorldView`/`EnemiesView`/`ENEMY_TIER` were generalized for both games.
- **Tears of the Kingdom** (57-agent sweep, 2.2M tokens): 9-chapter walkthrough, **152 shrines** (the audit
  caught a 196 over-count — duplicate Gerudo bucket, sky shrines double-listed, a fake "Lake" region, tutorial
  shrines in two places; deduped to 144 + 8 web-verified missing = 152), 5 abilities, 17 armor, 23 bestiary,
  full cooking, world systems. `build/assemble-totk.mjs` maps it to app shapes (abilities→RUNES, sage vows→
  CHAMPIONS wired to walkthrough step ids, effects→RECIPES, etc.) and refuses to write unless shrines == 152.
- **Bugs caught + fixed this session:** (1) two JSX panel-close imbalances from conditional-wrapping edits —
  re-read and fixed each. (2) Shipped a stale `app-data.json` once because I edited `assemble-totk.mjs` but
  forgot to **re-run it** before inlining → TotK Cook crashed on `RECIPES.map` (undefined). Lesson: after
  editing an assemble script, re-run assemble → inline → build, in that order. (3) The preview's
  `console_logs` buffer is **cumulative across reloads** — stale errors looked current; confirm "live" errors
  with an in-page `addEventListener('error')` counter, not the raw buffer.
- Verified: both games render every tab + Guide segment, storage isolated (BotW 120 / TotK 152), **0 live
  console errors**. Hosted; auto-updates via the SW.

### Open threads
- TotK **per-region maps** + a TotK overview map (needs `TOTK_MAP_NODES` + a coords pass like BotW's).
- TotK fairies/towers/side-quests/Korok datasets (not yet researched) → then enable those Guide segments.
- The Status orb panel still reads walkthrough `orb:true` items; consider sourcing it from `shrineStats.done`
  for both games (TotK has no orb items, so its "Lights of Blessing" panel reads 0).

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
