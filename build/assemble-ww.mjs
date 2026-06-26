#!/usr/bin/env node
/* Assemble The Wind Waker (game 8, Nintendo GameCube) into an app-ready bundle knowledge/ww/app-data.json,
   shaped exactly like the other games. Reads the hand-authored walkthrough.json (REGIONS) + globals.json (static
   identity), derives STATUS_RUNES + wires the CHAMPIONS (the 3 Pendants + 7 Sages) to the dungeon-reward steps that
   grant them, and folds in OPTIONAL depth overlays (idempotent, degrade if absent): items-songs → RUNES, bestiary,
   great-fairies, side-quests, compendium. guideSegs rebuilds from what populates. Missing datasets degrade
   gracefully (no shrines/cooking/maps/armor/towers/koroks/economy). All edits go to knowledge/albw/* sources.
   Mirrors build/assemble-alttp.mjs. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const O = join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge", "ww");
const J = (f) => JSON.parse(fs.readFileSync(join(O, f), "utf8"));
const opt = (f) => { try { return J(f); } catch { return null; } };
const REGIONS = J("walkthrough.json");
const g = J("globals.json");

function stepGranting(nameRe) {
  for (const r of REGIONS) for (const sec of r.sections || []) for (const st of sec.steps || [])
    if ((st.items || []).some((it) => nameRe.test(it.name))) return st.id;
  return null;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the iconic gear shown in the Status "Items" strip (fills in as the full walkthrough grants them)
const STATUS_PICKS = [
  ["Wind Waker", "stasis"], ["Master Sword", "sword"], ["Deku Leaf", "leaf"], ["Hero's Bow", "bow"],
];
const STATUS_RUNES = STATUS_PICKS
  .map(([name, glyph]) => ({ name, glyph, step: stepGranting(new RegExp("^" + esc(name) + "$", "i")) }))
  .filter((r) => r.step);
const CHAMPIONS = (g.CHAMPIONS || []).map((c) => ({ ...c, step: stepGranting(new RegExp("^" + esc(c.name) + "$", "i")) }));

const ITEMS = (() => { const d = opt("items-songs.json"); return d ? (d.items || d) : (g.RUNES || []); })();
const BEST = opt("bestiary.json");
const BESTIARY = BEST ? { enemies: BEST.enemies || [], ...(BEST.basics ? { basics: BEST.basics } : {}) } : { enemies: [] };
const GREAT_FAIRIES = (() => { const d = opt("great-fairies.json"); return d ? (d.fairies || d) : []; })();
const COMPENDIUM = (() => { const d = opt("compendium.json"); return d ? (d.items || d) : []; })();
const qSlug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "q";
const SIDE_QUESTS = (() => {
  const d = opt("side-quests.json"); if (!d) return [];
  const regions = d.regions || d; const seen = new Set();
  return regions.map((grp) => ({ region: grp.region, quests: (grp.quests || []).map((q) => {
    let id = q.id || qSlug(q.name); while (seen.has(id)) id += "-2"; seen.add(id);
    return { id, ...q };
  }) }));
})();

const guideSegs = [["runes", "Items"], ["tips", "Tips"]];
if (GREAT_FAIRIES.length) guideSegs.push(["fairies", "Fairies"]);
if (SIDE_QUESTS.length) guideSegs.push(["quests", "Quests"]);
if ((BESTIARY.enemies || []).length) guideSegs.push(["enemies", "Enemies"]);
guideSegs.push(["settings", "Settings"]);

const out = {
  id: "ww", label: "The Wind Waker", short: "WW",
  REGIONS,
  SHRINES: [],
  ARMOR: { sets: [] },
  BESTIARY,
  COOKING: { rules: [], effects: [], recipes: [], dragons: [] },
  RECIPES: [], COOK_RULES: [], COOK_INGREDIENTS: [],
  WORLD: g.WORLD || { upgrades: [], systems: [], fairies: [] },
  ECONOMY: null, COMPENDIUM,
  SIDE_QUESTS, TOWERS: [], GREAT_FAIRIES,
  REGION_MAPS: {}, MAP_NODES: {}, MAP_BEASTS: [], KOROKS: null,
  RUNES: ITEMS,
  STATUS_RUNES, CHAMPIONS,
  CATS: g.CATS || [],
  ROADMAP: g.ROADMAP || [],
  TIPS: g.TIPS || [],
  COLLECTIBLES: g.COLLECTIBLES || [],
  terms: g.terms,
  guideSegs,
  postRegionId: g.postRegionId,
};

const steps = REGIONS.reduce((n, r) => n + r.sections.reduce((m, s) => m + s.steps.length, 0), 0);
console.log("WW chapters:", REGIONS.length, "| steps:", steps);
console.log("overlays → items:", ITEMS.length, "| enemies:", (BESTIARY.enemies || []).length, "(basics " + ((BESTIARY.basics || []).length) + ")",
  "| great-fairies:", GREAT_FAIRIES.length, "| side-quests:", SIDE_QUESTS.reduce((n, x) => n + x.quests.length, 0), "| compendium:", COMPENDIUM.length);
console.log("STATUS_RUNES:", STATUS_RUNES.map((r) => r.name).join(", ") || "(none yet)");
console.log("Pearls & Sages wired:", CHAMPIONS.map((c) => c.name + "→" + (c.step || "—")).join(", "));
console.log("guideSegs:", out.guideSegs.map((s) => s[1]).join(" · "));
fs.writeFileSync(join(O, "app-data.json"), JSON.stringify(out, null, 1));
console.log("\n✓ wrote knowledge/ww/app-data.json");
