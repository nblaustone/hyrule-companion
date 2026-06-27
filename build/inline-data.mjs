#!/usr/bin/env node
/* Inline the verified knowledge/*.json into HyruleCompanion.jsx as top-level consts,
   between /* GEN:DATA:START *​/ and /* GEN:DATA:END *​/ markers (created at EOF if absent).
   Keeps the .jsx self-contained (the Claude artifact can't read files) while letting the
   data stay regenerable from knowledge/ (assemble-knowledge.mjs is the upstream step). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const K = (f) => JSON.parse(fs.readFileSync(join(ROOT, "knowledge", f), "utf8"));
const SRC = join(ROOT, "HyruleCompanion.jsx");

// the research/verify agents' `notes` fields are provenance/correction logs (kept in
// knowledge/ for honesty) — strip them so verification meta never reaches the UI.
const noNotes = (o) => { if (o && typeof o === "object" && !Array.isArray(o)) { const { notes, confidence, changes, ...rest } = o; return rest; } return o; };
const data = {
  SHRINES: K("shrines.json"),
  TOWERS: K("towers.json"),
  GREAT_FAIRIES: K("great-fairies.json"),
  SIDE_QUESTS: K("side-quests.json"),
  ARMOR: noNotes(K("armor.json")),
  BESTIARY: noNotes(K("bestiary.json")),
  COOKING: noNotes(K("cooking.json")),
  KOROKS: noNotes(K("koroks.json")),
  WORLD: noNotes(K("world.json")),
  REGION_MAPS: K("region-maps.json"),
  MAP_COORDS: K("map-coords.json"),
  COOK_INGREDIENTS: K("cooking-ingredients.json"),
  ECONOMY: K("economy.json"),
  COMPENDIUM: K("compendium.json"),
  LORE: K("lore.json"),
};

// ── Shelf metadata (the console/era game-select shelf). SINGLE SOURCE OF TRUTH for every
// game's console/year/era/accent/cover — injected as `.meta` on each bundle below (and into the
// BotW literal). consoleRank orders the shelf groups (0 = newest console, shown first). `cover`
// names the original-SVG emblem GameCover draws (no Nintendo assets — re-drawn geometry only). */
const META = {
  botw:  { console: "Nintendo Switch",   consoleShort: "Switch",   consoleRank: 0, year: 2017, era: "Era of the Wilds",        accent: "#5fd6e2", accent2: "#16323a", cover: "slate" },
  totk:  { console: "Nintendo Switch",   consoleShort: "Switch",   consoleRank: 0, year: 2023, era: "Era of the Wilds",        accent: "#9bd16a", accent2: "#23341a", cover: "tears" },
  albw:  { console: "Nintendo 3DS",      consoleShort: "3DS",      consoleRank: 1, year: 2013, era: "A Crack Between Worlds",  accent: "#d0739e", accent2: "#3a1f2e", cover: "painting" },
  ww:    { console: "Nintendo GameCube", consoleShort: "GameCube", consoleRank: 2, year: 2002, era: "The Great Sea",          accent: "#2f9fd6", accent2: "#10303f", cover: "sail" },
  minish:{ console: "Game Boy Advance",  consoleShort: "GBA",      consoleRank: 3, year: 2004, era: "The Minish World",        accent: "#3fae8e", accent2: "#123129", cover: "cap" },
  oos:   { console: "Game Boy Color",    consoleShort: "GBC",      consoleRank: 4, year: 2001, era: "The Land of Holodrum",    accent: "#e0883a", accent2: "#3a2410", cover: "season" },
  ooa:   { console: "Game Boy Color",    consoleShort: "GBC",      consoleRank: 4, year: 2001, era: "The Land of Labrynna",    accent: "#4a9fc2", accent2: "#10303a", cover: "harp" },
  oot:   { console: "Nintendo 64",       consoleShort: "N64",      consoleRank: 5, year: 1998, era: "Era of the Hero of Time", accent: "#e3c34a", accent2: "#352c12", cover: "ocarina" },
  mm:    { console: "Nintendo 64",       consoleShort: "N64",      consoleRank: 5, year: 2000, era: "Era of the Hero of Time", accent: "#b07be0", accent2: "#2c1d3e", cover: "moon" },
  alttp: { console: "Super Nintendo",    consoleShort: "SNES",     consoleRank: 6, year: 1991, era: "Era of Light and Dark",   accent: "#6f93e0", accent2: "#1b2a4a", cover: "triforce" },
  la:    { console: "Game Boy",          consoleShort: "Game Boy", consoleRank: 7, year: 1993, era: "A Dream of Koholint",     accent: "#9bbc0f", accent2: "#1e2a10", cover: "windfish" },
};

// TotK bundle (optional — present once build/assemble-totk.mjs has run)
let totkLine = "", totkInGames = "";
try {
  const TOTK = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));
  TOTK.meta = META.totk;
  totkLine = `const TOTK = ${JSON.stringify(TOTK, null, 1)};\n`;
  totkInGames = ", totk: TOTK";
} catch (e) { /* TotK not assembled yet — ship BotW only */ }

