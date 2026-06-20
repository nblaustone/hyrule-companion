#!/usr/bin/env node
/* v12.13: write the equipment compendium into knowledge/compendium.json (flat, searchable).
   Reads /tmp/compendium.json ({flat:[{name,cat,type,power,durability,effect,where,set}], ...} or a raw array).
   Cleans + dedupes (by cat+name), strips meta, orders weapon→bow→shield→armor. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "knowledge", "compendium.json");
const inPath = process.argv.find((a) => a.endsWith(".json")) || "/tmp/compendium.json";

const data = JSON.parse(fs.readFileSync(inPath, "utf8"));
let flat = Array.isArray(data) ? data : data.flat;
if (!flat && data.categories) { // fall back to reconstructing from category groups
  const byKey = { "one-handed": "weapon", "two-handed": "weapon", spears: "weapon", bows: "bow", shields: "shield", "armor-head": "armor", "armor-body": "armor", "armor-legs": "armor" };
  flat = data.categories.flatMap((r) => (r.items || []).map((it) => ({ ...it, cat: byKey[r.category] || "weapon" })));
}
if (!Array.isArray(flat)) { console.error("no flat item array found in input"); process.exit(1); }

const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const ORDER = { weapon: 0, bow: 1, shield: 2, armor: 3 };
const seen = new Set();
const out = [];
for (const it of flat) {
  if (!it || !it.name || !it.cat) continue;
  const k = it.cat + "|" + norm(it.name).toLowerCase() + "|" + norm(it.type).toLowerCase();
  if (seen.has(k)) continue; seen.add(k);
  out.push({
    name: norm(it.name),
    cat: it.cat,
    ...(it.type ? { type: norm(it.type) } : {}),
    ...(Number.isFinite(it.power) ? { power: it.power } : {}),
    ...(Number.isFinite(it.durability) ? { durability: it.durability } : {}),
    ...(it.effect ? { effect: norm(it.effect) } : {}),
    ...(it.where ? { where: norm(it.where) } : {}),
    ...(it.set && norm(it.set).toLowerCase() !== "standalone" ? { set: norm(it.set) } : {}),
  });
}
out.sort((a, b) => (ORDER[a.cat] - ORDER[b.cat]) || a.name.localeCompare(b.name));

fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const counts = {};
for (const it of out) counts[it.cat] = (counts[it.cat] || 0) + 1;
console.log(`wrote compendium.json: ${out.length} items · ${JSON.stringify(counts)}`);
