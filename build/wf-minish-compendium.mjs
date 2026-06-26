export const meta = {
  name: 'minish-compendium',
  description: 'Author + verify the The Minish Cap Items-tab catalog (equipment + tools + key items)',
  phases: [{ title: 'Author', detail: 'by category group' }, { title: 'Verify', detail: 'adversarial web cross-check' }],
};

const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, type: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'cat', 'type', 'effect', 'where'] } } }, required: ['items'] };

const GAME = 'The Legend of Zelda: The Minish Cap (Game Boy Advance, 2004)';
const CATS = 'sword | shield | bow | item | key | material';

const GROUPS = [
  { key: 'equipment', name: 'Weapons & worn gear (cats: sword, shield, bow)',
    list: "Swords: Smith's Sword, White Sword (and its element-infused upgrades), the Four Sword (note its clone power). Shields: Shield, Mirror Shield. Bow line: Bow, Light Arrow." },
  { key: 'tools', name: 'Tools, key items & collectibles (cats: item, key, material)',
    list: "Tools (cat item): Ezlo (shrink/glide), Gust Jar, Cane of Pacci, Mole Mitts, Flame Lantern, Roc's Cape, Boomerang & Magical Boomerang, Bombs & Remote Bombs, Pegasus Boots, Lantern, Grip Ring, Flippers, Bottles, Picolyte. Key items (cat key): the 4 Elements (Earth/Fire/Water/Wind), the Kinstone Bag, the Ocarina of Wind / Wind elements, the dungeon Big Keys. Collectibles (cat material): Kinstone (the fusion halves), Mysterious Shell (figurine currency), Figurine, Piece of Heart, Heart Container, Rupees." },
];

function authorPrompt(g) {
  return `Author part of the Items catalog for ${GAME} — the "${g.name}" group — as { items: [...] }.

Context: Link shrinks with Ezlo and fuses Kinstones; he reforges the Picori Blade into the Four Sword via the 4 Elements. Include these (exact canonical names; split/merge sensibly): ${g.list}

Each entry: { name, cat (ONE of: ${CATS}), type (short noun label, e.g. "Sword", "Tool", "Element", "Key item"), effect (what it does, 1–3 sentences), where (where/how obtained — which dungeon/town/fusion) }. Beginner-first, accurate, honest — web-check uncertain effects/locations. Return { items }.`;
}
function verifyPrompt(g, draft) {
  return `ADVERSARIAL fact-check this ${GAME} catalog group ("${g.name}"). Use WebSearch/WebFetch (load via ToolSearch query "WebSearch WebFetch" if needed) against 2+ independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki). Fix wrong names/effects/locations, fill obvious gaps, keep cat ∈ ${CATS}. Honesty law: drop the unconfirmable. Return the corrected { items }.

DRAFT:
${JSON.stringify(draft)}`;
}

const out = await pipeline(
  GROUPS,
  (g) => agent(authorPrompt(g), { label: `author:${g.key}`, phase: 'Author', schema: SCHEMA, agentType: 'claude' }),
  (draft, g) => draft ? agent(verifyPrompt(g, draft), { label: `verify:${g.key}`, phase: 'Verify', schema: SCHEMA, agentType: 'claude' }).then((v) => v || draft) : null,
);

const seen = new Set();
const items = out.filter(Boolean).flatMap((r) => r.items || []).filter((it) => { const k = (it.cat + '|' + it.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
log(`Minish compendium: ${items.length} entries (${[...new Set(items.map((i) => i.cat))].join(', ')})`);
return { items };
