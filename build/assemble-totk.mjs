#!/usr/bin/env node
/* Assemble the verified TotK research (knowledge/totk/{walkthrough,globals,shrines-deduped}.json + the
   8 web-verified missing shrines) into ONE app-ready bundle knowledge/totk/app-data.json shaped exactly like
   the BotW data the components expect. Refuses to write unless shrines reconcile to 152.

   v13 (TotK parity): also folds in OPTIONAL overlay files produced by the build/gen-totk-*-workflow.mjs
   author→verify workflows. Each overlay is read if present and degrades gracefully if absent, so re-running
   this script is idempotent and never wipes authored depth:
     shrine-solutions.json  → sets each shrine's spoiler-gated `solution`
     battle.json            → BESTIARY.basics + per-enemy `battle` (merges/extends the enemy list)
     side-quests.json       → SIDE_QUESTS  ·  towers.json → TOWERS  ·  great-fairies.json → GREAT_FAIRIES
     koroks.json            → KOROKS       ·  economy.json → ECONOMY
     armor-tiers.json       → ARMOR.sets[].tiers + .farm (matched by set name)
     compendium.json        → COMPENDIUM   ·  cooking-ingredients.json → COOK_INGREDIENTS
     region-maps.json       → REGION_MAPS  ·  map-nodes.json → { MAP_NODES, MAP_BEASTS }
   guideSegs is rebuilt from which datasets ended up non-empty, in the BotW canonical order. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const T = join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge", "totk");
const J = (f) => JSON.parse(fs.readFileSync(join(T, f), "utf8"));
const opt = (f) => { try { return J(f); } catch { return null; } }; // optional overlay → null if absent
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
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

// overlay: spoiler-gated shrine solutions (matched by name, region-key when given)
const SOL = opt("shrine-solutions.json");
let solApplied = 0;
if (SOL) {
  const sols = SOL.solutions || SOL;
  const byKey = new Map(), byName = new Map();
  for (const g of SHRINES) for (const s of g.shrines) { byKey.set(g.regionKey + "|" + s.name, s); byName.set(s.name, s); }
  for (const r of sols) {
    if (!r || !r.name || !r.solution || !norm(r.solution)) continue;
    const sh = byKey.get((r.regionKey || "") + "|" + r.name) || byName.get(r.name);
    if (sh) { sh.solution = norm(r.solution); solApplied++; }
  }
}

// --- map walkthrough -> REGIONS (kind temple -> beast so the banner styles it). steps keep any `stuck`. ---
const REGIONS = walkthrough.map((r) => ({ ...r, kind: r.kind === "temple" ? "beast" : r.kind, champion: r.champion || null }));
let stuckCount = 0;
for (const r of REGIONS) for (const sec of r.sections || []) for (const st of sec.steps || []) if (st.stuck) stuckCount++;

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
delete COOKING.notes; // strip verification meta (CookReference renders cooking.notes)
const tone = (e) => { const s = e.toLowerCase(); if (/spicy|cold/.test(s)) return "warm"; if (/chilly|heat/.test(s)) return "cool"; if (/fireproof|flame/.test(s)) return "fire"; if (/electro|shock/.test(s)) return "volt"; if (/hearty|gloom/.test(s)) return "heart"; if (/energiz|endur|stamina/.test(s)) return "stam"; if (/mighty|attack/.test(s)) return "atk"; if (/tough|defen/.test(s)) return "def"; if (/hasty|speed/.test(s)) return "speed"; if (/sneak|stealth/.test(s)) return "sneak"; if (/bright|glow/.test(s)) return "volt"; if (/sticky|slip/.test(s)) return "def"; return "warm"; };
const RECIPES = (COOKING.effects || []).map((e) => ({ eff: e.effect, tone: tone(e.effect), does: e.does, key: e.ingredients, recipe: e.elixir || "Cook the ingredients in a pot.", now: false }));
const COOK_RULES = COOKING.rules || [];

// overlay: ARMOR — base sets from globals, with tiers/farm spliced in by set name
const ARMOR_SETS = (globals.armor && globals.armor.sets) || [];
const ARMTIERS = opt("armor-tiers.json");
let armApplied = 0;
if (ARMTIERS) {
  const rows = ARMTIERS.sets || ARMTIERS;
  const byName = new Map(ARMOR_SETS.map((s) => [s.name, s]));
  for (const r of rows) {
    if (!r || !r.name) continue;
    const set = byName.get(r.name);
    if (!set) continue;
    if (r.tiers) set.tiers = r.tiers;
    if (r.farm) set.farm = norm(r.farm);
    armApplied++;
  }
}

// overlay: BESTIARY — base enemies from globals, with `battle` spliced in (and marquee enemies appended)
// the lumped placeholder rows get split into individual bosses by the battle workflow → drop them once the
// split guides exist (parity with BotW splitting the four Blights).
const LUMPED = ["Temple bosses (Colgera, Marbled Gohma, Mucktorok, Queen Gibdo)", "Gleeok (Fire / Frost / Thunder)"];
let ENEMIES = (globals.bestiary && globals.bestiary.enemies) || [];
const BAT = opt("battle.json");
let basics = [], batApplied = 0;
if (BAT) {
  basics = BAT.basics || [];
  ENEMIES = ENEMIES.filter((e) => !LUMPED.includes(e.name)); // remove placeholders before re-adding splits
  const byName = new Map(ENEMIES.map((e) => [e.name, e]));
  for (const e of BAT.enemies || []) {
    if (!e || !e.name || !e.battle) continue;
    const cur = byName.get(e.name);
    if (cur) { cur.battle = norm(e.battle); if (e.tactic) cur.tactic = norm(e.tactic); }
    else { const ne = { name: e.name, tier: e.tier || "", tactic: norm(e.tactic || ""), drops: e.drops || "", battle: norm(e.battle) }; ENEMIES.push(ne); byName.set(e.name, ne); }
    batApplied++;
  }
}
const BESTIARY = { enemies: ENEMIES };
if (basics.length) BESTIARY.basics = basics;
// NB: globals.bestiary.notes is agent verification meta ("Adversarial verify done…") — NEVER surface it
// (EnemiesView renders data.notes as its lede). Same for COOKING.notes / WORLD.notes below. (honesty-meta rule)

// optional standalone overlays
// stable slug ids for side quests (must match qSlug() in HyruleCompanion.jsx — progress keys depend on it)
const qSlug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "q";
const SIDE_QUESTS = (() => {
  const d = opt("side-quests.json"); if (!d) return [];
  const regions = d.regions || d;
  const seen = new Set();
  return regions.map((g) => ({ region: g.region, quests: (g.quests || []).map((q) => {
    let id = q.id || qSlug(q.name); while (seen.has(id)) id += "-2"; seen.add(id);
    return { id, ...q };
  }) }));
})();
const TOWERS = (() => { const d = opt("towers.json"); return d ? (d.towers || d) : []; })();
const GREAT_FAIRIES = (() => { const d = opt("great-fairies.json"); return d ? (d.fairies || d) : []; })();
const KOROKS = (() => { const d = opt("koroks.json"); return d || null; })();
const ECONOMY = (() => { const d = opt("economy.json"); return d || null; })();
const COMPENDIUM = (() => { const d = opt("compendium.json"); return d ? (d.items || d) : []; })();
const COOK_INGREDIENTS = (() => { const d = opt("cooking-ingredients.json"); return d ? (d.ingredients || d) : []; })();
const REGION_MAPS = (() => { const d = opt("region-maps.json"); return d || {}; })();
const MAPN = opt("map-nodes.json");
const MAP_NODES = MAPN ? (MAPN.MAP_NODES || MAPN.nodes || {}) : {};
const MAP_BEASTS = MAPN ? (MAPN.MAP_BEASTS || MAPN.beasts || []) : [];

// guideSegs: rebuilt in the BotW canonical order from whatever ended up populated
const guideSegs = [["runes", "Abilities"], ["tips", "Tips"], ["armor", "Armor"]];
if (GREAT_FAIRIES.length) guideSegs.push(["fairies", "Fairies"]);
if (TOWERS.length) guideSegs.push(["towers", "Towers"]);
if (SIDE_QUESTS.length) guideSegs.push(["quests", "Quests"]);
guideSegs.push(["enemies", "Enemies"]);
if (KOROKS) guideSegs.push(["koroks", "Koroks"]);
if (ECONOMY) guideSegs.push(["economy", "Money"]);
guideSegs.push(["world", "World"], ["settings", "Settings"]);

const out = {
  id: "totk", label: "Tears of the Kingdom", short: "TotK",
  REGIONS, SHRINES,
  ARMOR: { sets: ARMOR_SETS },
  BESTIARY,
  COOKING, RECIPES, COOK_RULES, COOK_INGREDIENTS,
  WORLD: (() => { const w = { ...(globals.world || { upgrades: [], systems: [], fairies: [] }) }; delete w.notes; return w; })(),
  ECONOMY, COMPENDIUM,
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
  guideSegs,
  postRegionId: "t_depths",
  // datasets fed by overlays above (empty/null → UI degrades gracefully)
  TOWERS, GREAT_FAIRIES, SIDE_QUESTS, REGION_MAPS, MAP_NODES, KOROKS, MAP_BEASTS,
};
fs.writeFileSync(join(T, "shrines.json"), JSON.stringify(SHRINES, null, 1));
console.log("shrines per region:", SHRINES.map((g) => g.regionName + ":" + g.shrines.length).join("  "));
console.log("TOTAL shrines:", shrineTotal, "| abilities:", RUNES.length, "| status-runes wired:", STATUS_RUNES.length, "| sage vows:", CHAMPIONS.length, "| armor:", out.ARMOR.sets.length, "| enemies:", out.BESTIARY.enemies.length);
console.log("overlays → solutions:", solApplied, "| stuck:", stuckCount, "| battle:", batApplied, "(basics " + basics.length + ")", "| armor-tiers:", armApplied,
  "| sidequests:", SIDE_QUESTS.length, "| towers:", TOWERS.length, "| fairies:", GREAT_FAIRIES.length, "| koroks:", KOROKS ? "yes" : "no",
  "| economy:", ECONOMY ? "yes" : "no", "| compendium:", COMPENDIUM.length, "| cook-ing:", COOK_INGREDIENTS.length, "| region-maps:", Object.keys(REGION_MAPS).length, "| map-nodes:", Object.keys(MAP_NODES).length);
console.log("guideSegs:", guideSegs.map((s) => s[1]).join(" · "));
if (shrineTotal !== 152) { console.error("✗ shrines != 152 (" + shrineTotal + ")"); process.exit(1); }
fs.writeFileSync(join(T, "app-data.json"), JSON.stringify(out, null, 1));
console.log("\n✓ wrote knowledge/totk/app-data.json + shrines.json (152 reconciled)");
