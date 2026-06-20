#!/usr/bin/env node
/* v12.11: generate the side-quest completion Workflow.
   Per region: author the COMPLETE base-game (no DLC) BotW side-quest list — reconciling with our existing
   entries (keep all real ones, fix, ADD every missing one) — each with giver/location/reward/oneLine + a
   spoiler-gated `how`. Then an independent verifier confirms completeness + accuracy against a second source.
   Shrine quests are EXCLUDED (they're tracked separately, derived from shrines.json). Workflow scripts can't
   read files, so the region list + existing quests are embedded as consts. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQ = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "side-quests.json"), "utf8"));
// names of shrine quests so the author can avoid re-listing them as side quests
const SHRINES = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "shrines.json"), "utf8"));
const SHRINE_QUESTS = [...new Set(SHRINES.flatMap((g) => g.shrines.map((s) => s.shrineQuest).filter(Boolean)))];

const REGIONS = SQ.map((g) => ({ region: g.region, existing: g.quests.map((q) => ({ name: q.name, oneLine: q.oneLine })) }));

const body = `export const meta = {
  name: 'botw-sidequests-complete',
  description: 'Author + verify the COMPLETE base-game BotW side-quest list, region by region',
  phases: [
    { title: 'Author', detail: 'per region: complete the side-quest list (existing + every missing one) with how-to' },
    { title: 'Verify', detail: 'per region: confirm completeness + accuracy against a second source' },
  ],
};

const REGIONS = ${JSON.stringify(REGIONS)};
const SHRINE_QUESTS = ${JSON.stringify(SHRINE_QUESTS)};

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    region: { type: "string" },
    quests: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        name: { type: "string" },
        giver: { type: "string" },
        location: { type: "string" },
        reward: { type: "string" },
        oneLine: { type: "string" },
        how: { type: "string" },
      },
      required: ["name", "giver", "reward", "oneLine", "how"],
    } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["region", "quests"],
};

const authorPrompt = (r) => \`You are completing the SIDE-QUEST list for one region of a beginner-first companion to The Legend of Zelda: Breath of the Wild (Switch, the 2017 ORIGINAL — NO DLC content, NO Tears of the Kingdom). The goal: a COMPLETE, accurate list of every base-game side quest in/around this region, so the player can track and finish them all.

Region: \${r.region}

Side quests we ALREADY have here (keep every one of these — improve wording only if wrong; DO NOT drop any):
\${r.existing.map((q) => "- " + q.name + " — " + q.oneLine).join("\\n")}

RESEARCH with WebSearch + WebFetch: pull this region's FULL base-game side-quest list from Game8 and Zelda Dungeon (they list side quests by region/the Adventure Log). Add EVERY missing base-game side quest for this region. Aim for completeness — most regions have several we're missing.

HARD RULES:
- EXCLUDE shrine quests entirely (they're tracked elsewhere). Do not list any of these names: \${JSON.stringify(SHRINE_QUESTS)}.
- EXCLUDE DLC quests (The Champions' Ballad, Master Trials, EX quests, amiibo).
- Use EXACT in-game quest names.
- For each quest: giver (who starts it + roughly where), location (the area/town), reward (item/rupees/outcome — "none/unlock" if minor), oneLine (one-sentence what-it-is), and how (a spoiler-gated, concrete how-to-complete in ~1-3 plain sentences — the actual steps, like our shrine solutions).
- Honesty law: only include real, confirmed base-game side quests for THIS region; if unsure whether a quest belongs to this region, place it where the source does. Don't invent.

Return {region:"\${r.region}", quests:[{name,giver,location,reward,oneLine,how}], sources:[...]} — existing ones FIRST (in the given order), then the new ones.\`;

const verifyPrompt = (r, authored) => \`Adversarially verify the COMPLETE side-quest list for the BotW (Switch, 2017 original, no DLC) region "\${r.region}". Be a skeptic on two axes: COMPLETENESS and ACCURACY.

Proposed list:
\${JSON.stringify((authored && authored.quests) || [], null, 1)}

Independently re-source this region's full side-quest list (prefer a different guide than \${JSON.stringify((authored && authored.sources) || [])}) with WebSearch + WebFetch. Then:
- COMPLETENESS: add any base-game side quest for this region that's missing.
- ACCURACY: confirm each quest is real, belongs to this region, has a correct giver/location/reward and a correct how-to. Fix errors in place.
- PURGE: remove any shrine quest (names: \${JSON.stringify(SHRINE_QUESTS)}), any DLC quest, and any duplicate or fabricated entry.
- Keep exact in-game names; keep each how to ~1-3 plain sentences.
Return the corrected, complete {region:"\${r.region}", quests:[...], sources:[...], corrections:"<one line>"}.\`;

const results = await pipeline(
  REGIONS,
  (r) => agent(authorPrompt(r), { label: "author:" + r.region, phase: "Author", schema: SCHEMA }),
  (a, r) => a ? agent(verifyPrompt(r, a), { label: "verify:" + r.region, phase: "Verify", schema: SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((x) => x && Array.isArray(x.quests) && x.quests.length);
const total = clean.reduce((n, g) => n + g.quests.length, 0);
log(\`Side quests: \${total} across \${clean.length} regions\`);
return { regions: clean, total };
`;

fs.writeFileSync("/tmp/sidequests-workflow.mjs", body);
console.log(`wrote /tmp/sidequests-workflow.mjs (${body.length} bytes) · ${REGIONS.length} regions, ${SHRINE_QUESTS.length} shrine quests to exclude`);
