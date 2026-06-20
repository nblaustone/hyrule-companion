#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK per-region schematic-map Workflow. One agent per shrine region places
   each shrine as an {x,y} on a 0-100 grid from its in-game location, plus the region's tower + a few
   landmarks; a second agent sanity-checks the relative arrangement and bounds. Output →
   knowledge/totk/region-maps.json ({regionKey:{shrines:{name:{x,y}}, tower, fairy, landmarks:[{name,kind,x,y}]}}).
   Shapes match knowledge/region-maps.json so the existing RegionMap renders them. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));
const REGIONS = APP.SHRINES.map((g) => ({
  regionKey: g.regionKey, regionName: g.regionName,
  shrines: g.shrines.map((s) => ({ name: s.name, location: s.location, oneLine: (s.oneLine || "").slice(0, 90) })),
}));

const body = `export const meta = {
  name: 'totk-region-maps',
  description: 'Place each TotK shrine on a 0-100 schematic grid per region, with tower + landmarks',
  phases: [
    { title: 'Place', detail: 'one agent per region lays out shrine coordinates from in-game locations' },
    { title: 'Check', detail: 'sanity-check the relative arrangement, bounds, and coverage' },
  ],
};

const REGIONS = ${JSON.stringify(REGIONS)};

const POINT = { type: "object", additionalProperties: false, properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] };
const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    regionKey: { type: "string" },
    shrines: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["name", "x", "y"] } },
    tower: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, x: { type: "number" }, y: { type: "number" } } },
    landmarks: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, kind: { type: "string", enum: ["town", "stable", "lake", "peak", "tech-lab", "landmark"] }, x: { type: "number" }, y: { type: "number" } } } },
    sources: { type: "array", items: { type: "string" } }, corrections: { type: "string" },
  },
  required: ["regionKey", "shrines"],
};

const ctx = (r) => r.shrines.map((s) => "- " + s.name + " — " + s.location).join("\\n");

const authorPrompt = (r) => \`You are laying out a SCHEMATIC mini-map for one region of The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023). The map is a simple 100x100 box where x grows EAST (right) and y grows SOUTH (down) — like the in-game surface map. You place each shrine as a dot so its RELATIVE position matches where it sits in that region (north shrines near the top, eastern ones to the right, etc.). It does not need pixel precision; relative arrangement is what matters.

Region: \${r.regionName} (\${r.regionKey})
Shrines (name — in-game location):
\${ctx(r)}

Use WebSearch + WebFetch (Game8 TotK interactive map / Zelda Dungeon maps) if you need to confirm where a shrine sits within the region.

Return:
- shrines: EVERY shrine above, each as {name (EXACT, matching the list), x (0-100), y (0-100)}. Spread them out so dots don't overlap (keep centers ~8+ apart); keep all within 6-94.
- tower: this region's Skyview Tower as {name, x, y} if one is in/near this region (omit if none).
- landmarks: 1-4 helpful reference points as {name, kind, x, y} with kind one of town/stable/lake/peak/tech-lab/landmark (e.g. a village, a stable, a major lake/peak). Keep labels short.

HARD RULES: use EXACT shrine names from the list (the app matches dots by name). Don't invent shrines. If a region spans Surface+Sky+Depths, place by the surface footprint (a Sky or Depths shrine sits roughly under/over its surface position). Return {regionKey:"\${r.regionKey}", shrines:[...], tower, landmarks:[...], sources:[...]}.\`;

const verifyPrompt = (r, a) => \`Sanity-check this schematic shrine layout for the TotK region "\${r.regionName}". The grid is 100x100, x=east, y=south.

Proposed:
\${JSON.stringify(a || {}, null, 1)}

Region shrines (name — location):
\${ctx(r)}

Check: (1) EVERY shrine in the list is present with the EXACT name; add any missing one at a sensible spot. (2) Relative positions roughly match each shrine's described location (north→low y, east→high x). Fix any that are clearly misplaced. (3) No two dots within ~6 of each other — nudge overlaps apart. (4) All coords within 6-94. (5) Tower + landmarks are sensible. Return the corrected {regionKey:"\${r.regionKey}", shrines:[...], tower, landmarks:[...], sources, corrections:"<one line>"}.\`;

const results = await pipeline(
  REGIONS,
  (r) => agent(authorPrompt(r), { label: "place:" + r.regionKey, phase: "Place", schema: SCHEMA }),
  (a, r) => a ? agent(verifyPrompt(r, a), { label: "check:" + r.regionKey, phase: "Check", schema: SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((r) => r && Array.isArray(r.shrines) && r.shrines.length);
// reshape to the region-maps.json structure (shrines keyed by name)
const out = {};
for (const r of clean) {
  const shrines = {};
  for (const s of r.shrines) shrines[s.name] = { x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10 };
  out[r.regionKey] = { shrines, tower: r.tower || null, fairy: null, landmarks: r.landmarks || [] };
}
const placed = Object.values(out).reduce((n, m) => n + Object.keys(m.shrines).length, 0);
log("Region maps: " + Object.keys(out).length + " regions · " + placed + " shrines placed");
return { regionMaps: out, regions: Object.keys(out).length, placed };
`;

fs.writeFileSync("/tmp/totk-region-maps-workflow.mjs", body);
console.log(`wrote /tmp/totk-region-maps-workflow.mjs (${body.length} bytes) · ${REGIONS.length} regions`);
