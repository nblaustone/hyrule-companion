export const meta = {
  name: 'oos-walkthrough',
  description: 'Author + adversarially verify the full Oracle of Seasons main quest (9 chapters)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter — beginner-first steps + Stuck hints' },
    { title: 'Verify', detail: 'adversarial web cross-check per chapter (items/bosses/seasons)' },
  ],
};

const ITEM_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'cat', 'note'] };
const STEP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, k: { type: 'string', enum: ['step', 'loot', 'optional', 'reward', 'tip', 'warn'] }, t: { type: 'string' }, stuck: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } }, required: ['id', 'k', 't'] };
const SECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, reward: { type: ['string', 'null'] }, steps: { type: 'array', items: STEP_SCHEMA } }, required: ['id', 'name', 'steps'] };
const CHAPTER_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, kind: { type: 'string' }, tagline: { type: 'string' }, champion: { type: ['string', 'null'] }, sections: { type: 'array', items: SECTION_SCHEMA }, changes: { type: 'string' } }, required: ['id', 'name', 'sub', 'champion', 'sections'] };

const VOICE = `You are writing ONE chapter of an offline, beginner-first walkthrough for The Legend of Zelda: Oracle of Seasons (Game Boy Color, 2001) — a Sheikah-Slate-styled companion app. A first-time player uses it with one thumb.

SETTING & SYSTEMS:
- Set in HOLODRUM. Onox kidnapped Din the Oracle of Seasons; Link gathers the 8 ESSENCES OF NATURE from 8 dungeons to wake the Maku Seed and storm Onox's Castle.
- ROD OF SEASONS: stand on a tree stump and swing it to change the season — Spring (flowers/vines bloom), Summer (water dries, vine ladders grow), Autumn (mushrooms rise, leaves fall), Winter (water freezes, snow piles into ramps). The SAME screen is four puzzles; when blocked, try every season at the nearest stump.
- Magic SEEDS (Ember/Scent/Pegasus/Gale/Mystery) power the Slingshot and tools. SUBROSIA (the under-realm via portals) holds the smithy and trades. The magic-RING system (Vasu appraises) gives equippable powers.

HOUSE STYLE (match it exactly):
- Beginner-first, spoiler-aware. Explain WHAT to do and WHERE (which area, which season).
- Chapter = { id, name, sub, kind:"region", tagline, champion, sections:[] }.
- Section = { id, name, sub, reward(optional), steps:[] }.
- Step = { id, k, t, stuck(optional), items(optional) }.
  - k: "step" | "loot" | "optional" | "reward" are CHECKABLE; "tip" | "warn" are info-only. Use "reward" for the step that hands over the Essence.
  - t: one tight, concrete, directional instruction (1–3 sentences).
  - stuck (optional): the precise hidden hint (which season to set, the boss trick, where).
  - items (optional): things OBTAINED here → [{ name, cat, note }]. cat ∈ sword | shield | item | key | material. EXACT canonical names.
- IDs: every section id and step id MUST start with the chapter prefix + "_", short lowercase snake_case, unique within the chapter.
- 2–4 sections, ~9–16 steps. Honest over padded. No invented facts; omit anything genuinely uncertain.

Return ONLY the chapter object via the structured-output tool.`;

const CH = [
  { prefix: 'oos_gnarled', id: 'oos_gnarled', name: 'Gnarled Root Dungeon', sub: 'Essence: Fertile Soil', tagline: 'The first dungeon, and a satchel of magic seeds.', champion: 'Fertile Soil', dungeonItem: 'Seed Satchel (cat item)', boss: 'Aquamentus' },
  { prefix: 'oos_snake', id: 'oos_snake', name: "Snake's Remains", sub: 'Essence: Gift of Time', tagline: 'Lift what blocked you, in the second dungeon.', champion: 'Gift of Time', dungeonItem: 'Power Bracelet (cat item)', boss: 'Dodongo' },
  { prefix: 'oos_moth', id: 'oos_moth', name: "Poison Moth's Lair", sub: 'Essence: Bright Sun', tagline: 'A feather to leap with, in Spool Swamp.', champion: 'Bright Sun', dungeonItem: "Roc's Feather (cat item)", boss: 'Mothula' },
  { prefix: 'oos_dragon', id: 'oos_dragon', name: 'Dancing Dragon Dungeon', sub: 'Essence: Soothing Rain', tagline: 'A slingshot to fire your seeds across the room.', champion: 'Soothing Rain', dungeonItem: 'Slingshot (cat item)', boss: 'Gohma (Go-Gohma)' },
  { prefix: 'oos_unicorn', id: 'oos_unicorn', name: "Unicorn's Cave", sub: 'Essence: Nurturing Warmth', tagline: 'Magnetic gloves pull you across the abyss.', champion: 'Nurturing Warmth', dungeonItem: 'Magnetic Gloves (cat item)', boss: 'Digdogger' },
  { prefix: 'oos_ruins', id: 'oos_ruins', name: 'Ancient Ruins', sub: 'Essence: Blowing Wind', tagline: 'A boomerang you can steer, among the old stones.', champion: 'Blowing Wind', dungeonItem: 'Magical Boomerang (cat item)', boss: 'Manhandla' },
  { prefix: 'oos_crypt', id: 'oos_crypt', name: "Explorer's Crypt", sub: 'Essence: Seed of Life', tagline: 'A cape that lets you fly, deep in the graveyard.', champion: 'Seed of Life', dungeonItem: "Roc's Cape (cat item)", boss: 'Gleeok' },
  { prefix: 'oos_maze', id: 'oos_maze', name: 'Sword & Shield Maze', sub: 'Essence: Changing Seasons', tagline: 'The last dungeon, and the eighth Essence.', champion: 'Changing Seasons', dungeonItem: 'Hyper Slingshot (cat item)', boss: 'Medusa Head / Frypolar (confirm)' },
  { prefix: 'oos_onox', id: 'oos_onox', name: "Onox's Castle", sub: 'The final battle', tagline: 'Wake the Maku Seed, climb the dark keep, free Din.', champion: null, dungeonItem: '', boss: 'Onox, General of Darkness' },
];

