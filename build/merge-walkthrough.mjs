#!/usr/bin/env node
/* Merge a walkthrough Workflow's verified chapters into knowledge/<game>/walkthrough.json, KEEPING the
   hand-authored opening chapter(s) already in that file and appending the workflow chapters in order.
   Strips agent `changes`/notes meta, asserts globally-unique section/step ids, and refuses to write on a
   collision. Usage:  node build/merge-walkthrough.mjs <game> <workflow-output.json>
   The output file is the task .output (its `.result` holds { chapters: [...] }), or a raw { chapters } JSON. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [game, outPath] = process.argv.slice(2);
if (!game || !outPath) { console.error("usage: merge-walkthrough.mjs <game> <output.json>"); process.exit(1); }
const WT = join(ROOT, "knowledge", game, "walkthrough.json");

const rawOut = JSON.parse(fs.readFileSync(outPath, "utf8"));
const result = typeof rawOut.result === "string" ? JSON.parse(rawOut.result) : (rawOut.result || rawOut);
const wfChapters = (result.chapters || []).map((c) => { const { changes, notes, confidence, ...rest } = c; rest.kind = rest.kind || "region"; return rest; });

const existing = JSON.parse(fs.readFileSync(WT, "utf8"));
const wfIds = new Set(wfChapters.map((c) => c.id));
// keep the hand-authored opening chapters (those NOT re-authored by the workflow), in their original order
const opening = existing.filter((c) => !wfIds.has(c.id));
const combined = [...opening, ...wfChapters];

// global uniqueness of section + step ids
const seen = new Map(); const dups = [];
for (const ch of combined) {
  for (const sec of ch.sections || []) {
    if (seen.has(sec.id)) dups.push(`section ${sec.id} (in ${ch.id} & ${seen.get(sec.id)})`); else seen.set(sec.id, ch.id);
    for (const st of sec.steps || []) {
      if (seen.has(st.id)) dups.push(`step ${st.id} (in ${ch.id} & ${seen.get(st.id)})`); else seen.set(st.id, ch.id);
    }
  }
}
if (dups.length) { console.error("✗ DUPLICATE IDS — refusing to write:\n  " + dups.join("\n  ")); process.exit(2); }

const steps = combined.reduce((n, r) => n + (r.sections || []).reduce((m, s) => m + (s.steps || []).length, 0), 0);
fs.writeFileSync(WT, JSON.stringify(combined, null, 1));
console.log(`✓ ${game}: ${combined.length} chapters (${opening.length} opening + ${wfChapters.length} workflow), ${steps} steps, ids unique`);
console.log("  chapters:", combined.map((c) => c.id).join(", "));
