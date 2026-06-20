#!/usr/bin/env node
/* v12.14: ADDITIVELY merge materials + creatures into knowledge/compendium.json (which already holds the 272
   equipment items). Reads /tmp/materials.json ({flat:[{name,cat,type,effect,where,sell}]} or raw array), keeps
   all existing equipment, replaces any prior material/creature entries, dedupes by cat+name, re-sorts. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "knowledge", "compendium.json");
const inPath = process.argv.find((a) => a.endsWith(".json")) || "/tmp/materials.json";

const existing = JSON.parse(fs.readFileSync(OUT, "utf8"));
const data = JSON.parse(fs.readFileSync(inPath, "utf8"));
let incoming = Array.isArray(data) ? data : data.flat;
if (!Array.isArray(incoming)) { console.error("no flat array in input"); process.exit(1); }

const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const ORDER = { weapon: 0, bow: 1, shield: 2, armor: 3, material: 4, creature: 5 };
const NEWCATS = new Set(incoming.map((it) => it && it.cat).filter(Boolean)); // material, creature

// keep everything whose cat is NOT being replaced (i.e. the equipment), drop old material/creature
const out = existing.filter((it) => !NEWCATS.has(it.cat));
const seen = new Set(out.map((it) => it.cat + "|" + norm(it.name).toLowerCase()));
let added = 0;
for (const it of incoming) {
  if (!it || !it.name || !it.cat) continue;
  const k = it.cat + "|" + norm(it.name).toLowerCase();
  if (seen.has(k)) continue; seen.add(k);
  out.push({
    name: norm(it.name),
    cat: it.cat,
    ...(it.type ? { type: norm(it.type) } : {}),
    ...(Number.isFinite(it.sell) ? { sell: it.sell } : {}),
    ...(it.effect ? { effect: norm(it.effect) } : {}),
    ...(it.where ? { where: norm(it.where) } : {}),
  });
  added++;
}
out.sort((a, b) => ((ORDER[a.cat] ?? 9) - (ORDER[b.cat] ?? 9)) || a.name.localeCompare(b.name));

fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const counts = {};
for (const it of out) counts[it.cat] = (counts[it.cat] || 0) + 1;
console.log(`compendium.json now ${out.length} entries (added ${added} material/creature) · ${JSON.stringify(counts)}`);
