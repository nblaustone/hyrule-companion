export const meta = {
  name: 'minish-depth',
  description: 'Author + verify The Minish Cap depth datasets: Items · Enemies · Fairies · Side Quests',
  phases: [{ title: 'Author', detail: 'one agent per dataset' }, { title: 'Verify', detail: 'adversarial web cross-check per dataset' }],
};

const GLYPHS = 'sword, shield, armor, bow, bomb, bag, key, gem, orb, stasis, magnesis, cryonis, leaf, heart, mask, pot, scroll, book, fairy, skull, champion';

const ITEMS_SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, glyph: { type: 'string' }, from: { type: 'string' }, what: { type: 'string' }, tip: { type: 'string' } }, required: ['id', 'name', 'glyph', 'from', 'what'] } } }, required: ['items'] };
const BESTIARY_SCHEMA = { type: 'object', additionalProperties: false, properties: { basics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } }, enemies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tier: { type: 'string' }, tactic: { type: 'string' }, drops: { type: 'string' }, battle: { type: 'string' } }, required: ['name', 'tier', 'tactic'] } } }, required: ['basics', 'enemies'] };
const FAIRIES_SCHEMA = { type: 'object', additionalProperties: false, properties: { fairies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, region: { type: 'string' }, location: { type: 'string' }, cost: { type: 'string' } }, required: ['name', 'location', 'cost'] } } }, required: ['fairies'] };
const QUESTS_SCHEMA = { type: 'object', additionalProperties: false, properties: { regions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { region: { type: 'string' }, quests: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, giver: { type: 'string' }, location: { type: 'string' }, reward: { type: 'string' }, oneLine: { type: 'string' }, how: { type: 'string' } }, required: ['name', 'oneLine', 'how'] } } }, required: ['region', 'quests'] } } }, required: ['regions'] };

const GAME = 'The Legend of Zelda: The Minish Cap (Game Boy Advance, 2004)';
const CTX = 'Hyrule. Link SHRINKS to tiny Minish (Picori) size with Ezlo the talking cap, and fuses KINSTONE halves with people and creatures (100 fusions) to trigger events. He gathers the 4 Elements (Earth/Fire/Water/Wind) from the dungeons to reforge the Picori Blade into the Four Sword and defeat the sorcerer Vaati. Beginner-first, spoiler-aware, honest — omit anything you cannot confirm.';

