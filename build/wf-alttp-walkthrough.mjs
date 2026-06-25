export const meta = {
  name: 'alttp-walkthrough',
  description: 'Author + adversarially verify the full A Link to the Past main quest (12 chapters)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter — beginner-first steps + Stuck hints' },
    { title: 'Verify', detail: 'adversarial web cross-check per chapter (items/bosses/order/directions)' },
  ],
};

// chapter shape mirrors knowledge/alttp/walkthrough.json exactly (REGIONS[]).
const ITEM_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'cat', 'note'] };
const STEP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, k: { type: 'string', enum: ['step', 'loot', 'optional', 'reward', 'tip', 'warn'] }, t: { type: 'string' }, stuck: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } }, required: ['id', 'k', 't'] };
const SECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, reward: { type: ['string', 'null'] }, steps: { type: 'array', items: STEP_SCHEMA } }, required: ['id', 'name', 'steps'] };
const CHAPTER_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, kind: { type: 'string' }, tagline: { type: 'string' }, champion: { type: ['string', 'null'] }, sections: { type: 'array', items: SECTION_SCHEMA }, changes: { type: 'string' } }, required: ['id', 'name', 'sub', 'champion', 'sections'] };

const VOICE = `You are writing ONE chapter of an offline, beginner-first walkthrough for The Legend of Zelda: A Link to the Past (Super Nintendo, 1991) — a Sheikah-Slate-styled companion app. A first-time player uses it with one thumb while playing.

HOUSE STYLE (match it exactly):
- Beginner-first, spoiler-aware. Assume the player has never touched the game. Explain WHAT to do and WHERE, not lore dumps.
- Each chapter is { id, name, sub, kind:"region", tagline, champion, sections:[] }.
- Each section is { id, name, sub, reward(optional string), steps:[] }.
- Each step is { id, k, t, stuck(optional), items(optional) }.
  - k (kind): "step" | "loot" | "optional" | "reward" are CHECKABLE actions; "tip" | "warn" are info-only. Use "reward" for the step that hands over a dungeon's main prize/trophy.
  - t: one tight instruction (1–3 sentences), concrete and directional.
  - stuck (optional): a hidden "Stuck? tap for the exact how" hint — the precise trick/route for that step. Add one to any step a beginner could get stuck on (puzzles, hidden entrances, boss tricks). ~1–3 sentences.
  - items (optional): things the player OBTAINS at this step → [{ name, cat, note }]. cat ∈ sword | shield | armor | bow | item | key | material. Write a short helpful note for each. Use EXACT canonical item names.
- IDs: every section id and step id MUST start with the given chapter prefix + "_". Keep them short, unique within the chapter, lowercase snake_case (e.g. "<prefix>_s_entry", "<prefix>_boss_1").
- Aim for 2–4 sections and roughly 8–16 steps total for the chapter — a clean path through, the key items, the boss, and the trophy. Honest over padded.
- Voice: calm, encouraging, concrete. No invented facts. If a detail is genuinely uncertain, omit it rather than guess.

Return ONLY the chapter object via the structured-output tool.`;

