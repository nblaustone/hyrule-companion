#!/usr/bin/env node
/* v9: generate the "Stuck?" hint workflow with the walkthrough data inlined
   (workflow scripts can't read files, so we embed the steps as a const). */
import fs from "node:fs";
const REGIONS = JSON.parse(fs.readFileSync("/tmp/walkthrough.json", "utf8"));

const body = `export const meta = {
  name: 'botw-stuck-hints',
  description: 'Author + adversarially verify sourced, spoiler-aware "Stuck?" hints for the BotW walkthrough',
  phases: [{ title: 'Author', detail: 'one agent per region drafts hints for stallable steps' }, { title: 'Verify', detail: 'web-verify each hint, drop the unsure' }],
};

const REGIONS = ${JSON.stringify(REGIONS)};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    regionId: { type: "string" },
    hints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { stepId: { type: "string" }, stuck: { type: "string" } },
        required: ["stepId", "stuck"],
      },
    },
  },
  required: ["regionId", "hints"],
};

const stepList = (reg) => reg.steps.map((s) => \`- \${s.id} [\${s.k}] (\${s.section}): \${s.t}\`).join("\\n");

const authorPrompt = (reg) => \`You are writing optional "Stuck?" hints for a beginner-first walkthrough of The Legend of Zelda: Breath of the Wild (Switch). Each hint is hidden behind a "Stuck? tap for the exact how" button shown UNDER a walkthrough step, so it gives the precise, concrete how-to a first-timer needs ONLY when stuck — without bloating the step.

Region: \${reg.name} (\${reg.kind}).
Steps (id [kind] (section): text):
\${stepList(reg)}

Write a hint ONLY for steps where a genuine first-timer could get stuck or lost: a puzzle whose solution isn't obvious, an exact location that's hard to find, a tricky combat moment, an easy-to-miss item/chest, or a mechanic the step names but doesn't fully spell out.

HARD RULES:
- Quality over coverage. Do NOT add hints to self-explanatory steps. Expect ~3-7 hints for this region, NOT one per step. Tutorial/Plateau steps that teach a rune deserve more; pure "walk here / talk to X" steps usually need none.
- Each hint <= 220 characters, ONE line, plain text only (no markdown, no newlines, no quotes around it).
- Must ADD information beyond the step text (exact directions, the precise trick, the common mistake). Never restate the step.
- Use correct in-game proper names. VERIFY them with web search against real BotW guides (Game8, Zelda Dungeon, Zeldapedia, GameFAQs).
- Spoiler-aware: help only with the step at hand; never reveal later bosses or story beats.
- Honest (the guide's first law): if you are not confident a detail is correct, OMIT that step rather than guess.

Return {regionId:"\${reg.id}", hints:[{stepId, stuck}]} with stepId matching the ids above EXACTLY.\`;

const verifyPrompt = (reg, authored) => \`Adversarially verify these "Stuck?" hints for the Breath of the Wild region "\${reg.name}". Your job is to be a skeptic and protect the guide's honesty law.

Region steps (context):
\${stepList(reg)}

Proposed hints:
\${JSON.stringify((authored && authored.hints) || [], null, 1)}

For EACH proposed hint: web-check its factual claims against real BotW guides; confirm it genuinely helps its step and adds info beyond the step text; confirm <=220 chars, one line, plain text, spoiler-aware, correct in-game names, and stepId matches a real id above.

DROP any hint that is wrong, unverifiable, merely restates the step, spoils later content, or is over length. Fix small factual errors (names, directions) in place. Return the cleaned {regionId:"\${reg.id}", hints:[{stepId, stuck}]} containing ONLY hints you are confident are correct and useful. An empty hints array is a valid, honest answer for a region that needs none.\`;

const results = await pipeline(
  REGIONS,
  (reg) => agent(authorPrompt(reg), { label: "author:" + reg.id, phase: "Author", schema: SCHEMA }),
  (authored, reg) => authored
    ? agent(verifyPrompt(reg, authored), { label: "verify:" + reg.id, phase: "Verify", schema: SCHEMA })
    : { regionId: reg.id, hints: [] },
);

const clean = results.filter(Boolean);
const total = clean.reduce((n, r) => n + (r.hints ? r.hints.length : 0), 0);
log(\`Verified hints: \${total} across \${clean.length} regions\`);
return { regions: clean, total };
`;

fs.writeFileSync("/tmp/stuck-workflow.mjs", body);
console.log("wrote /tmp/stuck-workflow.mjs (" + body.length + " bytes)");
