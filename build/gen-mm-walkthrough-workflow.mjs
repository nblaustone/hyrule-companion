#!/usr/bin/env node
/* v15: generate the Majora's Mask walkthrough Workflow — authors the remaining main-quest chapters (after the
   hand-authored Clock Town opening) one agent per chapter, then an adversarial verifier fact-checks each against
   an independent MM guide. Each agent returns a full REGION object in the app's exact shape (region → sections →
   steps), web-sourced (Zelda Dungeon MM, Thonky MM, IGN, StrategyWiki, Zeldapedia). The hand-authored opening
   chapter is embedded as a voice/shape anchor. Output → the workflow return value; the orchestrator APPENDS the
   verified chapters to knowledge/mm/walkthrough.json (after the opening), then re-runs assemble-mm → inline-data
   → build. Mirrors build/gen-oot-walkthrough-workflow.mjs. */
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANCHORS = JSON.parse(fs.readFileSync(join(ROOT, "knowledge", "mm", "walkthrough.json"), "utf8"));

// the remaining main-quest spine: 4 temple regions (each frees a Giant + grants a Remains) then the Moon.
const CHAPTERS = [
  { id: "mm_swamp", name: "Southern Swamp & Woodfall Temple", sub: "Main Quest — Temple 1 (Deku)", kind: "beast", champion: "Odolwa's Remains",
    scope: "From Clock Town head SOUTH to the SOUTHERN SWAMP, whose water has turned poisonous. The Deku King has imprisoned a MONKEY, wrongly blaming it for the Deku Princess's disappearance. (Early aside, mention briefly: restoring the GREAT FAIRY of Magic in North Clock Town grants MAGIC POWER, which you need for Deku bubbles, spin attacks and elemental arrows.) At the SWAMP TOURIST CENTER / Boat Cruise, learn the lay of the land; the witch KOTAKE is lost and hurt in the WOODS OF MYSTERY (heal/find her so her sister TIJO reopens the Magic Hags' Potion Shop). Sneak into the DEKU PALACE as DEKU LINK (slip past the patrolling guards); in the back the caged monkey teaches you the SONATA OF AWAKENING. Travel to WOODFALL; stand on the platform and play the SONATA OF AWAKENING to raise WOODFALL TEMPLE out of the poison. Woodfall Temple as Deku Link: find the HERO'S BOW inside, light torches with fire from Deku Flames, ride Deku Flowers, beat the dungeon and get the Boss Key. BOSS ODOLWA (a masked jungle warrior who dances, swings two swords, and summons moths/bugs): stun him with the Hero's Bow or Deku Nuts and slash, or drop a bomb; beginner line = shoot arrows then slash. Reward: HEART CONTAINER and ODOLWA'S REMAINS — the first GIANT is freed. After freeing the first Giant, Link learns the OATH TO ORDER (the song that summons all four Giants). The swamp water clears and the monkey is freed / Deku Princess returned. GRANT items: Sonata of Awakening, Hero's Bow, Heart Container, Odolwa's Remains, Oath to Order." },
  { id: "mm_snowhead", name: "Snowhead & Snowhead Temple", sub: "Main Quest — Temple 2 (Goron)", kind: "beast", champion: "Goht's Remains",
    scope: "Head NORTH to the MOUNTAIN VILLAGE, trapped in an endless winter. Find the ghost of DARMANI, the dead Goron hero, near the village/Goron graveyard; play the SONG OF HEALING for him to ease his regret — you receive the GORON MASK (transform into a Goron: curl into a rolling ball, ground-pound, punch, and survive heat/lava). As GORON LINK reach the GORON SHRINE/VILLAGE; the Gorons are freezing and starving and the GORON ELDER is away at Snowhead while his baby son wails. Learn GORON'S LULLABY — the Elder (at Snowhead, frozen) teaches the first half and his crying baby in the Goron Shrine completes it (the lullaby puts things to sleep). Clear the eternal blizzard around SNOWHEAD and enter SNOWHEAD TEMPLE as Goron Link: find the FIRE ARROWS inside, melt ice, ride updrafts and the central pillar, Goron-pound switches, get the Boss Key. BOSS GOHT (a mechanical bull frozen in ice that, once freed, charges around a circular arena firing ice and electricity): curl into a spiked Goron roll (costs magic) and ram it from behind to chase it down, or hit it with Fire Arrows; when it tumbles, pound/slash it. Reward: HEART CONTAINER and GOHT'S REMAINS — the second Giant is freed and SPRING returns to the mountains. GRANT items: Goron Mask, Goron's Lullaby, Fire Arrows, Heart Container, Goht's Remains." },
  { id: "mm_bay", name: "Great Bay Coast & Great Bay Temple", sub: "Main Quest — Temple 3 (Zora)", kind: "beast", champion: "Gyorg's Remains",
    scope: "Travel WEST to the GREAT BAY COAST. Find MIKAU, the dying Zora guitarist of the band THE INDIGO-GO'S, floating in the sea; pull him ashore and play the SONG OF HEALING — you receive the ZORA MASK (transform into a Zora: swim fast, dive, throw fin-boomerangs, and raise an electric barrier). Lulu's ZORA EGGS were stolen; recover them from the PIRATES' FORTRESS (sneak/ swim in as Zora; the HOOKSHOT is found here) and the MARINE RESEARCH LAB. Bring the eggs together so they hatch and teach you the seven-note NEW WAVE BOSSA NOVA (Lulu's song). Play the NEW WAVE BOSSA NOVA at the rock in the bay to wake the GIANT TURTLE, who carries you to GREAT BAY TEMPLE. Great Bay Temple as Zora Link: a water-control dungeon of currents, pipes and a central control valve; find the ICE ARROWS inside (freeze water into stepping blocks), beat the dungeon, get the Boss Key. BOSS GYORG (a giant masked fish in a flooded arena): in phase one it leaps — shoot it with arrows (or Zora-attack) to stun, then dive and slash; watch the small fish it spits and its electric charge; beginner line = arrows when it jumps, then strike. Reward: HEART CONTAINER and GYORG'S REMAINS — the third Giant is freed and the seas calm. GRANT items: Zora Mask, New Wave Bossa Nova, Hookshot, Ice Arrows, Heart Container, Gyorg's Remains." },
  { id: "mm_ikana", name: "Ikana Canyon & Stone Tower Temple", sub: "Main Quest — Temple 4 (Twinmold)", kind: "beast", champion: "Twinmold's Remains",
    scope: "Travel EAST to IKANA CANYON, the haunted valley of the dead. Key traversal masks here: the GARO'S MASK (summon a Garo ninja to reveal secrets — won from the Gorman Brothers' horse race / Romani Ranch) and the CAPTAIN'S HAT (from CAPTAIN KEETA's chase in the graveyard; it lets you command Stalchildren). Restore Ikana River's flow (the Gibdo/ music puzzle in the music-box house), and get the MIRROR SHIELD from BENEATH THE GRAVEYARD / the Ikana well (it reflects light and sunlight). Climb to IKANA CASTLE and defeat the ghost king IGOS DU IKANA — reflect light with the Mirror Shield to strip his minions and burn him — then he teaches the ELEGY OF EMPTINESS (creates a frozen statue of Link's CURRENT form that holds switches down; you make statues in each form to weight multiple switches at once). At STONE TOWER, climb the giant tower and enter STONE TOWER TEMPLE. Inside, find the LIGHT ARROWS (the dungeon item); the temple's gimmick is FLIPPING the whole dungeon upside-down by shooting Light Arrows at the sun crests. Use the Elegy of Emptiness statues and all four forms; the GIANT'S MASK is found inside. Get the Boss Key. BOSS TWINMOLD (twin giant sand serpents, one red above ground and one blue burrowing): wear the GIANT'S MASK to grow enormous and grapple/punch them, or hit the head/tail; beginner line = Giant's Mask then strike the heads. Reward: HEART CONTAINER and TWINMOLD'S REMAINS — the fourth and final Giant is freed. GRANT items: Mirror Shield, Elegy of Emptiness, Light Arrows, Giant's Mask, Heart Container, Twinmold's Remains." },
  { id: "mm_moon", name: "The Carnival of Time & the Moon", sub: "Main Quest — the final battle", kind: "beast", champion: null,
    scope: "With all FOUR REMAINS and the four Giants freed, go to the top of the CLOCK TOWER on the night of the FINAL DAY (the Carnival of Time). The Skull Kid hauls the Moon down; play the OATH TO ORDER to summon the FOUR GIANTS, who catch and hold the falling Moon. Majora's power tears free of the Skull Kid and flees into the MOON; the freed Skull Kid is reconciled with Tael and Tatl. Link follows MAJORA into the Moon. Inside the Moon is a peaceful grassy field with a lone tree and FIVE children — four wear the boss masks (Odolwa, Goht, Gyorg, Twinmold) and run little mask-trade trials (give them masks to play and clear each room), and the boy wearing MAJORA'S MASK sits under the tree. Give away your TWENTY regular masks to the children to receive the FIERCE DEITY'S MASK (it turns Link into a towering swordsman who fires sword-beams — usable in boss rooms). FINAL BOSS MAJORA, in three forms: MAJORA'S MASK (whips its tentacles and the boss-mask children spin around it), MAJORA'S INCARNATION (a childlike body that runs and flails), and MAJORA'S WRATH (lashing whip-arms). With the Fierce Deity's Mask, close in and cut it down with sword-beams; without it, stun with Light Arrows / Zora or other masks and slash. Victory: the Moon vanishes, the Skull Kid is saved, the Happy Mask Salesman recovers Majora's Mask, dawn breaks on a peaceful Carnival of Time, and the Giants return to slumber. It is the ENDING — keep it triumphant and spoiler-aware. GRANT items: Oath to Order (if not already learned), Fierce Deity's Mask." },
];

