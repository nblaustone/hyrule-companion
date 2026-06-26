export const meta = {
  name: 'ooa-walkthrough',
  description: 'Author + adversarially verify the full Oracle of Ages main quest (9 chapters)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter — beginner-first steps + Stuck hints' },
    { title: 'Verify', detail: 'adversarial web cross-check per chapter (items/bosses/time travel)' },
  ],
};

const ITEM_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'cat', 'note'] };
const STEP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, k: { type: 'string', enum: ['step', 'loot', 'optional', 'reward', 'tip', 'warn'] }, t: { type: 'string' }, stuck: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } }, required: ['id', 'k', 't'] };
const SECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, reward: { type: ['string', 'null'] }, steps: { type: 'array', items: STEP_SCHEMA } }, required: ['id', 'name', 'steps'] };
const CHAPTER_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, kind: { type: 'string' }, tagline: { type: 'string' }, champion: { type: ['string', 'null'] }, sections: { type: 'array', items: SECTION_SCHEMA }, changes: { type: 'string' } }, required: ['id', 'name', 'sub', 'champion', 'sections'] };

const VOICE = `You are writing ONE chapter of an offline, beginner-first walkthrough for The Legend of Zelda: Oracle of Ages (Game Boy Color, 2001) — a Sheikah-Slate-styled companion app. A first-time player uses it with one thumb.

SETTING & SYSTEMS:
- Set in LABRYNNA. Veran the Sorceress of Shadows possessed Nayru the Oracle of Ages and warps history; Link gathers the 8 ESSENCES OF TIME from 8 dungeons to wake the Maku Seed and stop Veran.
- HARP OF AGES: play tunes to travel between the PAST and the PRESENT at time portals (Tune of Echoes opens portals; Tune of Currents / Tune of Ages warp between eras). Cause and effect across time is the core: a change in the PAST reshapes the PRESENT. When stuck, flip eras and look at the same spot.
- Magic SEEDS power the Seed Shooter (which ricochets off walls). The magic-RING system (Vasu appraises) gives equippable powers. Ages is more PUZZLE-focused than Seasons.

HOUSE STYLE (match it exactly):
- Beginner-first, spoiler-aware. Explain WHAT to do and WHERE (which area, which era).
- Chapter = { id, name, sub, kind:"region", tagline, champion, sections:[] }.
- Section = { id, name, sub, reward(optional), steps:[] }.
- Step = { id, k, t, stuck(optional), items(optional) }.
  - k: "step" | "loot" | "optional" | "reward" are CHECKABLE; "tip" | "warn" are info-only. Use "reward" for the step that hands over the Essence.
  - t: one tight, concrete, directional instruction (1–3 sentences).
  - stuck (optional): the precise hidden hint (which era to be in, the boss trick, the cross-time cause/effect).
  - items (optional): things OBTAINED here → [{ name, cat, note }]. cat ∈ sword | shield | item | key | material. EXACT canonical names.
- IDs: every section id and step id MUST start with the chapter prefix + "_", short lowercase snake_case, unique within the chapter.
- 2–4 sections, ~9–16 steps. Honest over padded. No invented facts; omit anything genuinely uncertain.

Return ONLY the chapter object via the structured-output tool.`;

