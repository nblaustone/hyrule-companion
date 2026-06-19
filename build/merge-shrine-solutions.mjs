#!/usr/bin/env node
/* v12.7: splice verified shrine solutions into knowledge/shrines.json.
   Reads /tmp/shrine-solutions.json ({solutions:[{regionKey,name,solution}], ...}) and sets
   ONLY the `solution` field on the matching shrine (matched by regionKey+name). Additive:
   never touches other fields, never overwrites an existing solution unless --force. Reports
   anything it can't place and any shrine still missing a solution. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "knowledge", "shrines.json");
const force = process.argv.includes("--force");
const inPath = process.argv.find((a) => a.endsWith(".json")) || "/tmp/shrine-solutions.json";

const shrines = JSON.parse(fs.readFileSync(SRC, "utf8"));
const data = JSON.parse(fs.readFileSync(inPath, "utf8"));
const sols = data.solutions || data;

const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const idx = new Map(); // regionKey|name -> shrine obj   (+ name-only fallback)
const byName = new Map();
for (const g of shrines) for (const s of g.shrines) {
  idx.set(g.regionKey + "|" + s.name, s);
  byName.set(s.name, s);
}

let applied = 0, skipped = 0, missing = [];
for (const r of sols) {
  if (!r || !r.name || !r.solution || !r.solution.trim()) continue;
  const sh = idx.get(r.regionKey + "|" + r.name) || byName.get(r.name);
  if (!sh) { missing.push(r.name); continue; }
  if (sh.solution && sh.solution.trim() && !force) { skipped++; continue; }
  sh.solution = norm(r.solution);
  applied++;
}

fs.writeFileSync(SRC, JSON.stringify(shrines, null, 1) + "\n");

const total = shrines.reduce((n, g) => n + g.shrines.length, 0);
const withSol = shrines.reduce((n, g) => n + g.shrines.filter((s) => s.solution && s.solution.trim()).length, 0);
console.log(`applied ${applied} · skipped ${skipped} (already had one; use --force to overwrite)`);
if (missing.length) console.log(`! could not place (name not found): ${missing.join(", ")}`);
console.log(`shrines.json now: ${withSol}/${total} shrines have a solution`);
const stillMissing = [];
for (const g of shrines) for (const s of g.shrines) if (!s.solution || !s.solution.trim()) stillMissing.push(g.regionKey + ":" + s.name);
if (stillMissing.length) console.log(`STILL MISSING (${stillMissing.length}): ${stillMissing.join(", ")}`);
