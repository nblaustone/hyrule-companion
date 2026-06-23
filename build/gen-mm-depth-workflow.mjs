#!/usr/bin/env node
/* v15: generate the Majora's Mask "depth" Workflow — four sourced datasets in one run, bringing MM up to par with
   the other games' reference tabs. All author→adversarially-verify, web-sourced (Zelda Dungeon MM, Thonky MM, IGN,
   StrategyWiki, Zeldapedia):
   (A) MASKS & SONGS reference (Guide→Masks)   → knowledge/mm/items-songs.json  (RUNES: {id,name,glyph,from,what,tip,kind})
   (B) ENEMIES — combat primer + boss guides   → knowledge/mm/bestiary.json     ({enemies:[{name,tier,tactic,drops,battle?}], basics:[...6...]})
   (C) GREAT FAIRIES (Guide→Fairies)           → knowledge/mm/great-fairies.json({fairies:[{name,region,location,cost}]})
   (D) SIDE QUESTS (Guide→Quests)              → knowledge/mm/side-quests.json  ({regions:[{region,quests:[{name,giver,location,reward,oneLine,how}]}]})
   Glyphs are from the app's Glyph() set. assemble-mm folds each overlay in + rebuilds guideSegs. Mirrors gen-oot-depth. */
import fs from "node:fs";