const CH = [
  { prefix: 'ooa_spirit', id: 'ooa_spirit', name: "Spirit's Grave", sub: 'Essence: Eternal Spirit', tagline: 'The first dungeon, in the graveyard across time.', champion: 'Eternal Spirit', dungeonItem: 'Power Bracelet (cat item)', boss: 'Pumpkin Head (confirm)' },
  { prefix: 'ooa_wing', id: 'ooa_wing', name: 'Wing Dungeon', sub: 'Essence: Ancient Wood', tagline: 'A feather to leap with, in the western woods.', champion: 'Ancient Wood', dungeonItem: "Roc's Feather (cat item)", boss: 'Head Thwomp (confirm)' },
  { prefix: 'ooa_moonlit', id: 'ooa_moonlit', name: 'Moonlit Grotto', sub: 'Essence: Echoing Howl', tagline: 'A seed shooter that bounces off the walls.', champion: 'Echoing Howl', dungeonItem: 'Seed Shooter (cat item)', boss: 'Shadow Hag' },
  { prefix: 'ooa_skull', id: 'ooa_skull', name: 'Skull Dungeon', sub: 'Essence: Burning Flame', tagline: 'A hook that swaps your place with the world.', champion: 'Burning Flame', dungeonItem: 'Switch Hook (cat item)', boss: 'Eyesoar' },
  { prefix: 'ooa_crown', id: 'ooa_crown', name: 'Crown Dungeon', sub: 'Essence: Sacred Soil', tagline: 'A cane that builds blocks from nothing.', champion: 'Sacred Soil', dungeonItem: 'Cane of Somaria (cat item)', boss: 'Smog' },
  { prefix: 'ooa_mermaid', id: 'ooa_mermaid', name: "Mermaid's Cave", sub: 'Essence: Lonely Peak', tagline: 'A cave split across the ages, and the sea.', champion: 'Lonely Peak', dungeonItem: 'the dungeon item (confirm — Mermaid Suit and/or Bombs)', boss: 'Octogon' },
  { prefix: 'ooa_jabu', id: 'ooa_jabu', name: "Jabu-Jabu's Belly", sub: 'Essence: Rolling Sea', tagline: 'Inside the great fish, a longer hook.', champion: 'Rolling Sea', dungeonItem: 'Long Hook (cat item)', boss: 'Plasmarine' },
  { prefix: 'ooa_tomb', id: 'ooa_tomb', name: 'Ancient Tomb', sub: 'Essence: Falling Star', tagline: 'The last dungeon, and the eighth Essence.', champion: 'Falling Star', dungeonItem: 'the dungeon item (confirm — e.g. the Mirror Shield / final tools)', boss: 'the Ancient Tomb boss (confirm)' },
  { prefix: 'ooa_veran', id: 'ooa_veran', name: 'Confronting Veran', sub: 'The final battle', tagline: 'Wake the Maku Seed, free Nayru, undo the shadow.', champion: null, dungeonItem: '', boss: 'Veran, Sorceress of Shadows' },
];

function authorPrompt(ch) {
  const isFinale = ch.prefix === 'ooa_veran';
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
  ? `The finale. After all 8 Essences, bring them to the Maku Tree to form the Maku Seed, then confront Veran in her seat of power (the Black Tower / Ambi's palace). Research Veran's multiple forms and the method. Free Nayru and Labrynna. id MUST be "${ch.id}", champion null.`
  : `Dungeon for the ${ch.sub}. Get there across Labrynna, traveling between the PAST and PRESENT with the Harp as needed (note the key cross-time cause/effect to even enter). Dungeon item to grant: ${ch.dungeonItem}. Boss: ${ch.boss} — research and confirm the exact name and the method (which item/era, the weak point). Trophy: the Essence "${ch.champion}".`}

ITEMS OBTAINED IN THIS CHAPTER (grant each via a step's "items" array, EXACT names; confirm the item):
${isFinale ? '(no new permanent items)' : `${ch.dungeonItem}.`}
${ch.champion ? `\nThe Essence "${ch.champion}" MUST be granted on a k:"reward" step at the end of the dungeon (after the boss), with cat "key".` : ''}

Write the full chapter now. 2–4 sections, ~9–16 steps, Stuck hints where a beginner could stall (which era, the cross-time trick, the boss method). Return the chapter object.`;
}

function verifyPrompt(ch, draft) {
  return `You are an ADVERSARIAL fact-checker for an Oracle of Ages (GBC) walkthrough. Below is a DRAFT chapter. Find and FIX every factual error, then return the corrected chapter in the same schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky, StrategyWiki). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Verify specifically:
- The dungeon ITEM and its EXACT name (expected: ${ch.dungeonItem || 'none — finale'}) — CONFIRM it, several are easy to get wrong.
- The BOSS name and the real strategy (which item/era, weak point).
- The route + the PAST/PRESENT cross-time trick to reach/clear the dungeon — fix anything wrong.
${ch.champion ? `- The Essence "${ch.champion}" is granted on a k:"reward" step (cat "key") after the boss. The Essence→dungeon mapping is FIXED (Eternal Spirit=Spirit's Grave, Ancient Wood=Wing Dungeon, Echoing Howl=Moonlit Grotto, Burning Flame=Skull Dungeon, Sacred Soil=Crown Dungeon, Lonely Peak=Mermaid's Cave, Rolling Sea=Jabu-Jabu's Belly, Falling Star=Ancient Tomb). Keep this chapter's Essence.` : '- This is the finale; no Essence trophy.'}

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
log(`OoA walkthrough: ${chapters.length}/${CH.length} chapters verified`);
return { chapters };
