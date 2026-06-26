export const meta = {
  name: 'oos-depth',
  description: 'Author + verify Oracle of Seasons depth datasets: Items · Enemies · Fairies · Side Quests',
  phases: [{ title: 'Author', detail: 'one agent per dataset' }, { title: 'Verify', detail: 'adversarial web cross-check per dataset' }],
};

const GLYPHS = 'sword, shield, armor, bow, bomb, bag, key, gem, orb, stasis, magnesis, cryonis, leaf, heart, mask, pot, scroll, book, fairy, skull, champion';

const ITEMS_SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, glyph: { type: 'string' }, from: { type: 'string' }, what: { type: 'string' }, tip: { type: 'string' } }, required: ['id', 'name', 'glyph', 'from', 'what'] } } }, required: ['items'] };
const BESTIARY_SCHEMA = { type: 'object', additionalProperties: false, properties: { basics: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } }, enemies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tier: { type: 'string' }, tactic: { type: 'string' }, drops: { type: 'string' }, battle: { type: 'string' } }, required: ['name', 'tier', 'tactic'] } } }, required: ['basics', 'enemies'] };
const FAIRIES_SCHEMA = { type: 'object', additionalProperties: false, properties: { fairies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, region: { type: 'string' }, location: { type: 'string' }, cost: { type: 'string' } }, required: ['name', 'location', 'cost'] } } }, required: ['fairies'] };
const QUESTS_SCHEMA = { type: 'object', additionalProperties: false, properties: { regions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { region: { type: 'string' }, quests: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, giver: { type: 'string' }, location: { type: 'string' }, reward: { type: 'string' }, oneLine: { type: 'string' }, how: { type: 'string' } }, required: ['name', 'oneLine', 'how'] } } }, required: ['region', 'quests'] } } }, required: ['regions'] };

const GAME = 'The Legend of Zelda: Oracle of Seasons (Game Boy Color, 2001)';
const CTX = 'Set in HOLODRUM. Link wields the Rod of Seasons (change season at stumps — Spring/Summer/Autumn/Winter each reshape the land), powers tools with magic Seeds, visits the under-realm SUBROSIA, and collects equippable magic RINGS (Vasu appraises). He gathers the 8 Essences of Nature from 8 dungeons to wake the Maku Seed and beat Onox. An animal companion (Ricky/Dimitri/Moosh) helps cross the overworld. Linked-game password ties it to Oracle of Ages. Beginner-first, spoiler-aware, honest.';

