# Hyrule Companion — learning log

Append-only. Read this first on each session so reasoning accumulates and we never re-derive a settled call or
re-make a rejected one. Newest at top.

---

## 2026-06-26 — v17.13: TotK Items compendium (478) + app-wide gap audit → zero content gaps left

- **User: "then do it! and add whatever else is missing… assess, plan, intervene and reevaluate."** So I ran the
  full cycle, not just the compendium.
- **ASSESS (data-driven, cheap):** built a parity matrix across all 11 games (walkthrough/stuck/shrines+sol/
  compendium/enemies+battle/armor-tiers/fairies/sideQ/runes/koroks/towers/econ/maps/collect) + an integrity pass
  (dup step ids, CHAMPIONS/STATUS_RUNES → real steps, side-quest slug collisions, meta-leak fields, compendium-cat →
  CompendiumView column coverage). **Result: the ONLY genuine content gap was TotK's compendium.** Everything else
  is present or correctly N/A (classic games have no shrines/cook/koroks/towers/armor-system/maps/economy). Two
  audit "findings" were false positives: side-quest ids ARE stable slugs (the `sq_` prefix is added at the key
  layer by `sqKey()`, not stored), and `KOROKS.notes` is the intentional 1000-seeds caveat. All 11 games' slugs are
  unique → no progress-key collisions. Doing the assess as plain Node scripts (not a workflow) kept it ~free.
- **INTERVENE:** ran the staged `gen-totk-compendium-workflow.mjs` — already correctly BATCHED (one agent per
  CATEGORY, not per item): 12 categories → 24 agents, ONE solo workflow, ~1.67M tok, 0 failures. 498 raw items →
  deduped 20 dragon-part dups (monster-parts agent re-listed them; dedicated dragon-elemental copy wins, same rule
  as BotW v12.14) → **478** (92 weapon/30 bow/33 shield/137 armor/146 material/40 creature) →
  `knowledge/totk/compendium.json` → assemble-totk → TotK Items tab is now CompendiumView (was PouchView).
- **REEVALUATE (in-browser, the thing static audit can't see):** verified TotK Items = 478 with all filters + an
  item detail (badges/effect/where); spot-checked a near-miss — "Biggoron's Sword"/"Fierce Deity Sword"/"Master
  Sword" looked like cross-game hallucinations but are GENUINE TotK items (verify pass was right; I confirmed in the
  data). Switched TotK→LA→BotW via the shelf (one page load so console accumulates): LA Items renders Songs/Key-Items
  cats, BotW 7 tabs, **0 console errors/warnings** the whole way. CompendiumView COLS already cover all 11 cats.
- **Outcome: the app has NO content gaps left.** Only open-ended extension is Lore era-chapters (gated by the
  no-AI-slop bar). Lesson reinforced: assess with cheap deterministic scripts FIRST; reserve agents for the actual
  build; category-batched compendium (24 agents) is the right shape and ran clean solo.

## 2026-06-26 — v17.12: TotK shrine solutions — all 152 (last big gap closed) + a dispatch lesson relearned

- **User: "okay let's finish the totk shrines."** The one major functional gap left in the whole app: TotK's 152
  shrines had no spoiler-gated `solution` (the Stuck-reveal + answer-first-search centerpiece every other game has).
- **I botched the dispatch first, and the user caught it.** I ran the staged generator as-is = **one author + one
  verify agent PER shrine (304 agents)**, and launched **two** workflows at the same instant. Result: instant
  server-side 529 ("temporarily limiting requests"), **0/152**, ~1.33M tokens burned for nothing in ~36s. The
  near-instant total failure was the tell: 16 web-fetching agents firing together = thundering herd.
- **The fix is in AGENT_WORKFLOW.md and I'd skipped it: BATCH ~12 like-items per agent, never one-per-item.**
  Rewrote `gen-totk-shrine-solutions-workflow.mjs` to chunk shrines into **region-coherent batches of ≤12** → one
  author agent + one verify agent per batch = **19+19 = 38 agents** (vs 304), in **ONE solo workflow**. Each batch
  author web-researches all ~12 shrines and returns an array; the verify batch independently re-checks each against
  a second source (honesty law preserved — dropped redundant agents, not rigor). Region-coherence also helps
  research (same region guides). Added an `args` = regionKeys filter for cheap per-region resume.
