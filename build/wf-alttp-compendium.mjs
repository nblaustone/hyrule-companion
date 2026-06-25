export const meta = {
  name: 'alttp-compendium',
  description: 'Author + verify the A Link to the Past Items-tab catalog (equipment + tools + key items)',
  phases: [{ title: 'Author', detail: 'by category group' }, { title: 'Verify', detail: 'adversarial web cross-check' }],
};

const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, type: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'cat', 'type', 'effect', 'where'] } } }, required: ['items'] };

const GAME = 'The Legend of Zelda: A Link to the Past (Super Nintendo, 1991)';
const CATS = 'sword | shield | armor | bow | item | key | material';

const GROUPS = [
  { key: 'equipment', name: 'Weapons & worn gear (cats: sword, shield, armor, bow)',
    list: "Swords: Fighter's Sword, Master Sword, Tempered Sword, Golden Sword. Shields: Fighter's Shield, Red Shield (Fire Shield), Mirror Shield. Armor/Mail: Green Mail, Blue Mail, Red Mail. Bow line: Bow, Bow & Arrows / Silver Bow, Silver Arrows. (Boomerangs go in the tools group.)" },
  { key: 'tools', name: 'Tools, key items & collectibles (cats: item, key, material)',
    list: "Tools (cat item): Lamp, Magic Hammer, Bow already covered, Hookshot, Bombs, Fire Rod, Ice Rod, Bug-Catching Net, Magic Powder, Pegasus Boots, Power Glove, Titan's Mitt, Flippers, Magic Mirror, Magic Cape, Cane of Somaria, Cane of Byrna, Boomerang (Blue), Magical Boomerang (Red), Shovel, Flute/Ocarina, Empty Bottle, Bombos Medallion, Ether Medallion, Quake Medallion, Book of Mudora, Half Magic. Key items (cat key): Pendant of Courage, Pendant of Power, Pendant of Wisdom, Moon Pearl, the 7 Crystals (as one entry or each). Collectibles (cat material): Piece of Heart, Heart Container, Rupees, Magic Decanter/jars." },
];

function authorPrompt(g) {
  return `Author part of the Items catalog for ${GAME} — the "${g.name}" group — as { items: [...] }.

Include these (exact canonical names; split or merge sensibly): ${g.list}

Each entry: { name, cat (ONE of: ${CATS}), type (a short noun label, e.g. "Sword", "Tunic", "Tool", "Medallion", "Key item"), effect (what it does / stats, 1–3 sentences), where (where/how the player obtains it) }. Beginner-first, accurate, honest — web-check uncertain locations/effects. Return { items }.`;
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
log(`ALttP compendium: ${items.length} entries (${[...new Set(items.map((i) => i.cat))].join(', ')})`);
return { items };
