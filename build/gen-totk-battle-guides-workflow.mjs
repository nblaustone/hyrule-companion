#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK combat-guides Workflow. Mirrors gen-battle-guides-workflow.mjs.
   Two outputs, authored + adversarially verified, web-sourced:
   (1) a 7-card "Combat Basics" primer (TotK-flavoured: Fuse, perfect dodge/guard, weak points, elements,
       durability+Fuse, what to bring), and
   (2) spoiler-gated `battle` guides for a curated marquee — existing enemies are merged by name; the lumped
       "Temple bosses (…)" and "Gleeok (Fire / Frost / Thunder)" rows are split into individual bosses
       (assemble-totk drops the lumped placeholders once the split guides exist).
   Output → knowledge/totk/battle.json ({basics:[{title,body}], enemies:[{name,tier,tactic,drops,battle}]}). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));
const find = (n) => APP.BESTIARY.enemies.find((e) => e.name === n) || {};

// curated marquee: existing entries that warrant a full guide + split bosses (with their own tier/tactic/drops)
const fromExisting = (n) => { const e = find(n); return { name: n, tier: e.tier || "boss", tactic: e.tactic || "", drops: e.drops || "" }; };
const MARQUEE = [
  fromExisting("Lynel"), fromExisting("Hinox"), fromExisting("Stalnox"),
  fromExisting("Boss Bokoblin"), fromExisting("Stone Talus (incl. Luminous / Rare)"),
  fromExisting("Frox"), fromExisting("Flux Construct"), fromExisting("Molduga"),
  fromExisting("King Gleeok"), fromExisting("Gloom Hands (Gloom Spawn)"), fromExisting("Phantom Ganon"),
  fromExisting("Demon King Ganondorf"), fromExisting("Demon Dragon"),
  // split the lumped Gleeok row → one guide each (all share the head-stagger loop; element differs)
  { name: "Fire Gleeok", tier: "boss", tactic: "Three fire heads; use ice/frost to put them out and stagger.", drops: "Fire Gleeok Horn, Wing, Guts" },
  { name: "Frost Gleeok", tier: "boss", tactic: "Three ice heads; use fire to thaw and stagger.", drops: "Frost Gleeok Horn, Wing, Guts" },
  { name: "Thunder Gleeok", tier: "boss", tactic: "Three shock heads; avoid metal, use any element to stagger.", drops: "Thunder Gleeok Horn, Wing, Guts" },
  // split the lumped Temple bosses row → one guide each
  { name: "Colgera", tier: "boss", tactic: "Wind Temple boss; dive at its frozen weak segments while skydiving.", drops: "Heart Container, Tulin's Vow" },
  { name: "Marbled Gohma", tier: "boss", tactic: "Fire Temple boss; knock it off the ceiling, smash the legs.", drops: "Heart Container, Yunobo's Vow" },
  { name: "Mucktorok", tier: "boss", tactic: "Water Temple boss; wash off the sludge, hit the shark.", drops: "Heart Container, Sidon's Vow" },
  { name: "Queen Gibdo", tier: "boss", tactic: "Lightning Temple boss; break the wing scales with light/element, then strike.", drops: "Heart Container, Riju's Vow" },
];

// voice/length anchor (hand-written, beginner-first, gear-first, TotK-aware)
const EX_BATTLE =
  "Lynels are Tears of the Kingdom's skill check, but very beatable once you commit. Bring a strong " +
  "Fused weapon (a Lynel horn or sturdy rock on a claymore hits hard), a bow with plenty of arrows, and a " +
  "meal that boosts attack or defense; a good shield lets you parry. Open with a headshot from stealth or " +
  "range — when an arrow hits its face the Lynel reels, so sprint in, press up to mount its back, and mash " +
  "attack for free damage. On the ground, bait its charge and side-hop at the last instant for a flurry " +
  "rush, or raise your shield as it swings for a perfect guard. Stay close so it can't use its fireball or " +
  "shock volleys, and remount every time you stagger it. Its drops — Lynel horns, hooves, guts, plus its " +
  "weapon, bow, and shield — are some of the best fuse materials in the game.";

