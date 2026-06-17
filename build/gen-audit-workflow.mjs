#!/usr/bin/env node
/* v9.2: generate the BotW walkthrough honesty-audit workflow with the walkthrough data inlined.
   Finder (1/region) web-verifies every factual claim in each step's `t` (and `stuck`) and flags ONLY
   clear errors with a source + full corrected text. Verifier (1/region) adversarially re-checks each
   flagged item and keeps only confirmed, high-confidence corrections. Memories already audited -> skipped. */
import fs from "node:fs";
const ALL = JSON.parse(fs.readFileSync("/tmp/walkthrough.json", "utf8"));
const REGIONS = ALL.filter((r) => r.id !== "memories"); // memories audited separately

const body = `export const meta = {
  name: 'botw-walkthrough-audit',
  description: 'Source-verify BotW walkthrough route/fact claims; flag + adversarially confirm only real errors',
  phases: [{ title: 'Find', detail: 'one agent per region web-checks every factual claim' }, { title: 'Verify', detail: 'independently confirm each flagged error; drop false positives' }],
};

const REGIONS = ${JSON.stringify(REGIONS)};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    regionId: { type: "string" },
    errors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stepId: { type: "string" },
          field: { type: "string", enum: ["t", "stuck"] },
          current: { type: "string" },
          corrected: { type: "string" },
          reason: { type: "string" },
          source: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium"] },
        },
        required: ["stepId", "field", "current", "corrected", "reason", "source", "confidence"],
      },
    },
  },
  required: ["regionId", "errors"],
};

const stepList = (reg) => reg.steps.map((s) => {
  let line = \`- \${s.id} [\${s.k}] (\${s.section})\\n    t: \${s.t}\`;
  if (s.stuck) line += \`\\n    stuck: \${s.stuck}\`;
  return line;
}).join("\\n");

const findPrompt = (reg) => \`You are fact-checking a beginner-first walkthrough of The Legend of Zelda: Breath of the Wild (Switch) against real sources. This is an HONESTY audit: the guide's first law is "don't invent — every claim traces to a real source." A prior pass already found that the original walkthrough carries unsourced geography errors (e.g. a memory route that said "glide from Ja Baij Shrine" when Ja Baij is on the Great Plateau, nowhere near the target).

Region: \${reg.name}.
Steps (id [kind] (section), with t = the step instruction and optional stuck = a hidden hint):
\${stepList(reg)}

Web-verify every CHECKABLE FACTUAL CLAIM against real BotW guides (Game8, Zelda Dungeon, Zeldapedia/Zelda Wiki, GamesRadar, GameFAQs): place/region names, compass directions, which tower/stable/shrine to start from, shrine names + their rune/trial, item names, enemy names, NPC names, armor/effect requirements (e.g. "needs cold resistance"), and numeric claims (damage, counts).

Flag a step ONLY when a claim is clearly WRONG or unsourceable — a place in the wrong region, a backwards direction, a misnamed shrine/item/enemy, an impossible route, or a false requirement. For each, give the FULL corrected replacement text for that field (same concise voice, plain text, one line, roughly the same length), a one-line reason, and the source you verified against.

DO NOT flag:
- Stylistic wording, "could be more precise", or harmless simplifications that are still correct.
- Deliberate beginner framing or spoiler-aware vagueness.
- Anything you cannot disprove with a real source. When unsure, leave it. An empty errors array is the expected, honest result for an accurate region — most steps are correct.

Be conservative: it is far worse to "correct" a right claim into a wrong one than to miss a subtle error. Mark confidence "high" only when a source directly contradicts the current text.

Return {regionId:"\${reg.id}", errors:[{stepId, field, current, corrected, reason, source, confidence}]} with stepId matching the ids above exactly and field being "t" or "stuck".\`;

const verifyPrompt = (reg, found) => \`Adversarially verify these proposed corrections to the BotW walkthrough region "\${reg.name}". Be a skeptic: your job is to protect the guide from BOTH wrong original content AND wrong "fixes".

Region steps (context):
\${stepList(reg)}

Proposed corrections:
\${JSON.stringify((found && found.errors) || [], null, 1)}

For EACH proposed correction: independently web-check (Game8, Zelda Dungeon, Zelda Wiki, GamesRadar, GameFAQs) whether the CURRENT text is genuinely wrong AND whether the CORRECTED text is right.

KEEP a correction only if: the original is verifiably wrong, the replacement is verifiably correct, and you'd stake the guide's honesty on it. DROP it if the original was actually fine (false positive), if the "fix" introduces any new inaccuracy, or if you can't confirm it with a source. Tighten the corrected text if it's slightly off, over-long, or not one plain line. Downgrade confidence to "medium" if a source is indirect.

Return the cleaned {regionId:"\${reg.id}", errors:[...]} containing ONLY confirmed corrections. An empty array is the correct answer when the region is accurate or all proposals were false positives.\`;

const results = await pipeline(
  REGIONS,
  (reg) => agent(findPrompt(reg), { label: "find:" + reg.id, phase: "Find", schema: SCHEMA }),
  (found, reg) => found
    ? agent(verifyPrompt(reg, found), { label: "verify:" + reg.id, phase: "Verify", schema: SCHEMA })
    : { regionId: reg.id, errors: [] },
);

const clean = results.filter(Boolean);
const total = clean.reduce((n, r) => n + (r.errors ? r.errors.length : 0), 0);
const high = clean.reduce((n, r) => n + (r.errors || []).filter((e) => e.confidence === "high").length, 0);
log(\`Confirmed corrections: \${total} (\${high} high-confidence) across \${clean.length} regions\`);
return { regions: clean, total, high };
`;

fs.writeFileSync("/tmp/audit-workflow.mjs", body);
console.log("wrote /tmp/audit-workflow.mjs (" + body.length + " bytes) · " + REGIONS.length + " regions");
