#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK "playthrough depth" Workflow — five sourced datasets in one run:
   (A) per-set ARMOR upgrade recipes (★1–★4 full-set materials + a farm note),
   (B) an ECONOMY/farming guide (rupee earners, where to farm key materials, money tips),
   (C) enriched KOROK puzzle types (what-you-see / what-to-do / category for the solver),
   (D) the 15 Skyview TOWERS (location + how to activate/launch),
   (E) the 4 Great FAIRIES (location + how to unlock via the troupe).
   All author→adversarially-verify, web-sourced (Game8 TotK / Zelda Dungeon / IGN). Outputs →
   knowledge/totk/{armor-tiers,economy,koroks,towers,great-fairies}.json. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));
const SETS = APP.ARMOR.sets.map((s) => ({ name: s.name, pieces: s.pieces, where: s.where, bonus: s.bonus }));

const body = `export const meta = {
  name: 'totk-playthrough-depth',
  description: 'Author + verify TotK armor upgrade recipes, an economy/farming guide, Korok puzzle types, Skyview Towers, and Great Fairies',
  phases: [
    { title: 'Armor', detail: 'per-set ★1–★4 upgrade recipes (materials + rupees), author→verify' },
    { title: 'Economy', detail: 'rupee earners, material farming, money tips' },
    { title: 'Koroks', detail: 'puzzle types for the solver' },
    { title: 'Towers', detail: 'the 15 Skyview Towers' },
    { title: 'Fairies', detail: 'the 4 Great Fairies + how to unlock them' },
  ],
};

const SETS = ${JSON.stringify(SETS)};

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
        materials: { type: "array", items: { type: "object", additionalProperties: false, properties: { item: { type: "string" }, qty: { type: "integer" } }, required: ["item", "qty"] } },
      },
      required: ["star", "materials"],
    } },
    farm: { type: "string" }, note: { type: "string" },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["name", "tiers"],
};
const armorAuthor = (s) => \`You are compiling the EXACT armor-upgrade recipe for ONE armor set in The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild). This data must be precise; it tells a player exactly what to farm before visiting a Great Fairy.

Set: \${s.name}
Pieces: \${s.pieces}
Where you get it: \${s.where}
Set bonus/effect: \${s.bonus}

RESEARCH the upgrade table from a reliable TotK source (Game8 and Zelda Dungeon publish per-piece upgrade tables) using WebSearch + WebFetch. A Great Fairy upgrades one piece at a time; each star level (★1–★4) has a recipe per piece plus a rupee cost per piece.

OUTPUT, for EACH star level the set supports (usually ★1–★4), the TOTAL needed to take the WHOLE set (all of its pieces) up by that one star:
- sum the per-piece material quantities across all pieces → materials:[{item, qty}] (set-total quantities)
- sum the per-piece rupee cost → rupees (set-total for that star step)
Most multi-piece sets share the recipe across pieces at a given star, so the set-total is usually (piece count)× the per-piece amounts — but VERIFY; some differ, and many TotK sets are a single piece (head-only, e.g. the various caps/masks). If a set CANNOT be upgraded (e.g. the Champion's Leathers, amiibo-only or fixed sets), return an empty tiers array and explain in note.

ALSO provide:
- farm: one plain sentence on where to get this set's signature/hardest materials (e.g. "Star Fragments fall from the night sky; Gleeok parts come from the three Gleeok types…").
- note: any caveat (e.g. "single-piece set", "★3–4 need Gleeok/Lynel parts", "amiibo-only", "needs the Great Fairy unlocked").

HARD RULES (honesty law): these are fixed game numbers — DO NOT GUESS. If you cannot confirm an exact quantity or rupee cost, leave that star out and say so in note rather than inventing it. Use exact TotK material names (e.g. "Bokoblin Horn", "Star Fragment", "Lynel Guts", "Fire Gleeok Horn", "Zonaite"). Return {name:"\${s.name}", tiers:[{star,rupees,materials:[{item,qty}]}], farm, note, sources}.\`;
const armorVerify = (s, a) => \`Adversarially verify the armor-upgrade recipe for "\${s.name}" in Tears of the Kingdom (Switch, 2023). These are EXACT game numbers, so be strict.

Proposed:
\${JSON.stringify(a || {}, null, 1)}

Independently re-source the per-piece upgrade table (prefer a different site than \${JSON.stringify((a && a.sources) || [])}) with WebSearch + WebFetch on Game8 / Zelda Dungeon. For EACH star level, re-derive the set-total: confirm each material name (these must be TotK materials, not BotW), its set-total quantity (per-piece × piece count, accounting for any piece that differs), and the set-total rupee cost. Fix every wrong number in place. If you cannot confirm a value, REMOVE that star and note it — never ship a guessed quantity. Return the corrected {name:"\${s.name}", tiers:[...], farm, note, sources, corrections:"<one line>"}.\`;

/* ============ (B) ECONOMY / farming ============ */
const ECON_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    rupees: { type: "array", items: { type: "object", additionalProperties: false, properties: { method: { type: "string" }, detail: { type: "string" } }, required: ["method", "detail"] } },
    farming: { type: "array", items: { type: "object", additionalProperties: false, properties: { item: { type: "string" }, where: { type: "string" }, tip: { type: "string" } }, required: ["item", "where"] } },
    tips: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["rupees", "farming", "tips"],
};
const econRupees = \`Research the best ways to EARN RUPEES in The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023) using WebSearch + WebFetch (Game8 TotK, Zelda Dungeon, IGN money guides). Give 7–10 concrete, beginner-usable earners as {method, detail}: e.g. selling gems mined from ore (and where, incl. the Depths), selling cooked dishes (which sell high), selling monster parts in bulk, the Gerudo "All-Clothing Store"/jewelry trade, the well/cave Luminous Stone, selling Zonai capsules?, the dye/armor flips, the Hateno or Tarrey Town opportunities, and any reliable minigame payouts. Each detail is one practical sentence (where + roughly how lucrative). Honesty: don't overstate rates you can't confirm. Return {rupees:[{method,detail}], farming:[], tips:[], sources:[...]} (leave farming/tips empty here).\`;
const econFarming = \`Research WHERE TO RELIABLY FARM the materials TEARS OF THE KINGDOM (Switch, 2023) players need most — especially armor-upgrade materials and Zonaite — using WebSearch + WebFetch (Game8 TotK / Zelda Dungeon). Give 12–16 entries as {item, where, tip}: cover high-demand upgrade mats and consumables, e.g. Star Fragment, Bokoblin/Moblin/Lizalfos/Horriblin parts, Lynel parts, Gleeok parts (Fire/Frost/Thunder/King), the elemental critters/bugs, Zonaite & Large Zonaite (Depths mining / construct drops), gems via Rare Ore Deposits and the Depths, dragon parts (Dinraal/Naydra/Farosh/Light Dragon — where & when each appears), Brightbloom & Giant Brightbloom Seeds, and key Hearty/Sundelion ingredients. where = the concrete place(s); tip = the reliable method (time of day, Blood Moon respawn, a specific spot/Lightroot). Honesty law: only list spots you can confirm. Return {rupees:[], farming:[{item,where,tip}], tips:[], sources:[...]}.\`;
const econTips = \`Give 6–9 money/economy DO's and DON'Ts for TEARS OF THE KINGDOM (Switch, 2023) — things that save or waste a beginner's rupees/materials. Verify with WebSearch (Game8 TotK/Zelda Dungeon). Examples to confirm and include: the Bargainer Statues in the Depths buy things for POES (not rupees) and you should hoard Poes for their gear/lanterns; don't sell parts you need for armor upgrades (Lynel/Gleeok/dragon parts); cook before selling (dishes sell for more than raw); keep Star Fragments for upgrades; Zonaite is for Zonai Charges/battery (don't sell it); the Hylian Shield is recoverable; buy arrows in bulk when cheap; the Great Fairy unlocking is via the troupe, not a rupee fee. Each tip is one plain sentence. Return {rupees:[], farming:[], tips:["..."], sources:[...]}.\`;
const econVerify = (combined) => \`Adversarially fact-check this TEARS OF THE KINGDOM (Switch, 2023) economy/farming guide with independent WebSearch + WebFetch (Game8 TotK/Zelda Dungeon/IGN). Verify each rupee method works and isn't overstated, each farming location is correct (esp. dragon spawn spots/times, Zonaite sources, and Depths mining), and each tip is true (esp. the Bargainer Statues using Poes, "don't sell parts you need", and that Great Fairies unlock via the troupe not a fee). These must be TotK facts, not BotW. Fix or REMOVE anything wrong or unverifiable. Return the corrected {rupees, farming, tips, sources, corrections:"<one line>"}.

To verify:
\${JSON.stringify(combined, null, 1)}\`;

/* ============ (C) KOROK puzzle types ============ */
const KOROK_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    what: { type: "string" }, hestu: { type: "string" },
    totalSeeds: { type: "integer" }, maxSeeds: { type: "integer" },
    puzzleTypes: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { type: { type: "string" }, see: { type: "string" }, do: { type: "string" }, category: { type: "string", enum: ["rocks", "place", "shoot", "race", "spin", "dive", "light", "offering", "carry", "build", "other"] } },
      required: ["type", "see", "do", "category"],
    } },
    hotspots: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["what", "hestu", "puzzleTypes", "hotspots"],
};
const korokAuthor = \`Build a complete, beginner-friendly catalogue of KOROK SEED PUZZLE TYPES in The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023) so a player can identify what they're looking at and solve it. Research the full list with WebSearch + WebFetch (Game8 TotK, Zelda Dungeon, "every korok puzzle type TotK").

Provide:
- what: one sentence on what Koroks are in TotK and why to collect seeds (trade seeds to Hestu to expand weapon/bow/shield pouches).
- totalSeeds: the total number of Korok Seeds that exist in TotK (confirm the exact figure — base game).
- maxSeeds: the number of seeds needed to fully max every weapon/bow/shield pouch slot via Hestu (confirm the exact figure).
- hestu: one sentence on finding Hestu in TotK (he starts near Lookout Landing and moves).
- puzzleTypes: ALL the common types (~15–20). Cover the returning ones (lift the lone rock; complete the rock circle/place the rock in the ring; flower-trail to follow; shoot the balloon/acorn target; pinwheel + targets; dive through rings; race to a goal; matching-rock pairs; offering a fruit to a statue/pedestal) AND the TotK-signature ones: the "Korok buddy" who needs to be CARRIED or transported to its friend (often build a vehicle/raft with Ultrahand or a Zonai device), and seeds that need a quick Ultrahand BUILD.
- hotspots: 3–5 reliable early places to find Koroks.
- notes: any honest caveat.

For EACH type return {type (short name), see (the visual tell), do (the exact solution in 1-2 sentences), category (one of: rocks, place, shoot, race, spin, dive, light, offering, carry, build, other)}. Keep see/do plain and concrete. Honesty: only include real, confirmed TotK types. Return the full object.\`;
const korokVerify = (k) => \`Adversarially verify this catalogue of TEARS OF THE KINGDOM (Switch, 2023) Korok puzzle types with independent WebSearch + WebFetch (Game8 TotK/Zelda Dungeon). Confirm each type is real in TotK and its "do" solution is correct (esp. the carry-the-Korok-to-its-friend type, which often needs an Ultrahand-built vehicle/raft; flower trails touched IN ORDER; rock-in-ring needs the matching rock). Confirm the ~1000-Korok figure and the Hestu detail. Fix wrong solutions, merge duplicates, drop anything unverifiable or BotW-only. Return the corrected full object {what,hestu,puzzleTypes:[...],hotspots:[...],notes,sources,corrections:"<one line>"}.

To verify:
\${JSON.stringify(k || {}, null, 1)}\`;

/* ============ (D) TOWERS ============ */
const TOWERS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    towers: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, region: { type: "string" }, location: { type: "string" }, climbTip: { type: "string" } }, required: ["name", "region", "location", "climbTip"] } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["towers"],
};
const towersAuthor = \`List all 15 SKYVIEW TOWERS in The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023). Research with WebSearch + WebFetch (Game8 TotK / Zelda Dungeon). Skyview Towers replace the old Sheikah Towers: activating one fills in the surrounding map AND launches Link high into the sky to skydive and explore. Several are locked behind a small puzzle or obstacle before they'll register you.

For EACH of the 15 return {name (exact in-game name, e.g. "Lookout Landing Skyview Tower"), region (the area it covers), location (where to find it — concrete directions), climbTip (one sentence: how to ACTIVATE it — many need you to clear an obstacle or solve a short puzzle first — and that it then launches you skyward to glide off)}. Honesty: confirm all 15 names and their gating; don't invent. Return {towers:[...15...], sources:[...]}.\`;
const towersVerify = (t) => \`Adversarially verify these 15 TotK Skyview Towers with independent WebSearch + WebFetch (Game8 TotK / Zelda Dungeon). Confirm there are exactly 15, each name is exact, each location is correct, and each activation note (the gating puzzle/obstacle, if any) is accurate and TotK-specific (not BotW Sheikah Towers). Fix errors, add any missing tower, drop duplicates. Return the corrected {towers:[...], sources, corrections:"<one line>"}.

To verify:
\${JSON.stringify((t && t.towers) || [], null, 1)}\`;

/* ============ (E) GREAT FAIRIES ============ */
const FAIRY_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    fairies: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, region: { type: "string" }, location: { type: "string" }, cost: { type: "string" } }, required: ["name", "region", "location", "cost"] } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["fairies"],
};
const fairyAuthor = \`List the 4 GREAT FAIRIES (Great Fairy Fountains) in The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023): Tera, Cotera, Kaysa, and Mija. Research with WebSearch + WebFetch (Game8 TotK / Zelda Dungeon). In TotK you do NOT pay a rupee fee — you unlock each fountain by completing the "Serenade to a Great Fairy" side-adventure: reuniting the Stable Trotters troupe (Mastro and his musicians) and bringing the band to perform at each fountain. The fountains then upgrade your armor for materials.

For EACH fairy return {name, region (the area), location (where the closed fountain is — concrete), cost (the UNLOCK requirement — which part of the troupe/quest opens this specific fountain, e.g. "Complete 'Serenade to a Great Fairy' — bring the relevant Stable Trotters members; this fountain opens once the band performs here")}. Honesty: confirm the unlock chain; don't invent fees. Return {fairies:[...4...], sources:[...]}.\`;
const fairyVerify = (f) => \`Adversarially verify these 4 TotK Great Fairies with independent WebSearch + WebFetch (Game8 TotK / Zelda Dungeon). Confirm the names (Tera, Cotera, Kaysa, Mija), each location, and the UNLOCK method (the "Serenade to a Great Fairy" / Stable Trotters troupe questline — NOT a rupee fee like BotW). Fix errors. Return the corrected {fairies:[...], sources, corrections:"<one line>"}.

To verify:
\${JSON.stringify((f && f.fairies) || [], null, 1)}\`;

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

phase("Towers");
let towers = await agent(towersAuthor, { label: "author:towers", phase: "Towers", schema: TOWERS_SCHEMA });
if (towers) towers = await agent(towersVerify(towers), { label: "verify:towers", phase: "Towers", schema: TOWERS_SCHEMA }) || towers;
log(\`Towers: \${towers && towers.towers ? towers.towers.length : 0}\`);

phase("Fairies");
let fairies = await agent(fairyAuthor, { label: "author:fairies", phase: "Fairies", schema: FAIRY_SCHEMA });
if (fairies) fairies = await agent(fairyVerify(fairies), { label: "verify:fairies", phase: "Fairies", schema: FAIRY_SCHEMA }) || fairies;
log(\`Fairies: \${fairies && fairies.fairies ? fairies.fairies.length : 0}\`);

return { armor: armorClean, economy, koroks, towers: (towers && towers.towers) || [], fairies: (fairies && fairies.fairies) || [] };
`;

fs.writeFileSync("/tmp/totk-depth-workflow.mjs", body);
console.log(`wrote /tmp/totk-depth-workflow.mjs (${body.length} bytes) · ${SETS.length} armor sets`);
