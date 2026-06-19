#!/usr/bin/env node
/* v12.9: generate the "playthrough depth" Workflow — three sourced datasets in one run:
   (A) per-set ARMOR upgrade recipes (★1–★4 full-set materials + rupee cost + a farm note),
   (B) an ECONOMY/farming guide (rupee earners, where to farm key materials, money tips),
   (C) enriched KOROK puzzle types (what-you-see / what-to-do / category for the solver).
   All author→adversarially-verify, web-sourced (Game8/Zelda Dungeon/Thonky/Zeldapedia).
   Workflow scripts can't read files, so inputs are embedded as consts. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARMOR = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "armor.json"), "utf8"));
const KOROKS = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "koroks.json"), "utf8"));

const SETS = ARMOR.sets.map((s) => ({ name: s.name, pieces: s.pieces, where: s.where, bonus: s.bonus }));
const KOROK_CURRENT = KOROKS.puzzleTypes;

const body = `export const meta = {
  name: 'botw-playthrough-depth',
  description: 'Author + verify armor upgrade recipes, an economy/farming guide, and enriched Korok puzzle types',
  phases: [
    { title: 'Armor', detail: 'per-set ★1–★4 upgrade recipes (materials + rupees), author→verify' },
    { title: 'Economy', detail: 'rupee earners, material farming, money tips' },
    { title: 'Koroks', detail: 'enriched puzzle types for the solver' },
  ],
};

const SETS = ${JSON.stringify(SETS)};
const KOROK_CURRENT = ${JSON.stringify(KOROK_CURRENT)};

/* ============ (A) ARMOR upgrade recipes ============ */
const ARMOR_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" },
    tiers: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        star: { type: "integer" },
        rupees: { type: "integer" },
        materials: { type: "array", items: {
          type: "object", additionalProperties: false,
          properties: { item: { type: "string" }, qty: { type: "integer" } },
          required: ["item", "qty"],
        } },
      },
      required: ["star", "materials"],
    } },
    farm: { type: "string" },
    note: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["name", "tiers"],
};