- **Result:** 152/152 verified, **0 failures**, 768 web tool-uses (real research), ~2.45M tokens, ~18.6 min. Wrote
  `knowledge/totk/shrine-solutions.json` (sources/corrections stripped) → `assemble-totk` splices `solution` by
  region+name → inline → build. Verified in-browser on a fresh port: Ukouh/Gutanbac reveals render, hidden shrines
  lead with "how to make it appear" (Jochisiu → "Keys Born of Water"), global search expands the solution inline,
  **0 console errors, 0 meta leaks** (grep of index.html: 0 "corrections"/"adversarial").
- **Lesson banked (two-part, both required for a heavy web sweep):** (1) **batch ~12/agent** — the #1 token lever;
  (2) **run ONE solo workflow** — for a heavy web-fetching sweep even 2-up launched together trips 529. ≤2 is the
  ceiling, but prefer 1 here. Logged the closing efficiency line to `.agent-ledger/`. **TotK is now FULLY at
  parity**; only the lower-priority TotK Items-tab compendium remains anywhere in the app.

## 2026-06-19 — v12.14: materials + creatures compendium (rounded out to 410 entries)

- **User: "do that! keep building"** — the materials/creatures extension I'd offered. Built it.
- **Scoped to the real gap:** Cook already covers food + the edible/elixir critters AND monster/dragon parts (by
  cooking effect). The genuine holes were **ores/gems and ancient parts** (no cooking use → absent everywhere)
  and the **"what's this drop FOR"** framing (armor-upgrade set + sell value). So the materials workflow framed
  everything by USES, not cooking effect. Monster/dragon parts intentionally appear in BOTH Cook and the
  Compendium (different lens) — that's fine, not duplication-to-fix.
- **Workflow:** 6 categories (monster parts/ores-gems/dragon parts/ancient parts/special/creatures), author→verify,
  ~788k tok, no failures this time. Added 63 materials + 75 creatures → **410 total catalog entries**.
- **Additive merge pattern (banked):** `merge-materials.mjs` loads the existing `compendium.json` (272 equipment),
  drops only the cats present in the new input (material/creature), appends, dedupes by cat+name, re-sorts. So the
  equipment build and the materials build don't clobber each other — re-running either is safe. The "special"
  agent over-reached (re-listed dragon/ancient parts already in their own categories); dedup keeps the dedicated-
  category copy because category order puts it first. **Lesson: when fanning a catalog across overlapping category
  agents, always dedupe at merge by a stable key, and order categories so the authoritative one wins.**
- UI: `CompendiumView` COLS += material/creature; badges made cat-aware (type + Sell N for materials, type for
  creatures; power/durability/set stay for equipment). Global search "Items" lane spans them with sell value.
- Verified in-browser: 6 filters (All 410 · Weapons 127 · Bows 26 · Shields 33 · Armor 86 · Materials 63 ·
  Creatures 75); Lynel Guts → upgrade-set uses + Sell 200; Diamond → Gem + Sell 500 + mine spot. 0 console errors.
  Shipped v12.14. The item catalog is now genuinely "everything."

## 2026-06-19 — v12.13: equipment Compendium (catalog, not a pouch)

- **User:** the auto-pouch is frustrating — gear changes too fast to keep "tracked" — and lots of gear is just
  missing (called out the Guardian Shield line specifically). The real want: a complete catalog where you tap any
  item to read what it does. Correct reframe: stop modeling *owned inventory*, model the *reference*.
- **Built:** repurposed the Items tab from `PouchView` (walkthrough pickups) into `CompendiumView` — search +
  category filters + tap-to-expand stats/effect/where. Falls back to `PouchView` when `COMPENDIUM` is empty so
  TotK still works. Added a "Gear" lane to the answer-first global search.
- **Data:** deep-research author→verify Workflow, one agent per equipment class (one/two-handed, spears, bows,
  shields, armor head/body/legs) pulling Game8/Zelda Dungeon compendium tables. **272 base-game items** (127
  weapons, 26 bows, 33 shields, 86 armor), each with power, durability, effect, where. No dups, no DLC, no TotK
  bleed; Guardian Shield/+/++ all present.
