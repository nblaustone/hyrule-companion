# 0005 — Game-agnostic data shell; BotW is game 1 of N

**Status:** accepted · 2026-06-15

**Chose:** The data model (region → section → step → items; runes; recipes; shrines; armor) is kept **generic
enough to wrap in a `GAMES` array** later, but we are **not** building the multi-game shell yet. Everything in v5
is BotW, addressed directly. The seam is acknowledged, not yet cut.

**Why:** The user's framing is "accomplish this first game" — depth on BotW now, breadth across games later (TotK,
OoT are the obvious next two). Premature abstraction would slow the thing that matters today (a complete, correct
BotW companion) for a generality we don't need yet. But naming the seam now keeps us from baking in BotW-only
assumptions that would be painful to unpick (e.g. hard-coding "Spirit Orbs / 4 = upgrade" into shared UI rather
than into the BotW data).

**Rejected:**
- *Build the `GAMES` wrapper + game picker now* — real work, zero payoff until game 2 exists, and it risks an
  abstraction that fits BotW's shrines/runes but not TotK's shrines-replacement or OoT's dungeons.
- *Hard-commit to BotW-only forever* — would force a rewrite when game 2 lands.

**Consequences:** When game 2 starts: lift `REGIONS`, `RUNES`, `RECIPES`, `SHRINES`, etc. into a `GAMES[gameId]`
map, add a top-level game switcher, and namespace the storage keys (`botw:progress` → `<game>:progress`). Until
then, keep BotW labels in the *data*, not the *components*, so the components stay reusable.
