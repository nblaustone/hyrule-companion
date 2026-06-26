export const meta = {
  name: 'ww-compendium',
  description: 'Author + verify the The Wind Waker Items-tab catalog (equipment + tools + songs + charts)',
  phases: [{ title: 'Author', detail: 'by category group' }, { title: 'Verify', detail: 'adversarial web cross-check' }],
};

const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, type: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'cat', 'type', 'effect', 'where'] } } }, required: ['items'] };

const GAME = 'The Legend of Zelda: The Wind Waker (Nintendo GameCube, 2002 / Wii U HD)';
const CATS = 'sword | shield | bow | song | item | key | material';

const GROUPS = [
  { key: 'equipment', name: 'Weapons & worn gear (cats: sword, shield, bow)',
    list: "Swords: Hero's Sword, Master Sword (note it starts powerless and is restored by the two Sages). Shields: Hero's Shield, Mirror Shield. Bow line: Hero's Bow, and the Fire Arrows, Ice Arrows, and Light Arrows (note the Bow is upgraded with each)." },
  { key: 'tools', name: 'Tools, songs, key items & charts (cats: item, song, key, material)',
    list: "Tools (cat item): Telescope, Sail (and Swift Sail in HD), Wind Waker conductor's baton, Grappling Hook, Deku Leaf, Boomerang, Bombs, Skull Hammer, Hookshot, Iron Boots, Power Bracelets, Picto Box / Deluxe Picto Box, Magic Armor, Hero's Charm, Tingle Tuner (Tingle Bottle in HD), Bait Bag, Delivery Bag, Spoils Bag, Bottles, Empty Bottle. Songs (cat song): Wind's Requiem, Ballad of Gales, Command Melody, Song of Passing, Earth God's Lyric, Wind God's Aria. Key items (cat key): the 3 Pearls (Din's/Farore's/Nayru's), the awakened Sages Medli & Makar, the Triforce of Courage. Charts/collectibles (cat material): Triforce Shard, Treasure Chart, Triforce Chart, Sea Chart, Piece of Heart, Heart Container, Joy Pendant, Skull Necklace, Golden Feather, Knight's Crest (the spoils)." },
];

function authorPrompt(g) {
  return `Author part of the Items catalog for ${GAME} — the "${g.name}" group — as { items: [...] }.

Include these (exact canonical names; split/merge sensibly): ${g.list}

Each entry: { name, cat (ONE of: ${CATS}), type (short noun label, e.g. "Sword", "Song", "Tool", "Pearl", "Chart"), effect (what it does, 1–3 sentences), where (where/how obtained — which dungeon/island) }. Beginner-first, accurate, honest — web-check uncertain effects/locations; flag HD-only items. Return { items }.`;
}
function verifyPrompt(g, draft) {
  return `ADVERSARIAL fact-check this ${GAME} catalog group ("${g.name}"). Use WebSearch/WebFetch (load via ToolSearch query "WebSearch WebFetch" if needed) against 2+ independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki). Fix wrong names/effects/locations, fill obvious gaps, keep cat ∈ ${CATS}. Honesty law: drop the unconfirmable; flag HD-only. Return the corrected { items }.

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
log(`WW compendium: ${items.length} entries (${[...new Set(items.map((i) => i.cat))].join(', ')})`);
return { items };