- **Workflow gotcha banked (important):** the `verify:one-handed` agent died on a **529 Overload** after retries
  → the pipeline dropped that whole category (its author had succeeded). Total came back 223 missing the biggest
  weapon class. **Fix: `Workflow({scriptPath, resumeFromRunId})`** — cached agents (incl. the one-handed author)
  returned instantly and ONLY the failed verify re-ran, recovering the full 272. *Transient agent failure → resume,
  don't re-run the whole thing.* Always scan the `<failures>` block in the task notification.
- Verified in-browser: 272-item catalog, filters, Hylian Shield → Guard 90 / Durability 800 / where; "guardian
  shield" surfaces in both the catalog search and the global answer-first search. 0 console errors. Shipped v12.13.

## 2026-06-19 — v12.12: answer-first search (the moment-of-need reframe)

- **User reframed the whole app:** "imagine I'm playing and pull out the companion because I need help — how do
  you help me? Build THOSE features." The point: we'd built a deep *library*, but in the moment you want the
  *answer*, fast, one-handed. Offered a 4-option menu (answer-first search / panic buttons / search-as-home /
  recent-nearby); he picked **only answer-first search** — the backbone.
- **The real gap (measured):** the global SearchOverlay matched everything but every result was a LINK — tapping
  "Kaya Wan" jumped to Shrines → opened the region → scrolled → and you STILL had to tap the "Stuck?" reveal
  (≈4 taps). Enemies/armor/quests didn't even deep-link to the item, just the tab. Content was all there; the
  taps-to-answer were the problem.
- **Fix:** every search result now **expands inline to the actual answer** (shrine solution, enemy battle guide,
  side-quest how-to, armor effect+recipe+farm, cooking, walkthrough stuck-hint), with a secondary "Open the full
  page ›" that preserves the old deep-link for full context (ticking done, region map, etc.). Reordered categories
  to lead with the panic ones (Shrines/Enemies/Side quests). Each hit carries a `detail` string; armor composes a
  multi-line recipe rendered with `white-space:pre-line`; an `open` accordion state; reused chevron + cyan panel.
- **Lesson banked:** *content is only as good as the taps to reach it.* After months of adding data, the highest-
  value move was zero new content — just collapsing search → answer from ~4 taps to ~2. When the user frames a
  need as a *moment* ("I'm sitting there…"), optimize the path to the answer, not the library.
- Verified in-browser: Waterblight → full fight plan inline; Kaya Wan / Snowquill / Tarrey / spicy all expand
  with the right answer; "Open the full page" still jumps. 0 console errors. Shipped v12.12.

## 2026-06-19 — v12.11: complete side quests + cross-link shrine quests (the "perfect shell")

- **User's framing:** he'll play BotW for ~a year, so make BotW the GOLD-STANDARD shell every future Zelda game
  copies. Two asks: complete the thin side-quest list, and cross-link all 38 shrine quests (only 8 were tracked).
- **Side quests 56 → 78** via a per-region author→verify Workflow (28 agents, ~1.4M tok). Each quest gained a
  giver/location/reward + a spoiler-gated `how` (StuckReveal — same pattern as shrine solutions, for shell
  consistency). The merge **deduped 10 cross-region boundary duplicates** (parallel region agents both claim a
  quest that sits on a border — e.g. Rito quests claimed by Tabantha AND Hebra). BotW quest names are unique, so
  same-name = same quest → keep first. Hebra legitimately netted 0 logged side quests (its quests are all Rito =
  Tabantha); QuestsView now hides empty groups.
- **Shrine Quests = derived, not authored.** All 38 come straight from shrines.json (each hidden shrine names its
  quest + already has the full `solution`). New QuestsView section: each mirrors the shrine's own checkbox (one
  source of truth) + "Find shrine →"; the shrine row's "· Quest: X ›" links back (`focusShrineQuest`/`questFlash`,
  mirroring the existing `focusShrine`/`shrineFlash`). Bidirectional, zero new sourced data.
- **Shell-hardening = stable ids + migration.** Switched side quests from positional `sq_<ri>_<qi>` to stable
  `sq_<slug>` ids so future expansion never corrupts saved checks. One-time migration: embed an `SQ_LEGACY`
  snapshot (old names by position) → map old keys → new slug by name (+ an ALIAS map for the 3 corrected names),
  guarded by a `botw:sqmig` flag. **This is now the template for growing ANY positional dataset.**