const body = `export const meta = {
  name: 'totk-combat-guides',
  description: 'Author + adversarially verify a Combat Basics primer and spoiler-gated battle guides for the marquee TotK enemies',
  phases: [
    { title: 'Basics', detail: 'author + verify the 7-card combat fundamentals primer' },
    { title: 'Author', detail: 'one agent per marquee enemy web-researches and writes the how-to-win guide' },
    { title: 'Verify', detail: 'an independent skeptic fact-checks each guide against a second source' },
  ],
};

const MARQUEE = ${JSON.stringify(MARQUEE)};
const EX_BATTLE = ${JSON.stringify(EX_BATTLE)};

const BATTLE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" }, battle: { type: "string" },
    tier: { type: "string" }, tactic: { type: "string" }, drops: { type: "string" },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["name", "battle"],
};
const BASICS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    cards: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["cards"],
};

/* ---------- COMBAT BASICS primer ---------- */
const basicsAuthor = \`You are writing a short "Combat Basics" primer for a beginner-first, offline companion to The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild). The reader is a first-timer (playing with their kid) who feels OVERWHELMED by the game's systems. Your job: the few core ideas that make combat click, in plain language, so they stop feeling lost.

Write EXACTLY these 7 cards (title + body). Each body is 1–3 plain sentences, concrete, no markdown, no lists inside, beginner-first:
1. "Fuse makes your weapons" — your found weapons are weak and decayed; Fuse a monster horn, rock, or gem onto a weapon to multiply its damage, and onto a shield/arrow for effects. A Lynel/Gleeok horn or a strong rock turns a flimsy stick into a real weapon. This is the single most important habit in combat.
2. "Flurry Rush" — dodge at the last second (hop sideways vs a side/overhead swing, backflip vs a thrust) to trigger slow-motion, then attack for a free combo.
3. "Perfect Guard (Parry)" — hold up your shield (ZL) and press A right as a blow lands to deflect it; great against chargers and projectiles.
4. "Sneakstrike & weak points" — sneak up on an unaware enemy for a big bonus first hit (crouch, watch the noise meter); a bow shot to the head/eye staggers most enemies, and aiming a bow in mid-air (jump or off the paraglider) slows time.
5. "Elements: fire, ice, shock, water" — fire burns and creates updrafts, ice/frost freezes then shatters, shock makes enemies drop gear and is deadly if you (or they) hold metal, water/Splash Fruit washes off sludge and douses fire. Fuse the matching element to exploit a foe's weakness; NEVER carry metal in a thunderstorm or near a Thunder Gleeok.
6. "Weapons break — that's normal" — every weapon wears out, so don't hoard your best; carry several, throw a nearly-broken fused weapon for a burst, and re-Fuse from the endless monster parts you pick up.
7. "What to bring to a hard fight" — the loadout that cuts the overwhelm: one defense-up OR attack-up cooked meal, a couple of strong Fused weapons, a bow with a stack of arrows (plus a few you can Fuse an element onto), a solid shield to parry, and Brightbloom Seeds if you're heading into the Depths. That's it.

Use WebSearch/WebFetch (Game8 TotK, Zelda Dungeon, IGN) to sanity-check any number you state. Keep it honest: if unsure of an exact figure, describe the effect without a wrong number. Return {cards:[{title,body}], sources:[...]}.\`;

const basicsVerify = (authored) => \`Adversarially fact-check this TEARS OF THE KINGDOM (Switch, 2023) "Combat Basics" primer. Verify each claim against a real TotK guide (Game8 / Zelda Dungeon / IGN) using WebSearch/WebFetch. Confirm: that Fuse multiplies weapon damage (and the kinds of fuse materials), flurry-rush dodge directions, that a perfect guard deflects blows, the sneakstrike bonus, mid-air bow slow-mo, the elemental effects (esp. shock-drops-gear and the metal-in-thunderstorm danger; water/Splash Fruit washing off sludge), and that the "what to bring" card is sound, simple advice. These must be TotK mechanics, not BotW (no runes like Magnesis/Stasis; no champion abilities). Fix any wrong claim in place; if a figure can't be confirmed, state the effect without the number. Keep exactly the 7 cards, each 1–3 plain sentences, no markdown. Return the corrected {cards:[{title,body}], sources:[...], corrections:"<one line>"}.

Cards to verify:
\${JSON.stringify((authored && authored.cards) || [], null, 1)}\`;

/* ---------- per-enemy BATTLE guides ---------- */
const ectx = (e) => [\`Enemy: \${e.name}\`, \`Type: \${e.tier}\`, \`Our current one-line tactic: \${e.tactic}\`, e.drops ? \`Known drops: \${e.drops}\` : ""].filter(Boolean).join("\\n");

const battleAuthor = (e) => \`You are writing the spoiler-gated "How to win this fight" guide for ONE enemy in a beginner-first, offline companion to The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild; use TotK mechanics: Fuse, Ultrahand, Ascend, Recall, Zonai devices, the sage avatars Tulin/Yunobo/Sidon/Riju/Mineru). It sits behind a "Stuck? How to win this fight" button, so it's the concrete plan a first-timer (playing with their kid) reads when a fight is kicking their butt.

\${ectx(e)}

RESEARCH FIRST with WebSearch + WebFetch on real TotK guides — Game8 (game8.co/games/Tears-of-the-Kingdom), Zelda Dungeon, IGN's TotK wiki, Polygon, Zeldapedia/Fandom. Read this exact enemy's TotK strategy before writing. Get the mechanics right (the opening, the dodge/parry/mount, what to Fuse, elemental needs, weak spots, boss phase changes).

WRITE one flowing paragraph, second person, plain prose, no markdown/headings/lists/quotes, ~400–900 characters, in this order:
- LEAD WITH WHAT TO BRING (gear + food) — this cuts a beginner's overwhelm. Name the kind of Fused weapon/bow/arrows/shield and the meal (e.g. a defense-up or attack-up dish), and any element this fight requires (e.g. fire/frost to put out or thaw a Gleeok, water/Splash Fruit to wash off Mucktorok's sludge, Brightbloom in the Depths). Mention a helpful sage ability if relevant (Tulin's gust for airborne foes, Yunobo to break armor/ore).
- THE OPENING: how the fight starts and the first thing to do.
- THE CORE LOOP: the repeatable winning pattern (dodge→flurry, perfect guard, mount, hit the weak spot), and boss phase changes if any.
- A SAFE / EASY option a struggling player or a kid can fall back on (the "cheese": e.g. Tulin + bomb arrows on a Gleeok's heads, knock a Flux Construct apart and grab its core with Ultrahand, lure a Talus and bomb the ore).
- END with the worthwhile drops/reward (the best Fuse materials it gives).

HARD RULES (the guide's three laws):
- DON'T INVENT. Every claim traces to a source you read. If unsure of a specific (a drop, an exact weak-spot), describe it plainly without naming what you can't confirm. An honest, slightly-vaguer line beats a confident wrong one.
- Beginner-first, spoiler-aware (help with THIS fight; for the final bosses Demon King Ganondorf / Demon Dragon keep story spoilers minimal — focus on the fight). Use correct TotK proper names.
- Match the VOICE and SHAPE of this verified example (Lynel): \${EX_BATTLE}

Return {name:"\${e.name}", battle:"<the paragraph>", tier:"\${e.tier}", tactic:"<one-line tactic, refreshed>", drops:"\${(e.drops || "").replace(/"/g, "'")}", sources:[...]}.\`;

const battleVerify = (e, authored) => \`You are an adversarial fact-checker protecting the honesty law of a Tears of the Kingdom (Switch, 2023) combat guide. Verify ONE enemy battle guide and return a corrected final version.

\${ectx(e)}

Proposed guide to verify:
"\${(authored && authored.battle) || ""}"

Research INDEPENDENTLY (prefer a different guide than: \${JSON.stringify((authored && authored.sources) || [])}) with WebSearch + WebFetch on Game8 / Zelda Dungeon / IGN / Polygon.
Check EVERY claim: the opening, the dodge/parry/mount mechanic, what to Fuse, any required element (e.g. Frost Gleeok needs FIRE, Fire Gleeok needs ICE/frost, Mucktorok needs WATER/Splash Fruit, Colgera is fought while skydiving), weak spots, boss phase changes, the "cheese" option, and the named drops. Confirm it LEADS with what gear/food to bring. Confirm these are TotK mechanics not BotW. Confirm one plain-text paragraph (no markdown), ~400–900 chars, beginner-first, correct proper names, ends on the reward.
FIX errors in place; SOFTEN or REMOVE any claim you can't verify (don't ship a guess). Return the FINAL {name:"\${e.name}", battle:"<corrected paragraph>", tier:"\${e.tier}", tactic:"<refreshed one-liner>", drops:"\${(e.drops || "").replace(/"/g, "'")}", sources:[...], corrections:"<one line: what you changed, or 'no changes'>"}.\`;

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
return { basics: (basics && basics.cards) ? basics.cards : [], enemies: clean, total: clean.length, expected: MARQUEE.length, missing };
`;

fs.writeFileSync("/tmp/totk-battle-guides-workflow.mjs", body);
console.log(`wrote /tmp/totk-battle-guides-workflow.mjs (${body.length} bytes) · ${MARQUEE.length} marquee enemies`);
console.log("marquee:", MARQUEE.map((e) => e.name).join(", "));
