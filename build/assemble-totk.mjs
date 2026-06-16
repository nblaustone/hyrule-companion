#!/usr/bin/env node
/* Assemble the verified TotK research (knowledge/totk/{walkthrough,globals,shrines-deduped}.json + the
   8 web-verified missing shrines) into ONE app-ready bundle knowledge/totk/app-data.json shaped exactly like
   the BotW data the components expect. Refuses to write unless shrines reconcile to 152. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const T = join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge", "totk");
const J = (f) => JSON.parse(fs.readFileSync(join(T, f), "utf8"));
const walkthrough = J("walkthrough.json");
const globals = J("globals.json");
const ded = J("shrines-deduped.json");

// --- shrines: 144 deduped + 8 web-verified missing → 152 ---
const MISSING = [
  { name: "Tenmaten Shrine", regionKey: "central", category: "blessing", oneLine: "Rauru's Blessing inside Elma Knolls Well in Hyrule Field — drop in, light the cavern with Brightbloom seeds, grab the chest and blessing.", shrineQuest: null },
  { name: "Ekochiu Shrine", regionKey: "faron", category: "puzzle", oneLine: "Rise and Fall: ride rising/falling platforms and time Ultrahand to cross. North of Woodland Stable, Great Hyrule Forest.", shrineQuest: null },
  { name: "Kikakin Shrine", regionKey: "faron", category: "puzzle", oneLine: "Shining in Darkness: cross a pitch-black shrine using light orbs / Brightbloom seeds. NE of Mount Drena, west Great Hyrule Forest.", shrineQuest: null },
  { name: "Kiuyoyou Shrine", regionKey: "faron", category: "puzzle", oneLine: "Fire and Ice: melt and freeze ice blocks with flame and Zonai devices to align platforms. Rowan Plain, east of the Forgotten Temple.", shrineQuest: null },
  { name: "Musanokir Shrine", regionKey: "faron", category: "puzzle", oneLine: "Swing to Hit: build a weighted pendulum with Ultrahand to smash targets and balls into goals. Within Korok Forest.", shrineQuest: null },
  { name: "Ninjis Shrine", regionKey: "faron", category: "blessing", oneLine: "Rauru's Blessing — appears after the 'Maca's Special Place' quest (post-Phantom Ganon). South edge of Korok Forest; collect the blessing.", shrineQuest: "Maca's Special Place" },
  { name: "Pupunke Shrine", regionKey: "faron", category: "quest", oneLine: "Quest-gated blessing: finish 'A Pretty Stone and Five Golden Apples' (give a luminous stone + 5 golden apples), then walk in.", shrineQuest: "A Pretty Stone and Five Golden Apples" },
  { name: "Sakunbomar Shrine", regionKey: "faron", category: "quest", oneLine: "Quest-gated blessing: complete 'None Shall Pass' in Great Hyrule Forest, then follow the light beam to the shrine.", shrineQuest: "None Shall Pass" },
];
const REGION_NAME = { great_sky_island: "Great Sky Island", sky: "Sky Islands", central: "Central Hyrule", gerudo: "Gerudo", hebra: "Hebra", tabantha: "Tabantha", ridgeland: "Hyrule Ridge", eldin: "Eldin", akkala: "Akkala", lanayru: "Lanayru", necluda: "Necluda", faron: "Faron" };
const ORDER = ["great_sky_island", "central", "necluda", "lanayru", "faron", "gerudo", "ridgeland", "tabantha", "hebra", "eldin", "akkala", "sky"];
const buckets = {};
for (const k of Object.keys(ded)) buckets[k] = ded[k].map((s) => ({ name: s.name, location: s.location, category: s.category, oneLine: s.oneLine, shrineQuest: s.shrineQuest || null }));
for (const m of MISSING) (buckets[m.regionKey] = buckets[m.regionKey] || []).push({ name: m.name, location: m.oneLine.split("—").pop().trim().slice(0, 80), category: m.category, oneLine: m.oneLine, shrineQuest: m.shrineQuest });
const SHRINES = ORDER.filter((k) => buckets[k]).map((k) => ({ regionKey: k, regionName: REGION_NAME[k] || k, shrines: buckets[k] }));
const shrineTotal = SHRINES.reduce((n, g) => n + g.shrines.length, 0);

// --- map walkthrough -> REGIONS (kind temple -> beast so the banner styles it) ---
const REGIONS = walkthrough.map((r) => ({ ...r, kind: r.kind === "temple" ? "beast" : r.kind, champion: r.champion || null }));

// --- find the step id that grants each named item (for STATUS_RUNES / CHAMPIONS wiring) ---
function stepGranting(nameRe) {
  for (const r of walkthrough) for (const sec of r.sections) for (const st of sec.steps)
    if ((st.items || []).some((it) => nameRe.test(it.name)) || nameRe.test(st.t)) return st.id;
  return null;
}
const ABIL_GLYPH = { Ultrahand: "magnesis", Fuse: "sword", Ascend: "cryonis", Recall: "stasis", Autobuild: "gem" };
const abilities = (globals.abilities && globals.abilities.abilities) || [];
const RUNES = abilities.map((a) => ({ id: a.name.toLowerCase(), name: a.name, glyph: ABIL_GLYPH[a.name] || "stasis", from: a.from, what: a.what, tip: a.tip }));
const STATUS_RUNES = abilities.map((a) => ({ name: a.name, glyph: ABIL_GLYPH[a.name] || "stasis", step: stepGranting(new RegExp("^" + a.name + "$", "i")) || stepGranting(new RegExp(a.name, "i")) })).filter((r) => r.step);

// CHAMPIONS = sage vows, wired to each temple's reward step
const CHAMPIONS = REGIONS.filter((r) => r.champion).map((r) => {
  let step = null;
  for (const sec of r.sections) for (const st of sec.steps) if (st.k === "reward") step = st.id; // last reward in the chapter
  return { name: r.champion, from: r.name, step, note: r.champion };
});

// derive RECIPES (effect cards) + COOK_RULES from TotK cooking so the Cook tab + search work
const COOKING = globals.cooking || { rules: [], effects: [], recipes: [], dragons: [] };
const tone = (e) => { const s = e.toLowerCase(); if (/spicy|cold/.test(s)) return "warm"; if (/chilly|heat/.test(s)) return "cool"; if (/fireproof|flame/.test(s)) return "fire"; if (/electro|shock/.test(s)) return "volt"; if (/hearty|gloom/.test(s)) return "heart"; if (/energiz|endur|stamina/.test(s)) return "stam"; if (/mighty|attack/.test(s)) return "atk"; if (/tough|defen/.test(s)) return "def"; if (/hasty|speed/.test(s)) return "speed"; if (/sneak|stealth/.test(s)) return "sneak"; if (/bright|glow/.test(s)) return "volt"; if (/sticky|slip/.test(s)) return "def"; return "warm"; };
const RECIPES = (COOKING.effects || []).map((e) => ({ eff: e.effect, tone: tone(e.effect), does: e.does, key: e.ingredients, recipe: e.elixir || "Cook the ingredients in a pot.", now: false }));
const COOK_RULES = COOKING.rules || [];

const out = {
  id: "totk", label: "Tears of the Kingdom", short: "TotK",
  REGIONS, SHRINES,
  ARMOR: { sets: (globals.armor && globals.armor.sets) || [] },
  BESTIARY: { enemies: (globals.bestiary && globals.bestiary.enemies) || [] },
  COOKING, RECIPES, COOK_RULES,
  WORLD: globals.world || { upgrades: [], systems: [], fairies: [] },
  RUNES, STATUS_RUNES, CHAMPIONS,
  CATS: [
    { id: "ability", name: "Abilities", glyph: "stasis" }, { id: "weapon", name: "Weapons", glyph: "sword" },
    { id: "bow", name: "Bows", glyph: "bow" }, { id: "shield", name: "Shields", glyph: "shield" },
    { id: "armor", name: "Armor", glyph: "armor" }, { id: "key", name: "Key Items", glyph: "key" },
    { id: "material", name: "Materials", glyph: "gem" },
  ],
  ROADMAP: [
    { id: "shrines", name: "152 Shrines", sub: "Lights of Blessing", note: "Every shrine grants a Light of Blessing; four trade for a heart or stamina vessel. The long-haul goal across Surface and Sky.", reward: "Hearts & stamina" },
    { id: "lightroots", name: "120 Lightroots", sub: "Light up the Depths", note: "Each Lightroot mirrors a Surface shrine and lights a patch of the pitch-black Depths.", reward: "A lit map below" },
    { id: "koroks", name: "1000 Korok Seeds", sub: "Hestu again", note: "Tiny puzzles all over Surface, Sky, and Depths. Trade to Hestu to expand your pouches.", reward: "Bigger inventory" },
    { id: "sages", name: "Sage's Wills & armor", sub: "Power up", note: "Upgrade your sage abilities with Sage's Wills, and armor at the Great Fairies once you reunite Mastro's troupe.", reward: "Stronger party & gear" },
    { id: "sky_depths", name: "Sky & Depths", sub: "Two more Hyrules", note: "Sky islands, the vast Depths, Yiga schematics, Zonai device dispensers, and the addisons — a whole game beyond the Surface.", reward: "Exploration" },
  ],
  TIPS: [
    { id: "build", name: "Build & Fuse freely", items: ["Ultrahand + Fuse is the heart of the game — fuse rocks/monster parts to weapons for power, and stick Zonai devices together to travel.", "Out of battery in the sky? Recall a fallen platform and ride it back up, or glide.", "Autobuild (from the Fifth Sage) recreates your favorite vehicles for a little Zonaite."] },
    { id: "depths", name: "Surviving the Depths", items: ["The Depths are pitch black and full of Gloom that caps your hearts. Carry Brightbloom Seeds (throw or fuse to arrows) and light Lightroots.", "Cure gloom-damaged (cracked) hearts with Sundelion dishes or by warping to the Surface.", "Every Lightroot sits directly under a Surface shrine — a handy way to find shrines."] },
  ],
  terms: { orbs: "Lights of Blessing", orbWord: "lights", runesLabel: "Abilities", championsLabel: "Sage Vows", regionBanner: "Temple" },
  guideSegs: [["runes", "Abilities"], ["tips", "Tips"], ["armor", "Armor"], ["enemies", "Enemies"], ["world", "World"], ["settings", "Settings"]],
  postRegionId: "t_depths",
  // datasets TotK v1 doesn't have yet — kept empty so the UI degrades gracefully
  TOWERS: [], GREAT_FAIRIES: [], SIDE_QUESTS: [], REGION_MAPS: {}, MAP_NODES: {}, KOROKS: null, MAP_BEASTS: [],
};
fs.writeFileSync(join(T, "shrines.json"), JSON.stringify(SHRINES, null, 1));
console.log("shrines per region:", SHRINES.map((g) => g.regionName + ":" + g.shrines.length).join("  "));
console.log("TOTAL shrines:", shrineTotal, "| abilities:", RUNES.length, "| status-runes wired:", STATUS_RUNES.length, "| sage vows:", CHAMPIONS.length, "| armor:", out.ARMOR.sets.length, "| enemies:", out.BESTIARY.enemies.length);
console.log("STATUS_RUNES:", STATUS_RUNES.map((r) => r.name + "→" + r.step).join(", "));
console.log("CHAMPIONS:", CHAMPIONS.map((c) => c.name + "→" + c.step).join(", "));
if (shrineTotal !== 152) { console.error("✗ shrines != 152 (" + shrineTotal + ")"); process.exit(1); }
fs.writeFileSync(join(T, "app-data.json"), JSON.stringify(out, null, 1));
console.log("\n✓ wrote knowledge/totk/app-data.json + shrines.json (152 reconciled)");
