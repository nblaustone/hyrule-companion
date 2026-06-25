export const meta = {
  name: 'la-walkthrough',
  description: "Author + adversarially verify the full Link's Awakening main quest (9 chapters)",
  phases: [
    { title: 'Author', detail: 'one agent per chapter — beginner-first steps + Stuck hints' },
    { title: 'Verify', detail: 'adversarial web cross-check per chapter (items/bosses/order/directions)' },
  ],
};

const ITEM_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'cat', 'note'] };
const STEP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, k: { type: 'string', enum: ['step', 'loot', 'optional', 'reward', 'tip', 'warn'] }, t: { type: 'string' }, stuck: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } }, required: ['id', 'k', 't'] };
const SECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, reward: { type: ['string', 'null'] }, steps: { type: 'array', items: STEP_SCHEMA } }, required: ['id', 'name', 'steps'] };
const CHAPTER_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, kind: { type: 'string' }, tagline: { type: 'string' }, champion: { type: ['string', 'null'] }, sections: { type: 'array', items: SECTION_SCHEMA }, changes: { type: 'string' } }, required: ['id', 'name', 'sub', 'champion', 'sections'] };

const VOICE = `You are writing ONE chapter of an offline, beginner-first walkthrough for The Legend of Zelda: Link's Awakening (Game Boy, 1993; also the DX and Switch remake — keep it version-neutral) — a Sheikah-Slate-styled companion app. A first-time player uses it with one thumb while playing.

SETTING: Koholint Island — NOT Hyrule. There is no Triforce and no Ganon. The whole island is the dream of the sleeping Wind Fish; Link must gather the 8 Instruments of the Sirens (one per dungeon) and play the Ballad of the Wind Fish to wake it and go home. It is bittersweet.

HOUSE STYLE (match it exactly):
- Beginner-first, spoiler-aware. Explain WHAT to do and WHERE.
- Chapter = { id, name, sub, kind:"region", tagline, champion, sections:[] }.
- Section = { id, name, sub, reward(optional), steps:[] }.
- Step = { id, k, t, stuck(optional), items(optional) }.
  - k: "step" | "loot" | "optional" | "reward" are CHECKABLE; "tip" | "warn" are info-only. Use "reward" for the step that hands over the dungeon Instrument.
  - t: one tight, concrete, directional instruction (1–3 sentences).
  - stuck (optional): the precise hidden "Stuck? tap for the exact how" hint for tricky spots (item placement, the boss trick, a key location).
  - items (optional): things OBTAINED here → [{ name, cat, note }]. cat ∈ sword | shield | bow | song | item | key | material. EXACT canonical names.
- IDs: every section id and step id MUST start with the chapter prefix + "_", short lowercase snake_case, unique within the chapter.
- Remember the two-button limit (you equip only two items at once) when giving instructions.
- 2–4 sections, ~8–16 steps. Honest over padded. No invented facts; omit anything genuinely uncertain.

Return ONLY the chapter object via the structured-output tool.`;

