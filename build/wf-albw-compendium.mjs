export const meta = {
  name: 'albw-compendium',
  description: 'Author + verify the A Link Between Worlds Items-tab catalog (equipment + tools + key items)',
  phases: [{ title: 'Author', detail: 'by category group' }, { title: 'Verify', detail: 'adversarial web cross-check' }],
};

const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, type: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'cat', 'type', 'effect', 'where'] } } }, required: ['items'] };

const GAME = 'The Legend of Zelda: A Link Between Worlds (Nintendo 3DS, 2013)';
const CATS = 'sword | shield | armor | bow | item | key | material';

const GROUPS = [
  { key: 'equipment', name: 'Weapons & worn gear (cats: sword, shield, armor, bow)',
    list: "Swords: Captain's/Forgotten Sword, Master Sword, and its two Master-Ore upgrades (Master Sword Lv2, Master Sword Lv3 / Tempered & Golden equivalents). Shields: Shield, Hylian Shield. Armor: the blue/red Mail upgrades if any (Charm). Bow line: Bow, Nice Bow, and Light Arrows / the Sage's bow used on Yuga Ganon. (Other rods/tools go in the tools group.)" },
  { key: 'tools', name: 'Tools, key items & collectibles (cats: item, key, material)',
    list: "Tools (cat item): Ravio's Bracelet (wall-merge), Bombs, Bow already covered, Fire Rod, Ice Rod, Tornado Rod, Sand Rod, Hammer, Hookshot, Boomerang, Lamp, Net, Pegasus Boots, Power Glove, Titan's Mitt, Flippers, the Bell (warp). Note each has a 'Nice' upgraded form from Mother Maiamai. Key items (cat key): the 3 Pendants of Virtue, the 7 Sages, Bottles. Collectibles (cat material): Maiamai, Piece of Heart, Heart Container, Master Ore, Monster Guts/Horn/Tail (for the Lorule witch's potions), Rupees." },
];

function authorPrompt(g) {
  return `Author part of the Items catalog for ${GAME} — the "${g.name}" group — as { items: [...] }.

Context: items come from Ravio's RENTAL shop (rent/buy) and use a shared green ENERGY meter, not ammo. Mother Maiamai upgrades items into stronger "Nice" versions. Include these (exact canonical names; split/merge sensibly): ${g.list}

Each entry: { name, cat (ONE of: ${CATS}), type (short noun label, e.g. "Sword", "Rod", "Tool", "Key item"), effect (what it does, 1–3 sentences), where (where/how obtained — note rented vs found, and the Nice upgrade if relevant) }. Beginner-first, accurate, honest — web-check uncertain effects/locations. Return { items }.`;
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
log(`ALBW compendium: ${items.length} entries (${[...new Set(items.map((i) => i.cat))].join(', ')})`);
return { items };
