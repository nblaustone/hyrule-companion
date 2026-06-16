#!/usr/bin/env node
/* Assemble the verified research (knowledge/regions.json + globals.json) into the clean,
   exactly-120 datasets the app inlines: shrines, towers, great-fairies, side-quests, +
   the global references (armor, bestiary, cooking, koroks, world).
   Fixes applied (all traceable to the completeness audit + the web-verified desert pass):
   - split the duplicated desert into Gerudo Highlands (Gerudo Tower, 6) + Gerudo Desert
     (Wasteland Tower, 12), adding the 6 missing Highlands shrines + the missing Gerudo Tower;
   - drop Shira Gomar (a Champions' Ballad DLC shrine, not base-game) from Hyrule Ridge;
   - move Mozo Shenno to Hebra only (Tabantha = 6);
   - clean 3 desert hints the verifier flagged as uncertain. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const K = (f) => join(ROOT, "knowledge", f);
const regions = JSON.parse(fs.readFileSync(K("regions.json"), "utf8"));
const globals = JSON.parse(fs.readFileSync(K("globals.json"), "utf8"));
const byKey = Object.fromEntries(regions.map((r) => [r.regionKey, r]));

// clean display names + canonical order (loose player-progression / geographic tour)
const ORDER = [
  ["great_plateau", "Great Plateau"], ["dueling-peaks", "Dueling Peaks"], ["hateno", "Hateno"],
  ["lanayru", "Lanayru"], ["lake", "Lake Hylia"], ["faron", "Faron"], ["central_hyrule", "Central Hyrule"],
  ["ridgeland", "Hyrule Ridge"], ["tabantha", "Tabantha"], ["hebra", "Hebra"],
  ["woodland", "Great Hyrule Forest"], ["eldin", "Eldin"], ["akkala", "Akkala"],
  ["gerudo", "Gerudo Highlands"], ["wasteland", "Gerudo Desert"],
];

// --- the web-verified desert split (from the fix agent), hints cleaned where flagged ---
const GERUDO_HIGHLANDS = [
  { name: "Sasa Kai Shrine", location: "Gerudo Highlands, southeast of Gerudo Tower", category: "combat", oneLine: "Sign of the Shadow: talk to Kass atop Gerudo Tower, then between 3–4PM stand on the pedestal SE of the tower and shoot an arrow at the sun.", shrineQuest: "Sign of the Shadow" },
  { name: "Joloo Nah Shrine", location: "Gerudo Highlands, buried on Mount Nabooru", category: "puzzle", oneLine: "Unearthed via the Test of Will quest. Inside, use motion controls to roll the cube and light every torch while dodging water spouts.", shrineQuest: "Test of Will" },
  { name: "Keeha Yoog Shrine", location: "Gerudo Highlands, above Vatorsa Snowfield east of Gerudo Summit", category: "blessing", oneLine: "Cliffside Etchings: Geggle at Tabantha Bridge Stable points out a thunderbolt etching — ride the updraft and hit it with a Shock Arrow.", shrineQuest: "Cliffside Etchings" },
  { name: "Kema Kosassa Shrine", location: "Gerudo Highlands, western end of Risoka Snowfield", category: "combat", oneLine: "A Major Test of Strength — a Guardian Scout IV rises from the floor. Bring strong weapons and cold protection (Snowquill).", shrineQuest: null },
  { name: "Kuh Takkar Shrine", location: "Gerudo Highlands, Vatorsa Snowfield at the base of Laparoh Mesa", category: "puzzle", oneLine: "The shrine is sealed in ice — melt it with any fire (Fire Arrow, torch, red-Chuchu jelly), then solve the ice-block puzzle inside.", shrineQuest: null },
  { name: "Sho Dantu Shrine", location: "Gerudo Highlands, along Karusa Valley", category: "mixed", oneLine: "A pedestal asks for a shining blue stone — break the nearby luminous-stone deposits and place a Luminous Stone on it to raise the shrine.", shrineQuest: null },
];
const GERUDO_DESERT = [
  { name: "Daqo Chisay Shrine", location: "Gerudo Desert, just outside the gate of Gerudo Town", category: "puzzle", oneLine: "The Whole Picture: use Magnesis to lift and slot the metal panels so the wall image lines up, opening the path.", shrineQuest: null },
  { name: "Kay Noh Shrine", location: "Gerudo Desert, north of Gerudo Town near the Great Cliffs", category: "puzzle", oneLine: "Power of Electricity: chain the electrical orb and wires to power the gates and the launch mechanism to the altar.", shrineQuest: null },
  { name: "Jee Noh Shrine", location: "Gerudo Desert, east of Gerudo Town near Daqa Koh", category: "puzzle", oneLine: "On the Move: ride the moving platforms, using Stasis and timing to cross the gaps to the chest and monk.", shrineQuest: null },
  { name: "Hawa Koth Shrine", location: "Gerudo Desert, far southwest near the Great Fairy Fountain (Tera)", category: "puzzle", oneLine: "The Current Solution: route the rolling spheres and electric currents to power each gate in sequence.", shrineQuest: null },
  { name: "Misae Suma Shrine", location: "Gerudo Desert, revealed inside Gerudo Town", category: "blessing", oneLine: "A free blessing unlocked by helping out in Gerudo Town (cure Pokki's stomach trouble) — finish the errand, then claim the orb.", shrineQuest: null },
  { name: "Raqa Zunzo Shrine", location: "Gerudo Desert, far east near the East Gerudo Ruins", category: "blessing", oneLine: "Win the sand-seal race out on the eastern dunes (beat the target time) to reveal this blessing shrine.", shrineQuest: null },
  { name: "Dako Tah Shrine", location: "Gerudo Desert, southwest near the Seven Heroines", category: "quest", oneLine: "Electric Path: revealed via The Eye of the Sandstorm (Nobiro, Kara Kara Bazaar). Inside, guide the moving electric orb to power the gates.", shrineQuest: "The Eye of the Sandstorm" },
  { name: "Korsh O'hu Shrine", location: "Gerudo Desert, at the Seven Heroines statues", category: "quest", oneLine: "The Seven Heroines: read each statue's missing symbol and place the matching orbs on the correct pedestals.", shrineQuest: "The Seven Heroines" },
  { name: "Kema Zoos Shrine", location: "Gerudo Desert, northwest by the Statue of the Eighth Heroine", category: "puzzle", oneLine: "A Delayed Puzzle: face the swordswomen statues' pointing direction and time the launch ramp/ball to reach the altar.", shrineQuest: null },
  { name: "Dila Maag Shrine", location: "Gerudo Desert, center of the South Lomei Labyrinth (East Barrens)", category: "quest", oneLine: "The Desert Labyrinth: navigate the maze to its core for the blessing (the Barbarian Helm is nearby).", shrineQuest: "The Desert Labyrinth" },
  { name: "Suma Sahma Shrine", location: "Gerudo Desert, southeast corner just south of Mount Granajh", category: "quest", oneLine: "Secret of the Snowy Peaks: read the Mountain Peak Log, then at ~4PM follow the cold shadow cast on the peak to dig out the shrine.", shrineQuest: "Secret of the Snowy Peaks" },
  { name: "Tho Kayu Shrine", location: "Gerudo Desert, eastern dunes near the East Gerudo Ruins", category: "puzzle", oneLine: "Light all four unlit torches scattered around the buried site to make the shrine rise from the sand.", shrineQuest: null },
];

const GERUDO_TOWER = { name: "Gerudo Tower", location: "On a tall spire in the Gerudo Highlands northeast of Gerudo Town, its base wrapped in thorns.", climbTip: "Burn the thorns at the base (Fire Arrow, torch, or a Bomb) before climbing, or paraglide in from the higher cliffs to the east." };
const TERA = byKey.wasteland?.greatFairy || byKey.gerudo?.greatFairy ||
  { name: "Great Fairy Tera", location: "Inside the rib cage of the Gerudo Great Skeleton, far southwest of the Gerudo Desert.", unlockCost: "10,000 rupees" };

// --- build the clean per-region shrine groups ---
function shrinesFor(key) {
  if (key === "gerudo") return GERUDO_HIGHLANDS;
  if (key === "wasteland") return GERUDO_DESERT;
  let list = (byKey[key]?.shrines || []).map((s) => ({ name: s.name, location: s.location, category: s.category, oneLine: s.oneLine, shrineQuest: s.shrineQuest || null }));
  if (key === "ridgeland") list = list.filter((s) => !/^Shira Gomar/.test(s.name)); // DLC, not base-game
  if (key === "tabantha") list = list.filter((s) => !/^Mozo Shenno/.test(s.name));   // belongs to Hebra
  return list;
}
function towerFor(key) {
  if (key === "gerudo") return GERUDO_TOWER;
  if (key === "wasteland") return byKey.wasteland?.tower || byKey.gerudo?.tower;
  return byKey[key]?.tower;
}

const shrineGroups = ORDER.map(([key, name]) => ({ regionKey: key, regionName: name, shrines: shrinesFor(key) }));

// --- derive towers (15), great fairies (4), side quests (grouped, deduped) ---
const towers = ORDER.map(([key, name]) => ({ region: name, ...towerFor(key) }));
const fairyMap = new Map();
for (const [key, name] of ORDER) {
  const f = key === "wasteland" ? TERA : key === "gerudo" ? null : byKey[key]?.greatFairy;
  if (f) { const nm = f.name.replace(/^Great Fairy\s+/i, "").trim(); if (!fairyMap.has(nm)) fairyMap.set(nm, { name: nm, region: name, location: f.location, cost: f.unlockCost }); }
}
const fairies = [...fairyMap.values()];
const sideQuests = ORDER.map(([key, name]) => {
  let sq = byKey[key]?.sideQuests || [];
  if (key === "wasteland" || key === "gerudo") { // merge + dedup the two old desert regions' quests
    const seen = new Set(); sq = [...(byKey.gerudo?.sideQuests || []), ...(byKey.wasteland?.sideQuests || [])]
      .filter((q) => { const k = q.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    if (key === "gerudo") sq = []; // attribute the desert quests to the Desert group only
  }
  return { region: name, quests: sq.map((q) => ({ name: q.name, giver: q.giver, reward: q.reward || null, oneLine: q.oneLine })) };
}).filter((g) => g.quests.length);

// --- verify + write ---
const flat = shrineGroups.flatMap((g) => g.shrines.map((s) => ({ ...s, region: g.regionName, regionKey: g.regionKey })));
const names = flat.map((s) => s.name.replace(/\s*Shrine$/i, "").trim().toLowerCase());
const dups = names.filter((n, i) => names.indexOf(n) !== i);
const perRegion = shrineGroups.map((g) => `${g.regionName}:${g.shrines.length}`).join("  ");
console.log("Shrines per region:\n  " + perRegion);
console.log(`\nTOTAL shrines: ${flat.length}  | towers: ${towers.length}  | great fairies: ${fairies.length}  | dup names: ${dups.length}`);
console.log("Great Fairies:", fairies.map((f) => `${f.name} (${f.region})`).join(", "));
if (flat.length !== 120 || towers.length !== 15 || fairies.length !== 4 || dups.length) {
  console.error("✗ RECONCILE FAILED", { shrines: flat.length, towers: towers.length, fairies: fairies.length, dups });
  process.exit(1);
}
fs.writeFileSync(K("shrines.json"), JSON.stringify(shrineGroups, null, 2));
fs.writeFileSync(K("towers.json"), JSON.stringify(towers, null, 2));
fs.writeFileSync(K("great-fairies.json"), JSON.stringify(fairies, null, 2));
fs.writeFileSync(K("side-quests.json"), JSON.stringify(sideQuests, null, 2));
fs.writeFileSync(K("armor.json"), JSON.stringify(globals.armor, null, 2));
fs.writeFileSync(K("bestiary.json"), JSON.stringify(globals.bestiary, null, 2));
fs.writeFileSync(K("cooking.json"), JSON.stringify(globals.cooking, null, 2));
fs.writeFileSync(K("koroks.json"), JSON.stringify(globals.koroks, null, 2));
fs.writeFileSync(K("world.json"), JSON.stringify(globals.world, null, 2));
console.log("\n✓ reconciles to 120 / 15 / 4 — wrote shrines, towers, great-fairies, side-quests, armor, bestiary, cooking, koroks, world");
