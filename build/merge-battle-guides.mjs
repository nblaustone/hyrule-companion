#!/usr/bin/env node
/* v12.8: splice verified combat guides into knowledge/bestiary.json.
   Reads /tmp/battle-guides.json ({basics:{cards:[...]}, battles:[{name,battle}], ...}):
   - sets each enemy's `battle` field (matched by name; additive, won't overwrite without --force)
   - sets the top-level `basics` array (the Combat Basics primer cards)
   Never touches other fields. Reports anything it can't place. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "knowledge", "bestiary.json");
const force = process.argv.includes("--force");
const inPath = process.argv.find((a) => a.endsWith(".json")) || "/tmp/battle-guides.json";

const bestiary = JSON.parse(fs.readFileSync(SRC, "utf8"));
const data = JSON.parse(fs.readFileSync(inPath, "utf8"));
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

const byName = new Map(bestiary.enemies.map((e) => [e.name, e]));
let applied = 0, skipped = 0, missing = [];
for (const r of data.battles || []) {
  if (!r || !r.name || !r.battle || !r.battle.trim()) continue;
  const e = byName.get(r.name);
  if (!e) { missing.push(r.name); continue; }
  if (e.battle && e.battle.trim() && !force) { skipped++; continue; }
  e.battle = norm(r.battle);
  applied++;
}

let basicsN = 0;
if (data.basics && Array.isArray(data.basics.cards) && data.basics.cards.length) {
  bestiary.basics = data.basics.cards.map((c) => ({ title: norm(c.title), body: norm(c.body) }));
  basicsN = bestiary.basics.length;
}

fs.writeFileSync(SRC, JSON.stringify(bestiary, null, 1) + "\n");

const withBattle = bestiary.enemies.filter((e) => e.battle && e.battle.trim()).length;
console.log(`battle guides: applied ${applied} · skipped ${skipped} (already had one; --force to overwrite)`);
if (missing.length) console.log(`! could not place (name not found): ${missing.join(", ")}`);
console.log(`basics primer: ${basicsN} cards`);
console.log(`bestiary.json now: ${withBattle}/${bestiary.enemies.length} enemies have a battle guide`);