const CH = [
  { prefix: 'la_tail', id: 'la_tail', name: 'Tail Cave', sub: 'Dungeon 1 — the Full Moon Cello', tagline: 'The first Instrument, and a feather to leap with.', champion: 'Full Moon Cello',
    grants: "Roc's Feather (cat item) — the Tail Cave dungeon item; press to JUMP over pits and spikes. · Ocarina (cat song) — OPTIONAL pickup: found in the Dream Shrine in Mabe Village once you have Roc's Feather (jump onto the bed and sleep). · Full Moon Cello (cat key) — the boss trophy Instrument.",
    context: 'Use the Tail Key (from the Mysterious Forest) to open Tail Cave at the foot of the eastern hills. Dungeon item: Roc\'s Feather (jump). Find the small keys and the Nightmare Key; light torches; push blocks. Boss: Moldorm — a wriggling worm on a ledge floor with a weak tail-tip; hit the tail and don\'t get bumped off the edge. Reward: the Full Moon Cello. After the dungeon you can grab the Ocarina from the Dream Shrine.' },
  { prefix: 'la_bottle', id: 'la_bottle', name: 'Bottle Grotto', sub: 'Dungeon 2 — the Conch Horn', tagline: 'Rescue BowWow, cross the swamp, lift with new strength.', champion: 'Conch Horn',
    grants: 'Power Bracelet (cat item) — the Bottle Grotto dungeon item; lets you lift pots, rocks, and skulls. · Conch Horn (cat key) — the boss trophy Instrument.',
    context: "Before the dungeon: BowWow (the chain-chomp) is stolen by Moblins — rescue it from the Moblin Cave north of the village, then borrow BowWow to chomp through the Goponga Flowers blocking Goponga Swamp, where Bottle Grotto sits. Dungeon item: the Power Bracelet. Boss: the Genie — he hides in his bottle; hit him out, then lift the bottle and throw it against the wall while dodging his fireballs. Reward: the Conch Horn." },
  { prefix: 'la_key', id: 'la_key', name: 'Key Cavern', sub: 'Dungeon 3 — the Sea Lily\'s Bell', tagline: 'Golden leaves for a slimy key, and boots to charge with.', champion: "Sea Lily's Bell",
    grants: "Pegasus Boots (cat item) — the Key Cavern dungeon item; hold to DASH (and long-jump with Roc\'s Feather). · Sea Lily\'s Bell (cat key) — the boss trophy Instrument.",
    context: 'Before the dungeon: gather the five Golden Leaves at Kanalet Castle and give them to the gatekeeper Richard to receive the Slime Key, which opens Key Cavern in Ukuku Prairie. Dungeon item: the Pegasus Boots. Boss: the Slime Eel — it lunges its head out of holes; grab/pull the head out with the Hookshot... (NOTE: if Hookshot not yet owned, the intended method is the Power Bracelet to grab the eel\'s body and pull, then sword it). Reward: the Sea Lily\'s Bell.' },
  { prefix: 'la_angler', id: 'la_angler', name: "Angler's Tunnel", sub: 'Dungeon 4 — the Surf Harp', tagline: 'Drop a key down the falls, then learn to swim.', champion: 'Surf Harp',
    grants: 'Flippers (cat item) — the Angler\'s Tunnel dungeon item; lets you SWIM and dive. · Surf Harp (cat key) — the boss trophy Instrument.',
    context: 'Before the dungeon: get the Angler Key and drop it into the waterfall on Tal Tal Heights to open Angler\'s Tunnel behind the falls. Dungeon item: the Flippers. Boss: the Angler Fish — it charges from the dark water; sword its face as it passes and dodge the falling stalactites. Reward: the Surf Harp.' },
  { prefix: 'la_catfish', id: 'la_catfish', name: "Catfish's Maw", sub: 'Dungeon 5 — the Wind Marimba', tagline: 'Swim the eastern bay to a hook that pulls.', champion: 'Wind Marimba',
    grants: 'Hookshot (cat item) — the Catfish\'s Maw dungeon item; fires a chain to cross pits and stun/pull enemies. · Wind Marimba (cat key) — the boss trophy Instrument.',
    context: 'With the Flippers, swim across Martha\'s Bay on the east coast to Catfish\'s Maw (Yarna). Dungeon item: the Hookshot. Boss: Slime Eye — a big eyeball that splits the floor; hook/bomb it to drop it, then sword the eye. Reward: the Wind Marimba. (Around here you can also pick up the Boomerang via a trade with the man on Toronbo Shores.)' },
  { prefix: 'la_face', id: 'la_face', name: 'Face Shrine', sub: 'Dungeon 6 — the Coral Triangle', tagline: 'A desert of faces, and a firmer grip.', champion: 'Coral Triangle',
    grants: 'Power Bracelet Lv-2 (cat item) — the Face Shrine dungeon item; the stronger bracelet that lifts the heaviest stones. · Coral Triangle (cat key) — the boss trophy Instrument.',
    context: 'Reach the Face Shrine in the eastern desert/Ukuku area (you need the Face Key / to have crossed the prairie). Push the face statues correctly; watch for tile traps. Dungeon item: the Level-2 Power Bracelet. Boss: Facade — a face in the floor that opens pits and flings pots; bomb it when it surfaces. Reward: the Coral Triangle.' },
  { prefix: 'la_eagle', id: 'la_eagle', name: "Eagle's Tower", sub: 'Dungeon 7 — the Organ of Evening Calm', tagline: 'Topple four pillars to bring the boss down to you.', champion: 'Organ of Evening Calm',
    grants: 'Mirror Shield (cat shield) — the Eagle\'s Tower dungeon item; deflects beams and blasts the basic shield cannot. · Organ of Evening Calm (cat key) — the boss trophy Instrument.',
    context: 'Climb Eagle\'s Tower high on the Tal Tal Mountains. The core puzzle: carry/throw the big Iron Ball to smash the FOUR support pillars, which collapses the floor so you can reach the top. Dungeon item: the Mirror Shield. Mini-boss Grim Creeper, then boss: the Evil Eagle on the roof — it swoops; sword it as it passes (the Mirror Shield blocks its wind/feathers). Reward: the Organ of Evening Calm.' },
  { prefix: 'la_turtle', id: 'la_turtle', name: 'Turtle Rock', sub: 'Dungeon 8 — the Thunder Drum', tagline: 'Wake the mountain turtle; brave fire with a rod.', champion: 'Thunder Drum',
    grants: 'Magic Rod (cat item) — the Turtle Rock dungeon item; shoots fire to burn enemies and light torches. · Thunder Drum (cat key) — the boss trophy Instrument.',
    context: 'At the peak of Tal Tal Mountains, wake the giant stone turtle by playing the Ocarina (the Frog\'s Song of Soul) at its head, then enter Turtle Rock. Dungeon item: the Magic Rod, used against the fiery enemies and the boss. Boss: the dungeon Nightmare (a fire-spitting blob/dragon) — confirm its name and method; the Magic Rod and sword finish it. Reward: the Thunder Drum, the eighth and final Instrument.' },
  { prefix: 'la_windfish', id: 'la_windfish', name: "The Wind Fish's Egg", sub: 'The finale — waking the dream', tagline: 'Eight songs at the egg, a gauntlet of nightmares, and a goodbye.', champion: null,
    grants: '',
    context: 'With all eight Instruments, climb to the Egg atop Mt. Tamaranch. Stand before it and play each Instrument (the game plays the Ballad of the Wind Fish), which cracks the Egg open. Inside is a maze and then the Nightmares — a gauntlet of shifting shadow bosses (echoes of past foes) that ends with the final Nightmare. Beat each form using the right tool (sword, Magic Rod, the Boomerang, Bombs). Then the Wind Fish wakes, the dream ends, and Link drifts at sea — clutching the memory of Koholint and Marin. This is the FINAL chapter — id MUST be exactly "la_windfish". champion is null. Be gentle and spoiler-aware about the ending; do not over-explain the twist, just guide the fight and the final song.' },
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
${ch.champion ? `\nThe Instrument "${ch.champion}" MUST be granted on a k:"reward" step at the end of the dungeon (after the boss), with cat "key".` : ''}

Write the full chapter now. 2–4 sections, ~8–16 steps, Stuck hints where a beginner could stall. Return the chapter object.`;
}

function verifyPrompt(ch, draft) {
  return `You are an ADVERSARIAL fact-checker for a Link's Awakening walkthrough. Below is a DRAFT chapter. Find and FIX every factual error, then return the corrected chapter in the same schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, IGN, gamepressure). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Verify specifically:
- The dungeon ITEM and its EXACT name; that this chapter grants what it should: ${ch.grants || '(finale — no new items)'}
- The BOSS / Nightmare name and the real strategy (tool + weak point + dodge).
- The pre-dungeon steps (the KEY needed to enter, where it comes from) and route directions — fix anything wrong or backwards.
${ch.champion ? `- The Instrument "${ch.champion}" is granted on a k:"reward" step (cat "key") after the boss.` : '- This is the finale (id "la_windfish"); champion null. Keep the ending gentle and not over-spoiled.'}

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
  (draft, ch) => draft ? agent(verifyPrompt(ch, draft), { label: `verify:${ch.prefix}`, phase: 'Verify', schema: CHAPTER_SCHEMA, agentType: 'claude' }) : null,
);

const chapters = out.filter(Boolean).map((c) => { const { changes, ...rest } = c; rest.kind = 'region'; return rest; });
log(`LA walkthrough: ${chapters.length}/${CH.length} chapters verified`);
return { chapters };
