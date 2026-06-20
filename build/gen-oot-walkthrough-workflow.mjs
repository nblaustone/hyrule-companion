#!/usr/bin/env node
/* v14: generate the OoT walkthrough Workflow — authors the remaining main-quest chapters (after the
   hand-authored Kokiri Forest + Deku Tree opening) one agent per chapter, then an adversarial verifier
   fact-checks each against an independent OoT guide. Each agent returns a full REGION object in the exact
   app shape (region → sections → steps), web-sourced (Zelda Dungeon OoT, IGN, StrategyWiki, Game8 OoT).
   The 2 hand-authored opening chapters are embedded as voice/shape anchors. Output → the workflow return
   value; the orchestrator APPENDS the verified chapters to knowledge/oot/walkthrough.json (after the
   opening), then re-runs assemble-oot → inline-data → build. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANCHORS = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "oot", "walkthrough.json"), "utf8"));

// the remaining main-quest spine (child → Master Sword → 5 adult temples → Ganon)
const CHAPTERS = [
  { id: "oot_castle", name: "Hyrule Field & the Castle", sub: "Main Quest — to Princess Zelda", kind: "region", champion: null,
    scope: "Leaving Kokiri Forest into Hyrule Field (Stalchildren at night; the owl Kaepora Gaebora). Reach Castle Town and the Market. The Lost Woods detour to the Sacred Forest Meadow to learn SARIA'S SONG from Saria. Sneaking into Hyrule Castle's garden past the guards (and Talon/Malon, the Weird Egg→Cucco to wake Talon, optional) to meet PRINCESS ZELDA, who explains Ganondorf, the Triforce, and her prophetic dream; you glimpse Ganondorf himself. Then IMPA teaches ZELDA'S LULLABY and points you toward Death Mountain and Kakariko Village. Songs are key items (cat:\"song\")." },
  { id: "oot_dodongo", name: "Death Mountain & Dodongo's Cavern", sub: "Main Quest — Dungeon 2", kind: "beast", champion: "Goron's Ruby",
    scope: "Kakariko Village, climbing Death Mountain Trail (Tektites, falling boulders, Bomb Flowers), into Goron City. Play SARIA'S SONG for the depressed Darunia — he dances, opens the way, and gives the GORON'S BRACELET (lets you pick Bomb Flowers). Dodongo's Cavern: the BOMB BAG, lighting the two eye-torches of the giant dodongo-skull door, navigating to the boss. Boss KING DODONGO (throw/roll a Bomb Flower into his mouth as he inhales, then slash; he curls and rolls). Reward: Heart Container, and Darunia gives the GORON'S RUBY (Spiritual Stone of Fire). Grant items: Goron's Bracelet, Bomb Bag, Bombs, Heart Container, Goron's Ruby." },
  { id: "oot_jabu", name: "Zora's Domain & Jabu-Jabu's Belly", sub: "Main Quest — Dungeon 3", kind: "beast", champion: "Zora's Sapphire",
    scope: "Zora's River (play ZELDA'S LULLABY at the stone tablet by the waterfall to open Zora's Domain). King Zora; Princess Ruto is missing inside Lord Jabu-Jabu. Get an empty BOTTLE and catch a fish, then feed it to Lord Jabu-Jabu to be swallowed. Inside: carry RUTO to reach switches, get the BOOMERANG, fight Tailpasarans/Stingers. Boss BARINADE (use the Boomerang to cut the jellyfish tentacles tethering it, stun it, then slash the core). Reward: Heart Container, and Ruto gives the ZORA'S SAPPHIRE (Spiritual Stone of Water). Grant items: Bottle, Boomerang, Heart Container, Zora's Sapphire." },
  { id: "oot_master", name: "The Door of Time & the Master Sword", sub: "Main Quest — the 7-year leap", kind: "region", champion: "Light Medallion",
    scope: "With all 3 Spiritual Stones, go to the Temple of Time in the Market. Ganondorf chases the fleeing Zelda on horseback; she throws you the OCARINA OF TIME and you learn the SONG OF TIME. Place the 3 stones on the altar and play the Song of Time to open the DOOR OF TIME. Pull the MASTER SWORD from the Pedestal of Time — Link is sealed away and awakens 7 years later as an ADULT. In the Chamber of Sages, RAURU (Sage of Light) gives the LIGHT MEDALLION and explains the six Sages. SHEIK appears and teaches the PRELUDE OF LIGHT (warp to the Temple of Time). Grant items: Ocarina of Time, Song of Time, Master Sword, Light Medallion, Prelude of Light." },
  { id: "oot_forest", name: "Forest Temple", sub: "Main Quest — Adult Dungeon 1", kind: "beast", champion: "Forest Medallion",
    scope: "As adult: get the HOOKSHOT from Dampé's 'Heart-Pounding Gravedigging Tour' race in the Kakariko graveyard. Lost Woods → Sacred Forest Meadow; Sheik teaches the MINUET OF FOREST. Clear the Wolfos/Moblin and enter the Forest Temple. The four Poe Sisters (light their torches in order), the twisted/rotating corridors, the FAIRY BOW (get it inside), the elevator. Boss PHANTOM GANON (in the painting phase shoot the real one with an arrow; in the energy-ball phase deflect his ball back and forth like tennis with a sword slash or arrow until it hits him, then arrow + slash). Reward: SARIA becomes the Sage of Forest → FOREST MEDALLION. Grant items: Hookshot, Minuet of Forest, Fairy Bow, Forest Medallion." },
  { id: "oot_fire", name: "Fire Temple", sub: "Main Quest — Adult Dungeon 2", kind: "beast", champion: "Fire Medallion",
    scope: "Death Mountain Crater; Sheik teaches the BOLERO OF FIRE. You need the GORON TUNIC (heat resistance — buy from the Goron Shop, or a Goron kid gives one) to survive the heat. The Gorons are caged for Volvagia to eat; free Darunia's people, navigate with bombs, and get the MEGATON HAMMER inside. Boss VOLVAGIA (the lava dragon pops out of holes — smash its head with the Megaton Hammer, then slash; dodge the lava-rock rain). Reward: DARUNIA becomes the Sage of Fire → FIRE MEDALLION. Grant items: Goron Tunic, Bolero of Fire, Megaton Hammer, Fire Medallion." },
  { id: "oot_water", name: "Water Temple", sub: "Main Quest — Adult Dungeon 3", kind: "beast", champion: "Water Medallion",
    scope: "Lake Hylia (drained); Sheik teaches the SERENADE OF WATER. You need the IRON BOOTS (sink underwater) and inside you upgrade the Hookshot to the LONGSHOT. The infamous puzzle: raise/lower the water across three levels by playing ZELDA'S LULLABY on the three Triforce tablets, swapping Iron Boots/Zora Tunic to dive. Fight DARK LINK in the misty room (he mirrors you; jab/Megaton Hammer/spin tricks beat him). Boss MORPHA (Longshot the red nucleus out of the water tentacle and slash it before it re-submerges). Reward: RUTO becomes the Sage of Water → WATER MEDALLION. Grant items: Iron Boots, Serenade of Water, Longshot, Water Medallion." },
  { id: "oot_shadow", name: "Shadow Temple", sub: "Main Quest — Adult Dungeon 4", kind: "beast", champion: "Shadow Medallion",
    scope: "Kakariko is attacked; Sheik teaches the NOCTURNE OF SHADOW behind the village. You need the LENS OF TRUTH (as a child, drain and explore the Kakariko Well) to reveal invisible paths/enemies, plus the HOVER BOOTS and bombs. 'The house of the dead' — ReDeads, Gibdos, Floormasters; the giant skull boat (play Zelda's Lullaby to summon it and ride). Boss BONGO BONGO (use the Lens to see it; arrow/stun its two hands, then shoot or hit the giant eye, flurry while it's down). Reward: IMPA becomes the Sage of Shadow → SHADOW MEDALLION. Grant items: Lens of Truth, Hover Boots, Nocturne of Shadow, Shadow Medallion." },
  { id: "oot_spirit", name: "Spirit Temple", sub: "Main Quest — Adult Dungeon 5", kind: "beast", champion: "Spirit Medallion",
    scope: "Gerudo Valley & Fortress (free the four captured carpenters to earn the GERUDO MEMBERSHIP CARD). Cross the Haunted Wasteland (use the Lens of Truth, follow the flag poles, then the Phantom Guide) to the Desert Colossus; Sheik teaches the REQUIEM OF SPIRIT. The temple splits across time: as CHILD get the SILVER GAUNTLETS (lift the big block), as ADULT get the MIRROR SHIELD; Nabooru, the Iron Knuckles. Boss TWINROVA (the witch sisters Koume & Kotake — absorb one element's blast with the Mirror Shield then reflect THREE of the same back at the merged Twinrova, then slash). Reward: NABOORU becomes the Sage of Spirit → SPIRIT MEDALLION. Grant items: Gerudo Membership Card, Requiem of Spirit, Silver Gauntlets, Mirror Shield, Spirit Medallion." },
  { id: "oot_ganon", name: "Ganon's Castle", sub: "Main Quest — the final battle", kind: "beast", champion: null,
    scope: "With all six Medallions, the six Sages raise a rainbow bridge to Ganon's Castle. The GREAT FAIRY by the castle grants the final upgrade; you need the LIGHT ARROWS (Zelda/Sheik gives them at the Temple of Time). Dispel the barrier by clearing the SIX elemental TRIALS (Forest, Fire, Water, Shadow, Spirit, Light). Climb the tower. GANONDORF organ-hall fight (deflect his energy with Light Arrows / a tennis volley, then Light Arrow + Master Sword). The castle collapses — escort Zelda out under a timer, fighting Stalfos. Final boss GANON (the giant boar — he knocks the Master Sword away; stun him with Light Arrows, attack his tail, recover the sword, and Zelda holds him for the finishing blow). The Sages seal Ganon; the peaceful ending and Zelda returning Link to his childhood. Spoiler-aware but it's the ending — keep it triumphant. Grant items: Light Arrows." },
];

// embed the 2 hand-authored opening chapters as voice/shape anchors
const body = `export const meta = {
  name: 'oot-walkthrough',
  description: 'Author + adversarially verify the remaining 10 OoT main-quest chapters (region objects in app shape)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter web-researches and writes the full region (sections + steps)' },
    { title: 'Verify', detail: 'an independent skeptic fact-checks each chapter against a second OoT source' },
  ],
};

const CHAPTERS = ${JSON.stringify(CHAPTERS)};
const ANCHORS = ${JSON.stringify(ANCHORS)};

const REGION_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    id: { type: "string" }, name: { type: "string" }, sub: { type: "string" },
    kind: { type: "string", enum: ["region", "beast"] },
    tagline: { type: "string" },
    champion: { type: ["string", "null"] },
    sections: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string" }, name: { type: "string" }, sub: { type: "string" },
        reward: { type: ["string", "null"] },
        steps: { type: "array", items: {
          type: "object", additionalProperties: false,
          properties: {
            id: { type: "string" },
            k: { type: "string", enum: ["step", "loot", "optional", "reward", "tip", "warn"] },
            t: { type: "string" },
            items: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, cat: { type: "string", enum: ["sword", "shield", "bow", "item", "song", "key", "material"] }, note: { type: "string" } }, required: ["name", "cat"] } },
            stuck: { type: "string" },
          },
          required: ["id", "k", "t"],
        } },
      },
      required: ["id", "name", "steps"],
    } },
    sources: { type: "array", items: { type: "string" } },
    corrections: { type: "string" },
  },
  required: ["id", "name", "kind", "tagline", "sections"],
};

const authorPrompt = (c) => \`You are authoring ONE chapter of a beginner-first, offline walkthrough of The Legend of Zelda: OCARINA OF TIME (Nintendo 64, 1998; the 3DS remake is equivalent). Output a single REGION object in the app's exact shape.

Chapter: id="\${c.id}", name="\${c.name}", sub="\${c.sub}", kind="\${c.kind}"\${c.champion ? ', this chapter awards the "' + c.champion + '"' : ''}.
What this chapter must cover (the canonical critical path):
\${c.scope}

RESEARCH FIRST with WebSearch + WebFetch on real OoT guides — Zelda Dungeon (zeldadungeon.net OoT walkthrough), IGN's OoT wiki, StrategyWiki, Zeldapedia/Fandom, Game8's OoT guide. Read this section's actual walkthrough before writing; get item locations, song names, dungeon order, and boss strategies exactly right.

SHAPE (return EXACTLY this object):
{
  id: "\${c.id}", name: "\${c.name}", sub: "\${c.sub}", kind: "\${c.kind}",
  tagline: "<one vivid sentence for this chapter>",
  champion: \${c.champion ? '"' + c.champion + '"' : "null"},
  sections: [ { id, name, sub, reward, steps: [ { id, k, t, items?, stuck? } ] } ],
  sources: [ ... ]
}

RULES:
- 3–6 sections; each section a beat of the chapter (lead-up, the dungeon's halves, the boss + reward). Steps: a handful per section.
- Every id GLOBALLY UNIQUE and PREFIXED with the chapter id (e.g. "\${c.id}_<section>_<n>"). Section ids like "\${c.id}_s_<slug>".
- k (kind): "step" | "loot" | "optional" | "reward" are checkable; "tip" | "warn" are info-only. The boss-reward / stone / medallion step should be k:"reward".
- t: one or two plain sentences, second person, beginner-first. No markdown.
- items[]: when a step GRANTS something, list it as {name (EXACT in-game name), cat, note}. cat ∈ sword|shield|bow|item|song|key|material (songs = "song"; medallions/stones/keys/heart containers = "key"; the bow/slingshot = "bow"; tunics/boots/gauntlets/bracelet = "item"; sticks/nuts/fish = "material"). \${c.champion ? 'You MUST grant an item named EXACTLY "' + c.champion + '" (cat:"key") in the boss-reward step so it wires to the progress tracker.' : ''}
- stuck (optional): on a genuinely tricky beat (a puzzle, a boss pattern, an easy-to-miss item), add a <=220-char one-line "Stuck? the exact how" hint that ADDS info beyond the step. Don't add stuck to obvious steps.
- HONESTY LAW: every mechanical claim traces to a source you read. If unsure of a detail, describe what you're confident of plainly rather than invent. Correct in-game proper names (songs, items, bosses, places).
- Match the VOICE + STRUCTURE of these two verified opening chapters: \${JSON.stringify(ANCHORS)}

Return the region object.\`;

const verifyPrompt = (c, a) => \`You are an adversarial fact-checker for an Ocarina of Time (N64, 1998) walkthrough chapter. Verify and return a corrected REGION object.

Chapter scope (canonical):
\${c.scope}

Proposed chapter:
\${JSON.stringify(a || {}, null, 1)}

Independently re-source this chapter (prefer a different guide than \${JSON.stringify((a && a.sources) || [])}) with WebSearch + WebFetch (Zelda Dungeon / IGN / StrategyWiki / Zeldapedia). Check EVERY claim: item locations & exact names, which SONG is learned and from whom, the dungeon order/prerequisites, and especially BOSS strategies (e.g. King Dodongo = bomb in mouth; Phantom Ganon = tennis the energy ball; Morpha = Longshot the nucleus; Twinrova = Mirror-Shield reflect; Volvagia = Megaton Hammer; Bongo Bongo = Lens + stun hands). Fix errors in place; SOFTEN/REMOVE anything you can't confirm.
Confirm: kind="\${c.kind}"; champion=\${c.champion ? '"' + c.champion + '"' : "null"}\${c.champion ? ' and a step GRANTS an item named EXACTLY "' + c.champion + '" (cat:"key")' : ''}; every id is unique and prefixed "\${c.id}_"; k values valid; plain text; correct proper names.
Return the FINAL corrected region object (same shape) with sources[] and a one-line corrections field.\`;

const results = await pipeline(
  CHAPTERS,
  (c) => agent(authorPrompt(c), { label: "author:" + c.id, phase: "Author", schema: REGION_SCHEMA }),
  (a, c) => a ? agent(verifyPrompt(c, a), { label: "verify:" + c.id, phase: "Verify", schema: REGION_SCHEMA }) : null,
);

// keep chapters in CHAPTERS order
const byId = new Map(results.filter(Boolean).map((r) => [r.id, r]));
const ordered = CHAPTERS.map((c) => byId.get(c.id)).filter(Boolean);
const missing = CHAPTERS.filter((c) => !byId.has(c.id)).map((c) => c.id);
const steps = ordered.reduce((n, r) => n + (r.sections || []).reduce((m, s) => m + (s.steps || []).length, 0), 0);
log("OoT chapters verified: " + ordered.length + "/" + CHAPTERS.length + " · " + steps + " steps" + (missing.length ? " · MISSING: " + missing.join(", ") : ""));
return { chapters: ordered, total: ordered.length, expected: CHAPTERS.length, missing };
`;

fs.writeFileSync("/tmp/oot-walkthrough-workflow.mjs", body);
console.log(`wrote /tmp/oot-walkthrough-workflow.mjs (${body.length} bytes) · ${CHAPTERS.length} chapters to author`);
console.log("chapters:", CHAPTERS.map((c) => c.id).join(", "));
