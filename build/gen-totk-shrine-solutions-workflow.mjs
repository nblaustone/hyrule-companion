#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK shrine-solutions Workflow with all 152 shrines inlined.
   Mirrors build/gen-shrine-solutions-workflow.mjs (BotW). Per shrine: an author agent web-researches
   and writes the spoiler-gated `solution` (the "exact how"), then an adversarial verifier independently
   fact-checks against a SECOND source and corrects in place. The shrine list is read from the assembled
   knowledge/totk/app-data.json (SHRINES) and embedded as a const (workflow scripts can't read files).
   Output → the workflow return value, which the orchestrator writes to knowledge/totk/shrine-solutions.json
   (assemble-totk.mjs then splices ONLY the `solution` field onto each shrine by name). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));

const TODO = [];
for (const g of APP.SHRINES) {
  for (const s of g.shrines) {
    if (!s.solution || !String(s.solution).trim()) {
      TODO.push({ regionKey: g.regionKey, regionName: g.regionName, name: s.name, location: s.location, category: s.category, oneLine: s.oneLine, shrineQuest: s.shrineQuest || null });
    }
  }
}

// hand-authored TotK voice anchors (the project has none yet) — match depth/shape/honesty
const EX_PUZZLE = "Tap the pedestal to receive Ultrahand. You're meant to build, not climb. Use Ultrahand to grab the two large boards on the ground and lay them across the first gap to make a bridge, then walk over. At the next gap, a small platform slides along a rail overhead; grab the hook lying nearby, stick it onto that platform, then attach a board to ride across as it moves. If a piece won't reach, glue a second board on to extend it — held objects turn yellow when they'll stick, and pressing up on the D-pad detaches a mistake. There are no chests in this tutorial shrine. Step onto the green pad at the far end and touch the monk's altar to claim your Light of Blessing.";
const EX_HIDDEN = "This shrine stays buried until you finish its shrine quest, so do that first. Speak to the villager who gives the quest at the marked spot, follow what they ask (clear the rubble / light the braziers / answer the riddle as the quest describes), and the shrine rises out of the ground with its entrance lit. Inside it's a Rauru's Blessing shrine — there's no puzzle, so the Light of Blessing is essentially free. Grab the treasure chest off to the side on your way in if one is present, then walk to the monk's altar at the back and touch it to claim your Light of Blessing.";