const armorAuthor = (s) => \`You are compiling the EXACT armor-upgrade recipe for ONE armor set in The Legend of Zelda: Breath of the Wild (Switch, the 2017 ORIGINAL — not Tears of the Kingdom). This data must be precise; it tells a player exactly what to farm before visiting a Great Fairy.

Set: \${s.name}
Pieces: \${s.pieces}
Where you get it: \${s.where}
Set bonus/effect: \${s.bonus}

RESEARCH the upgrade table from a reliable source (Game8 and Zelda Dungeon publish per-piece upgrade tables) using WebSearch + WebFetch. A Great Fairy upgrades one piece at a time; each star level (★1, ★2, ★3, ★4) has a recipe per piece plus a rupee cost per piece.

OUTPUT, for EACH star level the set supports (usually ★1–★4), the TOTAL needed to take the WHOLE set (all of its pieces) up by that one star:
- sum the per-piece material quantities across all pieces → materials:[{item, qty}] (set-total quantities)
- sum the per-piece rupee cost → rupees (set-total for that star step)
Most 3-piece sets use the SAME recipe for all three pieces at a given star, so the set-total is usually 3× the per-piece amounts — but VERIFY, some differ. A 1-piece set (e.g. a tunic) is just that piece. If a set cannot be upgraded at all (rare), return an empty tiers array and explain in note.

ALSO provide:
- farm: one plain sentence on where to get this set's signature/hardest materials (e.g. "Star Fragments fall from the night sky; Star Fragments and Luminous Stone…").
- note: any caveat (e.g. "needs the Great Fairy at level X", "★3–4 need Star Fragments", "amiibo-only set").

HARD RULES (honesty law): these are fixed game numbers — DO NOT GUESS. If you cannot confirm an exact quantity or rupee cost, leave that star out and say so in note rather than inventing it. Use exact in-game material names (e.g. "Bokoblin Horn", "Star Fragment", "Lynel Guts", "Smotherwing Butterfly"). Return {name:"\${s.name}", tiers:[{star,rupees,materials:[{item,qty}]}], farm, note, sources}.\`;

const armorVerify = (s, a) => \`Adversarially verify the armor-upgrade recipe for "\${s.name}" in BotW (Switch, 2017 original). These are EXACT game numbers, so be strict.

Proposed:
\${JSON.stringify(a || {}, null, 1)}

Independently re-source the per-piece upgrade table (prefer a different site than \${JSON.stringify((a && a.sources) || [])}) with WebSearch + WebFetch on Game8 / Zelda Dungeon. For EACH star level, re-derive the set-total: confirm each material name, its set-total quantity (per-piece × piece count, accounting for any piece that differs), and the set-total rupee cost. Fix every wrong number in place. If you cannot confirm a value, REMOVE that star and note it — never ship a guessed quantity. Confirm exact in-game material names. Return the corrected {name:"\${s.name}", tiers:[...], farm, note, sources, corrections:"<one line>"}.\`;

/* ============ (B) ECONOMY / farming ============ */
const ECON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    rupees: { type: "array", items: { type: "object", additionalProperties: false, properties: { method: { type: "string" }, detail: { type: "string" } }, required: ["method", "detail"] } },
    farming: { type: "array", items: { type: "object", additionalProperties: false, properties: { item: { type: "string" }, where: { type: "string" }, tip: { type: "string" } }, required: ["item", "where"] } },
    tips: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["rupees", "farming", "tips"],
};

const econRupees = \`Research the best ways to EARN RUPEES in The Legend of Zelda: Breath of the Wild (Switch, 2017 original) using WebSearch + WebFetch (Game8, Zelda Dungeon, Polygon money guides). Give 7–10 concrete, beginner-usable earners as {method, detail}: e.g. selling gems (and which/where to mine), the dragon-scale/horn farming, cooking + selling specific dishes, selling Bokoblin/Lizalfos parts, the Lurelin/Tarrey Town and the Ridgeland luck, the Gut Check Rock challenge, the snowball bowling minigame, the horse-armor/Pondo prizes, the rare Luminous-stone mining, and the "Rushroom/Hylian Shroom" sell stacks. Each detail is one practical sentence (where + roughly how lucrative). Honesty: don't overstate rates you can't confirm. Return {rupees:[{method,detail}], farming:[], tips:[], sources:[...]} (leave farming/tips empty here).\`;

const econFarming = \`Research WHERE TO RELIABLY FARM the materials BotW (Switch, 2017 original) players need most — especially armor-upgrade materials — using WebSearch + WebFetch (Game8/Zelda Dungeon). Give 12–16 entries as {item, where, tip}: cover the high-demand upgrade mats and consumables, e.g. Star Fragment, Bokoblin/Moblin/Lizalfos parts (horns/fangs/guts), Lynel parts (Silver/Gold), the elemental bugs (Cold Darner, Warm Darner, Summerwing/Smotherwing Butterfly, Sunset/Sunshroom etc.), Hearty Durian/Big Hearty Radish, the gemstones (mining nodes / Talus / the Goron rare-ore), dragon parts (Dinraal/Naydra/Farosh — where & when each appears), Ancient parts (Guardian farming), and key fish/meat. where = the concrete place(s); tip = the reliable method (time of day, blood-moon respawn, a specific spot). Honesty law: only list spots you can confirm. Return {rupees:[], farming:[{item,where,tip}], tips:[], sources:[...]}.\`;

const econTips = \`Give 6–9 money/economy DO's and DON'Ts for BotW (Switch, 2017 original) — the things that save or waste a beginner's rupees/materials. Verify with WebSearch (Game8/Zelda Dungeon). Examples to confirm and include: NEVER sell Ancient parts/Star Fragments (you need them for armor & ancient gear), armor bought from shops can be sold back, cook before selling (dishes sell for more than raw mats), keep dragon parts for upgrades not selling, the Hylian Shield is replaceable (Lockup in Hyrule Castle), Great Fairy fees rise (100/500/1000/2000), and buy arrows in bulk when stock is cheap. Each tip is one plain sentence. Return {rupees:[], farming:[], tips:["..."], sources:[...]}.\`;

const econVerify = (combined) => \`Adversarially fact-check this BotW (Switch, 2017 original) economy/farming guide with independent WebSearch + WebFetch (Game8/Zelda Dungeon). Verify each rupee method actually works and isn't overstated, each farming location is correct (esp. dragon spawn spots/times and material drop sources), and each tip is true (esp. "don't sell Ancient parts/Star Fragments" and the Great Fairy fee amounts). Fix or REMOVE anything wrong or unverifiable. Keep it concise and beginner-first. Return the corrected {rupees, farming, tips, sources, corrections:"<one line>"}.

To verify:
\${JSON.stringify(combined, null, 1)}\`;

/* ============ (C) KOROK puzzle types ============ */
const KOROK_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    puzzleTypes: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        type: { type: "string" },
        see: { type: "string" },
        do: { type: "string" },
        category: { type: "string", enum: ["rocks", "place", "shoot", "race", "spin", "dive", "light", "offering", "other"] },
      },
      required: ["type", "see", "do", "category"],
    } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["puzzleTypes"],
};

const korokAuthor = \`Build a complete, beginner-friendly catalogue of KOROK SEED PUZZLE TYPES in The Legend of Zelda: Breath of the Wild (Switch, 2017 original) so a player can identify what they're looking at and solve it. Research the full list with WebSearch + WebFetch (Game8, Zelda Dungeon, Polygon "every korok puzzle type").

Cover ALL the common types (~15–18), including the ones in this current shorter list and the ones it's missing:
\${JSON.stringify(KOROK_CURRENT, null, 1)}

Missing types to add if confirmed: rock/metal-cube spinning to match a pair, pinwheel + shoot the moving target, floating/sparkling acorn or fairy-lights to chase and touch, lone-tree hanging basket, boulder "golf" into a hole, block-pull/slide into a socket, sand or snow mound (dig/uncover), a single off-color flower among many (touch the odd one), a tree stump pattern, magnetic/metal box onto a switch, a stack/pyramid to complete, lily-pad or water ring to dive through.

For EACH type return {type (short name), see (what the player notices in the world — the visual tell), do (the exact solution in one or two sentences), category (one of: rocks, place, shoot, race, spin, dive, light, offering, other)}. Keep see/do plain and concrete. Honesty: only include real, confirmed types. Return {puzzleTypes:[...], sources:[...]}.\`;

const korokVerify = (k) => \`Adversarially verify this catalogue of BotW (Switch, 2017 original) Korok puzzle types with independent WebSearch + WebFetch (Game8/Zelda Dungeon/Polygon). Confirm each type is real and its "do" solution is correct (e.g. flower trails are touched IN ORDER, rock-in-ring needs the matching rock placed, races need you to reach the goal in time). Fix wrong solutions, merge duplicates, drop anything unverifiable. Ensure each has a clear see + do + valid category. Return the corrected {puzzleTypes:[...], sources, corrections:"<one line>"}.

To verify:
\${JSON.stringify((k && k.puzzleTypes) || [], null, 1)}\`;

/* ============ run ============ */
phase("Armor");
const armor = await pipeline(
  SETS,
  (s) => agent(armorAuthor(s), { label: "author:" + s.name, phase: "Armor", schema: ARMOR_SCHEMA }),
  (a, s) => a ? agent(armorVerify(s, a), { label: "verify:" + s.name, phase: "Armor", schema: ARMOR_SCHEMA }) : null,
);
const armorClean = armor.filter(Boolean).filter((r) => r && Array.isArray(r.tiers));
log(\`Armor: \${armorClean.length}/\${SETS.length} sets\`);

phase("Economy");
const econParts = await parallel([
  () => agent(econRupees, { label: "author:rupees", phase: "Economy", schema: ECON_SCHEMA }),
  () => agent(econFarming, { label: "author:farming", phase: "Economy", schema: ECON_SCHEMA }),
  () => agent(econTips, { label: "author:tips", phase: "Economy", schema: ECON_SCHEMA }),
]);
const econMerged = {
  rupees: (econParts[0] && econParts[0].rupees) || [],
  farming: (econParts[1] && econParts[1].farming) || [],
  tips: (econParts[2] && econParts[2].tips) || [],
  sources: econParts.filter(Boolean).flatMap((p) => p.sources || []),
};
const economy = await agent(econVerify(econMerged), { label: "verify:economy", phase: "Economy", schema: ECON_SCHEMA }) || econMerged;
log(\`Economy: \${economy.rupees.length} earners · \${economy.farming.length} farms · \${economy.tips.length} tips\`);

phase("Koroks");
let koroks = await agent(korokAuthor, { label: "author:koroks", phase: "Koroks", schema: KOROK_SCHEMA });
if (koroks) koroks = await agent(korokVerify(koroks), { label: "verify:koroks", phase: "Koroks", schema: KOROK_SCHEMA }) || koroks;
log(\`Koroks: \${koroks && koroks.puzzleTypes ? koroks.puzzleTypes.length : 0} puzzle types\`);

return { armor: armorClean, economy, koroks };
`;

fs.writeFileSync("/tmp/depth-workflow.mjs", body);
console.log(`wrote /tmp/depth-workflow.mjs (${body.length} bytes) · ${SETS.length} armor sets, ${KOROK_CURRENT.length} korok types to expand`);
