#!/usr/bin/env node
/* Write a depth Workflow's verified datasets into knowledge/<game>/*.json (items-songs · bestiary ·
   great-fairies · side-quests). Strips any agent meta. Usage:
     node build/merge-game-depth.mjs <game> <workflow-output.json>
   The output file is the task .output (its `.result` holds { itemsSongs, bestiary, greatFairies, sideQuests }). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [game, outPath] = process.argv.slice(2);
if (!game || !outPath) { console.error("usage: merge-game-depth.mjs <game> <output.json>"); process.exit(1); }
const DIR = join(ROOT, "knowledge", game);

const rawOut = JSON.parse(fs.readFileSync(outPath, "utf8"));
const r = typeof rawOut.result === "string" ? JSON.parse(rawOut.result) : (rawOut.result || rawOut);
const strip = (o) => { if (o && typeof o === "object" && !Array.isArray(o)) { const { notes, confidence, changes, ...rest } = o; return rest; } return o; };

const out = [];
if (r.itemsSongs && (r.itemsSongs.items || []).length) { fs.writeFileSync(join(DIR, "items-songs.json"), JSON.stringify(strip(r.itemsSongs), null, 1)); out.push(`items-songs ${r.itemsSongs.items.length}`); }
if (r.bestiary && (r.bestiary.enemies || []).length) { fs.writeFileSync(join(DIR, "bestiary.json"), JSON.stringify(strip(r.bestiary), null, 1)); out.push(`bestiary ${r.bestiary.enemies.length} (basics ${(r.bestiary.basics || []).length}, battles ${r.bestiary.enemies.filter((e) => e.battle).length})`); }
if (r.greatFairies && (r.greatFairies.fairies || []).length) { fs.writeFileSync(join(DIR, "great-fairies.json"), JSON.stringify(strip(r.greatFairies), null, 1)); out.push(`great-fairies ${r.greatFairies.fairies.length}`); }
if (r.sideQuests && (r.sideQuests.regions || []).length) {
  const sq = strip(r.sideQuests); const n = (sq.regions || []).reduce((m, g) => m + (g.quests || []).length, 0);
  fs.writeFileSync(join(DIR, "side-quests.json"), JSON.stringify(sq, null, 1)); out.push(`side-quests ${n} in ${sq.regions.length} groups`);
}
console.log(`✓ ${game} depth written → ${out.join(" · ")}`);
