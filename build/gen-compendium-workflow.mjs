#!/usr/bin/env node
/* v12.13: generate the equipment-compendium deep-research Workflow.
   Per category (one-handed / two-handed / spears / bows / shields / armor head|body|legs) an author agent
   compiles the COMPLETE base-game (no DLC) list with stats + effect + where-to-find from Game8/Zelda Dungeon
   compendium tables, then a verifier independently re-sources for completeness + stat accuracy. Output →
   knowledge/compendium.json (flat, searchable). Workflow scripts can't read files, so the existing armor-set
   names are embedded for reconciliation. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARMOR = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "armor.json"), "utf8"));
const KNOWN_SETS = ARMOR.sets.map((s) => s.name);

const body = `export const meta = {
  name: 'botw-equipment-compendium',
  description: 'Deep-research the COMPLETE base-game BotW equipment list (weapons/bows/shields/armor) with stats + effects',
  phases: [
    { title: 'Author', detail: 'one agent per category compiles the full sourced list' },
    { title: 'Verify', detail: 'independently re-source for completeness + stat accuracy' },
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
        set: { type: "string" },
      },
      required: ["name", "type", "power", "where"],
    } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["category", "items"],
};

const CATS = [
  { key: "one-handed", cat: "weapon", type: "one-handed", approx: 38, label: "one-handed weapons (swords, sticks, rods, machetes, boomerangs, etc.)", stat: "base attack power", dura: true },
  { key: "two-handed", cat: "weapon", type: "two-handed", approx: 28, label: "two-handed weapons (claymores, greatswords, hammers, sledgehammers, axes, etc.)", stat: "base attack power", dura: true },
  { key: "spears", cat: "weapon", type: "spear", approx: 19, label: "spears (incl. tridents, halberds, the Lightscale Trident, etc.)", stat: "base attack power", dura: true },
  { key: "bows", cat: "bow", type: "bow", approx: 24, label: "bows (incl. multi-shot bows, the Great Eagle Bow, Lynel bows, Ancient Bow, etc.)", stat: "base attack power (note multishot in effect)", dura: true },
  { key: "shields", cat: "shield", type: "shield", approx: 20, label: "shields (incl. Guardian Shield / Shield+ / Shield++, Ancient Shield, Hylian Shield, the Daybreaker, etc.)", stat: "shield guard/strength", dura: true },
  { key: "armor-head", cat: "armor", type: "head", approx: 28, label: "HEAD armor pieces (caps, hoods, helms, masks, circlets, the Korok Mask, etc.)", stat: "base defense (unupgraded)", dura: false },
  { key: "armor-body", cat: "armor", type: "body", approx: 28, label: "BODY/CHEST armor pieces (tunics, armor, doublets, the Champion's Tunic, etc.)", stat: "base defense (unupgraded)", dura: false },
  { key: "armor-legs", cat: "armor", type: "legs", approx: 24, label: "LEG/FOOT armor pieces (trousers, greaves, boots, tights, sirwal, etc.)", stat: "base defense (unupgraded)", dura: false },
];

const authorPrompt = (c) => \`You are compiling the COMPLETE list of \${c.label} in The Legend of Zelda: Breath of the Wild (Switch, the 2017 ORIGINAL). This feeds an offline item compendium where the player taps any item to read what it is and what it does.

RESEARCH exhaustively with WebSearch + WebFetch. Game8 and Zelda Dungeon publish full compendium/equipment tables with exact stats. Pull EVERY base-game item in this category — expect roughly \${c.approx}, but include all you can verify.

For EACH item return:
- name: exact in-game name
- type: "\${c.type}"
- power: \${c.stat} as an integer\${c.cat === "armor" ? " (the BASE/unupgraded defense of that single piece)" : ""}
- \${c.dura ? "durability: the durability value as an integer" : "durability: omit (armor has none)"}
- effect: one plain sentence — the special property or what it does (e.g. a weapon bonus like 'Royal Guard's: very high attack but low durability', a bow's '3-arrow spread', a shield's parry note; for armor the piece's passive + its SET BONUS and how many stars unlock it). If it's just a plain weapon with no special property, say so briefly.
- where: where to find/obtain it (the concrete location, enemy drop, shop, or quest)
- \${c.cat === "armor" ? "set: the armor set it belongs to (or 'standalone' if none). Reconcile with these sets we already track: " + JSON.stringify(KNOWN_SETS) + "." : "set: a source family if useful (e.g. 'Guardian', 'Royal', 'Lynel', 'Ancient'), else omit."}

HARD RULES (the guide's honesty law):
- EXCLUDE DLC items (The Master Trials / Trial of the Sword rewards, The Champions' Ballad, EX). amiibo-obtainable items ARE allowed — note 'amiibo' in effect.
- Exact in-game names and exact integer stats — do NOT guess a number; if a stat is genuinely unconfirmable, omit that item rather than invent.
- Be COMPLETE: this is the whole point. Cross-check the full category list before returning.
Return {category:"\${c.key}", items:[...], sources:[...]}.\`;

const verifyPrompt = (c, a) => \`Adversarially verify this BotW (Switch, 2017 original, NO DLC) equipment list for category "\${c.key}" (\${c.label}). Two axes: COMPLETENESS and STAT ACCURACY.

Proposed (\${(a && a.items || []).length} items):
\${JSON.stringify((a && a.items) || [], null, 1)}

Independently re-source the FULL list (prefer a different guide than \${JSON.stringify((a && a.sources) || [])}) with WebSearch + WebFetch on Game8 / Zelda Dungeon. Then:
- COMPLETENESS: add every base-game item missing from the list (this is the priority — the player flagged missing gear like the Guardian Shield line).
- ACCURACY: confirm each name, the integer power\${c.dura ? "/durability" : ""}, the effect, and where. Fix wrong numbers in place.
- PURGE: remove DLC items, duplicates, and anything fabricated/unconfirmable.
Return the corrected, complete {category:"\${c.key}", items:[...], sources:[...], corrections:"<one line>"}.\`;

const results = await pipeline(
  CATS,
  (c) => agent(authorPrompt(c), { label: "author:" + c.key, phase: "Author", schema: ITEM_SCHEMA }),
  (a, c) => a ? agent(verifyPrompt(c, a), { label: "verify:" + c.key, phase: "Verify", schema: ITEM_SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((r) => r && Array.isArray(r.items) && r.items.length);
// stamp each item with its catalog category from the CAT config (author may not echo it)
const byKey = Object.fromEntries(CATS.map((c) => [c.key, c]));
const flat = [];
for (const r of clean) { const c = byKey[r.category] || {}; for (const it of r.items) flat.push({ ...it, cat: c.cat || "weapon" }); }
const counts = {};
for (const r of clean) counts[r.category] = r.items.length;
log("Compendium: " + flat.length + " items · " + JSON.stringify(counts));
return { categories: clean, flat, total: flat.length, counts };
`;

fs.writeFileSync("/tmp/compendium-workflow.mjs", body);
console.log(`wrote /tmp/compendium-workflow.mjs (${body.length} bytes) · 8 categories, ${KNOWN_SETS.length} known armor sets to reconcile`);
