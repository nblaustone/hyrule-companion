#!/usr/bin/env node
/* v9: splice verified "Stuck?" hints into the hand-authored walkthrough region consts.
   Reads /tmp/stuck-hints.json ({regions:[{regionId, hints:[{stepId, stuck}]}], total}),
   inserts `stuck: "<text>",` right after each step's `k: "<kind>",` token in
   HyruleCompanion.jsx. Idempotent (skips steps that already carry a stuck field) and
   honest (reports any stepId it can't place). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "HyruleCompanion.jsx");
const data = JSON.parse(fs.readFileSync("/tmp/stuck-hints.json", "utf8"));
let src = fs.readFileSync(SRC, "utf8");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let applied = 0, skipped = 0, missing = [], toolong = [];

for (const reg of data.regions || []) {
  for (const h of reg.hints || []) {
    if (!h || !h.stepId || !h.stuck) continue;
    let text = String(h.stuck).replace(/\s+/g, " ").trim();
    if (text.length > 240) { toolong.push(`${h.stepId} (${text.length})`); text = text.slice(0, 237).trim() + "…"; }
    // already has a stuck field on this step?
    const hasRe = new RegExp(`id:\\s*"${esc(h.stepId)}",[^\\n]*\\bstuck:`);
    if (hasRe.test(src)) { skipped++; continue; }
    // insert after `id: "X", k: "Y",`
    const re = new RegExp(`(id:\\s*"${esc(h.stepId)}",\\s*k:\\s*"[a-z]+",)`);
    if (!re.test(src)) { missing.push(h.stepId); continue; }
    src = src.replace(re, `$1 stuck: ${JSON.stringify(text)},`);
    applied++;
  }
}

fs.writeFileSync(SRC, src);
console.log(`applied ${applied} hints · skipped ${skipped} (already present)`);
if (toolong.length) console.log(`trimmed over-length: ${toolong.join(", ")}`);
if (missing.length) console.log(`! could not place (stepId not found): ${missing.join(", ")}`);
