#!/usr/bin/env node
/* v14.2: generate the OoT "depth" Workflow — four sourced datasets in one run, bringing OoT up to par with the
   other games' reference tabs. All author→adversarially-verify, web-sourced (Zelda Dungeon OoT, IGN, StrategyWiki,
   Zeldapedia):
   (A) ITEMS & SONGS reference (Guide→Items)   → knowledge/oot/items-songs.json  (RUNES: {id,name,glyph,from,what,tip,kind})
   (B) ENEMIES — combat primer + boss guides   → knowledge/oot/bestiary.json     ({enemies:[{name,tier,tactic,drops,battle?}], basics:[{title,body}]})
   (C) GREAT FAIRIES (Guide→Fairies)           → knowledge/oot/great-fairies.json({fairies:[{name,region,location,cost}]})
   (D) SIDE QUESTS (Guide→Quests)              → knowledge/oot/side-quests.json  ({regions:[{region,quests:[{name,giver,location,reward,oneLine,how}]}]})
   Glyphs are from the app's Glyph() set. assemble-oot folds each overlay in + rebuilds guideSegs. */
import fs from "node:fs";

const body = `export const meta = {
  name: 'oot-depth',
  description: 'Author + verify OoT Items & Songs, Enemies (primer + boss guides), Great Fairies, and side quests',
  phases: [
    { title: 'Items', detail: 'the full Items & Songs reference' },
    { title: 'Enemies', detail: 'combat primer + bestiary + per-boss how-to-win guides' },
    { title: 'Fairies', detail: 'the Great Fairy fountains (magic & upgrades)' },
    { title: 'Quests', detail: 'side quests — trades, minigames, collectibles' },
  ],
};

const GLYPHS = "sword, shield, bow, bomb, bag, key, gem, eye, leaf, fairy, stasis, book";

/* ============ (A) ITEMS & SONGS ============ */
const RUNE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    entries: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string" }, name: { type: "string" },
        glyph: { type: "string", enum: ["sword","shield","bow","bomb","bag","key","gem","eye","leaf","fairy","stasis","book"] },
        from: { type: "string" }, what: { type: "string" }, tip: { type: "string" },
        kind: { type: "string", enum: ["item","song"] },
      },
      required: ["id","name","glyph","from","what","kind"],
    } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["entries"],
};
const itemsAuthor = \`Compile the ITEMS reference for an offline companion to The Legend of Zelda: OCARINA OF TIME (N64, 1998). Research with WebSearch + WebFetch (Zelda Dungeon OoT, IGN, StrategyWiki, Zeldapedia). List the ~22–28 KEY items/equipment/spells a player gets in the main game, each as a reference card. Include: Fairy Slingshot, Bombs, Bombchu, Fairy Bow + Fire/Ice/Light Arrows, Boomerang, Hookshot, Longshot, Megaton Hammer, Lens of Truth, Magic Beans, Din's Fire, Farore's Wind, Nayru's Love, Bottles (what they hold), Iron Boots, Hover Boots, Goron Tunic, Zora Tunic, Silver/Golden Gauntlets, Mirror Shield, Hylian Shield, Biggoron's Sword, the Hookshot/Longshot reach, and the Magic Meter. For EACH: id (kebab-case), name (exact), glyph (one of: \${GLYPHS} — pick the closest; spells→fairy, songs not here), from (where/how you get it), what (what it does), tip (a concrete use), kind:"item". Honesty law: only real OoT items; don't invent. Return {entries:[...], sources:[...]}.\`;
const songsAuthor = \`Compile the 12 OCARINA SONGS of The Legend of Zelda: OCARINA OF TIME (N64, 1998) as reference cards. Research with WebSearch + WebFetch (Zelda Dungeon/IGN/Zeldapedia). The six story/utility songs: Zelda's Lullaby, Saria's Song, Epona's Song, Sun's Song, Song of Time, Song of Storms. The six warp songs: Minuet of Forest, Bolero of Fire, Serenade of Water, Nocturne of Shadow, Requiem of Spirit, Prelude of Light. For EACH: id (kebab-case), name (exact), glyph:"stasis", from (who teaches it / where), what (its effect), tip (a key use), kind:"song". Honesty law: correct teachers/effects. Return {entries:[...], sources:[...]}.\`;
const runeVerify = (label, a) => \`Adversarially verify these OoT (N64, 1998) \${label} reference cards with an independent source (WebSearch + WebFetch, prefer a different guide than \${JSON.stringify((a && a.sources) || [])}). Confirm each name/effect/where-you-get-it is correct OoT (not Majora's Mask or another game); fix errors; add any obviously-missing key entry; keep glyphs in the allowed set (\${GLYPHS}); keep kind correct. Return {entries:[...], sources:[...], corrections:"<one line>"}.

To verify:
\${JSON.stringify((a && a.entries) || [], null, 1)}\`;

/* ============ (B) ENEMIES ============ */
const BESTIARY_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    enemies: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { name: { type: "string" }, tier: { type: "string", enum: ["common","mini-boss","boss"] }, tactic: { type: "string" }, drops: { type: "string" } },
      required: ["name","tier","tactic"],
    } },
    basics: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title","body"] } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["enemies"],
};
const BATTLE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { name: { type: "string" }, battle: { type: "string" }, tier: { type: "string" }, tactic: { type: "string" }, drops: { type: "string" }, sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" } },
  required: ["name","battle"],
};
const bestiaryAuthor = \`Build the bestiary + a Combat Basics primer for an offline OoT (N64, 1998) companion. Research with WebSearch + WebFetch (Zelda Dungeon/IGN/Zeldapedia).
(1) basics: EXACTLY 6 cards (title + 1–3 plain sentences) on the fundamentals a first-timer needs: "Z-Targeting" (lock on with Z to strafe, aim, and read the fight), "Shield & the Spin Attack" (hold R to block; hold B to charge a spin attack), "Bottles are clutch" (catch a fairy to auto-revive, bottle bugs/fish/Blue Fire), "Deku Nuts & Sticks" (nuts stun, lit sticks carry fire), "Bombs & arrows" (open walls, hit switches/eyes; Fire/Ice/Light Arrows), "Sun's Song & the Lens" (freeze ReDeads/flip time; Lens of Truth reveals invisible things).
(2) enemies: ~14–18 notable foes as {name, tier (common|mini-boss|boss), tactic (one line), drops}. Include the dungeon BOSSES (Queen Gohma, King Dodongo, Barinade, Phantom Ganon, Volvagia, Morpha, Bongo Bongo, Twinrova, Ganondorf, Ganon) as tier:"boss", a few mini-bosses (Stalfos, Iron Knuckle, Dark Link, Dead Hand) as tier:"mini-boss", and common foes (Stalchildren, ReDead, Lizalfos, Wolfos, Like Like, Keese, Skulltula) as tier:"common". Honesty law: real OoT enemies only. Return {enemies:[...], basics:[...6...], sources:[...]}.\`;
const bestiaryVerify = (a) => \`Adversarially verify this OoT (N64, 1998) bestiary + 6-card combat primer with an independent source (WebSearch + WebFetch). Confirm each enemy is real OoT with a correct one-line tactic and tier; confirm the 6 basics cards are accurate (Z-targeting, spin attack via held B, bottle/fairy revive, Deku nuts stun, arrows/bombs, Sun's Song freezes ReDeads + Lens reveals). Fix errors, drop fabrications, keep exactly 6 basics. Return {enemies:[...], basics:[...6...], sources:[...], corrections:"<one line>"}.

To verify:
\${JSON.stringify(a || {}, null, 1)}\`;

const BOSSES = [
  { name: "Queen Gohma", where: "Inside the Great Deku Tree" }, { name: "King Dodongo", where: "Dodongo's Cavern" },
  { name: "Barinade", where: "Inside Jabu-Jabu's Belly" }, { name: "Phantom Ganon", where: "Forest Temple" },
  { name: "Volvagia", where: "Fire Temple" }, { name: "Morpha", where: "Water Temple" },
  { name: "Bongo Bongo", where: "Shadow Temple" }, { name: "Twinrova", where: "Spirit Temple" },
  { name: "Dark Link", where: "Water Temple mini-boss" }, { name: "Iron Knuckle", where: "Spirit Temple mini-boss" },
  { name: "Ganondorf & Ganon", where: "Ganon's Castle — the final battle" },
];
const battleAuthor = (b) => \`Write the spoiler-gated "How to win this fight" guide for ONE enemy in The Legend of Zelda: OCARINA OF TIME (N64, 1998): \${b.name} (\${b.where}). Research with WebSearch + WebFetch (Zelda Dungeon/IGN/Zeldapedia) — read this exact fight before writing.
One flowing paragraph, second person, ~350–800 chars, plain text (no markdown): LEAD with what to bring (item/song/bottle the fight needs — e.g. Megaton Hammer for Volvagia, Longshot for Morpha, Mirror Shield for Twinrova, Light Arrows for Ganondorf, a fairy in a bottle as insurance), then the opening, the core loop (the Z-target dodge / weak-point / reflect pattern), and the finish. Honesty law: trace every claim to a source; correct OoT names. Return {name:"\${b.name}", battle:"<paragraph>", tier:"boss", tactic:"<one-line refreshed>", drops:"Heart Container", sources:[...]}.\`;
const battleVerify = (b, a) => \`Adversarially verify this OoT (N64, 1998) "\${b.name}" fight guide with an independent source (WebSearch + WebFetch). Confirm the required item/song, the weak point, and the winning pattern are correct OoT (e.g. King Dodongo = bomb in the mouth then roll-attack; Phantom Ganon = tennis the energy ball / arrow the real one; Morpha = Longshot the nucleus; Bongo Bongo = Lens to see + stun hands + hit eye; Twinrova = Mirror Shield reflect 3 same-element; Volvagia = Megaton Hammer; Ganon = Light Arrows + sword to the tail). Fix errors; remove guesses. Return {name:"\${b.name}", battle:"<corrected>", tier:"boss", tactic:"<one-line>", drops:"Heart Container", sources:[...], corrections:"<one line>"}.

To verify:
"\${(a && a.battle) || ""}"\`;

/* ============ (C) GREAT FAIRIES ============ */
const FAIRY_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    fairies: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, region: { type: "string" }, location: { type: "string" }, cost: { type: "string" } }, required: ["name","region","location","cost"] } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["fairies"],
};
const fairyAuthor = \`List the GREAT FAIRY FOUNTAINS of The Legend of Zelda: OCARINA OF TIME (N64, 1998). Research with WebSearch + WebFetch (Zelda Dungeon/IGN/Zeldapedia). There are several, each reached by bombing a cracked wall/boulder then playing a song (often Zelda's Lullaby/Song of Storms/Bolero); they grant a SPELL or an UPGRADE: Din's Fire (Hyrule Castle, child), Farore's Wind (Zora's Fountain), Nayru's Love (Desert Colossus / Spirit), the Magic Meter, Double Magic (Death Mountain Crater), and Double Defense (Ganon's Castle / Hyrule Castle as adult). For EACH: name (e.g. "Great Fairy of Magic"), region, location (concrete — the wall/boulder + which song), cost (what she GRANTS, e.g. "Grants Din's Fire — bomb the wall behind Hyrule Castle and play Zelda's Lullaby"). Honesty law: confirm each fountain's spell/upgrade and how to open it. Return {fairies:[...], sources:[...]}.\`;
const fairyVerify = (a) => \`Adversarially verify these OoT (N64, 1998) Great Fairy Fountains with an independent source (WebSearch + WebFetch). Confirm each location, the song/bomb to open it, and the exact spell/upgrade it grants (Din's Fire / Farore's Wind / Nayru's Love / Magic Meter / Double Magic / Double Defense). Fix errors, drop fabrications. Return {fairies:[...], sources:[...], corrections:"<one line>"}.

To verify:
\${JSON.stringify((a && a.fairies) || [], null, 1)}\`;

/* ============ (D) SIDE QUESTS ============ */
const SQ_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    region: { type: "string" },
    quests: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, giver: { type: "string" }, location: { type: "string" }, reward: { type: "string" }, oneLine: { type: "string" }, how: { type: "string" } }, required: ["name","reward","oneLine","how"] } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["region","quests"],
};
const SQ_GROUPS = [
  { region: "Big Trades & the Biggoron Sword", scope: "the adult trading sequence that ends in Biggoron's Sword (Pocket Egg → Cojiro → Odd Mushroom → Odd Potion → Poacher's Saw → Broken Goron's Sword → Prescription → Eyeball Frog → Eyedrops → Claim Check → Biggoron's Sword), plus the child trade for the Mask/Zelda items if relevant. Each timed leg is a quest entry." },
  { region: "Collectibles & Trackers", scope: "the 100 Gold Skulltulas (the Cursed Family in the House of Skulltula in Kakariko + the tier rewards), the 36 Pieces of Heart (overview of where to hunt them), the Big Poes for the Poe Collector at the castle, and the Magic Bean planting spots." },
  { region: "Minigames & Side Spots", scope: "Bombchu Bowling, the Treasure Chest Game, Dampé's Heart-Pounding Gravedigging race (Hookshot), the Horseback Archery / Epona obstacle course at Lon Lon Ranch, the Gerudo's Training Ground / archery, the Fishing Pond, the Lost Dog (Richard), the Cucco lady's hens, the Happy Mask Shop mask-selling sidequest, and the Skull Kid / Scarecrow's Song." },
];
const sqAuthor = (grp) => \`List the OoT (N64, 1998) SIDE QUESTS in this group for an offline companion: "\${grp.region}". Scope: \${grp.scope}
Research with WebSearch + WebFetch (Zelda Dungeon/IGN/Zeldapedia). For EACH quest: name (exact), giver (who/where), location (area), reward (item/outcome), oneLine (one sentence), how (a spoiler-gated, concrete 1–3 sentence how-to). Honesty law: real OoT side content only; exact names. Return {region:"\${grp.region}", quests:[...], sources:[...]}.\`;
const sqVerify = (grp, a) => \`Adversarially verify this OoT (N64, 1998) side-quest group "\${grp.region}" with an independent source (WebSearch + WebFetch). Confirm each is real OoT side content with a correct giver/reward and an accurate how-to (esp. the Biggoron trade order + which legs are timed; the Gold Skulltula reward tiers; the Big Poe count). Fix errors, add any obviously-missing one, drop fabrications. Return {region:"\${grp.region}", quests:[...], sources:[...], corrections:"<one line>"}.

To verify:
\${JSON.stringify((a && a.quests) || [], null, 1)}\`;

/* ============ run ============ */
phase("Items");
const itemStreams = await parallel([
  () => agent(itemsAuthor, { label: "author:items", phase: "Items", schema: RUNE_SCHEMA }).then((a) => a ? agent(runeVerify("ITEMS", a), { label: "verify:items", phase: "Items", schema: RUNE_SCHEMA }) : null),
  () => agent(songsAuthor, { label: "author:songs", phase: "Items", schema: RUNE_SCHEMA }).then((a) => a ? agent(runeVerify("SONGS", a), { label: "verify:songs", phase: "Items", schema: RUNE_SCHEMA }) : null),
]);
const runeEntries = itemStreams.filter(Boolean).flatMap((r) => r.entries || []);
log("Items & Songs: " + runeEntries.length + " cards");

phase("Enemies");
let bestiary = await agent(bestiaryAuthor, { label: "author:bestiary", phase: "Enemies", schema: BESTIARY_SCHEMA });
if (bestiary) bestiary = await agent(bestiaryVerify(bestiary), { label: "verify:bestiary", phase: "Enemies", schema: BESTIARY_SCHEMA }) || bestiary;
const battles = await pipeline(
  BOSSES,
  (b) => agent(battleAuthor(b), { label: "author:" + b.name, phase: "Enemies", schema: BATTLE_SCHEMA }),
  (a, b) => a ? agent(battleVerify(b, a), { label: "verify:" + b.name, phase: "Enemies", schema: BATTLE_SCHEMA }) : null,
);
const cleanBattles = battles.filter(Boolean).filter((r) => r && r.battle);
log("Enemies: " + ((bestiary && bestiary.enemies) ? bestiary.enemies.length : 0) + " listed, " + cleanBattles.length + " boss guides, " + ((bestiary && bestiary.basics) ? bestiary.basics.length : 0) + " basics");

phase("Fairies");
let fairies = await agent(fairyAuthor, { label: "author:fairies", phase: "Fairies", schema: FAIRY_SCHEMA });
if (fairies) fairies = await agent(fairyVerify(fairies), { label: "verify:fairies", phase: "Fairies", schema: FAIRY_SCHEMA }) || fairies;
log("Great Fairies: " + ((fairies && fairies.fairies) ? fairies.fairies.length : 0));

phase("Quests");
const sqResults = await pipeline(
  SQ_GROUPS,
  (grp) => agent(sqAuthor(grp), { label: "author:" + grp.region, phase: "Quests", schema: SQ_SCHEMA }),
  (a, grp) => a ? agent(sqVerify(grp, a), { label: "verify:" + grp.region, phase: "Quests", schema: SQ_SCHEMA }) : null,
);
const sqClean = sqResults.filter(Boolean).filter((r) => r && (r.quests || []).length);
log("Side quests: " + sqClean.reduce((n, g) => n + g.quests.length, 0) + " across " + sqClean.length + " groups");

return {
  items: runeEntries,
  bestiary: { enemies: (bestiary && bestiary.enemies) || [], basics: (bestiary && bestiary.basics) || [] },
  battles: cleanBattles,
  fairies: (fairies && fairies.fairies) || [],
  sideQuests: sqClean,
};
`;

fs.writeFileSync("/tmp/oot-depth-workflow.mjs", body);
console.log(`wrote /tmp/oot-depth-workflow.mjs (${body.length} bytes)`);
