#!/usr/bin/env node
/* v12.9: splice the playthrough-depth workflow output into the knowledge datasets.
   Reads /tmp/depth.json ({armor:[{name,tiers,farm,note}], economy:{rupees,farming,tips}, koroks:{puzzleTypes}}):
   - armor.json:  set each set's `tiers`/`farm`/`note` (matched by name; additive)
   - economy.json: write {rupees, farming, tips} (strips sources/corrections)
   - koroks.json: replace `puzzleTypes` with the enriched [{type,see,do,category}]
   Never writes sources/corrections into shipped data. Reports anything it can't place. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const K = (f) => join(ROOT, "knowledge", f);
const inPath = process.argv.find((a) => a.endsWith(".json")) || "/tmp/depth.json";
const data = JSON.parse(fs.readFileSync(inPath, "utf8"));
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

/* ---- armor tiers ---- */
const armor = JSON.parse(fs.readFileSync(K("armor.json"), "utf8"));
const byName = new Map(armor.sets.map((s) => [s.name, s]));
let armApplied = 0, armMissing = [];
for (const r of data.armor || []) {
  if (!r || !r.name || !Array.isArray(r.tiers)) continue;
  const s = byName.get(r.name);
  if (!s) { armMissing.push(r.name); continue; }
  s.tiers = r.tiers.map((t) => ({ star: t.star, ...(t.rupees ? { rupees: t.rupees } : {}), materials: (t.materials || []).map((m) => ({ item: norm(m.item), qty: m.qty })) }));
  // upgradeable sets: keep the farm note (where-to-get), drop the verbose verification `note`.
  // non-upgradeable sets (empty tiers): a clean short player-facing note explains the absence.
  if (s.tiers.length) { if (r.farm && r.farm.trim()) s.farm = norm(r.farm); delete s.note; }
  else { s.note = "Can't be upgraded at a Great Fairy — it stays at its base defense."; delete s.farm; }
  armApplied++;
}
fs.writeFileSync(K("armor.json"), JSON.stringify(armor, null, 1) + "\n");

/* ---- economy ---- */
let econN = 0;
if (data.economy) {
  const e = data.economy;
  const econ = {
    rupees: (e.rupees || []).map((r) => ({ method: norm(r.method), detail: norm(r.detail) })),
    farming: (e.farming || []).map((f) => ({ item: norm(f.item), where: norm(f.where), ...(f.tip ? { tip: norm(f.tip) } : {}) })),
    tips: (e.tips || []).map(norm),
  };
  econN = econ.rupees.length + econ.farming.length + econ.tips.length;
  fs.writeFileSync(K("economy.json"), JSON.stringify(econ, null, 1) + "\n");
}

/* ---- korok puzzle types ---- */
let korN = 0;
if (data.koroks && Array.isArray(data.koroks.puzzleTypes) && data.koroks.puzzleTypes.length) {
  const koroks = JSON.parse(fs.readFileSync(K("koroks.json"), "utf8"));
  koroks.puzzleTypes = data.koroks.puzzleTypes.map((p) => ({ type: norm(p.type), see: norm(p.see || ""), do: norm(p.do || p.how || ""), category: p.category || "other" }));
  korN = koroks.puzzleTypes.length;
  fs.writeFileSync(K("koroks.json"), JSON.stringify(koroks, null, 1) + "\n");
}

const armWith = armor.sets.filter((s) => Array.isArray(s.tiers) && s.tiers.length).length;
console.log(`armor: applied ${armApplied} · ${armWith}/${armor.sets.length} sets now have tiers` + (armMissing.length ? ` · MISSING: ${armMissing.join(", ")}` : ""));
console.log(`economy: ${econN} entries written`);
console.log(`koroks: ${korN} puzzle types written`);
