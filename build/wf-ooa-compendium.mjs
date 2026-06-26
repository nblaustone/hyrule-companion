export const meta = {
  name: 'ooa-compendium',
  description: 'Author + verify the Oracle of Ages Items-tab catalog (equipment + tools + rings)',
  phases: [{ title: 'Author', detail: 'by category group' }, { title: 'Verify', detail: 'adversarial web cross-check' }],
};

const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, type: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'cat', 'type', 'effect', 'where'] } } }, required: ['items'] };

const GAME = 'The Legend of Zelda: Oracle of Ages (Game Boy Color, 2001)';
const CATS = 'sword | shield | item | key | material';

const GROUPS = [
  { key: 'equipment', name: 'Weapons & worn gear (cats: sword, shield)',
    list: "Swords: Wooden Sword, Noble Sword, Master Sword, the Biggoron's Sword / Fool's Ore if present. Shields: Wooden Shield, Iron Shield, Mirror Shield." },
  { key: 'tools', name: 'Tools, key items & collectibles (cats: item, key, material)',
    list: "Tools (cat item): Harp of Ages + its 3 Tunes (Echoes/Currents/Ages), Seed Satchel + 5 Seeds, Seed Shooter, Power Bracelet, Roc's Feather, Switch Hook + Long Hook, Cane of Somaria, Bombs, Shovel, Mermaid Suit, Flippers/Zora's Scale, Flute (+ Ricky/Dimitri/Moosh), Ring Box. Key items (cat key): the 8 Essences of Time, dungeon keys, the Maku Seed. Collectibles (cat material): Magic Ring (the system + a few notable rings), Gasha Seed, Piece of Heart, Heart Container, Rupees." },
];

function authorPrompt(g) {
  return `Author part of the Items catalog for ${GAME} — the "${g.name}" group — as { items: [...] }.

Context: Labrynna; the Harp of Ages travels between past and present; magic Seeds power tools (the Seed Shooter ricochets); equippable magic Rings give powers. Include these (exact canonical names; split/merge sensibly): ${g.list}

Each entry: { name, cat (ONE of: ${CATS}), type (short noun label, e.g. "Sword", "Harp", "Tool", "Essence", "Ring"), effect (what it does, 1–3 sentences), where (where/how obtained — which dungeon/era/NPC) }. For the Magic Ring system, list it as one entry plus a few notable rings. Beginner-first, accurate, honest — web-check uncertain effects/locations. Return { items }.`;
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
log(`OoA compendium: ${items.length} entries (${[...new Set(items.map((i) => i.cat))].join(', ')})`);
return { items };