function authorPrompt(ch) {
  const isFinale = ch.prefix === 'oos_onox';
  return `${VOICE}

CHAPTER TO WRITE
- id: "${ch.id}"  (use this exact chapter id)
- name: "${ch.name}"
- sub: "${ch.sub}"
- kind: "region"
- tagline: "${ch.tagline}"
- champion: ${ch.champion ? `"${ch.champion}"` : 'null'}
- section/step id prefix: "${ch.prefix}_"

WHAT HAPPENS (confirm against your own knowledge; do not invent):
${isFinale
  ? `The finale. After all 8 Essences, bring them to the Maku Tree to form the Maku Seed, then storm Onox's Castle. Fight up through it (mini-bosses) to Onox, General of Darkness — research his form(s) and method (he becomes a Dark Dragon in the final phase). Free Din. id MUST be "${ch.id}", champion null.`
  : `Dungeon for the ${ch.sub}. Get there across Holodrum, changing seasons at stumps as needed and using the right seeds. Dungeon item to grant: ${ch.dungeonItem}. Boss: ${ch.boss} — research and confirm the exact name and the method (which item/season/seed, the weak point). Trophy: the Essence "${ch.champion}".`}

ITEMS OBTAINED IN THIS CHAPTER (grant each via a step's "items" array, EXACT names):
${isFinale ? '(no new permanent items)' : `${ch.dungeonItem}.`}
${ch.champion ? `\nThe Essence "${ch.champion}" MUST be granted on a k:"reward" step at the end of the dungeon (after the boss), with cat "key".` : ''}

Write the full chapter now. 2–4 sections, ~9–16 steps, Stuck hints where a beginner could stall (which season, which seed, the boss trick). Return the chapter object.`;
}

function verifyPrompt(ch, draft) {
  return `You are an ADVERSARIAL fact-checker for an Oracle of Seasons (GBC) walkthrough. Below is a DRAFT chapter. Find and FIX every factual error, then return the corrected chapter in the same schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky, StrategyWiki). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Verify specifically:
- The dungeon ITEM and its EXACT name (should be: ${ch.dungeonItem || 'none — finale'}).
- The BOSS name and the real strategy (which item/season/seed, weak point).
- The route + which SEASON to set / which seeds — fix anything wrong.
${ch.champion ? `- The Essence "${ch.champion}" is granted on a k:"reward" step (cat "key") after the boss. The Essence→dungeon mapping is FIXED (Fertile Soil=Gnarled Root, Gift of Time=Snake's Remains, Bright Sun=Poison Moth's Lair, Soothing Rain=Dancing Dragon, Nurturing Warmth=Unicorn's Cave, Blowing Wind=Ancient Ruins, Seed of Life=Explorer's Crypt, Changing Seasons=Sword & Shield Maze). Keep this chapter's Essence.` : '- This is the finale; no Essence trophy.'}

RULES:
- Keep the SAME shape and id prefix "${ch.prefix}_" on every section/step id. Keep chapter id "${ch.id}", name "${ch.name}", champion ${ch.champion ? `"${ch.champion}"` : 'null'}.
- Beginner-first and tight. Preserve good Stuck hints; correct wrong ones. Honesty law: drop/soften the unconfirmable.
- Put a one-line summary of changes in the "changes" field.

DRAFT:
${JSON.stringify(draft)}`;
}

const out = await pipeline(
  CH,
  (ch) => agent(authorPrompt(ch), { label: `author:${ch.prefix}`, phase: 'Author', schema: CHAPTER_SCHEMA }),
  (draft, ch) => draft ? agent(verifyPrompt(ch, draft), { label: `verify:${ch.prefix}`, phase: 'Verify', schema: CHAPTER_SCHEMA, agentType: 'claude' }).then((v) => v || draft) : null,
);

const chapters = out.filter(Boolean).map((c) => { const { changes, ...rest } = c; rest.kind = 'region'; return rest; });
log(`OoS walkthrough: ${chapters.length}/${CH.length} chapters verified`);
return { chapters };
