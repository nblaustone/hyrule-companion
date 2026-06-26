export const meta = {
  name: 'albw-walkthrough',
  description: 'Author + adversarially verify the full A Link Between Worlds main quest (12 chapters)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter — beginner-first steps + Stuck hints' },
    { title: 'Verify', detail: 'adversarial web cross-check per chapter (items/bosses/order/directions)' },
  ],
};

const ITEM_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'cat', 'note'] };
const STEP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, k: { type: 'string', enum: ['step', 'loot', 'optional', 'reward', 'tip', 'warn'] }, t: { type: 'string' }, stuck: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } }, required: ['id', 'k', 't'] };
const SECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, reward: { type: ['string', 'null'] }, steps: { type: 'array', items: STEP_SCHEMA } }, required: ['id', 'name', 'steps'] };
const CHAPTER_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, kind: { type: 'string' }, tagline: { type: 'string' }, champion: { type: ['string', 'null'] }, sections: { type: 'array', items: SECTION_SCHEMA }, changes: { type: 'string' } }, required: ['id', 'name', 'sub', 'champion', 'sections'] };

const VOICE = `You are writing ONE chapter of an offline, beginner-first walkthrough for The Legend of Zelda: A Link Between Worlds (Nintendo 3DS, 2013) — a Sheikah-Slate-styled companion app. A first-time player uses it with one thumb.

SETTING & MECHANICS (keep them front of mind):
- It's a sequel to A Link to the Past on the SAME Hyrule map, plus its dark twin LORULE (crossed via purple wall fissures / warp paintings). Lorule is the same geography, twisted.
- WALL MERGE: Ravio's Bracelet lets Link press flat into a wall as a moving painting to slip through grates, around corners, and onto far ledges. MANY puzzles are "merge along this wall." Mention it where relevant.
- RENTAL ITEMS: you don't find tools in dungeon chests — you RENT (or buy) them from Ravio's Shop up front (Bow, Bombs, Hammer, Hookshot, Tornado Rod, Fire/Ice/Sand Rod, Lamp…). So a dungeon's "item" is the item you should RENT before entering. Items use a shared green ENERGY meter, not consumable ammo.

HOUSE STYLE (match it exactly):
- Beginner-first, spoiler-aware. Explain WHAT to do and WHERE.
- Chapter = { id, name, sub, kind:"region", tagline, champion, sections:[] }.
- Section = { id, name, sub, reward(optional), steps:[] }.
- Step = { id, k, t, stuck(optional), items(optional) }.
  - k: "step" | "loot" | "optional" | "reward" are CHECKABLE; "tip" | "warn" are info-only. Use "reward" for the step that hands over the dungeon trophy (a Pendant or a Sage).
  - t: one tight, concrete, directional instruction (1–3 sentences).
  - stuck (optional): the precise hidden "Stuck? tap for the exact how" hint for tricky spots (a merge route, a boss trick, which item to rent).
  - items (optional): things OBTAINED here → [{ name, cat, note }]. cat ∈ sword | shield | armor | bow | item | key | material. EXACT canonical names. (Rented items count — grant them where the player rents/first needs them.)
- IDs: every section id and step id MUST start with the chapter prefix + "_", short lowercase snake_case, unique within the chapter.
- 2–4 sections, ~8–16 steps. Honest over padded. No invented facts; omit anything genuinely uncertain.

Return ONLY the chapter object via the structured-output tool.`;

