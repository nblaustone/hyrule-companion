export const meta = {
  name: 'albw-depth',
  description: 'Author + verify A Link Between Worlds depth datasets: Items · Enemies · Fairies · Side Quests',
  phases: [{ title: 'Author', detail: 'one agent per dataset' }, { title: 'Verify', detail: 'adversarial web cross-check per dataset' }],
};

const GLYPHS = 'sword, shield, armor, bow, bomb, bag, key, gem, orb, stasis, magnesis, cryonis, leaf, heart, mask, pot, scroll, book, fairy, skull, champion';

const ITEMS_SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, glyph: { type: 'string' }, from: { type: 'string' }, what: { type: 'string' }, tip: { type: 'string' } }, required: ['id', 'name', 'glyph', 'from', 'what'] } } }, required: ['items'] };
const BESTIARY_SCHEMA = { type: 'object', additionalProperties: false, properties: { basics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } }, enemies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tier: { type: 'string' }, tactic: { type: 'string' }, drops: { type: 'string' }, battle: { type: 'string' } }, required: ['name', 'tier', 'tactic'] } } }, required: ['basics', 'enemies'] };
const FAIRIES_SCHEMA = { type: 'object', additionalProperties: false, properties: { fairies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, region: { type: 'string' }, location: { type: 'string' }, cost: { type: 'string' } }, required: ['name', 'location', 'cost'] } } }, required: ['fairies'] };
const QUESTS_SCHEMA = { type: 'object', additionalProperties: false, properties: { regions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { region: { type: 'string' }, quests: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, giver: { type: 'string' }, location: { type: 'string' }, reward: { type: 'string' }, oneLine: { type: 'string' }, how: { type: 'string' } }, required: ['name', 'oneLine', 'how'] } } }, required: ['region', 'quests'] } } }, required: ['regions'] };

const GAME = 'The Legend of Zelda: A Link Between Worlds (Nintendo 3DS, 2013)';
const CTX = 'Sequel to A Link to the Past on the same Hyrule map + its dark twin LORULE (crossed via wall fissures). Two signature mechanics: WALL MERGE (Ravio\'s Bracelet — press into a wall as a moving painting) and Ravio\'s RENTAL SHOP (rent or buy items up front; items use a shared green ENERGY meter, not consumable ammo). Trophies: 3 Pendants (→ the Master Sword) then 7 Sages (→ Lorule Castle / Yuga Ganon). Beginner-first, spoiler-aware, honest — omit anything you cannot confirm.';