const DATASETS = [
  {
    key: 'itemsSongs', schema: ITEMS_SCHEMA, name: 'Items reference',
    author: `Author the complete ITEMS reference for ${GAME} as { items: [...] }. ${CTX}

Cover the key gear (~30–40 entries): Ezlo (shrink/glide), the swords (Smith's Sword → White Sword → Four Sword, and the sword's clone power), the Mirror Shield, the dungeon items (Gust Jar, Cane of Pacci, Mole Mitts, Flame Lantern, Roc's Cape), the Bow + Light Arrow, the Boomerang + Magical Boomerang, Bombs + Remote Bombs, Pegasus Boots, Lantern, Grip Ring, Flippers, Bottles, Picolyte (colors), the Kinstone Bag, Mysterious Shells (the figurine currency), and the wallet/quiver/bomb-bag upgrades.

Each item: { id (kebab-case), name (exact canonical), glyph (ONE of: ${GLYPHS}), from (where/how — which dungeon/town/fusion), what (what it does), tip (beginner tip; optional) }. Web-check uncertain spots. Return { items }.`,
  },
  {
    key: 'bestiary', schema: BESTIARY_SCHEMA, name: 'Enemies & combat',
    author: `Author the ENEMIES & combat dataset for ${GAME} as { basics: [...], enemies: [...] }. ${CTX}

basics: 6 primer cards { title, body } for a beginner — e.g. sword slash & charged Spin Attack; the Four Sword CLONES (spawn copies on tiles for block/switch puzzles); shrinking with Ezlo as both exploration AND escaping some foes; the Gust Jar's pull/vacuum tricks; Kinstone fusion for secrets; bottled fairy / Picolyte buffs. 2–4 sentences each.

enemies: ~22 entries { name, tier ("common" | "mini-boss" | "boss"), tactic (1–2 sentences), drops (optional), battle (REQUIRED for every boss/mini-boss: full "how to win" — what to bring, opening, loop, weak point) }.
Include common foes (Green/Red/Blue ChuChu, Octorok, Moblin, Keaton, Keese, Spiny Beetle, Rollobite, Mulldozer, Crow, Wisp, Ghini, Spear/Sword Moblins) AND every BOSS/mini-boss with a full battle guide: Madderpillar, Big Green ChuChu (Deepwood), Gleerok (Cave of Flames), Mazaal (Fortress of Winds), Big Octorok (Temple of Droplets), the Gyorg Pair (Palace of Winds), and Vaati's forms (Vaati Reborn, Vaati Transfigured, the final form). Web-check boss strategies. Return { basics, enemies }.`,
  },
  {
    key: 'greatFairies', schema: FAIRIES_SCHEMA, name: 'Great Fairies',
    author: `Author the GREAT FAIRY dataset for ${GAME} as { fairies: [...] }. ${CTX}

The Minish Cap has Great Fairy Fountains that UPGRADE Link — they enlarge your Wallet, your Quiver (arrows), and your Bomb Bag. List each real one: { name, region (which area), location (how to reach — often via a Kinstone fusion or a hidden cave), cost (what it GRANTS — wallet/quiver/bomb-bag upgrade) }. Do NOT invent — only the real Great Fairies. Web-check which fountain grants which upgrade and how to open it. Return { fairies }.`,
  },
  {
    key: 'sideQuests', schema: QUESTS_SCHEMA, name: 'Side quests',
    author: `Author the SIDE QUESTS dataset for ${GAME} as { regions: [ { region, quests:[...] } ] }. ${CTX}

Group ~16–24 optional pursuits into 3–5 themed groups (e.g. "Kinstone Fusions", "Figurines & Mysterious Shells", "Heart Pieces", "Town & Trades", "Misc Secrets"). Each quest: { name, giver (optional), location, reward, oneLine (one sentence), how (spoiler-gated step-by-step, 2–6 sentences) }.
Cover: the Kinstone Fusion system (overview + several high-value fusions like Goron caves and the beanstalks); the Figurine Gallery (collect Mysterious Shells, spend them at Carlov's Figurine machine, complete all 136); notable Pieces of Heart; the Goron Merchant / Stockwell's dog Pina; the Tingle siblings & the gold Kinstone; the Wind Tribe quest; the town minigames (Simon's Simulation, the school, the cafe); Dr. Left & the librarians; the Carlov / Borlov; the Sword upgrades (Spin Attack / Fast Spin / Roll Attack) from the dojo. Web-check the trickier chains. Return { regions }.`,
  },
];

function verifyPrompt(d, draft) {
  return `You are an ADVERSARIAL fact-checker for ${GAME}. Below is a DRAFT "${d.name}" dataset. Find and FIX every factual error, fill obvious gaps, and return the corrected dataset in the SAME schema.

Use WebSearch and WebFetch (load via ToolSearch query "WebSearch WebFetch" if needed) to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky). Check exact names, dungeon/town locations, Kinstone/figurine details, boss strategies, which Great Fairy grants which upgrade. Honesty law: drop or soften anything you cannot confirm. Keep it beginner-first and tight. Return ONLY the corrected dataset.

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
log(`Minish depth: ${Object.keys(result).length}/${DATASETS.length} datasets — items ${(result.itemsSongs?.items || []).length}, enemies ${(result.bestiary?.enemies || []).length}, fairies ${(result.greatFairies?.fairies || []).length}, quest-groups ${(result.sideQuests?.regions || []).length}`);
return result;
