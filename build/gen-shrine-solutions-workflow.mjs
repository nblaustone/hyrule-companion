#!/usr/bin/env node
/* v12.7: generate the shrine-solutions Workflow with the 100 remaining shrines inlined.
   Mirrors gen-stuck-workflow.mjs. Per shrine: an author agent web-researches and writes
   the spoiler-gated `solution` (the "exact how"), then an adversarial verifier independently
   fact-checks against a SECOND source and corrects in place. Workflow scripts can't read
   files, so the shrine list + style exemplars are embedded as consts (learning-log gotcha:
   never pass structured arrays via `args`). Output → the workflow return value, which the
   orchestrator writes to /tmp/shrine-solutions.json and merge-shrine-solutions.mjs splices
   into knowledge/shrines.json (only the `solution` field is written). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHRINES = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "shrines.json"), "utf8"));

// every shrine still missing a solution, flattened with its region key/name
const TODO = [];
for (const g of SHRINES) {
  for (const s of g.shrines) {
    if (!s.solution || !String(s.solution).trim()) {
      TODO.push({
        regionKey: g.regionKey,
        regionName: g.regionName,
        name: s.name,
        location: s.location,
        category: s.category,
        oneLine: s.oneLine,
        shrineQuest: s.shrineQuest || null,
      });
    }
  }
}

// two anchors from the verified 20-shrine sample so authors match voice + length
const find = (n) => { for (const g of SHRINES) for (const s of g.shrines) if (s.name === n) return s.solution; };
const EX_PUZZLE = find("Oman Au Shrine");
const EX_HIDDEN = find("Lakna Rokee Shrine");

const body = `export const meta = {
  name: 'botw-shrine-solutions',
  description: 'Author + adversarially verify sourced, spoiler-gated shrine solutions for the 100 remaining BotW shrines',
  phases: [
    { title: 'Author', detail: 'one agent per shrine web-researches and writes the exact-how solution' },
    { title: 'Verify', detail: 'an independent skeptic fact-checks each solution against a second source and corrects' },
  ],
};

const TODO = ${JSON.stringify(TODO)};
const EX_PUZZLE = ${JSON.stringify(EX_PUZZLE)};
const EX_HIDDEN = ${JSON.stringify(EX_HIDDEN)};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    regionKey: { type: "string" },
    name: { type: "string" },
    solution: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["regionKey", "name", "solution"],
};

const ctx = (s) => [
  \`Shrine: \${s.name}\`,
  \`Region: \${s.regionName} (regionKey \${s.regionKey})\`,
  \`Map location (from our data): \${s.location}\`,
  \`Category: \${s.category}\`,
  \`Our one-line hint: \${s.oneLine}\`,
  s.shrineQuest ? \`HIDDEN — appears only via the shrine quest: "\${s.shrineQuest}"\` : \`Not hidden — the shrine is visible on the map; player just has to clear it.\`,
].join("\\n");

const authorPrompt = (s) => \`You are writing the spoiler-gated "solution" for ONE shrine in a beginner-first, offline companion for The Legend of Zelda: Breath of the Wild (Switch, the original 2017 game — NOT Tears of the Kingdom). The solution sits behind a "Stuck? Tap for the exact how" button on the shrine's row, so it is the precise, concrete walkthrough a first-timer reads only when stuck.

\${ctx(s)}

RESEARCH FIRST. Use WebSearch + WebFetch to look this exact shrine up on real BotW guides — Game8, Zelda Dungeon, Thonky's Zelda Dungeon (thonky.com), Zeldapedia/Fandom, Shacknews, GameFAQs. Read at least one full walkthrough of THIS shrine before writing. Get the mechanics exactly right (which rune, which direction, what each chest holds).

WHAT TO WRITE (one flowing paragraph, second person, plain prose):
- If the shrine is HIDDEN (a shrine quest is named above): START with HOW TO MAKE IT APPEAR — the trigger or the steps of that exact shrine quest (where it starts, what you do, what reveals the shrine). THEN how to finish inside. Many hidden shrines are "blessing" shrines with no puzzle — if so, say the orb is free once it appears, and name the chest reward.
- If it is a PUZZLE/COMBAT/MIXED shrine: give the actual trick to clear it, step by step — the rune to use, the order, the exact move at the part people get stuck on.
- If it is a BLESSING shrine (free orb, "...'s Blessing" with no quest): say the orb is free, how to reach/open the chest, and what the chest holds.
- ALWAYS mention any optional treasure chest worth a detour and NAME its contents, and end by claiming the Spirit Orb from the monk's altar.

HARD RULES (the guide's three laws):
- DON'T INVENT. Every mechanical claim must trace to a source you actually read. If you are not sure what a chest holds or the precise trick, describe only what you are confident of and say the rest plainly (e.g. "a chest off to the side" without naming loot you can't confirm) — never fabricate an item name, a direction, or a trick. An honest, slightly-vaguer line beats a confident wrong one.
- Beginner-first and spoiler-aware: explain mechanics simply; do not spoil unrelated story beats or later bosses.
- Use correct in-game proper names (shrine name, quest name, item names, rune names: Magnesis, Stasis, Remote Bomb, Cryonis).
- Plain text only: no markdown, no headings, no bullet points, no surrounding quotes. One paragraph, roughly 450–950 characters (match the examples' depth).
- Match the VOICE and SHAPE of these two verified examples:
  PUZZLE EXAMPLE (Oman Au): \${EX_PUZZLE}
  HIDDEN EXAMPLE (Lakna Rokee): \${EX_HIDDEN}

Return JSON {regionKey:"\${s.regionKey}", name:"\${s.name}", solution:"<the paragraph>", sources:["<url or guide name>", ...]}.\`;

const verifyPrompt = (s, authored) => \`You are an adversarial fact-checker protecting the honesty law of a Breath of the Wild (Switch, 2017 original) walkthrough. Verify ONE shrine solution and return a corrected final version.

\${ctx(s)}

Proposed solution to verify:
"\${(authored && authored.solution) || ""}"

DO YOUR OWN RESEARCH from an INDEPENDENT source (prefer a different guide than any listed here: \${JSON.stringify((authored && authored.sources) || [])}). Use WebSearch + WebFetch on Game8 / Zelda Dungeon / Thonky / Zeldapedia and read this shrine's actual walkthrough.

Check EVERY claim:
- The right rune / mechanic / order for the puzzle, and the exact move at the sticking point.
- For a HIDDEN shrine: that the named shrine quest and its trigger/steps are correct and actually reveal THIS shrine.
- Directions, named NPCs, and especially CHEST CONTENTS (these are the most common errors — confirm each item name or remove it).
- That it ends by claiming the Spirit Orb, is one plain-text paragraph (no markdown), ~450–950 chars, beginner-first, spoiler-aware, correct proper names.

FIX errors in place. If a specific claim cannot be verified, SOFTEN or REMOVE it rather than ship a guess (e.g. drop an unconfirmed item name). The goal is a solution you are confident is correct and genuinely unsticks a first-timer.

Return the FINAL corrected JSON {regionKey:"\${s.regionKey}", name:"\${s.name}", solution:"<corrected paragraph>", sources:[...], corrections:"<one short line: what you changed, or 'no changes'>"}.\`;

const results = await pipeline(
  TODO,
  (s) => agent(authorPrompt(s), { label: "author:" + s.name, phase: "Author", schema: SCHEMA }),
  (authored, s) => authored
    ? agent(verifyPrompt(s, authored), { label: "verify:" + s.name, phase: "Verify", schema: SCHEMA })
    : null,
);

const clean = results.filter(Boolean).filter((r) => r && r.solution && r.solution.trim());
log(\`Verified \${clean.length}/\${TODO.length} shrine solutions\`);
const missing = TODO.filter((s) => !clean.find((r) => r.name === s.name)).map((s) => s.name);
if (missing.length) log("MISSING (re-run): " + missing.join(", "));
return { solutions: clean, total: clean.length, expected: TODO.length, missing };
`;

fs.writeFileSync("/tmp/shrine-solutions-workflow.mjs", body);
console.log(`wrote /tmp/shrine-solutions-workflow.mjs (${body.length} bytes) · ${TODO.length} shrines to solve`);