const CH = [
  { prefix: 'albw_ep', id: 'albw_ep', name: 'The Eastern Palace', sub: 'Pendant of Courage', tagline: 'Rent a Bow, merge the walls, take the first Pendant.', champion: 'Pendant of Courage',
    grants: "Bow (cat bow) — RENTED from Ravio's Shop; the item this dungeon needs (eye-switches, the boss). · Pendant of Courage (cat key) — the boss trophy.",
    context: 'First Hyrule dungeon, far east of Hyrule Field (Sahasrahla guides you). Rent the Bow from Ravio first. Inside: wall-merge to cross grates, shoot eye-switches, light the way. Research and name the boss and its trick. Trophy: the Pendant of Courage.' },
  { prefix: 'albw_gales', id: 'albw_gales', name: 'The House of Gales', sub: 'Pendant of Wisdom', tagline: 'A rod that blows you skyward, on a temple out in the lake.', champion: 'Pendant of Wisdom',
    grants: 'Tornado Rod (cat item) — RENTED from Ravio; whips up a gust that flings Link upward and flips enemies. · Pendant of Wisdom (cat key) — the boss trophy.',
    context: 'Out on the lake in eastern Hyrule (reach it across the water/with the right approach). Rent the Tornado Rod — the dungeon is built around its updrafts and timed switches. Boss: Margomill (a floating stack of eye-discs) — research the exact method (Tornado Rod to topple it, then strike the eye). Trophy: Pendant of Wisdom.' },
  { prefix: 'albw_hera', id: 'albw_hera', name: 'The Tower of Hera', sub: 'Pendant of Power', tagline: 'Pound the pegs up Death Mountain for the third Pendant.', champion: 'Pendant of Power',
    grants: 'Hammer (cat item) — RENTED from Ravio; pounds in pegs/switches and smashes things. · Pendant of Power (cat key) — the boss trophy.',
    context: 'Atop Death Mountain (climb from the north). Rent the Hammer — the tower is full of Hammer-peg puzzles and vertical merge climbs. Boss: Moldorm — strike the glowing tail-tip on a ledge floor with open edges; don\'t get knocked off. Trophy: Pendant of Power (the third and last Pendant).' },
  { prefix: 'albw_ms', id: 'albw_ms', name: 'The Master Sword & Yuga', sub: 'Into Lorule', tagline: 'Three pendants draw the blade — and Yuga drags you through the wall.', champion: null,
    grants: 'Master Sword (cat sword) — drawn from the Lost Woods pedestal with all three Pendants.',
    context: 'With all three Pendants, go to the Lost Woods pedestal and draw the Master Sword. Then Yuga storms Hyrule Castle: fight up through it, confront Yuga (he seals Princess Zelda into a painting and merges with Ganon), and chase him through a fissure into LORULE, where you meet Princess Hilda. No dungeon trophy. Be spoiler-careful but clear about the chase and that Lorule is now open.' },
  { prefix: 'albw_dark', id: 'albw_dark', name: 'The Dark Palace', sub: 'Sage Gulley', tagline: "Lorule's first dungeon — pitch black, and a painted Sage to free.", champion: 'Sage Gulley',
    grants: 'Lamp (cat item) — RENTED from Ravio; lights the pitch-dark rooms (and you may want Bombs too). · Sage Gulley (cat key) — the freed Sage (the trophy).',
    context: 'In the Dark Ruins of Lorule (cross via a fissure). The dungeon is pitch black — rent the Lamp to light the wall torches. Boss: Gemesaur King — research the method (Lamp to relight the room, Bombs in its mouth). Free the painted Sage Gulley. Trophy: Sage Gulley.' },
  { prefix: 'albw_swamp', id: 'albw_swamp', name: 'The Swamp Palace', sub: 'Sage Oren', tagline: 'Flood the right rooms, hook across, free the Zora Sage.', champion: 'Sage Oren',
    grants: 'Hookshot (cat item) — RENTED from Ravio; pulls you across gaps and stuns enemies. · Sage Oren (cat key) — the freed Sage.',
    context: 'A water dungeon in Lorule (its entrance involves flooding/draining and a Lorule↔Hyrule water trick). Rent the Hookshot. Boss: Arrghus — research the method (pull off its floating spikes with the Hookshot, then sword the eye). Free Sage Oren (the Zora queen). Trophy: Sage Oren.' },
  { prefix: 'albw_skull', id: 'albw_skull', name: 'Skull Woods', sub: 'Sage Seres', tagline: "Lorule's dark forest, lit by a borrowed Fire Rod.", champion: 'Sage Seres',
    grants: 'Fire Rod (cat item) — RENTED from Ravio; bursts of flame to burn enemies and light things. · Sage Seres (cat key) — the freed Sage.',
    context: 'The dark forest of Lorule (mirror of the Lost Woods). Rent the Fire Rod. Wall-merge between the surface skull entrances. Boss: Knucklemaster (a giant gauntlet) — research the method. Free Sage Seres. Trophy: Sage Seres.' },
  { prefix: 'albw_thieves', id: 'albw_thieves', name: "Thieves' Hideout", sub: 'Sage Osfala', tagline: 'Break a fellow prisoner out — and a Sage with her.', champion: 'Sage Osfala',
    grants: 'Sage Osfala (cat key) — the freed Sage (this dungeon is an escort, not an item dungeon).',
    context: "Inside the Thieves' Town hideout of Lorule. You team up with the Thief Girl: escort her out, using her to weigh switches and reach places (and Bombs to open the way). Boss: Stalblind — research the method (knock off its mask, strike when stunned). Free Sage Osfala. Trophy: Sage Osfala." },
  { prefix: 'albw_ice', id: 'albw_ice', name: 'The Ice Ruins', sub: 'Sage Rosso', tagline: 'A frozen Lorule tower, thawed with the Fire Rod.', champion: 'Sage Rosso',
    grants: 'Fire Rod (cat item) — RENTED from Ravio (melt ice / fight the boss). · Sage Rosso (cat key) — the freed Sage.',
    context: "Atop Lorule's Death Mountain. Rent the Fire Rod to melt ice blocks and slick floors; lots of vertical merge climbs. Boss: Dharkstare — research the method (Fire Rod to thaw/ damage it). Free Sage Rosso. Trophy: Sage Rosso." },
  { prefix: 'albw_desert', id: 'albw_desert', name: 'The Desert Palace', sub: 'Sage Irene', tagline: 'Raise sand pillars to climb a buried palace.', champion: 'Sage Irene',
    grants: 'Sand Rod (cat item) — RENTED from Ravio; raises pillars of sand you can ride and stand on. · Sage Irene (cat key) — the freed Sage.',
    context: 'In the Lorule desert (its entrance involves the Sand Rod / a Hyrule-side approach). Rent the Sand Rod — the whole dungeon is built around raising sand pillars to climb and cross. Boss: Zaganaga — research the method (Sand Rod pillars to reach it, Bow to shoot it). Free Sage Irene. Trophy: Sage Irene.' },
  { prefix: 'albw_turtle', id: 'albw_turtle', name: 'Turtle Rock', sub: 'Sage Impa', tagline: 'Three turtles, a lava maze, and the seventh Sage.', champion: 'Sage Impa',
    grants: 'Ice Rod (cat item) — RENTED from Ravio (freeze lava/enemies into platforms). · Sage Impa (cat key) — the freed Sage (the seventh).',
    context: 'A lava dungeon in Lorule (reached by first finding three wandering turtles in Hyrule, then crossing over). Rent the Ice Rod to freeze lava into footing and stun foes. Boss: Grinexx — research the method. Free Sage Impa — the seventh and final Sage, which opens Lorule Castle. Trophy: Sage Impa.' },
  { prefix: 'albw_ganon', id: 'albw_ganon', name: 'Lorule Castle & Yuga Ganon', sub: 'The final battle', tagline: 'Seven Sages open the castle. End the curse on two worlds.', champion: null,
    grants: '',
    context: 'With all seven Sages freed, the barrier on Lorule Castle falls. Climb the castle (merge-and-tool puzzle rooms, mini-bosses) — the Sages lend you the Bow / a means to fight. Face Yuga Ganon (Yuga fused with Ganon). Be spoiler-aware about the ending twist with Princess Hilda; guide the final fight (merge to dodge into the wall, then strike; the Sages\' power finishes it) and the restoration of Lorule\'s Triforce. This is the FINAL chapter — id MUST be exactly "albw_ganon", champion null.' },
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

ITEMS OBTAINED IN THIS CHAPTER (grant each via a step's "items" array, EXACT names; rented items count):
${ch.grants || '(no new permanent items — this is the finale)'}
${ch.champion ? `\nThe trophy "${ch.champion}" MUST be granted on a k:"reward" step at the end of the dungeon (after the boss), with cat "key".` : ''}

Write the full chapter now. 2–4 sections, ~8–16 steps, Stuck hints where a beginner could stall (a merge route, which item to rent, the boss trick). Return the chapter object.`;
}

function verifyPrompt(ch, draft) {
  return `You are an ADVERSARIAL fact-checker for an A Link Between Worlds (3DS) walkthrough. Below is a DRAFT chapter. Find and FIX every factual error, then return the corrected chapter in the same schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, Thonky, gamerguides). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Verify specifically:
- The RENTED item(s) this dungeon needs and their EXACT names; that this chapter grants: ${ch.grants || '(finale — no new items)'}
- The BOSS name and the real strategy (which item, weak point, the wall-merge angle).
- The route/merge directions and any Lorule↔Hyrule fissure trick — fix anything backwards or wrong.
${ch.champion ? `- The trophy "${ch.champion}" is granted on a k:"reward" step (cat "key") after the boss. The Sage→dungeon mapping is FIXED: Dark Palace=Gulley, Swamp Palace=Oren, Skull Woods=Seres, Thieves' Hideout=Osfala, Ice Ruins=Rosso, Desert Palace=Irene, Turtle Rock=Impa; Eastern Palace=Pendant of Courage, House of Gales=Pendant of Wisdom, Tower of Hera=Pendant of Power. Keep this chapter's trophy as given.` : '- This chapter grants no Pendant/Sage.'}

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
log(`ALBW walkthrough: ${chapters.length}/${CH.length} chapters verified`);
return { chapters };
