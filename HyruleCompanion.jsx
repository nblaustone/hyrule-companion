import { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================
   HYRULE COMPANION · v3
   Sheikah Slate–styled walkthrough + living pouch for
   The Legend of Zelda: Breath of the Wild (Switch).
   Regions: Great Plateau · Kakariko · Hateno · Captured
   Memories · Divine Beast Vah Ruta.
   Progress + pouch persist via window.storage.
   ============================================================ */

/* Storage adapter (ADR 0002): prefer window.storage (Claude artifact runtime),
   fall back to localStorage (standalone / phone). One source serves both. */
const store = {
  async get(k) {
    try {
      if (typeof window !== "undefined" && window.storage) { const r = await window.storage.get(k, false); return r ? r.value : null; }
      if (typeof localStorage !== "undefined") return localStorage.getItem(k);
    } catch (e) {}
    return null;
  },
  async set(k, v) {
    try {
      if (typeof window !== "undefined" && window.storage) { await window.storage.set(k, v, false); return; }
      if (typeof localStorage !== "undefined") localStorage.setItem(k, v);
    } catch (e) {}
  },
};
const CHECKABLE = new Set(["step", "loot", "optional", "reward"]);

/* ============================================================ REGION 1 · GREAT PLATEAU ============================================================ */
const GREAT_PLATEAU = {
  id: "plateau", name: "The Great Plateau", sub: "Tutorial", kind: "region",
  tagline: "Where Link awakens — the tutorial that holds all of Hyrule in miniature.",
  sections: [
    { id: "awk", name: "Awakening", sub: "Shrine of Resurrection", steps: [
      { id: "awk1", k: "step", t: "Take the Sheikah Slate from the pedestal in front of you. This is your map, scope, runes — everything.", items: [{ name: "Sheikah Slate", cat: "key", note: "Map, scope & rune device" }] },
      { id: "awk2", k: "loot", t: "Open the two chests in the next room for the Old Shirt and Well-Worn Trousers. Equip both (＋ button).", items: [{ name: "Old Shirt", cat: "armor", note: "Starter top" }, { name: "Well-Worn Trousers", cat: "armor", note: "Starter legs" }] },
      { id: "awk3", k: "step", t: "Hold the Slate to the second pedestal to open the great door, then climb the ledges out into the light." },
      { id: "awk4", k: "step", t: "Outside, grab the Tree Branch leaning on a rock — your first weapon — and pick a couple of Hylian Mushrooms." },
      { id: "awk5", k: "tip", t: "Almost everything can be climbed, but climbing drains the green stamina wheel. If it empties mid-climb, Link falls. Keep early climbs short." },
    ]},
    { id: "oldman", name: "The Old Man & Temple of Time", sub: "Get your bearings", steps: [
      { id: "om1", k: "step", t: "Head down to the Old Man at the campfire and talk to him. He mentions the Temple of Time and offers you a Torch." },
      { id: "om2", k: "loot", t: "Inside the Temple of Time ruins: climb the rubble to a chest with a Traveler's Bow, and grab Arrows near the altar. This is a common starter bow — there are several on the Plateau (another waits inside Oman Au). Grab both; bows break, so spares help.", items: [{ name: "Traveler's Bow", cat: "bow", note: "From Temple of Time · power 5" }] },
      { id: "om3", k: "tip", t: "Note the Goddess Statue inside the temple — you'll return here to trade Spirit Orbs for a heart or stamina upgrade." },
      { id: "om4", k: "optional", t: "The Temple roof hides a Korok seed under a small rock. Korok seeds expand your inventory slots later." },
    ]},
    { id: "tower", name: "Raise the Plateau Tower", sub: "“Follow the Sheikah Slate”", steps: [
      { id: "tw1", k: "step", t: "Follow the marker to the round stone pedestal near the center of the Plateau and place the Slate in the slot." },
      { id: "tw2", k: "step", t: "The Sheikah Tower erupts upward. At the top, examine the glowing terminal to download the Plateau map." },
      { id: "tw3", k: "step", t: "Climb down. The Old Man glides over and asks for a shrine's treasure in trade for the Paraglider — you actually need all four shrines." },
      { id: "tw4", k: "tip", t: "From up high, click the right stick for the Scope. Look for orange pillars of light — those are the four shrines — and drop a pin on each." },
    ]},
    { id: "oman", name: "Oman Au Shrine", sub: "Magnesis Trial · pond near the tower", reward: "Magnesis Rune — move metal", steps: [
      { id: "oa0", k: "optional", t: "At night, Stalkoblins (reassembling skeletons) rise around the shrine and the tower field — smash the skull to drop them, and grab any weapons they leave, like a Traveler's Sword. Free early melee, but they fall apart again at dawn.", items: [{ name: "Traveler's Sword", cat: "weapon", note: "Dropped by Stalkoblins at night near Oman Au" }] },
      { id: "oa1", k: "step", t: "Enter and download the MAGNESIS rune (lift and move anything metal).", items: [{ name: "Magnesis", cat: "rune", note: "Move metal objects", rune: "magnesis" }] },
      { id: "oa2", k: "step", t: "Use Magnesis (L) on the two metal floor slabs and pull them aside to open the passage." },
      { id: "oa3", k: "step", t: "Raise the submerged metal plank with Magnesis and lay it across the water as a bridge, then cross." },
      { id: "oa4", k: "tip", t: "A Guardian Scout activates ahead. Easy kill: drop a metal slab on it with Magnesis." },
      { id: "oa5", k: "loot", t: "Pull the submerged chest out of the water with Magnesis for a Traveler's Bow. Same common bow as the Temple of Time one — not a glitch, there are simply several on the Plateau. Keep the spare.", items: [{ name: "Traveler's Bow", cat: "bow", note: "From Oman Au Shrine · power 5" }] },
      { id: "oa6", k: "step", t: "At the sealed door, grab the metal locking bar through the door with Magnesis and slide it out, then go through." },
      { id: "oa7", k: "reward", t: "Examine Monk Oman Au's altar to claim your 1st Spirit Orb.", items: [{ name: "Spirit Orb", cat: "key", note: "Oman Au Shrine", orb: true }] },
    ]},
    { id: "jabaij", name: "Ja Baij Shrine", sub: "Bomb Trial · Eastern Abbey (east)", reward: "Remote Bomb Rune", steps: [
      { id: "jb0", k: "warn", t: "HAZARD: the Eastern Abbey is full of dormant Guardians. If a red beam locks onto you, sprint behind cover immediately — a hit here can one-shot you. Approach from high ground or the north wall." },
      { id: "jb1", k: "step", t: "Download the REMOTE BOMB rune. Switch round/cube bombs with the D-pad; detonate by pressing L again.", items: [{ name: "Remote Bombs", cat: "rune", note: "Infinite round & cube bombs", rune: "bomb" }] },
      { id: "jb2", k: "step", t: "Bomb the breakable rock piles blocking the two paths. Do the right path first." },
      { id: "jb3", k: "loot", t: "Behind the right rocks: a chest with the Traveler's Claymore — a powerful two-handed sword (hold Y for a spin attack).", items: [{ name: "Traveler's Claymore", cat: "weapon", note: "Two-handed · high damage" }] },
      { id: "jb4", k: "step", t: "Up the ladder, drop a CUBE bomb onto the moving platform; detonate when it carries the bomb next to the blocked doorway." },
      { id: "jb5", k: "loot", t: "Use the bomb launcher to fling a ROUND bomb into the breakable wall, revealing a chest with Amber.", items: [{ name: "Amber", cat: "material", note: "Gem · sell or upgrade armor" }] },
      { id: "jb6", k: "step", t: "Stand on the far launcher to be flung across to the altar." },
      { id: "jb7", k: "reward", t: "Claim your 2nd Spirit Orb from Monk Ja Baij.", items: [{ name: "Spirit Orb", cat: "key", note: "Ja Baij Shrine", orb: true }] },
    ]},
    { id: "warm", name: "Stay Warm First", sub: "Before the mountain shrines", steps: [
      { id: "wd0", k: "warn", t: "The last two shrines are up cold Mount Hylia. Go up unprepared and you'll lose hearts to the cold. Sort warmth first." },
      { id: "wd1", k: "step", t: "Quick fix: cook 2–3 Spicy Peppers into Spicy Sautéed Peppers for a few minutes of cold resistance. (See the Cook tab.)" },
      { id: "wd2", k: "step", t: "Better fix — the Warm Doublet: go to the Old Man's cabin (south, near Mount Hylia's base) and read his diary." },
      { id: "wd3", k: "step", t: "Cook his recipe — Spicy Meat and Seafood Fry = Raw Meat + Spicy Pepper + Hyrule Bass — then show him the dish." },
      { id: "wd4", k: "reward", t: "He rewards you with the Warm Doublet: permanent cold resistance. (Or grab it from his cabin chest after all 4 shrines.)", items: [{ name: "Warm Doublet", cat: "armor", note: "Passive cold resistance" }] },
    ]},
    { id: "owa", name: "Owa Daim Shrine", sub: "Stasis Trial · Mount Hylia (cold)", reward: "Stasis Rune", steps: [
      { id: "od1", k: "step", t: "Download the STASIS rune. Freeze the spinning cog/platform with Stasis (L), then run across while it's stopped.", items: [{ name: "Stasis", cat: "rune", note: "Freeze time on one object", rune: "stasis" }] },
      { id: "od2", k: "step", t: "On the boulder ramp, Stasis an incoming boulder to freeze it and run past safely." },
      { id: "od3", k: "loot", t: "On a ledge to the right partway up: a chest with a Traveler's Shield.", items: [{ name: "Traveler's Shield", cat: "shield", note: "Basic shield" }] },
      { id: "od4", k: "step", t: "The huge boulder blocking the exit: cast Stasis on it, whack it 5–6 times with a strong weapon (an Iron Sledgehammer is nearby). When Stasis ends, stored energy launches it away." },
      { id: "od5", k: "reward", t: "Claim your 3rd Spirit Orb from Monk Owa Daim.", items: [{ name: "Spirit Orb", cat: "key", note: "Owa Daim Shrine", orb: true }] },
      { id: "od6", k: "optional", t: "Outside, Stasis-and-smash the boulder on the ledge to reveal a hidden chest (another Traveler's Bow).", items: [{ name: "Traveler's Bow", cat: "bow", note: "Behind Owa Daim · power 5" }] },
    ]},
    { id: "keh", name: "Keh Namut Shrine", sub: "Cryonis Trial · Mount Hylia peak (cold)", reward: "Cryonis Rune", steps: [
      { id: "kn1", k: "step", t: "Download the CRYONIS rune. Aim at water under the raised gate, make an ice pillar to prop it open, then climb over.", items: [{ name: "Cryonis", cat: "rune", note: "Raise ice pillars from water", rune: "cryonis" }] },
      { id: "kn2", k: "step", t: "A Guardian Scout fires from a ledge — raise an ice block as cover, then rush and finish it." },
      { id: "kn3", k: "step", t: "At the tall wall with a gap, make a vertical ice pillar under the gap to lift yourself up and over." },
      { id: "kn4", k: "loot", t: "Make an ice pillar under the high alcove ledge to reach a chest with a Traveler's Spear.", items: [{ name: "Traveler's Spear", cat: "weapon", note: "Long reach" }] },
      { id: "kn5", k: "reward", t: "Claim your 4th Spirit Orb from Monk Keh Namut. All four shrines done!", items: [{ name: "Spirit Orb", cat: "key", note: "Keh Namut Shrine", orb: true }] },
    ]},
    { id: "statue", name: "First Upgrade", sub: "Goddess Statue · Temple of Time", steps: [
      { id: "gs1", k: "step", t: "Return to the Goddess Statue (warp to the Tower, drop down). Pray with your 4 Spirit Orbs." },
      { id: "gs2", k: "reward", t: "Trade for ONE upgrade: a Heart Container (+1 heart) or a Stamina Vessel. For a first run, the extra heart helps you survive.", items: [{ name: "Heart Container / Stamina Vessel", cat: "key", note: "First upgrade (4 orbs)" }] },
    ]},
    { id: "glider", name: "The Paraglider", sub: "Meet the king · Temple roof", steps: [
      { id: "pg1", k: "step", t: "Climb to the Temple of Time roof. The Old Man reveals himself as King Rhoam and tells the story of the Calamity and Princess Zelda." },
      { id: "pg2", k: "reward", t: "He hands you the PARAGLIDER — your ticket off the Plateau and into all of Hyrule.", items: [{ name: "Paraglider", cat: "key", note: "Glide off cliffs & towers" }] },
      { id: "pg3", k: "optional", t: "Loose ends: grab the Warm Doublet from his cabin if skipped, plus a few easy Korok seeds (Temple roof, lily-pad ring near the cabin, the pit where you woke up)." },
    ]},
    { id: "leave", name: "Leave the Plateau", sub: "“Seek Out Impa”", steps: [
      { id: "lv1", k: "step", t: "Run off a cliff edge and press X to deploy the Paraglider. Steer with the stick; watch stamina so you don't drop mid-glide." },
      { id: "lv2", k: "step", t: "Glide east toward the Dueling Peaks. Next objective: Kakariko Village to meet Impa. The tutorial is over — Hyrule is open." },
    ]},
  ],
};

/* ============================================================ REGION 2 · SEEK OUT IMPA / KAKARIKO ============================================================ */
const KAKARIKO = {
  id: "kakariko", name: "Seek Out Impa", sub: "Kakariko Village", kind: "region",
  tagline: "Off the Plateau at last — east to the Dueling Peaks, then north to meet Impa.",
  sections: [
    { id: "k_cross", name: "Cross to the Dueling Peaks", sub: "Glide east · activate the tower", steps: [
      { id: "k1", k: "step", t: "Warp to Ja Baij Shrine (eastern edge of the Plateau) and paraglide east toward the Dueling Peaks — the huge mountain split down the middle." },
      { id: "k2", k: "optional", t: "Bosh Kala Shrine sits just off the path near the Outpost Ruins — an easy Spirit Orb on the way.", items: [{ name: "Spirit Orb", cat: "key", note: "Bosh Kala Shrine", orb: true }] },
      { id: "k3", k: "tip", t: "At Proxim Bridge, an NPC named Brigo gives directions to Kakariko if you talk to him." },
      { id: "k4", k: "step", t: "Climb and activate the Dueling Peaks Tower to fill in this region's map. Climb every tower you pass." },
      { id: "k5", k: "optional", t: "Ha Dahamar Shrine is by the river after the valley (a water/Cryonis puzzle) — another easy orb.", items: [{ name: "Spirit Orb", cat: "key", note: "Ha Dahamar Shrine", orb: true }] },
      { id: "k6", k: "loot", t: "Ree Dahee Shrine along the route rewards the Climber's Bandanna — climb faster, plus a little defense. Worth the detour.", items: [{ name: "Climber's Bandanna", cat: "armor", note: "Climb faster" }, { name: "Spirit Orb", cat: "key", note: "Ree Dahee Shrine", orb: true }] },
    ]},
    { id: "k_road", name: "The Road to Kakariko", sub: "Stable · Hestu · the river path", steps: [
      { id: "k7", k: "step", t: "Stop at the Dueling Peaks Stable to rest, buy supplies, and register a horse if you've tamed one." },
      { id: "k8", k: "tip", t: "BIG: find Hestu on the path (a giant Korok with maracas). His quest 'The Priceless Maracas' lets you trade Korok Seeds to expand your weapon, bow, and shield slots — do this as soon as you can." },
      { id: "k9", k: "step", t: "Follow the Squabble River north. An NPC by a fire near the gate (Nanna) will point you to Impa's house." },
    ]},
    { id: "k_village", name: "Kakariko Village", sub: "Ta'loh Naeg · Impa", steps: [
      { id: "k10", k: "loot", t: "Climb the hill above the village to the Ta'loh Naeg Shrine. Its trial is a COMBAT TUTORIAL — it teaches perfect dodge, flurry rush, and parry. Do it; it also becomes the village's fast-travel point.", items: [{ name: "Spirit Orb", cat: "key", note: "Ta'loh Naeg Shrine", orb: true }] },
      { id: "k11", k: "tip", t: "Shops worth a look: Enchanted (armor — the Hylian set is solid, the Stealth set helps at night), the arrow shop, and the general store." },
      { id: "k12", k: "reward", t: "Go to Impa's house (the big one; guards let you pass once they spot your Slate). She tells the story of the Calamity and gives two quests — Free the Divine Beasts and Locked Mementos. Next stop: Purah at the Hateno Ancient Tech Lab." },
      { id: "k13", k: "optional", t: "Nearby: Great Fairy Cotera's fountain (Pikango's 'Find the Fairy Fountain' quest) upgrades armor. And 'The Stolen Heirloom' side quest with Paya/Dorian uncovers the Yiga Clan." },
    ]},
  ],
};

/* ============================================================ REGION 3 · LOCKED MEMENTOS / HATENO ============================================================ */
const HATENO = {
  id: "hateno", name: "Locked Mementos", sub: "Hateno · Purah", kind: "region",
  tagline: "Cross the Guardian-strewn plain to Hateno and get your Sheikah Slate's camera back.",
  sections: [
    { id: "h_town", name: "To Hateno Village", sub: "Tower · Myahm Agana", steps: [
      { id: "h0", k: "warn", t: "HAZARD: the route from Kakariko crosses Blatchery Plain / Fort Hateno — a field of broken AND active Guardians. Keep your distance and use cover; a hit can one-shot you. (You'll return here later for a memory.)" },
      { id: "h1", k: "step", t: "Head south then east into the Necluda region. Activate the Hateno Tower, then follow the road east to Hateno Village." },
      { id: "h2", k: "optional", t: "Myahm Agana Shrine is in the village — activate it for a warp point. Its optional trial is a tilt-the-maze ball puzzle (motion controls or Magnesis).", items: [{ name: "Spirit Orb", cat: "key", note: "Myahm Agana Shrine", orb: true }] },
    ]},
    { id: "h_lab", name: "Hateno Tech Lab — Purah", sub: "Blue flame · Camera Rune", reward: "Camera Rune + Hyrule Compendium", steps: [
      { id: "h3", k: "step", t: "Follow the lantern-lined path east of the village up the cape to the Ancient Tech Lab. Talk to the girl (Purah) → she sends you to Symin → Symin reveals Purah IS the director. Talk to Purah again." },
      { id: "h4", k: "step", t: "Purah needs the blue flame. Grab a torch (one's by the lab door), then go down to the town's Ancient Furnace (the blue light past the ranch) and light your torch on it." },
      { id: "h5", k: "step", t: "Carry the flame back up to the lab. DON'T run (it blows out) and avoid rain. Light the stone lanterns along the way — they stay lit as checkpoints to re-light from." },
      { id: "h6", k: "reward", t: "Light the lab's furnace (the balloon-shaped one by the entrance) to open a warp pad. Purah uses the Guidance Stone to repair your Slate: you get the CAMERA RUNE, the album, and the Hyrule Compendium. Snap a photo of Purah and show her.", items: [{ name: "Camera", cat: "rune", note: "Photograph things for the Compendium", rune: "camera" }] },
      { id: "h7", k: "optional", t: "Bonus: Symin's side quest (photograph a Sunshroom) upgrades your Sheikah Sensor. Reading Purah's diary triggers a prank. Hateno is a great home base — you can buy a house here from Bolson (3,000 rupees + bundles of wood)." },
    ]},
    { id: "h_back", name: "Back to Impa", sub: "Start Captured Memories", steps: [
      { id: "h8", k: "step", t: "Return to Kakariko and talk to Impa again. This completes Locked Mementos and begins Captured Memories — and opens the path to the Divine Beasts." },
    ]},
  ],
};

/* ============================================================ REGION 4 · CAPTURED MEMORIES ============================================================ */
const MEMORIES = {
  id: "memories", name: "Captured Memories", sub: "Optional · the real story", kind: "region",
  tagline: "Twelve photos Zelda left behind. Optional, but they tell the true story — and unlock a secret ending.",
  sections: [
    { id: "m_how", name: "How It Works", sub: "Album · Pikango · the reward", steps: [
      { id: "m1", k: "step", t: "Impa gives you an album of 12 photos taken 100 years ago. Each marks a real spot in Hyrule. Stand on the glowing patch of ground there to trigger the memory cutscene." },
      { id: "m2", k: "reward", t: "Show Impa your FIRST recovered memory to get the Champion's Tunic — strong, upgradeable armor. Grab an easy memory early just for this.", items: [{ name: "Champion's Tunic", cat: "armor", note: "Reward for your 1st memory" }] },
      { id: "m3", k: "tip", t: "Finish 'Find the Fairy Fountain' (photograph Cotera for Pikango) so Pikango will hint at locations. Show him the nearest photo at a stable and he names the place." },
      { id: "m4", k: "warn", t: "Heads up: many memories sit deep in dangerous, far-off regions (Hyrule Castle, Gerudo, Akkala, Tabantha) well beyond where you are now. Treat this as a long-haul quest you chip away at — start with the easy, nearby ones." },
    ]},
    { id: "m_list", name: "All 12 Memory Locations", sub: "Album order · tap to track", steps: [
      { id: "m_l1", k: "optional", t: "#1 Sacred Ground Ruins — Central Hyrule, in the forest just south of Hyrule Castle (a Guardian Stalker guards it)." },
      { id: "m_l2", k: "optional", t: "#2 Lake Kolomo — Central Hyrule, the forest on the west shore (near Riverside Stable)." },
      { id: "m_l3", k: "optional", t: "#3 Ancient Columns — Tabantha, atop the cliff just south after crossing the Tabantha Great Bridge." },
      { id: "m_l4", k: "optional", t: "#4 Kara Kara Bazaar — Gerudo Desert, the oasis on the way to Gerudo Town (you pass it in the story)." },
      { id: "m_l5", k: "optional", t: "#5 Eldin Canyon — Eldin, on a cliff between Hyrule Castle and the Great Hyrule Forest (climb from Woodland Stable)." },
      { id: "m_l6", k: "optional", t: "#6 Irch Plain — Hyrule Ridge, by the large tree southeast of Serenne Stable." },
      { id: "m_l7", k: "optional", t: "#7 West Necluda — near Scout's Hill by Lake Hylia (glide from Ja Baij Shrine to the big tree across the river)." },
      { id: "m_l8", k: "optional", t: "#8 Hyrule Castle — by Zelda's Study spire on the castle's west side. DANGEROUS — save for later." },
      { id: "m_l9", k: "optional", t: "#9 Spring of Power — Akkala, the goddess spring in North Akkala Valley west of East Akkala Stable." },
      { id: "m_l10", k: "optional", t: "#10 Sanidin Park Ruins — Hyrule Ridge, the giant horse statue on Safula Hill (near Outskirt Stable)." },
      { id: "m_l11", k: "optional", t: "#11 Lanayru Road – East Gate — Necluda, the gate at the base of cold Mount Lanayru (bring cold resistance)." },
      { id: "m_l12", k: "optional", t: "#12 Hyrule Field — Central Hyrule, the forest northeast of the Bottomless Swamp (near Wetland Stable)." },
      { id: "m_l13", k: "reward", t: "After all 12, report to Impa — she reveals the 13th photo (hanging in her house): #13 Blatchery Plain, the Guardian field near Fort Hateno. Recall it to finish the quest and unlock the bonus ending scene." },
    ]},
  ],
};

/* ============================================================ REGION 5 · DIVINE BEAST VAH RUTA ============================================================ */
const VAH_RUTA = {
  id: "vah_ruta", name: "Divine Beast Vah Ruta", sub: "Zora's Domain", kind: "beast", champion: "Mipha's Grace",
  tagline: "Your first Divine Beast — the easiest. Reach Zora's Domain, calm the elephant, and free Mipha.",
  sections: [
    { id: "r_reach", name: "Reach Zora's Domain", sub: "Sidon · the endless rain", steps: [
      { id: "r1", k: "step", t: "Head to the Lanayru region and the Zora River. Crossing toward the Great Zora Bridge starts 'Reach Zora's Domain'. Prince Sidon meets you at Inogo Bridge and offers to help." },
      { id: "r2", k: "warn", t: "It rains nonstop here (that's Vah Ruta), so climbing is too slick to rely on. Follow the luminous-stone path up the river instead, and watch for electric Lizalfos and Octoroks." },
      { id: "r3", k: "step", t: "Follow the river path all the way up to Zora's Domain. Sidon keeps cheering you along the way." },
    ]},
    { id: "r_king", name: "King Dorephan & the Zora Armor", sub: "Throne room", steps: [
      { id: "r4", k: "reward", t: "King Dorephan explains Vah Ruta's rain is about to overflow the reservoir and flood Hyrule. He gives you the Zora Armor — swim faster and swim UP waterfalls. (Muzu, the old advisor, distrusts Hylians.)", items: [{ name: "Zora Armor", cat: "armor", note: "Swim up waterfalls" }] },
      { id: "r5", k: "step", t: "Equip the Zora Armor and head down to talk to Muzu and Sidon. Your task: gather 20 Shock Arrows." },
      { id: "r6", k: "optional", t: "Do the Ne'ez Yohma Shrine in the Domain first for a fast-travel point right here.", items: [{ name: "Spirit Orb", cat: "key", note: "Ne'ez Yohma Shrine", orb: true }] },
    ]},
    { id: "r_arrows", name: "20 Shock Arrows", sub: "Ploymus Mountain", steps: [
      { id: "r7", k: "step", t: "Use the Zora Armor to swim up the east waterfalls to Ploymus Mountain / Shatterback Point above the reservoir." },
      { id: "r8", k: "warn", t: "A Red-Maned Lynel roams here and it's brutal for a new player. You can SNEAK around it and pick up the 20+ Shock Arrows lying around the mountain without fighting — that's the safe play." },
      { id: "r9", k: "loot", t: "If you do fight the Lynel: Perfect Dodge → flurry, stun it with arrows to the face, and mount it. Either way, leave with 20 Shock Arrows.", items: [{ name: "Shock Arrows ×20", cat: "material", note: "Needed to calm Vah Ruta" }] },
    ]},
    { id: "r_calm", name: "Calm Vah Ruta", sub: "Ride Sidon · 4 pink orbs", steps: [
      { id: "r10", k: "step", t: "At East Reservoir Lake, ride on Sidon's back. Vah Ruta hurls ice blocks — shatter them with Cryonis (aim, A) or arrows before they hit." },
      { id: "r11", k: "step", t: "When Sidon swims beside a waterfall pouring off Ruta, swim UP it with the Zora Armor, deploy the paraglider at the top for slow-mo, and shoot a glowing pink orb on Ruta's back with a Shock Arrow." },
      { id: "r12", k: "step", t: "After two orbs it adds spiky ice — keep breaking it with Cryonis. Destroy all 4 pink orbs and Sidon drops you onto Vah Ruta." },
    ]},
    { id: "r_inside", name: "Inside Vah Ruta", sub: "Activate 5 terminals", reward: "Control of Vah Ruta", steps: [
      { id: "r13", k: "step", t: "Mipha's spirit tells you to light 5 terminals, then the main control unit. First room: shoot the Malice eyeball at the top of the ramp, deal with the Guardian Scout, and use Cryonis to lift the gate on your left." },
      { id: "r14", k: "step", t: "The map terminal also lets you ROTATE Ruta's trunk — this aims its waterfall and controls the water level. Pour water onto the cogwheels to spin platforms; use Cryonis on water/ice and Magnesis on cranks and chests to reach each terminal." },
      { id: "r15", k: "optional", t: "Optional: swim up to Toto Lake (north) and use Magnesis on the submerged ruins for an Ice Arrows ×10 chest.", items: [{ name: "Ice Arrows ×10", cat: "material", note: "Optional chest, Toto Lake" }] },
      { id: "r16", k: "step", t: "For the last terminal, rotate the trunk to pour water and douse the fire blocking the path. Grab any chests now — you can't return after the boss. Then activate all 5 terminals and the main control unit." },
    ]},
    { id: "r_boss", name: "Boss: Waterblight Ganon", sub: "Free Mipha", reward: "Mipha's Grace + Heart Container", steps: [
      { id: "r17", k: "step", t: "Phase 1: it floats and stabs with a spear. Guard or dodge the thrusts, shoot its EYE (Shock Arrows are ideal) to stagger it, then rush in with melee." },
      { id: "r18", k: "step", t: "Phase 2 (around half health): it floods the room and flies corner to corner, throwing ice blocks (break with Cryonis) and spears. Make Cryonis pillars for height, shoot the eye, and keep dodging until it falls." },
      { id: "r19", k: "loot", t: "GRAB the Heart Container that drops BEFORE touching the terminal again.", items: [{ name: "Heart Container", cat: "key", note: "From Waterblight Ganon" }] },
      { id: "r20", k: "reward", t: "Activate the main control unit to free Mipha. She grants Mipha's Grace — once per charge, if you fall in battle it auto-revives you with full + bonus hearts. Return to the Zora throne room for the cutscene; you can claim the Lightscale Trident from King Dorephan.", items: [{ name: "Lightscale Trident", cat: "weapon", note: "Mipha's spear (from the King)" }] },
    ]},
  ],
};

/* REGIONS is assembled at the bottom of the file, after all region objects are defined. */

const STATUS_RUNES = [
  { name: "Magnesis", glyph: "magnesis", step: "oa1" },
  { name: "Bombs", glyph: "bomb", step: "jb1" },
  { name: "Stasis", glyph: "stasis", step: "od1" },
  { name: "Cryonis", glyph: "cryonis", step: "kn1" },
  { name: "Camera", glyph: "camera", step: "h6" },
];
const CHAMPIONS = [
  { name: "Mipha's Grace", from: "Vah Ruta", step: "r20", note: "Auto-revive once per charge" },
  { name: "Revali's Gale", from: "Vah Medoh", step: "md_b3", note: "Updraft on demand" },
  { name: "Daruk's Protection", from: "Vah Rudania", step: "rd_b3", note: "Shield, 3 hits" },
  { name: "Urbosa's Fury", from: "Vah Naboris", step: "nb_b3", note: "Lightning nova" },
];
const CATS = [
  { id: "rune", name: "Runes", glyph: "stasis" },
  { id: "weapon", name: "Weapons", glyph: "sword" },
  { id: "bow", name: "Bows", glyph: "bow" },
  { id: "shield", name: "Shields", glyph: "shield" },
  { id: "armor", name: "Armor", glyph: "armor" },
  { id: "key", name: "Key Items", glyph: "key" },
  { id: "material", name: "Materials", glyph: "gem" },
];
const ROADMAP = [
  { id: "shrines", name: "120 Shrines", sub: "Spirit Orbs everywhere", note: "Each shrine is a puzzle (or a Test of Strength) worth a Spirit Orb. Four orbs = one heart or stamina upgrade. The big long-term goal.", reward: "Hearts & stamina" },
  { id: "koroks", name: "900 Korok Seeds", sub: "Hidden mini-puzzles", note: "Tiny puzzles tucked all over Hyrule. Trade them to Hestu to expand your weapon, bow, and shield slots.", reward: "Bigger inventory" },
  { id: "fairies", name: "Great Fairies & armor", sub: "Upgrade your gear", note: "Unlock the four Great Fairy Fountains, then upgrade armor sets with monster parts for powerful set bonuses (stealth, cold, climbing, and more).", reward: "Stronger armor" },
  { id: "sidequests", name: "Side quests & Tarrey Town", sub: "The world's stories", note: "Dozens of side quests — building Tarrey Town and the horse-god questline are standouts, and many unlock useful gear.", reward: "Gear, rupees, lore" },
  { id: "dlc", name: "DLC & Master Mode", sub: "If you have the expansion", note: "Trial of the Sword, the Champions' Ballad, and the Master Cycle Zero; Master Mode is a tougher remix of the whole game.", reward: "Extra challenge" },
];

const RUNES = [
  { id: "magnesis", name: "Magnesis", glyph: "magnesis", from: "Oman Au Shrine", what: "Lift, move, and drop anything metal — bridges, chests, slabs, even enemies.", tip: "Drop a metal slab on a Guardian Scout for a free kill." },
  { id: "bombs", name: "Remote Bombs", glyph: "bomb", from: "Ja Baij Shrine", what: "Two infinite bombs — round one rolls, cube one stays put — on a short cooldown.", tip: "Bombs break ore deposits and rock piles, and clear weak enemy groups." },
  { id: "stasis", name: "Stasis", glyph: "stasis", from: "Owa Daim Shrine", what: "Freeze one object in time. Hit it while frozen to store force, released when it unfreezes.", tip: "Freeze a boulder, smash it, and launch it at enemies." },
  { id: "cryonis", name: "Cryonis", glyph: "cryonis", from: "Keh Namut Shrine", what: "Raise pillars of ice from any water — platforms, cover, or a lift for gates and chests.", tip: "Make a pillar under yourself to rise out of deep water." },
  { id: "camera", name: "Camera", glyph: "camera", from: "Hateno Tech Lab", what: "Photograph creatures, items, and enemies to build the Hyrule Compendium.", tip: "Registered things can be located by Hyrule's photo trader later." },
];
const TIPS = [
  { id: "combat", name: "Combat that keeps you alive", items: ["Perfect Dodge: hop away the instant before a hit lands, then press Y for a flurry of free hits.", "Parry: lock on and press A right as an attack connects — it even bounces Guardian lasers back.", "Charged attack: hold Y. Each weapon type does something different (swords sweep all around you).", "You don't have to fight everything. Running away is a totally valid, often smart, move."] },
  { id: "weapons", name: "Weapons break — that's the system", items: ["Every weapon has durability and will shatter. Save your best gear for tough enemies and bosses.", "When a weapon is about to break, throw it (R) at an enemy for big bonus damage, then swap.", "Pick up everything dropped — you'll always be cycling through fresh weapons.", "Farm arrows: block an archer's shots with a wooden shield and the arrows stick to it."] },
  { id: "survival", name: "Survival basics", items: ["There are no hearts in grass or pots — you heal by eating, mostly cooked food. Always forage.", "Cold zones drain hearts (Spicy food or the Warm Doublet fix it); deserts are hot, Death Mountain burns.", "Smash black, sparkling ore deposits — ideally with a hammer weapon — for gems and flint.", "Save often before risky climbs and fights so you can retry."] },
  { id: "explore", name: "Exploring Hyrule", items: ["See a tower? Climb it. Towers reveal the map and give a high glide-off point.", "Shrines give Spirit Orbs (4 = one heart or stamina upgrade) and become fast-travel points.", "Glide from heights to cross huge distances fast — but mind your stamina wheel.", "Korok seeds (900 of them) trade in to expand your inventory slots."] },
];
const COOK_RULES = [
  "One effect at a time. You can't combine two buffs in a dish — a Hearty + Spicy mix keeps only one. Cook each effect separately.",
  "Stack the same type to make it stronger / last longer (e.g. 3 Spicy Peppers = longer cold resistance).",
  "Use a cooking pot for multi-ingredient meals. A bare campfire only roasts single items.",
  "Mixing monster parts WITHOUT a critter (or vice-versa) makes Dubious Food — edible but weak. Elixirs = critter + monster part.",
  "Cooking near a Blood Moon, or adding a dragon part, triggers a 'critical' bonus.",
];
const RECIPES = [
  { eff: "Spicy", tone: "warm", does: "Cold resistance — survive snowy areas like Mount Hylia.", key: "Spicy Pepper, Sunshroom, Warm Safflina", recipe: "Spicy Meat & Seafood Fry = Raw Meat + Spicy Pepper + Hyrule Bass", now: true },
  { eff: "Chilly", tone: "cool", does: "Heat resistance — for the DESERT only, not Death Mountain.", key: "Chillshroom, Hydromelon, Cool Safflina, Cold Darner", recipe: "Chilly Steamed Fish = Hylian Shroom + Cool Safflina + Hyrule Bass" },
  { eff: "Fireproof", tone: "fire", does: "Flame guard — required for Death Mountain. Only works as an ELIXIR.", key: "Fireproof Lizard or Smotherwing Butterfly + a monster part", recipe: "Fireproof Elixir = Fireproof Lizard + any monster part" },
  { eff: "Electro", tone: "volt", does: "Shock resistance — for thunderstorms and electric enemies.", key: "Voltfruit, Zapshroom, Electric Safflina, Thunderwing Butterfly", recipe: "Electro Omelet = Electric Safflina + Acorn + Bird Egg" },
  { eff: "Hearty", tone: "heart", does: "Full heal + temporary bonus (yellow) hearts — clutch for bosses.", key: "Hearty Radish, Hearty Durian, Hearty Truffle, Hearty Bass", recipe: "5× Hearty Durian = full heal + up to 20 bonus hearts" },
  { eff: "Energizing", tone: "stam", does: "Instantly restores stamina mid-climb or mid-glide.", key: "Stamella Shroom, Staminoka Bass, Courser Bee Honey", recipe: "Energizing Fried Wild Greens = Stamella Shrooms" },
  { eff: "Enduring", tone: "stam", does: "Adds a temporary bonus (yellow) stamina wheel.", key: "Endura Carrot, Endura Shroom", recipe: "Enduring Mushroom Skewer = Endura Shrooms" },
  { eff: "Mighty", tone: "atk", does: "Attack up — hit harder for a few minutes.", key: "Mighty Bananas, Mighty Thistle, Razorshroom, Bladed Rhino Beetle", recipe: "5× Mighty Bananas = attack boost (~4 min)" },
  { eff: "Tough", tone: "def", does: "Defense up — take less damage.", key: "Ironshroom, Armoranth, Fortified Pumpkin, Rugged Rhino Beetle", recipe: "Tough Mushroom Skewer = Ironshrooms" },
  { eff: "Hasty", tone: "speed", does: "Move faster — great for running from fights.", key: "Rushroom, Swift Carrot, Swift Violet, Fleet-Lotus Seeds", recipe: "Hasty Mushroom Skewer = Rushrooms" },
  { eff: "Sneaky", tone: "sneak", does: "Stealth up — sneak past or up to enemies.", key: "Silent Shroom, Blue Nightshade, Silent Princess, Sunset Firefly", recipe: "Sneaky Steamed Mushrooms = Silent Shrooms" },
];

/* ============================================================ GLYPHS ============================================================ */
function Glyph({ name, size = 26 }) {
  const s = { width: size, height: size, display: "block" };
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "eye": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M24 6c4 8 14 10 14 18 0 8-6 14-14 14S10 32 10 24c0-8 10-10 14-18Z" /><circle cx="24" cy="27" r="5" fill="currentColor" stroke="none" /><path d="M24 38l-2 5M24 38l2 5M19 36l-3 4M29 36l3 4" /></svg>);
    case "tower": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M19 42h10M21 42l1-22h4l1 22M20 20h8M24 12l-4 4M24 12l4 4" /><circle cx="24" cy="8" r="2.5" fill="currentColor" stroke="none" /></svg>);
    case "bag": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M12 18h24l-2 22H14L12 18Z" /><path d="M18 18v-2a6 6 0 0 1 12 0v2" /></svg>);
    case "pot": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M10 22h28l-3 16a3 3 0 0 1-3 2H16a3 3 0 0 1-3-2l-3-16Z" /><path d="M8 22h32M20 14c0 3-3 3-3 6M28 12c0 3-3 3-3 6" /></svg>);
    case "book": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M24 12c-4-3-10-3-14-2v26c4-1 10-1 14 2 4-3 10-3 14-2V10c-4-1-10-1-14 2Z" /><path d="M24 12v28" /></svg>);
    case "magnesis": return (<svg viewBox="0 0 48 48" style={s} {...c} strokeWidth="2.4"><path d="M16 10v14a8 8 0 0 0 16 0V10" /><path d="M14 10h6M28 10h6M16 28l-4 4M32 28l4 4" /></svg>);
    case "bomb": return (<svg viewBox="0 0 48 48" style={s} {...c} strokeWidth="2.2"><circle cx="21" cy="30" r="11" /><path d="M28 23l4-4M32 19l4 1M32 19l-1-4" /><rect x="30" y="8" width="9" height="9" transform="rotate(12 34 12)" /></svg>);
    case "stasis": return (<svg viewBox="0 0 48 48" style={s} {...c} strokeWidth="2.2"><circle cx="24" cy="24" r="13" /><path d="M24 16v8l6 4M24 6v3M24 39v3M6 24h3M39 24h3" /></svg>);
    case "cryonis": return (<svg viewBox="0 0 48 48" style={s} {...c} strokeWidth="2.2"><path d="M18 40V18l6-8 6 8v22M18 24h12M18 32h12" /></svg>);
    case "camera": return (<svg viewBox="0 0 48 48" style={s} {...c} strokeWidth="2.2"><rect x="8" y="14" width="32" height="22" rx="3" /><circle cx="24" cy="25" r="6" /><path d="M18 14l3-4h6l3 4" /></svg>);
    case "sword": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M34 8L20 22l-2 6 6-2L38 12l-4-4ZM18 28l-8 8M14 30l4 4M22 30l-8 8" /></svg>);
    case "bow": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M14 8c10 4 14 14 14 32M14 8c-2 12 2 26 14 32M12 14l24 20M30 30l8 2-2-8" /></svg>);
    case "shield": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M24 8l14 4v10c0 10-6 15-14 18-8-3-14-8-14-18V12l14-4Z" /><path d="M24 16v16" /></svg>);
    case "armor": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M18 8l6 4 6-4 8 6-4 6v18H14V20l-4-6 8-6Z" /></svg>);
    case "key": return (<svg viewBox="0 0 48 48" style={s} {...c}><circle cx="17" cy="17" r="8" /><path d="M22 22l14 14M30 30l4-4M34 34l4-4" /></svg>);
    case "gem": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M14 12h20l8 10-18 16L6 22l8-10Z" /><path d="M6 22h36M24 12l-6 10 6 16 6-16-6-10" /></svg>);
    case "orb": return (<svg viewBox="0 0 48 48" style={s} {...c}><circle cx="24" cy="24" r="13" /><path d="M24 11v26M11 24h26" opacity="0.5" /></svg>);
    case "beast": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M8 30c0-8 7-14 14-14 4 0 6 2 10 2 4 0 8 3 8 8v10H8V30Z" /><path d="M30 18c0-4 3-7 7-7M22 36v4M14 36v4M30 36v4" /></svg>);
    case "champion": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M24 6l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1 5-11Z" /></svg>);
    case "check": return (<svg viewBox="0 0 24 24" style={s} {...c} strokeWidth="3"><path d="M5 13l4 4 10-11" /></svg>);
    case "shrine": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M15 42h18M18 42V21a6 6 0 0 1 12 0v21M14 28h4M30 28h4" /><circle cx="24" cy="16" r="3.2" fill="currentColor" stroke="none" /></svg>);
    case "fairy": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M24 28c0-7 4-12 12-12-1 7-5 11-12 12ZM24 28c0-7-4-12-12-12 1 7 5 11 12 12ZM24 28c4 4 4 11 0 14-4-3-4-10 0-14Z" /><circle cx="24" cy="28" r="2.6" fill="currentColor" stroke="none" /></svg>);
    case "skull": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M24 7c8 0 13 6 13 14 0 4-2 8-5 10v5H19v-5c-3-2-5-6-5-10C14 13 16 7 24 7Z" /><circle cx="19.5" cy="22" r="2.6" fill="currentColor" stroke="none" /><circle cx="28.5" cy="22" r="2.6" fill="currentColor" stroke="none" /><path d="M24 28v4M20 38v3M28 38v3" /></svg>);
    case "leaf": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M11 37C11 20 24 11 38 11c0 17-13 26-27 26Z" /><path d="M16 32c6-6 13-11 18-14" /></svg>);
    case "scroll": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M15 11h15a3 3 0 0 1 3 3v21a3 3 0 0 0 3 3H17a3 3 0 0 1-3-3V11Z" /><path d="M19 19h9M19 25h9M19 31h6" /></svg>);
    default: return null;
  }
}
const KIND_META = {
  step: { label: "Step", color: "var(--orange)" }, loot: { label: "Loot", color: "var(--gold)" },
  optional: { label: "Optional", color: "var(--moss)" }, reward: { label: "Reward", color: "var(--cyan)" },
  tip: { label: "Tip", color: "var(--cyan-dim)" }, warn: { label: "Hazard", color: "var(--malice)" },
};
const SHRINE_CAT = {
  puzzle: { label: "Puzzle", color: "var(--cyan)" },
  combat: { label: "Combat", color: "var(--malice)" },
  blessing: { label: "Blessing", color: "var(--gold)" },
  quest: { label: "Quest", color: "var(--moss)" },
  mixed: { label: "Mixed", color: "var(--cyan-dim)" },
};
const ENEMY_TIER = [
  { id: "common", label: "Common foes", glyph: "skull", color: "var(--moss)" },
  { id: "mini-boss", label: "Mini-bosses", glyph: "beast", color: "var(--orange)" },
  { id: "boss", label: "Bosses", glyph: "beast", color: "var(--malice)" },
  { id: "guardian", label: "Guardians", glyph: "eye", color: "var(--cyan)" },
  { id: "yiga", label: "Yiga Clan", glyph: "skull", color: "var(--gold)" },
];