const CH = [
  { prefix: 'alttp_ep', name: 'The Eastern Palace', sub: 'Pendant of Courage', tagline: 'The first Pendant of Virtue, and a Bow to claim it.', champion: 'Pendant of Courage',
    grants: 'Pegasus Boots (cat item) — obtained BEFORE/near this dungeon: after speaking with the elder Sahasrahla in Kakariko Village, his wife (the woman in the house) gives the Pegasus Boots (hold to dash). · Bow (cat bow) — the Eastern Palace dungeon item. · Pendant of Courage (cat key) — the boss trophy, granted on the "reward" step after the boss.',
    context: 'After the Sanctuary, the priest/Sahasrahla direct you to the Eastern Palace (far east of Hyrule, Light World). Talk to Sahasrahla in Kakariko first (he teleport-talks you), get the Pegasus Boots from his wife. Eastern Palace: dark rooms (use the Lamp on torches), the Bow is the dungeon item (needed for eye-switches and the boss), beat the boss the Armos Knights (six statues; shoot/strike the one that flashes red, dodge their hops). Trophy: Pendant of Courage.' },
  { prefix: 'alttp_dp', name: 'The Desert Palace', sub: 'Pendant of Power', tagline: 'Read the desert tablet, lift the rocks, take the second Pendant.', champion: 'Pendant of Power',
    grants: 'Book of Mudora (cat item) — found at the Library in Kakariko (reachable with the Pegasus Boots dash to knock the book down) and used to read the desert tablet. · Power Glove (cat item) — the Desert Palace dungeon item; lets you lift small rocks/bushes. · Pendant of Power (cat key) — the boss trophy.',
    context: 'Head to the southwest desert. You need the Book of Mudora to read the stone tablet at the desert entrance, which opens the way in. Inside, the Power Glove is the dungeon item. Light torches with the Lamp; use the Bow. Boss: Lanmolas — three sand worms that burrow and erupt; hit each head when it surfaces. Trophy: Pendant of Power.' },
  { prefix: 'alttp_toh', name: 'Death Mountain & the Tower of Hera', sub: 'Pendant of Wisdom', tagline: 'A long climb, a lost old man, and the Moon Pearl.', champion: 'Pendant of Wisdom',
    grants: 'Magic Mirror (cat item) — given by the lost old man you escort to safety on Death Mountain; warps you from Dark World back to Light World. · Moon Pearl (cat key) — the Tower of Hera dungeon item; keeps you in Link\'s form in the Dark World. · Pendant of Wisdom (cat key) — the boss trophy.',
    context: 'Climb Death Mountain from Kakariko (the cliffs north). In the dark caves use the Lamp; escort the lost, frightened old man back to his cave entrance and he rewards you with the Magic Mirror. Use the warps/Mirror to reach the Tower of Hera (the spire on the mountaintop plateau). Tower of Hera dungeon item: the Moon Pearl. Boss: Moldorm — a wriggling worm with a weak tail-tip on a floor with edges you can fall off; hit the tail, don\'t get knocked off. Trophy: Pendant of Wisdom.' },
  { prefix: 'alttp_ms', name: 'The Master Sword & the Castle Tower', sub: 'Drawing the blade, and Agahnim', tagline: 'Three pendants earn the legendary sword — and a wizard to test it on.', champion: null,
    grants: 'Master Sword (cat sword) — drawn from the pedestal deep in the Lost Woods once you hold all three Pendants of Virtue.',
    context: 'With all three pendants, go to the Lost Woods (northwest) and walk to the pedestal in the grove to draw the Master Sword (Zelda telepathically confirms). Then the castle is overrun — Agahnim has taken Princess Zelda. Enter Hyrule Castle (the front is open now), climb to the top, and fight the wizard Agahnim in the Castle Tower. Trick: he is invincible to normal hits — when he hurls a ball of magic, swing the sword to deflect it back at him (or use the Bug Net). After he falls he warps you into the Dark World, where you become trapped (the Moon Pearl keeps you in human form). No dungeon trophy this chapter.' },
  { prefix: 'alttp_pod', name: 'Palace of Darkness', sub: 'The first Maiden', tagline: 'Into the Dark World — and the first crystal.', champion: 'Crystal — Palace of Darkness',
    grants: 'Magic Hammer (cat item) — the Palace of Darkness dungeon item; pounds stakes and stuns. · Crystal — Palace of Darkness (cat key) — the boss trophy (a rescued Maiden sealed in a crystal).',
    context: 'First Dark World dungeon, in the northeast. You need the Moon Pearl (human form) and lots of arrows (the Bow). Inside, the dungeon item is the Magic Hammer. Boss: the Helmasaur King — smash its bony face-mask with the Hammer (or bombs), then shoot the exposed jewel with arrows while dodging its tail and fireballs. Trophy: free the first Maiden → Crystal — Palace of Darkness.' },
  { prefix: 'alttp_swamp', name: 'Swamp Palace', sub: 'The second Maiden', tagline: 'Drain the water, hook across, free the second Maiden.', champion: 'Crystal — Swamp Palace',
    grants: 'Flippers (cat item) — bought from King Zora in the Light World (Zora\'s Waterfall, northeast) for 500 rupees; lets you swim. · Hookshot (cat item) — the Swamp Palace dungeon item; pulls you across gaps and stuns enemies. · Crystal — Swamp Palace (cat key) — the boss trophy.',
    context: 'Southern Dark World swamp. Getting in uses a Light World/Dark World water trick: in the Light World, pull the lever in the small house atop the matching spot to lower the swamp water, then mirror over. Get the Flippers from King Zora first (Light World) to swim. Inside, the dungeon item is the Hookshot, used to cross water and pull switches. Boss: Arrghus — pull off its floating Arrghi spikes with the Hookshot, then sword the exposed eye. Trophy: Crystal — Swamp Palace.' },
  { prefix: 'alttp_skull', name: 'Skull Woods', sub: 'The third Maiden', tagline: 'A forest of skulls with many mouths — and a Fire Rod.', champion: 'Crystal — Skull Woods',
    grants: 'Fire Rod (cat item) — the Skull Woods dungeon item; shoots a burst of flame, lights torches, melts ice. · Crystal — Skull Woods (cat key) — the boss trophy.',
    context: 'The Dark World forest in the northwest (mirror of the Lost Woods). The dungeon has several separate skull-entrances on the surface; you drop between them. Dungeon item: the Fire Rod. Boss: Mothula — a giant moth on a spike floor; burn it with the Fire Rod (and sword) while avoiding the moving spike traps. Trophy: Crystal — Skull Woods.' },
  { prefix: 'alttp_thieves', name: "Thieves' Town", sub: 'The fourth Maiden', tagline: 'The Village of Outcasts hides a dungeon — and the Titan\'s Mitt.', champion: "Crystal — Thieves' Town",
    grants: "Titan's Mitt (cat item) — the Thieves' Town dungeon item; upgrades the Power Glove to lift the heavy dark rocks. · Crystal — Thieves' Town (cat key) — the boss trophy.",
    context: "The dungeon inside the Village of Outcasts (Dark World, west). Dungeon item: the Titan's Mitt (lift the big dark-grey rocks). You free a follower (the maiden) partway, then face the boss: Blind the Thief — carry/escort the girl into the boss room to trigger him; he splits into floating heads when hit, vulnerable to the sword/Fire Rod. Trophy: Crystal — Thieves' Town." },
  { prefix: 'alttp_ice', name: 'Ice Palace', sub: 'The fifth Maiden', tagline: 'A frozen tower in the southern sea, melted with fire.', champion: 'Crystal — Ice Palace',
    grants: 'Blue Mail (cat armor) — the Ice Palace dungeon item; halves damage taken. · Crystal — Ice Palace (cat key) — the boss trophy.',
    context: 'On the southern island of the Dark World (reach it via the Light World Lake Hylia + Magic Mirror, needing the Flippers). Inside is icy: use the Fire Rod to melt blocks, mind slippery floors. Dungeon item: the Blue Mail (better armor). Boss: Kholdstare — melt its ice shell with the Fire Rod, then sword the three eyeballs inside. Trophy: Crystal — Ice Palace.' },
  { prefix: 'alttp_mire', name: 'Misery Mire', sub: 'The sixth Maiden', tagline: 'A medallion opens the swamp; a cane builds your path.', champion: 'Crystal — Misery Mire',
    grants: 'Ether Medallion (cat item) — found on a Light World mountain ledge (read the tablet there with the Book of Mudora and the Master Sword); cast it outside Misery Mire to open it. · Cane of Somaria (cat item) — the Misery Mire dungeon item; creates a block you can carry, ride, or shoot. · Crystal — Misery Mire (cat key) — the boss trophy.',
    context: 'Southwest Dark World swamp. To open it, stand outside and cast the Ether Medallion (learned from the tablet on the Light World peak). Inside, the dungeon item is the Cane of Somaria; many puzzles need its blocks on switches. Boss: Vitreous — a cluster of eyeballs in goo that fire lightning; sword the small eyes then the big one. Trophy: Crystal — Misery Mire.' },
  { prefix: 'alttp_turtle', name: 'Turtle Rock', sub: 'The seventh Maiden', tagline: 'The last dungeon — fire, ice, and a three-headed dragon.', champion: 'Crystal — Turtle Rock',
    grants: 'Quake Medallion (cat item) — earned in the Light World (defeat the catfish/quake spot) and cast to open Turtle Rock. · Mirror Shield (cat shield) — the Turtle Rock dungeon item; blocks beams that the normal shield cannot. · Crystal — Turtle Rock (cat key) — the boss trophy.',
    context: 'Atop Dark Death Mountain. Open the entrance by casting the Quake Medallion on the boulder. You need the Cane of Somaria for the rail/cart puzzles and both the Fire Rod and Ice Rod. Dungeon item: the Mirror Shield. Boss: Trinexx — a three-headed dragon; freeze the fire head with the Ice Rod and burn the ice head with the Fire Rod, then sword the rock body. Trophy: Crystal — Turtle Rock (the seventh and last).' },
  { prefix: 'alttp_ganon', name: "Ganon's Tower & Ganon", sub: 'The final battle', tagline: 'Seven crystals open the bridge. Climb the tower, end the curse.', champion: null,
    grants: 'Silver Arrows (cat bow) — found inside Ganon\'s Tower (or via the Pyramid fairy) and required to finish Ganon.',
    context: 'With all seven crystals, the bridge from the Pyramid to Ganon\'s Tower (atop Dark Death Mountain) appears. Climb the long tower — many rooms and mini-bosses (and the Red Mail armor along the way) — to a rematch with Agahnim at the top, who now summons shadow doubles; deflect his magic. Defeat him and Ganon bursts free, fleeing to the Pyramid. Final fight: in a dark arena Ganon throws his trident and fire bats; light the torches (Fire Rod/Lamp), sword him, and when he\'s stunned hit him with a Silver Arrow. Repeat to win and wake from the nightmare. This is the final chapter — id MUST be exactly "alttp_ganon".' },
];

