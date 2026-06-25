export const meta = {
  name: 'alttp-depth',
  description: 'Author + verify A Link to the Past depth datasets: Items · Enemies · Fairies · Side Quests',
  phases: [
    { title: 'Author', detail: 'one agent per dataset' },
    { title: 'Verify', detail: 'adversarial web cross-check per dataset' },
  ],
};

const GLYPHS = 'sword, shield, armor, bow, bomb, bag, key, gem, orb, stasis, magnesis, cryonis, leaf, heart, mask, pot, scroll, book, fairy, skull, champion';

const ITEMS_SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, glyph: { type: 'string' }, from: { type: 'string' }, what: { type: 'string' }, tip: { type: 'string' } }, required: ['id', 'name', 'glyph', 'from', 'what'] } } }, required: ['items'] };
const BESTIARY_SCHEMA = { type: 'object', additionalProperties: false, properties: { basics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } }, enemies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tier: { type: 'string' }, tactic: { type: 'string' }, drops: { type: 'string' }, battle: { type: 'string' } }, required: ['name', 'tier', 'tactic'] } } }, required: ['basics', 'enemies'] };
const FAIRIES_SCHEMA = { type: 'object', additionalProperties: false, properties: { fairies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, region: { type: 'string' }, location: { type: 'string' }, cost: { type: 'string' } }, required: ['name', 'location', 'cost'] } } }, required: ['fairies'] };
const QUESTS_SCHEMA = { type: 'object', additionalProperties: false, properties: { regions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { region: { type: 'string' }, quests: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, giver: { type: 'string' }, location: { type: 'string' }, reward: { type: 'string' }, oneLine: { type: 'string' }, how: { type: 'string' } }, required: ['name', 'oneLine', 'how'] } } }, required: ['region', 'quests'] } } }, required: ['regions'] };

const GAME = 'The Legend of Zelda: A Link to the Past (Super Nintendo, 1991)';
const CTX = 'Hyrule split into a Light World and a Dark World. Quest: collect the 3 Pendants → draw the Master Sword → defeat Agahnim → free 7 Maidens (crystals) from Dark World dungeons → defeat Ganon. Beginner-first, spoiler-aware, honest (omit anything you cannot confirm).';