function PlateauMap({ statusOf, onJump }) {
  const nodes = [
    { id: "tower", x: 168, y: 150, label: "Tower", r: 11 }, { id: "oldman", x: 150, y: 200, label: "Temple", r: 8 },
    { id: "oman", x: 196, y: 124, label: "Oman Au", r: 9 }, { id: "jabaij", x: 256, y: 132, label: "Ja Baij", r: 9 },
    { id: "owa", x: 120, y: 96, label: "Owa Daim", r: 9 }, { id: "keh", x: 70, y: 70, label: "Keh Namut", r: 9 },
  ];
  const color = (st) => (st === "done" ? "var(--cyan)" : st === "active" ? "var(--orange)" : "var(--ink-line)");
  return (
    <div className="map-wrap">
      <svg viewBox="0 0 320 300" className="map-svg" role="img" aria-label="Schematic map of the Great Plateau">
        <path d="M40 120 L60 60 L130 38 L210 50 L280 96 L292 168 L250 244 L150 262 L70 232 L36 176 Z" fill="rgba(70,199,212,0.05)" stroke="rgba(70,199,212,0.28)" strokeWidth="1.5" />
        <path d="M40 120 L60 60 L130 38 L165 44 L120 110 L70 150 Z" fill="rgba(255,255,255,0.04)" stroke="none" />
        {nodes.filter((n) => n.id !== "tower").map((n) => (<line key={"l" + n.id} x1={168} y1={150} x2={n.x} y2={n.y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="2 4" />))}
        {nodes.map((n) => {
          const st = statusOf(n.id);
          return (
            <g key={n.id} onClick={() => onJump(n.id)} style={{ cursor: "pointer" }}>
              {st === "active" && <circle cx={n.x} cy={n.y} r={n.r + 6} fill="none" stroke="var(--orange)" strokeWidth="1" opacity="0.5" className="ping" />}
              <circle cx={n.x} cy={n.y} r={n.r} fill={st === "done" ? "rgba(70,199,212,0.18)" : "rgba(240,138,36,0.12)"} stroke={color(st)} strokeWidth="2" />
              {st === "done" && <path d={`M${n.x - 4} ${n.y} l3 3 l6 -7`} fill="none" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              <text x={n.x} y={n.y + n.r + 12} textAnchor="middle" className="map-label">{n.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="map-cap">Tap a node to jump · <span style={{ color: "var(--orange)" }}>amber</span> = to do · <span style={{ color: "var(--cyan)" }}>cyan</span> = done</p>
    </div>
  );
}

/* ============================================================ APP ============================================================ */
export default function HyruleCompanion() {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState({});
  const [tab, setTab] = useState("status");
  const [region, setRegion] = useState("plateau");
  const [guideSub, setGuideSub] = useState("runes");
  const [openSections, setOpenSections] = useState({ awk: true });
  const [query, setQuery] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await store.get("botw:progress"); const ui = await store.get("botw:ui");
      if (cancelled) return;
      try { if (p) setProgress(JSON.parse(p)); } catch (e) {}
      try { if (ui) { const u = JSON.parse(ui); if (u.tab) setTab(u.tab); if (u.region) setRegion(u.region); if (u.openSections) setOpenSections(u.openSections); if (u.guideSub) setGuideSub(u.guideSub); } } catch (e) {}
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (loaded) store.set("botw:progress", JSON.stringify(progress)); }, [progress, loaded]);
  useEffect(() => { if (loaded) store.set("botw:ui", JSON.stringify({ tab, region, openSections, guideSub })); }, [tab, region, openSections, guideSub, loaded]);

  const toggleStep = useCallback((id) => setProgress((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; }), []);
  const toggleSection = useCallback((id) => setOpenSections((o) => ({ ...o, [id]: !o[id] })), []);

  const { sectionStats, regionStats, total, done } = useMemo(() => {
    const sectionStats = {}; const regionStats = {}; let total = 0, done = 0;
    for (const reg of REGIONS) {
      let rt = 0, rd = 0;
      for (const sec of reg.sections) {
        let st = 0, sd = 0;
        for (const step of sec.steps) if (CHECKABLE.has(step.k)) { st++; if (progress[step.id]) sd++; }
        sectionStats[sec.id] = { total: st, done: sd, complete: st > 0 && sd === st, regionId: reg.id };
        rt += st; rd += sd;
      }
      regionStats[reg.id] = { total: rt, done: rd, complete: rt > 0 && rd === rt };
      total += rt; done += rd;
    }
    return { sectionStats, regionStats, total, done };
  }, [progress]);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const inventory = useMemo(() => {
    const byCat = {}; let invTotal = 0, invDone = 0, orbsDone = 0;
    for (const reg of REGIONS) for (const sec of reg.sections) for (const step of sec.steps) if (step.items)
      for (const it of step.items) {
        (byCat[it.cat] ||= []).push({ ...it, stepId: step.id, where: reg.name, secId: sec.id });
        invTotal++; if (progress[step.id]) { invDone++; if (it.orb) orbsDone++; }
      }
    return { byCat, invTotal, invDone, orbsDone };
  }, [progress]);
  const upgrades = Math.floor(inventory.orbsDone / 4);

  const shrineStats = useMemo(() => {
    let done = 0;
    for (const g of SHRINES) g.shrines.forEach((_, i) => { if (progress["shr_" + g.regionKey + "_" + i]) done++; });
    return { done, total: 120 };
  }, [progress]);

  const currentRegion = REGIONS.find((r) => r.id === region) || REGIONS[0];

  const statusOf = useCallback((secId) => { const s = sectionStats[secId]; if (!s || s.total === 0) return "idle"; if (s.complete) return "done"; if (s.done > 0) return "active"; return "idle"; }, [sectionStats]);

  const continueTarget = useMemo(() => {
    for (const reg of REGIONS) for (const sec of reg.sections) { const s = sectionStats[sec.id]; if (s && s.total > 0 && !s.complete) return { regionId: reg.id, sec }; }
    return null;
  }, [sectionStats]);

  const jumpTo = useCallback((regionId, secId) => {
    setTab("journey"); setRegion(regionId); setOpenSections((o) => ({ ...o, [secId]: true }));
    setTimeout(() => { const el = document.getElementById("sec-" + secId); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
  }, []);
  const openRegion = useCallback((regionId) => {
    const reg = REGIONS.find((r) => r.id === regionId);
    const firstIncomplete = reg.sections.find((s) => { const st = sectionStats[s.id]; return st && st.total > 0 && !st.complete; }) || reg.sections[0];
    jumpTo(regionId, firstIncomplete.id);
  }, [sectionStats, jumpTo]);

  const q = query.trim().toLowerCase();
  const filterSections = useMemo(() => {
    if (!q) return currentRegion.sections;
    return currentRegion.sections.map((sec) => {
      const match = sec.name.toLowerCase().includes(q) || (sec.sub || "").toLowerCase().includes(q);
      const steps = match ? sec.steps : sec.steps.filter((s) => s.t.toLowerCase().includes(q));
      return steps.length ? { ...sec, steps } : null;
    }).filter(Boolean);
  }, [q, currentRegion]);

  return (
    <div className="app">
      <StyleBlock />
      <header className="topbar">
        <div className="brand">
          <span className="eye" aria-hidden><Glyph name="eye" size={30} /></span>
          <div><div className="kicker">Sheikah Slate · Adventure Log</div><h1 className="title">Hyrule Companion</h1></div>
        </div>
        <div className="region-chip">{pct}%</div>
      </header>

      <main className="body">
        {!loaded ? (<div className="loading">Syncing the Slate…</div>) : tab === "status" ? (
          <div className="status">
            <div className="hero">
              <div className="hero-ring" style={{ background: `conic-gradient(var(--cyan) ${pct * 3.6}deg, rgba(255,255,255,0.07) 0deg)` }}>
                <div className="hero-ring-in"><span className="hero-pct">{pct}%</span><span className="hero-pct-l">Overall</span></div>
              </div>
              <div className="hero-side">
                <div className="hero-line"><span className="hero-num">{done}</span><span className="hero-num-l">/ {total} steps done</span></div>
                <div className="hero-line"><span className="hero-num">{inventory.invDone}</span><span className="hero-num-l">/ {inventory.invTotal} items found</span></div>
                {continueTarget ? (<button className="hero-cont" onClick={() => jumpTo(continueTarget.regionId, continueTarget.sec.id)}>▸ {continueTarget.sec.name}</button>) : (<div className="hero-done">All chapters complete — onward!</div>)}
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">Regions</div>
              {REGIONS.map((reg) => {
                const rs = regionStats[reg.id]; const rp = rs.total ? Math.round((rs.done / rs.total) * 100) : 0;
                return (
                  <button className="reg-row" key={reg.id} onClick={() => openRegion(reg.id)}>
                    <span className="reg-ic">{reg.kind === "beast" ? <Glyph name="beast" size={18} /> : <Glyph name="tower" size={16} />}</span>
                    <span className="reg-name">{reg.name}</span>
                    <span className="reg-bar"><span className="reg-fill" style={{ width: rp + "%", background: rs.complete ? "var(--cyan)" : "var(--orange)" }} /></span>
                    <span className={"reg-count" + (rs.complete ? " reg-done" : "")}>{rs.done}/{rs.total}</span>
                  </button>
                );
              })}
            </div>

            <div className="panel">
              <div className="panel-h">Spirit Orbs</div>
              <div className="orb-row">
                <div className="orb-big"><Glyph name="orb" size={28} /></div>
                <div className="orb-meta">
                  <div className="orb-count">{inventory.orbsDone}<span className="dim"> orbs</span></div>
                  <div className="orb-sub">{upgrades >= 1 ? `${upgrades} upgrade${upgrades > 1 ? "s" : ""} earned (4 orbs each) — pray at a Goddess Statue` : `${4 - (inventory.orbsDone % 4)} more for your next upgrade`}</div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">Shrines</div>
              <button className="reg-row" onClick={() => setTab("shrines")}>
                <span className="reg-ic"><Glyph name="shrine" size={18} /></span>
                <span className="reg-name">All 120 shrines</span>
                <span className="reg-bar"><span className="reg-fill" style={{ width: (shrineStats.done / 120 * 100) + "%", background: shrineStats.done === 120 ? "var(--cyan)" : "var(--orange)" }} /></span>
                <span className={"reg-count" + (shrineStats.done === 120 ? " reg-done" : "")}>{shrineStats.done}/120</span>
              </button>
            </div>

            <div className="panel">
              <div className="panel-h">Runes Unlocked</div>
              <div className="rune-row">
                {STATUS_RUNES.map((r) => (<div key={r.name} className={"rune-pip" + (progress[r.step] ? " rune-on" : "")}><Glyph name={r.glyph} size={24} /><span>{r.name}</span></div>))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">Champion Abilities</div>
              <div className="champ-row">
                {CHAMPIONS.map((ch) => { const on = ch.step && progress[ch.step]; return (
                  <div key={ch.name} className={"champ-pip" + (on ? " champ-on" : "")}>
                    <Glyph name="champion" size={20} />
                    <div className="champ-txt"><span className="champ-name">{ch.name}</span><span className="champ-note">{on ? ch.note : ch.from}</span></div>
                  </div>); })}
              </div>
            </div>

            <button className="big-link" onClick={() => setTab("items")}><Glyph name="bag" size={18} /> Open your pouch ({inventory.invDone}/{inventory.invTotal})</button>
            <div className="footer-space" />
          </div>
        ) : tab === "journey" ? (
          <>
            <div className="search">
              <input className="search-input" placeholder="Stuck? Search this region…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <button className="search-clear" onClick={() => setQuery("")}>✕</button>}
            </div>

            <div className="regsel">
              {REGIONS.map((reg) => { const rs = regionStats[reg.id]; return (
                <button key={reg.id} className={"regchip" + (region === reg.id ? " regchip-on" : "") + (rs.complete ? " regchip-done" : "")} onClick={() => { setRegion(reg.id); setQuery(""); }}>
                  {reg.name}<span className="regchip-c">{rs.done}/{rs.total}</span>
                </button>); })}
            </div>

            {currentRegion.kind === "beast" && (<div className="beast-banner"><Glyph name="beast" size={18} /> Divine Beast · frees <b>{currentRegion.champion}</b></div>)}
            {region === "plateau" && !q && <PlateauMap statusOf={statusOf} onJump={(secId) => jumpTo("plateau", secId)} />}
            {!q && <p className="lede">{currentRegion.tagline}</p>}
            {filterSections.length === 0 && <div className="empty">No steps match “{query}” in this region.</div>}

            {filterSections.map((sec) => {
              const stat = sectionStats[sec.id]; const open = q ? true : !!openSections[sec.id];
              return (
                <section id={"sec-" + sec.id} key={sec.id} className={"card" + (stat?.complete ? " card-done" : "")}>
                  <button className="card-head" onClick={() => !q && toggleSection(sec.id)}>
                    <div className="card-head-main"><div className="card-name">{sec.name}</div>{sec.sub && <div className="card-sub">{sec.sub}</div>}</div>
                    <div className="card-head-side">{stat && stat.total > 0 && <span className={"pips" + (stat.complete ? " pips-done" : "")}>{stat.done}/{stat.total}</span>}{!q && <span className={"chev" + (open ? " chev-open" : "")}>›</span>}</div>
                  </button>
                  {sec.reward && <div className="reward-banner"><Glyph name="eye" size={14} /> Grants: {sec.reward}</div>}
                  {open && (
                    <ul className="steps">
                      {sec.steps.map((step) => {
                        const checkable = CHECKABLE.has(step.k); const meta = KIND_META[step.k] || KIND_META.step; const checked = !!progress[step.id];
                        return (
                          <li key={step.id} className={"step k-" + step.k + (checked ? " checked" : "")}>
                            {checkable ? (<button className={"box" + (checked ? " box-on" : "")} onClick={() => toggleStep(step.id)} aria-label={checked ? "Mark not done" : "Mark done"}>{checked && <Glyph name="check" size={15} />}</button>) : (<span className="dot" style={{ background: meta.color }} aria-hidden />)}
                            <div className="step-body">
                              <span className="tag" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
                              <span className="step-text">{step.t}</span>
                              {step.items && (<span className="step-items">{step.items.map((it, i) => <span key={i} className="chip">＋ {it.name}</span>)}</span>)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}

            {!q && region === "destroy_ganon" && (
              <div className="roadmap">
                <div className="road-head"><span className="kicker">After the main quest</span><h2 className="road-title">100% Hyrule</h2><p className="road-note">You've finished the story. Here's everything else Hyrule holds, if you want to keep going.</p></div>
                {ROADMAP.map((r, i) => (
                  <div className="road-card" key={r.id}>
                    <div className="road-num">{String(i + 1).padStart(2, "0")}</div>
                    <div className="road-main"><div className="road-name">{r.name}</div><div className="road-sub">{r.sub}</div><p className="road-text">{r.note}</p><div className="road-reward">◈ {r.reward}</div></div>
                  </div>
                ))}
              </div>
            )}
            <div className="footer-space" />
          </>
        ) : tab === "shrines" ? (
          <ShrinesView groups={SHRINES} progress={progress} toggleStep={toggleStep} openSections={openSections} toggleSection={toggleSection} query={query} setQuery={setQuery} stats={shrineStats} />
        ) : tab === "items" ? (
          <div className="ref">
            <h2 className="ref-title">Pouch</h2>
            <p className="ref-lede">Everything you collect across every region lands here automatically. Tap an item to jump to where you find it. Found {inventory.invDone} of {inventory.invTotal}.</p>
            {CATS.map((cat) => {
              const list = inventory.byCat[cat.id]; if (!list || !list.length) return null;
              const got = list.filter((it) => progress[it.stepId]).length;
              return (
                <div className="inv-cat" key={cat.id}>
                  <div className="inv-head"><span className="inv-head-l"><span className="inv-glyph"><Glyph name={cat.glyph} size={18} /></span>{cat.name}</span><span className={"inv-count" + (got === list.length ? " inv-count-done" : "")}>{got}/{list.length}</span></div>
                  <div className="inv-grid">
                    {list.map((it, i) => { const has = !!progress[it.stepId]; return (
                      <button key={it.stepId + i} className={"item" + (has ? " item-on" : "")} onClick={() => jumpTo((REGIONS.find((r) => r.name === it.where) || {}).id || region, it.secId)}>
                        <div className="item-ic"><Glyph name={it.rune || cat.glyph} size={22} /></div>
                        <div className="item-body"><div className="item-name">{it.name}</div><div className="item-note">{it.note}</div><div className="item-where">{has ? "✓ collected" : "from " + it.where}</div></div>
                      </button>); })}
                  </div>
                </div>
              );
            })}
            <p className="panel-note" style={{ marginTop: 14 }}>Duplicates are real, not bugs — e.g. the Traveler's Bow shows up in three chests on the Plateau. Bows break, so spares are a good thing.</p>
            <div className="footer-space" />
          </div>
        ) : tab === "cook" ? (
          <div className="ref">
            <h2 className="ref-title">Cooking</h2>
            <p className="ref-lede">The thing the game never explains. Drop ingredients in a pot; the buff comes from the ingredient's prefix. Match one effect to what you need.</p>
            <div className="rules">{COOK_RULES.map((r, i) => <div className="rule" key={i}><span className="rule-dot" />{r}</div>)}</div>
            {RECIPES.map((r) => (
              <div className={"recipe" + (r.now ? " recipe-now" : "")} key={r.eff}>
                <div className={"eff eff-" + r.tone}>{r.eff}</div>
                <div className="recipe-body">{r.now && <div className="recipe-flag">You need this on the Plateau</div>}<div className="recipe-does">{r.does}</div><div className="recipe-key"><b>Use:</b> {r.key}</div><div className="recipe-make"><b>Try:</b> {r.recipe}</div></div>
              </div>
            ))}
            {COOKING.recipes && COOKING.recipes.length > 0 && (
              <div className="cook-extra">
                <div className="inv-head"><span className="inv-head-l"><span className="inv-glyph"><Glyph name="pot" size={18} /></span>Go-to recipes</span></div>
                {COOKING.recipes.map((r, i) => (
                  <div className="gorecipe" key={i}><div className="gorecipe-name">{r.name}</div><div className="gorecipe-make"><b>Make:</b> {r.makes}</div><div className="gorecipe-why">{r.why}</div></div>
                ))}
              </div>
            )}
            {COOKING.dragons && COOKING.dragons.length > 0 && (
              <div className="cook-extra">
                <div className="inv-head"><span className="inv-head-l"><span className="inv-glyph" style={{ color: "var(--heart)" }}><Glyph name="champion" size={18} /></span>Dragon parts</span></div>
                <p className="panel-note" style={{ margin: "0 0 10px" }}>Shoot a passing dragon (never kill it) to knock loose a part — each makes a potent elixir and a critical-cook bonus. Horns are strongest, then claws, fangs, scales.</p>
                {COOKING.dragons.map((d, i) => (
                  <div className="dragon-row" key={i}><div className="dragon-name">{d.name}<span className="dragon-el">{d.element}</span></div><p className="ref-line">{d.where}{d.parts ? " · " + d.parts : ""}</p></div>
                ))}
              </div>
            )}
            {COOKING.notes && <p className="panel-note" style={{ marginTop: 12 }}>{COOKING.notes}</p>}
            <div className="footer-space" />
          </div>
        ) : (
          <div className="ref">
            <div className="seg seg-scroll">
              {[["runes", "Runes"], ["tips", "Tips"], ["armor", "Armor"], ["fairies", "Fairies"], ["towers", "Towers"], ["quests", "Quests"], ["enemies", "Enemies"], ["koroks", "Koroks"], ["world", "World"]].map(([id, label]) => (
                <button key={id} className={"seg-btn" + (guideSub === id ? " seg-on" : "")} onClick={() => setGuideSub(id)}>{label}</button>
              ))}
            </div>
            {guideSub === "runes" ? (
              <>
                <p className="ref-lede">The five Sheikah Slate powers. Every shrine and overworld puzzle is solved with these.</p>
                {RUNES.map((rn) => (
                  <div className="rune-card" key={rn.id}>
                    <div className="rune-icon"><Glyph name={rn.glyph} size={30} /></div>
                    <div className="rune-cbody"><div className="rune-top"><span className="rune-name">{rn.name}</span><span className="rune-from">{rn.from}</span></div><p className="rune-what">{rn.what}</p><p className="rune-tip">▸ {rn.tip}</p></div>
                  </div>
                ))}
              </>
            ) : guideSub === "armor" ? <ArmorView data={ARMOR} />
            : guideSub === "fairies" ? <FairiesView data={GREAT_FAIRIES} />
            : guideSub === "towers" ? <TowersView data={TOWERS} />
            : guideSub === "quests" ? <QuestsView data={SIDE_QUESTS} />
            : guideSub === "enemies" ? <EnemiesView data={BESTIARY} />
            : guideSub === "koroks" ? <KoroksView data={KOROKS} />
            : guideSub === "world" ? <WorldView data={WORLD} />
            : (
              <>
                <p className="ref-lede">The handful of things that stop the early game from feeling brutal.</p>
                {TIPS.map((g) => (<div className="tip-card" key={g.id}><div className="tip-name">{g.name}</div><ul className="tip-list">{g.items.map((it, idx) => <li key={idx}>{it}</li>)}</ul></div>))}
                <div className="reset-zone">
                  {!confirmReset ? (<button className="reset-btn" onClick={() => setConfirmReset(true)}>Reset all progress</button>) : (
                    <div className="reset-confirm"><span>Clear every checkmark and empty the pouch? This can't be undone.</span><div className="reset-actions"><button className="reset-yes" onClick={() => { setProgress({}); setConfirmReset(false); }}>Yes, reset</button><button className="reset-no" onClick={() => setConfirmReset(false)}>Keep it</button></div></div>
                  )}
                </div>
              </>
            )}
            <div className="footer-space" />
          </div>
        )}
      </main>

      <nav className="tabbar">
        <TabBtn active={tab === "status"} onClick={() => setTab("status")} glyph="eye" label="Status" />
        <TabBtn active={tab === "journey"} onClick={() => setTab("journey")} glyph="tower" label="Journey" />
        <TabBtn active={tab === "shrines"} onClick={() => setTab("shrines")} glyph="shrine" label="Shrines" />
        <TabBtn active={tab === "items"} onClick={() => setTab("items")} glyph="bag" label="Items" />
        <TabBtn active={tab === "cook"} onClick={() => setTab("cook")} glyph="pot" label="Cook" />
        <TabBtn active={tab === "guide"} onClick={() => setTab("guide")} glyph="book" label="Guide" />
      </nav>
    </div>
  );
}

function TabBtn({ active, onClick, glyph, label }) {
  return (<button className={"tab" + (active ? " tab-on" : "")} onClick={onClick}><Glyph name={glyph} size={21} /><span>{label}</span></button>);
}

/* ============================================================ SHRINES TAB ============================================================ */
function ShrinesView({ groups, progress, toggleStep, openSections, toggleSection, query, setQuery, stats }) {
  const q = query.trim().toLowerCase();
  const pct = Math.round((stats.done / 120) * 100);
  const upgrades = Math.floor(stats.done / 4);
  const view = q
    ? groups.map((g) => {
        const shrines = g.shrines.filter((sh, i) => (g.regionName + " " + sh.name + " " + sh.location + " " + sh.oneLine).toLowerCase().includes(q) ? (sh._i = i, true) : false);
        return shrines.length ? { ...g, shrines: shrines.map((sh) => ({ sh, i: sh._i })) } : null;
      }).filter(Boolean)
    : groups.map((g) => ({ ...g, shrines: g.shrines.map((sh, i) => ({ sh, i })) }));
  return (
    <div className="ref">
      <h2 className="ref-title">Shrines</h2>
      <p className="ref-lede">All 120 shrines, grouped by region. Tick each as you clear it — every shrine is a Spirit Orb, and four orbs trade for a heart or stamina vessel at a Goddess Statue.</p>
      <div className="panel shrine-meter">
        <div className="shrine-meter-top">
          <div className="shrine-meter-num"><span className="hero-num">{stats.done}</span><span className="hero-num-l">/ 120 shrines</span></div>
          <div className="shrine-orbs"><span className="orbico"><Glyph name="orb" size={16} /></span>{stats.done} orbs · {upgrades} upgrade{upgrades === 1 ? "" : "s"}</div>
        </div>
        <div className="reg-bar shrine-bar"><span className="reg-fill" style={{ width: pct + "%", background: pct === 100 ? "var(--cyan)" : "var(--orange)" }} /></div>
      </div>
      <div className="search">
        <input className="search-input" placeholder="Search shrines, regions, hints…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button className="search-clear" onClick={() => setQuery("")}>✕</button>}
      </div>
      {view.length === 0 && <div className="empty">No shrines match “{query}”.</div>}
      {view.map((g) => {
        const okey = "shrg_" + g.regionKey;
        const open = q ? true : !!openSections[okey];
        const total = groups.find((x) => x.regionKey === g.regionKey).shrines.length;
        const done = groups.find((x) => x.regionKey === g.regionKey).shrines.filter((_, i) => progress["shr_" + g.regionKey + "_" + i]).length;
        return (
          <section key={g.regionKey} className={"card" + (done === total ? " card-done" : "")}>
            <button className="card-head" onClick={() => !q && toggleSection(okey)}>
              <div className="card-head-main"><div className="card-name">{g.regionName}</div><div className="card-sub">{total} shrines</div></div>
              <div className="card-head-side"><span className={"pips" + (done === total ? " pips-done" : "")}>{done}/{total}</span>{!q && <span className={"chev" + (open ? " chev-open" : "")}>›</span>}</div>
            </button>
            {open && (
              <ul className="steps">
                {g.shrines.map(({ sh, i }) => {
                  const id = "shr_" + g.regionKey + "_" + i; const checked = !!progress[id];
                  const meta = SHRINE_CAT[sh.category] || SHRINE_CAT.puzzle;
                  return (
                    <li key={id} className={"step shrine-row" + (checked ? " checked" : "")}>
                      <button className={"box" + (checked ? " box-on" : "")} onClick={() => toggleStep(id)} aria-label={checked ? "Mark not done" : "Mark done"}>{checked && <Glyph name="check" size={15} />}</button>
                      <div className="step-body">
                        <span className="tag" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
                        <span className="step-text"><b className="shrine-name">{sh.name}</b> — {sh.oneLine}</span>
                        <span className="shrine-loc"><Glyph name="tower" size={11} /> {sh.location}{sh.shrineQuest ? <span className="shrine-q"> · Quest: {sh.shrineQuest}</span> : null}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <div className="footer-space" />
    </div>
  );
}

/* ============================================================ GUIDE REFERENCE VIEWS ============================================================ */
function ArmorView({ data }) {
  const tone = (p) => (/begin/i.test(p || "") ? "var(--cyan)" : /mid/i.test(p || "") ? "var(--gold)" : /late/i.test(p || "") ? "var(--malice)" : "var(--cyan-dim)");
  return (
    <>
      <p className="ref-lede">{data.notes || "Armor sets give passive effects, and a full set of 3 (upgraded twice) grants a powerful set bonus. Upgrade pieces at Great Fairy Fountains with monster parts."}</p>
      {data.sets.map((a, i) => (
        <div className="rune-card" key={i}>
          <div className="rune-icon"><Glyph name="armor" size={28} /></div>
          <div className="rune-cbody">
            <div className="rune-top"><span className="rune-name">{a.name}</span>{a.priority && <span className="prio-pill" style={{ color: tone(a.priority), borderColor: tone(a.priority) }}>{a.priority}</span>}</div>
            <p className="rune-what"><b>Effect:</b> {a.bonus}</p>
            <p className="ref-line"><b>Where:</b> {a.where}</p>
            <p className="ref-line"><b>Pieces:</b> {a.pieces} · <b>Upgrade:</b> {a.upgrade}</p>
          </div>
        </div>
      ))}
    </>
  );
}
function FairiesView({ data }) {
  return (
    <>
      <p className="ref-lede">Unlock each Great Fairy Fountain by paying its fee once; afterward she upgrades your armor for monster parts and rupees. Each one you unlock raises the upgrade tier for ALL armor.</p>
      {data.map((f, i) => (
        <div className="rune-card" key={i}>
          <div className="rune-icon" style={{ color: "var(--heart)" }}><Glyph name="fairy" size={28} /></div>
          <div className="rune-cbody">
            <div className="rune-top"><span className="rune-name">{f.name}</span><span className="rune-from">{f.region}</span></div>
            <p className="rune-what">{f.location}</p>
            <p className="rune-tip">◈ Unlock fee: {f.cost}</p>
          </div>
        </div>
      ))}
    </>
  );
}
function TowersView({ data }) {
  return (
    <>
      <p className="ref-lede">15 Sheikah Towers fill in the map and give a high glide-off point. Activating one reveals its region. No combat — just stamina and route-finding.</p>
      {data.map((t, i) => (
        <div className="tip-card" key={i}>
          <div className="tip-name"><Glyph name="tower" size={16} /> {t.name}<span className="tower-reg">{t.region}</span></div>
          <p className="ref-line"><b>Where:</b> {t.location}</p>
          <p className="ref-line ref-tip">▸ {t.climbTip}</p>
        </div>
      ))}
    </>
  );
}
function QuestsView({ data }) {
  return (
    <>
      <p className="ref-lede">A taste of Hyrule's side quests, by region — many reward gear, rupees, or unlock shrines. Hundreds more are out there; these are the standouts.</p>
      {data.map((g, i) => (
        <div className="quest-group" key={i}>
          <div className="quest-region">{g.region}</div>
          {g.quests.map((qq, j) => (
            <div className="quest-card" key={j}>
              <div className="quest-top"><span className="quest-name">{qq.name}</span>{qq.reward && <span className="quest-reward">◈ {qq.reward}</span>}</div>
              <p className="quest-line">{qq.oneLine}</p>
              {qq.giver && <p className="quest-giver">— {qq.giver}</p>}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
function EnemiesView({ data }) {
  return (
    <>
      <p className="ref-lede">{data.notes || "How to beat what Hyrule throws at you. Perfect-dodge into a flurry rush is the answer to most of it."}</p>
      {ENEMY_TIER.map((tier) => {
        const list = data.enemies.filter((e) => e.tier === tier.id);
        if (!list.length) return null;
        return (
          <div className="bestiary-tier" key={tier.id}>
            <div className="inv-head"><span className="inv-head-l"><span className="inv-glyph" style={{ color: tier.color }}><Glyph name={tier.glyph} size={18} /></span>{tier.label}</span><span className="inv-count">{list.length}</span></div>
            {list.map((e, i) => (
              <div className="enemy-row" key={i}>
                <div className="enemy-name">{e.name}</div>
                <p className="enemy-tactic">{e.tactic}</p>
                {e.drops && <p className="enemy-drops">Drops: {e.drops}</p>}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
function KoroksView({ data }) {
  return (
    <>
      <p className="ref-lede">{data.what}</p>
      <div className="tip-card"><div className="tip-name"><Glyph name="leaf" size={16} /> Hestu & inventory</div><p className="ref-line">{data.hestu}</p></div>
      <div className="inv-head" style={{ marginTop: 6 }}><span className="inv-head-l">Common puzzle types</span><span className="inv-count">{data.puzzleTypes.length}</span></div>
      {data.puzzleTypes.map((p, i) => (
        <div className="korok-row" key={i}><div className="korok-type">{p.type}</div><p className="korok-how">{p.how}</p></div>
      ))}
      <div className="tip-card" style={{ marginTop: 12 }}>
        <div className="tip-name"><Glyph name="leaf" size={16} /> Reliable early hotspots</div>
        <ul className="tip-list">{data.hotspots.map((h, i) => <li key={i}>{h}</li>)}</ul>
      </div>
      {data.notes && <p className="panel-note">{data.notes}</p>}
    </>
  );
}
function WorldView({ data }) {
  return (
    <>
      <p className="ref-lede">The systems that tie Hyrule together — how you grow stronger, the rare materials worth chasing, and what the expansion adds.</p>
      <div className="tip-card"><div className="tip-name"><Glyph name="orb" size={16} /> Getting stronger</div><ul className="tip-list">{data.upgrades.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
      <div className="inv-head" style={{ marginTop: 6 }}><span className="inv-head-l"><span className="inv-glyph"><Glyph name="gem" size={18} /></span>Special materials</span><span className="inv-count">{data.materials.length}</span></div>
      {data.materials.map((m, i) => (
        <div className="enemy-row" key={i}><div className="enemy-name">{m.name}</div><p className="enemy-tactic">{m.use}</p>{m.where && <p className="enemy-drops">{m.where}</p>}</div>
      ))}
      {data.dlc && data.dlc.length > 0 && (
        <div className="tip-card" style={{ marginTop: 12 }}><div className="tip-name"><Glyph name="champion" size={16} /> DLC · Expansion Pass</div><ul className="tip-list">{data.dlc.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
      )}
    </>
  );
}

/* ============================================================ STYLES ============================================================ */
function StyleBlock() {
  return (<style>{`
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
:root{--abyss:#091317;--panel:#0f1c22;--orange:#f0902a;--gold:#f2c14e;--cyan:#5fd6e2;--cyan-dim:#79b8c0;--moss:#9bc08a;--malice:#e0506b;--parch:#e9e2d2;--parch-dim:#a9b0ac;--ink-line:#33484f;--fire:#ff7a4d;--volt:#f2d44e;--heart:#ff6f8b;--atk:#ff9a5a;--def:#7fb4e8;--cool:#7fd6e8;--sneak:#a98ce0;}
*{box-sizing:border-box;}
.app{font-family:'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--parch);background:radial-gradient(120% 80% at 50% -10%,rgba(95,214,226,0.06),transparent 60%),radial-gradient(90% 70% at 80% 110%,rgba(240,144,42,0.05),transparent 60%),var(--abyss);min-height:100vh;max-width:560px;margin:0 auto;position:relative;padding-bottom:80px;overflow-x:hidden;}
.app:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:0.5;background-image:radial-gradient(rgba(95,214,226,0.05) 1px,transparent 1px);background-size:22px 22px;mask-image:radial-gradient(120% 100% at 50% 0%,#000,transparent 75%);}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 11px;background:linear-gradient(180deg,rgba(9,19,23,0.96),rgba(9,19,23,0.82));backdrop-filter:blur(8px);border-bottom:1px solid rgba(95,214,226,0.14);}
.brand{display:flex;align-items:center;gap:11px;}
.eye{color:var(--orange);filter:drop-shadow(0 0 6px rgba(240,144,42,0.45));animation:breathe 5s ease-in-out infinite;}
@keyframes breathe{0%,100%{opacity:.78;}50%{opacity:1;filter:drop-shadow(0 0 10px rgba(240,144,42,0.7));}}
.kicker{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--cyan-dim);}
.title{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:19px;margin:0;letter-spacing:.5px;}
.region-chip{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:var(--cyan);border:1px solid rgba(95,214,226,0.32);border-radius:20px;padding:5px 12px;}
.body{padding:14px 16px 0;position:relative;z-index:1;}
.loading{text-align:center;color:var(--cyan-dim);font-family:'Rajdhani',sans-serif;letter-spacing:2px;padding:60px 0;text-transform:uppercase;font-size:13px;}
.lede{color:var(--parch-dim);font-size:13.5px;line-height:1.6;margin:4px 2px 16px;}
.empty{color:var(--parch-dim);font-size:13.5px;padding:24px 6px;text-align:center;}
.footer-space{height:18px;}
.hero{display:flex;gap:18px;align-items:center;padding:6px 4px 18px;}
.hero-ring{width:104px;height:104px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;box-shadow:0 0 22px rgba(95,214,226,0.18);}
.hero-ring-in{width:84px;height:84px;border-radius:50%;background:var(--abyss);display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);}
.hero-pct{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:26px;color:var(--cyan);line-height:1;}
.hero-pct-l{font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--parch-dim);margin-top:2px;}
.hero-side{flex:1;min-width:0;}
.hero-line{display:flex;align-items:baseline;gap:7px;margin-bottom:8px;}
.hero-num{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:21px;color:var(--parch);}
.hero-num-l{font-size:12.5px;color:var(--parch-dim);}
.hero-cont{width:100%;text-align:left;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:13px;color:var(--orange);background:rgba(240,144,42,0.08);border:1px solid rgba(240,144,42,0.3);border-radius:10px;padding:9px 12px;cursor:pointer;margin-top:2px;}
.hero-done{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:13px;color:var(--cyan);background:rgba(95,214,226,0.08);border:1px solid rgba(95,214,226,0.3);border-radius:10px;padding:9px 12px;}
.panel{border:1px solid rgba(255,255,255,0.07);border-radius:16px;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.5));padding:14px 15px;margin-bottom:13px;}
.panel-h{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--cyan-dim);margin-bottom:11px;}
.panel-note{font-size:12px;color:var(--parch-dim);line-height:1.5;margin:10px 0 0;}
.reg-row{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;cursor:pointer;color:inherit;padding:7px 0;}
.reg-ic{color:var(--cyan-dim);display:flex;flex-shrink:0;}
.reg-name{font-size:13.5px;color:var(--parch);flex-shrink:0;width:128px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.reg-bar{flex:1;height:6px;border-radius:5px;background:rgba(255,255,255,0.06);overflow:hidden;}
.reg-fill{display:block;height:100%;border-radius:5px;transition:width .4s;}
.reg-count{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11.5px;color:var(--orange);flex-shrink:0;width:38px;text-align:right;}
.reg-done{color:var(--cyan);}
.orb-row{display:flex;align-items:center;gap:12px;}
.orb-big{color:var(--cyan);filter:drop-shadow(0 0 7px rgba(95,214,226,0.5));}
.orb-count{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:22px;color:var(--cyan);}
.orb-count .dim{color:var(--parch-dim);font-weight:500;font-size:14px;}
.orb-sub{font-size:11.5px;color:var(--parch-dim);line-height:1.4;}
.rune-row{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;}
.rune-pip{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 2px;border-radius:11px;border:1px solid rgba(255,255,255,0.06);color:var(--ink-line);background:rgba(255,255,255,0.02);}
.rune-pip span{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:9.5px;letter-spacing:.2px;color:var(--parch-dim);}
.rune-on{color:var(--orange);border-color:rgba(240,144,42,0.4);background:rgba(240,144,42,0.07);}
.rune-on span{color:var(--parch);}
.champ-row{display:flex;flex-direction:column;gap:8px;}
.champ-pip{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:11px;border:1px solid rgba(255,255,255,0.06);color:var(--ink-line);background:rgba(255,255,255,0.015);}
.champ-on{color:var(--gold);border-color:rgba(242,193,78,0.35);background:rgba(242,193,78,0.06);}
.champ-txt{display:flex;flex-direction:column;}
.champ-name{font-size:13.5px;color:var(--parch);font-weight:600;}
.champ-on .champ-name{color:var(--gold);}
.champ-note{font-size:11px;color:var(--parch-dim);}
.big-link{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:13px;letter-spacing:.5px;color:var(--cyan);background:rgba(95,214,226,0.06);border:1px solid rgba(95,214,226,0.25);border-radius:12px;padding:13px;cursor:pointer;}
.search{position:relative;margin:0 0 12px;}
.search-input{width:100%;padding:11px 38px 11px 14px;border-radius:12px;background:var(--panel);border:1px solid rgba(95,214,226,0.18);color:var(--parch);font-family:'Inter',sans-serif;font-size:14px;outline:none;}
.search-input::placeholder{color:#6f817f;}
.search-input:focus{border-color:rgba(95,214,226,0.5);box-shadow:0 0 0 3px rgba(95,214,226,0.1);}
.search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--parch-dim);font-size:15px;cursor:pointer;padding:4px 8px;}
.regsel{display:flex;gap:7px;overflow-x:auto;margin:0 -16px 4px;padding:0 16px 12px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.regsel::-webkit-scrollbar{display:none;}
.regchip{flex-shrink:0;display:flex;align-items:center;gap:7px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12.5px;letter-spacing:.3px;color:var(--parch-dim);background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:7px 13px;cursor:pointer;white-space:nowrap;}
.regchip-c{font-size:10.5px;color:var(--ink-line);font-weight:700;}
.regchip-on{color:var(--abyss);background:var(--cyan);border-color:var(--cyan);}
.regchip-on .regchip-c{color:rgba(9,19,23,0.6);}
.regchip-done:not(.regchip-on){color:var(--cyan);border-color:rgba(95,214,226,0.35);}
.regchip-done:not(.regchip-on) .regchip-c{color:var(--cyan-dim);}
.beast-banner{display:flex;align-items:center;gap:8px;margin:0 0 14px;padding:9px 13px;border-radius:11px;background:rgba(95,214,226,0.07);border:1px solid rgba(95,214,226,0.22);color:var(--cyan);font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12.5px;letter-spacing:.4px;}
.beast-banner b{color:var(--parch);}
.map-wrap{margin:0 0 18px;border:1px solid rgba(95,214,226,0.16);border-radius:16px;background:linear-gradient(180deg,rgba(19,37,44,0.6),rgba(15,28,34,0.3));padding:8px 8px 4px;}
.map-svg{width:100%;height:auto;display:block;}
.map-label{fill:var(--parch-dim);font-family:'Rajdhani',sans-serif;font-size:9px;font-weight:600;letter-spacing:.5px;}
.map-cap{text-align:center;font-size:11px;color:var(--parch-dim);margin:2px 0 6px;font-family:'Rajdhani',sans-serif;letter-spacing:.5px;}
.ping{animation:ping 2.2s ease-out infinite;}
@keyframes ping{0%{opacity:.6;}100%{opacity:0;}}
.card{border:1px solid rgba(255,255,255,0.07);border-radius:16px;margin-bottom:12px;overflow:hidden;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.55));transition:border-color .3s;}
.card-done{border-color:rgba(95,214,226,0.34);box-shadow:0 0 0 1px rgba(95,214,226,0.08),0 0 24px rgba(95,214,226,0.06);}
.card-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:none;border:none;cursor:pointer;padding:15px 16px;text-align:left;color:inherit;}
.card-name{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:16.5px;line-height:1.25;}
.card-done .card-name{color:var(--cyan);}
.card-sub{font-family:'Rajdhani',sans-serif;font-weight:500;font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--parch-dim);margin-top:3px;}
.card-head-side{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.pips{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;color:var(--orange);border:1px solid rgba(240,144,42,0.35);border-radius:20px;padding:2px 9px;}
.pips-done{color:var(--cyan);border-color:rgba(95,214,226,0.4);background:rgba(95,214,226,0.08);}
.chev{font-size:22px;color:var(--parch-dim);transition:transform .25s;line-height:1;}
.chev-open{transform:rotate(90deg);color:var(--cyan);}
.reward-banner{display:flex;align-items:center;gap:7px;margin:0 16px 6px;padding:7px 11px;border-radius:9px;background:rgba(95,214,226,0.07);border:1px solid rgba(95,214,226,0.2);color:var(--cyan);font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;letter-spacing:.5px;}
.steps{list-style:none;margin:2px 0 8px;padding:0 14px 6px;}
.step{display:flex;gap:12px;padding:10px 4px;border-top:1px solid rgba(255,255,255,0.045);align-items:flex-start;}
.step:first-child{border-top:none;}
.box{flex-shrink:0;width:24px;height:24px;border-radius:7px;margin-top:1px;border:2px solid rgba(240,144,42,0.55);background:rgba(240,144,42,0.06);color:var(--abyss);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;}
.box:active{transform:scale(.9);}
.box-on{background:var(--cyan);border-color:var(--cyan);box-shadow:0 0 12px rgba(95,214,226,0.55);}
.dot{flex-shrink:0;width:9px;height:9px;border-radius:50%;margin-top:7px;}
.step-body{min-width:0;}
.tag{display:inline-block;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;border:1px solid;border-radius:5px;padding:1px 6px;margin-right:7px;vertical-align:1.5px;opacity:.85;}
.step-text{font-size:14px;line-height:1.55;color:var(--parch);}
.k-warn .step-text{color:#f1b3bf;}
.k-tip .step-text{color:#bcd6da;}
.checked .step-text{color:var(--parch-dim);text-decoration:line-through;text-decoration-color:rgba(95,214,226,0.5);}
.step-items{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;}
.chip{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:11px;letter-spacing:.3px;color:var(--gold);border:1px solid rgba(242,193,78,0.32);background:rgba(242,193,78,0.06);border-radius:6px;padding:2px 7px;}
.roadmap{margin-top:26px;}
.road-title{font-family:'Cinzel',Georgia,serif;font-weight:700;font-size:22px;margin:2px 0 6px;}
.road-note{color:var(--parch-dim);font-size:13px;line-height:1.6;margin:0;}
.road-card{display:flex;gap:14px;padding:14px 4px;border-top:1px solid rgba(255,255,255,0.07);}
.road-num{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:15px;color:var(--orange);opacity:.7;width:22px;flex-shrink:0;padding-top:2px;}
.road-name{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:15.5px;}
.road-sub{font-family:'Rajdhani',sans-serif;font-weight:500;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--cyan-dim);margin:2px 0 6px;}
.road-text{font-size:13.5px;line-height:1.55;color:var(--parch-dim);margin:0 0 7px;}
.road-reward{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12.5px;color:var(--gold);letter-spacing:.3px;}
.ref{padding-top:2px;}
.ref-title{font-family:'Cinzel',Georgia,serif;font-weight:700;font-size:22px;margin:4px 0 6px;}
.ref-lede{color:var(--parch-dim);font-size:13.5px;line-height:1.6;margin:0 0 18px;}
.inv-cat{margin-bottom:18px;}
.inv-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}
.inv-head-l{display:flex;align-items:center;gap:9px;font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:15px;color:var(--parch);}
.inv-glyph{color:var(--orange);display:flex;}
.inv-count{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;color:var(--orange);border:1px solid rgba(240,144,42,0.3);border-radius:20px;padding:2px 9px;}
.inv-count-done{color:var(--cyan);border-color:rgba(95,214,226,0.4);background:rgba(95,214,226,0.08);}
.inv-grid{display:flex;flex-direction:column;gap:8px;}
.item{display:flex;align-items:flex-start;gap:11px;text-align:left;width:100%;padding:11px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.015);cursor:pointer;opacity:.62;transition:all .25s;}
.item-on{opacity:1;border-color:rgba(95,214,226,0.3);background:rgba(95,214,226,0.05);box-shadow:0 0 16px rgba(95,214,226,0.06);}
.item-ic{flex-shrink:0;width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--ink-line);background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);}
.item-on .item-ic{color:var(--cyan);border-color:rgba(95,214,226,0.3);filter:drop-shadow(0 0 6px rgba(95,214,226,0.3));}
.item-name{font-weight:600;font-size:14px;color:var(--parch);}
.item-note{font-size:12px;color:var(--parch-dim);margin-top:1px;line-height:1.4;}
.item-where{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;margin-top:4px;color:var(--parch-dim);}
.item-on .item-where{color:var(--cyan);}
.rules{margin-bottom:18px;display:flex;flex-direction:column;gap:9px;}
.rule{display:flex;gap:9px;font-size:13px;line-height:1.5;color:var(--parch);}
.rule-dot{flex-shrink:0;width:7px;height:7px;border-radius:50%;background:var(--orange);margin-top:6px;box-shadow:0 0 6px rgba(240,144,42,0.5);}
.recipe{display:flex;gap:12px;padding:13px;border:1px solid rgba(255,255,255,0.07);border-radius:14px;margin-bottom:10px;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.5));}
.recipe-now{border-color:rgba(240,144,42,0.4);box-shadow:0 0 18px rgba(240,144,42,0.07);}
.eff{flex-shrink:0;width:62px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12.5px;letter-spacing:.5px;text-align:center;padding:8px 4px;border-radius:9px;height:fit-content;border:1px solid;}
.eff-warm{color:var(--orange);border-color:rgba(240,144,42,0.4);background:rgba(240,144,42,0.08);}
.eff-cool{color:var(--cool);border-color:rgba(127,214,232,0.4);background:rgba(127,214,232,0.08);}
.eff-fire{color:var(--fire);border-color:rgba(255,122,77,0.4);background:rgba(255,122,77,0.08);}
.eff-volt{color:var(--volt);border-color:rgba(242,212,78,0.4);background:rgba(242,212,78,0.08);}
.eff-heart{color:var(--heart);border-color:rgba(255,111,139,0.4);background:rgba(255,111,139,0.08);}
.eff-stam{color:#7dd68a;border-color:rgba(125,214,138,0.4);background:rgba(125,214,138,0.08);}
.eff-atk{color:var(--atk);border-color:rgba(255,154,90,0.4);background:rgba(255,154,90,0.08);}
.eff-def{color:var(--def);border-color:rgba(127,180,232,0.4);background:rgba(127,180,232,0.08);}
.eff-speed{color:#9be08a;border-color:rgba(155,224,138,0.4);background:rgba(155,224,138,0.08);}
.eff-sneak{color:var(--sneak);border-color:rgba(169,140,224,0.4);background:rgba(169,140,224,0.08);}
.recipe-body{min-width:0;}
.recipe-flag{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--orange);margin-bottom:4px;}
.recipe-does{font-size:13.5px;color:var(--parch);line-height:1.45;margin-bottom:6px;}
.recipe-key,.recipe-make{font-size:12.5px;color:var(--parch-dim);line-height:1.5;}
.recipe-key b,.recipe-make b{color:var(--cyan-dim);font-weight:600;}
.recipe-make{margin-top:3px;}
.seg{display:flex;gap:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:11px;padding:4px;margin-bottom:16px;}
.seg-btn{flex:1;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--parch-dim);background:none;border:none;border-radius:8px;padding:9px;cursor:pointer;}
.seg-on{color:var(--abyss);background:var(--cyan);}
.rune-card{display:flex;gap:14px;padding:15px;border:1px solid rgba(255,255,255,0.07);border-radius:14px;margin-bottom:12px;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.5));}
.rune-icon{flex-shrink:0;width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--orange);background:rgba(240,144,42,0.08);border:1px solid rgba(240,144,42,0.25);filter:drop-shadow(0 0 6px rgba(240,144,42,0.25));}
.rune-cbody{min-width:0;}
.rune-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.rune-name{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:17px;}
.rune-from{font-family:'Rajdhani',sans-serif;font-weight:500;font-size:10.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--cyan-dim);}
.rune-what{font-size:13.5px;line-height:1.55;color:var(--parch);margin:6px 0 6px;}
.rune-tip{font-size:13px;line-height:1.5;color:var(--gold);margin:0;}
.tip-card{padding:15px;border:1px solid rgba(255,255,255,0.07);border-radius:14px;margin-bottom:12px;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.5));}
.tip-name{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:16px;color:var(--cyan);margin-bottom:8px;}
.tip-list{margin:0;padding-left:18px;}
.tip-list li{font-size:13.5px;line-height:1.6;color:var(--parch);margin-bottom:8px;}
.tip-list li::marker{color:var(--orange);}
.reset-zone{margin:22px 0 8px;text-align:center;}
.reset-btn{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--parch-dim);background:none;border:1px solid rgba(255,255,255,0.12);border-radius:9px;padding:9px 16px;cursor:pointer;}
.reset-confirm{background:rgba(224,80,107,0.07);border:1px solid rgba(224,80,107,0.3);border-radius:12px;padding:13px;}
.reset-confirm span{display:block;font-size:13px;color:#f1b3bf;margin-bottom:10px;}
.reset-actions{display:flex;gap:8px;justify-content:center;}
.reset-yes{background:var(--malice);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-weight:600;font-size:13px;cursor:pointer;}
.reset-no{background:none;color:var(--parch-dim);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;}
.tabbar{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:560px;z-index:30;display:flex;justify-content:space-around;align-items:center;background:linear-gradient(180deg,rgba(9,19,23,0.82),rgba(9,19,23,0.98));backdrop-filter:blur(10px);border-top:1px solid rgba(95,214,226,0.16);padding:8px 4px calc(8px + env(safe-area-inset-bottom,0));}
.tab{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;cursor:pointer;color:var(--parch-dim);font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10.5px;letter-spacing:.6px;padding:6px 8px;border-radius:12px;transition:color .2s;}
.tab-on{color:var(--cyan);}
.tab-on svg{filter:drop-shadow(0 0 7px rgba(95,214,226,0.6));}
/* --- v5: shrines, reference views, deeper cook --- */
.tab{flex:1;min-width:0;padding:6px 2px;}
.tab span{font-size:9.5px;}
.seg-scroll{overflow-x:auto;justify-content:flex-start;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.seg-scroll::-webkit-scrollbar{display:none;}
.seg-scroll .seg-btn{flex:0 0 auto;padding:9px 15px;}
.shrine-meter{padding:13px 15px;}
.shrine-meter-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}
.shrine-meter-num{display:flex;align-items:baseline;gap:7px;}
.shrine-orbs{display:flex;align-items:center;gap:6px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;color:var(--cyan);white-space:nowrap;}
.shrine-orbs .orbico{display:flex;color:var(--cyan);}
.shrine-bar{height:8px;}
.shrine-row .step-text{font-size:13.5px;}
.shrine-name{color:var(--parch);font-weight:600;}
.checked .shrine-name{color:var(--parch-dim);}
.shrine-loc{margin-top:5px;font-size:11.5px;color:var(--parch-dim);line-height:1.45;display:flex;align-items:flex-start;gap:5px;}
.shrine-loc svg{flex-shrink:0;margin-top:2px;opacity:.65;}
.shrine-q{color:var(--moss);}
.prio-pill{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:9.5px;letter-spacing:1px;text-transform:uppercase;border:1px solid;border-radius:20px;padding:2px 8px;}
.ref-line{font-size:12.5px;line-height:1.5;color:var(--parch-dim);margin:4px 0 0;}
.ref-line b{color:var(--cyan-dim);font-weight:600;}
.ref-tip{color:var(--gold);}
.tip-name{display:flex;align-items:center;gap:7px;}
.tower-reg{font-family:'Rajdhani',sans-serif;font-weight:500;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--cyan-dim);margin-left:auto;}
.quest-group{margin-bottom:18px;}
.quest-region{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:15px;color:var(--cyan);margin:0 0 9px;}
.quest-card{padding:11px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:11px;margin-bottom:8px;background:rgba(255,255,255,0.015);}
.quest-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.quest-name{font-weight:600;font-size:13.5px;color:var(--parch);}
.quest-reward{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:11px;color:var(--gold);flex-shrink:0;white-space:nowrap;}
.quest-line{font-size:12.5px;line-height:1.5;color:var(--parch-dim);margin:5px 0 0;}
.quest-giver{font-size:11px;color:var(--cyan-dim);margin:4px 0 0;font-style:italic;}
.bestiary-tier{margin-bottom:16px;}
.enemy-row{padding:9px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:11px;margin-bottom:7px;background:rgba(255,255,255,0.015);}
.enemy-name{font-weight:600;font-size:13.5px;color:var(--parch);}
.enemy-tactic{font-size:12.5px;line-height:1.5;color:var(--parch-dim);margin:4px 0 0;}
.enemy-drops{font-size:11px;color:var(--gold);margin:3px 0 0;}
.korok-row{padding:9px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:11px;margin-bottom:7px;background:rgba(255,255,255,0.015);}
.korok-type{font-weight:600;font-size:13px;color:var(--moss);}
.korok-how{font-size:12.5px;line-height:1.5;color:var(--parch-dim);margin:3px 0 0;}
.cook-extra{margin-top:18px;}
.gorecipe{padding:11px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:11px;margin-bottom:8px;background:rgba(255,255,255,0.015);}
.gorecipe-name{font-weight:600;font-size:13.5px;color:var(--parch);}
.gorecipe-make{font-size:12.5px;color:var(--parch-dim);margin:4px 0 2px;}
.gorecipe-make b{color:var(--cyan-dim);}
.gorecipe-why{font-size:12px;color:var(--parch-dim);line-height:1.45;}
.dragon-row{padding:9px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:11px;margin-bottom:7px;background:rgba(255,255,255,0.015);}
.dragon-name{font-weight:600;font-size:13.5px;color:var(--heart);display:flex;align-items:baseline;gap:8px;}
.dragon-el{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--cyan-dim);}
@media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important;}}
`}</style>);
}

/* ============================================================ REGION 6 · DIVINE BEAST VAH MEDOH ============================================================ */
const VAH_MEDOH = {
  id: "vah_medoh", name: "Divine Beast Vah Medoh", sub: "Rito Village", kind: "beast", champion: "Revali's Gale",
  tagline: "The flying beast over Rito Village. Cold country — bundle up, pass Teba's archery test, and shoot it out of the sky.",
  sections: [
    { id: "md_reach", name: "Reach Rito Village", sub: "Tabantha · cold", steps: [
      { id: "md1", k: "warn", t: "Tabantha is a cold region. Bring cold resistance — the Snowquill set (sold in Rito Village) is the clean fix, or cook Spicy food." },
      { id: "md2", k: "step", t: "Warp to Tabantha Tower and glide northeast to Rito Village, built around a tall rock spire." },
      { id: "md3", k: "optional", t: "Activate the Akh Va'quot Shrine in the village for a warp point.", items: [{ name: "Spirit Orb", cat: "key", note: "Akh Va'quot Shrine", orb: true }] },
      { id: "md4", k: "loot", t: "Buy the Snowquill armor set from the village shop — strong cold resistance for the whole northwest.", items: [{ name: "Snowquill Set", cat: "armor", note: "Cold resistance (Rito shop)" }] },
      { id: "md5", k: "step", t: "At the top, talk to Elder Kaneli — he asks you to help Teba take on Vah Medoh. Talk to Saki (next hut) to learn Teba is at the Flight Range." },
    ]},
    { id: "md_teba", name: "Teba & the Flight Range", sub: "Archery test", steps: [
      { id: "md6", k: "warn", t: "The Flight Range is an even colder (level 2) area — make sure your cold resistance is solid before gliding over from Revali's Landing." },
      { id: "md7", k: "step", t: "Reach the Flight Range and talk to Teba. Agree to help. His test: hit 5 targets in 3 minutes using the updrafts to glide and shoot." },
      { id: "md8", k: "loot", t: "Pass the test for 20 Bomb Arrows and the Falcon Bow (long range — perfect for the boss).", items: [{ name: "Falcon Bow", cat: "bow", note: "Long-range bow from Teba" }, { name: "Bomb Arrows ×20", cat: "material", note: "For Medoh's cannons" }] },
    ]},
    { id: "md_attack", name: "Ground Vah Medoh", sub: "Ride Teba · 4 cannons", steps: [
      { id: "md9", k: "step", t: "Talk to Teba to launch the assault. He flies you up alongside Medoh as it circles." },
      { id: "md10", k: "step", t: "Destroy the 4 cannons — one on each wing, one on the tail, one on the beak — with Bomb Arrows. They fire Guardian-style lasers; release the paraglider to drop and dodge, then re-open it." },
      { id: "md11", k: "step", t: "With all 4 cannons down, the barrier drops and Teba lands you on Medoh." },
    ]},
    { id: "md_inside", name: "Inside Vah Medoh", sub: "Activate 5 terminals", reward: "Control of Vah Medoh", steps: [
      { id: "md12", k: "step", t: "Revali's intro: light 5 terminals, then the main control unit. Shoot the glowing Malice eyeballs to clear paths and deal with Guardian Scouts." },
      { id: "md13", k: "step", t: "The map terminal lets you TILT the whole beast. Rotate Medoh to redirect its built-in updrafts and walkways, then ride updrafts + paraglider to reach each terminal." },
      { id: "md14", k: "loot", t: "Grab the chests as you go (a Sapphire sits behind you at the tail when you board). You can't return after the boss.", items: [{ name: "Sapphire", cat: "material", note: "Chest on Medoh's tail" }] },
    ]},
    { id: "md_boss", name: "Boss: Windblight Ganon", sub: "Free Revali", reward: "Revali's Gale + Heart Container", steps: [
      { id: "md_b1", k: "step", t: "Phase 1: it floats and fires wind blasts and a laser. Use the updrafts on the arena to fly up and get slow-mo bow shots at its EYE (the Falcon Bow shines here); bomb arrows stun it. Hide behind pillars from the laser." },
      { id: "md_b2", k: "step", t: "Phase 2 (~50% HP): it summons floating turrets that bounce its laser. Ignore them (or Stasis the boss / shoot the reflectors) and keep hammering the eye, then flurry when it's stunned." },
      { id: "md_b3", k: "reward", t: "Beat it, GRAB the Heart Container, then activate the main control unit to free Revali. He grants Revali's Gale — hold jump for an updraft (3 charges), the best traversal power in the game. Speak to Kaneli for the Great Eagle Bow.", items: [{ name: "Heart Container", cat: "key", note: "From Windblight Ganon" }, { name: "Great Eagle Bow", cat: "bow", note: "Revali's bow — 3 arrows at once (from Kaneli)" }] },
    ]},
  ],
};

/* ============================================================ REGION 7 · DIVINE BEAST VAH RUDANIA ============================================================ */
const VAH_RUDANIA = {
  id: "vah_rudania", name: "Divine Beast Vah Rudania", sub: "Death Mountain · Goron City", kind: "beast", champion: "Daruk's Protection",
  tagline: "The salamander on Death Mountain. You'll need fireproofing and a Goron cannonball named Yunobo.",
  sections: [
    { id: "rd_reach", name: "Reach Goron City", sub: "Fireproofing first", steps: [
      { id: "rd1", k: "warn", t: "CRITICAL: Death Mountain is so hot it sets wooden weapons on fire and burns you without protection. Get the Flamebreaker armor (Southern Mine / Foothill Stable area) or carry Fireproof Elixirs BEFORE going up." },
      { id: "rd2", k: "step", t: "From Eldin Tower, ride the mine carts / follow the road up to Goron City. Talk to the boss, Bludo — but his back's gone out, so he sends you with his helper Yunobo." },
      { id: "rd3", k: "step", t: "Free Yunobo from the cave-in at the Abandoned North Mine (bomb the rocks). Bludo gives you Fireproof Elixirs and points you to the Bridge of Eldin." },
    ]},
    { id: "rd_yunobo", name: "Yunobo the Cannonball", sub: "Bridge of Eldin", steps: [
      { id: "rd4", k: "step", t: "At the Bridge of Eldin, defeat the 2 Moblins bullying Yunobo (grab their drops fast before the heat burns them)." },
      { id: "rd5", k: "step", t: "Yunobo can curl up and use Daruk's Protection — so he survives being fired from a cannon. Hit the cannon's switch to aim it at the bridge, then launch Yunobo to lower it." },
    ]},
    { id: "rd_climb", name: "Up Death Mountain", sub: "Cannon Yunobo at Rudania", steps: [
      { id: "rd6", k: "warn", t: "Vah Rudania patrols sentries (Guardian drones). If a sentry spots you OR Yunobo, Rudania triggers a magma rockslide that knocks you back. Hide under rocks and let them pass." },
      { id: "rd7", k: "step", t: "Climb the mountain counter-clockwise. Whistle (D-pad down) to tell Yunobo to follow or stay. At each cannon, aim and fire Yunobo at Rudania's 4 glowing weak points." },
      { id: "rd8", k: "step", t: "Four hits force Rudania to retreat into the crater — drop in and board it." },
    ]},
    { id: "rd_inside", name: "Inside Vah Rudania", sub: "Activate 5 terminals", reward: "Control of Vah Rudania", steps: [
      { id: "rd9", k: "step", t: "Light 5 terminals, then the main control unit. Shoot Malice eyeballs, bomb obstacles, and use Magnesis on the metal blocks." },
      { id: "rd10", k: "step", t: "The map terminal ROTATES the whole beast (it walks on walls and the ceiling). Tilt Rudania 90° to reposition platforms, then paraglide across to the terminals. Grab Ice Arrow chests — they're gold for the boss.", items: [{ name: "Ice Arrows", cat: "material", note: "Chests inside / North Mine — for the fire boss" }] },
    ]},
    { id: "rd_boss", name: "Boss: Fireblight Ganon", sub: "Free Daruk", reward: "Daruk's Protection + Heart Container", steps: [
      { id: "rd_b1", k: "step", t: "Phase 1: it swings a massive flaming sword — jump sideways for vertical slashes, jump over horizontal ones (or just keep distance), and Flurry Rush after a dodge. Ice Arrows to the eye stun it and deal big damage." },
      { id: "rd_b2", k: "step", t: "Phase 2 (~50% HP): it floats up and charges a giant fireball — throw a Remote Bomb so the fireball SUCKS it in, then detonate to stun it. Follow with Ice Arrows to the eye, then melee." },
      { id: "rd_b3", k: "reward", t: "GRAB the Heart Container, then activate the main control unit to free Daruk. He grants Daruk's Protection — hold ZL for a shield that blocks 3 hits and reflects Guardian lasers. Back in Goron City, see Yunobo then Bludo for the Boulder Breaker.", items: [{ name: "Heart Container", cat: "key", note: "From Fireblight Ganon" }, { name: "Boulder Breaker", cat: "weapon", note: "Daruk's two-hander (from Bludo)" }] },
    ]},
  ],
};

/* ============================================================ REGION 8 · DIVINE BEAST VAH NABORIS ============================================================ */
const VAH_NABORIS = {
  id: "vah_naboris", name: "Divine Beast Vah Naboris", sub: "Gerudo Desert", kind: "beast", champion: "Urbosa's Fury",
  tagline: "The camel in the sandstorm — the toughest beast and hardest blight. Disguise up, reclaim the Thunder Helm, and ride a sand seal.",
  sections: [
    { id: "nb_gerudo", name: "Forbidden City Entry", sub: "Gerudo Town · the vai outfit", steps: [
      { id: "nb1", k: "warn", t: "The desert is scorching by day and freezing by night — pack heat AND cold resistance (Chilly / Spicy food; Snowquill helps at night)." },
      { id: "nb2", k: "step", t: "Gerudo Town bars men. Buy the Gerudo (vai) outfit — Veil, Top, and Sirwal — for ~600 rupees from Vilia at Kara Kara Bazaar on the way in. Wear all three to get past the guards.", items: [{ name: "Gerudo Vai Set", cat: "armor", note: "Disguise to enter Gerudo Town" }] },
      { id: "nb3", k: "step", t: "Inside, speak to Chief Riju. She'll help against Naboris — but you need the Thunder Helm, stolen by the Yiga Clan. Talk to Captain Teake for the hideout's location." },
    ]},
    { id: "nb_yiga", name: "The Thunder Helm", sub: "Yiga Hideout · Master Kohga", steps: [
      { id: "nb4", k: "step", t: "Sneak through the Yiga Hideout (the Yiga love Mighty Bananas — drop one to lure a guard away). Getting spotted summons tough Yiga Blademasters." },
      { id: "nb5", k: "step", t: "At the end, fight Master Kohga. He hurls spiked iron balls — use Magnesis to grab the ball and smash him with it (or make him drop it on his own head)." },
      { id: "nb6", k: "loot", t: "Take the Thunder Helm from the chest and return it to Riju (she's on the 2nd floor now). She wears it and meets you at the lookout post south of town.", items: [{ name: "Thunder Helm", cat: "key", note: "Blocks Naboris's lightning" }] },
    ]},
    { id: "nb_attack", name: "Ground Vah Naboris", sub: "Sand seal · 4 feet", steps: [
      { id: "nb7", k: "step", t: "You NEED a sand seal — rent one in town or catch a wild one. Ride to the lookout post; Riju gives you 20 Bomb Arrows." },
      { id: "nb8", k: "step", t: "Ride your sand seal alongside Riju, staying inside her Thunder Helm field to block the lightning. Shoot each of Naboris's 4 feet with Bomb Arrows — 2 per foot, 8 hits total — to stun it." },
      { id: "nb9", k: "step", t: "Board Naboris while it's down." },
    ]},
    { id: "nb_inside", name: "Inside Vah Naboris", sub: "Activate 5 terminals", reward: "Control of Vah Naboris", steps: [
      { id: "nb10", k: "warn", t: "Don't use metal weapons or shields in here — Naboris runs on electricity and they'll shock you." },
      { id: "nb11", k: "step", t: "Light 5 terminals, then the main control unit. Naboris is built from rotating cylinder sections — use the map terminal to spin them and align paths, and route the electric current through the conductors." },
      { id: "nb12", k: "tip", t: "The fiddly one is the 5th terminal — power it by placing the two metal balls on the two pedestals (use Magnesis to carry them up and drop them in)." },
    ]},
    { id: "nb_boss", name: "Boss: Thunderblight Ganon", sub: "Free Urbosa", reward: "Urbosa's Fury + Heart Container", steps: [
      { id: "nb_b1", k: "step", t: "Phase 1: it's FAST and teleports. Bait its quick lunge and Flurry Rush; shoot to stun, then strike. Use NON-metal gear so its lightning doesn't fry you." },
      { id: "nb_b2", k: "step", t: "Phase 2 (~50% HP): it drops metal pillars and charges lightning. Grab a pillar with Magnesis so the lightning hits IT instead of you — that staggers Thunderblight; then flurry. Shock arrows help too." },
      { id: "nb_b3", k: "reward", t: "GRAB the Heart Container, then activate the main control unit to free Urbosa. She grants Urbosa's Fury — a charged lightning nova (3 charges). Re-don the vai outfit, see Riju, and claim the Scimitar of the Seven and Daybreaker shield. That's all four beasts — report to Impa to complete Free the Divine Beasts.", items: [{ name: "Heart Container", cat: "key", note: "From Thunderblight Ganon" }, { name: "Scimitar of the Seven", cat: "weapon", note: "Urbosa's blade (from Riju)" }, { name: "Daybreaker", cat: "shield", note: "Gerudo shield (from Riju)" }] },
    ]},
  ],
};

/* ============================================================ REGION 9 · THE MASTER SWORD ============================================================ */
const MASTER_SWORD = {
  id: "master_sword", name: "The Master Sword", sub: "Korok Forest", kind: "region",
  tagline: "The blade that seals the darkness. Optional — but you'll want it for Ganon. Needs 13 hearts.",
  sections: [
    { id: "ms_prep", name: "Get to 13 Hearts", sub: "The price of the blade", steps: [
      { id: "ms1", k: "warn", t: "Pulling the sword drains your health. You need at least 13 FULL red hearts (not temporary yellow ones) or Link dies mid-pull." },
      { id: "ms2", k: "step", t: "That's 10 heart upgrades beyond your starting 3 — i.e. 40 Spirit Orbs spent on hearts. If you sank orbs into stamina, swap them at the Horned Statue in Hateno Village (it trades hearts ↔ stamina)." },
    ]},
    { id: "ms_woods", name: "The Lost Woods", sub: "Follow the embers", steps: [
      { id: "ms3", k: "step", t: "Head to the Great Hyrule Forest (Woodland region, north of Hyrule Castle). Nearest tower: Woodland Tower. Enter the foggy Lost Woods." },
      { id: "ms4", k: "step", t: "First stretch: follow the lit torches. After the checkpoint (two torches and a carved face), light your own torch (or a wooden weapon)." },
      { id: "ms5", k: "step", t: "Stand still and watch which way the EMBERS blow off your flame — walk that direction, re-checking every few steps. If the fog turns bright white, you went wrong; backtrack. Follow the embers out into the Korok Forest." },
    ]},
    { id: "ms_pull", name: "The Great Deku Tree", sub: "Claim the sword", steps: [
      { id: "ms6", k: "optional", t: "Activate Keo Ruug Shrine right by the Deku Tree so you can fast-travel here later instead of re-running the Lost Woods.", items: [{ name: "Spirit Orb", cat: "key", note: "Keo Ruug Shrine", orb: true }] },
      { id: "ms7", k: "reward", t: "Approach the pedestal and hold to pull. With 13 hearts, Link draws the Master Sword free. It never permanently breaks (it 'runs out' and recharges in ~10 min), hits 30 — and 60 against Ganon, Malice, and Guardians. At full health it fires a sword beam (hold R).", items: [{ name: "Master Sword", cat: "weapon", note: "Seals the darkness · recharges, never breaks" }] },
    ]},
  ],
};

/* ============================================================ REGION 10 · DESTROY GANON ============================================================ */
const DESTROY_GANON = {
  id: "destroy_ganon", name: "Destroy Ganon", sub: "Hyrule Castle", kind: "region",
  tagline: "The end. Storm Hyrule Castle, beat Calamity Ganon, then finish Dark Beast Ganon with the Bow of Light.",
  sections: [
    { id: "dg_prep", name: "Before You Go", sub: "Stack the deck", steps: [
      { id: "dg1", k: "tip", t: "Free all four Divine Beasts first — when you enter the Sanctum, each fires a laser that strips 1/8 of Ganon's HP, so he starts at HALF health." },
      { id: "dg2", k: "tip", t: "Bring: the Master Sword (60 dmg here), Ancient Arrows (huge damage / one-shot Guardians), a multishot bow (Great Eagle / Lynel), Hearty meals (full heal + bonus hearts), and a Fairy or two (auto-revive at 0 HP)." },
    ]},
    { id: "dg_castle", name: "Hyrule Castle", sub: "Optional loot run", steps: [
      { id: "dg3", k: "warn", t: "The castle and Castle Town Ruins crawl with Guardians (Stalkers, Skywatchers) and Malice. Weave through laser spotlights; shoot eyeballs to unblock stairs; Ancient Arrows make Guardians trivial." },
      { id: "dg4", k: "loot", t: "Worth grabbing on the way up: the Royal Guard set and Royal weapons scattered inside — and the Hylian Shield (the best shield in the game) from a chest in the castle Lockup/dungeon.", items: [{ name: "Hylian Shield", cat: "shield", note: "Best shield in the game (castle Lockup)" }] },
      { id: "dg5", k: "step", t: "Climb to the Sanctum at the top of the castle. Entering it triggers the Divine Beasts' lasers (if freed) and starts the fight." },
    ]},
    { id: "dg_calamity", name: "Calamity Ganon", sub: "Phase 1 boss", steps: [
      { id: "dg6", k: "step", t: "Calamity Ganon uses all four Blights' moves — fire, water, wind, thunder, a flaming sword, and a laser. Flurry Rush its sword swings; deflect the laser back; shoot its glowing EYE to stun, then unload with the Master Sword and Ancient Arrows." },
      { id: "dg7", k: "step", t: "At critical HP it raises a shield that nullifies most attacks. Break it with Urbosa's Fury (lightning pierces it) or by deflecting its charged beam back — then finish it off." },
    ]},
    { id: "dg_darkbeast", name: "Dark Beast Ganon", sub: "The final shot", steps: [
      { id: "dg8", k: "step", t: "Ganon flees onto Hyrule Field as a colossal Dark Beast. Zelda gives you the Bow of Light (unlimited Light Arrows). Shoot the glowing orange weak points on its body to expose the eyes.", items: [{ name: "Bow of Light", cat: "bow", note: "Zelda's bow — unlimited Light Arrows" }] },
      { id: "dg9", k: "reward", t: "When it attacks, an updraft forms in front of it — glide up (or use Revali's Gale) and, in mid-air slow-mo, fire a Light Arrow into its huge eye. Land the final shot to end the Calamity. Roll credits — and if you found every memory, stay for the bonus scene." },
    ]},
  ],
};

const REGIONS = [GREAT_PLATEAU, KAKARIKO, HATENO, MEMORIES, VAH_RUTA, VAH_MEDOH, VAH_RUDANIA, VAH_NABORIS, MASTER_SWORD, DESTROY_GANON];

/* GEN:DATA:START — generated by build/inline-data.mjs from knowledge/*.json; do not hand-edit */
const SHRINES = [
 {
  "regionKey": "great_plateau",
  "regionName": "Great Plateau",
  "shrines": [
   {
    "name": "Oman Au Shrine",
    "location": "Northeast of the Great Plateau Tower, on the open plateau; the first shrine the Old Man sends you to.",
    "category": "puzzle",
    "oneLine": "Grants the Magnesis Trial. Use Magnesis to move the metal blocks and bridge the gaps to reach the monk.",
    "shrineQuest": null
   },
   {
    "name": "Ja Baij Shrine",
    "location": "East side of the plateau, near the East Abbey ruins.",
    "category": "puzzle",
    "oneLine": "Grants the Bomb Trial (Remote Bombs). Use round and cube bombs to blast cracked walls and clear a path to the monk.",
    "shrineQuest": null
   },
   {
    "name": "Owa Daim Shrine",
    "location": "Southeast of Mount Hylia's peak, atop a ledge just outside the mountain's freezing zone (no cold gear needed here).",
    "category": "puzzle",
    "oneLine": "Grants the Stasis Trial. Freeze the moving platform with Stasis, hit it to load momentum, then ride it across the gap.",
    "shrineQuest": null
   },
   {
    "name": "Keh Namut Shrine",
    "location": "Northwest of Mount Hylia's peak, in the snowy freezing zone. Bring cold protection (warm food or the Warm Doublet) before heading up.",
    "category": "puzzle",
    "oneLine": "Grants the Cryonis Trial. Raise ice pillars from the water with Cryonis to make platforms and climb up to the monk.",
    "shrineQuest": null
   }
  ]
 },
 {
  "regionKey": "dueling-peaks",
  "regionName": "Dueling Peaks",
  "shrines": [
   {
    "name": "Ha Dahamar Shrine",
    "location": "In the small pond just west of Dueling Peaks Stable, on the riverbank.",
    "category": "puzzle",
    "oneLine": "The Water Guides: use Cryonis to clear the entrance spikes, then raise ice on the waterfall wall to steer the orb, pinball-style, into its slot.",
    "shrineQuest": null
   },
   {
    "name": "Bosh Kala Shrine",
    "location": "West of the Dueling Peaks Tower, just south of the East Post Ruins and west of Proxim Bridge, along the path in from the Great Plateau.",
    "category": "puzzle",
    "oneLine": "The Wind Guides You: open your paraglider in the updrafts from the fans to float across the gaps and reach the chest and altar.",
    "shrineQuest": null
   },
   {
    "name": "Ree Dahee Shrine",
    "location": "In the valley between the twin peaks, just north of the Squabble River, between Dueling Peaks Tower and Dueling Peaks Stable.",
    "category": "puzzle",
    "oneLine": "Timing Is Critical: hit switches to tilt platforms and roll orbs into sockets, activating moving platforms; time your dashes across them.",
    "shrineQuest": null
   },
   {
    "name": "Toto Sah Shrine",
    "location": "South of Dueling Peaks Stable across the twin bridges, behind a bombable wall along the river near Hickaly Woods.",
    "category": "puzzle",
    "oneLine": "Toto Sah Apparatus: use the Sheikah Slate to rotate the motion-control platforms into pathways and reach the monk's pedestal.",
    "shrineQuest": null
   },
   {
    "name": "Ta'loh Naeg Shrine",
    "location": "On the hill directly north of Kakariko Village, up the steps; it's the village's main travel gate.",
    "category": "combat",
    "oneLine": "Ta'loh Naeg's Teaching: a combat tutorial — practice perfect dodge (flurry rush), perfect guard, and the charged spin attack against the Guardian Scout.",
    "shrineQuest": null
   },
   {
    "name": "Lakna Rokee Shrine",
    "location": "East of Kakariko Village, revealed at the end of the Stolen Heirloom investigation.",
    "category": "quest",
    "oneLine": "Lakna Rokee's Blessing: recover Paya's stolen heirloom, then claim the orb. It's a free blessing once the quest reveals the shrine.",
    "shrineQuest": "The Stolen Heirloom"
   },
   {
    "name": "Shee Vaneer Shrine",
    "location": "At the summit of the south twin peak, southeast of Dueling Peaks Tower.",
    "category": "puzzle",
    "oneLine": "Twin Memories: a mirrored orb puzzle — memorize the orb layout in its twin (Shee Venath) and replicate it here on the 5x5 grid.",
    "shrineQuest": null
   },
   {
    "name": "Shee Venath Shrine",
    "location": "At the summit of the north twin peak, southeast of Dueling Peaks Tower.",
    "category": "puzzle",
    "oneLine": "Twin Memories: a mirrored orb puzzle — memorize the orb layout in its twin (Shee Vaneer) and replicate it here on the 5x5 grid.",
    "shrineQuest": null
   },
   {
    "name": "Hila Rao Shrine",
    "location": "On the Floret Sandbar, an islet where the Hylia River meets Nabi Lake, northeast of Dueling Peaks Tower in West Necluda.",
    "category": "quest",
    "oneLine": "Drifting: first cross Magda's flower field without trampling a bloom to reveal the shrine; inside, use Cryonis on the flowing water.",
    "shrineQuest": "Watch Out for the Flowers"
   }
  ]
 },
 {
  "regionKey": "hateno",
  "regionName": "Hateno",
  "shrines": [
   {
    "name": "Myahm Agana Shrine",
    "location": "On the hill at the east edge of Hateno Village, near the plot where you can buy a house.",
    "category": "puzzle",
    "oneLine": "Tilt-maze (Myahm Agana Apparatus): use motion controls to guide the ball, or flip the maze fully upside-down so the ball rolls across the flat back to the goal.",
    "shrineQuest": null
   },
   {
    "name": "Tahno O'ah Shrine",
    "location": "On the East Necluda coast, near the shore northeast of the Hateno Ancient Tech Lab.",
    "category": "blessing",
    "oneLine": "Tahno O'ah's Blessing: no puzzle. Reach the out-of-the-way ledge by the cliffs, enter, and collect the free Spirit Orb from the monk.",
    "shrineQuest": null
   },
   {
    "name": "Jitan Sa'mi Shrine",
    "location": "At the summit of Mount Lanayru, behind the Goddess Statue at the Spring of Wisdom.",
    "category": "quest",
    "oneLine": "Cold climb. Free corrupted Naydra by shooting all its glowing points, then offer a Naydra's Scale at the Goddess Statue to open the shrine (free orb inside).",
    "shrineQuest": "The Spring of Wisdom"
   },
   {
    "name": "Kam Urog Shrine",
    "location": "Northeast of Fort Hateno, in a clearing of statues near a small graveyard south of the Lanayru Promenade.",
    "category": "quest",
    "oneLine": "Talk to Calip and call him 'doctor'. At night a statue's eyes glow purple by the headstones; shoot it with an arrow to raise the buried shrine.",
    "shrineQuest": "The Cursed Statue"
   },
   {
    "name": "Mezza Lo Shrine",
    "location": "Northeastern East Necluda on Rabia Plain, near Kass's platform southeast of Lanayru Tower (across the Rutala River).",
    "category": "quest",
    "oneLine": "The Crowned Beast: hear Kass's verse, then tame and mount a Mountain Buck (stag) and ride it onto the nearby platform to raise the buried shrine.",
    "shrineQuest": "The Crowned Beast"
   },
   {
    "name": "Chaas Qeta Shrine",
    "location": "Out in the Necluda Sea on tiny Tenoko Island, southeast of Hateno Village (visible from the coast).",
    "category": "combat",
    "oneLine": "A Major Test of Strength: raft or paraglide out to the island and beat the upgraded Guardian Scout for the orb and ancient gear.",
    "shrineQuest": null
   },
   {
    "name": "Dow Na'eh Shrine",
    "location": "Along the Lanayru Promenade at the west edge of East Necluda, hidden behind a waterfall.",
    "category": "puzzle",
    "oneLine": "Three Boxes: find the hidden treasure boxes and set them on the matching pressure switches to open the gate to the monk.",
    "shrineQuest": null
   }
  ]
 },
 {
  "regionKey": "lanayru",
  "regionName": "Lanayru",
  "shrines": [
   {
    "name": "Kaya Wan Shrine",
    "location": "Lanayru Wetlands, directly beside the west side of the Wetland Stable, northwest of Lanayru Tower",
    "category": "puzzle",
    "oneLine": "Shields From Water: use Cryonis to raise ice pillars across the water-filled chambers, navigating past a Guardian Scout to reach the monk.",
    "shrineQuest": null
   },
   {
    "name": "Daka Tuss Shrine",
    "location": "On a small island in the Lanayru Wetlands, southwest of Lanayru Tower and north of Kakariko Village",
    "category": "puzzle",
    "oneLine": "Sunken Scoop: use Magnesis on the sunken metal bowl to scoop floating balls and drop them into the cages, then sink the bowl onto the switch.",
    "shrineQuest": null
   },
   {
    "name": "Sheh Rata Shrine",
    "location": "On a small island in the Hylia River within the Lanayru Wetlands, reachable via an underwater path or raft",
    "category": "puzzle",
    "oneLine": "Speed of Light: spin the crank to rotate the laser onto the crystal switch, using Cryonis ice pillars to cross the water and reach platforms.",
    "shrineQuest": null
   },
   {
    "name": "Soh Kofi Shrine",
    "location": "On a cliff just north of Lanayru Tower, near the path to Sidon's bridge; glide over from the tower top",
    "category": "combat",
    "oneLine": "A Minor Test of Strength: defeat the Guardian Scout II with sword and shield, dodging its spin and beam attacks; chest holds a Knight's Bow.",
    "shrineQuest": null
   },
   {
    "name": "Ne'ez Yohma Shrine",
    "location": "In the center of Zora's Domain, below King Dorephan's throne room",
    "category": "puzzle",
    "oneLine": "Pushing Power: use Cryonis to shove the Ancient Orb across the sloped waterway into its slot while dodging the boulders rolling down.",
    "shrineQuest": null
   },
   {
    "name": "Dagah Keek Shrine",
    "location": "Lanayru Great Spring, atop Veiled Falls near Zora's Domain (revealed by the shrine quest)",
    "category": "quest",
    "oneLine": "Blessing shrine revealed by the shrine quest; a free Spirit Orb and a chest with a Silver Rupee wait inside, no puzzle.",
    "shrineQuest": "The Ceremonial Song"
   },
   {
    "name": "Rucco Maag Shrine",
    "location": "On the Samasa Plain in the Lanayru Great Spring, south of Zora's Domain, set within a stone-spike maze patrolled by Lizalfos",
    "category": "puzzle",
    "oneLine": "Five Flames: light all five torches on the floating cube and pillars with a torch, avoiding the water spout and keeping the flame above water.",
    "shrineQuest": null
   },
   {
    "name": "Kah Mael Shrine",
    "location": "On Tingel Island, the northernmost island of the chain in the Lanayru Sea (far northeast), hidden under a stone slab",
    "category": "puzzle",
    "oneLine": "Drop and Rise: lift the slab with an Octo Balloon or Stasis to enter, then shoot the ropes so the cube drops on the scale and launches the barrel up.",
    "shrineQuest": null
   },
   {
    "name": "Shai Yota Shrine",
    "location": "On a small island in Horon Lagoon in the Lanayru Sea, far east of the region (revealed by the shrine quest)",
    "category": "quest",
    "oneLine": "Free Spirit Orb: the monk grants the orb simply for reaching the shrine; the real challenge is the Master of the Wind quest outside.",
    "shrineQuest": "Master of the Wind"
   }
  ]
 },
 {
  "regionKey": "lake",
  "regionName": "Lake Hylia",
  "shrines": [
   {
    "name": "Ka'o Makagh Shrine",
    "location": "On a high ledge a short climb up the hill just south of Highland Stable, overlooking the stable.",
    "category": "puzzle",
    "oneLine": "Trial 'Metal Doors Open the Way' — use Magnesis to move the metal doors and use them as ramps/bridges to reach the monk.",
    "shrineQuest": null
   },
   {
    "name": "Pumaag Nitae Shrine",
    "location": "In the woods southeast of Lake Hylia, near the border of Pagos Woods and Finra Woods, a short trip from Lake Tower.",
    "category": "combat",
    "oneLine": "'A Minor Test of Strength' — defeat the Guardian Scout II (sword and shield); use Flurry Rush on its melee swings.",
    "shrineQuest": null
   },
   {
    "name": "Ishto Soh Shrine",
    "location": "Atop a cliff west of Oseira Plains and east of Daval Peak, in the southwest of the Lake region.",
    "category": "puzzle",
    "oneLine": "Trial 'Bravery's Grasp' — set the portable laser on the moving platform to hit the crystal switch, then climb the raised ledges.",
    "shrineQuest": null
   },
   {
    "name": "Ya Naga Shrine",
    "location": "In the center of Hylia Island, the large island in Lake Hylia; paraglide in from Lake Tower to the west.",
    "category": "puzzle",
    "oneLine": "Trial 'Shatter the Heavens' — use Stasis/Remote Bombs to drive the stone cube up its track and smash the blocks to launch up.",
    "shrineQuest": null
   },
   {
    "name": "Shae Katha Shrine",
    "location": "Behind the Goddess Statue at the Spring of Courage, by Damel Forest north of the Zonai Ruins, southeast of Lake Hylia.",
    "category": "quest",
    "oneLine": "Blessing shrine — no inner puzzle. The door behind the Goddess Statue opens only after the shrine quest.",
    "shrineQuest": "The Serpent's Jaws"
   },
   {
    "name": "Shoqa Tatone Shrine",
    "location": "Rises on Puffer Beach on the southern coast, south of Lake Tower, only after its shrine quest is solved.",
    "category": "quest",
    "oneLine": "Hidden until you finish the quest; once it surfaces, place the orb to raise it and walk in for the blessing — no inner puzzle.",
    "shrineQuest": "Guardian Slideshow"
   }
  ]
 },
 {
  "regionKey": "faron",
  "regionName": "Faron",
  "shrines": [
   {
    "name": "Shai Utoh Shrine",
    "location": "Inside a cave behind a breakable rock wall at the base of Ubota Point, just behind Lakeside Stable.",
    "category": "puzzle",
    "oneLine": "Halt the Tilt: use Stasis to freeze the tilting platforms and climb up. You can also pin them with the metal chest via Magnesis.",
    "shrineQuest": null
   },
   {
    "name": "Shoda Sah Shrine",
    "location": "Behind the waterfall flowing from Riola Spring, southeast in the Faron rainforest.",
    "category": "puzzle",
    "oneLine": "Impeccable Timing: load an orb in the launcher and hit the crystal switch when the moving platforms are farthest apart to land it in the receptacle.",
    "shrineQuest": null
   },
   {
    "name": "Yah Rin Shrine",
    "location": "On the cliffs on the northwestern outskirts of Lurelin Village, East Necluda, overlooking the village.",
    "category": "puzzle",
    "oneLine": "A Weighty Decision: stand on one scale and use Magnesis to lift the metal cube high over the other scale, then drop it to launch yourself up.",
    "shrineQuest": null
   },
   {
    "name": "Muwo Jeem Shrine",
    "location": "Atop Cape Cales, the cape overlooking the Necluda Sea in southeastern East Necluda, reached by gliding or climbing the cliffs.",
    "category": "combat",
    "oneLine": "A Modest Test of Strength: beat the Guardian Scout III. Dodge for flurry rushes and use the breakable stone pillars as cover or to stun it.",
    "shrineQuest": null
   },
   {
    "name": "Qukah Nata Shrine",
    "location": "Rises from a mound in Calora Lake, atop a waterfall directly east of Faron Tower.",
    "category": "quest",
    "oneLine": "A Song of Storms: equip metal gear and stand on the mound in a thunderstorm so lightning strikes it, revealing the shrine; inside is a free orb.",
    "shrineQuest": "A Song of Storms"
   },
   {
    "name": "Kah Yah Shrine",
    "location": "At the Palmorae Ruins, the curving spit of land east of Lurelin Village (a fragment sits out at Soka Point); revealed after restoring the broken monument.",
    "category": "quest",
    "oneLine": "Quick Thinking: carry a barrel onto the moving platform, crouch under the barriers, then set it on the far floor switch to open the gate.",
    "shrineQuest": "A Fragmented Monument"
   },
   {
    "name": "Korgu Chideh Shrine",
    "location": "On Koholit Rock at the summit of Eventide Island, far southeast in the Necluda Sea.",
    "category": "quest",
    "oneLine": "Stranded on Eventide: stripped of gear, carry the three Ancient Orbs to their pedestals to raise the shrine; inside is a free orb.",
    "shrineQuest": "Stranded on Eventide"
   },
   {
    "name": "Tawa Jinn Shrine",
    "location": "Buried on the eastern slope of Mount Taran, above Taran Pass on the Faron/East Necluda border; rises once the quest is done.",
    "category": "quest",
    "oneLine": "The Three Giant Brothers: take the Ancient Orb from each of the three Hinox on Mount Taran and place them in the pedestals to raise the shrine; inside is a free orb.",
    "shrineQuest": "The Three Giant Brothers"
   }
  ]
 },
 {
  "regionKey": "central_hyrule",
  "regionName": "Central Hyrule",
  "shrines": [
   {
    "name": "Kaam Ya'tak Shrine",
    "location": "Directly southwest of Central Tower, at the base of Mount Daphnes just west of Windvane Meadow in Hyrule Field.",
    "category": "puzzle",
    "oneLine": "Trial of Power. Use Magnesis and Stasis to swing the hanging boulder, then time your sprint past the rolling spiked boulders.",
    "shrineQuest": null
   },
   {
    "name": "Rota Ooh Shrine",
    "location": "At Outskirt Stable, in southwestern Central Hyrule along the road southwest of the Castle Town Ruins.",
    "category": "puzzle",
    "oneLine": "Passing of the Gates. Use Stasis and timing to slip past the spinning gates, and Magnesis metal blocks to bridge gaps and hit switches.",
    "shrineQuest": null
   },
   {
    "name": "Wahgo Katta Shrine",
    "location": "Southeast Central Hyrule, right beside Riverside Stable near the Hylia River.",
    "category": "puzzle",
    "oneLine": "Metal Connections. Use Magnesis to move the metal crates and complete the circuit, building a path to the monk.",
    "shrineQuest": null
   },
   {
    "name": "Katah Chuki Shrine",
    "location": "Southwest of Hyrule Castle, out in Hyrule Field near the Castle Town Ruins.",
    "category": "combat",
    "oneLine": "A Minor Test of Strength. Beat the Guardian Scout; flurry rush its swings and use the chest weapons to finish it quickly.",
    "shrineQuest": null
   },
   {
    "name": "Saas Ko'sah Shrine",
    "location": "Inside Hyrule Castle at the Docks, on the northwest side where water leads into the castle. Light the central torch to raise the buried shrine.",
    "category": "combat",
    "oneLine": "A Major Test of Strength. Hardest Guardian Scout IV in the game; bring strong weapons, dodge for flurry rushes, lift the metal floor blocks with Magnesis for cover.",
    "shrineQuest": null
   },
   {
    "name": "Dah Kaso Shrine",
    "location": "Under the Digdogg Suspension Bridge in southwestern Central Hyrule, near the Regencia River.",
    "category": "combat",
    "oneLine": "A Minor Test of Strength. Defeat the Guardian Scout with flurry rushes and the weapons it drops.",
    "shrineQuest": null
   },
   {
    "name": "Namika Ozz Shrine",
    "location": "Northeast Central Hyrule in the Crenel Hills, hidden inside a large hollowed tree stump.",
    "category": "combat",
    "oneLine": "A Modest Test of Strength. Fight the stronger Guardian Scout III; flurry rush its spear and axe, then grab the Frostspear from the chest.",
    "shrineQuest": null
   },
   {
    "name": "Noya Neha Shrine",
    "location": "North of Central Tower (east of Ridgeland Tower) on the island west of Hyrule Castle, in a cave behind thorny vines and a cracked wall.",
    "category": "combat",
    "oneLine": "A Minor Test of Strength. Burn the thorns, bomb the cracked wall to open the cave, then beat the Guardian Scout inside.",
    "shrineQuest": null
   }
  ]
 },
 {
  "regionKey": "ridgeland",
  "regionName": "Hyrule Ridge",
  "shrines": [
   {
    "name": "Maag No'rah Shrine",
    "location": "Inside a cliff cave southwest of the Maritta Exchange Ruins; there's a Bokoblin camp with a tall lookout tower nearby - face south from the tower for the cracked rocks",
    "category": "blessing",
    "oneLine": "\"Maag No'rah's Blessing\" - no trial inside; blow open the cracked rocks on the cliff with a bomb arrow or remote bomb, climb in, and claim the orb.",
    "shrineQuest": null
   },
   {
    "name": "Mogg Latan Shrine",
    "location": "Atop Satori Mountain, southwest of Ridgeland Tower, south of Hyrule Ridge",
    "category": "puzzle",
    "oneLine": "\"Synced Swing\" - use Magnesis (and Stasis) to swing and steady the chained metal platforms, timing your jumps across the gaps to the monk.",
    "shrineQuest": null
   },
   {
    "name": "Zalta Wa Shrine",
    "location": "In the Breach of Demise, right along the path just southeast of Ridgeland Tower",
    "category": "puzzle",
    "oneLine": "\"Two Orbs to Guide You\" - shoot the first orb into its slot, carry the freed orb onto the floor switch, then use the shock-launch platform to reach the altar.",
    "shrineQuest": null
   },
   {
    "name": "Mijah Rokee Shrine",
    "location": "Southern part of Washa's Bluff, north of Satori Mountain past the Tamio River; Kass sits in a tree nearby",
    "category": "mixed",
    "oneLine": "Find Kass for \"Under a Red Moon,\" then stand bare on the pedestal during a Blood Moon to raise it; inside is \"A Modest Test of Strength\" (Guardian Scout III).",
    "shrineQuest": "Under a Red Moon"
   },
   {
    "name": "Sheem Dagoze Shrine",
    "location": "On a cliffside in the West Hyrule Plains, northwest of Jeddo Bridge overlooking the river; Kass is nearby",
    "category": "quest",
    "oneLine": "Solve \"The Two Rings\" - shoot one arrow through both stone rings to raise the shrine; inside, guide two Ancient Orbs down the ramps into their slots.",
    "shrineQuest": "The Two Rings"
   },
   {
    "name": "Toh Yahsa Shrine",
    "location": "On Thundra Plateau, west of Ridgeland Tower",
    "category": "quest",
    "oneLine": "\"Trial of Thunder\" - use Stasis to knock the four colored orbs into their matching slots on the plateau to raise the shrine; inside is a short Magnesis puzzle.",
    "shrineQuest": "Trial of Thunder"
   },
   {
    "name": "Shae Loya Shrine",
    "location": "On a ridge in Hyrule Ridge just south of Tabantha Bridge Stable",
    "category": "puzzle",
    "oneLine": "\"Aim for the Moment\" - ride the rotating platforms and shoot the eye switches with arrows at the right instant to open the gates to the monk.",
    "shrineQuest": null
   }
  ]
 },
 {
  "regionKey": "tabantha",
  "regionName": "Tabantha",
  "shrines": [
   {
    "name": "Akh Va'quot Shrine",
    "location": "In Rito Village itself, on a separate stone spire reached by the wooden bridge near the top of the village's spiraling walkway.",
    "category": "puzzle",
    "oneLine": "Trial of the Windmills: raise the metal sail-fans into the wind so the propellers spin and move platforms; ride them up to reach the monk.",
    "shrineQuest": null
   },
   {
    "name": "Sha Warvo Shrine",
    "location": "On Dronoc's Pass, the 'home' shrine of the Rito Flight Range, northwest of Rito Village past the Rito Stable path.",
    "category": "puzzle",
    "oneLine": "Path of Hidden Winds: paraglide above the floating fans to ride their updrafts up and across gaps; time your glides with the rotating walls.",
    "shrineQuest": null
   },
   {
    "name": "Tena Ko'sah Shrine",
    "location": "At the head of the Ancient Columns, southwest of the Tabantha Great Bridge, reached up through the Rayne Highlands.",
    "category": "combat",
    "oneLine": "A Major Test of Strength: defeat a Guardian Scout IV. Use the pillars to block its spin charge, then combo it while it's staggered.",
    "shrineQuest": null
   },
   {
    "name": "Kah Okeo Shrine",
    "location": "Far southwestern corner of the region, near the foot of the Rayne Highlands; the entrance sits beneath a movable stone platform.",
    "category": "puzzle",
    "oneLine": "Wind Guide: grab the Korok Leaf from the chest and fan the floating platforms across the wind currents to reach the monk.",
    "shrineQuest": null
   },
   {
    "name": "Voo Lota Shrine",
    "location": "At Warbler's Nest, directly west of Rito Village near Dragon Bone Mire; it rises from the ground once the quest is done.",
    "category": "quest",
    "oneLine": "Complete the shrine quest to reveal it: cook Salmon Meuniere, then have the Rito sisters sing on the pedestals in the order the song dictates.",
    "shrineQuest": "Recital at Warbler's Nest"
   },
   {
    "name": "Bareeda Naag Shrine",
    "location": "South of Rito Village at the base of Cuho Mountain, along the path from Rito Stable toward the Flight Range.",
    "category": "quest",
    "oneLine": "Learn the song (Bedoli then Laissa). At midday (~12:40) sun shines through a heart-shaped hole onto the pedestal; light a flame on it to reveal it.",
    "shrineQuest": "The Ancient Rito Song"
   }
  ]
 },
 {
  "regionKey": "hebra",
  "regionName": "Hebra",
  "shrines": [
   {
    "name": "Hia Miu Shrine",
    "location": "Far northwestern corner of the map, at the base of the Icefall Foothills",
    "category": "combat",
    "oneLine": "A Major Test of Strength vs a Guardian Scout IV. Dodge its melee for flurry rushes; ancient/strong weapons end it fast. Chest holds a Sapphire.",
    "shrineQuest": null
   },
   {
    "name": "Goma Asaagh Shrine",
    "location": "Behind ice chunks at the southwestern base of Hebra Peak",
    "category": "combat",
    "oneLine": "Major Test of Strength vs a Guardian Scout IV. Melt or smash the ice with fire/bombs to enter, then flurry-rush the scout.",
    "shrineQuest": null
   },
   {
    "name": "Mozo Shenno Shrine",
    "location": "Inside a small cave under the Biron Snowshelf, in the Hebra Mountains",
    "category": "combat",
    "oneLine": "Major Test of Strength vs a Guardian Scout IV. Revealed by the shrine quest 'The Bird in the Mountains' (talk to Molli at Rito Village first).",
    "shrineQuest": "The Bird in the Mountains"
   },
   {
    "name": "Qaza Tokki Shrine",
    "location": "In the center of the North Lomei Labyrinth, northeast of the Tabantha Tundra in the Hebra range",
    "category": "quest",
    "oneLine": "Solve the North Lomei Labyrinth maze to reach it; gliding from above makes navigation far easier. Grants Qaza Tokki's Blessing.",
    "shrineQuest": "Trial on the Cliff"
   },
   {
    "name": "Lanno Kooh Shrine",
    "location": "West of Hebra Tower, just north of the Hebra Plunge",
    "category": "blessing",
    "oneLine": "A free blessing shrine - just walk in and claim the Spirit Orb (and the bonus chest).",
    "shrineQuest": null
   },
   {
    "name": "To Quomo Shrine",
    "location": "Inside a cave at the center of the Hebra North Summit",
    "category": "blessing",
    "oneLine": "A blessing shrine; the work is reaching it through the freezing summit, not the puzzle. Grab the orb and bonus chest.",
    "shrineQuest": null
   },
   {
    "name": "Sha Gehma Shrine",
    "location": "Northern edge of the North Tabantha Snowfield, west of the North Lomei Labyrinth",
    "category": "puzzle",
    "oneLine": "'Shift and Lock' - rotate and lock the moving floor/wall sections to build a path across to the monk.",
    "shrineQuest": null
   },
   {
    "name": "Shada Naw Shrine",
    "location": "A few steps north of Selmie's Spot, high on the Hebra mountainside",
    "category": "puzzle",
    "oneLine": "Use Cryonis pillars on the water surfaces and Magnesis on metal to bridge the gaps and reach the altar.",
    "shrineQuest": null
   },
   {
    "name": "Rok Uwog Shrine",
    "location": "At the north end of Pikida Stonegrove",
    "category": "puzzle",
    "oneLine": "Roll the giant boulder onto pressure switches; line up the ball drops to open each gate in turn.",
    "shrineQuest": null
   },
   {
    "name": "Maka Rah Shrine",
    "location": "In a clifftop cavern near Lake Kilsie, northwest of Rito Village (enter via the cave under the cliff edge northeast of the lake's pier)",
    "category": "puzzle",
    "oneLine": "'Steady Thy Heart' - use Magnesis to steer the big spiked metal ball, smashing crates and clearing the path; grab the Diamond chest.",
    "shrineQuest": null
   },
   {
    "name": "Rin Oyaa Shrine",
    "location": "Northeast of Hebra Tower, hidden under a rock near Snowfield Stable",
    "category": "puzzle",
    "oneLine": "Use the water wheels and Magnesis to move the metal blocks/balls onto switches; redirect the flow to open the gates.",
    "shrineQuest": null
   },
   {
    "name": "Dunba Taag Shrine",
    "location": "In Tanagar Canyon, just southeast of Rito Stable, southwest of Hebra Tower",
    "category": "puzzle",
    "oneLine": "Use Stasis on the spinning cogwheel and on the stone ball/barrels (Stasis-golf) to whack them onto the switches and open each gate.",
    "shrineQuest": null
   },
   {
    "name": "Gee Ha'rah Shrine",
    "location": "Northwest of Hebra Tower, just south of Kopeeki Drifts",
    "category": "puzzle",
    "oneLine": "A pinwheel/maze puzzle - rotate the wind-powered wheels to spin the maze walls and roll the ball to its goal.",
    "shrineQuest": null
   }
  ]
 },
 {
  "regionKey": "woodland",
  "regionName": "Great Hyrule Forest",
  "shrines": [
   {
    "name": "Keo Ruug Shrine",
    "location": "At the base of the Great Deku Tree in Korok Forest, center of the Lost Woods.",
    "category": "puzzle",
    "oneLine": "Look to the stars: place each orb in the row matching how many times that constellation appears on the back wall (5-3-1-2, left to right).",
    "shrineQuest": null
   },
   {
    "name": "Mirro Shaz Shrine",
    "location": "Just east of Woodland Stable near Pico Pond, on the eastern fringe of the Great Hyrule Forest by the road.",
    "category": "puzzle",
    "oneLine": "Tempered Power: line up behind the orb, freeze it with Stasis, then whack it with a sledgehammer to launch it straight into the slot.",
    "shrineQuest": null
   },
   {
    "name": "Monya Toma Shrine",
    "location": "On Salari Hill on the western edge of the region, south of Serenne Stable.",
    "category": "puzzle",
    "oneLine": "Drawing Parabolas: shoot the crystal switch to aim the rotating launchers, then fire the orb through the arcing launchers into the caged receptacle.",
    "shrineQuest": null
   },
   {
    "name": "Daag Chokah Shrine",
    "location": "Northwest of Korok Forest in the Lost Woods, revealed after the shrine quest.",
    "category": "quest",
    "oneLine": "Finish The Lost Pilgrimage by stealth-following the Korok Oaki through the Lost Woods without being spotted; free orb inside, no puzzle.",
    "shrineQuest": "The Lost Pilgrimage"
   },
   {
    "name": "Maag Halan Shrine",
    "location": "In the Lost Woods east of Korok Forest, revealed after the shrine quest.",
    "category": "quest",
    "oneLine": "Complete The Test of Wood: cross the Lost Woods without breaking or unequipping the Forest Dweller's sword, shield, and bow; free orb inside.",
    "shrineQuest": "The Test of Wood"
   },
   {
    "name": "Kuhn Sidajj Shrine",
    "location": "On the shore of Lake Saria in the southwest of the Lost Woods, revealed after the shrine quest.",
    "category": "quest",
    "oneLine": "Solve Trial of Second Sight: follow the Ogre Trees (use Magnesis on the metal boulders) and return the chest to the island tree; free orb inside.",
    "shrineQuest": "Trial of Second Sight"
   },
   {
    "name": "Ketoh Wawai Shrine",
    "location": "Inside the pitch-dark Thyphlo Ruins, north of Korok Forest, revealed after the shrine quest.",
    "category": "quest",
    "oneLine": "Shrouded Shrine: light the bird statues with a torch to navigate, take the orb from the sleeping Hinox, set it on the pedestal; free orb inside.",
    "shrineQuest": "Shrouded Shrine"
   },
   {
    "name": "Rona Kachta Shrine",
    "location": "At the back of the Forgotten Temple in Tanagar Canyon, far western edge of the region.",
    "category": "blessing",
    "oneLine": "Survive the Guardian gauntlet through the Forgotten Temple to reach the shrine behind the Goddess Statue; free orb, no inner puzzle.",
    "shrineQuest": null
   }
  ]
 },
 {
  "regionKey": "eldin",
  "regionName": "Eldin",
  "shrines": [
   {
    "name": "Mo'a Keet Shrine",
    "location": "Atop a cliff just east of Foothill Stable, at the southern edge of Eldin Canyon.",
    "category": "puzzle",
    "oneLine": "Trial 'Metal Makes a Path'. Use Magnesis to slide the large metal blocks and build a bridge across the gaps to the monk.",
    "shrineQuest": null
   },
   {
    "name": "Sah Dahaj Shrine",
    "location": "Eldin Canyon, hidden in a gorge directly north of Cephla Lake, near the road up Death Mountain.",
    "category": "puzzle",
    "oneLine": "Trial 'Power of Fire'. Light the torch from the flame and use it past fire jets; the chest sits behind a bombable cracked wall.",
    "shrineQuest": null
   },
   {
    "name": "Daqa Koh Shrine",
    "location": "Off the Mountain Road to Death Mountain, east of Goron Hot Springs and shortly before the Bridge of Eldin.",
    "category": "puzzle",
    "oneLine": "Trial 'Stalled Flight'. Stand on the launching block and Stasis it the instant the connector links, holding the gate open to glide in.",
    "shrineQuest": null
   },
   {
    "name": "Qua Raym Shrine",
    "location": "On a small islet in Goronbi Lake, west of Eldin Tower (hidden behind a rock in the lake).",
    "category": "puzzle",
    "oneLine": "Trial 'A Balanced Approach'. Burn the crate on the scale to lift it, grab the key from the chest, then Magnesis the metal box.",
    "shrineQuest": null
   },
   {
    "name": "Shae Mo'sah Shrine",
    "location": "On a cliff in the northern part of Goron City, in Eldin Canyon.",
    "category": "puzzle",
    "oneLine": "Trial 'Swinging Flames'. Light a torch and ride the swinging and moving platforms to carry the flame and reach the monk.",
    "shrineQuest": null
   },
   {
    "name": "Shora Hah Shrine",
    "location": "Beneath the crab-shaped Isle of Rabac, reached by riding a mine cart from the Abandoned North Mine.",
    "category": "puzzle",
    "oneLine": "Trial 'Blue Flame'. Carry the blue flame across gusts and gaps to light the braziers; use moving platforms to cross.",
    "shrineQuest": null
   },
   {
    "name": "Kayra Mah Shrine",
    "location": "Revealed in the Abandoned North Mine area northeast of Goron City, dug out during the shrine quest.",
    "category": "quest",
    "oneLine": "Start 'A Brother's Roast' with Bladon in Goron City; bring Gonguron a grilled rock roast so he digs out the shrine.",
    "shrineQuest": "A Brother's Roast"
   },
   {
    "name": "Gorae Torr Shrine",
    "location": "Atop Gut Check Rock, north of Death Mountain in northeastern Eldin.",
    "category": "quest",
    "oneLine": "Win Bayge's Gut Check Challenge: climb Gut Check Rock in under 3 minutes collecting 100+ rupees. A free blessing waits inside.",
    "shrineQuest": "The Gut Check Challenge"
   },
   {
    "name": "Tah Muhl Shrine",
    "location": "Southwest of Foothill Stable, just north of Trilby Valley in Eldin Canyon (revealed via the quest).",
    "category": "quest",
    "oneLine": "Trial 'Passing the Flame'. Talk to Mayro about the stable painting, then stand where it was painted (south) to spot the shrine.",
    "shrineQuest": "A Landscape of a Stable"
   }
  ]
 },
 {
  "regionKey": "akkala",
  "regionName": "Akkala",
  "shrines": [
   {
    "name": "Dah Hesho Shrine",
    "location": "On a cliff south of Tarrey Town overlooking Lake Akkala, just east of Akkala Tower and near Great Fairy Mija's fountain",
    "category": "combat",
    "oneLine": "A Minor Test of Strength. Beat the Guardian Scout II; dodge its axe swings for a flurry rush, or stun it with shock/ice arrows.",
    "shrineQuest": null
   },
   {
    "name": "Ze Kasho Shrine",
    "location": "On a ridge above South Akkala Stable, central Akkala on the main road",
    "category": "puzzle",
    "oneLine": "Ze Kasho Apparatus. Use motion controls to tilt the platform so the floor spikes slide clear of your path, then cross the laser room.",
    "shrineQuest": null
   },
   {
    "name": "Katosa Aug Shrine",
    "location": "Just east of East Akkala Stable, near the eastern edge of the region",
    "category": "puzzle",
    "oneLine": "Katosa Aug Apparatus. Use motion controls to swing the putter/hammer so it knocks the Ancient Orb across into the concave receptacle.",
    "shrineQuest": null
   },
   {
    "name": "Ke'nai Shakah Shrine",
    "location": "In a cave on the southern cliffside facing Ulria Grotto, southeast Akkala; bomb the cracked rock to get in",
    "category": "combat",
    "oneLine": "A Modest Test of Strength. Bomb-arrow the cracked wall to enter, then beat the Guardian Scout III with flurry rushes and shock/ice arrows.",
    "shrineQuest": null
   },
   {
    "name": "Zuna Kai Shrine",
    "location": "Atop a tall stone pillar in the left 'eye' of Skull Lake, far north Akkala (revealed after the shrine quest)",
    "category": "quest",
    "oneLine": "Quest 'The Skull's Eye': get the tip from Jerrin, then climb or paraglide to the pillar in Skull Lake's left eye. Inside is a free blessing.",
    "shrineQuest": "The Skull's Eye"
   },
   {
    "name": "Ritaag Zumo Shrine",
    "location": "At the spiral tip of Rist Peninsula, far northeast Akkala coast (revealed after the shrine quest)",
    "category": "quest",
    "oneLine": "Quest 'Into the Vortex': carry the nearby Ancient Orb to the center of the Rist Peninsula spiral and set it in the pedestal. Free blessing inside.",
    "shrineQuest": "Into the Vortex"
   },
   {
    "name": "Tu Ka'loh Shrine",
    "location": "On Lomei Labyrinth Island, the maze island off the far northeast Akkala coast (revealed after the shrine quest)",
    "category": "quest",
    "oneLine": "Quest 'Trial of the Labyrinth': cross the Guardian-filled maze (fire-arrow the Malice eye) to the shrine; free blessing, plus a Barbarian Helm chest.",
    "shrineQuest": "Trial of the Labyrinth"
   },
   {
    "name": "Tutsuwa Nima Shrine",
    "location": "At the Spring of Power, central-east Akkala west of East Akkala Stable (revealed after the shrine quest)",
    "category": "mixed",
    "oneLine": "Quest 'The Spring of Power': offer a Shard of Dinraal's Scale at the spring to open it; inside is a Major Test of Strength vs a Guardian Scout IV.",
    "shrineQuest": "The Spring of Power"
   }
  ]
 },
 {
  "regionKey": "gerudo",
  "regionName": "Gerudo Highlands",
  "shrines": [
   {
    "name": "Sasa Kai Shrine",
    "location": "Gerudo Highlands, southeast of Gerudo Tower",
    "category": "combat",
    "oneLine": "Sign of the Shadow: talk to Kass atop Gerudo Tower, then between 3–4PM stand on the pedestal SE of the tower and shoot an arrow at the sun.",
    "shrineQuest": "Sign of the Shadow"
   },
   {
    "name": "Joloo Nah Shrine",
    "location": "Gerudo Highlands, buried on Mount Nabooru",
    "category": "puzzle",
    "oneLine": "Unearthed via the Test of Will quest. Inside, use motion controls to roll the cube and light every torch while dodging water spouts.",
    "shrineQuest": "Test of Will"
   },
   {
    "name": "Keeha Yoog Shrine",
    "location": "Gerudo Highlands, above Vatorsa Snowfield east of Gerudo Summit",
    "category": "blessing",
    "oneLine": "Cliffside Etchings: Geggle at Tabantha Bridge Stable points out a thunderbolt etching — ride the updraft and hit it with a Shock Arrow.",
    "shrineQuest": "Cliffside Etchings"
   },
   {
    "name": "Kema Kosassa Shrine",
    "location": "Gerudo Highlands, western end of Risoka Snowfield",
    "category": "combat",
    "oneLine": "A Major Test of Strength — a Guardian Scout IV rises from the floor. Bring strong weapons and cold protection (Snowquill).",
    "shrineQuest": null
   },
   {
    "name": "Kuh Takkar Shrine",
    "location": "Gerudo Highlands, Vatorsa Snowfield at the base of Laparoh Mesa",
    "category": "puzzle",
    "oneLine": "The shrine is sealed in ice — melt it with any fire (Fire Arrow, torch, red-Chuchu jelly), then solve the ice-block puzzle inside.",
    "shrineQuest": null
   },
   {
    "name": "Sho Dantu Shrine",
    "location": "Gerudo Highlands, along Karusa Valley",
    "category": "mixed",
    "oneLine": "A pedestal asks for a shining blue stone — break the nearby luminous-stone deposits and place a Luminous Stone on it to raise the shrine.",
    "shrineQuest": null
   }
  ]
 },
 {
  "regionKey": "wasteland",
  "regionName": "Gerudo Desert",
  "shrines": [
   {
    "name": "Daqo Chisay Shrine",
    "location": "Gerudo Desert, just outside the gate of Gerudo Town",
    "category": "puzzle",
    "oneLine": "The Whole Picture: use Magnesis to lift and slot the metal panels so the wall image lines up, opening the path.",
    "shrineQuest": null
   },
   {
    "name": "Kay Noh Shrine",
    "location": "Gerudo Desert, north of Gerudo Town near the Great Cliffs",
    "category": "puzzle",
    "oneLine": "Power of Electricity: chain the electrical orb and wires to power the gates and the launch mechanism to the altar.",
    "shrineQuest": null
   },
   {
    "name": "Jee Noh Shrine",
    "location": "Gerudo Desert, east of Gerudo Town near Daqa Koh",
    "category": "puzzle",
    "oneLine": "On the Move: ride the moving platforms, using Stasis and timing to cross the gaps to the chest and monk.",
    "shrineQuest": null
   },
   {
    "name": "Hawa Koth Shrine",
    "location": "Gerudo Desert, far southwest near the Great Fairy Fountain (Tera)",
    "category": "puzzle",
    "oneLine": "The Current Solution: route the rolling spheres and electric currents to power each gate in sequence.",
    "shrineQuest": null
   },
   {
    "name": "Misae Suma Shrine",
    "location": "Gerudo Desert, revealed inside Gerudo Town",
    "category": "blessing",
    "oneLine": "A free blessing unlocked by helping out in Gerudo Town (cure Pokki's stomach trouble) — finish the errand, then claim the orb.",
    "shrineQuest": null
   },
   {
    "name": "Raqa Zunzo Shrine",
    "location": "Gerudo Desert, far east near the East Gerudo Ruins",
    "category": "blessing",
    "oneLine": "Win the sand-seal race out on the eastern dunes (beat the target time) to reveal this blessing shrine.",
    "shrineQuest": null
   },
   {
    "name": "Dako Tah Shrine",
    "location": "Gerudo Desert, southwest near the Seven Heroines",
    "category": "quest",
    "oneLine": "Electric Path: revealed via The Eye of the Sandstorm (Nobiro, Kara Kara Bazaar). Inside, guide the moving electric orb to power the gates.",
    "shrineQuest": "The Eye of the Sandstorm"
   },
   {
    "name": "Korsh O'hu Shrine",
    "location": "Gerudo Desert, at the Seven Heroines statues",
    "category": "quest",
    "oneLine": "The Seven Heroines: read each statue's missing symbol and place the matching orbs on the correct pedestals.",
    "shrineQuest": "The Seven Heroines"
   },
   {
    "name": "Kema Zoos Shrine",
    "location": "Gerudo Desert, northwest by the Statue of the Eighth Heroine",
    "category": "puzzle",
    "oneLine": "A Delayed Puzzle: face the swordswomen statues' pointing direction and time the launch ramp/ball to reach the altar.",
    "shrineQuest": null
   },
   {
    "name": "Dila Maag Shrine",
    "location": "Gerudo Desert, center of the South Lomei Labyrinth (East Barrens)",
    "category": "quest",
    "oneLine": "The Desert Labyrinth: navigate the maze to its core for the blessing (the Barbarian Helm is nearby).",
    "shrineQuest": "The Desert Labyrinth"
   },
   {
    "name": "Suma Sahma Shrine",
    "location": "Gerudo Desert, southeast corner just south of Mount Granajh",
    "category": "quest",
    "oneLine": "Secret of the Snowy Peaks: read the Mountain Peak Log, then at ~4PM follow the cold shadow cast on the peak to dig out the shrine.",
    "shrineQuest": "Secret of the Snowy Peaks"
   },
   {
    "name": "Tho Kayu Shrine",
    "location": "Gerudo Desert, eastern dunes near the East Gerudo Ruins",
    "category": "puzzle",
    "oneLine": "Light all four unlit torches scattered around the buried site to make the shrine rise from the sand.",
    "shrineQuest": null
   }
  ]
 }
];
const TOWERS = [
 {
  "region": "Great Plateau",
  "name": "Great Plateau Tower",
  "location": "Center of the Great Plateau, just southeast of the Temple of Time. It's the first tower in the game and the one the Old Man points you to.",
  "climbTip": "No thorns or Malice here, so it's a pure stamina climb. Rest on the angled struts and ledges to refill your wheel, then paraglide off the top to spot the four shrines."
 },
 {
  "region": "Dueling Peaks",
  "name": "Dueling Peaks Tower",
  "location": "On the west bank of the Squabble River in West Necluda, just north of Dueling Peaks Stable, at the foot of the twin peaks.",
  "climbTip": "Climb the rock ledges at the base, then scale the lattice, resting on the horizontal beams to recover stamina. No Guardians here, so take a calm, staged climb; eat a stamina meal if you're low."
 },
 {
  "region": "Hateno",
  "name": "Hateno Tower",
  "location": "On a hill in central East Necluda, just northwest of Hateno Village and the road toward Fort Hateno.",
  "climbTip": "Base is wrapped in burnable thorny vines and guarded by Bokoblins/Moblins. Burn the thorns (fire arrow or a flame) and climb fast, since they regrow within minutes."
 },
 {
  "region": "Lanayru",
  "name": "Lanayru Tower",
  "location": "Rises out of the Lanayru Wetlands, north of Kakariko Village and east of the Dueling Peaks, on the road toward Zora's Domain",
  "climbTip": "The base sits in a nest of Lizalfos and Wizzrobes. Easiest approach: climb the ladder to the lookout platform northwest of the tower and paraglide across to a high face, skipping most enemies. Lizalfos sleep at night, so attempt it after dark. Rain makes the stone slippery, so bring climbing-boost food or rest on ledges."
 },
 {
  "region": "Lake Hylia",
  "name": "Lake Tower",
  "location": "On the small island in the middle of Lake Hylia, just north of the Bridge of Hylia in south-central Hyrule.",
  "climbTip": "The tower base sits in open water, so glide in or swim across from the Bridge of Hylia. No Malice or thorns here, but stamina matters: top up stamina food before the climb. From the top you can paraglide west toward Hylia Island to reach Ya Naga."
 },
 {
  "region": "Faron",
  "name": "Faron Tower",
  "location": "Rises from the Hill of Baltha, in the wooded highlands northeast of Lakeside Stable, overlooking the Faron rainforest and Calora Lake.",
  "climbTip": "The tower is wrapped in thorny vines that damage you on contact. Burn them off with a fire arrow or torch, or hop between the bare stone gaps, then climb. Bring stamina food; it is a tall climb in humid heat."
 },
 {
  "region": "Central Hyrule",
  "name": "Central Tower",
  "location": "On the edge of Hyrule Field just west of Hyrule Castle, in the open expanse near the Castle Town Ruins.",
  "climbTip": "Ringed by Decayed Guardians and patrolled by Guardian Stalkers that laser you mid-climb. Approach from the south/west using ruins as cover, climb fast, and clear or distract the Guardians (or wear climbing/Ancient gear) first."
 },
 {
  "region": "Hyrule Ridge",
  "name": "Ridgeland Tower",
  "location": "West-central Hyrule Ridge, set in a small lake; it faces east toward Thundra Plateau, west of the Central Tower region",
  "climbTip": "The base lake holds Electric Wizzrobes and Electric Lizalfos that can shock you off the wall, so clear or avoid them first; rubber armor or shock-resist food helps. Climb the inner struts to dodge obstacles and pace your stamina."
 },
 {
  "region": "Tabantha",
  "name": "Tabantha Tower",
  "location": "Atop Nero Hill in the Tabantha Frontier, northwest Hyrule, between Rito Village and the Hebra Mountains. Reach it up the snowy slope from the Tabantha Great Bridge.",
  "climbTip": "Malice covers the base and lower walls. Burn the Malice eyeball spikes near Nero Hill, then climb the clean stone above. Bring warm gear or spicy food for the cold."
 },
 {
  "region": "Hebra",
  "name": "Hebra Tower",
  "location": "Atop a rock spire in the Hebra Mountains, just southwest of Snowfield Stable / north of the Tabantha frontier, overlooking the frozen Hebra range",
  "climbTip": "Bitter cold up here, so wear cold-resist gear or sip a spicy elixir before you start. The tower itself is climbable, but the smart play is to glide in from the higher peaks to the south/west rather than climb up from the freezing valley floor."
 },
 {
  "region": "Great Hyrule Forest",
  "name": "Woodland Tower",
  "location": "In the swampy Military Training Camp, southeast of the Great Hyrule Forest and northeast of Hyrule Castle.",
  "climbTip": "Clear the Bokoblin/Moblin camp first. Approach from higher ground to the east, glide in, and avoid the malice-soaked swamp at the base that drains stamina."
 },
 {
  "region": "Eldin",
  "name": "Eldin Tower",
  "location": "Eldin Canyon, atop a rocky peak south of Death Mountain and north of Foothill Stable, overlooking the lava fields of the canyon.",
  "climbTip": "No puzzle to solve, but the base sits in a lava field, so cross the rock bridges to reach it and rest on the platforms to refill stamina. The area is extreme heat, so wear Flamebreaker gear or drink a Fireproof Elixir before climbing."
 },
 {
  "region": "Akkala",
  "name": "Akkala Tower",
  "location": "Central Akkala, on a rock spire rising from a Malice-soaked pool in the Akkala Wilds, not far north of South Akkala Stable, ringed by Guardians",
  "climbTip": "The base sits in a Malice bog patrolled by Guardians. Approach from a rim with rock cover, dodge the beams, then climb a Malice-free face of the spire. Bring stamina food."
 },
 {
  "region": "Gerudo Highlands",
  "name": "Gerudo Tower",
  "location": "On a tall spire in the Gerudo Highlands northeast of Gerudo Town, its base wrapped in thorns.",
  "climbTip": "Burn the thorns at the base (Fire Arrow, torch, or a Bomb) before climbing, or paraglide in from the higher cliffs to the east."
 },
 {
  "region": "Gerudo Desert",
  "name": "Wasteland Tower",
  "location": "On a rock spire in the Gerudo Desert, northwest of Divine Beast Vah Naboris, northeast of Gerudo Town and southwest of the Gerudo Great Skeleton.",
  "climbTip": "Climb at night to avoid daytime heat damage, or wear Gerudo/heat-resist gear; bring stamina food since the spire is tall. Watch for hazards below."
 }
];
const GREAT_FAIRIES = [
 {
  "name": "Cotera",
  "region": "Dueling Peaks",
  "location": "In the woods northeast of Kakariko Village (behind/up the path past Ta'loh Naeg Shrine), inside a giant flower bud.",
  "cost": "100 rupees to open the bud the first time. Talk to Pikango first ('Find the Fairy Fountain') to learn her location."
 },
 {
  "name": "Kaysa",
  "region": "Tabantha",
  "location": "On Piper Ridge, a ridge south of Nero Hill / Tabantha Tower in the Tabantha Frontier. Paraglide south from the top of Tabantha Tower to spot the flower bud below.",
  "cost": "A Rupee offering that scales with how many Great Fairies you've already freed: 100, then 500, then 1,000, then 10,000 Rupees."
 },
 {
  "name": "Mija",
  "region": "Akkala",
  "location": "In a colorful tree grove on a cliff just east/south of Akkala Tower, near Dah Hesho Shrine overlooking Lake Akkala",
  "cost": "Costs rupees by unlock order across all four fairies (100, then 500, then 1,000, then 10,000); unlocking her enables higher armor upgrade tiers"
 },
 {
  "name": "Tera",
  "region": "Gerudo Desert",
  "location": "Inside the rib cage of the Gerudo Great Skeleton at Dragon's Exile, far southwest corner of the Gerudo Desert, right next to Hawa Koth Shrine.",
  "cost": "Up to 10,000 Rupees (the price scales with how many fairies you've already freed; Tera demands 10,000 if she is your fourth and last)."
 }
];
const SIDE_QUESTS = [
 {
  "region": "Great Plateau",
  "quests": [
   {
    "name": "The Old Man's Diary (Warm Doublet)",
    "giver": "The Old Man, via his diary in the Woodcutter's House near the Forest of Spirits",
    "reward": "Warm Doublet (cold-resistance armor)",
    "oneLine": "Read his diary, then cook the dish he forgot: Spicy Meat and Seafood Fry (Raw Meat + Spicy Pepper + Hyrule Bass), and he'll reward you."
   }
  ]
 },
 {
  "region": "Dueling Peaks",
  "quests": [
   {
    "name": "The Stolen Heirloom",
    "giver": "Paya / Dorian (Kakariko Village)",
    "reward": "Lakna Rokee Shrine (Spirit Orb)",
    "oneLine": "Investigate the theft of the Sheikah heirloom from Impa's house, tail Dorian at night, and recover the orb — this reveals Lakna Rokee Shrine."
   },
   {
    "name": "Watch Out for the Flowers",
    "giver": "Magda (Floret Sandbar)",
    "reward": "Hila Rao Shrine (Spirit Orb)",
    "oneLine": "Cross Magda's flower field to the shrine without stepping on a single bloom, or she turns hostile — this reveals Hila Rao Shrine."
   },
   {
    "name": "Find the Fairy Fountain",
    "giver": "Pikango (Kakariko Village)",
    "reward": "Reveals Cotera's location; Pikango then offers shrine location hints",
    "oneLine": "Help the traveling painter find the nearby Great Fairy Fountain northeast of Kakariko to awaken Cotera; afterward he gives shrine-photo hints."
   },
   {
    "name": "By Firefly's Light",
    "giver": "Lasli (Kakariko Village, at night)",
    "reward": "Rupees",
    "oneLine": "Catch and deliver 5 Sunset Fireflies to Lasli, who misses chasing them at night."
   },
   {
    "name": "Cucco Conundrum",
    "giver": "Cado (Kakariko Village)",
    "reward": "Rupees",
    "oneLine": "Round up Cado's escaped Cuccos and return all 10 to the pen near the chief's house."
   }
  ]
 },
 {
  "region": "Hateno",
  "quests": [
   {
    "name": "The Statue's Bargain",
    "giver": "Teebo (boy in Hateno Village; Horned Statue on the village outskirts)",
    "reward": "Ability to swap hearts/stamina (net 20-rupee fee per swap)",
    "oneLine": "Pray to the Horned Statue to sell back a Heart Container or Stamina Vessel for 100 rupees, then rebuy for 120 to re-spec hearts vs stamina."
   },
   {
    "name": "The Sheep Rustlers",
    "giver": "Koyin (sheep keeper at Hateno Pasture)",
    "reward": "10 bottles of Fresh Milk",
    "oneLine": "Clear the Bokoblins menacing the herd, then drive the three loose sheep back into the pen at Hateno Pasture before time runs out."
   },
   {
    "name": "The Weapon Connoisseur",
    "giver": "Nebb (boy in Hateno Village)",
    "reward": "Rupees per weapon, plus a Diamond on completion",
    "oneLine": "Long quest: show Nebb 8 specific named weapons (Soldier's Broadsword, Knight's gear, etc.) one at a time over many visits."
   },
   {
    "name": "A Gift for My Beloved",
    "giver": "Manny (boy near the inn in Hateno Village)",
    "reward": "Rupees",
    "oneLine": "Find out innkeeper Prima's favorite drink for the lovestruck Manny, then bring her the right gift to win her over."
   },
   {
    "name": "Slated for Upgrades",
    "giver": "Purah (Hateno Ancient Tech Lab)",
    "reward": "Sheikah Slate rune upgrades",
    "oneLine": "After the lab is powered (Locked Mementos), bring Purah ancient materials and she powers up your Sheikah Slate runes (sensor, camera, etc.)."
   },
   {
    "name": "Robbie's Research",
    "giver": "Purah (Hateno Ancient Tech Lab; sends you to Robbie at Akkala)",
    "reward": "3 Ancient Arrows and access to Akkala Tech Lab research",
    "oneLine": "Purah sends you to find Robbie at the Akkala Ancient Tech Lab; show him your scars to prove who you are and unlock ancient-tech crafting."
   }
  ]
 },
 {
  "region": "Lanayru",
  "quests": [
   {
    "name": "Frog Catching",
    "giver": "Tumbo (Zora child near the inn and general store, Zora's Domain)",
    "reward": "Armoranth",
    "oneLine": "Bring Tumbo five Hot-Footed Frogs caught around the Domain's pools and waterfalls."
   },
   {
    "name": "Luminous Stone Gathering",
    "giver": "Ledo (Zora at the entrance just past the bridge into Zora's Domain)",
    "reward": "Diamonds (2 for the first 10 stones, then 1 per 10)",
    "oneLine": "Mine Luminous Stones from nearby cliffs and hand them to Ledo in batches of ten."
   },
   {
    "name": "Lynel Safari",
    "giver": "Laflat (by the bridge at the eastern end of Zora's Domain)",
    "reward": "Rupees",
    "oneLine": "Sneak a photo of the Lynel roaming Ploymus Mountain with the camera rune and bring it back to Laflat."
   },
   {
    "name": "Diving is Beauty!",
    "giver": "Gruve (Zora on an upper level by a waterfall in Zora's Domain)",
    "reward": "5 Fleet-Lotus Seeds",
    "oneLine": "Perform a beautiful dive off the high platform into the water below, then report to Gruve."
   },
   {
    "name": "Zora Stone Monuments",
    "giver": "Jiahto (Zora historian on the floor below the throne room, Zora's Domain)",
    "reward": "Diamond (on completion)",
    "oneLine": "Read all ten Zora Stone Monuments scattered around Zora's Domain and Vah Ruta's region, then report back to Jiahto."
   }
  ]
 },
 {
  "region": "Lake Hylia",
  "quests": [
   {
    "name": "The Horseback Hoodlums",
    "giver": "Perosa (Highland Stable)",
    "reward": "Endura Carrot",
    "oneLine": "Perosa asks you to drive off the Blue Bokoblins riding horses around the stable; defeat the five mounted Bokoblins on Fural Plain."
   },
   {
    "name": "The Serpent's Jaws",
    "giver": "Kass (in the Pagos Woods near the Spring of Courage)",
    "reward": "Access to Shae Katha Shrine (Thunderspear chest + Spirit Orb)",
    "oneLine": "Solve Kass's verse: drop a Farosh's Scale into the Spring of Courage to open the door behind the Goddess Statue to Shae Katha."
   },
   {
    "name": "Guardian Slideshow",
    "giver": "Loone (Puffer Beach)",
    "reward": "Access to Shoqa Tatone Shrine (Spirit Orb)",
    "oneLine": "Photograph three Guardian types (Scout, Skywatcher, Stalker) for Loone; she gives you her orb 'Roscoe' to raise Shoqa Tatone Shrine."
   }
  ]
 },
 {
  "region": "Faron",
  "quests": [
   {
    "name": "Thunder Magnet",
    "giver": "Cima, at Lakeside Stable",
    "reward": "Rubber Helm",
    "oneLine": "Lightning keeps hitting the stable. Climb to the roof and use Magnesis to pull out the metal Woodcutter's Axe lodged in the wooden horse head."
   },
   {
    "name": "Take Back the Sea",
    "giver": "Sebasto, in Lurelin Village",
    "reward": "Silver Rupee",
    "oneLine": "Monsters have overrun Aris Beach east of the village. Clear out every enemy in the stronghold there, then report back to Sebasto."
   },
   {
    "name": "The Hero's Cache",
    "giver": "Kass, on a stone pillar at Kitano Bay (east Faron coast)",
    "reward": "Gold Rupee",
    "oneLine": "Solve Kass's riddle '17 of 24': at 5 PM the pillar's shadow points to a chest in the water. Pull it up with Magnesis to claim the cache."
   }
  ]
 },
 {
  "region": "Central Hyrule",
  "quests": [
   {
    "name": "The Royal White Stallion",
    "giver": "Toffa at Outskirt Stable",
    "reward": "Royal Saddle and Royal Bridle",
    "oneLine": "Tame the pure-white royal horse roaming near Safula Hill and register it at the stable to claim the royal gear."
   },
   {
    "name": "My Hero",
    "giver": "Aliza, standing under the trees across the road from Outskirt Stable",
    "reward": "Star Fragment",
    "oneLine": "Show Aliza the Master Sword (you must already have pulled it) to prove you are the hero she's waiting for."
   },
   {
    "name": "A Rare Find",
    "giver": "Trott at Outskirt Stable",
    "reward": "Silver Rupee (300 rupees)",
    "oneLine": "Trott is sick of vegetarian meals; bring him fresh Raw Gourmet Meat (from Hebra/Gerudo wildlife) for his reward."
   },
   {
    "name": "A Royal Recipe",
    "giver": "Gotter at Riverside Stable",
    "reward": "Silver Rupee (300 rupees); a second cake earns another",
    "oneLine": "Cook the royal kitchen's Fruitcake (or Monster Cake) and bring it to Gotter; the recipes are in Hyrule Castle's library."
   },
   {
    "name": "The Royal Guard's Gear",
    "giver": "Parcy at Riverside Stable",
    "reward": "300 Rupees",
    "oneLine": "Parcy wants to see Royal Guard equipment; retrieve any Royal Guard armor piece from Hyrule Castle and show it to her."
   }
  ]
 },
 {
  "region": "Hyrule Ridge",
  "quests": [
   {
    "name": "A Gift for the Great Fairy",
    "giver": "Toren, at Tabantha Bridge Stable",
    "reward": "Access to Great Fairy Kaysa's fountain (armor upgrades)",
    "oneLine": "Toren hands you his 500-rupee life savings to wake the Great Fairy; carry it southwest to Kaysa's fountain on Piper Ridge and pay her to open it."
   },
   {
    "name": "Misko, the Great Bandit",
    "giver": "Domidak and Prissen at Dueling Peaks Stable",
    "reward": "Misko's hidden treasure (rupees and gear)",
    "oneLine": "Started at Dueling Peaks Stable, but the clue points to ruined pillars where Rayne, Piper, and Tanagar meet in Hyrule Ridge - dig there for the stash."
   }
  ]
 },
 {
  "region": "Tabantha",
  "quests": [
   {
    "name": "A Gift for the Great Fairy",
    "giver": "Toren, at Tabantha Bridge Stable",
    "reward": "The revived Great Fairy Fountain (you keep the 500 Rupees if Kaysa is already free)",
    "oneLine": "Toren gives you 500 Rupees to offer Great Fairy Kaysa; find her fountain on Piper Ridge south of Tabantha Tower and revive her."
   },
   {
    "name": "The Spark of Romance",
    "giver": "Jogo, in Rito Village",
    "reward": "Purple Rupee (50 Rupees)",
    "oneLine": "Bring Jogo a piece of flint so he can light a fire and bake apples for his wife."
   },
   {
    "name": "The Apple of My Eye",
    "giver": "Juney, in Rito Village",
    "reward": "Mighty Bananas",
    "oneLine": "Cook and deliver a Baked Apple to Juney so she can keep up her offering at the Goddess statue."
   },
   {
    "name": "Find Kheel",
    "giver": "Amali, in Rito Village",
    "reward": "Rupees; also unlocks the Recital at Warbler's Nest shrine quest",
    "oneLine": "Track down Amali's missing daughter Kheel; she has flown off to Warbler's Nest with her sisters."
   },
   {
    "name": "Face the Frost Talus",
    "giver": "Gesane, in Rito Village",
    "reward": "Purple Rupee (50 Rupees)",
    "oneLine": "Defeat the Frost Talus out in the Hebra/Tabantha mountains, then report back to Gesane."
   }
  ]
 },
 {
  "region": "Hebra",
  "quests": [
   {
    "name": "Stalhorse: Pictured!",
    "giver": "Juannelle (Snowfield Stable)",
    "reward": "Silver Rupee (100 Rupees)",
    "oneLine": "Photograph a Stalhorse - they appear at night in the North Tabantha Snowfield - then show Juannelle the picture."
   },
   {
    "name": "Snowball Bowling",
    "giver": "Pondo (Pondo's Lodge, northeast of Hebra Tower)",
    "reward": "Blizzard Rod for a first-throw strike (Gold Rupee on later strikes/full inventory)",
    "oneLine": "Pay 20 rupees to roll a giant snowball down the slope at the totem 'pins'; a first-ball strike is the goal."
   }
  ]
 },
 {
  "region": "Great Hyrule Forest",
  "quests": [
   {
    "name": "The Korok Trials",
    "giver": "Chio (Great Deku Tree, Korok Forest)",
    "reward": "3 Big Hearty Truffles",
    "oneLine": "Chio asks you to clear three forest shrine quests: Trial of Second Sight, The Lost Pilgrimage, and The Test of Wood."
   },
   {
    "name": "Riddles of Hyrule",
    "giver": "Walton (asleep atop the Great Deku Tree, Korok Forest)",
    "reward": "A Diamond (after all five riddles)",
    "oneLine": "Solve Walton's five riddles by dropping the right item on the leaf before him: apple, fortified pumpkin, sunshroom, voltfin trout, Lynel hoof."
   }
  ]
 },
 {
  "region": "Eldin",
  "quests": [
   {
    "name": "Fireproof Lizard Roundup",
    "giver": "Kima (Southern Mine, southwest of Goron City)",
    "reward": "Flamebreaker Armor (the chest piece of the heat-resistant set)",
    "oneLine": "Catch and deliver 10 Fireproof Lizards to Kima to help the injured miners; he takes them in batches."
   },
   {
    "name": "The Road to Respect",
    "giver": "Fugo (Goron City)",
    "reward": "100 Rupees (plus the gems the Igneo Talus drops)",
    "oneLine": "Defeat the Igneo Talus at Darunia Lake that the blacksmith's apprentice Fugo couldn't beat, then report back to him."
   },
   {
    "name": "Death Mountain's Secret",
    "giver": "Dugby (Goron Hot Springs, daytime)",
    "reward": "A Drillshaft",
    "oneLine": "Find Dugby's hidden weapon along the path to the Bridge of Eldin, behind a bombable cracked wall above the lava falls."
   },
   {
    "name": "The Jewel Trade",
    "giver": "Ramella (Goron City)",
    "reward": "Amber Earrings (jewelry that boosts defense)",
    "oneLine": "Bring the gem collector Ramella 10 pieces of Amber while she tours Goron City."
   }
  ]
 },
 {
  "region": "Akkala",
  "quests": [
   {
    "name": "From the Ground Up",
    "giver": "Hudson (Bolson Construction; met during 'Hylian Homeowner' in Hateno, then sent to Akkala)",
    "reward": "Builds Tarrey Town (general store, dye shop, ongoing supplies) and a wedding scene",
    "oneLine": "Send Hudson to Akkala, then recruit residents whose names end in 'son' to build Tarrey Town from scratch around the lakeside."
   },
   {
    "name": "The Spring of Power",
    "giver": "Nobo at East Akkala Stable",
    "reward": "Reveals Tutsuwa Nima Shrine",
    "oneLine": "Take the legend to the Spring of Power and offer a Shard of Dinraal's Scale to the goddess statue to reveal Tutsuwa Nima Shrine."
   },
   {
    "name": "The Skull's Eye",
    "giver": "Jerrin at the Akkala Ancient Tech Lab",
    "reward": "Reveals Zuna Kai Shrine",
    "oneLine": "Reach the Ancient Shrine atop the pillar in Skull Lake's left eye to reveal Zuna Kai Shrine."
   },
   {
    "name": "Into the Vortex",
    "giver": "Stone tablet at the base of Rist Peninsula (auto-logged when read)",
    "reward": "Reveals Ritaag Zumo Shrine",
    "oneLine": "Carry the nearby Ancient Orb to the center of the Rist Peninsula spiral and place it to make Ritaag Zumo Shrine rise."
   },
   {
    "name": "Trial of the Labyrinth",
    "giver": "Auto-logged on reaching Lomei Labyrinth Island",
    "reward": "Reveals Tu Ka'loh Shrine; Barbarian Helm in the shrine chest",
    "oneLine": "Navigate the Guardian-filled northeast maze and burn the Malice eye to reach Tu Ka'loh Shrine; a Barbarian Helm chest sits inside the shrine."
   }
  ]
 },
 {
  "region": "Gerudo Desert",
  "quests": [
   {
    "name": "The Search for Barta",
    "giver": "Liana (Gerudo Town barracks)",
    "reward": "Counts toward the Thunder Helm",
    "oneLine": "Find the missing guard Barta, hiding near the Gerudo Great Skeleton, and report back to Liana."
   },
   {
    "name": "Tools of the Trade",
    "giver": "Isha (Gerudo Town jewelry shop)",
    "reward": "Reopens the jewelry shop; counts toward the Thunder Helm",
    "oneLine": "Bring Isha 10 Flint so she can get her jewelry stand running again."
   },
   {
    "name": "Medicinal Molduga",
    "giver": "Malena (Gerudo Town soldier training courtyard)",
    "reward": "Gold Rupee; counts toward the Thunder Helm",
    "oneLine": "Bring Malena Molduga Guts to treat her sick husband; fight the Molduga from a rock or ledge with bombs."
   },
   {
    "name": "The Mystery Polluter",
    "giver": "Dalia (Gerudo Town)",
    "reward": "Counts toward the Thunder Helm",
    "oneLine": "Follow the trail of Hydromelon rinds to Calyban on the wall by the water, who is polluting Dalia's garden, and get her to stop."
   },
   {
    "name": "The Secret Club's Secret",
    "giver": "Begins on trying to enter the Gerudo Secret Club (Greta's shop)",
    "reward": "Access to the Gerudo Secret Club (sells Desert Voe and Radiant sets)",
    "oneLine": "Eavesdrop at The Noble Canteen to learn the password 'GSC' (plus a diamond) and gain entry. Optional; not needed for the Thunder Helm."
   },
   {
    "name": "The Thunder Helm",
    "giver": "Chief Riju (Gerudo Town palace)",
    "reward": "Thunder Helm (lightning immunity)",
    "oneLine": "Complete the four Gerudo Town favors (Barta, Tools of the Trade, Medicinal Molduga, Mystery Polluter), then Riju lends you the Thunder Helm."
   },
   {
    "name": "The Eighth Heroine",
    "giver": "Bozai (outside Gerudo Town's gate, near Daqo Chisay Shrine)",
    "reward": "Sand Boots (faster movement on sand)",
    "oneLine": "Wearing the Gerudo outfit, photograph the Statue of the Eighth Heroine in the snowy Gerudo Highlands for Bozai. He lends Snow Boots to help."
   },
   {
    "name": "The Forgotten Sword",
    "giver": "Bozai (Gerudo Town, follow-up after The Eighth Heroine)",
    "reward": "Snow Boots (faster movement on snow)",
    "oneLine": "After The Eighth Heroine, find the heroine's missing sword on the snowfield near her statue and report back to Bozai."
   }
  ]
 }
];
const ARMOR = {
 "sets": [
  {
   "name": "Champion's Tunic",
   "pieces": "1 (body only)",
   "where": "Given by Impa in Kakariko Village after recovering your first memory (Captured Memories); the blue tunic Zelda made for Link.",
   "bonus": "No set bonus. Unique effect: displays exact enemy HP numbers when equipped. Strong base defense (highest single piece when fully upgraded).",
   "upgrade": "Silver/Gold Lynel parts at higher stars (Lynel Hoof, Horn, Guts) plus rupees. No matching pieces, so it never grants a set bonus.",
   "priority": "mid"
  },
  {
   "name": "Hylian Set",
   "pieces": "3 (Hood, Tunic, Trousers)",
   "where": "Bought cheaply early on. Tunic/Trousers from Enchanted (Kakariko) and Ventest Clothing Boutique (Hateno); the Hood from those same armor shops.",
   "bonus": "No set bonus. Just solid, cheap all-around defense for beginners. The Hood gives no environmental resistance, only defense.",
   "upgrade": "Bokoblin parts (Bokoblin Horn, Fang, Guts) at low tiers, the most common monster drops, so very easy to upgrade.",
   "priority": "beginner"
  },
  {
   "name": "Soldier's Set",
   "pieces": "3 (Helm, Armor, Greaves)",
   "where": "Bought at Ventest Clothing Boutique in Hateno Village; a step up in defense from Hylian. (Not sold at the Kakariko shop.)",
   "bonus": "No set bonus. Higher base defense than Hylian for mid-game survivability.",
   "upgrade": "Chuchu Jelly and Bokoblin Guts at low tiers, then Keese/Moblin and Lizalfos/Lynel parts at higher tiers.",
   "priority": "mid"
  },
  {
   "name": "Climbing Set (Climber's Bandanna + Climbing Gear)",
   "pieces": "3 (Climber's Bandanna, Climbing Gear, Climbing Boots)",
   "where": "Bandanna in a chest in Ree Dahee Shrine (Dueling Peaks); Gear in Chaas Qeta Shrine (SE off the coast); Boots in Tahno O'ah Shrine (eastern Mount Lanayru, Hateno region).",
   "bonus": "Each piece gives Climbing Speed Up (faster scaling). Set bonus Climbing Jump Stamina Up (at 2 stars) cuts the stamina cost of jumping while climbing.",
   "upgrade": "Keese parts plus Hightail Lizards / Hot-Footed Frogs (speed-themed materials).",
   "priority": "beginner"
  },
  {
   "name": "Stealth Set (Sheikah)",
   "pieces": "3 (Stealth Mask, Stealth Chest Guard, Stealth Tights)",
   "where": "Bought from Enchanted in Kakariko Village.",
   "bonus": "Each piece gives Stealth Up (quieter, harder for enemies to notice). Set bonus Night Speed Up (at 2 stars).",
   "upgrade": "Sneaky River Snails, Sunset Fireflies, and Rushrooms (stealth/night-themed materials).",
   "priority": "mid"
  },
  {
   "name": "Snowquill Set",
   "pieces": "3 (Headdress, Tunic, Trousers)",
   "where": "Bought from the Brazen Beak armor shop in Rito Village.",
   "bonus": "Each piece gives 1 level Cold Resistance. Set bonus Unfreezable (at 2 stars) — immune to being frozen.",
   "upgrade": "Cold-themed parts: Cold Darner, Winterwing Butterfly, and Ice Keese Wings.",
   "priority": "beginner"
  },
  {
   "name": "Flamebreaker Set",
   "pieces": "3 (Helm, Armor, Boots)",
   "where": "Helm, Armor, and Boots can be bought at Ripped and Shredded in Goron City; the Armor can alternatively be earned by trading 10 Fireproof Lizards to Kima at the Southern Mine (Fireproof Lizard Roundup).",
   "bonus": "Each piece grants Flame Guard (resist burning/lava heat). Set bonus Fireproof (at 2 stars) — no damage from open flame.",
   "upgrade": "Fire-themed parts: Fireproof Lizards, Smotherwing Butterflies, and Flame Keese Wings.",
   "priority": "mid"
  },
  {
   "name": "Desert Voe Set",
   "pieces": "3 (Headband, Spaulder, Trousers)",
   "where": "Bought from the armor shop in Gerudo Town, or from Rhondson once she moves to Tarrey Town.",
   "bonus": "Each piece gives 1 level Heat Resistance (desert daytime). Set bonus Shock Resistance Up (at 2 stars) — reduces electric damage, but NOT full immunity.",
   "upgrade": "Voltfin Trout, Voltfruit, and Electric Lizalfos parts (electricity-themed).",
   "priority": "mid"
  },
  {
   "name": "Gerudo Set (Vai Outfit)",
   "pieces": "3 (Veil, Top, Sirwal)",
   "where": "Bought from Vilia atop the cliffs at Kara Kara Bazaar for 600 rupees — required to enter Gerudo Town as a 'vai'.",
   "bonus": "Each piece gives 1 level Heat Resistance. Set bonus Unfreezable (at 2 stars). Main draw: grants access to Gerudo Town.",
   "upgrade": "Heat-themed parts: Hightail Lizard, Warm Darner, and Sand Cicada.",
   "priority": "beginner"
  },
  {
   "name": "Zora Set",
   "pieces": "3 (Helm, Armor, Greaves)",
   "where": "Armor from King Dorephan during the Vah Ruta quest at Zora's Domain; Helm in a sunken chest at Toto Lake; Greaves reward for the Lynel Safari side quest.",
   "bonus": "Each piece gives Swim Speed Up; Zora Armor also lets you swim up waterfalls. Set bonus Swim Dash Stamina Up (at 2 stars) — cheaper swim-dashing.",
   "upgrade": "Lizalfos parts (Lizalfos Tail, Talon, Horn) and Hyrule Bass — aquatic/lizard-themed.",
   "priority": "mid"
  },
  {
   "name": "Rubber Set",
   "pieces": "3 (Helm, Armor, Tights)",
   "where": "Found in shrine chests scattered across Hyrule (e.g. Toto Sah, Daka Tuss, Sasa Kai). No single shop.",
   "bonus": "Each piece gives Shock Resistance. Set bonus Unshockable (at 2 stars) — full immunity to electric damage, including thunderstorm lightning.",
   "upgrade": "Electricity-themed: Yellow Chuchu Jelly, Electric Keese Wings, and Electric Lizalfos Tails.",
   "priority": "mid"
  },
  {
   "name": "Radiant Set",
   "pieces": "3 (Mask, Shirt, Tights)",
   "where": "Bought from the Gerudo Secret Club in Gerudo Town after The Secret Club's Secret quest; each piece also costs Luminous Stones plus rupees.",
   "bonus": "Set bonus (at 2 stars) Disguise (Stal-types ignore you) plus Bone Atk. Up (boosts bone/Stal-type weapon damage). Glows in the dark.",
   "upgrade": "Luminous Stones and Stal parts (Stalkoblin/Stalizalfos bones).",
   "priority": "late"
  },
  {
   "name": "Barbarian Set",
   "pieces": "3 (Helm, Armor, Leg Wraps)",
   "where": "Each piece is a reward from a shrine inside a Labyrinth: Tu Ka'loh (Lomei Labyrinth Island), Dako Tah (South Lomei Labyrinth), Qaza Tokki (North Lomei Labyrinth).",
   "bonus": "Each piece gives Attack Up. Set bonus Charge Attack Stamina Up (at 2 stars) — cheaper spin/charge attacks.",
   "upgrade": "Lynel parts (Hoof, Horn, Guts) — mid-to-high tiers need Lynel materials.",
   "priority": "late"
  },
  {
   "name": "Ancient Set",
   "pieces": "3 (Helm, Cuirass, Greaves)",
   "where": "Bought from Cherry (the shop terminal) at the Akkala Ancient Tech Lab, after lighting the lab's furnace. Costs rupees + Ancient Materials.",
   "bonus": "Each piece gives Guardian Resist Up (less damage from Guardians/ancient weapons). Set bonus Ancient Proficiency (at 2 stars) — +80% damage with ancient and Guardian weapons (not the Master Sword).",
   "upgrade": "Ancient parts: Ancient Screws, Springs, Gears, Shafts, Cores, and a Giant Ancient Core at the top tier.",
   "priority": "late"
  },
  {
   "name": "Royal Guard Set",
   "pieces": "3 (Cap, Uniform, Boots)",
   "where": "The Champions' Ballad DLC. Pieces found in chests via the EX Royal Guard Rumors side quest (in/around Hyrule Castle).",
   "bonus": "Set bonus Charge Attack Stamina Up. Low base defense (4 per piece). Cannot be upgraded by a Great Fairy and cannot be dyed.",
   "upgrade": "None — this set cannot be enhanced at a Great Fairy Fountain.",
   "priority": "late"
  },
  {
   "name": "Wild Set (amiibo)",
   "pieces": "3 (Cap of the Wild, Tunic of the Wild, Trousers of the Wild)",
   "where": "Obtained via amiibo (the BotW Link amiibo / 30th Anniversary line); the classic green hero look.",
   "bonus": "Set bonus Master Sword Beam Up (at 2 stars) — boosts the Master Sword's energy beam at full health. Each piece is high defense.",
   "upgrade": "Star Fragments and Lynel parts (Silver/Gold Lynel Horn, Hoof, Guts) at the higher tiers.",
   "priority": "late"
  }
 ]
};
const BESTIARY = {
 "enemies": [
  {
   "name": "Bokoblin",
   "tier": "common",
   "tactic": "Sneakstrike from behind for a one-shot, or aim a charged arrow at the head; a parried club leaves it open to combos.",
   "drops": "Bokoblin Horn, Bokoblin Fang, Bokoblin Guts"
  },
  {
   "name": "Moblin",
   "tier": "common",
   "tactic": "Bigger Bokoblin: dodge its wide swing, then backstab, or whittle it with arrows; a sneakstrike still helps but won't one-shot stronger ones.",
   "drops": "Moblin Horn, Moblin Fang, Moblin Guts"
  },
  {
   "name": "Lizalfos",
   "tier": "common",
   "tactic": "They strafe and leap, so bait an attack then flurry-rush; headshot arrows stagger them and elemental arrows counter their element.",
   "drops": "Lizalfos Horn, Lizalfos Talon, Lizalfos Tail"
  },
  {
   "name": "Chuchu (elemental)",
   "tier": "common",
   "tactic": "Hit Fire Chuchu with ice (and vice versa) or just smack it; killing an elemental one leaves jelly you can throw to freeze, burn, or shock foes.",
   "drops": "Chuchu Jelly; elemental ones drop Red/White/Yellow Chuchu Jelly"
  },
  {
   "name": "Keese",
   "tier": "common",
   "tactic": "Swat with any melee swing or a single arrow; elemental Keese are quenched by their opposite element and their wings/eyeballs are crafting loot.",
   "drops": "Keese Wing, Keese Eyeball"
  },
  {
   "name": "Octorok",
   "tier": "common",
   "tactic": "They snipe from grass or water, so hit the head with an arrow, or catch their rock spit on a shield to bounce it right back at them.",
   "drops": "Octo Balloon, Octorok Tentacle, Octorok Eyeball"
  },
  {
   "name": "Wizzrobe (elemental)",
   "tier": "common",
   "tactic": "Six types: Fire/Ice/Electric and stronger Meteo/Blizz/Thunder; each is weak to its opposite element, so shoot it with an opposing arrow to drop it.",
   "drops": "Elemental rods (Fire/Ice/Lightning, and Meteor/Blizzard/Thunderstorm rods)"
  },
  {
   "name": "Pebblit",
   "tier": "common",
   "tactic": "Mini-Talus in Stone, Igneo and Frost types: smash it with a heavy weapon or a bomb; Igneo and Frost ones burn or freeze on touch, so use ranged hits.",
   "drops": "Flint, ore, or a gem (Frost ones can drop Sapphire)"
  },
  {
   "name": "Stone Talus",
   "tier": "mini-boss",
   "tactic": "Climb on and pound the black ore lump on its back with a hammer/heavy weapon; bomb arrows or a Knight's claymore wreck the weak spot fast.",
   "drops": "Flint, Amber, Opal, gems and ore"
  },
  {
   "name": "Stone Talus (Luminous)",
   "tier": "mini-boss",
   "tactic": "Same fight as a Stone Talus but tougher (about 600 HP); the back lump is luminous ore, so hit it for Luminous Stone plus gems.",
   "drops": "Luminous Stone, Topaz, Diamond, Amber, Opal, Flint"
  },
  {
   "name": "Stone Talus (Rare)",
   "tier": "mini-boss",
   "tactic": "The toughest stone type (around 900 HP); attack the ore vein on its back and expect rich gem drops like Ruby, Sapphire and Diamond.",
   "drops": "Ruby, Sapphire, Diamond, Topaz, Amber, Opal, Flint"
  },
  {
   "name": "Igneo Talus",
   "tier": "mini-boss",
   "tactic": "Found in Eldin and made of lava; douse its glowing core with ice arrows to cool it, then climb up and smash the back weak point.",
   "drops": "Flint, Ruby, ore"
  },
  {
   "name": "Frost Talus",
   "tier": "mini-boss",
   "tactic": "Hebra/Gerudo highlands cousin of Igneo; hit its icy core with fire arrows to thaw it, then climb on and hammer the back lump.",
   "drops": "Flint, Sapphire, ore"
  },
  {
   "name": "Stal-enemies (Stalkoblin/Stalizalfos/Stalmoblin)",
   "tier": "common",
   "tactic": "Nighttime skeletons: knock them apart, then quickly smash the skull before the bones reassemble; one good hit to the head ends them.",
   "drops": "Bokoblin/Moblin/Lizalfos Horns, Fangs and Talons; each leaves a usable arm (no Guts)"
  },
  {
   "name": "Hinox",
   "tier": "mini-boss",
   "tactic": "Shoot its single eye to stun it, then unload on the downed giant; you can also pluck the weapons hanging from its neck while it sleeps.",
   "drops": "Hinox Toenail, Hinox Tooth, Hinox Guts, Hinox Horn; necklace weapons"
  },
  {
   "name": "Stalnox",
   "tier": "mini-boss",
   "tactic": "Skeletal Hinox: arrow its eye to make it pop out, grab or destroy the loose eyeball, then attack; smash the skull when it collapses to bones.",
   "drops": "Hinox Tooth; rare weapons lodged in its skeleton"
  },
  {
   "name": "Molduga",
   "tier": "boss",
   "tactic": "In the Gerudo sand it tracks footsteps, so toss a Remote Bomb to lure it up, detonate to stun, then sprint in and combo before it dives.",
   "drops": "Molduga Fin, Molduga Guts"
  },
  {
   "name": "Guardian Stalker",
   "tier": "guardian",
   "tactic": "Walking six-legged Guardian: perfect-parry its blue charged laser with a shield to reflect it for huge damage, or shoot the glowing eye to stun.",
   "drops": "Ancient parts (gears, springs, cores, shafts); can drop Giant Ancient Core"
  },
  {
   "name": "Guardian Skywatcher",
   "tier": "guardian",
   "tactic": "Flying Guardian that beams from above; time a shield parry on its laser to bounce it back, or snipe the eye with ancient/strong arrows.",
   "drops": "Ancient parts (gears, cores, shafts); can drop Giant Ancient Core"
  },
  {
   "name": "Guardian Turret",
   "tier": "guardian",
   "tactic": "Stationary laser Guardian fixed to floors in shrines/ruins; parry the laser back at it or arrow the eye, then climb up to finish it.",
   "drops": "Ancient parts; can drop Giant Ancient Core"
  },
  {
   "name": "Decayed Guardian",
   "tier": "guardian",
   "tactic": "Broken husks stuck in the ground that swing arms; dodge the sweep and flurry-rush, or just shoot the eye and smash the arms off.",
   "drops": "Ancient parts (often Ancient Screw/Spring)"
  },
  {
   "name": "Guardian Scout",
   "tier": "guardian",
   "tactic": "Shrine Guardians come in I-IV with sword/spear/laser arms; flurry-rush after a dodge and parry the spinning laser sweep to reflect it.",
   "drops": "Ancient parts; Scout III/IV can drop an Ancient Core"
  },
  {
   "name": "Yiga Footsoldier",
   "tier": "yiga",
   "tactic": "They disguise as travelers then turn hostile; dodge the sickle and flurry-rush, stun with arrows, and many can be calmed with a Mighty Banana.",
   "drops": "Mighty Bananas, occasionally weapons"
  },
  {
   "name": "Yiga Blademaster",
   "tier": "yiga",
   "tactic": "Big windcleaver Yiga that teleports and goes invisible; wait out the leaping overhead slam, sidestep into a flurry rush, repeat until down.",
   "drops": "Mighty Bananas, Demon Carver/Windcleaver, gems"
  },
  {
   "name": "Lynel (Red-maned)",
   "tier": "mini-boss",
   "tactic": "Weakest Lynel: headshot to stagger, sprint up and mount it for free hits; perfect-dodge its charge or parry its beam to flurry-rush.",
   "drops": "Lynel Horn/Hoof/Guts, Lynel weapons, shield"
  },
  {
   "name": "Lynel (Blue-maned)",
   "tier": "mini-boss",
   "tactic": "Tougher than red and adds fire/elemental attacks; same plan: headshot to stun, mount and slash, flurry-rush its melee and charges.",
   "drops": "Lynel Horn/Hoof/Guts, stronger Lynel gear"
  },
  {
   "name": "Lynel (White-maned)",
   "tier": "mini-boss",
   "tactic": "High HP and aggressive elemental attacks; stock strong bows for headshot stuns, mount for big hits, and never stop dodging into flurry rushes.",
   "drops": "Lynel Horn/Hoof/Guts, mighty Lynel gear"
  },
  {
   "name": "Lynel (Silver)",
   "tier": "mini-boss",
   "tactic": "The deadliest Lynel with the most HP; multishot bow headshots to stun, mount and combo, and flurry-rush every charge, slam and beam.",
   "drops": "Lynel Horn/Hoof/Guts, savage Lynel weapons/shield/bow"
  },
  {
   "name": "Windblight Ganon",
   "tier": "boss",
   "tactic": "Vah Medoh blight: use Revali's Gale to reposition past its wind blasts, then snipe the glowing eye; bomb arrows or a strong bow burn it down.",
   "drops": null
  },
  {
   "name": "Waterblight Ganon",
   "tier": "boss",
   "tactic": "Vah Ruta blight: in phase two raise Cryonis blocks for cover and to climb, dodge the spear lunges, and flurry-rush or arrow the eye.",
   "drops": null
  },
  {
   "name": "Fireblight Ganon",
   "tier": "boss",
   "tactic": "Vah Rudania blight: shield or dodge its fireballs, and when it charges a fire ring, hit it with an ice arrow or Daruk's Protection to break it.",
   "drops": null
  },
  {
   "name": "Thunderblight Ganon",
   "tier": "boss",
   "tactic": "Vah Naboris blight: flurry-rush its lightning-fast dashes in phase one; in phase two it electrifies pillars, so topple one with a strike to stun it.",
   "drops": null
  },
  {
   "name": "Calamity Ganon",
   "tier": "boss",
   "tactic": "Final boss recaps the Blights' attacks; parry Guardian-style lasers, flurry-rush its melee, and pour bomb/ancient arrows into the orange weak spot.",
   "drops": null
  },
  {
   "name": "Dark Beast Ganon",
   "tier": "boss",
   "tactic": "On horseback, fire the Bow of Light at the glowing spots on each side (three per side), then the belly spot, then the eye on its forehead to win.",
   "drops": null
  }
 ]
};
const COOKING = {
 "rules": [
  "One effect per dish. A cooked meal or elixir can only carry a single special effect at a time. Mixing two different effect-types (e.g. Hearty + Spicy) cancels both and gives a plain dish with no bonus.",
  "Stack the SAME prefix to extend or strengthen. Adding more ingredients of one effect raises its tier (Mighty I to III) or its timer; e.g. 5 Hasty ingredients give a longer speed buff than 1.",
  "Cook in a Pot (a lit cooking pot), not a campfire. Tossing ingredients on an open campfire just chars single items (Baked Apple, Toasted Hateno Cheese); it cannot combine ingredients or make effect dishes/elixirs.",
  "Max 5 ingredients per dish. The pot accepts up to five items at once; plan your stack around that cap.",
  "Elixirs = critter + monster part. Combine at least one effect-bearing critter (lizard, frog, bug, etc.) with any monster part (horn, fang, guts, wing) to brew an elixir. Critters alone or monster parts alone will NOT cook.",
  "Hearty effect adds temporary (yellow) hearts and FULLY refills your red hearts. Energizing instantly refills stamina; Enduring (Endura) adds overfilled green/temporary stamina wheel.",
  "Effect strength/duration comes from the ingredients, so a dish's timer scales with how many same-effect items and high-tier items you use; tiers cap at level 3 for most buffs (Mighty/Tough/Hasty/Sneaky etc.).",
  "Monster Extract is a wild-card seasoning: it randomizes the dish, forcing the duration to roughly 1, 10, or 30 minutes (and can swing hearts), and it overrides the normal duration/crit bonuses, so don't combine it with dragon parts or star fragments.",
  "Dubious Food results from cooking only effect-less items, mismatched effects, or critters/monster parts with no valid pairing. It restores a small random number of hearts and has no effect.",
  "Rock-Hard Food results from cooking inedible items (wood, ore, weapons, Amber, etc.). It restores only a tiny sliver of health and is essentially a fail.",
  "Critical Cooking gives a bonus (one of: +1 effect tier, +5:00 duration, or extra hearts/stamina/yellow hearts). It is guaranteed during a Blood Moon, and guaranteed when a Dragon part or Star Fragment is in the recipe; otherwise it is a low base random chance per cook.",
  "Fairy Tonic is a special elixir made from a Fairy plus any monster part (or other materials); it simply restores hearts and carries no buff, useful for clearing inventory or a quick heal recipe.",
  "Dragon parts are seasonings that extend duration and guarantee a critical cook. By part the bonus is graduated: Scale ~+1:30, Claw ~+3:30, Shard of Fang ~+10:00, Shard of Horn maxes the timer to 30:00. Star Fragments also guarantee a critical cook.",
  "Identify the prefix on each raw ingredient (Hasty, Mighty, Spicy, etc.) and only combine matching prefixes for a clean, strong dish; mixing prefixes cancels the effect."
 ],
 "effects": [
  {
   "effect": "Hearty",
   "does": "Fully restores all red hearts AND adds extra temporary (yellow) hearts on top.",
   "ingredients": "Hearty Durian, Hearty Truffle, Hearty Bass, Hearty Radish, Hearty Blueshell Snail, Hearty Salmon, Hearty Lizard; Big Hearty Truffle and Big Hearty Radish give a bigger yellow-heart boost.",
   "elixir": null
  },
  {
   "effect": "Energizing",
   "does": "Instantly refills your stamina wheel (good for climbing/swimming mid-action).",
   "ingredients": "Stamella Shroom, Restless Cricket, Bright-Eyed Crab, Courser Bee Honey, Staminoka Bass.",
   "elixir": "Restless Cricket + monster part = Energizing Elixir"
  },
  {
   "effect": "Enduring",
   "does": "Refills stamina and overfills it with extra (green) temporary stamina wheel segments.",
   "ingredients": "Endura Carrot, Endura Shroom, Tireless Frog (elixir).",
   "elixir": "Tireless Frog + monster part = Enduring Elixir"
  },
  {
   "effect": "Spicy",
   "does": "Cold resistance - keeps you warm in freezing regions (and lets you survive cold areas).",
   "ingredients": "Spicy Pepper, Sunshroom, Warm Safflina, Summerwing Butterfly, Sizzlefin Trout, Warm Darner; Dinraal (fire dragon) parts add cold resistance.",
   "elixir": "Summerwing Butterfly + monster part = Spicy Elixir"
  },
  {
   "effect": "Chilly",
   "does": "Heat resistance - prevents overheating in Gerudo Desert / Eldin region (does NOT stop flame damage).",
   "ingredients": "Hydromelon, Chillshroom, Cool Safflina, Winterwing Butterfly, Chillfin Trout, Cold Darner; Naydra (ice dragon) parts add heat resistance.",
   "elixir": "Winterwing Butterfly + monster part = Chilly Elixir"
  },
  {
   "effect": "Fireproof",
   "does": "Prevents catching fire from flames/lava environments (essential on Death Mountain). ELIXIR ONLY - cannot be cooked into a food dish.",
   "ingredients": "Fireproof Lizard, Smotherwing Butterfly (each + a monster part). Note: Naydra's frost parts can be added to extend a fireproof elixir's timer.",
   "elixir": "Smotherwing Butterfly (or Fireproof Lizard) + monster part = Fireproof Elixir"
  },
  {
   "effect": "Electro",
   "does": "Shock resistance - reduces or negates lightning/electric damage and stops weapons being knocked from your hand.",
   "ingredients": "Voltfruit, Zapshroom, Electric Safflina, Thunderwing Butterfly, Voltfin Trout, Electric Darner; Farosh (lightning dragon) parts add shock resistance.",
   "elixir": "Thunderwing Butterfly + monster part = Electro Elixir"
  },
  {
   "effect": "Mighty (Attack Up)",
   "does": "Raises melee/ranged attack power for a duration - the key Ganon/lynel buff.",
   "ingredients": "Mighty Bananas, Razorshroom, Mighty Carp, Mighty Porgy, Razorclaw Crab, Mighty Thistle, Bladed Rhino Beetle (elixir).",
   "elixir": "Bladed Rhino Beetle + monster part = Mighty Elixir"
  },
  {
   "effect": "Tough (Defense Up)",
   "does": "Raises defense so you take less damage from attacks.",
   "ingredients": "Ironshroom, Armored Carp, Armored Porgy, Ironshell Crab, Fortified Pumpkin, Rugged Rhino Beetle (elixir).",
   "elixir": "Rugged Rhino Beetle + monster part = Tough Elixir"
  },
  {
   "effect": "Hasty (Speed Up)",
   "does": "Increases movement speed - run, swim, and climb faster.",
   "ingredients": "Swift Carrot, Rushroom, Swift Violet, Fleet-Lotus Seeds, Hot-Footed Frog (elixir).",
   "elixir": "Hot-Footed Frog + monster part = Hasty Elixir"
  },
  {
   "effect": "Sneaky (Stealth Up)",
   "does": "Boosts stealth - quieter footsteps, enemies/animals notice you less. Great for hunting and the Yiga.",
   "ingredients": "Silent Princess, Silent Shroom, Blue Nightshade, Sneaky River Snail, Stealthfin Trout, Sunset Firefly (elixir).",
   "elixir": "Sunset Firefly + monster part = Sneaky Elixir"
  }
 ],
 "recipes": [
  {
   "name": "5 Big Hearty Radishes (or 5 Big Hearty Truffles)",
   "makes": "Hearty meal - full red-heart refill plus the maximum +25 extra yellow hearts.",
   "why": "The best survival/bossing food. Five Big Hearty items overcap your hearts so you can tank lynels and Ganon hits. (5 standard Hearty Durians give a smaller +20.)"
  },
  {
   "name": "5 Hasty ingredients (e.g. 5 Swift Carrots or Rushrooms)",
   "makes": "Hasty dish at level 3 speed - long fast-run/climb buff.",
   "why": "Stacking five same-prefix Hasty items pushes both tier and timer; ideal for travel, racing shrine quests, and outrunning Guardians."
  },
  {
   "name": "Mighty Bananas x4-5 (Mighty Simmered Fruit)",
   "makes": "Attack Up Lv3 (Mighty) meal for several minutes.",
   "why": "Cheap, farmable attack buff. Eat right before fighting Ganon, Lynels, or Hinox - extra attack tiers massively shorten fights. Bananas grow in tropical Faron."
  },
  {
   "name": "Bladed Rhino Beetle + Bokoblin Horn (Mighty Elixir)",
   "makes": "Attack Up elixir; add a Shard of Dragon Horn to push duration to the 30:00 max.",
   "why": "Elixir route to attack-up when you lack Mighty produce; a dragon part guarantees a critical cook and a long timer for boss runs."
  },
  {
   "name": "Endura Carrot x4-5 (Enduring dish)",
   "makes": "Bonus overfilled stamina wheel(s).",
   "why": "Lets you scale the tallest cliffs (Vah Rudania, towers) without running out of stamina; the extra green wheel is huge for exploration."
  },
  {
   "name": "Fairy + any monster part (Fairy Tonic)",
   "makes": "Plain healing elixir.",
   "why": "Quick heal that also lets you offload spare fairies/monster parts; no buff, but reliable hearts in a pinch."
  },
  {
   "name": "Hearty Salmon + Tabantha Wheat + Goat Butter (Hearty Salmon Meuniere)",
   "makes": "A named gourmet Hearty dish (a quest favorite) with full heal + yellow hearts.",
   "why": "The real BotW recipe needs only those three items; add Rock Salt or Goron Spice to extend the timer. Ingredients gather easily around Tabantha/Rito Village."
  }
 ],
 "dragons": [
  {
   "name": "Dinraal",
   "element": "Fire",
   "where": "Flies over the Eldin region, appearing near Death Mountain and along Tanagar Canyon, spawning around 5am at the north end and drifting through the morning.",
   "parts": "Scale (+~1:30 duration), Claw (+~3:30), Shard of Dinraal's Fang (+~10:00), Shard of Dinraal's Horn (maxes timer to 30:00). As the fire dragon, Dinraal's parts add COLD RESISTANCE (Spicy/warm) to an elixir and guarantee a critical cook."
  },
  {
   "name": "Naydra",
   "element": "Ice / Frost",
   "where": "Circles the Lanayru region, notably around Mount Lanayru and the Lanayru Road/Promenade; appears at night and into the early morning.",
   "parts": "Scale (+~1:30), Claw (+~3:30), Shard of Naydra's Fang (+~10:00), Shard of Naydra's Horn (maxes timer to 30:00). As the ice/frost dragon, Naydra's parts add HEAT RESISTANCE (Chilly) and can extend Fireproof elixirs; they also guarantee a critical cook."
  },
  {
   "name": "Farosh",
   "element": "Electricity / Lightning",
   "where": "Roams the Faron region around Lake Hylia and the Bridge of Hylia, breaching from Lake Hylia/Riola Spring; often appears near waterways around dawn.",
   "parts": "Scale (+~1:30), Claw (+~3:30), Shard of Farosh's Fang (+~10:00), Shard of Farosh's Horn (maxes timer to 30:00). As the lightning dragon, Farosh's parts add SHOCK RESISTANCE (Electro) to an elixir and guarantee a critical cook."
  }
 ]
};
const KOROKS = {
 "what": "Korok Seeds are the reward for solving 900 little hidden puzzles across Hyrule. You trade them to Hestu, a big maraca-shaped Korok, who uses them to permanently expand your three gear pouches: weapon slots, bow slots, and shield slots. More slots means you carry more gear and break fewer weapons mid-fight, so growing your inventory is one of the most useful early grinds.",
 "hestu": "Hestu moves, then settles. (1) First meeting: on the road between Dueling Peaks Stable and Kakariko Village, just past Kakariko Bridge — do the favor in the side quest The Priceless Maracas (recover his maracas from nearby Bokoblins) and he starts upgrading. (2) Next: near Riverside Stable, west of Kakariko in Hyrule Field, by a tree along the road. (3) Permanent home: Korok Forest, deep in the Great Hyrule Forest up north (Lost Woods), by the Great Deku Tree. Rising cost curve per slot — Weapons (11 upgrades): 1,2,3,5,8,12,17,25,35,45,55 = 208. Bows (8): 1,2,3,5,8,12,17,25 = 73. Shields (16): 1,2,3,4,5,10,10,10,10,10,15,15,15,15,15,20 = 160. Maxing ALL pouches costs exactly 441 seeds — that is the cap; beyond that, extra seeds do nothing for inventory. 900 seeds exist total; turning in all 900 earns Hestu's Gift, a purely cosmetic golden poop (\"smells pretty bad\") — a joke reward, no stats.",
 "puzzleTypes": [
  {
   "type": "Rock in a ring / lift the lone rock",
   "how": "See a circle of stones with one gap, or a single suspicious rock sitting alone? Pick up a nearby rock and drop it in the ring, or just lift the lone rock to reveal the Korok under it."
  },
  {
   "type": "Complete the pattern",
   "how": "A near-symmetrical arrangement (rocks, blocks) with one piece obviously missing. Add or move a rock/block to finish the symmetry."
  },
  {
   "type": "Stone circles / place the boulder",
   "how": "A ring of small stones around an empty center wants a boulder rolled or carried into the middle."
  },
  {
   "type": "Flower trail",
   "how": "Spot a line of identical flowers (often yellow). Run to and touch each one IN ORDER without missing any; the last one spawns the Korok."
  },
  {
   "type": "Balls / orbs in holes",
   "how": "A metal or stone ball near matching divots — roll or carry it into the hole. Sometimes you guide it with Magnesis or Stasis."
  },
  {
   "type": "Race / reach the goal in time",
   "how": "Activate a glowing wisp or ring of light, then sprint (often paraglide or shield-surf) to the goal before the timer runs out."
  },
  {
   "type": "Shoot the target",
   "how": "Spot a balloon, an acorn, an apple/fruit, or a small mark? Hit it with an arrow. Sometimes several balloons must all be popped."
  },
  {
   "type": "Offering to a pedestal / altar",
   "how": "A small shrine-like pedestal with a fruit or item carved on it — place that exact item (apple, durian, etc.) on it."
  },
  {
   "type": "Matching spin (pinwheel / cube)",
   "how": "Two pinwheels or a floating cube — rotate the cube (climb and push, or Magnesis) so its colored faces match the surrounding pattern."
  },
  {
   "type": "Light the torches",
   "how": "Several unlit torches near one lit flame (or you bring fire). Light every torch, usually using a torch/fire arrow/flint."
  },
  {
   "type": "Dive into a ring",
   "how": "A ring of light or floating circle below a cliff — paraglide or dive straight through the center to spawn the Korok."
  }
 ],
 "hotspots": [
  "Out-of-place rocks: a single rock on a stump, peak, or cliff edge is almost always a lift-the-rock Korok — check every lonely boulder.",
  "Circles with a gap: any ring of stones missing one piece means grab the nearest loose rock and complete it.",
  "Tops of things: peaks, towers, ruined pillars, and lone trees on hills frequently hide rock-lift or dive-into-ring puzzles — climb up and look around.",
  "Stables and Towers: the ground around every Stable and Sheikah Tower usually has 1-2 easy Koroks (rocks, balloons, or flower trails) right nearby.",
  "Bright fruit/acorns on trees: an apple or acorn sitting alone on a branch or pinwheel-marked tree is a shoot-the-target Korok.",
  "Geometry that looks 'almost right': any too-neat pile, pattern, or symmetry that's off by one piece is a complete-the-pattern puzzle."
 ]
};
const WORLD = {
 "upgrades": [
  "Spirit Orbs: trade 4 at any Goddess Statue for one Heart Container or one Stamina Vessel. You get 1 orb per shrine (120 shrines = 30 vessels total to earn).",
  "Mix freely: spend orbs on hearts, stamina, or both. Stamina caps at 3 full wheels, which takes 10 Stamina Vessels (you start with one wheel); the rest can go to hearts (max 30 hearts total).",
  "Heart<->stamina swap: the Horned Statue (a.k.a. the Goddess Statue's dark twin) in Hateno Village buys back a vessel for 100 rupees and sells you the other type, letting you re-spec anytime.",
  "Master Sword: pull it from the pedestal in Korok Forest, but it only releases if you have at least 13 full Heart Containers (temporary/food hearts don't count).",
  "Master Sword never breaks; its energy depletes after heavy use and recharges in about 10 minutes. Its base 30 damage doubles to 60 versus Guardians and Ganon-corrupted foes. The DLC Trial of the Sword extends its energy so it stays powered up far longer."
 ],
 "fairies": [
  {
   "name": "Cotera",
   "location": "Great Fairy Fountain northeast of Kakariko Village (Necluda): head north up the village, then east past Ta'loh Naeg Shrine into the woods",
   "cost": "First fountain you open costs 100 rupees"
  },
  {
   "name": "Kaysa",
   "location": "Great Fairy Fountain in the Tabantha Frontier near Tabantha Bridge Stable, on Piper Ridge (Rito region, west Hyrule)",
   "cost": "Second fountain costs 500 rupees"
  },
  {
   "name": "Mija",
   "location": "Great Fairy Fountain on the east bank of Lake Akkala in the Akkala Highlands (warp Dah Hesho Shrine), near South Akkala Stable (northeast Hyrule)",
   "cost": "Third fountain costs 1,000 rupees"
  },
  {
   "name": "Tera",
   "location": "Great Fairy Fountain at Dragon's Exile in the southwest Gerudo Desert, in the Gerudo Great Skeleton near Hawa Koth Shrine",
   "cost": "Fourth fountain costs 10,000 rupees"
  }
 ],
 "materials": [
  {
   "name": "Star Fragment",
   "use": "Top-tier upgrade material for the best armor tiers (Champion's Tunic, ancient armor, etc.); also sells well",
   "where": "Drops from a fallen shooting star at night. Watch the sky, mark where it lands, and grab it before dawn (it vanishes at sunrise)."
  },
  {
   "name": "Dragon parts (Naydra, Dinraal, Farosh)",
   "use": "Scales, claws, horn shards, and fangs upgrade armor and brew long elixirs; any single dragon part sets an elixir's duration to the maximum 30:00",
   "where": "Shoot a body part off a roaming dragon with an arrow (never the eyes; horn/foot/mouth give shards). Naydra: Mount Lanayru. Dinraal: Eldin/Tanagar Canyon. Farosh: Faron/Lake Hylia."
  },
  {
   "name": "Ancient parts (gears, screws, shafts, cores, Giant Ancient Core)",
   "use": "Trade at the Akkala Ancient Tech Lab to craft ancient arrows and the powerful Ancient armor set / Guardian-tier gear",
   "where": "Drop from defeated Guardians (Stalkers, Skywatchers, turrets). Light the lab's furnace with the blue flame first to unlock crafting."
  },
  {
   "name": "Rare gems (diamond, ruby, sapphire, topaz, opal, amber)",
   "use": "Required for many armor upgrades and for forging gem-set gear; rubies/sapphires also brew fire/cold resist elixirs",
   "where": "Mine ore deposits (black = common, ore-flecked = rare gems) with a hammer-like weapon, or buy/sell at Goron City gem shops near Gut Check Rock."
  },
  {
   "name": "amiibo materials",
   "use": "Tapping Zelda-series amiibo can drop rare gear, food, and exclusive armor. The Breath of the Wild-series Link amiibo can grant the Wild armor set; the 30th Anniversary 8-bit Link amiibo can grant the classic Sword (attack 22), not the Master Sword",
   "where": "Enable amiibo in System settings, then use the amiibo rune in-game once per amiibo per day (most rewards require freeing at least one Divine Beast)."
  }
 ],
 "dlc": [
  "DLC works via the Expansion Pass (two packs). Pack 1 'The Master Trials' adds the Trial of the Sword (extends the Master Sword's powered-up duration), Master Mode (a harder save with self-healing, ranked-up enemies and floating sky platforms), Hero's Path travel log, Travel Medallion, Korok Mask, and several themed armor pieces hidden in chests.",
  "Pack 2 'The Champions' Ballad' adds a new main quest unlocked after all four Divine Beasts, granting the One-Hit Obliterator challenge, the Master Cycle Zero (rideable motorcycle) rune, extra shrines, upgraded Champion abilities, and lore on the four Champions.",
  "If you don't own the Expansion Pass, none of the above is available; the base game's 120 shrines, 4 Divine Beasts and Master Sword are unaffected."
 ]
};
/* GEN:DATA:END */
