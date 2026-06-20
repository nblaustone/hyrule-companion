#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK "Stuck?" hint Workflow. Mirrors gen-stuck-workflow.mjs (BotW) but
   reads the TotK walkthrough from knowledge/totk/app-data.json (REGIONS), flattens steps with section
   context, and embeds them as a const. Output → knowledge/totk/stuck-hints.json; build/apply-totk-stuck.mjs
   splices each `stuck` onto the matching step in knowledge/totk/walkthrough.json (so re-assembly carries it). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));

const REGIONS = APP.REGIONS.map((r) => ({
  id: r.id, name: r.name, kind: r.kind,
  steps: r.sections.flatMap((sec) => sec.steps.map((st) => ({ id: st.id, k: st.k, section: sec.name, t: st.t }))),
}));

const body = `export const meta = {
  name: 'totk-stuck-hints',
  description: 'Author + adversarially verify sourced, spoiler-aware "Stuck?" hints for the TotK walkthrough',
  phases: [{ title: 'Author', detail: 'one agent per region drafts hints for stallable steps' }, { title: 'Verify', detail: 'web-verify each hint, drop the unsure' }],
};

const REGIONS = ${JSON.stringify(REGIONS)};

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    regionId: { type: "string" },
    hints: { type: "array", items: { type: "object", additionalProperties: false, properties: { stepId: { type: "string" }, stuck: { type: "string" } }, required: ["stepId", "stuck"] } },
  },
  required: ["regionId", "hints"],
};

const stepList = (reg) => reg.steps.map((s) => \`- \${s.id} [\${s.k}] (\${s.section}): \${s.t}\`).join("\\n");

const authorPrompt = (reg) => \`You are writing optional "Stuck?" hints for a beginner-first walkthrough of The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild). Each hint is hidden behind a "Stuck? tap for the exact how" button shown UNDER a walkthrough step, so it gives the precise, concrete how-to a first-timer needs ONLY when stuck — without bloating the step.

Region: \${reg.name} (\${reg.kind}).
Steps (id [kind] (section): text):
\${stepList(reg)}

Write a hint ONLY for steps where a genuine first-timer could get stuck or lost: a puzzle whose solution isn't obvious, a build/Ultrahand/Ascend/Recall step, an exact location that's hard to find, a tricky combat moment, an easy-to-miss item/chest, or a mechanic the step names but doesn't fully spell out.

HARD RULES:
- Quality over coverage. Do NOT add hints to self-explanatory steps. Expect ~3-7 hints for this region, NOT one per step. Tutorial/Great Sky Island steps that teach an ability deserve more; pure "walk here / talk to X" steps usually need none.
- Each hint <= 220 characters, ONE line, plain text only (no markdown, no newlines, no quotes around it).
- Must ADD information beyond the step text (exact directions, the precise trick, the common mistake). Never restate the step.
- Use correct TOTK in-game proper names and mechanics (Ultrahand, Fuse, Ascend, Recall, Autobuild, Zonai devices, Lights of Blessing, the sages Tulin/Yunobo/Sidon/Riju/Mineru). VERIFY them with web search against real TotK guides (Game8 TotK, Zelda Dungeon, IGN). Do NOT use BotW mechanics (no Magnesis/Stasis/Cryonis/Sheikah Slate/Divine Beasts).
- Spoiler-aware: help only with the step at hand; never reveal later bosses or story beats.
- Honest (the guide's first law): if you are not confident a detail is correct, OMIT that step rather than guess.

Return {regionId:"\${reg.id}", hints:[{stepId, stuck}]} with stepId matching the ids above EXACTLY.\`;

const verifyPrompt = (reg, authored) => \`Adversarially verify these "Stuck?" hints for the Tears of the Kingdom region "\${reg.name}". Your job is to be a skeptic and protect the guide's honesty law.

Region steps (context):
\${stepList(reg)}

Proposed hints:
\${JSON.stringify((authored && authored.hints) || [], null, 1)}

For EACH proposed hint: web-check its factual claims against real TotK guides (Game8 / Zelda Dungeon / IGN); confirm it genuinely helps its step and adds info beyond the step text; confirm it uses TotK mechanics (not BotW); confirm <=220 chars, one line, plain text, spoiler-aware, correct in-game names, and stepId matches a real id above.

DROP any hint that is wrong, unverifiable, merely restates the step, spoils later content, uses BotW mechanics, or is over length. Fix small factual errors (names, directions) in place. Return the cleaned {regionId:"\${reg.id}", hints:[{stepId, stuck}]} containing ONLY hints you are confident are correct and useful. An empty hints array is a valid, honest answer for a region that needs none.\`;

const results = await pipeline(
  REGIONS,
  (reg) => agent(authorPrompt(reg), { label: "author:" + reg.id, phase: "Author", schema: SCHEMA }),
  (authored, reg) => authored
    ? agent(verifyPrompt(reg, authored), { label: "verify:" + reg.id, phase: "Verify", schema: SCHEMA })
    : { regionId: reg.id, hints: [] },
);

const clean = results.filter(Boolean);
const total = clean.reduce((n, r) => n + (r.hints ? r.hints.length : 0), 0);
log(\`Verified TotK hints: \${total} across \${clean.length} regions\`);
return { regions: clean, total };
`;

fs.writeFileSync("/tmp/totk-stuck-workflow.mjs", body);
console.log("wrote /tmp/totk-stuck-workflow.mjs (" + body.length + " bytes) · " + REGIONS.length + " regions");
