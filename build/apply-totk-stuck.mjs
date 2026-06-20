#!/usr/bin/env node
/* v13 (TotK parity): splice verified "Stuck?" hints into knowledge/totk/walkthrough.json (the SOURCE the
   assembler reads), setting each step's `stuck` field by stepId. Idempotent (overwrites a step's stuck only
   when a new hint is provided), honest (reports any stepId it can't place). Run assemble-totk.mjs afterward. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "knowledge", "totk", "walkthrough.json");
const inPath = process.argv.find((a) => a.endsWith(".json")) || join(ROOT, "knowledge", "totk", "stuck-hints.json");

const walkthrough = JSON.parse(fs.readFileSync(SRC, "utf8"));
const data = JSON.parse(fs.readFileSync(inPath, "utf8"));

const byId = new Map();
for (const r of walkthrough) for (const sec of r.sections || []) for (const st of sec.steps || []) byId.set(st.id, st);

let applied = 0, missing = [], toolong = [];
for (const reg of data.regions || []) {
  for (const h of reg.hints || []) {
    if (!h || !h.stepId || !h.stuck) continue;
    let text = String(h.stuck).replace(/\s+/g, " ").trim();
    if (text.length > 240) { toolong.push(`${h.stepId} (${text.length})`); text = text.slice(0, 237).trim() + "…"; }
    const st = byId.get(h.stepId);
    if (!st) { missing.push(h.stepId); continue; }
    st.stuck = text;
    applied++;
  }
}

fs.writeFileSync(SRC, JSON.stringify(walkthrough, null, 1) + "\n");
console.log(`applied ${applied} hints to walkthrough.json`);
if (toolong.length) console.log(`trimmed over-length: ${toolong.join(", ")}`);
if (missing.length) console.log(`! could not place (stepId not found): ${missing.join(", ")}`);
console.log("→ now run: node build/assemble-totk.mjs && node build/inline-data.mjs && node build/build.mjs");
