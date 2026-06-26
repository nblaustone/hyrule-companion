export const meta = {
  name: 'ww-walkthrough',
  description: 'Author + adversarially verify the full The Wind Waker main quest (9 chapters)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter — beginner-first steps + Stuck hints' },
    { title: 'Verify', detail: 'adversarial web cross-check per chapter (items/bosses/order/sailing)' },
  ],
};

const ITEM_SCHEMA = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, cat: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'cat', 'note'] };
const STEP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, k: { type: 'string', enum: ['step', 'loot', 'optional', 'reward', 'tip', 'warn'] }, t: { type: 'string' }, stuck: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } }, required: ['id', 'k', 't'] };
const SECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, reward: { type: ['string', 'null'] }, steps: { type: 'array', items: STEP_SCHEMA } }, required: ['id', 'name', 'steps'] };
const CHAPTER_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, sub: { type: 'string' }, kind: { type: 'string' }, tagline: { type: 'string' }, champion: { type: ['string', 'null'] }, sections: { type: 'array', items: SECTION_SCHEMA }, changes: { type: 'string' } }, required: ['id', 'name', 'sub', 'champion', 'sections'] };

const VOICE = `You are writing ONE chapter of an offline, beginner-first walkthrough for The Legend of Zelda: The Wind Waker (Nintendo GameCube, 2002; also the Wii U HD remaster — keep it version-neutral, you may note HD extras as such) — a Sheikah-Slate-styled companion app. A first-time player uses it with one thumb.

SETTING & SYSTEMS:
- Hyrule lies drowned beneath the GREAT SEA. You sail island to island in the King of Red Lions (a talking boat) and travel by SAIL, so the WIND matters — conduct the Wind's Requiem with the Wind Waker baton to point the wind where you're going; the Ballad of Gales warps you between islands.
- The Wind Waker is a magic conductor's baton: you conduct short songs to change wind, warp, command statues, and sync with your Sage companions (Medli, Makar). Other songs: Command Melody, Earth God's Lyric, Wind God's Aria, Song of Passing.
- Unlike A Link Between Worlds, items ARE found in dungeons (Grappling Hook, Deku Leaf, Boomerang, Hero's Bow, Skull Hammer, Mirror Shield, Hookshot, Iron Boots, Power Bracelets…). Combat: Z/L-target, then strike; when an enemy flashes and a prompt appears, PARRY for a flashy counter.

HOUSE STYLE (match it exactly):
- Beginner-first, spoiler-aware. Explain WHAT to do and WHERE (which island, which direction on the sea).
- Chapter = { id, name, sub, kind:"region", tagline, champion, sections:[] }.
- Section = { id, name, sub, reward(optional), steps:[] }.
- Step = { id, k, t, stuck(optional), items(optional) }.
  - k: "step" | "loot" | "optional" | "reward" are CHECKABLE; "tip" | "warn" are info-only. Use "reward" for the step that hands over the chapter trophy (a Pearl, or an awakened Sage).
  - t: one tight, concrete, directional instruction (1–3 sentences).
  - stuck (optional): the precise hidden "Stuck? tap for the exact how" hint for tricky spots (a song to conduct, a boss trick, where on the sea).
  - items (optional): things OBTAINED here → [{ name, cat, note }]. cat ∈ sword | shield | bow | song | item | key | material. EXACT canonical names.
- IDs: every section id and step id MUST start with the chapter prefix + "_", short lowercase snake_case, unique within the chapter.
- 2–4 sections, ~8–16 steps. Honest over padded. No invented facts; omit anything genuinely uncertain.

Return ONLY the chapter object via the structured-output tool.`;

