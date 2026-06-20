#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK side-quest Workflow. TotK has no existing side-quest data, so each
   region agent ENUMERATES the complete base-game list (Side Quests + the meatier Side Adventures) from the
   web, each with giver/location/reward/oneLine + a spoiler-gated `how`, then an independent verifier confirms
   completeness + accuracy against a second source. Shrine quests are EXCLUDED (tracked separately, derived
   from shrines.json), as are main quests and the repeatable Addison-sign "Potential Princess Sightings".
   Output → knowledge/totk/side-quests.json ({regions:[{region,quests:[...]}]}); assemble-totk adds slug ids. */
import fs from "node:fs";

// TotK surface+sky regions, grouped roughly the way the guides do (towns are the quest hubs)
const REGIONS = [
  "Lookout Landing & Central Hyrule",
  "Necluda (Hateno Village, Dueling Peaks)",
  "Lanayru (Zora's Domain & the Wetlands)",
  "Eldin (Goron City & Death Mountain)",
  "Akkala (Tarrey Town & the northeast)",
  "Hebra (Rito-adjacent north)",
  "Tabantha (Rito Village)",
  "Hyrule Ridge (Hyrule Field west, stables)",
  "Gerudo (Gerudo Town & the desert)",
  "Faron (Lurelin Village & the southern coast)",
  "The Sky Islands",
  "The Depths",
];

const body = `export const meta = {
  name: 'totk-sidequests',
  description: 'Author + verify the complete base-game TotK side-quest + side-adventure list, region by region',
  phases: [
    { title: 'Author', detail: 'per region: enumerate every Side Quest + Side Adventure with how-to' },
    { title: 'Verify', detail: 'per region: confirm completeness + accuracy against a second source' },
  ],
};

const REGIONS = ${JSON.stringify(REGIONS)};

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    region: { type: "string" },
    quests: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["Side Quest", "Side Adventure"] },
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

const authorPrompt = (region) => \`You are building the SIDE-QUEST list for one region of a beginner-first companion to The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild, NO DLC). The goal: a COMPLETE, accurate list of every base-game Side Quest AND Side Adventure given in/around this region, so the player can track and finish them all.

Region: \${region}

RESEARCH with WebSearch + WebFetch: pull this region's FULL base-game list from Game8 (game8.co/games/Tears-of-the-Kingdom) and Zelda Dungeon, which list Side Quests and Side Adventures by region. Include BOTH categories:
- "Side Quest" — the shorter tasks in the Adventure Log's Side Quests tab.
- "Side Adventure" — the meatier multi-step quests in the Side Adventures tab.
Aim for completeness — list every one tied to this region (the giver or the bulk of the quest is here).

HARD RULES:
- EXCLUDE shrine quests entirely (tracked elsewhere). EXCLUDE main quests and the "Regional Phenomena" main story. EXCLUDE the repeatable "Potential Princess Sightings!" Addison-sign chain (too numerous/repeatable).
- Use EXACT in-game quest names.
- For each: kind ("Side Quest" or "Side Adventure"); giver (who starts it + roughly where); location (the area/town); reward (item/rupees/outcome — "none/unlock" if minor); oneLine (one-sentence what-it-is); how (a spoiler-gated, concrete how-to-complete in ~1-3 plain sentences — the actual steps, like a walkthrough, using TotK mechanics: Ultrahand, Fuse, Ascend, Recall, Zonai devices).
- Honesty law: only include real, confirmed base-game quests for THIS region; if unsure which region a quest belongs to, place it where the source does. Don't invent.

Return {region:"\${region}", quests:[{name,kind,giver,location,reward,oneLine,how}], sources:[...]}.\`;

const verifyPrompt = (region, authored) => \`Adversarially verify the side-quest list for the Tears of the Kingdom (Switch, 2023, no DLC) region "\${region}". Be a skeptic on two axes: COMPLETENESS and ACCURACY.

Proposed list:
\${JSON.stringify((authored && authored.quests) || [], null, 1)}

Independently re-source this region's full Side Quest + Side Adventure list (prefer a different guide than \${JSON.stringify((authored && authored.sources) || [])}) with WebSearch + WebFetch (Game8 / Zelda Dungeon / IGN). Then:
- COMPLETENESS: add any base-game Side Quest or Side Adventure for this region that's missing.
- ACCURACY: confirm each quest is real, is a TotK quest (not BotW), belongs to this region, has a correct giver/location/reward and a correct how-to. Fix errors in place.
- PURGE: remove any shrine quest, main quest, the Addison "Potential Princess Sightings" chain, any DLC, and any duplicate or fabricated entry.
- Keep exact in-game names; keep each how to ~1-3 plain sentences using TotK mechanics.
Return the corrected, complete {region:"\${region}", quests:[...], sources:[...], corrections:"<one line>"}.\`;

const results = await pipeline(
  REGIONS,
  (region) => agent(authorPrompt(region), { label: "author:" + region, phase: "Author", schema: SCHEMA }),
  (a, region) => a ? agent(verifyPrompt(region, a), { label: "verify:" + region, phase: "Verify", schema: SCHEMA }) : null,
);

const clean = results.filter(Boolean).filter((x) => x && Array.isArray(x.quests) && x.quests.length);
const total = clean.reduce((n, g) => n + g.quests.length, 0);
log(\`TotK side quests: \${total} across \${clean.length} regions\`);
return { regions: clean, total };
`;

fs.writeFileSync("/tmp/totk-sidequests-workflow.mjs", body);
console.log(`wrote /tmp/totk-sidequests-workflow.mjs (${body.length} bytes) · ${REGIONS.length} regions`);