const body = `export const meta = {
  name: 'totk-shrine-solutions',
  description: 'Author + adversarially verify sourced, spoiler-gated shrine solutions for all 152 TotK shrines',
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
  s.shrineQuest ? \`HIDDEN — appears only via the shrine quest: "\${s.shrineQuest}"\` : \`Not hidden — the shrine is visible on the map (or its Travel Medallion/altar is reachable); player just has to clear it.\`,
].join("\\n");

const authorPrompt = (s) => \`You are writing the spoiler-gated "solution" for ONE shrine in a beginner-first, offline companion for The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild). The solution sits behind a "Stuck? Tap for the exact how" button on the shrine's row, so it is the precise, concrete walkthrough a first-timer reads only when stuck.

\${ctx(s)}

RESEARCH FIRST. Use WebSearch + WebFetch to look this exact shrine up on real TEARS OF THE KINGDOM guides — Game8 (game8.co/games/Tears-of-the-Kingdom), Zelda Dungeon (zeldadungeon.net), IGN's TotK wiki, Polygon's TotK shrine guides, Fandom/Zeldapedia. Read at least one full walkthrough of THIS shrine before writing. Get the mechanics exactly right (which ability, which Zonai devices, what each chest holds). TotK shrines use Link's arm abilities — Ultrahand (grab/glue/build), Fuse, Ascend (swim up through ceilings), Recall (reverse an object's motion), Autobuild — plus Zonai devices (fans, wheels, rockets, hydrants, flame emitters, etc.). Many shrines are "Proving Grounds" (stripped of all gear) or "Rauru's Blessing" (free, no puzzle).

WHAT TO WRITE (one flowing paragraph, second person, plain prose):
- If the shrine is HIDDEN (a shrine quest is named above): START with HOW TO MAKE IT APPEAR — the trigger or the steps of that exact shrine quest (where it starts, what you do, what reveals the shrine). THEN how to finish inside. Many hidden shrines are "Rauru's Blessing" shrines with no puzzle — if so, say the Light of Blessing is free once it appears, and name the chest reward if any.
- If it is a PUZZLE/COMBAT/PROVING-GROUNDS shrine: give the actual trick to clear it, step by step — the ability/device to use, the order, the exact move at the part people get stuck on.
- If it is a BLESSING shrine ("Rauru's Blessing" with no quest): say the Light of Blessing is free, how to reach/open any chest, and what the chest holds.
- ALWAYS mention any optional treasure chest worth a detour and NAME its contents, and end by claiming the Light of Blessing from the monk's altar.

HARD RULES (the guide's three laws):
- DON'T INVENT. Every mechanical claim must trace to a source you actually read. If you are not sure what a chest holds or the precise trick, describe only what you are confident of and say the rest plainly (e.g. "a chest off to the side" without naming loot you can't confirm) — never fabricate an item name, a direction, or a trick. An honest, slightly-vaguer line beats a confident wrong one.
- Beginner-first and spoiler-aware: explain mechanics simply; do not spoil unrelated story beats or later bosses.
- Use correct in-game proper names (shrine name, quest name, item/device names, ability names: Ultrahand, Fuse, Ascend, Recall, Autobuild; the reward is a "Light of Blessing").
- Plain text only: no markdown, no headings, no bullet points, no surrounding quotes. One paragraph, roughly 450–950 characters (match the examples' depth).
- Match the VOICE and SHAPE of these two verified examples:
  PUZZLE EXAMPLE (Ultrahand tutorial): \${EX_PUZZLE}
  HIDDEN EXAMPLE (quest-gated blessing): \${EX_HIDDEN}

Return JSON {regionKey:"\${s.regionKey}", name:"\${s.name}", solution:"<the paragraph>", sources:["<url or guide name>", ...]}.\`;

const verifyPrompt = (s, authored) => \`You are an adversarial fact-checker protecting the honesty law of a Tears of the Kingdom (Switch, 2023) walkthrough. Verify ONE shrine solution and return a corrected final version.

\${ctx(s)}

Proposed solution to verify:
"\${(authored && authored.solution) || ""}"

DO YOUR OWN RESEARCH from an INDEPENDENT source (prefer a different guide than any listed here: \${JSON.stringify((authored && authored.sources) || [])}). Use WebSearch + WebFetch on Game8 / Zelda Dungeon / IGN / Polygon / Zeldapedia and read THIS shrine's actual TotK walkthrough.

Check EVERY claim:
- The right ability / Zonai device / order for the puzzle, and the exact move at the sticking point. (Common TotK confusions: Ascend needs a ceiling overhead; Recall reverses recent motion; Proving Grounds strip your gear so you must use what's provided.)
- For a HIDDEN shrine: that the named shrine quest and its trigger/steps are correct and actually reveal THIS shrine.
- Directions, named NPCs, and especially CHEST CONTENTS (these are the most common errors — confirm each item name or remove it).
- That it ends by claiming the Light of Blessing, is one plain-text paragraph (no markdown), ~450–950 chars, beginner-first, spoiler-aware, correct proper names.
- That it is genuinely a TEARS OF THE KINGDOM shrine, not a BotW shrine of a similar name.

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
log(\`Verified \${clean.length}/\${TODO.length} TotK shrine solutions\`);
const missing = TODO.filter((s) => !clean.find((r) => r.name === s.name)).map((s) => s.name);
if (missing.length) log("MISSING (re-run): " + missing.join(", "));
return { solutions: clean, total: clean.length, expected: TODO.length, missing };
`;

fs.writeFileSync("/tmp/totk-shrine-solutions-workflow.mjs", body);
console.log(`wrote /tmp/totk-shrine-solutions-workflow.mjs (${body.length} bytes) · ${TODO.length} shrines to solve`);