const CH = [
  { prefix: 'ww_dragon', id: 'ww_dragon', name: 'Dragon Roost Island & Cavern', sub: "Din's Pearl", tagline: 'Help the bird-folk, swing the chasms, take the first Pearl.', champion: "Din's Pearl",
    grants: 'Grappling Hook (cat item) — the Dragon Roost Cavern dungeon item; swing across gaps, climb, and steal items. · Din\'s Pearl (cat key) — given by Prince Komali after the dungeon (the trophy).',
    context: "Sail north to Dragon Roost Island, home of the Rito. The sky spirit Valoo is enraged; you (with Medli's help) enter Dragon Roost Cavern. Dungeon item: the Grappling Hook. Use Bait/bombs in the lava. Boss: Gohma — research the method (Grappling-Hook the ceiling support to drop rocks on its armored head, then sword the eye). Calm Valoo, and Prince Komali gives Din's Pearl. Trophy: Din's Pearl." },
  { prefix: 'ww_forest', id: 'ww_forest', name: 'Forest Haven & the Forbidden Woods', sub: "Farore's Pearl", tagline: 'A leaf that lets you glide, a Korok to rescue.', champion: "Farore's Pearl",
    grants: 'Deku Leaf (cat item) — from the Great Deku Tree in the Forest Haven; fan gusts and glide on updrafts (uses Magic). · Boomerang (cat item) — the Forbidden Woods dungeon item. · Farore\'s Pearl (cat key) — given by the Great Deku Tree after the dungeon.',
    context: "Sail to the Forest Haven; get the Deku Leaf from the Great Deku Tree, then ride the updraft/Leaf to the Forbidden Woods. Dungeon item: the Boomerang. Rescue the little Korok Makar. Boss: Kalle Demos — research the method (Boomerang to cut its hanging tentacles, then sword the bulb). The Great Deku Tree gives Farore's Pearl. Trophy: Farore's Pearl." },
  { prefix: 'ww_nayru', id: 'ww_nayru', name: "Nayru's Pearl & Jabun", sub: 'The third Pearl', tagline: 'Bombs from the pirates, a sea-spirit on Outset.', champion: "Nayru's Pearl",
    grants: 'Bombs (cat item) — obtained from Tetra\'s pirate ship (you can now bomb-blast cracked walls and fire the boat\'s cannon). · Nayru\'s Pearl (cat key) — given by the sea-spirit Jabun.',
    context: "Not a dungeon. To reach Jabun you need Bombs — board Tetra's pirate ship (at Windfall at night) and retrieve the Bombs from the hold. Then return to Outset Island and bomb open the sealed cave where Jabun has fled; the King of Red Lions vouches for you and Jabun grants Nayru's Pearl. With all three Pearls, set them on the triangle islands to raise the Tower of the Gods. Trophy: Nayru's Pearl." },
  { prefix: 'ww_totg', id: 'ww_totg', name: 'The Tower of the Gods & the Master Sword', sub: 'Into drowned Hyrule', tagline: 'Pass the gods’ trial, descend to old Hyrule, draw the blade.', champion: null,
    grants: "Hero's Bow (cat bow) — the Tower of the Gods dungeon item; shoot distant eyes/switches and enemies. · Master Sword (cat sword) — drawn in flooded Hyrule beneath the sea after the tower.",
    context: 'Place the three Pearls on the triangle islands to raise the Tower of the Gods from the sea. Clear the tower (statue/water-level puzzles, the Command-Melody statue Servant of the Tower). Dungeon item: the Hero\'s Bow. Boss: Gohdan — research the method (Bow to the hands then the nose). Ring the great bell; the way to flooded Hyrule opens. Descend, cross old Hyrule Castle, and draw the Master Sword from the basement — but learn it begins POWERLESS. No Pearl/Sage trophy this chapter.' },
  { prefix: 'ww_fortress', id: 'ww_fortress', name: 'Return to the Forsaken Fortress', sub: 'Rescue Aryll, face Ganondorf', tagline: 'A giant hammer, a masked bird, and the first meeting with the King of Evil.', champion: null,
    grants: 'Skull Hammer (cat item) — found in the Forsaken Fortress; a giant hammer that pounds pegs and smashes the Helmaroc King\'s mask.',
    context: "Sail back to the Forsaken Fortress (now lit) and storm it. Dungeon item: the Skull Hammer. Free Aryll and the other captured girls. Boss: the Helmaroc King — research the method (Skull Hammer to crack its iron mask after a Deku-Leaf/updraft approach, then sword it). Atop the tower you confront Ganondorf; the Master Sword's lost power is revealed, and Valoo/Quill rescue you. No Pearl/Sage trophy. Be spoiler-aware but clear." },
  { prefix: 'ww_earth', id: 'ww_earth', name: 'The Earth Temple', sub: 'Awaken Medli, the Earth Sage', tagline: 'Light, mirrors, and a Rito who must learn to pray.', champion: 'Medli, the Earth Sage',
    grants: "Mirror Shield (cat shield) — the Earth Temple dungeon item; reflects light beams to solve the temple and harm the boss. · Medli, the Earth Sage (cat key) — awakened here (the trophy).",
    context: "First you must restore the Master Sword: learn the Earth God's Lyric and bring Medli (the Rito) to the Earth Temple on Headstone Island. Use the Command Melody to control Medli (she reflects light with her harp/mirror) alongside Link's Mirror Shield. Dungeon item: the Mirror Shield. Boss: Jalhalla — research the method (reflect light to shrink the giant ghost, then pick it up and throw it). Awaken Medli as the Sage of Earth. Trophy: Medli, the Earth Sage." },
  { prefix: 'ww_wind', id: 'ww_wind', name: 'The Wind Temple', sub: 'Awaken Makar, the Wind Sage', tagline: 'Iron boots, a hookshot, and a Korok’s song restores the blade.', champion: 'Makar, the Wind Sage',
    grants: "Hookshot (cat item) — the Wind Temple dungeon item; pull yourself to targets and grab Makar/objects. · Makar, the Wind Sage (cat key) — awakened here (the trophy).",
    context: "Learn the Wind God's Aria and bring the Korok Makar to the Wind Temple (Gale Isle). You'll want the Iron Boots (from Ice Ring Isle) to resist the temple's gusts. Use the Command Melody to control Makar (he plants/plays to open ways). Dungeon item: the Hookshot. Boss: Molgera — research the method (Hookshot the burrowing sandworm's tongue to pull it out, then sword it). Awaken Makar as the Sage of Wind — now BOTH Sages pray and the Master Sword's full power returns. Trophy: Makar, the Wind Sage." },
  { prefix: 'ww_triforce', id: 'ww_triforce', name: 'The Triforce of Courage', sub: 'Eight shards beneath the sea', tagline: 'Charts, salvage, and a fortune that costs a fortune.', champion: null,
    grants: 'Triforce of Courage (cat key) — assembled from the eight shards dredged from the sea floor.',
    context: 'With the Master Sword restored, hunt the eight Triforce of Courage shards. Find the eight Triforce Charts (in dungeons, on islands, from minigames), have Tingle DECIPHER each chart (for Rupees) into a Treasure Chart, then sail to the marked spot and salvage the shard from the sea floor with the Grappling Hook from the King of Red Lions. Note the big-picture method clearly and where several charts are; assembling all eight forms the Triforce of Courage. This is a large open-sea chapter — keep it practical and beginner-friendly about the chart→decipher→dredge loop.' },
  { prefix: 'ww_ganon', id: 'ww_ganon', name: "Ganon's Tower", sub: 'The final battle', tagline: 'Rematch the dungeon bosses, then end the King of Evil.', champion: null,
    grants: 'Light Arrows (cat bow) — granted late (Zelda/the gods) and key to the final fight.',
    context: "Sail to Ganon's Tower (risen at the center of the sea). Inside, re-fight shadow versions of the four dungeon bosses, climb to Puppet Ganon (a giant marionette — research its three forms and the Light Arrow / Boomerang methods), then the rooftop duel with Ganondorf alongside Zelda (she fires Light Arrows; you parry and strike, and land the final Master Sword blow). Be spoiler-aware about the ending. This is the FINAL chapter — id MUST be exactly \"ww_ganon\", champion null." },
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
${ch.grants || '(no new permanent items)'}
${ch.champion ? `\nThe trophy "${ch.champion}" MUST be granted on a k:"reward" step at the right moment (after the dungeon/boss), with cat "key".` : ''}

Write the full chapter now. 2–4 sections, ~8–16 steps, Stuck hints where a beginner could stall (which song to conduct, the boss trick, where on the sea). Return the chapter object.`;
}

function verifyPrompt(ch, draft) {
  return `You are an ADVERSARIAL fact-checker for a The Wind Waker (GameCube) walkthrough. Below is a DRAFT chapter. Find and FIX every factual error, then return the corrected chapter in the same schema.

Use WebSearch and WebFetch to consult at least TWO independent sources (Zelda Dungeon, GameFAQs, Zelda Wiki/Zeldapedia, IGN). If those tools aren't available, load them via ToolSearch (query "WebSearch WebFetch"). Verify specifically:
- The dungeon ITEM(S) and their EXACT names; that this chapter grants what it should: ${ch.grants || '(no new items)'}
- The BOSS name and the real strategy (which item/song, weak point).
- The sailing route / island names / which SONG to conduct — fix anything wrong.
${ch.champion ? `- The trophy "${ch.champion}" is granted on a k:"reward" step (cat "key"). FIXED mapping: Din's Pearl=Dragon Roost, Farore's Pearl=Forest Haven/Forbidden Woods, Nayru's Pearl=Jabun; Medli=Earth Temple (Earth Sage), Makar=Wind Temple (Wind Sage). Keep this chapter's trophy as given.` : '- This chapter grants no Pearl/Sage trophy.'}

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
log(`WW walkthrough: ${chapters.length}/${CH.length} chapters verified`);
return { chapters };
