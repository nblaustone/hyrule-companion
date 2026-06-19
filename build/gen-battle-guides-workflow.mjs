#!/usr/bin/env node
/* v12.8: generate the combat-guides Workflow.
   Two outputs, authored + adversarially verified, web-sourced like the shrine solutions:
   (1) a 7-card "Combat Basics" primer (cuts through systems-overwhelm), and
   (2) a spoiler-gated `battle` guide ("Stuck? How to win this fight") for the marquee enemies.
   Workflow scripts can't read files, so the enemy list + style anchor are embedded as consts. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BESTIARY = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "bestiary.json"), "utf8"));

// the walls that deserve a full battle guide: every boss/guardian/yiga/mini-boss + Wizzrobe.
// the basic trash (Bokoblin/Keese/Chuchu/…) keep their one-line tactic; camps are covered in the primer.
const MARQUEE = BESTIARY.enemies.filter(
  (e) => ["boss", "guardian", "yiga", "mini-boss"].includes(e.tier) || /wizzrobe/i.test(e.name)
).map((e) => ({ name: e.name, tier: e.tier, tactic: e.tactic, drops: e.drops || "" }));

// voice/length anchor for the battle guides (hand-written, beginner-first, gear-first)
const EX_BATTLE =
  "Lynels are the game's skill check, but very beatable once you commit. Bring a strong two-handed weapon, " +
  "a bow with plenty of arrows, and a meal that boosts attack or defense; a sturdy shield lets you parry. " +
  "Open with a headshot from stealth or range — when an arrow hits its face the Lynel reels, so sprint in, " +
  "press up to mount its back, and mash attack for free damage. On the ground, bait its charge and side-hop " +
  "at the last instant for a flurry rush, or raise your shield as it swings to parry. Stay close so it can't " +
  "use its fireball or shock-arrow volleys, and remount every time you stagger it again. Its drops — Lynel " +
  "horns, hooves, guts, plus its powerful weapon, bow, and shield — are some of the best in the game.";

const body = `export const meta = {
  name: 'botw-combat-guides',
  description: 'Author + adversarially verify a Combat Basics primer and spoiler-gated battle guides for the marquee BotW enemies',
  phases: [
    { title: 'Basics', detail: 'author + verify the 7-card combat fundamentals primer' },
    { title: 'Author', detail: 'one agent per marquee enemy web-researches and writes the how-to-win guide' },
    { title: 'Verify', detail: 'an independent skeptic fact-checks each guide against a second source' },
  ],
};

const MARQUEE = ${JSON.stringify(MARQUEE)};
const EX_BATTLE = ${JSON.stringify(EX_BATTLE)};

const BATTLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    battle: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["name", "battle"],
};

const BASICS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
    },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["cards"],
};

/* ---------- COMBAT BASICS primer ---------- */
const basicsAuthor = \`You are writing a short "Combat Basics" primer for a beginner-first, offline companion to The Legend of Zelda: Breath of the Wild (Switch, the 2017 ORIGINAL — never mention Tears of the Kingdom mechanics like Fuse/Ultrahand/Ascend). The reader is a first-timer (playing with their kid) who feels OVERWHELMED by the game's systems. Your job: the few core ideas that make combat click, in plain language, so they stop feeling lost.

Write EXACTLY these 7 cards (title + body). Each body is 1–3 plain sentences, concrete, no markdown, no lists inside, beginner-first:
1. "Flurry Rush" — dodge at the last second (hop sideways vs a side/overhead swing, backflip vs a thrust) to trigger slow-motion, then attack for a free combo. The single most important skill.
2. "Perfect Guard (Parry)" — hold up your shield (ZL) and press A right as a blow lands to deflect it; this is how you reflect a Guardian's laser straight back at it.
3. "Sneakstrike" — crouch to stay quiet (watch the noise meter), sneak behind an unaware enemy, and the first hit does triple damage. Stealth armor and quiet food help.
4. "Weak points & headshots" — a bow shot to the head/eye staggers most enemies and does bonus damage; many bosses have a glowing weak spot. Aiming a bow in mid-air (after a jump or off the paraglider) slows time.
5. "Elements: fire, ice, shock" — fire burns wooden weapons/shields and grass (updrafts), ice freezes then a hit shatters for big damage, shock makes enemies drop their gear; NEVER carry metal in a thunderstorm or near a Wizzrobe's lightning.
6. "Weapons break — that's normal" — every weapon wears out, so don't hoard your best ones; carry several, throw a nearly-broken weapon for a damage burst, and pick up enemy gear constantly.
7. "What to bring to a hard fight" — the loadout that cuts the overwhelm: one defense-up OR attack-up cooked meal, a strong two-handed or one-handed weapon, a bow with a stack of arrows (plus a few elemental arrows), and a solid shield to parry. That's it.

Use WebSearch/WebFetch to sanity-check any number you state (e.g. sneakstrike multiplier, mid-air bow-time). Keep it honest: if unsure of an exact figure, describe the effect without a wrong number. Return {cards:[{title,body}], sources:[...]}.\`;

const basicsVerify = (authored) => \`Adversarially fact-check this BotW (Switch, 2017 original) "Combat Basics" primer. Verify each claim against a real guide (Game8 / Zelda Dungeon / Zeldapedia) using WebSearch/WebFetch. Confirm: flurry-rush dodge directions, that a perfect guard reflects Guardian lasers, the sneakstrike multiplier (x8 sneakstrike damage in BotW — confirm), mid-air bow slow-mo, the elemental effects (esp. shock-drops-weapons and the metal-in-thunderstorm danger), and that the "what to bring" card is sound, simple advice. Fix any wrong number or claim in place; if a figure can't be confirmed, state the effect without the number. Keep exactly the 7 cards, each 1–3 plain sentences, no markdown. Return the corrected {cards:[{title,body}], sources:[...], corrections:"<one line>"}.

Cards to verify:
\${JSON.stringify((authored && authored.cards) || [], null, 1)}\`;

/* ---------- per-enemy BATTLE guides ---------- */
const ectx = (e) => [\`Enemy: \${e.name}\`, \`Type: \${e.tier}\`, \`Our current one-line tactic: \${e.tactic}\`, e.drops ? \`Known drops: \${e.drops}\` : ""].filter(Boolean).join("\\n");

const battleAuthor = (e) => \`You are writing the spoiler-gated "How to win this fight" guide for ONE enemy in a beginner-first, offline companion to The Legend of Zelda: Breath of the Wild (Switch, the 2017 ORIGINAL — never mention Tears of the Kingdom mechanics: no Fuse/Ultrahand/Ascend/Recall/Zonai devices). It sits behind a "Stuck? How to win this fight" button, so it's the concrete plan a first-timer (playing with their kid) reads when a fight is kicking their butt.

\${ectx(e)}

RESEARCH FIRST with WebSearch + WebFetch on real BotW guides — Game8, Zelda Dungeon, Thonky (thonky.com), Zeldapedia/Fandom. Read this exact enemy's strategy before writing. Get the mechanics right (the opening, the dodge/parry/mount, elemental needs, weak spots, phase changes for bosses).

WRITE one flowing paragraph, second person, plain prose, no markdown/headings/lists/quotes, ~400–900 characters, in this order:
- LEAD WITH WHAT TO BRING (gear + food) — this is the part that cuts a beginner's overwhelm. Name the kind of weapon/bow/arrows/shield and the meal (e.g. a defense-up or attack-up dish), and any element this fight requires (e.g. ice arrows/weapon to cool an Igneo Talus, fire for a Frost Talus, shock-proofing for Thunderblight).
- THE OPENING: how the fight starts and the first thing to do.
- THE CORE LOOP: the repeatable winning pattern (dodge→flurry, parry, mount, hit the weak spot/ore), and boss phase changes if any.
- A SAFE / EASY option a struggling player or a kid can fall back on (the "cheese": e.g. Stasis + bomb a Talus, Urbosa's Fury, ancient arrows on a Guardian, throw it off a ledge).
- END with the worthwhile drops/reward.

HARD RULES (the guide's three laws):
- DON'T INVENT. Every claim traces to a source you read. If unsure of a specific (a drop, an exact weak-spot), describe it plainly without naming what you can't confirm. An honest, slightly-vaguer line beats a confident wrong one.
- Beginner-first, spoiler-aware (help with THIS fight; don't spoil unrelated story), correct in-game proper names and rune names (Magnesis, Stasis, Remote Bomb, Cryonis; abilities like Urbosa's Fury, Daruk's Protection, Revali's Gale, Mipha's Grace).
- Match the VOICE and SHAPE of this verified example (Lynel): \${EX_BATTLE}

Return {name:"\${e.name}", battle:"<the paragraph>", sources:[...]}.\`;

const battleVerify = (e, authored) => \`You are an adversarial fact-checker protecting the honesty law of a Breath of the Wild (Switch, 2017 original) combat guide. Verify ONE enemy battle guide and return a corrected final version.

\${ectx(e)}

Proposed guide to verify:
"\${(authored && authored.battle) || ""}"

Research INDEPENDENTLY (prefer a different guide than: \${JSON.stringify((authored && authored.sources) || [])}) with WebSearch + WebFetch on Game8 / Zelda Dungeon / Thonky / Zeldapedia.
Check EVERY claim: the opening, the dodge/parry/mount mechanic, any required element (e.g. Igneo Talus needs ice / Frost Talus needs fire), weak spots, boss phase changes, the "cheese" option, and the named drops. Confirm it LEADS with what gear/food to bring. Confirm one plain-text paragraph (no markdown), ~400–900 chars, beginner-first, spoiler-aware, correct proper names, ends on the reward.
FIX errors in place; SOFTEN or REMOVE any claim you can't verify (don't ship a guess). Return the FINAL {name:"\${e.name}", battle:"<corrected paragraph>", sources:[...], corrections:"<one line: what you changed, or 'no changes'>"}.\`;

/* ---------- run ---------- */
phase("Basics");
let basics = await agent(basicsAuthor, { label: "author:basics", phase: "Basics", schema: BASICS_SCHEMA });
if (basics) basics = await agent(basicsVerify(basics), { label: "verify:basics", phase: "Basics", schema: BASICS_SCHEMA });

const battles = await pipeline(
  MARQUEE,
  (e) => agent(battleAuthor(e), { label: "author:" + e.name, phase: "Author", schema: BATTLE_SCHEMA }),
  (authored, e) => authored
    ? agent(battleVerify(e, authored), { label: "verify:" + e.name, phase: "Verify", schema: BATTLE_SCHEMA })
    : null,
);

const clean = battles.filter(Boolean).filter((r) => r && r.battle && r.battle.trim());
const missing = MARQUEE.filter((e) => !clean.find((r) => r.name === e.name)).map((e) => e.name);
log(\`Battle guides: \${clean.length}/\${MARQUEE.length} verified\` + (missing.length ? " · MISSING: " + missing.join(", ") : ""));
log(\`Basics primer: \${basics && basics.cards ? basics.cards.length : 0} cards\`);
return { basics, battles: clean, total: clean.length, expected: MARQUEE.length, missing };
`;

fs.writeFileSync("/tmp/battle-guides-workflow.mjs", body);
console.log(`wrote /tmp/battle-guides-workflow.mjs (${body.length} bytes) · ${MARQUEE.length} marquee enemies`);
console.log("marquee:", MARQUEE.map((e) => e.name).join(", "));
