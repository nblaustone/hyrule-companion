# 0007 — v10: the interactive cooking tool (deterministic engine + sourced data)

**Status:** accepted · 2026-06-16

**Chose:** Turn the Cook tab from a static reference into an **interactive pot simulator** — the user's idea,
grounded in research, not invention. Two workflows ran first: (1) a player-pain study (6 angles across Reddit/
GameFAQs/UX critiques/existing calculators → a ranked feature spec) and (2) a sourced **per-ingredient table**
(8 categories × finder→adversarial-verifier, web-checked → `knowledge/cooking-ingredients.json`, **120
ingredients**). The research was unambiguous: the #1 pain is **opacity** (the game strips effect symbols from raw
ingredients, so you can't plan — "the most baffling design choice"), and the worst hurt is **silent waste**
(mixing two effects cancels both and you don't get the rare items back). So the build leads with what no wiki and
no GPS does: **it warns you before you waste anything.**

The Cook tab (`CookView`) now has five modes: **Make** (the pot — tap ≤5 ingredients → live predicted dish:
effect, tier, hearts, duration, crit), **I need…** (goal-first finder that decodes the backwards buzzwords —
Spicy=cold, Chilly=heat, heat≠fireproof — and loads a staple), **Ingredients** (every item with its effect
surfaced — the thing the game hides — + location + sell value), **Cookbook** (saved builds; the in-game cookbook
the game refuses to give, persisted to `botw:recipes`, folded into the backup blob, ADR 0002), and **Rules**
(the mechanics + dragon parts). The heart of it is `cookResult()`, a **pure, deterministic** predictor with
real-time **guardrails**: effect-cancel, critter-needs-monster-part, monster-part-in-food → Dubious,
inedible → Rock-Hard, Monster-Extract-kills-crit, past-max-tier, Hearty +25 cap, Fireproof-is-elixir-only.

**Why:** This is the single system BotW hides behind trial-and-error, and players already build external cookbooks
to cope — the clearest "fill this gap" signal in all the research. It is also the purest expression of the app's
thesis: not a *lookup* (you must know the proper noun) but a *companion that meets you in the moment* ("I'm cold,
what do I cook?"). And it's offline, original-art, single-file — no live game connection needed.

**Rejected:**
- *An LLM recipe generator* — the popular AI cooking tools hallucinate fake combos; that breaks law #1. The engine
  is deterministic, so it can never invent a recipe.
- *A frame-perfect calculator* — BotW's exact hearts/duration math has finicky edge cases. We encode the robust
  logic (effect, cancel, elixir validity, tier thresholds, crit conditions) exactly, and present hearts/duration
  as honest estimates (shown with **≈**) rather than fake precision. Honest-over-perfect (the three laws).
- *Removing the old reference view* — kept as `CookReference`, and it's the graceful fallback for any game with no
  ingredient table (TotK today): `CookView` renders the reference when `COOK_INGREDIENTS` is absent. Verified TotK
  still works, no crash.

**Consequences:**
- New build step: `build/assemble-cooking.mjs` reconciles the workflow output → `cooking-ingredients.json`
  (normalizes effects to the 11 buffs, encodes Hearty yellow-hearts as a `hearty:+N` bonus the engine parses,
  tags dragon/special semantics, shortens locations, dedups, refuses to write unless all 11 effects are covered).
  `inline-data.mjs` now inlines it into `GEN:DATA`, and the `GAMES.botw` bundle exposes `COOK_INGREDIENTS`
  (per-game, so TotK's is absent → fallback). Pipeline: assemble-cooking → inline-data → build.
- The ingredient table is the data foundation for future depth (cook-from-my-inventory enumerator, money
  optimizer) — both "nice" features in the spec that reuse the same table and engine, no new data.
- TotK can get the same tool later with its own sourced table (its cooking adds Bright/Hearty-shift, dragon parts
  differ) — same `CookView`, same engine, a `totk` ingredient table.