const DATASETS = [
  {
    key: 'itemsSongs', schema: ITEMS_SCHEMA, name: 'Items reference',
    author: `Author the complete ITEMS reference for ${GAME} as { items: [...] }. ${CTX}

Cover the key gear (~28–38 entries): the Rod of Seasons and the four Season Spirits; the swords (Wooden/Noble/Master Sword) and the Fool's Ore; shields (Wooden/Iron/Mirror); the Seed Satchel + the five magic Seeds (Ember/Scent/Pegasus/Gale/Mystery); the Slingshot + Hyper Slingshot; Power Bracelet, Roc's Feather + Roc's Cape, Magnetic Gloves, Magical Boomerang, Bombs, Shovel; the Flute and the three animal companions (Ricky/Dimitri/Moosh); Gasha Seeds; the magic Rings + Vasu's Ring Box; Bombchus/Magic Potion/Bottles if present.

Each item: { id (kebab-case), name (exact canonical), glyph (ONE of: ${GLYPHS} — use "stasis" for the Rod), from (where/how — which dungeon/Subrosia/NPC), what (what it does), tip (beginner tip; optional) }. Web-check uncertain spots. Return { items }.`,
  },
  {
    key: 'bestiary', schema: BESTIARY_SCHEMA, name: 'Enemies & combat',
    author: `Author the ENEMIES & combat dataset for ${GAME} as { basics: [...], enemies: [...] }. ${CTX}

basics: 6 primer cards { title, body } for a beginner — e.g. sword slash & charged Spin Attack; using the Rod of Seasons to reshape a fight's arena; magic Seeds in combat (Ember/Scent/Pegasus/Mystery); equipping a magic Ring for a power; riding the animal companion; bottled fairy / Gasha-nut potions. 2–4 sentences each.

enemies: ~22 entries { name, tier ("common" | "mini-boss" | "boss"), tactic (1–2 sentences), drops (optional), battle (REQUIRED for every boss/mini-boss: full "how to win" — what to bring, opening, loop, weak point) }.
Include common foes (Octorok, Moblin, Like Like, Rope/snake, Beetle, Crow, Stalfos, Goriya, Pols Voice, Spiked Beetle, Zol/Gel) AND every BOSS with a full battle guide: Aquamentus (Gnarled Root), Dodongo (Snake's Remains), Mothula (Poison Moth's Lair), Gohma/Go-Gohma (Dancing Dragon), Digdogger (Unicorn's Cave), Manhandla (Ancient Ruins), Gleeok (Explorer's Crypt), the Sword & Shield Maze boss (Medusa Head / Frypolar — confirm), and Onox (and his dragon form). Web-check boss names & strategies. Return { basics, enemies }.`,
  },
  {
    key: 'greatFairies', schema: FAIRIES_SCHEMA, name: 'Fairies & helpers',
    author: `Author the FAIRIES / one-time-helper dataset for ${GAME} as { fairies: [...] }. ${CTX}

List the real Fairy Fountains (that heal Link) AND the key one-time stat/upgrade helpers: the Subrosian smithy (which hardens the Wooden Sword and tempers the Shield), the Subrosian who upgrades your weapons, and any Great Fairy or fountain that restores you. Each: { name, region, location (how to reach), cost (what it GRANTS — a heal, or a sword/shield upgrade) }. Do NOT invent — only real ones. If the game has few true 'fairies', include the real fountains plus the smithy upgrades so the list is useful. Web-check. Return { fairies }.`,
  },
  {
    key: 'sideQuests', schema: QUESTS_SCHEMA, name: 'Side quests',
    author: `Author the SIDE QUESTS dataset for ${GAME} as { regions: [ { region, quests:[...] } ] }. ${CTX}

Group ~16–24 optional pursuits into 3–5 themed groups (e.g. "Rings & Vasu", "Subrosia", "Animal Companions", "Heart Pieces", "Trades & Secrets"). Each quest: { name, giver (optional), location, reward, oneLine (one sentence), how (spoiler-gated step-by-step, 2–6 sentences) }.
Cover: the Magic Ring hunt + Vasu's appraisals + Maple the witch encounters; the Subrosia trading sequence (the Star-Shaped Ore / the smithy upgrades / the dance); choosing & feeding your animal companion (Ricky/Dimitri/Moosh) and what each enables; notable Pieces of Heart; the Gasha Seed nut-growing; the Holodrum trading game; the linked-game secrets/passwords (Oracle of Ages) and the true final boss. Web-check the trickier chains. Return { regions }.`,
  },
];

function verifyPrompt(d, draft) {
  return `You are an ADVERSARIAL fact-checker for ${GAME}. Below is a DRAFT "${d.name}" dataset. Find and FIX every factual error, fill obvious gaps, and return the corrected dataset in the SAME schema.

Use WebSearch and WebFetch (load via ToolSearch query "WebSearch WebFetch" if needed) to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky). Check exact names, dungeon/Subrosia locations, season requirements, boss strategies, ring/companion details. Honesty law: drop or soften anything you cannot confirm. Keep it beginner-first and tight. Return ONLY the corrected dataset.

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
log(`OoS depth: ${Object.keys(result).length}/${DATASETS.length} datasets — items ${(result.itemsSongs?.items || []).length}, enemies ${(result.bestiary?.enemies || []).length}, fairies ${(result.greatFairies?.fairies || []).length}, quest-groups ${(result.sideQuests?.regions || []).length}`);
return result;
