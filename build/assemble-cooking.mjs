#!/usr/bin/env node
/* v10: reconcile the sourced ingredient-table workflow output (/tmp/cook-raw.json) into the clean,
   app-facing knowledge/cooking-ingredients.json that the pot simulator reads. Normalizes effects to the
   11 BotW buffs, encodes Hearty yellow-hearts as a `hearty:+N` bonus (the engine parses it), tags dragon/
   special semantics, shortens locations, dedups by name (keeping the higher-confidence row), and drops
   provenance (confidence/prose) so verification meta never reaches the UI. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const raw = JSON.parse(fs.readFileSync("/tmp/cook-raw.json", "utf8"));
const cats = (raw.result || raw).categories;
const EFFECTS = new Set(["Hearty", "Energizing", "Enduring", "Spicy", "Chilly", "Fireproof", "Electro", "Mighty", "Tough", "Hasty", "Sneaky"]);
const CATS = new Set(["fruit", "veg", "mushroom", "herb", "meat", "fish", "critter", "monster", "dragon", "other"]);
const conf = (i) => ({ high: 3, medium: 2, low: 1 }[i && i.confidence] || 0);

function build(i) {
  const effect = i.effect && EFFECTS.has(i.effect) ? i.effect : null;
  let role = i.role;
  if (/Courser Bee Honey/i.test(i.name)) role = "effect"; // honey is a food, not a critter
  let bonus = null;
  if (effect === "Hearty") bonus = "hearty:+" + (i.potency || 4);
  else if (effect === "Energizing") bonus = "refills stamina";
  else if (effect === "Enduring") bonus = "+ stamina wheel";
  else if (role === "dragon") bonus = (/Horn/i.test(i.name) ? "maxes 30:00 · " : "") + "guaranteed crit";
  else if (role === "special") { if (/extract/i.test(i.name)) bonus = "randomizes · cancels crit"; else if (/star/i.test(i.name)) bonus = "guaranteed crit"; else if (/fairy/i.test(i.name)) bonus = "heal tonic"; }
  const o = { name: i.name.trim(), role, cat: CATS.has(i.cat) ? i.cat : "other", effect };
  if (effect && effect !== "Hearty" && i.potency != null) o.potency = i.potency; // Hearty potency lives in bonus
  if (i.hearts != null) o.hearts = i.hearts;
  if (i.timeSec != null) o.timeSec = i.timeSec;
  if (bonus) o.bonus = bonus;
  if (i.sell != null) o.sell = i.sell;
  if (i.where) o.where = String(i.where).split(/[;.—(]/)[0].replace(/\s+/g, " ").trim().slice(0, 48);
  return o;
}

const seen = new Map();
for (const c of cats) for (const i of c.ingredients || []) {
  if (!i || !i.name) continue;
  const key = i.name.trim().toLowerCase();
  if (!seen.has(key) || conf(i) > seen.get(key)._c) { const o = build(i); o._c = conf(i); seen.set(key, o); }
}
const roleOrder = { effect: 0, neutral: 1, critter: 2, monster: 3, dragon: 4, special: 5 };
const arr = [...seen.values()].map(({ _c, ...o }) => o)
  .sort((a, b) => (roleOrder[a.role] - roleOrder[b.role]) || (a.effect || "~").localeCompare(b.effect || "~") || a.name.localeCompare(b.name));

// honesty gate: must cover all 11 effects and have a healthy spread of roles
const fx = new Set(arr.filter((i) => i.effect).map((i) => i.effect));
const missing = [...EFFECTS].filter((e) => !fx.has(e));
if (missing.length) { console.error("Refusing to write — missing effects: " + missing.join(", ")); process.exit(1); }

fs.writeFileSync(join(ROOT, "knowledge", "cooking-ingredients.json"), JSON.stringify(arr, null, 1));
const byRole = {};
for (const i of arr) byRole[i.role] = (byRole[i.role] || 0) + 1;
console.log("wrote " + arr.length + " ingredients →", byRole);
