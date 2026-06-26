#!/usr/bin/env node
/* v13 (TotK parity): generate the TotK shrine-solutions Workflow — BATCHED per AGENT_WORKFLOW.md.
   Per the directive's #1 token lever, ONE agent handles a GROUP of ~12 shrines (region-coherent),
   NOT one agent per shrine. So 152 shrines ≈ 19 author agents + 19 verify agents (~38 total) instead
   of ~304 (a ~8× cut for the same coverage). The honesty law is preserved: each author batch is
   independently re-checked by an adversarial verify batch against a SECOND source.
   The shrine list is read from the assembled knowledge/totk/app-data.json (SHRINES) and embedded as a
   const (workflow scripts can't read files). Output → the workflow return value, which the orchestrator
   writes to knowledge/totk/shrine-solutions.json (assemble-totk.mjs then splices ONLY the `solution`
   field onto each shrine by name). Run as ONE solo workflow (≤2 concurrent rule; one is safest). */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "totk", "app-data.json"), "utf8"));
const MAX = 12; // shrines per agent (AGENT_WORKFLOW.md: ~12)

const TODO = [];
for (const g of APP.SHRINES) {
  for (const s of g.shrines) {
    if (!s.solution || !String(s.solution).trim()) {
      TODO.push({ regionKey: g.regionKey, regionName: g.regionName, name: s.name, location: s.location, category: s.category, oneLine: s.oneLine, shrineQuest: s.shrineQuest || null });
    }
  }
}