const DATASETS = [
  {
    key: 'itemsSongs', schema: ITEMS_SCHEMA, name: 'Items reference',
    author: `Author the complete ITEMS reference for ${GAME} as { items: [...] }. ${CTX}

Cover every notable item and equipment a player gets across the whole game (~30–42 entries): the sword tiers (Fighter's Sword, Master Sword, Tempered Sword, Golden Sword), shields (Fighter's/Red/Mirror Shield), mail/armor (Green/Blue/Red Mail), Bow & Arrows + Silver Arrows, the Boomerang(s) (Blue & Magical/Red), Hookshot, Bombs, Magic Hammer, Fire Rod, Ice Rod, Lamp, Bug-Catching Net, Book of Mudora, Cane of Somaria, Cane of Byrna, Magic Cape, Magic Mirror, Pegasus Boots, Power Glove, Titan's Mitt, Flippers (Zora's Flippers), Moon Pearl, Magic/Empty Bottles, Magic Powder, Shovel, Ocarina/Flute (Shovel digs it up; the bird), Bombos/Ether/Quake Medallions, Pieces of Heart, the 3 Pendants of Virtue, the 7 Crystals.

Each item: { id (kebab-case), name (exact canonical), glyph (ONE of: ${GLYPHS}), from (where/how you get it), what (what it does), tip (a beginner tip; optional but encouraged) }. Pick the closest-fitting glyph. Be accurate; web-check uncertain locations. Return { items }.`,
  },
  {
    key: 'bestiary', schema: BESTIARY_SCHEMA, name: 'Enemies & combat',
    author: `Author the ENEMIES & combat dataset for ${GAME} as { basics: [...], enemies: [...] }. ${CTX}

basics: 6 short "combat basics" primer cards { title, body } teaching the core systems a beginner needs — e.g. sword swings & the charged Spin Attack; using the Shield to block; deflecting Agahnim's/энemy magic; the green Magic meter and magic items; bottled fairies as auto-revives; Bombs & bombable walls; the two-worlds Magic-Mirror idea. Keep each body 2–4 sentences.

enemies: ~22 entries { name, tier ("common" | "mini-boss" | "boss"), tactic (how to fight it, 1–2 sentences), drops (optional), battle (REQUIRED for every boss/mini-boss: a fuller "how to win this fight" guide — what to bring, the opening, the core loop, the weak point) }.
Include the common foes (Soldier/Guard variants, Octorok, Moblin, Keese, Zora, Stalfos, Wizzrobe, Helmasaur, Goriya, Hardhat Beetle, Ropa, Zazak/Fireball wizzrobes, Stal, etc.) AND every main BOSS with a full battle guide: Armos Knights, Lanmolas, Moldorm, Agahnim, Helmasaur King, Arrghus, Mothula, Blind the Thief, Kholdstare, Vitreous, Trinexx, and Ganon. Web-check boss strategies. Return { basics, enemies }.`,
  },
  {
    key: 'greatFairies', schema: FAIRIES_SCHEMA, name: 'Fairies & upgrades',
    author: `Author the FAIRIES / fountain-upgrade dataset for ${GAME} as { fairies: [...] }. ${CTX}

These are the magic fountains & special fairies that UPGRADE Link. Cover: the Pyramid Fairy (Great Fairy who upgrades the Master Sword → Tempered → Golden, and the Bow → Silver Arrows, once you can reach her); the Waterfall of Wishing fairy (toss in items to upgrade the Boomerang and Shield / get bigger Bomb & Arrow capacity, and she refills/restores lost items); the Mad Batter (under the rock with the Magic Powder/Hammer — halves your magic consumption); and the ordinary Fairy Fountains/ponds that fully heal. Each: { name, region (area), location (how to reach + what to bring), cost (what it GRANTS, and any item/rupee cost) }. Web-check. Return { fairies }.`,
  },
  {
    key: 'sideQuests', schema: QUESTS_SCHEMA, name: 'Side quests',
    author: `Author the SIDE QUESTS dataset for ${GAME} as { regions: [ { region, quests:[...] } ] }. ${CTX}

Group ~16–24 optional pursuits into 3–5 sensible region/theme groups (e.g. "Upgrades & Fountains", "Heart Pieces & Bottles", "Minigames", "Medallions & Secrets", "Dark World extras"). Each quest: { name, giver (optional), location, reward, oneLine (one-sentence summary), how (a spoiler-gated step-by-step how-to, 2–5 sentences) }.
Cover: the 4 Magic Bottle locations; the magic/sword/shield upgrades; the three Medallion tablets (Bombos/Ether/Quake) and where to learn them; the Magic Cape; the Cane of Byrna; the digging game; the Treasure-Chest game; the bottle vendor; the Flute/bird shortcut; the Smithy reforging; notable Pieces of Heart and how to reach them. Web-check the trickier ones. Return { regions }.`,
  },
];

function verifyPrompt(d, draft) {
  return `You are an ADVERSARIAL fact-checker for ${GAME}. Below is a DRAFT "${d.name}" dataset. Find and FIX every factual error, fill obvious gaps, and return the corrected dataset in the SAME schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky, StrategyWiki). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Check exact names, locations, item effects, boss strategies, upgrade costs. Honesty law: drop or soften anything you cannot confirm rather than asserting it. Keep it beginner-first and tight. Return ONLY the corrected dataset.

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
log(`ALttP depth: ${Object.keys(result).length}/${DATASETS.length} datasets — items ${(result.itemsSongs?.items || []).length}, enemies ${(result.bestiary?.enemies || []).length}, fairies ${(result.greatFairies?.fairies || []).length}, quest-groups ${(result.sideQuests?.regions || []).length}`);
return result;