const DATASETS = [
  {
    key: 'itemsSongs', schema: ITEMS_SCHEMA, name: 'Items reference',
    author: `Author the complete ITEMS reference for ${GAME} as { items: [...] }. ${CTX}

Cover the key gear (~30–40 entries): Ravio's Bracelet (wall-merge), the swords (Captain's/Forgotten Sword → Master Sword → its two Master-Ore upgrades Lv2/Lv3), Shield, the rentable items (Bow, Bombs, Fire Rod, Ice Rod, Tornado Rod, Sand Rod, Hammer, Hookshot, Boomerang, Lamp, Net), Pegasus Boots, Power Glove / Titan's Mitt, Flippers, the Bell (warp to Weather Vanes), Bottles, the Pouch/energy meter, the Master Ore upgrade path, and how Mother Maiamai turns items into stronger "Nice" versions. Also the 3 Pendants of Virtue.

Each item: { id (kebab-case), name (exact canonical), glyph (ONE of: ${GLYPHS}), from (where/how — note RENTED-from-Ravio vs found), what (what it does — energy cost not ammo), tip (beginner tip; optional) }. Web-check uncertain spots. Return { items }.`,
  },
  {
    key: 'bestiary', schema: BESTIARY_SCHEMA, name: 'Enemies & combat',
    author: `Author the ENEMIES & combat dataset for ${GAME} as { basics: [...], enemies: [...] }. ${CTX}

basics: 6 primer cards { title, body } for a beginner — e.g. sword swing & charged Spin Attack; the Shield; the green ENERGY meter shared by items/merge (pace it); wall-merge as both traversal AND a dodge (merge to escape attacks); rented items get repossessed if you DIE (so buy favorites); bottled fairy auto-revive. 2–4 sentences each.

enemies: ~22 entries { name, tier ("common" | "mini-boss" | "boss"), tactic (1–2 sentences), drops (optional), battle (REQUIRED for every boss: full "how to win" — what to RENT/equip, opening, loop, weak point, the merge angle) }.
Include common foes AND every dungeon BOSS with a full battle guide: Margomill (House of Gales), Moldorm (Tower of Hera), Gemesaur King (Dark Palace), Arrghus (Swamp Palace), Knucklemaster (Skull Woods), Stalblind (Thieves' Hideout), Dharkstare (Ice Ruins), Zaganaga (Desert Palace), Grinexx (Turtle Rock), and Yuga / Yuga Ganon (the finale). Web-check boss names & strategies. Return { basics, enemies }.`,
  },
  {
    key: 'greatFairies', schema: FAIRIES_SCHEMA, name: 'Fairies & upgrades',
    author: `Author the FAIRIES / upgrade-spot dataset for ${GAME} as { fairies: [...] }. ${CTX}

Cover the special helpers that UPGRADE or restore Link: Mother Maiamai (return her 100 baby Maiamai to upgrade your items into "Nice" versions — list which items can be upgraded and roughly how many Maiamai each costs); the Great Rupee Fairy in a Lorule cave (toss in Rupees for a reward — note it); the Hyrule/Lorule blacksmith + the two Master Ore that upgrade the Master Sword; and any real Fairy Fountains that heal. Each: { name, region, location (how to reach + what to bring), cost (what it GRANTS, and any cost) }. Do NOT invent fountains — only the real ones. Web-check. Return { fairies }.`,
  },
  {
    key: 'sideQuests', schema: QUESTS_SCHEMA, name: 'Side quests',
    author: `Author the SIDE QUESTS dataset for ${GAME} as { regions: [ { region, quests:[...] } ] }. ${CTX}

Group ~16–24 optional pursuits into 3–5 themed groups (e.g. "Maiamai & Nice Items", "Heart Pieces", "Minigames", "Combat Challenges", "Trades & Secrets"). Each quest: { name, giver (optional), location, reward, oneLine (one sentence), how (spoiler-gated step-by-step, 2–5 sentences) }.
Cover: the 100 Maiamai hunt + the Nice-item upgrades; notable Pieces of Heart; the Treacherous Tower (combat gauntlet) and its tiers; the minigames (Octoball Derby, Cucco Ranch dodge, Rupee Rush in Hyrule & Lorule, the baseball/Hooligan); StreetPass / Shadow Link battles (and how it works offline); the Stylish Woman who gives the Pegasus Boots; the Mysterious Man / Bee; the Master Ore sword upgrades. Web-check the trickier ones. Return { regions }.`,
  },
];

function verifyPrompt(d, draft) {
  return `You are an ADVERSARIAL fact-checker for ${GAME}. Below is a DRAFT "${d.name}" dataset. Find and FIX every factual error, fill obvious gaps, and return the corrected dataset in the SAME schema.

Use WebSearch and WebFetch (load via ToolSearch query "WebSearch WebFetch" if needed) to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, gamerguides). Check exact names, rental vs found items, energy-not-ammo, boss strategies, Maiamai/Nice-item details, minigame rewards. Honesty law: drop or soften anything you cannot confirm. Keep it beginner-first and tight. Return ONLY the corrected dataset.

DRAFT:
${JSON.stringify(draft)}`;
}

const out = await pipeline(
  DATASETS,
  (d) => agent(d.author, { label: `author:${d.key}`, phase: 'Author', schema: d.schema, agentType: 'claude' }),
  (draft, d) => draft ? agent(verifyPrompt(d, draft), { label: `verify:${d.key}`, phase: 'Verify', schema: d.schema, agentType: 'claude' }).then((v) => v || draft) : null,
);

const result = {};
DATASETS.forEach((d, i) => { if (out[i]) result[d.key] = out[i]; });
log(`ALBW depth: ${Object.keys(result).length}/${DATASETS.length} datasets — items ${(result.itemsSongs?.items || []).length}, enemies ${(result.bestiary?.enemies || []).length}, fairies ${(result.greatFairies?.fairies || []).length}, quest-groups ${(result.sideQuests?.regions || []).length}`);
return result;
