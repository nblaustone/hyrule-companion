#!/usr/bin/env node
/* v14.6: generate the OoT equipment-catalog Workflow (Items tab → CompendiumView). Per category
   (weapons · bows · shields · armor · items · masks) an author agent compiles the complete base-game list with
   what-it-does + where-to-find, then a verifier re-sources for accuracy/completeness. Output →
   knowledge/oot/compendium.json (flat array; cat ∈ weapon/bow/shield/armor/item/mask — matches CompendiumView's
   columns, with the item/mask columns added in v14.6). Mirrors gen-totk-compendium. Web-sourced (Zelda
   Dungeon OoT / IGN / Zeldapedia). */
import fs from "node:fs";

const body = `export const meta = {
  name: 'oot-compendium',
  description: 'Author + verify the complete base-game OoT equipment/items/masks catalog for the Items tab',
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
  { key: "weapon", cat: "weapon", approx: 6, label: "SWORDS & melee weapons (Kokiri Sword, Master Sword, Giant's Knife, Biggoron's Sword, Megaton Hammer, the Deku Stick as a weapon)", type: "e.g. 'One-handed sword', 'Two-handed sword', 'Hammer'" },
  { key: "bow", cat: "bow", approx: 6, label: "RANGED weapons & ammo types (Fairy Slingshot, Fairy Bow, and the arrow types: regular, Fire Arrows, Ice Arrows, Light Arrows; the Bombchu if you treat it as ranged)", type: "e.g. 'Slingshot', 'Bow', 'Arrow'" },
  { key: "shield", cat: "shield", approx: 3, label: "SHIELDS (Deku Shield, Hylian Shield, Mirror Shield)", type: "'Shield'" },
  { key: "armor", cat: "armor", approx: 9, label: "WEARABLES — tunics (Kokiri, Goron, Zora), boots (Kokiri, Iron, Hover), and the strength upgrades worn as gauntlets (Goron's Bracelet, Silver Gauntlets, Golden Gauntlets)", type: "e.g. 'Tunic', 'Boots', 'Gauntlets'" },
  { key: "item", cat: "item", approx: 22, label: "INVENTORY ITEMS, SPELLS & UPGRADES — Boomerang, Hookshot, Longshot, Lens of Truth, Magic Beans, Din's Fire, Farore's Wind, Nayru's Love, Ocarina of Time, Bomb Bag/Bombs, Bombchu, Bottles, the trade-quest items overview, and capacity upgrades (Adult/Giant's Wallet, Big/Biggest Quiver, Bomb Bag upgrades, Bullet Bag, Silver/Golden Scale, the Magic Meter, Stone of Agony, Gerudo Membership Card)", type: "e.g. 'Tool', 'Magic spell', 'Upgrade', 'Bottle', 'Key item'" },
  { key: "mask", cat: "mask", approx: 9, label: "MASKS from the Happy Mask Shop (Keaton Mask, Skull Mask, Spooky Mask, Bunny Hood, Mask of Truth, Goron Mask, Zora Mask, Gerudo Mask) and the Mask of Truth's use", type: "'Mask'" },
];

const authorPrompt = (c) => \`You are compiling the COMPLETE list of \${c.label} in The Legend of Zelda: OCARINA OF TIME (N64, 1998; the 3DS remake is equivalent). This feeds an offline Items-tab catalog where the player taps any entry to read what it is, what it does, and where to get it.

RESEARCH exhaustively with WebSearch + WebFetch — Zelda Dungeon's OoT guide, IGN's OoT wiki, Zeldapedia/Fandom. Pull EVERY base-game entry in this category (~\${c.approx}).

For EACH entry return:
- name: exact in-game name
- type: a short category label (\${c.type})
- effect: one or two plain sentences — what it does / what it's for
- where: where to get it (concrete location, shop, or quest)

HARD RULES (honesty law):
- OCARINA OF TIME only — NOT Majora's Mask (the transformation masks Goron/Zora/Gerudo in OoT are simple disguises for the Gerudo/areas, NOT MM transformations; describe their OoT use accurately). Exact in-game names.
- Don't invent; if unsure, describe only what you're confident of.
Return {category:"\${c.key}", items:[...], sources:[...]}.\`;

const verifyPrompt = (c, a) => \`Adversarially verify this OCARINA OF TIME (N64, 1998) "\${c.key}" catalog (\${c.label}) with an independent source (WebSearch + WebFetch, prefer a different guide than \${JSON.stringify((a && a.sources) || [])}). Two axes: COMPLETENESS and ACCURACY. Add any missing base-game entry; confirm each name/effect/where is correct OoT (not Majora's Mask or another game); fix errors; drop fabrications. Return the corrected {category:"\${c.key}", items:[...], sources:[...], corrections:"<one line>"}.

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
log("OoT compendium: " + flat.length + " entries · " + JSON.stringify(counts));
return { items: flat, total: flat.length, counts };
`;

fs.writeFileSync("/tmp/oot-compendium-workflow.mjs", body);
console.log(`wrote /tmp/oot-compendium-workflow.mjs (${body.length} bytes)`);
