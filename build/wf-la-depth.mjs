export const meta = {
  name: 'la-depth',
  description: "Author + verify Link's Awakening depth datasets: Items · Enemies · Fairies · Side Quests",
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

const GAME = "The Legend of Zelda: Link's Awakening (Game Boy, 1993 / DX / Switch)";
const CTX = "Set on KOHOLINT ISLAND (not Hyrule — no Triforce, no Ganon). The island is the Wind Fish's dream; Link gathers the 8 Instruments of the Sirens (one per dungeon) and plays the Ballad of the Wind Fish to wake it. You can equip only TWO items at once. Beginner-first, spoiler-aware, honest (omit anything you cannot confirm). Keep it version-neutral (mention DX/Switch extras as such).";

const DATASETS = [
  {
    key: 'itemsSongs', schema: ITEMS_SCHEMA, name: 'Items & songs',
    author: `Author the complete ITEMS & SONGS reference for ${GAME} as { items: [...] }. ${CTX}

Cover the key gear and songs (~28–36 entries): Sword (and the L-2 Sword from the Seashell Mansion), Shield (and Mirror Shield), Bow, Bombs, Magic Powder, Roc's Feather, Pegasus Boots, Power Bracelet (L-1 and L-2), Shovel, Hookshot, Magic Rod, Boomerang, Ocarina, Flippers, the Pieces of Power & Guardian Acorn buffs, the dungeon keys that gate progress (Tail Key, Slime Key, Angler Key, Face Key, Bird Key), the Magnifying Lens, and the 3 ocarina SONGS (Ballad of the Wind Fish, Manbo's Mambo, Frog's Song of Soul). Optionally the 8 Instruments as a group.

Each item: { id (kebab-case), name (exact canonical), glyph (ONE of: ${GLYPHS} — use "stasis" for songs/ocarina), from (where/how you get it), what (what it does), tip (beginner tip; optional) }. Be accurate; web-check uncertain spots. Return { items }.`,
  },
  {
    key: 'bestiary', schema: BESTIARY_SCHEMA, name: 'Enemies & combat',
    author: `Author the ENEMIES & combat dataset for ${GAME} as { basics: [...], enemies: [...] }. ${CTX}

basics: 6 short primer cards { title, body } for a beginner — e.g. sword swing & charged Spin Attack; the Shield bump-block (and Like Likes eating it); Roc's Feather jumping (and Feather+Boots long-jump); the two-item-button limit & swapping; Bombs + Bow combos; the Pieces of Power / Guardian Acorn buffs that drop. 2–4 sentences each.

enemies: ~22 entries { name, tier ("common" | "mini-boss" | "boss"), tactic (1–2 sentences), drops (optional), battle (REQUIRED for every boss/mini-boss: full "how to win" — what to equip, opening, loop, weak point) }.
Include common foes (Octorok, Moblin, Zol/Gel, Keese, Pols Voice, Like Like, Stalfos, Spark, Crow/Pairo, Shy Guy/Mask-Mimic, Sea Urchin, etc.) AND every dungeon NIGHTMARE boss with a full battle guide: Moldorm (Tail Cave), Genie (Bottle Grotto), Slime Eel (Key Cavern), Angler Fish (Angler's Tunnel), Slime Eye (Catfish's Maw), Facade (Face Shrine), the Evil Eagle/Grim Creeper (Eagle's Tower), the Turtle Rock nightmare, and the final shadow Nightmares at the Wind Fish's Egg (the DethL gauntlet). Web-check boss names & strategies. Return { basics, enemies }.`,
  },
  {
    key: 'greatFairies', schema: FAIRIES_SCHEMA, name: 'Fairies & heals',
    author: `Author the FAIRIES dataset for ${GAME} as { fairies: [...] }. ${CTX}

Koholint has Fairy Fountains that fully heal Link, plus a notable healing Great Fairy. List the real fairy fountains / fairy spots and what each does: { name, region (area), location (how to reach), cost (what it GRANTS — usually a full heart refill; note any that restore more) }. Include the Fairy Fountain near Mabe/Toronbo, the ones inside or near dungeons, and any heart-piece or upgrade fairy. If the game truly has few, return only the real ones — do NOT invent fountains. Web-check. Return { fairies }.`,
  },
  {
    key: 'sideQuests', schema: QUESTS_SCHEMA, name: 'Side quests',
    author: `Author the SIDE QUESTS dataset for ${GAME} as { regions: [ { region, quests:[...] } ] }. ${CTX}

Group ~16–24 optional pursuits into 3–5 themed groups (e.g. "The Trading Quest", "Secret Seashells & the Sword", "Minigames", "Collectibles & Heart Pieces", "DX / Switch extras"). Each quest: { name, giver (optional), location, reward, oneLine (one sentence), how (spoiler-gated step-by-step, 2–6 sentences) }.
Cover: the full 14-step TRADING QUEST (Yoshi Doll → … → Magnifying Lens) — you may list it as one quest with the chain in "how", or split key swaps; the Secret Seashells and the Seashell Mansion sword upgrade; the minigames (Trendy Game crane, Fishing Pond, River Rapids/Raft ride, the Rooster/photo if DX); rescuing BowWow; Marin's date / the songs; the Color Dungeon (DX) and the Photographer (DX) as DX-flagged extras. Web-check the trading chain order. Return { regions }.`,
  },
];

function verifyPrompt(d, draft) {
  return `You are an ADVERSARIAL fact-checker for ${GAME}. Below is a DRAFT "${d.name}" dataset. Find and FIX every factual error, fill obvious gaps, and return the corrected dataset in the SAME schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, IGN, gamepressure). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Check exact names, item effects, boss strategies, the trading-quest order, and seashell counts/rewards. Honesty law: drop or soften anything you cannot confirm. Keep it beginner-first and tight. Return ONLY the corrected dataset.

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
log(`LA depth: ${Object.keys(result).length}/${DATASETS.length} datasets — items ${(result.itemsSongs?.items || []).length}, enemies ${(result.bestiary?.enemies || []).length}, fairies ${(result.greatFairies?.fairies || []).length}, quest-groups ${(result.sideQuests?.regions || []).length}`);
return result;
