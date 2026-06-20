#!/usr/bin/env node
/* v12.11: write the completed side-quest list into knowledge/side-quests.json with STABLE slug ids.
   Reads /tmp/sidequests.json ({regions:[{region, quests:[{name,giver,location,reward,oneLine,how}]}]}).
   Each quest gets a globally-unique `id` (slug of its name) so progress keys (sq_<id>) survive future
   expansion (the v12.11 "perfect shell" rule: no positional progress keys). Strips meta (sources/corrections).
   Preserves region order. Refuses to write if it would drop below the current quest count (additive guard). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "knowledge", "side-quests.json");
const inPath = process.argv.find((a) => a.endsWith(".json")) || "/tmp/sidequests.json";

const data = JSON.parse(fs.readFileSync(inPath, "utf8"));
const regions = data.regions || data;
const prevCount = JSON.parse(fs.readFileSync(OUT, "utf8")).reduce((n, g) => n + g.quests.length, 0);

const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const slugify = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "q";

// BotW quest names are unique in the Adventure Log, so a name listed in two adjacent regions is the SAME quest
// (parallel region agents both claimed a boundary quest). Dedupe by name globally, keeping the first occurrence.
const seen = new Set();
const seenName = new Set();
let dropped = [];
const out = regions.map((g) => ({
  region: norm(g.region),
  quests: (g.quests || []).filter((q) => q && q.name).filter((q) => {
    const nk = norm(q.name).toLowerCase();
    if (seenName.has(nk)) { dropped.push(q.name + " (" + norm(g.region) + ")"); return false; }
    seenName.add(nk); return true;
  }).map((q) => {
    let id = slugify(q.name);
    if (seen.has(id)) { let n = 2; while (seen.has(id + "-" + n)) n++; id = id + "-" + n; }
    seen.add(id);
    return {
      id,
      name: norm(q.name),
      giver: norm(q.giver),
      ...(q.location ? { location: norm(q.location) } : {}),
      reward: norm(q.reward),
      oneLine: norm(q.oneLine),
      ...(q.how ? { how: norm(q.how) } : {}),
    };
  }),
}));

const total = out.reduce((n, g) => n + g.quests.length, 0);
if (total < prevCount) { console.error(`REFUSING: ${total} quests < current ${prevCount} (would drop data). Aborting.`); process.exit(1); }

fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote side-quests.json: ${total} quests across ${out.length} regions (was ${prevCount}) · all ids unique: ${seen.size === total}`);
if (dropped.length) console.log(`deduped ${dropped.length} cross-region duplicate(s): ${dropped.join(", ")}`);
out.forEach((g) => console.log(`  - ${g.region}: ${g.quests.length}`));
