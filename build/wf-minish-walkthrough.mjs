export const meta = {
  name: 'minish-walkthrough',
  description: 'Author + adversarially verify the full The Minish Cap main quest (6 chapters)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter — beginner-first steps + Stuck hints' },
    { title: 'Verify', detail: 'adversarial web cross-check per chapter (items/bosses/order)' },
  ],
};

const ITEM_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'cat', 'note'] };
const STEP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, k: { type: 'string', enum: ['step', 'loot', 'optional', 'reward', 'tip', 'warn'] }, t: { type: 'string' }, stuck: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } }, required: ['id', 'k', 't'] };
const SECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, reward: { type: ['string', 'null'] }, steps: { type: 'array', items: STEP_SCHEMA } }, required: ['id', 'name', 'steps'] };
const CHAPTER_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, kind: { type: 'string' }, tagline: { type: 'string' }, champion: { type: ['string', 'null'] }, sections: { type: 'array', items: SECTION_SCHEMA }, changes: { type: 'string' } }, required: ['id', 'name', 'sub', 'champion', 'sections'] };

const VOICE = `You are writing ONE chapter of an offline, beginner-first walkthrough for The Legend of Zelda: The Minish Cap (Game Boy Advance, 2004) — a Sheikah-Slate-styled companion app. A first-time player uses it with one thumb.

SETTING & MECHANICS:
- Hyrule. The sorcerer Vaati shattered the Picori Blade and petrified Princess Zelda; Link reforges the blade into the Four Sword by gathering the FOUR ELEMENTS (Earth, Fire, Water, Wind), upgrading the sword at the Elemental Sanctuary along the way.
- SHRINKING: with Ezlo (a talking cap) on his head, Link steps onto Minish Portals (glowing stumps, jars, holes) to shrink to tiny Picori size — where puddles are lakes and a table is a tower. Many puzzles need you to shrink, cross, and return to normal size; tiny Minish folk give help.
- KINSTONE FUSION: Link carries Kinstone halves and fuses them with townsfolk/creatures (a green beam links them) to trigger events across Hyrule — chests, bridges, Heart Pieces. Mention it where a fusion opens the way.

HOUSE STYLE (match it exactly):
- Beginner-first, spoiler-aware. Explain WHAT to do and WHERE.
- Chapter = { id, name, sub, kind:"region", tagline, champion, sections:[] }.
- Section = { id, name, sub, reward(optional), steps:[] }.
- Step = { id, k, t, stuck(optional), items(optional) }.
  - k: "step" | "loot" | "optional" | "reward" are CHECKABLE; "tip" | "warn" are info-only. Use "reward" for the step that hands over the chapter trophy (an Element).
  - t: one tight, concrete, directional instruction (1–3 sentences).
  - stuck (optional): the precise hidden "Stuck? tap for the exact how" hint (a shrink spot, a fusion, the boss trick).
  - items (optional): things OBTAINED here → [{ name, cat, note }]. cat ∈ sword | shield | bow | item | key | material. EXACT canonical names.
- IDs: every section id and step id MUST start with the chapter prefix + "_", short lowercase snake_case, unique within the chapter.
- 2–4 sections, ~9–16 steps. Honest over padded. No invented facts; omit anything genuinely uncertain.

Return ONLY the chapter object via the structured-output tool.`;

