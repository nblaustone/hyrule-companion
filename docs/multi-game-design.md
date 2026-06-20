# Multi-game design (BotW + TotK + beyond) — ADR 0005 made real

> **Architecture still current** (the `GAMES` wrapper + per-game `key` remount is unchanged). Note the per-game
> bundle has since grown (e.g. `ECONOMY`, `COMPENDIUM`, `MAP_BEASTS`); the live list lives in `build/inline-data.mjs`
> and `CLAUDE.md`. **Rule learned since: any BotW-only const must degrade when TotK lacks it — TotK is the canary.**

How the single-game app becomes game-aware **without** rewriting the 1600-line component or risking the
polished BotW experience. The trick: a thin wrapper + per-game `key` remount + shadowing the data globals.

## Shape
- **`GAMES`** (defined at EOF, after all data consts): `{ botw: {...}, totk: {...} }`. Each game bundles its
  data: `REGIONS, SHRINES, ARMOR, BESTIARY, COOKING, KOROKS, WORLD, SIDE_QUESTS, TOWERS, GREAT_FAIRIES,
  REGION_MAPS, RUNES, TIPS, COOK_RULES, RECIPES, CATS, ROADMAP, STATUS_RUNES, CHAMPIONS, MAP_NODES` + a
  `{ id, label, short }`. BotW's bundle just references the existing module-global consts (no data moves).
- **Wrapper** = the default export `HyruleCompanion()`: owns `game` state (persisted `hyrule:game`), renders
  `<HyruleGame key={game} game={game} setGame={setGame} games={GAMES} />`. The **`key={game}` forces a clean
  remount** on switch, so the load effect naturally re-reads the new game's storage — no load/save race.
- **`HyruleGame({ game, setGame, games })`** = today's big component, with two changes at the top:
  1. `const G = games[game];` then **destructure G to shadow the module globals** (`const { REGIONS, SHRINES,
     … } = G;`) — the entire existing body keeps working, now pointed at the active game's data.
  2. Storage keys go through `const K = (s) => game + ":" + s;` → `K("progress")` = `botw:progress` for BotW
     (so **existing user data is preserved unchanged**) and `totk:progress` for TotK. `hyrule:prefs` (spoiler)
     and `hyrule:game` stay game-agnostic.
  - `region`/`openSections` defaults derive from `G.REGIONS[0]` instead of hard-coded `"plateau"`/`{awk:true}`.

## The few sub-components that read globals (must take props for the non-active game)
- `HyruleMap` → pass `shrines={SHRINES} nodes={MAP_NODES}`.
- `SearchOverlay` → pass a `data` bundle (`REGIONS, SHRINES, ARMOR, BESTIARY, RECIPES, SIDE_QUESTS, TOWERS`).
- `ShrinesView` → pass `regionMaps={REGION_MAPS}`.
- `RegionMap` already takes `map`/`shrines` as props — fine. `Glyph`/`StyleBlock`/`KIND_META`/`SHRINE_CAT`/
  `ENEMY_TIER` are game-agnostic — leave as globals.

## Game picker
A small segmented control (`GamePicker`) at the top of the **Status** tab: one pill per game in `GAMES`. Hidden
when only one game exists. Switching sets `game` → wrapper remounts `HyruleGame` → the new game loads.

## TotK specifics (when content lands)
- New consts `TOTK_REGIONS` (walkthrough), `TOTK_SHRINES` (152), `TOTK_*` references, and a `TOTK_MAP_NODES`
  whose **keys match the TotK shrine regionKeys** (great_sky_island, sky, central, …). TotK's surface map ≈
  BotW geography, but the region set differs, so it needs its own node layout (+ a coords pass for per-region
  maps, like `region-maps.json`).
- TotK's abilities replace runes (`STATUS_RUNES` → the 5 powers); champions → the sage abilities; `ROADMAP` →
  TotK post-game (152 shrines, 1000 Koroks, Lightroots/Depths, etc.).
- Honest gaps get marked, same as BotW. The walkthrough launches at "v1" depth and can be refined like BotW's.

## Why a remount, not in-place reload
Switching games is rare; a full remount is simpler and race-free vs. juggling `loaded`-gated re-loads across
five state slices. The service worker makes the (in-memory) remount instant. Decided to favor correctness over
a few ms of state reuse.