function authorPrompt(ch) {
  return `${VOICE}

CHAPTER TO WRITE
- id: "${ch.prefix === 'alttp_ganon' ? 'alttp_ganon' : ch.prefix}"  (use this exact chapter id)
- name: "${ch.name}"
- sub: "${ch.sub}"
- kind: "region"
- tagline: "${ch.tagline}"
- champion: ${ch.champion ? `"${ch.champion}"` : 'null'}
- section/step id prefix: "${ch.prefix}_"

WHAT HAPPENS (your factual basis — confirm against your own knowledge of the game; do not invent):
${ch.context}

ITEMS THE PLAYER OBTAINS IN THIS CHAPTER (grant each via a step's "items" array, EXACT names, sensible "reward"/"loot" step kind):
${ch.grants}
${ch.champion ? `\nThe trophy "${ch.champion}" MUST be granted on a k:"reward" step at the end of the dungeon (after the boss), with cat "key".` : ''}

Write the full chapter now. 2–4 sections, ~8–16 steps, Stuck hints where a beginner could stall (hidden entrances, the boss trick, the cross-world trick). Return the chapter object.`;
}

function verifyPrompt(ch, draft) {
  return `You are an ADVERSARIAL fact-checker for an A Link to the Past (SNES) walkthrough. Below is a DRAFT chapter. Your job: find and FIX every factual error, then return the corrected chapter in the same schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (e.g. Zelda Dungeon, GameFAQs, Zeldapedia/Zelda Wiki, Thonky, StrategyWiki). If those tools are not already available to you, load them first via ToolSearch (query "WebSearch WebFetch"). Then verify, specifically:
- The dungeon ITEM(S) and their EXACT names, and that this chapter grants the items it should: ${ch.grants}
- The BOSS name and the actual strategy to beat it (directions, which tool, weak point).
- The room/route directions and any cross-world (Magic Mirror) or medallion tricks — fix anything backwards or wrong.
- Prerequisites (which earlier items are needed to even enter/clear this dungeon).
${ch.champion ? `- The trophy "${ch.champion}" is granted on a k:"reward" step (cat "key") after the boss.` : '- This chapter grants no Maiden crystal.'}

RULES:
- Keep the SAME shape and the SAME id prefix "${ch.prefix}_" on every section/step id. Keep chapter id "${ch.prefix === 'alttp_ganon' ? 'alttp_ganon' : ch.prefix}", name "${ch.name}", champion ${ch.champion ? `"${ch.champion}"` : 'null'}.
- Keep it beginner-first and tight. Preserve good Stuck hints; correct wrong ones.
- Honesty law: if something can't be confirmed, soften or drop it rather than assert it.
- Put a one-line summary of what you changed in the "changes" field.

DRAFT:
${JSON.stringify(draft)}`;
}

const out = await pipeline(
  CH,
  (ch) => agent(authorPrompt(ch), { label: `author:${ch.prefix}`, phase: 'Author', schema: CHAPTER_SCHEMA }),
  (draft, ch) => draft ? agent(verifyPrompt(ch, draft), { label: `verify:${ch.prefix}`, phase: 'Verify', schema: CHAPTER_SCHEMA, agentType: 'claude' }) : null,
);

const chapters = out.filter(Boolean).map((c) => { const { changes, ...rest } = c; rest.kind = 'region'; return rest; });
log(`ALttP walkthrough: ${chapters.length}/${CH.length} chapters verified`);
return { chapters };
