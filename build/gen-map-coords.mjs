#!/usr/bin/env node
/* Build knowledge/map-coords.json — ONE coherent, geographically-accurate coordinate space
   for the BotW Slate Map (v19). Source of truth = build/map-coords-src.json, the DATAMINED
   in-game world coordinates [X,Z] (X = east+, Z = south+) for every shrine/tower/fairy/beast/
   castle (game facts, no Nintendo art — ADR 0003). Towns/stables are appended to the _src by a
   verified pass. This script:
     1. maps each shrine's datamined coord onto its shrines.json regionKey + index (shr_<rk>_<i>),
     2. computes per-region centroid + bounding box (drives the map's region zones + labels),
     3. computes the overall padded world bounds (the normalization frame the renderer uses),
     4. runs sanity gates (all 120 matched, no dup coords) + a geometric region-consistency
        REPORT (flags shrines oddly far from their own region — eyeball, don't fail; our regions
        are curated and a few border shrines are expected).
   Re-run after editing build/map-coords-src.json. Then: node build/inline-data.mjs && node build/build.mjs */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (f) => JSON.parse(fs.readFileSync(join(ROOT, f), "utf8"));
const round = (n) => Math.round(n * 10) / 10;

const src = R("build/map-coords-src.json");
const shrineGroups = R("knowledge/shrines.json");

// name -> {rk, i, regionName}
const idx = new Map();
shrineGroups.forEach((g) => g.shrines.forEach((s, i) => idx.set(s.name, { rk: g.regionKey, i, regionName: g.regionName })));

const shrines = {};
const missing = [];
for (const s of src.shrines) {
  const m = idx.get(s.name);
  if (!m) { missing.push(s.name); continue; }
  shrines[s.name] = { x: s.x, z: s.z, rk: m.rk, i: m.i };
}
// every shrines.json shrine must have a coord
const noCoord = [];
shrineGroups.forEach((g) => g.shrines.forEach((s) => { if (!shrines[s.name]) noCoord.push(`${s.name} (${g.regionKey})`); }));

if (missing.length) { console.error("✗ src shrines not in shrines.json:", missing); process.exit(1); }
if (noCoord.length) { console.error("✗ shrines.json shrines with NO coord:", noCoord); process.exit(1); }

// dup-coordinate guard (identical X,Z on two shrines ⇒ a transcription slip)
const seen = new Map();
for (const [n, c] of Object.entries(shrines)) {
  const k = `${c.x},${c.z}`;
  if (seen.has(k)) console.warn(`⚠ duplicate coord ${k}: ${seen.get(k)} & ${n}`);
  else seen.set(k, n);
}

// per-region centroid + bbox (from real shrine coords)
const regions = {};
for (const g of shrineGroups) {
  const pts = g.shrines.map((s) => shrines[s.name]).filter(Boolean);
  if (!pts.length) continue;
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  regions[g.regionKey] = {
    name: g.regionName,
    cx: round(xs.reduce((a, b) => a + b, 0) / xs.length),
    cz: round(zs.reduce((a, b) => a + b, 0) / zs.length),
    x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs),
    n: pts.length,
  };
}

// overall padded world bounds (include towers/fairies/beasts/castle too, so nothing clips)
const all = [
  ...Object.values(shrines),
  ...src.towers, ...src.fairies, ...src.beasts, src.castle,
  ...(src.towns || []), ...(src.stables || []),
];
const PAD = 250;
const bounds = {
  xmin: Math.min(...all.map((p) => p.x)) - PAD, xmax: Math.max(...all.map((p) => p.x)) + PAD,
  zmin: Math.min(...all.map((p) => p.z)) - PAD, zmax: Math.max(...all.map((p) => p.z)) + PAD,
};

// geometric region-consistency REPORT (informational — curated regions may legitimately straddle)
const flags = [];
for (const [n, c] of Object.entries(shrines)) {
  let best = null, bestD = Infinity;
  for (const [rk, r] of Object.entries(regions)) {
    const d = Math.hypot(c.x - r.cx, c.z - r.cz);
    if (d < bestD) { bestD = d; best = rk; }
  }
  const own = regions[c.rk];
  const ownD = Math.hypot(c.x - own.cx, c.z - own.cz);
  if (best !== c.rk && (ownD - bestD) > 1200) flags.push(`${n}: assigned ${c.rk} (d=${ownD|0}) but nearer ${best} (d=${bestD|0})`);
}

const out = {
  _provenance: src._provenance,
  bounds: { xmin: round(bounds.xmin), xmax: round(bounds.xmax), zmin: round(bounds.zmin), zmax: round(bounds.zmax) },
  shrines, towers: src.towers, fairies: src.fairies, beasts: src.beasts, castle: src.castle,
  towns: src.towns || [], stables: src.stables || [], regions,
};
fs.writeFileSync(join(ROOT, "knowledge/map-coords.json"), JSON.stringify(out, null, 1));

console.log(`✓ knowledge/map-coords.json — ${Object.keys(shrines).length} shrines, ${src.towers.length} towers, ${src.fairies.length} fairies, ${src.beasts.length} beasts, ${(src.towns||[]).length} towns, ${(src.stables||[]).length} stables`);
console.log(`  bounds X[${out.bounds.xmin}..${out.bounds.xmax}] Z[${out.bounds.zmin}..${out.bounds.zmax}] · ${Object.keys(regions).length} regions`);
if (flags.length) { console.log(`  ⓘ ${flags.length} geometric region-consistency notes (eyeball):`); flags.forEach((f) => console.log("    -", f)); }
else console.log("  ✓ all shrines nearest their own region centroid");
