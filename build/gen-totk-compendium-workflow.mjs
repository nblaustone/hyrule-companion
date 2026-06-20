#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK compendium deep-research Workflow. Mirrors gen-compendium +
   gen-materials (BotW). Per category (weapons one/two-handed/spears · bows · shields · armor head/body/legs ·
   monster parts · ores & gems · dragon parts · Zonai devices & materials · special · creatures) an author
   agent compiles the COMPLETE base-game list with stats/effect/where (+ sell for materials), then a verifier
   re-sources for completeness + accuracy. Output → knowledge/totk/compendium.json (flat, searchable;
   cat ∈ weapon/bow/shield/armor/material/creature). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));
const KNOWN_SETS = APP.ARMOR.sets.map((s) => s.name);

const body = `export const meta = {
  name: 'totk-compendium',
  description: 'Deep-research the COMPLETE base-game TotK catalog (weapons/bows/shields/armor/materials/creatures) with stats + effects',
  phases: [
    { title: 'Author', detail: 'one agent per category compiles the full sourced list' },
    { title: 'Verify', detail: 'independently re-source for completeness + accuracy' },
  ],
};

const KNOWN_SETS = ${JSON.stringify(KNOWN_SETS)};

const ITEM_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    category: { type: "string" },
    items: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        power: { type: "integer" },
        durability: { type: "integer" },
        effect: { type: "string" },
        where: { type: "string" },
        sell: { type: "integer" },
        set: { type: "string" },
      },
      required: ["name", "effect", "where"],
    } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["category", "items"],
};

const CATS = [
  { key: "one-handed", cat: "weapon", type: "one-handed", approx: 40, label: "one-handed weapons (swords, sticks, rods, scimitars, boomerangs, Zonai weapons, etc.)", stat: "base attack power (UNFUSED)", dura: true, kind: "gear" },
  { key: "two-handed", cat: "weapon", type: "two-handed", approx: 30, label: "two-handed weapons (claymores, greatswords, hammers, axes, Zonai two-handers, etc.)", stat: "base attack power (UNFUSED)", dura: true, kind: "gear" },
  { key: "spears", cat: "weapon", type: "spear", approx: 22, label: "spears (incl. tridents, halberds, forks, Zonai spears)", stat: "base attack power (UNFUSED)", dura: true, kind: "gear" },
  { key: "bows", cat: "bow", type: "bow", approx: 30, label: "bows (incl. multi-shot bows, Lynel bows, the Construct Bow, Zonai bows)", stat: "base attack power (note multishot in effect)", dura: true, kind: "gear" },
  { key: "shields", cat: "shield", type: "shield", approx: 22, label: "shields (incl. the Hylian Shield, Royal/Royal Guard's, Zonaite, the various Construct/Hyrule shields)", stat: "shield guard/strength", dura: true, kind: "gear" },
  { key: "armor-head", cat: "armor", type: "head", approx: 50, label: "HEAD armor pieces (caps, hoods, helms, masks, the various amiibo-free base-game head pieces)", stat: "base defense (unupgraded)", dura: false, kind: "gear" },
  { key: "armor-body", cat: "armor", type: "body", approx: 45, label: "BODY/CHEST armor pieces (tunics, vests, the Charged/Flamebreaker/Zonaite body pieces)", stat: "base defense (unupgraded)", dura: false, kind: "gear" },
  { key: "armor-legs", cat: "armor", type: "legs", approx: 40, label: "LEG/FOOT armor pieces (trousers, greaves, boots, tights)", stat: "base defense (unupgraded)", dura: false, kind: "gear" },
  { key: "monster-parts", cat: "material", type: "Monster Part", approx: 70, label: "MONSTER PART materials (horns, fangs, guts, claws, wings, eyeballs, etc. from Bokoblins, Moblins, Lizalfos, Horriblins, Lynels, Gleeoks, Constructs, etc.) — the things you Fuse for power", stat: null, dura: false, sell: true, kind: "mat" },
  { key: "ores-gems", cat: "material", type: "Ore/Gem", approx: 16, label: "ORES & GEMS (Flint, Amber, Opal, Ruby, Sapphire, Topaz, Diamond, Luminous Stone, Zonaite, Large Zonaite, etc.)", stat: null, dura: false, sell: true, kind: "mat" },
  { key: "dragon-elemental", cat: "material", type: "Dragon/Elemental", approx: 24, label: "DRAGON PARTS (Dinraal/Naydra/Farosh/Light Dragon scales, claws, fangs, horns) and ELEMENTAL/SPECIAL materials (Star Fragment, Brightbloom/Giant Brightbloom Seed, Korok Frond, Zonai Charge, Crystallized Charge, Sage's Will, etc.)", stat: null, dura: false, sell: true, kind: "mat" },
  { key: "creatures", cat: "creature", type: "Creature", approx: 60, label: "CREATURES & CRITTERS (animals, fish, insects, frogs, lizards, the elemental darners/butterflies, Hearty/Sunny critters) — what each yields and where to find it", stat: null, dura: false, sell: true, kind: "mat" },
];

const gearFields = (c) => \`- name: exact in-game name
- type: "\${c.type}"
- power: \${c.stat} as an integer\${c.cat === "armor" ? " (the BASE/unupgraded defense of that single piece)" : ""}
- \${c.dura ? "durability: the durability value as an integer" : "durability: omit (armor has none)"}
- effect: one plain sentence — the special property (a weapon's bonus, a bow's multishot, a shield's note; for armor the piece's passive + its SET BONUS and the stars to unlock it). For TotK weapons, note if it is found pre-Fused or has a built-in effect.
- where: where to find/obtain it (concrete location, enemy drop, shop, cave, or Depths)
- \${c.cat === "armor" ? "set: the armor set it belongs to (or 'standalone'). Reconcile with these sets we already track: " + JSON.stringify(KNOWN_SETS) + "." : "set: a source family if useful (e.g. 'Zonaite', 'Royal', 'Construct'), else omit."}\`;

const matFields = (c) => \`- name: exact in-game name
- type: "\${c.type}" (a short category label)
- effect: one plain sentence on what it's USED FOR — Fuse use (and the rough attack/effect it grants), armor-upgrade use (which set it tops out), or cooking use. For creatures: what it yields when caught and any cooking effect.
- where: where to find/farm it (concrete)
- sell: the rupee sell value as an integer (omit if it can't be sold / sells for 0)
- omit power/durability/set\`;

const authorPrompt = (c) => \`You are compiling the COMPLETE list of \${c.label} in The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild, NO DLC). This feeds an offline item compendium where the player taps any entry to read what it is and what it does.

RESEARCH exhaustively with WebSearch + WebFetch — Game8 (game8.co/games/Tears-of-the-Kingdom) and Zelda Dungeon publish full compendium/equipment tables with exact stats. Pull EVERY base-game entry in this category — expect roughly \${c.approx}, but include all you can verify.

For EACH entry return:
\${c.kind === "gear" ? gearFields(c) : matFields(c)}

HARD RULES (the guide's honesty law):
- This is TEARS OF THE KINGDOM data (not BotW). Weapon attack values are the UNFUSED base. EXCLUDE Zonai DEVICES that are not Compendium "materials" if they have no sell/fuse stat — but DO include Zonai capsule materials a player collects.
- Exact in-game names and exact integer stats — do NOT guess a number; if a stat is genuinely unconfirmable, omit that field (or that item) rather than invent.
- Be COMPLETE: cross-check the full category list before returning.
Return {category:"\${c.key}", items:[...], sources:[...]}.\`;

const verifyPrompt = (c, a) => \`Adversarially verify this TEARS OF THE KINGDOM (Switch, 2023, NO DLC) "\${c.key}" list (\${c.label}). Two axes: COMPLETENESS and ACCURACY.

Proposed (\${(a && a.items || []).length} items):
\${JSON.stringify((a && a.items) || [], null, 1)}

Independently re-source the FULL list (prefer a different guide than \${JSON.stringify((a && a.sources) || [])}) with WebSearch + WebFetch on Game8 TotK / Zelda Dungeon. Then:
- COMPLETENESS: add every base-game entry missing from the list.
- ACCURACY: confirm each name, the integer stats\${c.kind === "gear" ? " (power" + (c.dura ? "/durability" : "") + ")" : "/sell value"}, the effect, and where — these must be TotK values, not BotW. Fix wrong numbers in place.
- PURGE: remove DLC, duplicates, and anything fabricated/unconfirmable.
Return the corrected, complete {category:"\${c.key}", items:[...], sources:[...], corrections:"<one line>"}.\`;

const results = await pipeline(
  CATS,
  (c) => agent(authorPrompt(c), { label: "author:" + c.key, phase: "Author", schema: ITEM_SCHEMA }),
  (a, c) => a ? agent(verifyPrompt(c, a), { label: "verify:" + c.key, phase: "Verify", schema: ITEM_SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((r) => r && Array.isArray(r.items) && r.items.length);
const byKey = Object.fromEntries(CATS.map((c) => [c.key, c]));
const flat = [];
for (const r of clean) { const c = byKey[r.category] || {}; for (const it of r.items) flat.push({ ...it, cat: c.cat || "material" }); }
const counts = {};
for (const r of clean) counts[r.category] = r.items.length;
log("TotK compendium: " + flat.length + " items · " + JSON.stringify(counts));
return { categories: clean, items: flat, total: flat.length, counts };
`;

fs.writeFileSync("/tmp/totk-compendium-workflow.mjs", body);
console.log(`wrote /tmp/totk-compendium-workflow.mjs (${body.length} bytes) · ${KNOWN_SETS.length} known armor sets to reconcile`);