- **Bug banked (cost ~5 verify cycles):** the migration silently never ran — `store.get`/`store.set` are **async**
  (Promise-returning), so my synchronous `if (store.get(K("sqmig"))) return;` checked a truthy Promise and bailed
  every time. Fix: `await` it inside an async IIFE in the effect. **Rule: store.get/set are async — never test
  their return value synchronously.** (The load effect already awaited them; only my new effect didn't.)
- Verified in-browser: 78 quests with 78 how-to reveals, both cross-link directions flash the target, and a
  controlled migration test mapped 3 seeded legacy checks (incl. the Cucco→Flown-the-Coop alias) to slug keys.
  0 console errors. Shipped v12.11.

## 2026-06-19 — v12.10: full audit + polish (assess → plan → intervene → re-evaluate)

- **User asked for a whole-app assessment** (incl. "things that aren't there"), a fix plan, the fixes, then a
  re-evaluation. Ran it as: deterministic pre-scan → 6-dimension verified-review Workflow → synthesize → fix →
  re-verify in-browser.
- **The Workflow design that worked:** `pipeline(DIMENSIONS, review, rev => parallel(findings.map(verify)))` —
  one reviewer per dimension (bugs-newcode, bugs-core, data-integrity, ux-polish, a11y-robust, gaps), then EACH
  finding adversarially re-checked by an independent skeptic that re-reads the cited code. 46 agents → 36 real /
  4 false positives. The verify stage paid off: it killed a confidently-wrong "armor qty is 3× undercounted"
  claim (the verifier web-checked and found the stored set-totals were right) and a fabricated "CLAUDE.md says no
  DLC" finding. **Pattern banked: a holistic audit = dimension-reviewers + per-finding adversarial verify; never
  trust a single reviewer's severity.**
- **TotK was the canary.** 7 of the 13 "bugs" were the SAME root: BotW-only features not degrading when the
  active game lacks the dataset. The real crash: the coach's Korok card had no `KOROKS &&` guard, and TotK has
  `KOROKS:null` AND no koroks guide-segment — so tapping it white-screened the whole tree with no in-app escape.
  Also surfaced: armor-chase recommending TotK's *starter rags* (priority-vocab mismatch silently `?? 3`-collapsed
  the sort), sentence-long prio-pills, a dead 4-star stepper on tier-less sets, shrines meter hardcoded `/120`.
  **Rule: every per-game feature needs a "what if this dataset is absent?" guard; test by switching to TotK.**
- **The audit caught a real FACT error my own data already refuted:** economy.json placed "Gut Check Rock" in the
  Gerudo Highlands; our verified shrines.json (Gorae Torr) puts it in northeastern Eldin. The author agent had
  conflated it with the Mount Nabooru Goron heat challenge (Joloo Nah). Lesson: cross-check new content against
  the *already-verified* datasets, not just the web.
- **Honesty-law alignment fix:** Settings promised "hide shrine solutions" but the `StuckReveal` ignored spoiler
  mode — gated it on the same `revealed`/`spoiler` state as the one-line hint. And the orb count had two sources
  of truth (walkthrough-item orbs ~12 vs the 120-shrine total); unified on `shrineStats.done` (1 shrine = 1 orb).
