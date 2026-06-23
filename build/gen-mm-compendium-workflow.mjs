#!/usr/bin/env node
/* v15: generate the Majora's Mask equipment-catalog Workflow (Items tab → CompendiumView). Per category
   (weapons · bows · shields · masks · items) an author agent compiles the complete base-game list with
   what-it-does + where-to-find, then a verifier re-sources for accuracy/completeness. Output →
   knowledge/mm/compendium.json (flat array; cat ∈ weapon/bow/shield/mask/item — matches CompendiumView's
   columns). MM has no tunic 'armor' (masks are the transformations). Mirrors gen-oot-compendium. Web-sourced
   (Zelda Dungeon MM / Thonky / IGN / Zeldapedia). */
import fs from "node:fs";

const body = `export const meta = {
  name: 'mm-compendium',
  description: 'Author + verify the complete base-game Majora\\'s Mask weapons/bows/shields/masks/items catalog for the Items tab',
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
      properties: { name: { type: "string" }, type: { type: "string" }, effect: { type: "string" }, where: { type: "string" } },
      required: ["name", "effect", "where"],
    } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["category", "items"],
};

const CATS = [
  { key: "weapon", cat: "weapon", approx: 4, label: "SWORDS & melee weapons (Kokiri Sword, Razor Sword, Gilded Sword, Great Fairy's Sword; and any Deku-stick / Goron-punch / Zora-fin melee worth noting)", type: "e.g. 'Sword', 'Great sword'" },
  { key: "bow", cat: "bow", approx: 5, label: "RANGED weapons & ammo (Hero's Bow, regular Arrows, Fire Arrows, Ice Arrows, Light Arrows)", type: "e.g. 'Bow', 'Arrow'" },
  { key: "shield", cat: "shield", approx: 2, label: "SHIELDS (Hero's Shield, Mirror Shield)", type: "'Shield'" },
  { key: "mask", cat: "mask", approx: 24, label: "ALL 24 MASKS — the four transformation masks (Deku, Goron, Zora, Fierce Deity's) plus the 20 regular masks (Postman's Hat, All-Night Mask, Blast Mask, Stone Mask, Great Fairy's Mask, Keaton Mask, Bremen Mask, Bunny Hood, Don Gero's Mask, Mask of Scents, Romani's Mask, Circus Leader's Mask, Kafei's Mask, Couple's Mask, Mask of Truth, Kamaro's Mask, Garo's Mask, Captain's Hat, Gibdo Mask, Giant's Mask)", type: "e.g. 'Transformation mask', 'Mask'" },
  { key: "item", cat: "item", approx: 20, label: "INVENTORY ITEMS, TOOLS & UPGRADES — Ocarina of Time, Hookshot, Bombs (Bomb Bag), Bombchu, Powder Keg, Lens of Truth, Magic Beans, Pictograph Box, Bottles (and the contents: Red/Blue/Green Potion, a Fairy, Chateau Romani, Hot Spring Water, a Zora Egg, Gold Dust), the Bombers' Notebook, the Great Spin Attack / Spin Attack upgrade, capacity upgrades (Adult Wallet & Giant's Wallet, Quiver & Big/Biggest Quiver, Bomb Bag upgrades)", type: "e.g. 'Tool', 'Bottle', 'Upgrade', 'Key item'" },
];

const authorPrompt = (c) => \`You are compiling the COMPLETE list of \${c.label} in The Legend of Zelda: MAJORA'S MASK (N64, 2000; the 3DS remake is equivalent). This feeds an offline Items-tab catalog where the player taps any entry to read what it is, what it does, and where to get it.

RESEARCH exhaustively with WebSearch + WebFetch — Zelda Dungeon's MM guide, Thonky's MM guide, IGN's MM wiki, Zeldapedia/Fandom. Pull EVERY base-game entry in this category (~\${c.approx}).

For EACH entry return:
- name: exact in-game name
- type: a short category label (\${c.type})
- effect: one or two plain sentences — what it does / what it's for (for masks, the ability it grants or who it affects)
- where: where to get it (concrete location, who you help, shop, or quest)

HARD RULES (honesty law):
- MAJORA'S MASK only — NOT Ocarina of Time or another Zelda. Exact in-game names. The Fierce Deity's Mask is won by giving the 20 regular masks to the Moon Children and only works in boss rooms; the Razor Sword reverts after 100 hits / a Song-of-Time reset; the Gilded Sword is permanent.
- Don't invent; if unsure, describe only what you're confident of.
Return {category:"\${c.key}", items:[...], sources:[...]}.\`;

const verifyPrompt = (c, a) => \`Adversarially verify this MAJORA'S MASK (N64, 2000) "\${c.key}" catalog (\${c.label}) with an independent source (WebSearch + WebFetch, prefer a different guide than \${JSON.stringify((a && a.sources) || [])}). Two axes: COMPLETENESS and ACCURACY. Add any missing base-game entry (the mask category MUST have all 24 masks); confirm each name/effect/where is correct MM (not Ocarina of Time or another game); fix errors; drop fabrications. Return the corrected {category:"\${c.key}", items:[...], sources:[...], corrections:"<one line>"}.

To verify (\${(a && a.items || []).length} entries):
\${JSON.stringify((a && a.items) || [], null, 1)}\`;

const results = await pipeline(
  CATS,
  (c) => agent(authorPrompt(c), { label: "author:" + c.key, phase: "Author", schema: ITEM_SCHEMA }),
  (a, c) => a ? agent(verifyPrompt(c, a), { label: "verify:" + c.key, phase: "Verify", schema: ITEM_SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((r) => r && Array.isArray(r.items) && r.items.length);
const byKey = Object.fromEntries(CATS.map((c) => [c.key, c]));
const flat = [];
for (const r of clean) { const c = byKey[r.category] || {}; for (const it of r.items) flat.push({ name: it.name, cat: c.cat || "item", type: it.type, effect: it.effect, where: it.where }); }
const counts = {};
for (const r of clean) counts[r.category] = r.items.length;
log("MM compendium: " + flat.length + " entries · " + JSON.stringify(counts));
return { items: flat, total: flat.length, counts };
`;

fs.writeFileSync("/tmp/mm-compendium-workflow.mjs", body);
console.log(`wrote /tmp/mm-compendium-workflow.mjs (${body.length} bytes)`);