// region-coherent batches of <=MAX (balanced sizes within a region) — one agent per batch
function chunk(arr) {
  const groups = Math.max(1, Math.ceil(arr.length / MAX));
  const size = Math.ceil(arr.length / groups);
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const byRegion = new Map();
for (const s of TODO) { if (!byRegion.has(s.regionKey)) byRegion.set(s.regionKey, []); byRegion.get(s.regionKey).push(s); }
const BATCHES = [];
for (const [, list] of byRegion) for (const c of chunk(list)) BATCHES.push(c);

// hand-authored TotK voice anchors (the project has none yet) — match depth/shape/honesty
const EX_PUZZLE = "Tap the pedestal to receive Ultrahand. You're meant to build, not climb. Use Ultrahand to grab the two large boards on the ground and lay them across the first gap to make a bridge, then walk over. At the next gap, a small platform slides along a rail overhead; grab the hook lying nearby, stick it onto that platform, then attach a board to ride across as it moves. If a piece won't reach, glue a second board on to extend it — held objects turn yellow when they'll stick, and pressing up on the D-pad detaches a mistake. There are no chests in this tutorial shrine. Step onto the green pad at the far end and touch the monk's altar to claim your Light of Blessing.";
const EX_HIDDEN = "This shrine stays buried until you finish its shrine quest, so do that first. Speak to the villager who gives the quest at the marked spot, follow what they ask (clear the rubble / light the braziers / answer the riddle as the quest describes), and the shrine rises out of the ground with its entrance lit. Inside it's a Rauru's Blessing shrine — there's no puzzle, so the Light of Blessing is essentially free. Grab the treasure chest off to the side on your way in if one is present, then walk to the monk's altar at the back and touch it to claim your Light of Blessing.";

const body = `export const meta = {
  name: 'totk-shrine-solutions',
  description: 'Author + adversarially verify sourced, spoiler-gated solutions for all 152 TotK shrines (BATCHED ~12/agent)',
  phases: [
    { title: 'Author', detail: 'one agent per ~12-shrine batch web-researches and writes each exact-how solution' },
    { title: 'Verify', detail: 'an independent skeptic re-checks each batch against a second source and corrects' },
  ],
};

const BATCHES = ${JSON.stringify(BATCHES)};
const EX_PUZZLE = ${JSON.stringify(EX_PUZZLE)};
const EX_HIDDEN = ${JSON.stringify(EX_HIDDEN)};

// args (optional): an array of regionKeys to restrict this run to (for resume / partial re-runs).
const REGIONS = (typeof args !== "undefined" && Array.isArray(args) && args.length) ? args : null;
const WORK = REGIONS ? BATCHES.filter((b) => REGIONS.includes(b[0].regionKey)) : BATCHES;
const shrineCount = WORK.reduce((n, b) => n + b.length, 0);
log("Solving " + shrineCount + " shrines across " + WORK.length + " batches (~" + ${MAX} + "/agent)" + (REGIONS ? " (regions: " + REGIONS.join(", ") + ")" : ""));

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    solutions: {
      type: "array",
      items: {
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
      },
    },
  },
  required: ["solutions"],
};

const shrineCtx = (s, i) => [
  \`\${i + 1}. \${s.name}\`,
  \`   Map location (our data): \${s.location}\`,
  \`   Category: \${s.category}\`,
  \`   Our one-line hint: \${s.oneLine}\`,
  s.shrineQuest ? \`   HIDDEN — appears only via the shrine quest: "\${s.shrineQuest}"\` : \`   Not hidden — visible on the map; the player just has to clear it.\`,
].join("\\n");

const batchCtx = (batch) => batch.map(shrineCtx).join("\\n\\n");

const authorPrompt = (batch) => \`You are writing the spoiler-gated "solution" text for a GROUP of \${batch.length} shrines in a beginner-first, offline companion for The Legend of Zelda: TEARS OF THE KINGDOM (Switch, 2023 — NOT Breath of the Wild). Each solution sits behind a "Stuck? Tap for the exact how" button on that shrine's row, so it is the precise, concrete walkthrough a first-timer reads only when stuck.

These \${batch.length} shrines are all in the \${batch[0].regionName} region (regionKey \${batch[0].regionKey}):

\${batchCtx(batch)}

RESEARCH EACH SHRINE. Use WebSearch + WebFetch to look up each exact shrine on real TEARS OF THE KINGDOM guides — Game8 (game8.co/games/Tears-of-the-Kingdom), Zelda Dungeon (zeldadungeon.net), IGN's TotK wiki, Polygon's TotK shrine guides, Fandom/Zeldapedia. Read an actual walkthrough of each shrine before writing it. Get the mechanics exactly right (which ability, which Zonai devices, what each chest holds). TotK shrines use Link's arm abilities — Ultrahand (grab/glue/build), Fuse, Ascend (swim up through ceilings), Recall (reverse an object's motion), Autobuild — plus Zonai devices (fans, wheels, rockets, hydrants, flame emitters, etc.). Many shrines are "Proving Grounds" (stripped of all gear) or "Rauru's Blessing" (free, no puzzle).

FOR EACH SHRINE write ONE flowing paragraph (second person, plain prose):
- HIDDEN (a shrine quest is named): START with HOW TO MAKE IT APPEAR — the trigger / steps of that exact shrine quest. THEN how to finish inside. Many are "Rauru's Blessing" with no puzzle — if so, say the Light of Blessing is free once it appears, and name the chest reward if any.
- PUZZLE/COMBAT/PROVING-GROUNDS: the actual trick to clear it, step by step — the ability/device, the order, the exact move at the part people get stuck on.
- BLESSING ("Rauru's Blessing", no quest): say the Light of Blessing is free, how to reach/open any chest, and what it holds.
- ALWAYS mention any optional treasure chest worth a detour and NAME its contents, and end by claiming the Light of Blessing from the monk's altar.

HARD RULES (the guide's three laws):
- DON'T INVENT. Every mechanical claim must trace to a source you actually read. If unsure what a chest holds or the precise trick, describe only what you're confident of and say the rest plainly (e.g. "a chest off to the side" without naming loot you can't confirm) — never fabricate an item name, a direction, or a trick. An honest, slightly-vaguer line beats a confident wrong one.
- Beginner-first and spoiler-aware: explain mechanics simply; don't spoil unrelated story beats or later bosses.
- Correct in-game proper names (shrine name, quest name, item/device/ability names: Ultrahand, Fuse, Ascend, Recall, Autobuild; the reward is a "Light of Blessing").
- Plain text only per solution: no markdown, no headings, no bullets, no surrounding quotes. One paragraph each, roughly 450–950 characters (match the examples' depth).
- Match the VOICE and SHAPE of these two verified examples:
  PUZZLE EXAMPLE (Ultrahand tutorial): \${EX_PUZZLE}
  HIDDEN EXAMPLE (quest-gated blessing): \${EX_HIDDEN}

Return JSON {solutions:[{regionKey, name, solution, sources:[...]}, ...]} — ONE entry per shrine above, names EXACTLY as written above, in the same order.\`;

const verifyPrompt = (batch, authored) => {
  const map = new Map((authored && authored.solutions || []).map((r) => [r.name, r]));
  const items = batch.map((s, i) => \`\${i + 1}. \${s.name} \${s.shrineQuest ? "(HIDDEN — quest: " + s.shrineQuest + ")" : ""}\\nPROPOSED: \${(map.get(s.name) && map.get(s.name).solution) || "(missing — write it)"}\`).join("\\n\\n");
  return \`You are an adversarial fact-checker protecting the honesty law of a Tears of the Kingdom (Switch, 2023) walkthrough. Verify a GROUP of \${batch.length} shrine solutions and return the corrected final versions.

These \${batch.length} shrines are in the \${batch[0].regionName} region (regionKey \${batch[0].regionKey}). For each, our data is:

\${batchCtx(batch)}

PROPOSED SOLUTIONS TO VERIFY (one per shrine):

\${items}

DO YOUR OWN RESEARCH from an INDEPENDENT source (prefer a different guide than the author likely used). Use WebSearch + WebFetch on Game8 / Zelda Dungeon / IGN / Polygon / Zeldapedia and read each shrine's actual TotK walkthrough.

Check EVERY claim, per shrine:
- The right ability / Zonai device / order for the puzzle, and the exact move at the sticking point. (Common TotK confusions: Ascend needs a ceiling overhead; Recall reverses recent motion; Proving Grounds strip your gear so you must use what's provided.)
- HIDDEN shrines: that the named shrine quest and its trigger/steps are correct and actually reveal THIS shrine.
- Directions, named NPCs, and especially CHEST CONTENTS (the most common errors — confirm each item name or remove it).
- Each ends by claiming the Light of Blessing, is one plain-text paragraph (no markdown), ~450–950 chars, beginner-first, spoiler-aware, correct proper names.
- That each is genuinely a TEARS OF THE KINGDOM shrine, not a BotW shrine of a similar name.

FIX errors in place. If a specific claim can't be verified, SOFTEN or REMOVE it rather than ship a guess (e.g. drop an unconfirmed item name). The goal is solutions you're confident are correct and that genuinely unstick a first-timer.

Return the FINAL corrected JSON {solutions:[{regionKey, name, solution, sources:[...], corrections:"<one short line per shrine: what changed, or 'no changes'>"}, ...]} — ONE entry per shrine above, names EXACTLY as written, same order.\`;
};

const results = await pipeline(
  WORK,
  (batch, _orig, i) => agent(authorPrompt(batch), { label: "author:" + batch[0].regionKey + " #" + (i + 1) + " (" + batch.length + ")", phase: "Author", schema: SCHEMA }),
  (authored, batch, i) => authored
    ? agent(verifyPrompt(batch, authored), { label: "verify:" + batch[0].regionKey + " #" + (i + 1) + " (" + batch.length + ")", phase: "Verify", schema: SCHEMA })
    : null,
);

const clean = results.filter(Boolean).flatMap((r) => (r && r.solutions) || []).filter((r) => r && r.name && r.solution && r.solution.trim());
log("Verified " + clean.length + "/" + shrineCount + " TotK shrine solutions (" + WORK.length + " batches)");
const got = new Set(clean.map((r) => r.name));
const missing = WORK.flat().filter((s) => !got.has(s.name)).map((s) => s.name);
if (missing.length) log("MISSING (re-run by region): " + missing.join(", "));
return { solutions: clean, total: clean.length, expected: shrineCount, batches: WORK.length, missing };
`;

fs.writeFileSync("/tmp/totk-shrine-solutions-workflow.mjs", body);
console.log(`wrote /tmp/totk-shrine-solutions-workflow.mjs (${body.length} bytes)`);
console.log(`${TODO.length} shrines → ${BATCHES.length} batches (~${MAX}/agent) · author+verify = ${BATCHES.length * 2} agents (was ${TODO.length * 2} one-per-item)`);
console.log("batches:", BATCHES.map((b) => b[0].regionKey + ":" + b.length).join("  "));
