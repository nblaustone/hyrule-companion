#!/usr/bin/env node
/* Assemble Ocarina of Time (game 3) into an app-ready bundle knowledge/oot/app-data.json, shaped exactly like
   the BotW/TotK data the components expect. Reads the hand-authored walkthrough.json (REGIONS) + globals.json
   (static identity: terms/guideSegs/CATS/RUNES/CHAMPIONS/ROADMAP/TIPS/WORLD), derives STATUS_RUNES + wires the
   CHAMPIONS (Spiritual Stones) to the steps that grant them, and fills every other dataset with a graceful
   empty default (OoT v1 has no shrines/cooking/maps/etc., exactly like TotK v1). Re-run after editing either
   source; mirror later expansion (more chapters, enemies, items) by growing globals.json + walkthrough.json. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const O = join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge", "oot");
const J = (f) => JSON.parse(fs.readFileSync(join(O, f), "utf8"));
const REGIONS = J("walkthrough.json");
const g = J("globals.json");

// find the step id that grants an item whose name matches (for STATUS_RUNES / CHAMPIONS wiring)
function stepGranting(nameRe) {
  for (const r of REGIONS) for (const sec of r.sections || []) for (const st of sec.steps || [])
    if ((st.items || []).some((it) => nameRe.test(it.name))) return st.id;
  return null;
}

// STATUS_RUNES: the core items, shown as pips on Status, lit once their granting step is checked
const STATUS_PICKS = [
  ["Kokiri Sword", "sword"], ["Deku Shield", "shield"], ["Fairy Slingshot", "bow"], ["Fairy Ocarina", "stasis"],
];
const STATUS_RUNES = STATUS_PICKS
  .map(([name, glyph]) => ({ name, glyph, step: stepGranting(new RegExp("^" + name + "$", "i")) }))
  .filter((r) => r.step);

// CHAMPIONS (Spiritual Stones): wire each to the reward step that grants it
const CHAMPIONS = (g.CHAMPIONS || []).map((c) => ({ ...c, step: stepGranting(new RegExp("^" + c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i")) }));

const out = {
  id: "oot", label: "Ocarina of Time", short: "OoT",
  REGIONS,
  // OoT v1 datasets we don't have yet — empty so the UI degrades gracefully (TotK v1 was the canary for this)
  SHRINES: [],
  ARMOR: { sets: [] },
  BESTIARY: { enemies: [] },
  COOKING: { rules: [], effects: [], recipes: [], dragons: [] },
  RECIPES: [], COOK_RULES: [], COOK_INGREDIENTS: [],
  WORLD: g.WORLD || { upgrades: [], systems: [], fairies: [] },
  ECONOMY: null, COMPENDIUM: [],
  SIDE_QUESTS: [], TOWERS: [], GREAT_FAIRIES: [],
  REGION_MAPS: {}, MAP_NODES: {}, MAP_BEASTS: [], KOROKS: null,
  RUNES: g.RUNES || [],
  STATUS_RUNES, CHAMPIONS,
  CATS: g.CATS || [],
  ROADMAP: g.ROADMAP || [],
  TIPS: g.TIPS || [],
  terms: g.terms,
  guideSegs: g.guideSegs,
  postRegionId: g.postRegionId,
};

const steps = REGIONS.reduce((n, r) => n + r.sections.reduce((m, s) => m + s.steps.length, 0), 0);
console.log("OoT chapters:", REGIONS.length, "| steps:", steps, "| items wired (STATUS_RUNES):", STATUS_RUNES.map((r) => r.name).join(", "));
console.log("Spiritual Stones wired:", CHAMPIONS.map((c) => c.name + "→" + (c.step || "—")).join(", "));
console.log("guideSegs:", out.guideSegs.map((s) => s[1]).join(" · "));
fs.writeFileSync(join(O, "app-data.json"), JSON.stringify(out, null, 1));
console.log("\n✓ wrote knowledge/oot/app-data.json");