const CH = [
  { prefix: 'minish_deepwood', id: 'minish_deepwood', name: 'Deepwood Shrine', sub: 'Earth Element', tagline: 'Tiny inside a giant barrel, with a jar that swallows the wind.', champion: 'Earth Element',
    grants: 'Gust Jar (cat item) — the Deepwood Shrine dungeon item; sucks in air to pull objects, vacuum dust, and reel yourself along. · Earth Element (cat key) — the boss trophy.',
    context: "First dungeon, deep in the Minish Woods. Shrunk down with Ezlo, enter the Deepwood Shrine (a giant barrel-house). Dungeon item: the Gust Jar (vacuum). Mini-boss: the Madderpillar; Boss: research and name it (the Big Green ChuChu) and the method (Gust Jar to pull its insides / sword). Trophy: the Earth Element. Afterward the blade is reforged toward the Four Sword at the Elemental Sanctuary." },
  { prefix: 'minish_crenel', id: 'minish_crenel', name: 'Mount Crenel & the Cave of Flames', sub: 'Fire Element', tagline: 'Climb the crag, flip the world with a cane.', champion: 'Fire Element',
    grants: 'Grip Ring (cat item) — found on the way up Mount Crenel (let Link cling to climbing walls). · Cane of Pacci (cat item) — the Cave of Flames dungeon item; flips objects/enemies and launches Link out of holes. · Fire Element (cat key) — the boss trophy.',
    context: "Climb Mount Crenel (you need the Grip Ring to grab climbing walls, and Crenel mushrooms/Minish help). Enter the Cave of Flames inside the mountain. Dungeon item: the Cane of Pacci. Mind the minecart and lava rooms. Boss: Gleerok — research the method (Cane of Pacci to flip it / expose the weak point, then sword and Bow). Trophy: the Fire Element." },
  { prefix: 'minish_fortress', id: 'minish_fortress', name: 'Castor Wilds & the Fortress of Winds', sub: 'The way to the wind', tagline: 'Cross the swamp, dig with mole paws, topple a stone idol.', champion: null,
    grants: 'Mole Mitts (cat item) — the Fortress of Winds dungeon item; dig through soft dirt walls and floors. · Flippers (cat item) — earned around here (swim the Castor Wilds / Lake Hylia).',
    context: "Cross the Castor Wilds swamp (use the Wind Ruins / monument puzzles and Kinstone fusions to open the way) to reach the Fortress of Winds. Dungeon item: the Mole Mitts (dig). Boss: Mazaal — research the method (a giant stone idol; Mole Mitts to dig out its arms/hands, then strike the eye). This dungeon gives NO Element — it opens the path toward the Cloud Tops and the Wind Tribe. Get the Flippers around here if you don't have them." },
  { prefix: 'minish_droplets', id: 'minish_droplets', name: 'The Temple of Droplets', sub: 'Water Element', tagline: 'A frozen temple under the lake, thawed with a lantern.', champion: 'Water Element',
    grants: 'Flame Lantern (cat item) — the Temple of Droplets dungeon item; lights dark rooms and melts ice. · Water Element (cat key) — the boss trophy.',
    context: "Beneath Lake Hylia (you need the Flippers; shrink to enter the frozen temple). Dungeon item: the Flame Lantern (melt the ice that fills the place). Boss: Big Octorok (Big Octo) — research the method (Gust Jar to reflect its breath / strip the ice, Flame Lantern, then sword the tail/back). Trophy: the Water Element." },
  { prefix: 'minish_palace', id: 'minish_palace', name: 'The Cloud Tops & Palace of Winds', sub: 'Wind Element', tagline: 'Up a beanstalk to the sky, and a cape that lets you fly.', champion: 'Wind Element',
    grants: "Roc's Cape (cat item) — the Palace of Winds dungeon item; lets Link jump and glide over gaps and enemies. · Wind Element (cat key) — the boss trophy (completing the Four Sword).",
    context: "Reach the Cloud Tops in the sky (via the Wind Tribe / a beanstalk grown by Kinstone fusion, and the Tower of Winds). Enter the Palace of Winds. Dungeon item: Roc's Cape (jump + glide). Boss: the Gyorg Pair (twin sky serpents/manta) — research the method (Roc's Cape to dodge in the air, Bow/Boomerang and sword). Trophy: the Wind Element — with all four, the Four Sword is forged." },
  { prefix: 'minish_vaati', id: 'minish_vaati', name: 'Dark Hyrule Castle', sub: 'The final battle', tagline: 'Four Links, one sorcerer, and the curse broken.', champion: null,
    grants: '',
    context: "Vaati has turned Hyrule Castle into Dark Hyrule Castle. Fight up through it — the Four Sword lets Link split into copies (stand on the tiles, hold the sword) to solve four-way block and switch puzzles and to fight together, and you'll need all four Elements' powers. Boss: Vaati — research his multiple forms (Vaati Reborn, Vaati Transfigured / the giant eye, and the final form) and the method (Four-Link clone attacks, the Cane of Pacci/Gust Jar, hitting the eyes). Free Princess Zelda and restore the Picori Blade. This is the FINAL chapter — id MUST be exactly \"minish_vaati\", champion null." },
];

function authorPrompt(ch) {
  return `${VOICE}

CHAPTER TO WRITE
- id: "${ch.id}"  (use this exact chapter id)
- name: "${ch.name}"
- sub: "${ch.sub}"
- kind: "region"
- tagline: "${ch.tagline}"
- champion: ${ch.champion ? `"${ch.champion}"` : 'null'}
- section/step id prefix: "${ch.prefix}_"

WHAT HAPPENS (factual basis — confirm against your own knowledge; do not invent):
${ch.context}

ITEMS OBTAINED IN THIS CHAPTER (grant each via a step's "items" array, EXACT names):
${ch.grants || '(no new permanent items — this is the finale)'}
${ch.champion ? `\nThe trophy "${ch.champion}" MUST be granted on a k:"reward" step at the end of the dungeon (after the boss), with cat "key".` : ''}

Write the full chapter now. 2–4 sections, ~9–16 steps, Stuck hints where a beginner could stall (a shrink spot, a Kinstone fusion, the boss trick). Return the chapter object.`;
}

function verifyPrompt(ch, draft) {
  return `You are an ADVERSARIAL fact-checker for a The Minish Cap (GBA) walkthrough. Below is a DRAFT chapter. Find and FIX every factual error, then return the corrected chapter in the same schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky, StrategyWiki). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Verify specifically:
- The dungeon ITEM(S) and their EXACT names; that this chapter grants: ${ch.grants || '(finale — no new items)'}
- The BOSS / mini-boss name and the real strategy (which item, weak point, the shrink/cane/jar trick).
- The route/prereqs (which item or Kinstone fusion opens the way) — fix anything wrong.
${ch.champion ? `- The trophy "${ch.champion}" is granted on a k:"reward" step (cat "key"). FIXED mapping: Earth=Deepwood Shrine, Fire=Cave of Flames, Water=Temple of Droplets, Wind=Palace of Winds (the Fortress of Winds gives NO Element). Keep this chapter's trophy as given.` : '- This chapter grants no Element (Fortress of Winds, or the finale).'}

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
log(`Minish walkthrough: ${chapters.length}/${CH.length} chapters verified`);
return { chapters };
