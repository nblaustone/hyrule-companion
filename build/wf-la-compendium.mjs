export const meta = {
  name: 'la-compendium',
  description: "Author + verify the Link's Awakening Items-tab catalog (equipment + tools + songs + key items)",
  phases: [{ title: 'Author', detail: 'by category group' }, { title: 'Verify', detail: 'adversarial web cross-check' }],
};

const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, type: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'cat', 'type', 'effect', 'where'] } } }, required: ['items'] };

const GAME = "The Legend of Zelda: Link's Awakening (Game Boy, 1993 / DX / Switch), set on Koholint Island";
const CATS = 'sword | shield | bow | song | item | key | material';

const GROUPS = [
  { key: 'equipment', name: 'Weapons & worn gear (cats: sword, shield, bow)',
    list: 'Sword (L-1) and the L-2 Sword (from the Seashell Mansion); Shield and the Mirror Shield (Eagle\'s Tower); the Bow. Note the sword fires a beam at full health.' },
  { key: 'tools', name: 'Tools, songs, key items & collectibles (cats: item, song, key, material)',
    list: "Tools (cat item): Roc's Feather, Pegasus Boots, Power Bracelet (L-1) and Power Bracelet L-2, Shovel, Hookshot, Magic Rod, Boomerang, Bombs, Magic Powder, Flippers, Magnifying Lens, Bow & Bombs combo. Songs (cat song): Ocarina, Ballad of the Wind Fish, Manbo's Mambo, Frog's Song of Soul. Key items (cat key): the 8 Instruments of the Sirens (one entry each or grouped: Full Moon Cello, Conch Horn, Sea Lily's Bell, Surf Harp, Wind Marimba, Coral Triangle, Organ of Evening Calm, Thunder Drum), and the dungeon keys (Tail Key, Slime Key, Angler Key, Face Key, Bird Key). Collectibles/buffs (cat material): Secret Seashell, Piece of Heart, Heart Container, Piece of Power, Guardian Acorn, Rupees." },
];

function authorPrompt(g) {
  return `Author part of the Items catalog for ${GAME} — the "${g.name}" group — as { items: [...] }.

Include these (exact canonical names; split or merge sensibly): ${g.list}

Each entry: { name, cat (ONE of: ${CATS}), type (a short noun label, e.g. "Sword", "Tool", "Song", "Instrument", "Key item"), effect (what it does, 1–3 sentences), where (where/how the player obtains it) }. Remember the two-item-button limit. Beginner-first, accurate, honest — web-check uncertain locations/effects; flag DX/Switch-only items as such. Return { items }.`;
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
log(`LA compendium: ${items.length} entries (${[...new Set(items.map((i) => i.cat))].join(', ')})`);
return { items };
