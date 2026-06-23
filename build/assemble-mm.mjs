#!/usr/bin/env node
/* Assemble Majora's Mask (game 4) into an app-ready bundle knowledge/mm/app-data.json, shaped exactly like
   the BotW/TotK/OoT data the components expect. Reads the hand-authored walkthrough.json (REGIONS) + globals.json
   (static identity), derives STATUS_RUNES + wires the CHAMPIONS (the four Remains) to the boss-reward steps that
   grant them, and folds in OPTIONAL depth overlays (idempotent, degrade if absent):
     items-songs.json   → RUNES (the full Masks & Songs reference; Guide→Masks)
     bestiary.json      → BESTIARY {enemies, basics} (Guide→Enemies; combat primer + boss guides)
     great-fairies.json → GREAT_FAIRIES (Guide→Fairies; the Stray-Fairy magic upgrades)
     side-quests.json   → SIDE_QUESTS (Guide→Quests; the Bombers' Notebook + trades, stable sq_<slug> ids)
     compendium.json    → COMPENDIUM (Items tab catalog)
   guideSegs rebuilds from which datasets populate. Every dataset MM lacks (shrines/cooking/maps/armor/towers/
   koroks/economy) defaults empty and degrades gracefully — TotK/OoT v1 were the canaries for this. All edits go
   to knowledge/mm/* sources, never the built file. Mirrors build/assemble-oot.mjs. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const O = join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge", "mm");
const J = (f) => JSON.parse(fs.readFileSync(join(O, f), "utf8"));
const opt = (f) => { try { return J(f); } catch { return null; } };
const REGIONS = J("walkthrough.json");
const g = J("globals.json");

// find the step id that grants an item whose name matches (for STATUS_RUNES / CHAMPIONS wiring)
function stepGranting(nameRe) {
  for (const r of REGIONS) for (const sec of r.sections || []) for (const st of sec.steps || [])
    if ((st.items || []).some((it) => nameRe.test(it.name))) return st.id;
  return null;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the iconic faces & instrument shown in the Status "Masks & Songs" strip
const STATUS_PICKS = [
  ["Deku Mask", "mask"], ["Goron Mask", "mask"], ["Zora Mask", "mask"], ["Ocarina of Time", "stasis"],
];
const STATUS_RUNES = STATUS_PICKS
  .map(([name, glyph]) => ({ name, glyph, step: stepGranting(new RegExp("^" + esc(name) + "$", "i")) }))
  .filter((r) => r.step);
const CHAMPIONS = (g.CHAMPIONS || []).map((c) => ({ ...c, step: stepGranting(new RegExp("^" + esc(c.name) + "$", "i")) }));

// --- overlays ---
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

// guideSegs: rebuilt in canonical order from what's populated
const guideSegs = [["runes", "Masks"], ["tips", "Tips"]];
if (GREAT_FAIRIES.length) guideSegs.push(["fairies", "Fairies"]);
if (SIDE_QUESTS.length) guideSegs.push(["quests", "Quests"]);
if ((BESTIARY.enemies || []).length) guideSegs.push(["enemies", "Enemies"]);
guideSegs.push(["settings", "Settings"]);

const out = {
  id: "mm", label: "Majora's Mask", short: "MM",
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
console.log("MM chapters:", REGIONS.length, "| steps:", steps);
console.log("overlays → masks/songs:", ITEMS.length, "| enemies:", (BESTIARY.enemies || []).length, "(basics " + ((BESTIARY.basics || []).length) + ")",
  "| great-fairies:", GREAT_FAIRIES.length, "| side-quests:", SIDE_QUESTS.reduce((n, x) => n + x.quests.length, 0), "| compendium:", COMPENDIUM.length);
console.log("STATUS_RUNES:", STATUS_RUNES.map((r) => r.name).join(", "));
console.log("Remains wired:", CHAMPIONS.map((c) => c.name + "→" + (c.step || "—")).join(", "));
console.log("guideSegs:", out.guideSegs.map((s) => s[1]).join(" · "));
fs.writeFileSync(join(O, "app-data.json"), JSON.stringify(out, null, 1));
console.log("\n✓ wrote knowledge/mm/app-data.json");
