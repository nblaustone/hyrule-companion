#!/usr/bin/env node
/* Assemble Link's Awakening (game 6, Game Boy) into an app-ready bundle knowledge/la/app-data.json, shaped exactly
   like the BotW/TotK/OoT/MM data the components expect. Reads the hand-authored walkthrough.json (REGIONS) +
   globals.json (static identity), derives STATUS_RUNES + wires the CHAMPIONS (the 8 Instruments of the Sirens) to
   the dungeon-reward steps that grant them, and folds in OPTIONAL depth overlays (idempotent, degrade if absent):
     items-songs.json   → RUNES (the full Items reference; Guide→Items)
     bestiary.json      → BESTIARY {enemies, basics} (Guide→Enemies; combat primer + boss guides)
     great-fairies.json → GREAT_FAIRIES (Guide→Fairies; the Fairy Fountains)
     side-quests.json   → SIDE_QUESTS (Guide→Quests; the trading quest, seashells, minigames; stable sq_<slug> ids)
     compendium.json    → COMPENDIUM (Items tab catalog)
   guideSegs rebuilds from which datasets populate. Koholint has no shrines/cooking/maps/armor/towers/koroks/
   economy — those default empty and degrade gracefully (TotK/OoT/MM v1 were the canaries). All edits go to
   knowledge/la/* sources, never the built file. Mirrors build/assemble-mm.mjs. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const O = join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge", "la");
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

// the iconic gear shown in the Status "Items" strip (fills in as the full walkthrough grants them)
const STATUS_PICKS = [
  ["Sword", "sword"], ["Roc's Feather", "leaf"], ["Power Bracelet", "champion"], ["Hookshot", "magnesis"],
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
const guideSegs = [["runes", "Items"], ["tips", "Tips"]];
if (GREAT_FAIRIES.length) guideSegs.push(["fairies", "Fairies"]);
if (SIDE_QUESTS.length) guideSegs.push(["quests", "Quests"]);
if ((BESTIARY.enemies || []).length) guideSegs.push(["enemies", "Enemies"]);
guideSegs.push(["settings", "Settings"]);

const out = {
  id: "la", label: "Link's Awakening", short: "LA",
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
console.log("LA chapters:", REGIONS.length, "| steps:", steps);
console.log("overlays → items:", ITEMS.length, "| enemies:", (BESTIARY.enemies || []).length, "(basics " + ((BESTIARY.basics || []).length) + ")",
  "| great-fairies:", GREAT_FAIRIES.length, "| side-quests:", SIDE_QUESTS.reduce((n, x) => n + x.quests.length, 0), "| compendium:", COMPENDIUM.length);
console.log("STATUS_RUNES:", STATUS_RUNES.map((r) => r.name).join(", ") || "(none yet)");
console.log("Instruments wired:", CHAMPIONS.map((c) => c.name + "→" + (c.step || "—")).join(", "));
console.log("guideSegs:", out.guideSegs.map((s) => s[1]).join(" · "));
fs.writeFileSync(join(O, "app-data.json"), JSON.stringify(out, null, 1));
console.log("\n✓ wrote knowledge/la/app-data.json");