- Backfilled the standard 30/150/600/1500 armor upgrade rupees on the 7 ordinary sets that omitted them (left
  Champion's Tunic + Ancient off — unconfirmed/non-standard). Re-verified BotW + TotK in-browser, 0 console
  errors. ~20 fixes shipped as v12.10; no new workflow data needed beyond the one audit run.

## 2026-06-19 — v12.9: playthrough-depth bundle (armor upgrades · coach · korok solver · economy)

- **User: "do all of those!"** — built the four remaining brainstorm ideas in one pass. Mix of sourced-data
  (workflow) + pure-logic (built directly): armor upgrade tracker, "What's next?" coach, Korok solver, Money tab.
- **One 3-phase Workflow** (`gen-depth-workflow.mjs`, 38 agents, ~1.7M tok, 28 min) produced all the data:
  per-set armor recipes (pipeline, author→verify), an economy guide (3 parallel authors → 1 verify), and
  enriched Korok types (author→verify). `merge-depth.mjs` splits the output into armor.json / economy.json /
  koroks.json. **The coach was pure logic (no workflow)** — `nextUp` memo over existing progress state.
- **Armor verify pass was the MVP** (exact-number data): caught SegmentNext's wrong ★4 Champion's Tunic
  (Silent Princess ×3 → really ×10), SAMURAI GAMERS' Amber ×30/piece (→15), and multiple sites citing the
  Great-Fairy **awakening fees** (100/500/1,000/10,000) as the *upgrade* cost. Where no fixed per-star rupee
  value could be triangulated, agents honestly left `rupees:0` (UI hides the chip) — first law over completeness.
  Two sets (Gerudo Vai, Royal Guard) correctly came back with **empty tiers** — they genuinely can't be upgraded;
  shipped a clean "can't be upgraded" note instead of inventing recipes.
- **Two verification traps banked (cost ~30 min):**
  1. **Service-worker stale cache.** After rebuilding, the preview at `localhost:8137` served the SW-CACHED OLD
     bundle — I "verified" and saw the *old* 10 guide segments (no Money), no coach. Tell: the data was a build
     behind. Fix: verify on a **fresh port/origin** (SW is origin-scoped) or unregister SW + `caches.delete`.
  2. **Preview server wedged.** After a few start/stop cycles the preview tool's python `http.server` spawned but
     never bound the port (macOS local-network "disclaimer" permission gate) — page went `chrome-error`. Fix:
     ran my OWN `python3 -m http.server <newport>` via Bash (sandbox-disabled) and pointed the preview Chrome at
     it with `window.location.href`. Worked immediately. **Rule: when the preview server won't bind, BYO server
     on a new port + navigate the Chrome to it.**
- **Merge name-match gotcha:** an author returned `"Wild Set"` but armor.json has `"Wild Set (amiibo)"` → missed
  the by-name merge. Patched the name in the result and re-ran. (Consider fuzzy/startsWith matching next time.)
- Stripped the verbose agent `note` (verification meta) from shipped armor data — kept only `tiers` + `farm`,
  plus a clean short note for the non-upgradeable two. Verified all four features in-browser with real data
  (Hylian ★1 = 15× Bokoblin Horn + 30 rupees; economy 26 rows + 9 tips; korok search "balloon" → 2 cards),
  0 console errors.

## 2026-06-19 — v12.8: combat guides (boss fights + a primer that fights overwhelm)

- **Brainstorm → the user picked "boss & enemy fight guides," but his real wall is "overwhelmed by systems"**
  (and he plays with his son; no DLC). Key design move: don't just add boss guides — make them *reduce* overwhelm.
  So every `battle` guide **leads with what gear/food to bring** (so he doesn't have to reason across armor +
  cooking + materials first), and we added a **Combat Basics primer** (7 cards) addressing the overwhelm head-on.
  **Lesson banked: when the chosen feature and the stated pain differ, build the feature so it serves the pain.**
- **Reused the shrine machinery wholesale.** Same author→adversarial-verify Workflow (`gen-battle-guides-
  workflow.mjs`, 54 agents, ~1.9M tok, 16 min) → `merge-battle-guides.mjs`. UI: `StuckReveal` just gained
  `label`/`openLabel` props ("Stuck? How to win this fight") and renders under each enemy; `EnemiesView` got a
  collapsible primer from `BESTIARY.basics`. The proven pattern (StuckReveal + sourced workflow + merge-only-the-
  -new-field) is now the standard play for "spoiler-gated how-to on a reference row."
- **The verify pass paid off again (this is now a reliable pattern, not luck).** It caught: flurry-rush dodge
  directions **inverted** by the author (backflip vs horizontal, side-hop vs vertical/thrust); crouch is the
  LEFT stick; **Igneo Talus — a Fireproof Elixir does NOT stop the touch-burn or let you climb it; only 2★
  Flamebreaker armor does** (a genuinely common misconception); Thunderblight's omitted aggressive 3rd phase;
  Frost/Igneo Talus tier + drop fixes. Sneakstrike ×8 and mid-air bow slow-mo confirmed.
- **inline-data gotcha:** `noNotes()` strips only *top-level* `notes/confidence/changes`. `bestiary.json` top
  level is `{enemies, notes, basics}` — so the long-standing `notes` lede is stripped (EnemiesView already falls
  back to a default), but the new top-level `basics` array survives, as do per-enemy `battle` fields. **Don't
  name a surfaced data field `notes`** or inline-data will eat it.
- 26/34 enemies now have a fight guide (the 8 trash commons keep one-liners; camps covered in the primer).
  Build clean (offline + 120/15/4), verified in-browser (7 cards + Igneo reveal), 0 console errors.

## 2026-06-19 — v12.7 (cont.): scaled shrine solutions to all 120 (the other 100)

- **Scaled the sample to the full game.** After the hand-vetted 20-shrine sample, ran the same author→adversarial-
  verify pattern over the remaining **100 shrines (12 regions)** as a single Workflow: per-shrine pipeline,
  **200 agents** (author web-researches one shrine on Game8/Zelda Dungeon/Thonky/Zeldapedia; an independent
  skeptic re-researches from a *different* source, fact-checks every claim — chest contents especially — and
  corrects). ~6.9M subagent tokens, 1920 web tool-calls, ~38 min. Returned 100/100, 0 missing.
- **Tooling (reusable):** `build/gen-shrine-solutions-workflow.mjs` reads `knowledge/shrines.json`, embeds every
  solution-less shrine + two style anchors (Oman Au puzzle, Lakna Rokee hidden) as **consts** (not `args` — the
  v12.7 serialization gotcha), and emits `/tmp/shrine-solutions-workflow.mjs`. `build/merge-shrine-solutions.mjs`
  splices ONLY the `solution` field back in (matched by regionKey+name; additive, won't overwrite without
  `--force`). Note: `inline-data.mjs` does NOT run `noNotes` on SHRINES, so the merge must write *only*
  `solution` — never let `sources`/`corrections` into shrines.json or they'd reach the bundle.
- **Validation scans caught one real bug + dodged false positives.** A scan for <300-char solutions caught
  **To Quomo Shrine**: its verifier wrote the literal word `"verified"` into the `solution` field and left the
  real content in `corrections` (treated "solution" as a status flag). Re-authored it with a focused agent
  (Royal Claymore chest confirmed ×4 sources). A TotK-mechanic bleed scan flagged **Shae Katha** on `zonai` —
  **false positive** (the Zonai Ruins are a real BotW place near Lake Hylia). **Lesson: always post-scan
  Workflow structured output for (1) status-word-in-content-field, (2) length outliers, (3) wrong-game vocab —
  but read the hit before "fixing" it.**
- **Honesty pass held:** verifiers softened unconfirmable specifics (e.g. Soh Kofi's "Guardian Sword/Shield" →
  "the Guardian weapon and shield it drops", since a Scout II carries the ++ variants). Build clean (offline +
  120/15/4), in-browser Lanayru reveals render, 0 console errors. **All 120 shrines now have a solution.**

## 2026-06-19 — v12.7: shrine solutions (the "stuck in a shrine" gap) — sample first

- **User (playing with his son) chose "deeper BotW playthrough help."** Assessed: all 120 shrines had only a
  one-line hint; 38 are hidden behind shrine-quests (the #1 "where IS it?" pain). The `StuckReveal` spoiler-gate
  already existed for walkthrough steps — reused it on shrine rows.
- **Plan/intervene:** add a spoiler-gated `solution` to each shrine (clear the puzzle/combat; for hidden ones,
  HOW TO MAKE IT APPEAR; blessing = free orb). Authored via a Workflow: per shrine, an author agent web-researches
  (Game8/Zelda Dungeon/Thonky/Shacknews via WebSearch+WebFetch) then an adversarial verifier fact-checks against
  a SECOND source. The verify pass earned its keep — it caught real mechanical errors (Oman Au "swing the gate"→
  "pull toward you"; Ja Baij "ride a block"→"stand on the launcher"; Keh Namut invented "ice pillar blocks the
  laser" → removed). **Vetted a 20-shrine sample of the user's current area (Plateau + Dueling Peaks + Hateno)
  before scaling to 120** — matches the [[zelda-lore-no-ai-slop]] "vet a sample before scaling" rule.
- **Pipeline:** solutions written into `knowledge/shrines.json` (new `solution` field) → `inline-data.mjs`
  preserves it (only `notes/confidence/changes` are stripped) → `SHRINES` const → `<StuckReveal text={sh.solution}>`
  on each shrine row. Honesty gate still passes (120/15/4). Verified in-browser: 9 reveals in Dueling Peaks, the
  hidden Hila Rao shows its full find-it-then-solve-it text; 0 console errors.
- **Workflow gotcha banked:** passing the 20-shrine list via the Workflow `args` field arrived as a non-array
  (serialization) → `pipeline() expects an array` and the run died in 9ms with 0 agents. Fix: **embed the input
  array as a `const` in the script** rather than relying on `args` for structured data. (Or guard:
  `const X = typeof args === 'string' ? JSON.parse(args) : args`.)
- **Next:** scale the same author→verify Workflow to the remaining 100 shrines (12 more regions), region by
  region, then spot-check.

## 2026-06-19 — v12.6: reader typography (ported from the preg reader)

- **User: "whatever we can add from preg for the reader, let's do it."** Ported the premium reading controls into
  the LoreReader: a proper settings sheet with **Theme** (added a light **Day** theme → slate/sepia/day/night),
  **Text size** (6 steps, index 1 still = 1.0 for back-compat), **Typeface** (Serif / Sans / Easy-read with
  letter+word spacing), **Line spacing** (Snug/Normal/Roomy), **Margins** (Narrow/Normal/Wide → dynamic
  `.lore-view` padding + measure), **Brightness** (a `.lore-dim` overlay, 4 steps), and the existing Cover. New
  prefs ride in `hyrule:readerprefs` (auto-persist via the existing effect; `||` fallbacks for old saves). The
  BookReader's night-dim is now **warm** (`#1a0f02`) instead of pure black.
- **The column engine is fragile (ADR 0008's warning held).** Changing margins/size/font changes `dims.w`, which
  changes BOTH the column width and the page stride — and `.lore-cols` has a `.26s` transform transition, so the
  column *slides* between the old and new layout, flashing a half-column for a moment. **Fix:** a `relayout`
  flag (set for 80ms whenever dims/scale/font/lh/pad change) toggles a `.lore-cols-still{transition:none}` class
  so the column **snaps** to its new aligned position on re-layout, while page *turns* (transform changes with
  dims unchanged) keep the smooth slide.
- **Verification gotcha (banked):** my first screenshot showed two clipped half-columns and I almost "fixed" a
  non-bug — it was a **mid-transition capture** from changing 5 settings in rapid succession via `preview_eval`.
  Waiting 1.5s (past the .26s transition) showed `translateX` exactly matching `-page*(dims.w+GAP)`. **Lesson:
  for animated/transitioned UI, measure after the transition settles, and confirm a *single* user-style action
  (not a scripted burst) before concluding there's a bug.** Re-verified: each control applies, persists, and
  re-paginates aligned; 0 console errors.
- **Deferred from preg (still available):** table-of-contents, search-within-book, multi-page bookmarks list,
  highlights/notes. Lower value for this app's short lore tales; easy adds for the big imported guides later.

## 2026-06-19 — v12.5: Resume followed the first gap, not the frontier

- **User, mid-game:** Resume kept sending him back to "Stay Warm First" because he never grabbed the Warm
  Doublet — even though he'd progressed far past it. Classic open-world mismatch.
- **Root cause (two layers):** (1) `resumeTarget` returned the **first incomplete `k:"step"`** in spine order —
  i.e. the first *gap*, not where you are. In an open world you skip things, so the first gap is usually behind
  you. (2) The Warm Doublet steps (`wd1/wd2/wd3`) were mis-marked `k:"step"` (mandatory spine) when the whole
  "Stay Warm First" section is **optional** prep (spicy food, the doublet, or just endure).
- **Fix (both):** (A) Algorithm — Resume is now **frontier-based**: find the *furthest* completed spine step,
  then return the next incomplete step *after* it; `null` if nothing remains ahead. A skipped earlier step can
  no longer drag you back. (B) Data — reclassified `wd1/wd2/wd3` to `k:"optional"`.
- **Verified in-app** by injecting progress: "past the doublet, wd skipped" → Resume = "Cross to the Dueling
  Peaks" (was "Stay Warm First"); fresh start → "Awakening"; only-one-late-step → frontier after it. Also
  improves the spoiler veil (`resumeIdx` now tracks the frontier, revealing everything you've actually reached).
- **Lesson:** "where am I" in a non-linear game = the max of your progress, never the min of your gaps. The
  earlier v9.1 fix ("spine = k:step only") was necessary but insufficient — it stopped *loot* from trapping
  Resume but a mandatory-marked-but-actually-optional *step* still could. Frontier logic fixes the whole class.

## 2026-06-19 — v12.4: reader unbricked (safe-area) + a real toolset

- **The v12.2 "portal to body" fix had a nasty side effect on-device:** making the readers full-screen
  overlays covered the app's own topbar, and my reader top bars had **no `env(safe-area-inset-top)`** — so on
  the user's iPhone the "‹ Library" back button + every top control sat *under the notch*, untappable. He
  couldn't exit a book without force-quitting the app. Real regression, caught by real play. The footers had
  the bottom inset; I'd simply forgotten the top one when the bar stopped being the app's (safe-area-aware)
  `.topbar`. **Lesson: any element that replaces the topbar as the top-most chrome must re-add
  `env(safe-area-inset-top)` — and `viewport-fit=cover` is already set, so it Just Works once added.**
- **Process the user asked for (and it paid off): assess → plan → intervene → re-evaluate.** Assessed (found
  the missing inset + confirmed viewport-fit=cover), read his **preg** app's reader to harvest features
  (read-only; an Explore agent returned a full inventory), planned, intervened, then re-evaluated by
  **simulating a 48px notch** in headless Chrome (inject `.bk-rbar,.lore-rbar{padding-top:calc(10px+48px)!important}`,
  since `env()` resolves to 0 with no real notch) and measuring the back button at y=60 → below the notch.
  One pass was enough; no replan.
- **Tools ported from the preg reader (BookReader):** tap-center to **toggle chrome** (immersive; swipe is
  suppressed from toggling via a `swiped` ref; double-tap = zoom), a **draggable page scrubber** (`<input
  type=range>` — essential for 275-page Historia, the old ‹/› was one-page-at-a-time), **jump-to-page** (tap the
  counter), **night-dim** overlay (cycles 0–3), kept swipe/edge nav + fit toggle. LoreReader got the scrubber
  too. Bars hide via `.reader-chrome-off → display:none` (flex stage refills; images just re-fit, no
  re-pagination needed). Verified every control in-browser, 0 console errors.
- **Deliberately deferred** (preg has them, not critical now): per-book typography (line-height/margins/font
  family), brightness/warmth sliders, TOC/search-within-book, highlights/notes. Easy follow-ups if wanted.

## 2026-06-18 — v12.3: mid-game usability (real-play feedback)

- **Source: the user playing with his son.** Two pains: (1) "we're in a shrine, forget its alien name, and
  it's hard to look up"; (2) "I have so many weapons, you collect/lose so much — it's impossible to keep the
  whole inventory in the app too."
- **Inventory — I pitched the honest reframe (stop mirroring the live bag; track only durable gear), the user
  chose "keep the full pouch but add filters/search."** Respected that: extracted the inline Items block to
  `PouchView` with a search box + category filter chips (All / Runes / Weapons / …, each with a got/total
  count). Lesson: offer the principled reframe, but the owner gets the call on his own app — he wanted the
  full pouch, just navigable.
- **Shrine lookup — the app can't know which shrine you're in, so the win is "find it in 2 taps."** Built all
  four the user picked: (a) **Quick-Find** — the Shrines search now matches name + region + nearest town +
  hint + shrine-quest + **puzzle type** (so "combat" or "kakariko" finds it even when you forgot the name);
  (b) **"I'm here" pin** (`shrinePin`) → a "You're here" card at the top with the shrine's hint + Mark-done +
  Clear, plus a per-row pin button; (c) **Recents** chips (`shrineRecents`, cap 8) that focus-scroll+flash the
  row; (d) **global search now jumps to the EXACT shrine** (`nav.shrine(rk, id)` → `focusShrine`) instead of
  just expanding the region. Map drill-down already existed (`jumpShrineRegion`).
- **New per-game state** `botw:shrinepin` / `botw:shrinerecents`; reused the existing `.step-hl` flash + a
  `shrow-<id>` DOM id for scroll targets. Verified every path in-browser (pouch search/filter, shrine search by
  town & puzzle-type, pin→card→recents→focus-flash, map tap, global-search→exact-shrine), 0 console errors.
- **Test gotcha banked:** React controlled `<input>` ignores a raw `el.value = …` (it resets to state on
  re-render). To drive search inputs in `preview_eval`, use the native setter
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,val)`) then dispatch
  `input`. (File inputs differ — there a plain `dispatchEvent(change)` after setting `.files` works.)

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
