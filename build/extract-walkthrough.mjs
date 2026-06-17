#!/usr/bin/env node
/* One-off helper (v9): pull the hand-authored BotW walkthrough region consts out of
   HyruleCompanion.jsx into a flat JSON the "Stuck?" hint workflow can read.
   The region objects are pure literals, so we brace-match each `const NAME = {…};`
   block and eval it in isolation. Output: /tmp/walkthrough.json. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "HyruleCompanion.jsx"), "utf8");

// the REGIONS array in source order
const m = src.match(/const REGIONS = \[([^\]]+)\];/);
if (!m) { console.error("REGIONS array not found"); process.exit(1); }
const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);

function extractObj(name) {
  const start = src.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`const ${name} not found`);
  let i = src.indexOf("{", start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const text = src.slice(src.indexOf("{", start), end + 1);
  // eslint-disable-next-line no-eval
  return (0, eval)("(" + text + ")");
}

const out = [];
for (const name of names) {
  const reg = extractObj(name);
  const steps = [];
  for (const sec of reg.sections || [])
    for (const st of sec.steps || [])
      steps.push({ id: st.id, k: st.k, t: st.t, section: sec.name, stuck: st.stuck || null });
  out.push({ const: name, id: reg.id, name: reg.name, kind: reg.kind, steps });
}

fs.writeFileSync("/tmp/walkthrough.json", JSON.stringify(out, null, 1));
const total = out.reduce((n, r) => n + r.steps.length, 0);
console.log(`extracted ${out.length} regions, ${total} steps → /tmp/walkthrough.json`);
for (const r of out) console.log(`  ${r.const.padEnd(16)} ${r.name} — ${r.steps.length} steps`);
