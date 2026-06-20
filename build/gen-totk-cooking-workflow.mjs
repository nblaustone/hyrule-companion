#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK cooking-ingredient Workflow. Authors the ingredient table that powers
   the interactive CookView/cookResult engine — one agent per role-group (effect foods, neutral fillers,
   critters, monster parts, dragon parts, specials), then a verifier reconciles effects + completeness.
   Output → knowledge/totk/cooking-ingredients.json (flat array of
   {name, role, cat, effect?, potency?, hearts, sell, where, bonus?, timeSec?}). Shapes match BotW's
   cooking-ingredients.json so the existing engine works unchanged. */
import fs from "node:fs";

const body = `export const meta = {
  name: 'totk-cooking-ingredients',
  description: 'Author + verify the TotK cooking-ingredient table for the interactive pot simulator',
  phases: [
    { title: 'Author', detail: 'one agent per ingredient role-group compiles the sourced table' },
    { title: 'Verify', detail: 'reconcile effects, potency, hearts, sell + completeness' },
  ],
};

const ING_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    group: { type: "string" },
    ingredients: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        name: { type: "string" },
        role: { type: "string", enum: ["effect", "neutral", "critter", "monster", "dragon", "special"] },
        cat: { type: "string" },
        effect: { type: "string" },
        potency: { type: "integer" },
        hearts: { type: "number" },
        sell: { type: "integer" },
        where: { type: "string" },
        bonus: { type: "string" },
        timeSec: { type: "integer" },
      },
      required: ["name", "role", "cat", "hearts", "where"],
    } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["group", "ingredients"],
};

const EFFECTS = "Hearty (extra yellow hearts — set bonus:'hearty:+N' to the number of bonus hearts each gives, and leave potency=1), Energizing (refills stamina wheel), Enduring (overfills stamina, gold), Spicy (cold resistance / warm), Chilly (heat resistance), Electro (shock resistance), Fireproof (flame resistance — TotK lets this be a FOOD via Fireproof Lizard? no — keep Fireproof as a critter-elixir only), Mighty (attack up), Tough (defense up), Hasty (move speed up), Sneaky (stealth up), Bright (glow in the dark), Sunny (heals gloom-cracked hearts — Sundelion/Sun Pumpkin)";

const GROUPS = [
  { key: "effect-foods", role: "effect", n: 45, desc: \`EFFECT-GIVING FOODS (fruits, vegetables, mushrooms, meats, fish, herbs that grant a cooking effect). For EACH: role:"effect"; cat (fruit/veg/mushroom/meat/fish/herb/plant); effect (one of: \${EFFECTS}); potency (1 low, 2 mid, 3 high — the per-item effect strength); hearts (raw hearts it restores cooked, e.g. an apple ~0.5, a Hearty ingredient is full-heal so put hearts=0 and use bonus); for Hearty items set bonus to "hearty:+N" (the bonus yellow hearts); timeSec (the per-item buff seconds it adds, ~30-90 for most, omit for Hearty/Energizing); sell; where.\` },
  { key: "neutral", role: "neutral", n: 20, desc: \`NEUTRAL FILLER FOODS (no effect — plain hearts: most fruits/meat/fish/eggs/butter/milk/rice/wheat/sugar/rock salt/Hylian foods). For EACH: role:"neutral"; cat; NO effect; hearts (raw cooked hearts); sell; where.\` },
  { key: "critters", role: "critter", n: 22, desc: \`ELIXIR CRITTERS (the bugs/lizards/frogs used WITH a monster part to brew elixirs). For EACH: role:"critter"; cat:"critter"; effect (the elixir effect it grants, e.g. Warm Darner→Hasty? VERIFY each TotK critter's effect: Hightail Lizard→Hasty, Hot-Footed Frog→Hasty, Tireless Frog→Enduring, Energetic Rhino Beetle→Energizing, Cold Darner→Spicy?, Warm Darner→Chilly?, Electric Darner→Electro, Fireproof Lizard→Fireproof, Smotherwing Butterfly→Fireproof, Bladed/Rugged Rhino Beetle→Mighty/Tough, Sunset Firefly→Sneaky, Deep Firefly→Bright, Sticky Lizard/Frog→slip-resist); potency (1-3); hearts:0; timeSec (~30-120); sell; where.\` },
  { key: "monster", role: "monster", n: 16, desc: \`MONSTER PARTS used in elixirs (horns/fangs/guts/etc. — they set the elixir DURATION, no effect of their own). For EACH: role:"monster"; cat:"monster"; NO effect; hearts:0; timeSec (the seconds it contributes to elixir duration — fangs ~50, horns ~70, guts ~120, by tier); sell; where.\` },
  { key: "dragon", role: "dragon", n: 8, desc: \`DRAGON PARTS used in cooking (Dinraal/Naydra/Farosh/Light Dragon scales/claws/fangs/horns — they add long duration and guarantee a crit; a Dragon HORN shard caps the dish at 30:00). For EACH: role:"dragon"; cat:"dragon"; NO effect; hearts:0; timeSec (scale ~90, claw ~210, fang ~630, horn = 1800); sell:0 (can't sell); where.\` },
  { key: "special", role: "special", n: 8, desc: \`SPECIAL cooking items (Star Fragment → guarantees a crit; Monster Extract → randomizes/cancels crit; a Fairy → Fairy Tonic / extra hearts; Sundelion + Sun Pumpkin already covered as Sunny effect-foods, but if listed here mark role:"effect" effect:"Sunny"). For EACH: role:"special"; cat:"special"; hearts (if any); sell; where; effect (a short note of what it does in the pot).\` },
];

const authorPrompt = (g) => \`You are compiling part of the cooking-ingredient table for the interactive Cooking tool in an offline companion to The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild). The table drives a pot simulator that predicts a dish's effect/tier/duration, so the per-item data must be right.

Compile this group: \${g.desc}

RESEARCH with WebSearch + WebFetch (Game8 TotK ingredient/effect lists, Zelda Dungeon). Aim for ~\${g.n} items, completeness over padding.

HARD RULES (honesty law):
- TotK items only. Hearty Durian does NOT exist in TotK — use real TotK Hearty items (Hearty Radish/Truffle/Bass/Salmon/Big Hearty…).
- effect names must be from this set exactly: Hearty, Energizing, Enduring, Spicy, Chilly, Electro, Fireproof, Mighty, Tough, Hasty, Sneaky, Bright, Sunny. Spicy = COLD resistance (warms you); Chilly = HEAT resistance (cools you) — do not swap.
- Don't invent potency/timeSec/sell you can't reasonably source; if unsure, give your best-sourced estimate consistent with how the item behaves, and keep it sane.
Return {group:"\${g.key}", ingredients:[...], sources:[...]}.\`;

const verifyPrompt = (g, a) => \`Adversarially verify this TotK cooking-ingredient group "\${g.key}". Use independent WebSearch + WebFetch (Game8 TotK / Zelda Dungeon). Confirm: each item is a real TotK ingredient; effect assignments are correct (esp. Spicy=cold-resist vs Chilly=heat-resist not swapped; each critter's elixir effect; Sundelion/Sun Pumpkin=Sunny gloom-cure); Hearty items use bonus "hearty:+N"; role/cat are right; potency/timeSec/hearts/sell are sane. Add any obviously-missing common item. Remove BotW-only items (e.g. Hearty Durian) and fabrications. Return the corrected {group:"\${g.key}", ingredients:[...], sources:[...], corrections:"<one line>"}.

To verify (\${(a && a.ingredients || []).length} items):
\${JSON.stringify((a && a.ingredients) || [], null, 1)}\`;

const results = await pipeline(
  GROUPS,
  (g) => agent(authorPrompt(g), { label: "author:" + g.key, phase: "Author", schema: ING_SCHEMA }),
  (a, g) => a ? agent(verifyPrompt(g, a), { label: "verify:" + g.key, phase: "Verify", schema: ING_SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((r) => r && Array.isArray(r.ingredients) && r.ingredients.length);
// flatten + dedupe by name (later group wins ties only if earlier missing)
const seen = new Map();
for (const r of clean) for (const it of r.ingredients) { if (!seen.has(it.name)) seen.set(it.name, it); }
const flat = [...seen.values()];
const byEff = {};
for (const it of flat) if (it.effect) byEff[it.effect] = (byEff[it.effect] || 0) + 1;
log("TotK ingredients: " + flat.length + " · effects covered: " + Object.keys(byEff).join(", "));
return { ingredients: flat, total: flat.length, effects: byEff };
`;

fs.writeFileSync("/tmp/totk-cooking-workflow.mjs", body);
console.log(`wrote /tmp/totk-cooking-workflow.mjs (${body.length} bytes)`);
