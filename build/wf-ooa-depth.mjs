export const meta = {
  name: 'ooa-depth',
  description: 'Author + verify Oracle of Ages depth datasets: Items · Enemies · Fairies · Side Quests',
  phases: [{ title: 'Author', detail: 'one agent per dataset' }, { title: 'Verify', detail: 'adversarial web cross-check per dataset' }],
};

const GLYPHS = 'sword, shield, armor, bow, bomb, bag, key, gem, orb, stasis, magnesis, cryonis, leaf, heart, mask, pot, scroll, book, fairy, skull, champion';

const ITEMS_SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, glyph: { type: 'string' }, from: { type: 'string' }, what: { type: 'string' }, tip: { type: 'string' } }, required: ['id', 'name', 'glyph', 'from', 'what'] } } }, required: ['items'] };
const BESTIARY_SCHEMA = { type: 'object', additionalProperties: false, properties: { basics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } }, enemies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tier: { type: 'string' }, tactic: { type: 'string' }, drops: { type: 'string' }, battle: { type: 'string' } }, required: ['name', 'tier', 'tactic'] } } }, required: ['basics', 'enemies'] };
const FAIRIES_SCHEMA = { type: 'object', additionalProperties: false, properties: { fairies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, region: { type: 'string' }, location: { type: 'string' }, cost: { type: 'string' } }, required: ['name', 'location', 'cost'] } } }, required: ['fairies'] };
const QUESTS_SCHEMA = { type: 'object', additionalProperties: false, properties: { regions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { region: { type: 'string' }, quests: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, giver: { type: 'string' }, location: { type: 'string' }, reward: { type: 'string' }, oneLine: { type: 'string' }, how: { type: 'string' } }, required: ['name', 'oneLine', 'how'] } } }, required: ['region', 'quests'] } } }, required: ['regions'] };

const GAME = 'The Legend of Zelda: Oracle of Ages (Game Boy Color, 2001)';
const CTX = 'Set in LABRYNNA. Link wields the Harp of Ages (travel between the PAST and PRESENT at time portals — a change in the past reshapes the present), powers tools with magic Seeds, fires the wall-bouncing Seed Shooter, and collects equippable magic RINGS (Vasu appraises). He gathers the 8 Essences of Time from 8 dungeons to wake the Maku Seed and beat Veran. Ages is the puzzle-heavy Oracle. Linked-game password ties it to Oracle of Seasons. Beginner-first, spoiler-aware, honest.';

const DATASETS = [
  {
    key: 'itemsSongs', schema: ITEMS_SCHEMA, name: 'Items reference',
    author: `Author the complete ITEMS reference for ${GAME} as { items: [...] }. ${CTX}

Cover the key gear (~28–38 entries): the Harp of Ages + its three tunes (Tune of Echoes, Tune of Currents, Tune of Ages); the swords (Wooden/Noble/Master) and the Fool's Ore/Biggoron Sword if present; shields (Wooden/Iron/Mirror); the Seed Satchel + 5 Seeds; the Seed Shooter; Power Bracelet, Roc's Feather, Switch Hook + Long Hook, Cane of Somaria, Bombs, Shovel, the Mermaid Suit (swim), the Flippers/Zora's Scale; the Flute & animal companions (Ricky/Dimitri/Moosh); Gasha Seeds; the magic Rings + Ring Box; Bottles/Magic Potion.

Each item: { id (kebab-case), name (exact canonical), glyph (ONE of: ${GLYPHS} — use "stasis" for the Harp/tunes), from (where/how — which dungeon/era/NPC), what (what it does), tip (beginner tip; optional) }. Web-check uncertain spots. Return { items }.`,
  },
  {
    key: 'bestiary', schema: BESTIARY_SCHEMA, name: 'Enemies & combat',
    author: `Author the ENEMIES & combat dataset for ${GAME} as { basics: [...], enemies: [...] }. ${CTX}

basics: 6 primer cards { title, body } — sword slash & Spin Attack; using time-travel to reposition/avoid; the wall-bouncing Seed Shooter; the Switch Hook swapping places with blocks/enemies; equipping a magic Ring; riding the animal companion / bottled fairy. 2–4 sentences each.

enemies: ~22 entries { name, tier ("common" | "mini-boss" | "boss"), tactic, drops (optional), battle (REQUIRED for every boss/mini-boss: full "how to win") }.
Include common foes AND every BOSS with a full battle guide: Pumpkin Head (Spirit's Grave), Head Thwomp (Wing Dungeon), Shadow Hag (Moonlit Grotto), Eyesoar (Skull Dungeon), Smog (Crown Dungeon), Octogon (Mermaid's Cave), Plasmarine (Jabu-Jabu's Belly), the Ancient Tomb boss (confirm — Ramrock), and Veran (her multiple forms). CONFIRM every boss name via the web. Return { basics, enemies }.`,
  },
  {
    key: 'greatFairies', schema: FAIRIES_SCHEMA, name: 'Fairies & helpers',
    author: `Author the FAIRIES / one-time-helper dataset for ${GAME} as { fairies: [...] }. ${CTX}

List the real Fairy Fountains (that heal Link) AND the key one-time stat/upgrade helpers (the smithy / weapon & shield upgrades, any Great Fairy or fountain). Each: { name, region, location (how to reach — note the era), cost (what it GRANTS — a heal, or an upgrade) }. Do NOT invent — only real ones. If the game has few true fairies, include the real fountains plus the upgrade NPCs so the list is useful. Web-check. Return { fairies }.`,
  },
  {
    key: 'sideQuests', schema: QUESTS_SCHEMA, name: 'Side quests',
    author: `Author the SIDE QUESTS dataset for ${GAME} as { regions: [ { region, quests:[...] } ] }. ${CTX}

Group ~16–24 optional pursuits into 3–5 themed groups (e.g. "Rings & Vasu", "Trading Quest", "Animal Companions", "Heart Pieces", "Time-Travel Secrets"). Each quest: { name, giver (optional), location, reward, oneLine, how (spoiler-gated step-by-step, 2–6 sentences) }.
Cover: the long TRADING SEQUENCE (the famous Ages trade chain — list the chain in 'how'); the Magic Ring hunt + Vasu + Maple; choosing/feeding the animal companion (Ricky/Dimitri/Moosh); notable Pieces of Heart (and the cross-time ones); the Gasha Seed nut-growing; Wild Tokay / minigames; the linked-game secrets/passwords (Oracle of Seasons) + the true final boss. Web-check the trading chain order. Return { regions }.`,
  },
];

function verifyPrompt(d, draft) {
  return `You are an ADVERSARIAL fact-checker for ${GAME}. Below is a DRAFT "${d.name}" dataset. Find and FIX every factual error, fill obvious gaps, and return the corrected dataset in the SAME schema.

Use WebSearch and WebFetch (load via ToolSearch query "WebSearch WebFetch" if needed) to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky). Check exact names, dungeon/era locations, boss names (several Ages bosses are easy to get wrong), the trading-chain order, ring/companion details. Honesty law: drop or soften anything you cannot confirm. Keep it beginner-first and tight. Return ONLY the corrected dataset.

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
log(`OoA depth: ${Object.keys(result).length}/${DATASETS.length} datasets — items ${(result.itemsSongs?.items || []).length}, enemies ${(result.bestiary?.enemies || []).length}, fairies ${(result.greatFairies?.fairies || []).length}, quest-groups ${(result.sideQuests?.regions || []).length}`);
return result;