const body = `export const meta = {
  name: 'mm-walkthrough',
  description: 'Author + adversarially verify the remaining Majora\\'s Mask main-quest chapters (region objects in app shape)',
  phases: [
    { title: 'Author', detail: 'one agent per chapter web-researches and writes the full region (sections + steps)' },
    { title: 'Verify', detail: 'an independent skeptic fact-checks each chapter against a second MM source' },
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
            items: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, cat: { type: "string", enum: ["mask", "song", "sword", "shield", "bow", "item", "key", "material"] }, note: { type: "string" } }, required: ["name", "cat"] } },
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

const authorPrompt = (c) => \`You are authoring ONE chapter of a beginner-first, offline walkthrough of The Legend of Zelda: MAJORA'S MASK (Nintendo 64, 2000; the 3DS remake is equivalent). Output a single REGION object in the app's exact shape.

Chapter: id="\${c.id}", name="\${c.name}", sub="\${c.sub}", kind="\${c.kind}"\${c.champion ? ', this chapter awards the "' + c.champion + '"' : ''}.
What this chapter must cover (the canonical critical path):
\${c.scope}

RESEARCH FIRST with WebSearch + WebFetch on real MM guides — Zelda Dungeon (zeldadungeon.net Majora's Mask walkthrough), Thonky's MM walkthrough (thonky.com), IGN's MM wiki, StrategyWiki, Zeldapedia/Fandom. Read this region+temple's actual walkthrough before writing; get item locations, song names (and WHO teaches each), the dungeon route, and the BOSS strategy exactly right.

THE THREE-DAY CLOCK is Majora's Mask's defining mechanic — weave it in honestly: you have three in-game days; the Song of Time rewinds to the Dawn of the First Day (keeping masks/songs/Heart Containers/bottles/Remains but losing rupees/ammo/small keys/Stray Fairies). Note when a region should be done "in one cycle," and that the Inverted Song of Time slows time and the Song of Double Time skips ahead. TRANSFORMATION MASKS (Deku/Goron/Zora) change which form Link is in and gate puzzles — say which form a beat needs.

SHAPE (return EXACTLY this object):
{
  id: "\${c.id}", name: "\${c.name}", sub: "\${c.sub}", kind: "\${c.kind}",
  tagline: "<one vivid sentence for this chapter>",
  champion: \${c.champion ? '"' + c.champion + '"' : "null"},
  sections: [ { id, name, sub, reward, steps: [ { id, k, t, items?, stuck? } ] } ],
  sources: [ ... ]
}

RULES:
- 4–7 sections; each section a beat of the chapter (the region intro + transformation mask, the song/prep, the temple's halves, the boss + reward). A handful of steps per section.
- Every id GLOBALLY UNIQUE and PREFIXED with the chapter id (e.g. "\${c.id}_<section>_<n>"). Section ids like "\${c.id}_s_<slug>".
- k (kind): "step" | "loot" | "optional" | "reward" are checkable; "tip" | "warn" are info-only. The boss-reward / Heart Container / Remains step should be k:"reward".
- t: one or two plain sentences, second person, beginner-first. No markdown.
- items[]: when a step GRANTS something, list it as {name (EXACT in-game name), cat, note}. cat ∈ mask|song|sword|shield|bow|item|key|material (masks = "mask"; ocarina songs = "song"; Hero's Bow + any arrows/projectiles = "bow"; Razor/Gilded/Great Fairy's Sword = "sword"; Hero's/Mirror Shield = "shield"; Hookshot/Bomb Bag/Lens of Truth/Powder Keg/Pictograph Box = "item"; Remains/Boss Keys/Heart Containers/bottles/Bombers' Notebook = "key"; Deku Nuts/Sticks/Magic Beans = "material"). \${c.champion ? 'You MUST grant an item named EXACTLY "' + c.champion + '" (cat:"key") in the boss-reward step so it wires to the progress tracker.' : ''}
- stuck (optional): on a genuinely tricky beat (a song to learn, a boss pattern, an easy-to-miss item, a transformation-gated puzzle), add a <=220-char one-line "Stuck? the exact how" hint that ADDS info beyond the step. Don't add stuck to obvious steps.
- HONESTY LAW: every mechanical claim traces to a source you read. If unsure of a detail, describe what you're confident of plainly rather than invent. Correct in-game proper names (songs, masks, bosses, places).
- Match the VOICE + STRUCTURE of this verified opening chapter: \${JSON.stringify(ANCHORS)}

Return the region object.\`;

const verifyPrompt = (c, a) => \`You are an adversarial fact-checker for a Majora's Mask (N64, 2000) walkthrough chapter. Verify and return a corrected REGION object.

Chapter scope (canonical):
\${c.scope}

Proposed chapter:
\${JSON.stringify(a || {}, null, 1)}

Independently re-source this chapter (prefer a different guide than \${JSON.stringify((a && a.sources) || [])}) with WebSearch + WebFetch (Zelda Dungeon / Thonky / IGN / StrategyWiki / Zeldapedia). Check EVERY claim: item & mask locations and EXACT names, WHICH song is learned and from WHOM (Sonata of Awakening = the caged monkey at the Deku Palace; Goron's Lullaby = the Goron Elder + his baby; New Wave Bossa Nova = the hatched Zora eggs; Elegy of Emptiness = Igos du Ikana / the Ikana king; Oath to Order = learned after the first Giant is freed), the dungeon order/prerequisites, the transformation mask each region grants (Goron Mask = heal Darmani; Zora Mask = heal Mikau), and especially BOSS strategies (Odolwa = arrows/Deku Nuts then slash; Goht = spiked Goron roll / Fire Arrows; Gyorg = arrows when it leaps then Zora-attack; Twinmold = Giant's Mask; Majora = Fierce Deity's Mask / Light Arrows). Fix errors in place; SOFTEN/REMOVE anything you can't confirm. Verify the three-day-clock claims are accurate (what the Song of Time keeps vs. loses).
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
log("MM chapters verified: " + ordered.length + "/" + CHAPTERS.length + " · " + steps + " steps" + (missing.length ? " · MISSING: " + missing.join(", ") : ""));
return { chapters: ordered, total: ordered.length, expected: CHAPTERS.length, missing };
`;

fs.writeFileSync("/tmp/mm-walkthrough-workflow.mjs", body);
console.log(`wrote /tmp/mm-walkthrough-workflow.mjs (${body.length} bytes) · ${CHAPTERS.length} chapters to author`);
console.log("chapters:", CHAPTERS.map((c) => c.id).join(", "));