// OoT bundle (optional — present once build/assemble-oot.mjs has run). Game 3.
let ootLine = "", ootInGames = "";
try {
  const OOT = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "oot", "app-data.json"), "utf8"));
  OOT.meta = META.oot;
  ootLine = `const OOT = ${JSON.stringify(OOT, null, 1)};\n`;
  ootInGames = ", oot: OOT";
} catch (e) { /* OoT not assembled yet */ }

// MM bundle (optional — present once build/assemble-mm.mjs has run). Game 4.
let mmLine = "", mmInGames = "";
try {
  const MM = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "mm", "app-data.json"), "utf8"));
  MM.meta = META.mm;
  mmLine = `const MM = ${JSON.stringify(MM, null, 1)};\n`;
  mmInGames = ", mm: MM";
} catch (e) { /* MM not assembled yet */ }

// A Link to the Past bundle (optional — present once build/assemble-alttp.mjs has run). Game 5 (SNES).
let alttpLine = "", alttpInGames = "";
try {
  const ALTTP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "alttp", "app-data.json"), "utf8"));
  ALTTP.meta = META.alttp;
  alttpLine = `const ALTTP = ${JSON.stringify(ALTTP, null, 1)};\n`;
  alttpInGames = ", alttp: ALTTP";
} catch (e) { /* ALttP not assembled yet */ }

// Link's Awakening bundle (optional — present once build/assemble-la.mjs has run). Game 6 (Game Boy).
let laLine = "", laInGames = "";
try {
  const LA = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "la", "app-data.json"), "utf8"));
  LA.meta = META.la;
  laLine = `const LA = ${JSON.stringify(LA, null, 1)};\n`;
  laInGames = ", la: LA";
} catch (e) { /* Link's Awakening not assembled yet */ }

// v16-queue bundles (optional — each present once its build/assemble-<id>.mjs has run):
// albw (3DS, game 7), ww (GameCube, 8), minish (GBA, 9), oos + ooa (GBC, 10–11). const-name = id uppercased.
let queueLines = "", queueInGames = "";
for (const id of ["albw", "ww", "minish", "oos", "ooa"]) {
  try {
    const bundle = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", id, "app-data.json"), "utf8"));
    bundle.meta = META[id];
    const VAR = id.toUpperCase();
    queueLines += `const ${VAR} = ${JSON.stringify(bundle, null, 1)};\n`;
    queueInGames += `, ${id}: ${VAR}`;
  } catch (e) { /* not assembled yet */ }
}

// the BotW game bundle references the module-global consts (defined above) by name
const BOTW_GAME =
  `const GAMES = { botw: { id:"botw", label:"Breath of the Wild", short:"BotW", meta:${JSON.stringify(META.botw)}, ` +
  `REGIONS, SHRINES, ARMOR, BESTIARY, COOKING, KOROKS, WORLD, ECONOMY, COMPENDIUM, SIDE_QUESTS, TOWERS, GREAT_FAIRIES, REGION_MAPS, MAP_COORDS, MAP_NODES, MAP_BEASTS, ` +
  `RUNES, TIPS, COOK_RULES, RECIPES, COOK_INGREDIENTS, CATS, ROADMAP, STATUS_RUNES, CHAMPIONS, ` +
  `terms:{orbs:"Spirit Orbs",orbWord:"orbs",runesLabel:"Runes Unlocked",championsLabel:"Champion Abilities",regionBanner:"Divine Beast"}, ` +
  `guideSegs:[["runes","Runes"],["tips","Tips"],["armor","Armor"],["fairies","Fairies"],["towers","Towers"],["quests","Quests"],["enemies","Enemies"],["koroks","Koroks"],["economy","Money"],["world","World"],["settings","Settings"]], ` +
  `postRegionId:"destroy_ganon" }${totkInGames}${ootInGames}${mmInGames}${alttpInGames}${laInGames}${queueInGames} };`;

const block =
  "/* GEN:DATA:START — generated by build/inline-data.mjs from knowledge/*.json; do not hand-edit */\n" +
  Object.entries(data).map(([k, v]) => `const ${k} = ${JSON.stringify(v, null, 1)};`).join("\n") +
  "\n" + totkLine + ootLine + mmLine + alttpLine + laLine + queueLines + BOTW_GAME +
  "\n/* GEN:DATA:END */";

let src = fs.readFileSync(SRC, "utf8");
const re = /\/\* GEN:DATA:START[\s\S]*?\/\* GEN:DATA:END \*\//;
if (re.test(src)) src = src.replace(re, block);
else src = src.replace(/\n$/, "") + "\n\n" + block + "\n";
fs.writeFileSync(SRC, src);

const counts = {
  shrines: data.SHRINES.reduce((n, g) => n + g.shrines.length, 0),
  towers: data.TOWERS.length, fairies: data.GREAT_FAIRIES.length,
  armor: data.ARMOR.sets.length, enemies: data.BESTIARY.enemies.length,
  cookingEffects: data.COOKING.effects.length, koroks: data.KOROKS.puzzleTypes.length,
};
console.log(`✓ inlined data block (${(block.length / 1024).toFixed(0)} KB):`, JSON.stringify(counts));
