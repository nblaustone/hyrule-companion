export const meta = {
  name: 'ww-depth',
  description: 'Author + verify The Wind Waker depth datasets: Items · Enemies · Fairies · Side Quests',
  phases: [{ title: 'Author', detail: 'one agent per dataset' }, { title: 'Verify', detail: 'adversarial web cross-check per dataset' }],
};

const GLYPHS = 'sword, shield, armor, bow, bomb, bag, key, gem, orb, stasis, magnesis, cryonis, leaf, heart, mask, pot, scroll, book, fairy, skull, champion';

const ITEMS_SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, glyph: { type: 'string' }, from: { type: 'string' }, what: { type: 'string' }, tip: { type: 'string' } }, required: ['id', 'name', 'glyph', 'from', 'what'] } } }, required: ['items'] };
const BESTIARY_SCHEMA = { type: 'object', additionalProperties: false, properties: { basics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } }, enemies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tier: { type: 'string' }, tactic: { type: 'string' }, drops: { type: 'string' }, battle: { type: 'string' } }, required: ['name', 'tier', 'tactic'] } } }, required: ['basics', 'enemies'] };
const FAIRIES_SCHEMA = { type: 'object', additionalProperties: false, properties: { fairies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, region: { type: 'string' }, location: { type: 'string' }, cost: { type: 'string' } }, required: ['name', 'location', 'cost'] } } }, required: ['fairies'] };
const QUESTS_SCHEMA = { type: 'object', additionalProperties: false, properties: { regions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { region: { type: 'string' }, quests: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, giver: { type: 'string' }, location: { type: 'string' }, reward: { type: 'string' }, oneLine: { type: 'string' }, how: { type: 'string' } }, required: ['name', 'oneLine', 'how'] } } }, required: ['region', 'quests'] } } }, required: ['regions'] };

const GAME = 'The Legend of Zelda: The Wind Waker (Nintendo GameCube, 2002; also the Wii U HD remaster)';
const CTX = 'Hyrule is drowned beneath the GREAT SEA; Link sails in the King of Red Lions and conducts the wind with the Wind Waker baton. Trophies: 3 Goddess Pearls (→ Tower of the Gods → Master Sword) + 2 awakened Sages (Medli, Makar → restore the Master Sword), then the 8 Triforce of Courage shards → Ganondorf. Items are found in dungeons (not rented). Beginner-first, spoiler-aware, honest — omit anything you cannot confirm; flag HD-remaster-only extras as such.';

