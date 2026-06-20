#!/usr/bin/env node
/* v12.14: generate the materials + creatures compendium deep-research Workflow.
   Six categories (monster parts / ores & gems / dragon parts / ancient parts / special / creatures), each
   author→verify, sourced from Game8/Zelda Dungeon. Materials are framed by USES (armor upgrades, ancient gear,
   elixirs, selling) + sell value + where — complementing the Cook tab (which frames the edible ones by their
   cooking effect). Output appends to knowledge/compendium.json as cat "material" / "creature". */
import fs from "node:fs";

const body = `export const meta = {
  name: 'botw-materials-compendium',
  description: 'Deep-research BotW materials + creatures (uses, sell value, where) to round out the item compendium',
  phases: [
    { title: 'Author', detail: 'one agent per category compiles the full sourced list' },
    { title: 'Verify', detail: 'independently re-source for completeness + accuracy' },
  ],
};

const ITEM_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    category: { type: "string" },
    items: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        effect: { type: "string" },
        where: { type: "string" },
        sell: { type: "integer" },
      },
      required: ["name", "type", "effect", "where"],
    } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["category", "items"],
};

const CATS = [
  { key: "monster-parts", cat: "material", typeHint: "Monster Part", approx: 45, label: "MONSTER PARTS (Bokoblin/Moblin/Lizalfos horns·fangs·guts, Lynel horn·hoof·guts, Hinox guts, Molduga fin·guts, Keese wing·eyeball, Chuchu jelly, Octo balloon·tentacle, Wizzrobe rods? no — drops only, Pebblit/Talus give ore not parts, Stal-bones, Ancient parts go elsewhere)" },
  { key: "ores-gems", cat: "material", typeHint: "Ore / Gem", approx: 10, label: "ORES & GEMS (Flint, Amber, Opal, Luminous Stone, Ruby, Sapphire, Topaz, Diamond, Rock Salt, and any rare-ore drops)" },
  { key: "dragon-parts", cat: "material", typeHint: "Dragon Part", approx: 12, label: "DRAGON PARTS — for Dinraal, Naydra, and Farosh: scale, claw, Shard of Horn, Shard of Fang (which body part you must hit, and the temporary buff each gives when eaten/cooked)" },
  { key: "ancient-parts", cat: "material", typeHint: "Ancient Part", approx: 6, label: "ANCIENT PARTS (Ancient Screw, Ancient Spring, Ancient Gear, Ancient Shaft, Ancient Core, Giant Ancient Core) — Guardian drops used for ancient armor/weapons/rune upgrades" },
  { key: "special", cat: "material", typeHint: "Special", approx: 10, label: "SPECIAL / KEY MATERIALS (Star Fragment, Korok Seed, Spirit Orb, Wood, Rushroom is food→skip, Bomb? no; include the genuinely special non-food items like Star Fragment, Korok Seed, Spirit Orb, Wood, and any unique key materials)" },
  { key: "creatures", cat: "creature", typeHint: "", approx: 50, label: "CREATURES — the huntable/catchable wildlife (animals like boar/deer/bear/fox; birds; fish; frogs; lizards; insects/butterflies; and notable special creatures like the Lord of the Mountain, the Giant Horse, sand seals, dogs, Blupees). For each: what it is, where it lives, and what MATERIAL it yields when hunted/caught (or its special use)" },
];

const authorPrompt = (c) => \`You are compiling the COMPLETE list of \${c.label} in The Legend of Zelda: Breath of the Wild (Switch, the 2017 ORIGINAL). This feeds an offline item compendium where the player taps any entry to read what it is, what it's FOR, and where to get it.

RESEARCH exhaustively with WebSearch + WebFetch (Game8 and Zelda Dungeon publish full material/creature compendium tables with sell prices). Include EVERY base-game entry in this category — roughly \${c.approx}, but include all you can verify.

For EACH entry return:
- name: exact in-game name
- type: \${c.cat === "creature" ? "the creature class — one of Animal, Bird, Fish, Insect, Reptile, Amphibian, or Special" : '"' + c.typeHint + '"'}
- effect: one or two plain sentences — \${c.cat === "creature" ? "what the creature is + its behavior + the MATERIAL it gives you when hunted/caught (or its special use, e.g. a mount)" : "what it IS and what it's USED FOR — be concrete about uses: armor upgrades (name the set if notable), ancient gear/rune upgrades, elixir ingredient, Kilton/monster shop, or simply a valuable sell item. This is the 'what do I do with this drop?' answer."}
- where: where/how to obtain it (location, the enemy/creature that drops it, mining spot, dragon + where it flies, shop)
- sell: the shop sell price in rupees as an integer, if it has one (omit if it can't be sold or is unconfirmable)

HARD RULES (the guide's honesty law):
- EXCLUDE DLC-only items. EXCLUDE pure FOOD ingredients (fruits, mushrooms, vegetables, plain meat/fish used only for cooking) — those live in the Cook tab. (Monster parts and dragon parts DO belong here even though they also cook into elixirs, because their armor-upgrade/sell uses are the point.)
- Exact in-game names; real integer sell prices — do NOT invent a number; omit sell if unsure.
- Be COMPLETE; cross-check the full list before returning.
Return {category:"\${c.key}", items:[...], sources:[...]}.\`;

const verifyPrompt = (c, a) => \`Adversarially verify this BotW (Switch, 2017 original, NO DLC) list for category "\${c.key}" (\${c.label}). Axes: COMPLETENESS, USE-ACCURACY, and SELL-PRICE accuracy.

Proposed (\${(a && a.items || []).length} items):
\${JSON.stringify((a && a.items) || [], null, 1)}

Independently re-source (prefer a different guide than \${JSON.stringify((a && a.sources) || [])}) with WebSearch + WebFetch on Game8 / Zelda Dungeon. Then:
- COMPLETENESS: add every base-game entry missing.
- ACCURACY: confirm each name, its stated USE(s)\${c.cat === "creature" ? " and what material it yields" : " (armor upgrade set, ancient gear, elixir, sell)"}, the sell price (integer), and where. Fix errors in place.
- PURGE: remove DLC items, pure food ingredients (they belong in Cook), duplicates, and anything fabricated/unconfirmable.
Return the corrected, complete {category:"\${c.key}", items:[...], sources:[...], corrections:"<one line>"}.\`;

const results = await pipeline(
  CATS,
  (c) => agent(authorPrompt(c), { label: "author:" + c.key, phase: "Author", schema: ITEM_SCHEMA }),
  (a, c) => a ? agent(verifyPrompt(c, a), { label: "verify:" + c.key, phase: "Verify", schema: ITEM_SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((r) => r && Array.isArray(r.items) && r.items.length);
const byKey = Object.fromEntries(CATS.map((c) => [c.key, c]));
const flat = [];
for (const r of clean) { const c = byKey[r.category] || {}; for (const it of r.items) flat.push({ ...it, cat: c.cat || "material", type: it.type || c.typeHint || "" }); }
const counts = {};
for (const r of clean) counts[r.category] = r.items.length;
log("Materials/creatures: " + flat.length + " · " + JSON.stringify(counts));
return { categories: clean, flat, total: flat.length, counts };
`;

fs.writeFileSync("/tmp/materials-workflow.mjs", body);
console.log(`wrote /tmp/materials-workflow.mjs (${body.length} bytes) · 6 categories`);