const body = `export const meta = {
  name: 'mm-depth',
  description: 'Author + verify Majora\\'s Mask Masks & Songs, Enemies (primer + boss guides), Great Fairies, and side quests',
  phases: [
    { title: 'Masks', detail: 'the full Masks & Songs & items reference' },
    { title: 'Enemies', detail: 'combat primer + bestiary + per-boss how-to-win guides' },
    { title: 'Fairies', detail: 'the Great Fairy fountains (magic & sword upgrades)' },
    { title: 'Quests', detail: 'the Bombers\\' Notebook, Anju-Kafei, ranch, masks, minigames' },
  ],
};

const GLYPHS = "mask, stasis, sword, shield, bow, bomb, bag, key, gem, heart, leaf, fairy";
const GLYPH_ENUM = ["mask","stasis","sword","shield","bow","bomb","bag","key","gem","heart","leaf","fairy"];

/* ============ (A) MASKS & SONGS & ITEMS ============ */
const RUNE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    entries: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string" }, name: { type: "string" },
        glyph: { type: "string", enum: GLYPH_ENUM },
        from: { type: "string" }, what: { type: "string" }, tip: { type: "string" },
        kind: { type: "string", enum: ["mask","song","item"] },
      },
      required: ["id","name","glyph","from","what","kind"],
    } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["entries"],
};
const masksAuthor1 = \`Compile reference cards for the FOUR TRANSFORMATION MASKS plus the first batch of regular masks in The Legend of Zelda: MAJORA'S MASK (N64, 2000). Research with WebSearch + WebFetch (Zelda Dungeon MM, Thonky MM, IGN, Zeldapedia). Cover EXACTLY these 12 masks: Deku Mask, Goron Mask, Zora Mask, Fierce Deity's Mask, Bremen Mask, Bunny Hood, Keaton Mask, Postman's Hat, All-Night Mask, Blast Mask, Stone Mask, Great Fairy's Mask. For EACH: id (kebab-case), name (EXACT), glyph:"mask", from (where/how you get it — who you help or where it's found), what (the ability it grants or who it affects), tip (a concrete use), kind:"mask". For the transformation masks be specific about each form's moves. Honesty law: real MM masks only; the Fierce Deity's Mask is won by giving the 20 regular masks to the Moon Children and works only in boss rooms. Return {entries:[...], sources:[...]}.\`;
const masksAuthor2 = \`Compile reference cards for the SECOND batch of regular masks in The Legend of Zelda: MAJORA'S MASK (N64, 2000). Research with WebSearch + WebFetch (Zelda Dungeon MM, Thonky MM, IGN, Zeldapedia). Cover EXACTLY these 12 masks: Don Gero's Mask, Mask of Scents, Romani's Mask, Circus Leader's Mask, Kafei's Mask, Couple's Mask, Mask of Truth, Kamaro's Mask, Garo's Mask, Captain's Hat, Gibdo Mask, Giant's Mask. For EACH: id (kebab-case), name (EXACT), glyph:"mask", from (where/how you get it — who you help / which quest), what (the ability it grants or who it affects), tip (a concrete use), kind:"mask". Honesty law: real MM masks only; e.g. Giant's Mask is found in Stone Tower Temple and is used on Twinmold; Couple's Mask comes from completing the Anju & Kafei reunion. Return {entries:[...], sources:[...]}.\`;
const songsAuthor = \`Compile the OCARINA SONGS of The Legend of Zelda: MAJORA'S MASK (N64, 2000) as reference cards. Research with WebSearch + WebFetch (Zelda Dungeon/Thonky/IGN/Zeldapedia). Cover these songs: Song of Time, Inverted Song of Time (slows time), Song of Double Time (skips ahead), Song of Healing, Song of Soaring (warp between owl statues), Song of Storms, Sonata of Awakening, Goron's Lullaby, New Wave Bossa Nova, Elegy of Emptiness, Oath to Order, Epona's Song, and the Scarecrow's Song. For EACH: id (kebab-case), name (EXACT), glyph:"stasis", from (who teaches it / where), what (its effect), tip (a key use), kind:"song". Honesty law: correct teachers/effects (e.g. Sonata of Awakening = the caged monkey at the Deku Palace; Goron's Lullaby = the Goron Elder & his baby; New Wave Bossa Nova = the hatched Zora eggs; Elegy of Emptiness = Igos du Ikana; Inverted Song of Time = play the Song of Time backwards, taught by the Scarecrow). Return {entries:[...], sources:[...]}.\`;
const itemsAuthor = \`Compile the KEY ITEMS & EQUIPMENT reference for an offline companion to The Legend of Zelda: MAJORA'S MASK (N64, 2000). Research with WebSearch + WebFetch (Zelda Dungeon/Thonky/IGN/Zeldapedia). List the ~18-24 main items/weapons: Ocarina of Time, Hero's Bow, Fire Arrows, Ice Arrows, Light Arrows, Hookshot, Bombs (Bomb Bag), Bombchu, Powder Keg, Lens of Truth, Magic Beans, Pictograph Box, Bottles (and what they hold — Red/Blue/Green Potion, a fairy, Chateau Romani, Hot Spring Water, a Zora Egg, etc.), Great Fairy's Sword, Kokiri Sword, Razor Sword, Gilded Sword, Hero's Shield, Mirror Shield, the Adult/Giant's Wallet, and Quiver/Bomb Bag upgrades. For EACH: id (kebab-case), name (EXACT), glyph (one of: \${GLYPHS} — bow/arrows→bow, bombs/bombchu/powder keg→bomb, swords→sword, shields→shield, ocarina→stasis, potions/bottle/wallet/misc→bag, magic beans→leaf), from (where/how), what (what it does), tip (a concrete use), kind:"item". Honesty law: real MM items only; the Razor Sword and Gilded Sword are forged at the Mountain Smithy; the Razor Sword reverts after 100 hits / on a Song-of-Time reset. Return {entries:[...], sources:[...]}.\`;
const runeVerify = (label, a) => \`Adversarially verify these Majora's Mask (N64, 2000) \${label} reference cards with an independent source (WebSearch + WebFetch, prefer a different guide than \${JSON.stringify((a && a.sources) || [])}). Confirm each name/effect/where-you-get-it is correct MAJORA'S MASK (not Ocarina of Time or another Zelda); fix errors; keep glyphs in the allowed set (\${GLYPHS}); keep kind correct (mask|song|item). Return {entries:[...], sources:[...], corrections:"<one line>"}.

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
const bestiaryAuthor = \`Build the bestiary + a Combat Basics primer for an offline Majora's Mask (N64, 2000) companion. Research with WebSearch + WebFetch (Zelda Dungeon/Thonky/IGN/Zeldapedia).
(1) basics: EXACTLY 6 cards (title + 1-3 plain sentences) on the fundamentals a first-timer needs: "Z-Targeting" (lock on with Z/L to strafe, aim, and read the fight), "Three forms, three fighters" (Deku spins & shoots bubbles & flies from flowers; Goron rolls into a spiked ball & ground-pounds; Zora swims, throws fin-boomerangs, and raises an electric barrier — switch masks for the right tool), "Shield, dodge & spin attack" (hold R to block; backflip/side-hop to dodge; hold B to charge a spin attack), "Bottles & magic" (a bottled fairy revives you; potions refill hearts/magic; Chateau Romani grants unlimited magic for a cycle), "Deku Nuts & elemental arrows" (Deku Nuts stun; Fire Arrows melt ice, Ice Arrows freeze water into platforms, Light Arrows stun the cursed dead), "Beat the clock" (try to clear a temple in one three-day cycle; the Inverted Song of Time slows time; the Fierce Deity's Mask crushes boss rooms).
(2) enemies: ~16-20 notable foes as {name, tier (common|mini-boss|boss), tactic (one line), drops}. Include the four temple BOSSES (Odolwa, Goht, Gyorg, Twinmold) and the final boss Majora (Mask/Incarnation/Wrath) as tier:"boss"; mini-bosses (Gekko, Wizzrobe, Wart, Gomess, Garo Master, Dinolfos, Igos du Ikana) as tier:"mini-boss"; and common foes (ChuChu, Dexihand, Real Bombchu, ReDead, Gibdo, Stalchild, Keese, Octorok, Like Like, Skulltula, Leever, Eeno) as tier:"common". Honesty law: real MM enemies only. Return {enemies:[...], basics:[...6...], sources:[...]}.\`;
const bestiaryVerify = (a) => \`Adversarially verify this Majora's Mask (N64, 2000) bestiary + 6-card combat primer with an independent source (WebSearch + WebFetch). Confirm each enemy is real MM with a correct one-line tactic and tier; confirm the 6 basics cards are accurate (Z-targeting; the three transformation forms' moves; block/dodge/spin; bottle/fairy revive + Chateau Romani; Deku Nuts + Fire/Ice/Light Arrows; three-day clock + Inverted Song of Time + Fierce Deity). Fix errors, drop fabrications, keep exactly 6 basics. Return {enemies:[...], basics:[...6...], sources:[...], corrections:"<one line>"}.

To verify:
\${JSON.stringify(a || {}, null, 1)}\`;

const BOSSES = [
  { name: "Odolwa", where: "Woodfall Temple — the masked jungle warrior" },
  { name: "Goht", where: "Snowhead Temple — the mechanical bull" },
  { name: "Gyorg", where: "Great Bay Temple — the giant masked fish" },
  { name: "Twinmold", where: "Stone Tower Temple — twin giant sand serpents (use the Giant's Mask)" },
  { name: "Majora", where: "inside the Moon — the final battle (Majora's Mask → Majora's Incarnation → Majora's Wrath)" },
  { name: "Gekko", where: "Woodfall & Snowhead mini-boss (rides a Snapper / a Mad Scrub)" },
  { name: "Wart", where: "Great Bay Temple mini-boss — a big eyeball guarded by Bio Babas" },
  { name: "Igos du Ikana", where: "Ikana Castle — the ghost king who teaches the Elegy of Emptiness" },
];
const battleAuthor = (b) => \`Write the spoiler-gated "How to win this fight" guide for ONE enemy in The Legend of Zelda: MAJORA'S MASK (N64, 2000): \${b.name} (\${b.where}). Research with WebSearch + WebFetch (Zelda Dungeon/Thonky/IGN/Zeldapedia) — read this exact fight before writing.
One flowing paragraph, second person, ~350-800 chars, plain text (no markdown): LEAD with what to bring and which FORM/mask the fight needs (e.g. Goron Mask + magic for Goht's spiked roll; the Giant's Mask for Twinmold; the Fierce Deity's Mask or Light Arrows for Majora; a bottled fairy as insurance), then the opening, the core loop (the Z-target dodge / weak-point / which-form pattern), and the finish. If a boss has multiple phases (esp. Majora), cover each. Honesty law: trace every claim to a source; correct MM names. Return {name:"\${b.name}", battle:"<paragraph>", tier:"\${b.name === 'Gekko' || b.name === 'Wart' || b.name === 'Igos du Ikana' ? 'mini-boss' : 'boss'}", tactic:"<one-line refreshed>", drops:"\${b.name === 'Gekko' || b.name === 'Wart' || b.name === 'Igos du Ikana' ? 'Varies' : 'Heart Container + Remains'}", sources:[...]}.\`;
const battleVerify = (b, a) => \`Adversarially verify this Majora's Mask (N64, 2000) "\${b.name}" fight guide with an independent source (WebSearch + WebFetch). Confirm the required mask/form/item, the weak point, and the winning pattern are correct MM (e.g. Odolwa = stun with arrows/Deku Nuts then slash; Goht = spiked Goron roll into it or Fire Arrows; Gyorg = arrows when it leaps then Zora-attack underwater; Twinmold = Giant's Mask to grapple/punch; Majora = Fierce Deity's Mask or Light Arrows + sword across its three forms; Igos du Ikana = reflect light with the Mirror Shield). Fix errors; remove guesses. Return {name:"\${b.name}", battle:"<corrected>", tier:"<tier>", tactic:"<one-line>", drops:"<drops>", sources:[...], corrections:"<one line>"}.

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
const fairyAuthor = \`List the GREAT FAIRY FOUNTAINS of The Legend of Zelda: MAJORA'S MASK (N64, 2000). Research with WebSearch + WebFetch (Zelda Dungeon/Thonky/IGN/Zeldapedia). There are FIVE: the Great Fairy of Magic in North Clock Town (restored with the 1 stray fairy hidden in Clock Town — grants Magic Power, and gives the Great Fairy's Mask used to gather Stray Fairies), plus one Great Fairy at each of the four temples (Woodfall/Southern Swamp, Snowhead/Mountains, Great Bay, Ikana/Stone Tower), each restored by returning all 15 of that temple's STRAY FAIRIES and granting a reward (the upgrades are: Magic Power, the Great Spin Attack / Spin-Attack upgrade, the extended/double Magic Power, and the GREAT FAIRY'S SWORD). For EACH: name (e.g. "Great Fairy of Magic"), region, location (concrete — where the fountain is + that it needs N stray fairies), cost (what she GRANTS — be exact about which reward goes with which fountain; verify it). Honesty law: confirm each fountain's exact reward. Return {fairies:[...], sources:[...]}.\`;
const fairyVerify = (a) => \`Adversarially verify these Majora's Mask (N64, 2000) Great Fairy Fountains with an independent source (WebSearch + WebFetch). Confirm there are five fountains, the number of Stray Fairies each needs (1 in Clock Town, 15 per temple), and the EXACT reward each grants (Magic Power, Great Spin Attack, Double Magic Power, Great Fairy's Sword, and the Great Fairy's Mask). Fix errors, drop fabrications. Return {fairies:[...], sources:[...], corrections:"<one line>"}.

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
  { region: "The Bombers' Notebook & Anju–Kafei", scope: "the BOMBERS' NOTEBOOK (how you join the Bombers' secret society — the hide-and-seek / the code — and what the Notebook tracks), and the famous three-day ANJU & KAFEI reunion that runs across all three days (Kafei was turned into a child and his Sun's Mask stolen by Sakon the thief; the Curiosity Shop, the Letter to Kafei, the Pendant of Memories, Anju's choice, and the COUPLE'S MASK reward). Plus the Postman's delivery schedule (Postman's Hat) and Madame Aroma / the Mayor's office threads. Each is a quest entry with the timing and a concrete how-to." },
  { region: "Romani Ranch & Milk Road", scope: "the Romani Ranch quests: defending the ranch barn from Them (the alien Ghosts) on the night of the First Day with Romani's bow practice (reward ROMANI'S MASK / saving Epona), escorting Cremia's milk wagon past the Gorman Brothers on the Second Day (Milk Bar access), the Gorman Brothers' horse race (GARO'S MASK), the Milk Bar 'Latte' show + Kamaro's dance, and Chateau Romani (unlimited magic for a cycle). Each a quest entry with timing + how-to." },
  { region: "The 20 Masks of Termina", scope: "how to EARN each of the 20 regular (non-transformation) masks — Postman's Hat, All-Night Mask, Blast Mask, Stone Mask, Great Fairy's Mask, Keaton Mask, Bremen Mask, Bunny Hood, Don Gero's Mask, Mask of Scents, Romani's Mask, Circus Leader's Mask, Kafei's Mask, Couple's Mask, Mask of Truth, Kamaro's Mask, Garo's Mask, Captain's Hat, Gibdo Mask, Giant's Mask. For EACH: name (exact), giver (who/where), location (region), reward (the mask + what it's used for), oneLine, and a concrete how-to. (Collecting all 20 → the Fierce Deity's Mask from the Moon Children.) These can be terse but each must be its own entry." },
  { region: "Minigames & Collectibles", scope: "Termina's minigames and collectibles: the Town Shooting Gallery & Swamp Shooting Gallery, Honey & Darling's games, the Swordsman's School, the Deku Scrub Playground, the Boat Cruise pictograph, the Treasure Chest Shop, the Clock Town BANK (rupee savings that survive Song-of-Time resets), the Beaver Brothers' race, the Goron & Zora racing/minigames, plus an overview of the 52 PIECES OF HEART and the 15-Stray-Fairies-per-temple collection. Each a quest entry with reward + how-to." },
];
const sqAuthor = (grp) => \`List the Majora's Mask (N64, 2000) SIDE QUESTS in this group for an offline companion: "\${grp.region}". Scope: \${grp.scope}
Research with WebSearch + WebFetch (Zelda Dungeon/Thonky/IGN/Zeldapedia). For EACH quest: name (exact), giver (who/where), location (area), reward (item/outcome), oneLine (one sentence), how (a spoiler-gated, concrete 1-3 sentence how-to that includes WHICH day/time it happens when timing matters). Honesty law: real MM side content only; exact names. Return {region:"\${grp.region}", quests:[...], sources:[...]}.\`;
const sqVerify = (grp, a) => \`Adversarially verify this Majora's Mask (N64, 2000) side-quest group "\${grp.region}" with an independent source (WebSearch + WebFetch). Confirm each is real MM side content with a correct giver/reward and an accurate how-to (esp. the Anju-Kafei timeline across the three days and the Couple's Mask; the Romani Ranch alien-defense + Cremia escort timing; that each of the 20 masks is earned the way stated; the Bank surviving resets). Fix errors, add any obviously-missing one, drop fabrications. Return {region:"\${grp.region}", quests:[...], sources:[...], corrections:"<one line>"}.

To verify:
\${JSON.stringify((a && a.quests) || [], null, 1)}\`;

/* ============ run ============ */
phase("Masks");
const itemStreams = await parallel([
  () => agent(masksAuthor1, { label: "author:masks-1", phase: "Masks", schema: RUNE_SCHEMA }).then((a) => a ? agent(runeVerify("transformation + regular MASKS (batch 1)", a), { label: "verify:masks-1", phase: "Masks", schema: RUNE_SCHEMA }) : null),
  () => agent(masksAuthor2, { label: "author:masks-2", phase: "Masks", schema: RUNE_SCHEMA }).then((a) => a ? agent(runeVerify("regular MASKS (batch 2)", a), { label: "verify:masks-2", phase: "Masks", schema: RUNE_SCHEMA }) : null),
  () => agent(songsAuthor, { label: "author:songs", phase: "Masks", schema: RUNE_SCHEMA }).then((a) => a ? agent(runeVerify("SONGS", a), { label: "verify:songs", phase: "Masks", schema: RUNE_SCHEMA }) : null),
  () => agent(itemsAuthor, { label: "author:items", phase: "Masks", schema: RUNE_SCHEMA }).then((a) => a ? agent(runeVerify("ITEMS", a), { label: "verify:items", phase: "Masks", schema: RUNE_SCHEMA }) : null),
]);
const runeEntries = itemStreams.filter(Boolean).flatMap((r) => r.entries || []);
log("Masks & Songs & Items: " + runeEntries.length + " cards");

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

fs.writeFileSync("/tmp/mm-depth-workflow.mjs", body);
console.log(`wrote /tmp/mm-depth-workflow.mjs (${body.length} bytes)`);