const DATASETS = [
  {
    key: 'itemsSongs', schema: ITEMS_SCHEMA, name: 'Items & songs',
    author: `Author the complete ITEMS & SONGS reference for ${GAME} as { items: [...] }. ${CTX}

Cover the key gear and songs (~32–42 entries): the swords (Hero's Sword, Master Sword + its restoration) and Shields (Hero's Shield, Mirror Shield); the Wind Waker baton and its SONGS (Wind's Requiem, Ballad of Gales, Command Melody, Song of Passing, Earth God's Lyric, Wind God's Aria); the dungeon items (Grappling Hook, Deku Leaf, Boomerang, Bombs, Hero's Bow + Fire/Ice/Light Arrows, Skull Hammer, Hookshot, Iron Boots, Power Bracelets); the sea gear (Sail / Swift Sail (HD), Telescope, Picto Box / Deluxe Picto Box, Magic Armor, Hero's Charm, Tingle Tuner / Tingle Bottle (HD)); the bags/bottles (Bait Bag, Delivery Bag, Spoils Bag, Bottles).

Each item: { id (kebab-case), name (exact canonical), glyph (ONE of: ${GLYPHS} — use "stasis" for the Wind Waker & songs), from (where/how — which dungeon/island), what (what it does), tip (beginner tip; optional) }. Web-check uncertain spots. Return { items }.`,
  },
  {
    key: 'bestiary', schema: BESTIARY_SCHEMA, name: 'Enemies & combat',
    author: `Author the ENEMIES & combat dataset for ${GAME} as { basics: [...], enemies: [...] }. ${CTX}

basics: 6 primer cards { title, body } for a beginner — e.g. Z/L-targeting; the PARRY counter (flashing prompt → leap-strike that one-shots many foes); stealing a Bokoblin/Moblin's weapon for reach; the Deku Leaf + Magic meter; bottled Fairy auto-revive & Fairy/soup healing; sailing combat & the boat's cannon. 2–4 sentences each.

enemies: ~22 entries { name, tier ("common" | "mini-boss" | "boss"), tactic (1–2 sentences), drops (optional), battle (REQUIRED for every boss/mini-boss: full "how to win" — what to bring, opening, loop, weak point) }.
Include common foes (Bokoblin, Moblin, ChuChu, Keese, Miniblin, Bokoblin archers, Darknut, Stalfos, Wizzrobe, Peahat, Magtail, Floormaster, Redead, Big Octo, Seahat) AND every BOSS with a full battle guide: Gohma (Dragon Roost), Kalle Demos (Forbidden Woods), Gohdan (Tower of the Gods), the Helmaroc King (Forsaken Fortress), Jalhalla (Earth Temple), Molgera (Wind Temple), Puppet Ganon, and Ganondorf. Web-check boss strategies. Return { basics, enemies }.`,
  },
  {
    key: 'greatFairies', schema: FAIRIES_SCHEMA, name: 'Great Fairies',
    author: `Author the GREAT FAIRY dataset for ${GAME} as { fairies: [...] }. ${CTX}

The Wind Waker has Great Fairies that UPGRADE Link — hidden inside Big Octo lairs and on certain islands, they increase your Rupee Wallet, your Magic meter, and your Bomb and Arrow quiver capacities; the Fairy Queen (Mother & Child Isles) gives Fire & Ice Arrows and later Light Arrows. List each: { name, region (which island / Big Octo), location (how to reach — which Big Octo to slay, which chart), cost (what it GRANTS — wallet/magic/quiver size, or the arrow type) }. Web-check the specific islands and what each grants. Do NOT invent — only the real Great Fairies/Fairy Queen. Return { fairies }.`,
  },
  {
    key: 'sideQuests', schema: QUESTS_SCHEMA, name: 'Side quests',
    author: `Author the SIDE QUESTS dataset for ${GAME} as { regions: [ { region, quests:[...] } ] }. ${CTX}

Group ~16–24 optional pursuits into 3–5 themed groups (e.g. "Charts & Treasure", "Windfall Island", "Pictographs & the Nintendo Gallery", "Combat & the Sea", "Korok & Misc"). Each quest: { name, giver (optional), location, reward, oneLine (one sentence), how (spoiler-gated step-by-step, 2–6 sentences) }.
Cover: the Treasure/Triforce Charts + Tingle deciphering + salvaging; the Nintendo Gallery figurine quest (Pictographs with the Deluxe Picto Box → Carlov's statues); the Savage Labyrinth (Outset, the 'IN-credible Chart' / Heart Piece); Windfall extras (the Auction, the Mail/Letter quests like Maggie & Moe, the bomb-shop, the jail/painter); the Ghost Ship + its chart; growing the Koroks' trees in the Forest Haven; Beedle's Shop Ship & the point card; the Cabana / Private Oasis (HD). Web-check the trickier chains. Return { regions }.`,
  },
];

function verifyPrompt(d, draft) {
  return `You are an ADVERSARIAL fact-checker for ${GAME}. Below is a DRAFT "${d.name}" dataset. Find and FIX every factual error, fill obvious gaps, and return the corrected dataset in the SAME schema.

Use WebSearch and WebFetch (load via ToolSearch query "WebSearch WebFetch" if needed) to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, IGN). Check exact names, which island/dungeon, song requirements, boss strategies, what each Great Fairy grants, chart/figurine details. Honesty law: drop or soften anything you cannot confirm; flag HD-only extras. Keep it beginner-first and tight. Return ONLY the corrected dataset.

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
log(`WW depth: ${Object.keys(result).length}/${DATASETS.length} datasets — items ${(result.itemsSongs?.items || []).length}, enemies ${(result.bestiary?.enemies || []).length}, fairies ${(result.greatFairies?.fairies || []).length}, quest-groups ${(result.sideQuests?.regions || []).length}`);
return result;
