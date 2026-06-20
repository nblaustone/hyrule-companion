# v5 content plan — wiring the research into the app

> **Historical (v5).** This captures the original plan; the app has grown well past it (7 tabs, the Items tab is
> now a 410-entry Compendium, Guide is 10 segments, etc.). For current state see `CLAUDE.md` (Tabs & features +
> Roadmap) and `journal/learning-log.md`.

How the verified `knowledge/*.json` (from the `botw-research` workflow) becomes app surfaces. Goal: deepen the
game "in all its parts" without breaking the data-driven single-file model (ADR 0001) or the offline build
(ADR 0004). Everything below is **inlined data + small UI**, no runtime fetch.

## Tab layout (was 5, now 6)
`Status · Journey · Shrines · Items · Cook · Guide`

- **Shrines** *(new tab)* — all 120, grouped by the 15 tower regions, collapsible. Each row: name · category
  pill (puzzle/combat/blessing/quest) · one-line hint. A checkbox per shrine persists under `botw:progress`
  with id `shr_<region>_<n>`, and a header meter shows `done / 120` + Spirit-Orb math (÷4 = upgrades). Search box
  reused from Journey. This is the single biggest content add.
- **Journey** — unchanged walkthrough; gains nothing structural. (Region side-quests may surface here later.)
- **Items** — unchanged pouch (auto-filled from walkthrough `items[]`).
- **Cook** — deepened from `knowledge/cooking.json`: full effect table (12 effects), elixir column, dragon
  parts, high-value go-to recipes, the complete rule list. Keep the "you need this on the Plateau" flag.
- **Guide** *(expanded segments)* — a horizontal-scroll sub-nav, reference-only:
  `Runes · Tips · Armor · Fairies · Towers · Quests · Enemies · Koroks`.
  - **Armor** — cards from `knowledge/armor.json`: set · where · bonus · upgrade materials · priority tag.
  - **Fairies** — the 4 Great Fairy Fountains + unlock rupee costs (gate armor upgrades).
  - **Towers** — the 15 Sheikah towers + a climb tip each.
  - **Quests** — notable side quests grouped by region (Tarrey Town, horse god, shrine quests…).
  - **Enemies** — bestiary cards: name · tier · one-line "how to beat it".
  - **Koroks** — what they're for, Hestu cost curve, the common puzzle types, beginner hotspots.

## Data consts to add (top-level, inlined)
- `SHRINES` — `[{ region, regionName, name, location, category, oneLine, shrineQuest? }]` (~120).
- `TOWERS` — `[{ name, region, location, climbTip }]` (15).
- `GREAT_FAIRIES` — `[{ name, location, cost }]` (4).
- `ARMOR_SETS` — `[{ name, pieces, where, bonus, upgrade, priority? }]`.
- `SIDE_QUESTS` — `[{ region, name, giver, reward, oneLine }]`.
- `BESTIARY` — `[{ name, tier, tactic, drops? }]`.
- `KOROKS` — `{ what, hestu, puzzleTypes:[{type,how}], hotspots:[] }`.
- `COOKING` — replaces/extends `RECIPES`/`COOK_RULES` with effects + dragons + go-to recipes.

## Rules the integration honors
- **Don't invent** — only data that survived the adversarial verify + the 120/15/4 completeness audit ships.
  Anything the audit flagged as uncertain gets a visible "unverified" note rather than a confident line.
- **Additive** — no existing region/step/item id changes; shrine ids use a new `shr_` namespace so the
  walkthrough step counts and the pouch are untouched. `Reset` clears `shr_` too (same progress map).
- **Offline** — all of the above is inlined; the build still emits one self-contained `index.html`.
- **Spoiler-aware** — hints, not full solutions; categories let a player choose how much help they want.
