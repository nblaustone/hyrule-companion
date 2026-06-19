import { useState, useEffect, useMemo, useCallback, useRef } from "react";

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

/* ============================================================
   ON-DEVICE BOOKSHELF (v12 · ADR 0009)
   The owner's own books/comics live ONLY on this device — never in the
   public build (they're copyrighted, and Hyrule Historia alone is 180MB,
   past GitHub's 100MB limit). Page images go in IndexedDB (big binary);
   the small book *index* rides in the normal `store` (localStorage).
   Import packs are STORE-ONLY zips, so we read them with a tiny
   zero-dependency parser — no decompression library is shipped, the
   offline build stays ~1MB, and nothing copyrighted is ever published. */
const BOOKS_DB = "hyrule-books", BOOKS_STORE = "pages";
const booksDB = {
  _p: null,
  open() {
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      if (typeof indexedDB === "undefined") return rej(new Error("no IndexedDB"));
      const r = indexedDB.open(BOOKS_DB, 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(BOOKS_STORE)) db.createObjectStore(BOOKS_STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._p;
  },
  async putPages(bookId, entries, onProg) {
    const db = await this.open();
    const CH = 10; // chunk writes so one transaction never holds hundreds of big blobs
    for (let i = 0; i < entries.length; i += CH) {
      const slice = entries.slice(i, i + CH);
      await new Promise((res, rej) => {
        const tx = db.transaction(BOOKS_STORE, "readwrite"), os = tx.objectStore(BOOKS_STORE);
        for (const e of slice) os.put(e.blob, bookId + "/" + e.name);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
      });
      if (onProg) onProg(Math.min(entries.length, i + CH), entries.length);
    }
  },
  async getPage(bookId, name) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const rq = db.transaction(BOOKS_STORE, "readonly").objectStore(BOOKS_STORE).get(bookId + "/" + name);
      rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error);
    });
  },
  async deleteBook(bookId) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(BOOKS_STORE, "readwrite"), os = tx.objectStore(BOOKS_STORE);
      const rq = os.openKeyCursor(IDBKeyRange.bound(bookId + "/", bookId + "/￿"));
      rq.onsuccess = () => { const c = rq.result; if (c) { os.delete(c.primaryKey); c.continue(); } };
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },
};

/* read a STORE-ONLY .hbook.zip (ArrayBuffer) → { meta, files:Map(name→Uint8Array) } */
function readHbook(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), n = buf.byteLength;
  let eo = -1;
  for (let i = n - 22; i >= 0 && i >= n - 22 - 65557; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; } }
  if (eo < 0) throw new Error("not a .hbook (no zip directory found)");
  const count = dv.getUint16(eo + 10, true);
  let p = dv.getUint32(eo + 16, true);
  const dec = new TextDecoder(), files = new Map();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    if (method !== 0) throw new Error("pack isn't store-only — re-run build/pack-books.mjs");
    files.set(name, u8.subarray(ds, ds + csize));
    p += 46 + nlen + elen + clen;
  }
  const mj = files.get("book.json");
  if (!mj) throw new Error("pack is missing book.json");
  return { meta: JSON.parse(dec.decode(mj)), files };
}

/* import one .hbook.zip File → a lightweight index record (page blobs go to IndexedDB) */
async function importBookFromFile(file, onProg) {
  const { meta, files } = readHbook(await file.arrayBuffer());
  if (!meta || !meta.id) throw new Error("invalid pack (no id)");
  const base = { id: meta.id, title: meta.title, author: meta.author, year: meta.year, kind: meta.kind, cite: meta.cite };
  if (meta.type === "text") return { ...base, type: "text", blocks: meta.blocks || [] };
  const entries = (meta.files || []).map((name) => ({ name, blob: new Blob([files.get(name)], { type: "image/jpeg" }) }));
  if (!entries.length) throw new Error("pack has no pages");
  await booksDB.putPages(meta.id, entries, onProg);
  return { ...base, type: "pages", pages: entries.length, files: meta.files };
}

/* ============================================================ REGION 1 · GREAT PLATEAU ============================================================ */
const GREAT_PLATEAU = {
  id: "plateau", name: "The Great Plateau", sub: "Tutorial", kind: "region",
  tagline: "Where Link awakens — the tutorial that holds all of Hyrule in miniature.",
  sections: [
    { id: "awk", name: "Awakening", sub: "Shrine of Resurrection", steps: [
      { id: "awk1", k: "step", t: "Take the Sheikah Slate from the pedestal in front of you. This is your map, scope, runes — everything.", items: [{ name: "Sheikah Slate", cat: "key", note: "Map, scope & rune device" }] },
      { id: "awk2", k: "loot", stuck: "The two chests sit on the floor to your left and right after you grab the Slate. Open the menu, go to the armor screen, and equip the Old Shirt and Well-Worn Trousers so they actually go on Link.", t: "Open the two chests in the next room for the Old Shirt and Well-Worn Trousers. Equip both (＋ button).", items: [{ name: "Old Shirt", cat: "armor", note: "Starter top" }, { name: "Well-Worn Trousers", cat: "armor", note: "Starter legs" }] },
      { id: "awk3", k: "step", t: "Hold the Slate to the second pedestal to open the great door, then climb the ledges out into the light." },
      { id: "awk4", k: "step", t: "Outside, grab the Tree Branch leaning on a rock — your first weapon — and pick a couple of Hylian Mushrooms." },
      { id: "awk5", k: "tip", t: "Almost everything can be climbed, but climbing drains the green stamina wheel. If it empties mid-climb, Link falls. Keep early climbs short." },
    ]},
    { id: "oldman", name: "The Old Man & Temple of Time", sub: "Get your bearings", steps: [
      { id: "om1", k: "step", t: "Head down to the Old Man at the campfire and talk to him. He points you toward the Temple of Time — your next goal. (There's a torch by his fire you can grab.)" },
      { id: "om2", k: "loot", stuck: "The bow chest is up the broken pillars on the LEFT as you enter the temple ruins; climb the rubble to reach it. The Arrows are in a small pile on the floor near the altar at the back.", t: "Inside the Temple of Time ruins: climb the rubble to a chest with a Traveler's Bow, and grab Arrows near the altar. This is a common starter bow — there are several on the Plateau (another waits inside Oman Au). Grab both; bows break, so spares help.", items: [{ name: "Traveler's Bow", cat: "bow", note: "From Temple of Time · power 5" }] },
      { id: "om3", k: "tip", t: "Note the Goddess Statue inside the temple — you'll return here to trade Spirit Orbs for a heart or stamina upgrade." },
      { id: "om4", k: "optional", t: "The Temple roof hides a Korok seed under a small rock. Korok seeds expand your inventory slots later." },
    ]},
    { id: "tower", name: "Raise the Plateau Tower", sub: "“Follow the Sheikah Slate”", steps: [
      { id: "tw1", k: "step", t: "Follow the marker to the round stone pedestal near the center of the Plateau and place the Slate in the slot." },
      { id: "tw2", k: "step", t: "The Sheikah Tower erupts upward. At the top, examine the glowing terminal to download the Plateau map." },
      { id: "tw3", k: "step", t: "Climb down. The Old Man glides over and asks for a shrine's treasure in trade for the Paraglider — you actually need all four shrines." },
      { id: "tw4", k: "tip", stuck: "Click in the right stick to open the Scope, hover the center dot over a far-off orange beam of light, and press A to drop a stamp pin on it. Pin each shrine pillar you can see from up here.", t: "From up high, click the right stick for the Scope. Look for orange pillars of light — those are the four shrines — and drop a pin on each." },
    ]},
    { id: "oman", name: "Oman Au Shrine", sub: "Magnesis Trial · pond near the tower", reward: "Magnesis Rune — move metal", steps: [
      { id: "oa0", k: "optional", t: "At night, Stalkoblins (reassembling skeletons) rise around the shrine and the tower field — smash the skull to drop them, and grab any weapons they leave, like a Traveler's Sword. Free early melee, but they fall apart again at dawn.", items: [{ name: "Traveler's Sword", cat: "weapon", note: "Dropped by Stalkoblins at night near Oman Au" }] },
      { id: "oa1", k: "step", stuck: "Don't enter through the front. Hold the Slate up to the small pedestal beside the shrine door first to make it open, then drop down inside to get the Magnesis rune.", t: "Enter and download the MAGNESIS rune (lift and move anything metal).", items: [{ name: "Magnesis", cat: "rune", note: "Move metal objects", rune: "magnesis" }] },
      { id: "oa2", k: "step", stuck: "Aim Magnesis (it glows when a metal object is in range), grab a floor slab so it turns red, then drag it fully aside with the stick before letting go. Move both slabs to clear the gap.", t: "Use Magnesis (L) on the two metal floor slabs and pull them aside to open the passage." },
      { id: "oa3", k: "step", stuck: "Cross the metal plank first, then turn around, grab it with Magnesis again, and lift the sunken second plank out of the water to extend your bridge across.", t: "Raise the submerged metal plank with Magnesis and lay it across the water as a bridge, then cross." },
      { id: "oa4", k: "tip", stuck: "The Scout retreats and shoots beams. Grab any loose metal slab with Magnesis, hover it over the Scout, and drop it straight down on its head for a one-hit kill.", t: "A Guardian Scout activates ahead. Easy kill: drop a metal slab on it with Magnesis." },
      { id: "oa5", k: "loot", t: "Pull the submerged chest out of the water with Magnesis for a Traveler's Bow. Same common bow as the Temple of Time one — not a glitch, there are simply several on the Plateau. Keep the spare.", items: [{ name: "Traveler's Bow", cat: "bow", note: "From Oman Au Shrine · power 5" }] },
      { id: "oa6", k: "step", stuck: "The locking bar is the metal beam barring the door. Grab it with Magnesis through the bars and slide it sideways out of its bracket to unlock the door.", t: "At the sealed door, grab the metal locking bar through the door with Magnesis and slide it out, then go through." },
      { id: "oa7", k: "reward", t: "Examine Monk Oman Au's altar to claim your 1st Spirit Orb.", items: [{ name: "Spirit Orb", cat: "key", note: "Oman Au Shrine", orb: true }] },
    ]},
    { id: "jabaij", name: "Ja Baij Shrine", sub: "Bomb Trial · Eastern Abbey (east)", reward: "Remote Bomb Rune", steps: [
      { id: "jb0", k: "warn", t: "HAZARD: the Eastern Abbey is full of dormant Guardians. If a red beam locks onto you, sprint behind cover immediately — a hit here can one-shot you. Approach from high ground or the north wall." },
      { id: "jb1", k: "step", t: "Download the REMOTE BOMB rune. Switch round/cube bombs with the D-pad; detonate by pressing L again.", items: [{ name: "Remote Bombs", cat: "rune", note: "Infinite round & cube bombs", rune: "bomb" }] },
      { id: "jb2", k: "step", stuck: "Set a round bomb against the loose rock pile, back away a few steps, then press L to detonate. Bombs recharge after each blast, so wait for the icon to refill before the next one.", t: "Bomb the breakable rock piles blocking the two paths. Do the right path first." },
      { id: "jb3", k: "loot", t: "Behind the right rocks: a chest with the Traveler's Claymore — a powerful two-handed sword (hold Y for a spin attack).", items: [{ name: "Traveler's Claymore", cat: "weapon", note: "Two-handed · high damage" }] },
      { id: "jb4", k: "step", stuck: "Place a square CUBE bomb on the platform (it won't roll off), ride or watch it travel, and detonate the instant it lines up beside the rock pile blocking the door.", t: "Up the ladder, drop a CUBE bomb onto the moving platform; detonate when it carries the bomb next to the blocked doorway." },
      { id: "jb5", k: "loot", t: "Use the bomb launcher to fling a ROUND bomb into the breakable wall, revealing a chest with Amber.", items: [{ name: "Amber", cat: "material", note: "Gem · sell or upgrade armor" }] },
      { id: "jb6", k: "step", t: "Stand on the far launcher to be flung across to the altar." },
      { id: "jb7", k: "reward", t: "Claim your 2nd Spirit Orb from Monk Ja Baij.", items: [{ name: "Spirit Orb", cat: "key", note: "Ja Baij Shrine", orb: true }] },
    ]},
    { id: "warm", name: "Stay Warm First", sub: "Before the mountain shrines", steps: [
      { id: "wd0", k: "warn", t: "The last two shrines are up cold Mount Hylia. Go up unprepared and you'll lose hearts to the cold. Sort warmth first." },
      { id: "wd1", k: "optional", t: "Quick fix: cook 2–3 Spicy Peppers into Spicy Sautéed Peppers for a few minutes of cold resistance. (See the Cook tab.)" },
      { id: "wd2", k: "optional", stuck: "The cabin (Woodcutter's House) is in the southwest, down near Mount Hylia's base by a pond. Walk inside and read the book on the table; the diary lists a recipe but leaves out one ingredient.", t: "Better fix — the Warm Doublet: go to the Old Man's cabin (south, near Mount Hylia's base) and read his diary." },
      { id: "wd3", k: "optional", stuck: "Hyrule Bass is the fish in the nearby pond (toss a bomb in to stun them, then grab them). Throw Raw Meat + Spicy Pepper + Hyrule Bass into any cooking pot together, then talk to the Old Man holding the dish.", t: "Cook his recipe — Spicy Meat and Seafood Fry = Raw Meat + Spicy Pepper + Hyrule Bass — then show him the dish." },
      { id: "wd4", k: "reward", t: "He rewards you with the Warm Doublet: permanent cold resistance. (Or grab it from his cabin chest after all 4 shrines.)", items: [{ name: "Warm Doublet", cat: "armor", note: "Passive cold resistance" }] },
    ]},
    { id: "owa", name: "Owa Daim Shrine", sub: "Stasis Trial · Mount Hylia (cold)", reward: "Stasis Rune", steps: [
      { id: "od1", k: "step", stuck: "Stand at the edge, aim Stasis at the moving cog/platform so it freezes yellow, then sprint across before the timer runs out and it starts spinning again.", t: "Download the STASIS rune. Freeze the spinning cog/platform with Stasis (L), then run across while it's stopped.", items: [{ name: "Stasis", cat: "rune", note: "Freeze time on one object", rune: "stasis" }] },
      { id: "od2", k: "step", t: "On the boulder ramp, Stasis an incoming boulder to freeze it and run past safely." },
      { id: "od3", k: "loot", t: "On a ledge to the right partway up: a chest with a Traveler's Shield.", items: [{ name: "Traveler's Shield", cat: "shield", note: "Basic shield" }] },
      { id: "od4", k: "step", stuck: "A normal branch won't build enough force. Grab the Iron Sledgehammer lying nearby, cast Stasis on the boulder, then hit it 5-6 times until the orange arrow maxes out; it launches when Stasis ends.", t: "The huge boulder blocking the exit: cast Stasis on it, whack it 5–6 times with a strong weapon (an Iron Sledgehammer is nearby). When Stasis ends, stored energy launches it away." },
      { id: "od5", k: "reward", t: "Claim your 3rd Spirit Orb from Monk Owa Daim.", items: [{ name: "Spirit Orb", cat: "key", note: "Owa Daim Shrine", orb: true }] },
      { id: "od6", k: "optional", stuck: "Outside the exit, a boulder sits on a ledge. Stasis it and smash it with a weapon to knock it loose; a hidden chest with a Traveler's Bow is underneath.", t: "Outside, Stasis-and-smash the boulder on the ledge to reveal a hidden chest (another Traveler's Bow).", items: [{ name: "Traveler's Bow", cat: "bow", note: "Behind Owa Daim · power 5" }] },
    ]},
    { id: "keh", name: "Keh Namut Shrine", sub: "Cryonis Trial · Mount Hylia peak (cold)", reward: "Cryonis Rune", steps: [
      { id: "kn1", k: "step", stuck: "Cryonis only works on a water surface. Aim it at the pool directly beneath the raised gate so the ice column rises and props the gate open, then climb over.", t: "Download the CRYONIS rune. Aim at water under the raised gate, make an ice pillar to prop it open, then climb over.", items: [{ name: "Cryonis", cat: "rune", note: "Raise ice pillars from water", rune: "cryonis" }] },
      { id: "kn2", k: "step", stuck: "Aim Cryonis at the water in front of you to raise an ice block as a shield against its beam, then run around the side and slash it before it recovers.", t: "A Guardian Scout fires from a ledge — raise an ice block as cover, then rush and finish it." },
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
      { id: "pg3", k: "optional", stuck: "Easy Plateau Koroks: climb to the Temple of Time top spire and touch the sparkles, dive through the ring of lily pads in the pond by the cabin, and check the pit where Link first woke up.", t: "Loose ends: grab the Warm Doublet from his cabin if skipped, plus a few easy Korok seeds (Temple roof, lily-pad ring near the cabin, the pit where you woke up)." },
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
      { id: "k1", k: "step", stuck: "Glide off the Plateau's eastern edge near Ja Baij toward the gap between the twin peaks. You'll land in the lowlands; cross Proxim Bridge over the Squabble River and head east up the valley. Don't drop straight down.", t: "Warp to Ja Baij Shrine (eastern edge of the Plateau) and paraglide east toward the Dueling Peaks — the huge mountain split down the middle." },
      { id: "k2", k: "optional", t: "Bosh Kala Shrine sits just off the path near the Outpost Ruins — an easy Spirit Orb on the way.", items: [{ name: "Spirit Orb", cat: "key", note: "Bosh Kala Shrine", orb: true }] },
      { id: "k3", k: "tip", t: "At Proxim Bridge, an NPC named Brigo gives directions to Kakariko if you talk to him." },
      { id: "k4", k: "step", t: "Climb and activate the Dueling Peaks Tower to fill in this region's map. Climb every tower you pass." },
      { id: "k5", k: "optional", t: "Ha Dahamar Shrine is by the river after the valley (a water/Cryonis puzzle) — another easy orb.", items: [{ name: "Spirit Orb", cat: "key", note: "Ha Dahamar Shrine", orb: true }] },
      { id: "k6", k: "loot", stuck: "The shrine is at the base of the nearest peak, just north of the Squabble River. The Climber's Bandanna chest sits off the main puzzle path up a ramp, so grab it as a detour before you touch the altar.", t: "Ree Dahee Shrine along the route rewards the Climber's Bandanna — climb faster, plus a little defense. Worth the detour.", items: [{ name: "Climber's Bandanna", cat: "armor", note: "Climb faster" }, { name: "Spirit Orb", cat: "key", note: "Ree Dahee Shrine", orb: true }] },
    ]},
    { id: "k_road", name: "The Road to Kakariko", sub: "Stable · Hestu · the river path", steps: [
      { id: "k7", k: "step", t: "Stop at the Dueling Peaks Stable to rest, buy supplies, and register a horse if you've tamed one." },
      { id: "k8", k: "tip", stuck: "Head northeast up the road toward Kakariko to a Bokoblin camp tucked in the rocks. Clear the three Blue Bokoblins, then climb the Bokoblin lookout tower at the back of the camp and open the chest on top to recover the maracas for Hestu.", t: "BIG: find Hestu on the path (a giant Korok with maracas). His quest 'The Priceless Maracas' lets you trade Korok Seeds to expand your weapon, bow, and shield slots — do this as soon as you can." },
      { id: "k9", k: "step", t: "Follow the Squabble River north. An NPC by a fire near the gate (Nanna) will point you to Impa's house." },
    ]},
    { id: "k_village", name: "Kakariko Village", sub: "Ta'loh Naeg · Impa", steps: [
      { id: "k10", k: "loot", stuck: "Flurry Rush comes from dodging, not blocking: side-hop a vertical or thrust swing, or backflip a horizontal one, at the last instant, then press attack during the slow-motion. The monk calls out each move.", t: "Climb the hill above the village to the Ta'loh Naeg Shrine. Its trial is a COMBAT TUTORIAL — it teaches perfect dodge, flurry rush, and parry. Do it; it also becomes the village's fast-travel point.", items: [{ name: "Spirit Orb", cat: "key", note: "Ta'loh Naeg Shrine", orb: true }] },
      { id: "k11", k: "tip", t: "Shops worth a look: Enchanted (armor — the Hylian set is solid, the Stealth set helps at night), the arrow shop, and the general store." },
      { id: "k12", k: "reward", t: "Go to Impa's house (the big one; guards let you pass once they spot your Slate). She tells the story of the Calamity and gives two quests — Free the Divine Beasts and Locked Mementos. Next stop: Purah at the Hateno Ancient Tech Lab." },
      { id: "k13", k: "optional", stuck: "Cotera's fountain near Kakariko starts closed: she demands 100 rupees to wake up before she'll upgrade armor. Sell gems or cook to afford it, or come back later if you're short.", t: "Nearby: Great Fairy Cotera's fountain (Pikango's 'Find the Fairy Fountain' quest) upgrades armor. And 'The Stolen Heirloom' side quest with Paya/Dorian uncovers the Yiga Clan." },
    ]},
  ],
};

/* ============================================================ REGION 3 · LOCKED MEMENTOS / HATENO ============================================================ */
const HATENO = {
  id: "hateno", name: "Locked Mementos", sub: "Hateno · Purah", kind: "region",
  tagline: "Cross the Guardian-strewn plain to Hateno and get your Sheikah Slate's camera back.",
  sections: [
    { id: "h_town", name: "To Hateno Village", sub: "Tower · Myahm Agana", steps: [
      { id: "h0", k: "warn", stuck: "Don't fight the Guardians here, you can't win yet. Hug the tree line and ruins at the field's edges; sprint between cover when a Guardian's eye locks on (rising beeping + a targeting line) so it can't get a clean shot.", t: "HAZARD: the route from Kakariko crosses Blatchery Plain / Fort Hateno — a field of broken AND active Guardians. Keep your distance and use cover; a hit can one-shot you. (You'll return here later for a memory.)" },
      { id: "h1", k: "step", t: "Head south then east into the Necluda region. Activate the Hateno Tower, then follow the road east to Hateno Village." },
      { id: "h2", k: "optional", stuck: "Easiest trick: flip the maze fully upside-down so the ball rests on the flat back, then gently tilt to roll it. Near the exit, tilt toward the gap, then flick back to launch it over. Magnesis can also nudge the ball.", t: "Myahm Agana Shrine is in the village — activate it for a warp point. Its optional trial is a tilt-the-maze ball puzzle (motion controls or Magnesis).", items: [{ name: "Spirit Orb", cat: "key", note: "Myahm Agana Shrine", orb: true }] },
    ]},
    { id: "h_lab", name: "Hateno Tech Lab — Purah", sub: "Blue flame · Camera Rune", reward: "Camera Rune + Hyrule Compendium", steps: [
      { id: "h3", k: "step", stuck: "Leave the village's east edge and follow the winding path lined with odd orange lanterns up the cape over the sea. The lab is the lone building at the top. Inside, Purah is the small white-haired 'girl' at the desk.", t: "Follow the lantern-lined path east of the village up the cape to the Ancient Tech Lab. Talk to the girl (Purah) → she sends you to Symin → Symin reveals Purah IS the director. Talk to Purah again." },
      { id: "h4", k: "step", stuck: "From outside the lab, head left to the cliff edge and look for a bright blue glow below, behind the Village Chief's house past the ranch. Glide down. Grab the torch by the lab door first, then swing it at the flame.", t: "Purah needs the blue flame. Grab a torch (one's by the lab door), then go down to the town's Ancient Furnace (the blue light past the ranch) and light your torch on it." },
      { id: "h5", k: "step", stuck: "Walk (don't press B) and stay clear of water and rain, or the flame dies. Swing your lit torch at each stone lantern as you climb. They stay lit, so if it blows out, re-light from the nearest instead of going back.", t: "Carry the flame back up to the lab. DON'T run (it blows out) and avoid rain. Light the stone lanterns along the way — they stay lit as checkpoints to re-light from." },
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
      { id: "m2", k: "reward", stuck: "Easiest first memory: #2 Lake Kolomo, just paraglide off the Great Plateau north-east to the lake's west shore. Trigger it, then go show Impa in Kakariko for the Champion's Tunic.", t: "Show Impa your FIRST recovered memory to get the Champion's Tunic — strong, upgradeable armor. Grab an easy memory early just for this.", items: [{ name: "Champion's Tunic", cat: "armor", note: "Reward for your 1st memory" }] },
      { id: "m3", k: "tip", stuck: "Pikango is the painter loitering at Kakariko Village (and other stables). After you photograph the Great Fairy Cotera for him, talk to him holding a memory photo and pick it on the map; he points you to that spot.", t: "Finish 'Find the Fairy Fountain' (photograph Cotera for Pikango) so Pikango will hint at locations. Show him the nearest photo at a stable and he names the place." },
      { id: "m4", k: "warn", t: "Heads up: many memories sit deep in dangerous, far-off regions (Hyrule Castle, Gerudo, Akkala, Tabantha) well beyond where you are now. Treat this as a long-haul quest you chip away at — start with the easy, nearby ones." },
    ]},
    { id: "m_list", name: "All 12 Memory Locations", sub: "Album order · tap to track", steps: [
      { id: "m_l1", k: "optional", stuck: "Warp to Central Tower and paraglide NORTH into Hyrule Field toward the castle; the glow sits in the semi-circular ruins where Hyrule Castle fills the photo's background. Guardians roam this field, so watch for their beams.", t: "#1 Sacred Ground Ruins — Central Hyrule, the semi-circular stone ruins in open Hyrule Field south of Hyrule Castle (paraglide north from Central Tower; Guardians roam the field)." },
      { id: "m_l2", k: "optional", t: "#2 Lake Kolomo — Central Hyrule, the forest on the west shore (near Riverside Stable)." },
      { id: "m_l3", k: "optional", t: "#3 Ancient Columns — Tabantha (Piper Ridge), the row of broken pillars near Tena Ko'sah Shrine (paraglide from Tabantha Tower toward Piper Ridge)." },
      { id: "m_l4", k: "optional", t: "#4 Kara Kara Bazaar — Gerudo Desert, the oasis on the way to Gerudo Town (you pass it in the story)." },
      { id: "m_l5", k: "optional", stuck: "Hard to pin down: warp to Woodland Tower and glide toward the high mountain overlooking Goronbi Lake, then climb the cliff up to the glow. It sits roughly between Woodland and Eldin towers.", t: "#5 Eldin Canyon — Eldin, high on the cliffs overlooking Goronbi Lake, between Woodland and Eldin Towers (climb up from Woodland Stable)." },
      { id: "m_l6", k: "optional", t: "#6 Irch Plain — Hyrule Ridge, by the large tree southeast of Serenne Stable." },
      { id: "m_l7", k: "optional", t: "#7 West Necluda — a tree on a hill across the Hylia River, opposite Scout's Hill (from Scout's Hill, paraglide over the river to the lone tree — it has a rock at its base)." },
      { id: "m_l8", k: "optional", t: "#8 Hyrule Castle — by Zelda's Study spire on the castle's west side. DANGEROUS — save for later." },
      { id: "m_l9", k: "optional", t: "#9 Spring of Power — Akkala, the goddess spring west of East Akkala Stable, just north of Ordorac Quarry (closest tower: Akkala)." },
      { id: "m_l10", k: "optional", t: "#10 Sanidin Park Ruins — Hyrule Ridge, the giant horse statue on Safula Hill (near Outskirt Stable)." },
      { id: "m_l11", k: "optional", stuck: "Find Lanayru Promenade on the map and follow Lanayru Road east to its end; the glow is right at the East Gate. Black Moblins and Bokoblins guard the road — fight through or slip along the hills above. No cold gear needed at the gate itself.", t: "#11 Lanayru Road – East Gate — East Necluda, at the east end of Lanayru Road where it meets the Lanayru Promenade (the road is guarded by Moblins and Bokoblins; the cold is higher up the promenade, not at the gate)." },
      { id: "m_l12", k: "optional", t: "#12 Hyrule Field — Central Hyrule, the forest northeast of the Bottomless Swamp (near Wetland Stable)." },
      { id: "m_l13", k: "reward", stuck: "The 13th only unlocks after the other 12. Return to Impa in Kakariko and she gestures to the final photo hanging in her house, then recall it at Blatchery Plain (the Guardian field by Fort Hateno) for the bonus scene.", t: "After all 12, report to Impa — she reveals the 13th photo (hanging in her house): #13 Blatchery Plain, the Guardian field near Fort Hateno. Recall it to finish the quest and unlock the bonus ending scene." },
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
      { id: "r2", k: "warn", stuck: "From Inogo Bridge, stay on the trail along the river's east side and follow the glowing blue luminous stones and lit lanterns; they lead you straight to the Domain even though you can't see far in the rain.", t: "It rains nonstop here (that's Vah Ruta), so climbing is too slick to rely on. Follow the luminous-stone path up the river instead, and watch for electric Lizalfos and Octoroks." },
      { id: "r3", k: "step", t: "Follow the river path all the way up to Zora's Domain. Sidon keeps cheering you along the way." },
    ]},
    { id: "r_king", name: "King Dorephan & the Zora Armor", sub: "Throne room", steps: [
      { id: "r4", k: "reward", t: "King Dorephan explains Vah Ruta's rain is about to overflow the reservoir and flood Hyrule. He gives you the Zora Armor — swim faster and swim UP waterfalls. (Muzu, the old advisor, distrusts Hylians.)", items: [{ name: "Zora Armor", cat: "armor", note: "Swim up waterfalls" }] },
      { id: "r5", k: "step", t: "Equip the Zora Armor and head down to talk to Muzu and Sidon. Your task: gather 20 Shock Arrows." },
      { id: "r6", k: "optional", t: "Do the Ne'ez Yohma Shrine in the Domain first for a fast-travel point right here.", items: [{ name: "Spirit Orb", cat: "key", note: "Ne'ez Yohma Shrine", orb: true }] },
    ]},
    { id: "r_arrows", name: "20 Shock Arrows", sub: "Ploymus Mountain", steps: [
      { id: "r7", k: "step", stuck: "From the Domain, head to the tall waterfall on the east side (toward Mipha Court). With Zora Armor on, swim into its base and press A to shoot straight up; the top is Ploymus Mountain / Shatterback Point.", t: "Use the Zora Armor to swim up the east waterfalls to Ploymus Mountain / Shatterback Point above the reservoir." },
      { id: "r8", k: "warn", stuck: "Shock Arrows are stuck in cedar tree trunks, the ground, and rocks all over the mountain (31 total). Stay crouched, keep trees between you and the Lynel, and you can grab 20+ without it ever noticing you.", t: "A Red-Maned Lynel roams here and it's brutal for a new player. You can SNEAK around it and pick up the 20+ Shock Arrows lying around the mountain without fighting — that's the safe play." },
      { id: "r9", k: "loot", t: "If you do fight the Lynel: Perfect Dodge → flurry, stun it with arrows to the face, and mount it. Either way, leave with 20 Shock Arrows.", items: [{ name: "Shock Arrows ×20", cat: "material", note: "Needed to calm Vah Ruta" }] },
    ]},
    { id: "r_calm", name: "Calm Vah Ruta", sub: "Ride Sidon · 4 pink orbs", steps: [
      { id: "r10", k: "step", stuck: "You don't steer; just stand on Sidon. When an ice block flies in, pull out Cryonis (the water-pillar rune), aim at the block, and press A to shatter it, or shoot it with any arrow before it hits you.", t: "At East Reservoir Lake, ride on Sidon's back. Vah Ruta hurls ice blocks — shatter them with Cryonis (aim, A) or arrows before they hit." },
      { id: "r11", k: "step", stuck: "When Sidon lines up by a waterfall, swim into it and press A to rush up; at the top Link auto-deploys the paraglider. Aim your bow mid-air for slow-mo and tag the pink orb on Ruta with a Shock Arrow before landing.", t: "When Sidon swims beside a waterfall pouring off Ruta, swim UP it with the Zora Armor, deploy the paraglider at the top for slow-mo, and shoot a glowing pink orb on Ruta's back with a Shock Arrow." },
      { id: "r12", k: "step", t: "After two orbs it adds spiky ice — keep breaking it with Cryonis. Destroy all 4 pink orbs and Sidon drops you onto Vah Ruta." },
    ]},
    { id: "r_inside", name: "Inside Vah Ruta", sub: "Activate 5 terminals", reward: "Control of Vah Ruta", steps: [
      { id: "r13", k: "step", stuck: "The Malice eyeball is the orange eye above the ramp; one arrow kills it. The gate on your left is underwater pillar territory: stand facing it, aim Cryonis at the water in front, and the ice column raises the gate.", t: "Mipha's spirit tells you to light 5 terminals, then the main control unit. First room: shoot the Malice eyeball at the top of the ramp, deal with the Guardian Scout, and use Cryonis to lift the gate on your left." },
      { id: "r14", k: "step", stuck: "Open the map, select Vah Ruta's trunk, and set its angle so its waterfall pours onto a wall cogwheel; that spins platforms into reach. Use Magnesis (red rune) on the metal cranks/handles to raise the sunken terminals.", t: "The map terminal also lets you ROTATE Ruta's trunk — this aims its waterfall and controls the water level. Pour water onto the cogwheels to spin platforms; use Cryonis on water/ice and Magnesis on cranks and chests to reach each terminal." },
      { id: "r15", k: "optional", stuck: "Exit and swim up the big waterfall directly north of the Domain to reach Toto Lake. Stand over the sunken stone ruins, switch to Magnesis, and drag the rubble aside; the metal chest under it holds the Zora Helm.", t: "Optional: swim up to Toto Lake (north) and use Magnesis on the submerged ruins for a chest holding the Zora Helm — the head piece of the Zora set.", items: [{ name: "Zora Helm", cat: "armor", note: "Magnesis chest, Toto Lake — completes the Zora set" }] },
      { id: "r16", k: "step", t: "For the last terminal, rotate the trunk to pour water and douse the fire blocking the path. Grab any chests now — you can't return after the boss. Then activate all 5 terminals and the main control unit." },
    ]},
    { id: "r_boss", name: "Boss: Waterblight Ganon", sub: "Free Mipha", reward: "Mipha's Grace + Heart Container", steps: [
      { id: "r17", k: "step", stuck: "Hang back and watch for the spear thrust; sidestep or raise your shield, then put a Shock Arrow (or any arrow) into its single glowing eye. The hit staggers it, opening a window to run in and swing your strongest weapon.", t: "Phase 1: it floats and stabs with a spear. Guard or dodge the thrusts, shoot its EYE (Shock Arrows are ideal) to stagger it, then rush in with melee." },
      { id: "r18", k: "step", stuck: "Once it floods the room and flies to a corner, aim Cryonis at the water and make a tall ice pillar, climb it for a clear shot, then arrow the eye to knock it down. Break thrown ice the same way you did on Sidon's back.", t: "Phase 2 (around half health): it floods the room and flies corner to corner, throwing ice blocks (break with Cryonis) and spears. Make Cryonis pillars for height, shoot the eye, and keep dodging until it falls." },
      { id: "r19", k: "loot", stuck: "After the boss dies, a glowing Heart Container hovers where it fell. Walk into it to collect it BEFORE you touch the main control unit, or you may glide past and miss the permanent heart.", t: "GRAB the Heart Container that drops BEFORE touching the terminal again.", items: [{ name: "Heart Container", cat: "key", note: "From Waterblight Ganon" }] },
      { id: "r20", k: "reward", t: "Activate the main control unit to free Mipha. She grants Mipha's Grace — once per charge, if you fall in battle it auto-revives you with full + bonus hearts. Return to the Zora throne room for the cutscene; you can claim the Lightscale Trident from King Dorephan.", items: [{ name: "Lightscale Trident", cat: "weapon", note: "Mipha's spear (from the King)" }] },
    ]},
  ],
};

/* REGIONS is assembled at the bottom of the file, after all region objects are defined. */

const STATUS_RUNES = [
  { name: "Magnesis", glyph: "magnesis", step: "oa1" },
  { name: "Remote Bombs", glyph: "bomb", step: "jb1" },
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
  { id: "cryonis", name: "Cryonis", glyph: "cryonis", from: "Keh Namut Shrine", what: "Raise pillars of ice from any water — platforms, cover, or a lift for gates and chests. It also shatters ice blocks.", tip: "Make a pillar under yourself to rise out of deep water — and use it to break the ice Waterblight Ganon throws." },
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

/* ============================================================ COOKING ENGINE (v10) ============================================================ */
/* What players hurt over most (researched): raw ingredient effects are invisible, mixing two effects
   silently cancels and wastes rare items, elixirs are an unexplained second system, and the survival
   buzzwords are backwards. The pot simulator below surfaces the effect, predicts the result, and — the
   real differentiator — WARNS before you waste anything. Logic is deterministic (don't-invent law);
   exact hearts/durations are honest estimates (shown with ≈). */

// goal -> effect, in the order a first-timer needs them
const COOK_GOALS = [
  { goal: "Heal & over-heal", effect: "Hearty", sub: "Full heal + bonus yellow hearts — the don't-die button" },
  { goal: "Refill stamina now", effect: "Energizing", sub: "Tops up the wheel mid-climb/swim" },
  { goal: "Extra stamina wheel", effect: "Enduring", sub: "Overfills the wheel for the tallest climbs" },
  { goal: "Survive the cold", effect: "Spicy", sub: "Spicy = warms you (cold resistance)" },
  { goal: "Survive the heat", effect: "Chilly", sub: "Chilly = cools you (heat resistance)" },
  { goal: "Walk on lava / Death Mtn", effect: "Fireproof", sub: "Heat-resist does NOT stop fire — you need Fireproof (elixir only)" },
  { goal: "Shock resistance", effect: "Electro", sub: "Lightning storms & electric enemies" },
  { goal: "Hit harder", effect: "Mighty", sub: "Attack up" },
  { goal: "Take less damage", effect: "Tough", sub: "Defense up" },
  { goal: "Move faster", effect: "Hasty", sub: "Run, swim, climb faster" },
  { goal: "Sneak", effect: "Sneaky", sub: "Quieter — slip past or up to enemies" },
];

// potency points needed for tier 2 / tier 3 (null = effect has no higher tier). Hearty/Energizing/Enduring don't tier.
const COOK_TIERS = {
  Mighty: [5, 7], Tough: [5, 7], Hasty: [5, 7], Sneaky: [6, 9], Electro: [4, 6],
  Spicy: [6, null], Chilly: [6, null], Fireproof: [7, null],
};
const COOK_NOTIER = ["Hearty", "Energizing", "Enduring"];

/* COOK_INGREDIENTS — verified table, inlined from knowledge/cooking-ingredients.json into the GEN:DATA block (build/assemble-cooking.mjs). */

// Pure, deterministic outcome predictor for a pot of up to 5 ingredient objects.
function cookResult(items) {
  if (!items || items.length === 0) return null;
  const warn = [];
  if (items.length > 5) warn.push({ kind: "warn", t: "Only 5 ingredients fit — a 6th is ignored." });

  const has = (r) => items.some((i) => i.role === r);
  const hasCritter = has("critter"), hasMonster = has("monster"), hasDragon = has("dragon");
  const hasFood = items.some((i) => i.role === "effect" || i.role === "neutral");
  const specials = items.filter((i) => i.role === "special");
  const hasExtract = specials.some((i) => /extract/i.test(i.name));
  const hasStar = specials.some((i) => /star/i.test(i.name));
  const hasFairy = specials.some((i) => /fairy/i.test(i.name));

  const effItems = items.filter((i) => i.effect);
  const effects = Array.from(new Set(effItems.map((i) => i.effect)));

  let dish = "Meal", effect = null, dubious = false;

  if (hasFairy && !hasFood && !hasCritter) {
    return { dish: "Fairy Tonic", effect: null, hearts: null, warn: [{ kind: "tip", t: "Fairy Tonic — a plain healing elixir. Handy for clearing spare fairies and monster parts." }], count: items.length };
  }

  if (hasCritter) {
    dish = "Elixir";
    if (hasFood) { dubious = true; warn.push({ kind: "bad", t: "Critter + food = Dubious Food. Elixirs are critters + monster parts only — no fruit, meat, mushrooms." }); }
    else if (!hasMonster) { dubious = true; warn.push({ kind: "bad", t: "A critter alone won't cook. Add a monster part (horn, fang, guts…) to brew the elixir." }); }
    if (effects.length > 1) { dubious = true; effect = null; warn.push({ kind: "bad", t: "Two different critter effects cancel out. Use critters of one effect." }); }
    else effect = effects[0] || null;
  } else {
    dish = "Meal";
    if (hasMonster) { dubious = true; warn.push({ kind: "bad", t: "A monster part with no critter makes Dubious Food. Pair it with a critter for an elixir, or leave it out." }); }
    if (effects.length > 1) { effect = null; warn.push({ kind: "bad", t: "Two effects cancel — you'll get a plain meal with NO buff and waste the prefix items. Cook one effect family at a time." }); }
    else effect = effects[0] || null;
  }

  // hearts (≈ sum of cooked recovery + small cook bonus)
  let hearts = items.reduce((s, i) => s + (i.hearts || 0), 0);
  if (hearts > 0) hearts += 1; // pot cook bonus (approx)
  let heartyYellow = null;
  if (effect === "Hearty" && !dubious) {
    heartyYellow = Math.min(25, effItems.filter((i) => i.effect === "Hearty").reduce((s, i) => { const m = (i.bonus || "").match(/hearty:\+(\d+)/); return s + (m ? +m[1] : 4); }, 0));
    hearts = null; // full heal
  }

  // tier
  let tier = null, tierMax = false;
  if (effect && !dubious && COOK_TIERS[effect]) {
    const pts = effItems.filter((i) => i.effect === effect).reduce((s, i) => s + (i.potency || 1), 0);
    const th = COOK_TIERS[effect]; tier = 1;
    if (th[0] != null && pts >= th[0]) tier = 2;
    if (th[1] != null && pts >= th[1]) tier = 3;
    tierMax = th[1] != null ? tier >= 3 : tier >= 2;
    if (tierMax && effItems.filter((i) => i.effect === effect).length > (th[1] != null ? 3 : 2))
      warn.push({ kind: "warn", t: "Already at max " + effect + " tier — extra " + effect + " copies are wasted on level. Use them for duration or fill with neutral food." });
  }

  // duration (≈)
  let durSec = null;
  if (effect && !COOK_NOTIER.includes(effect) && !dubious) {
    let base = effItems.filter((i) => i.effect === effect).reduce((s, i) => s + (i.timeSec || 30), 0);
    if (dish === "Elixir") base += items.filter((i) => i.role === "monster").reduce((s, i) => s + (i.timeSec || 90), 0);
    if (hasDragon) { base += items.filter((i) => i.role === "dragon").reduce((s, i) => s + (i.timeSec || 0), 0); if (items.some((i) => i.role === "dragon" && /Horn/i.test(i.name))) base = 1800; }
    durSec = Math.min(1800, Math.max(30, base));
  }

  // crit
  let crit = null;
  if (hasExtract) { crit = "off"; warn.push({ kind: "warn", t: "Monster Extract randomizes the result and CANCELS any guaranteed crit. Never pair it with a dragon part or Star Fragment." }); }
  else if (hasDragon || hasStar) crit = "on";

  if (effect === "Fireproof" && dish === "Meal" && !dubious)
    warn.push({ kind: "warn", t: "Fireproof can only be an ELIXIR (a Fireproof Lizard or Smotherwing Butterfly + a monster part) — it never works as a food dish." });
  if (!effect && !dubious && items.every((i) => i.role === "neutral"))
    warn.push({ kind: "tip", t: "No buff items — this is a plain dish that just restores hearts. That's fine for healing." });

  return { dish: dubious ? "Dubious Food" : dish, effect, dubious, hearts, heartyYellow, tier, tierMax, durSec, crit, warn, count: items.length };
}
const fmtDur = (s) => { if (s == null) return null; const m = Math.floor(s / 60), ss = s % 60; return m + ":" + String(ss).padStart(2, "0"); };

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
    case "search": return (<svg viewBox="0 0 48 48" style={s} {...c} strokeWidth="2.4"><circle cx="20" cy="20" r="11" /><path d="M28 28l11 11" /></svg>);
    case "pencil": return (<svg viewBox="0 0 48 48" style={s} {...c}><path d="M32 8l8 8-22 22-10 2 2-10L32 8Z" /><path d="M28 12l8 8" /></svg>);
    case "pin": return (<svg viewBox="0 0 48 48" style={s} {...c} strokeWidth="2.4"><path d="M24 6c8 0 13 5 13 13 0 9-13 23-13 23S11 28 11 19C11 11 16 6 24 6Z" /><circle cx="24" cy="19" r="4.5" fill="currentColor" stroke="none" /></svg>);
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
  { id: "construct", label: "Constructs", glyph: "champion", color: "var(--cyan)" },
  { id: "gloom", label: "Gloom & Phantoms", glyph: "eye", color: "var(--malice)" },
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
/* Wrapper: owns the active game, remounts the per-game app on a switch (ADR 0005). */
export default function HyruleCompanion() {
  const [game, setGame] = useState("botw");
  const [gloaded, setGloaded] = useState(false);
  useEffect(() => {
    let c = false;
    (async () => { const g = await store.get("hyrule:game"); if (c) return; if (g && GAMES[g]) setGame(g); setGloaded(true); })();
    return () => { c = true; };
  }, []);
  useEffect(() => { if (gloaded) store.set("hyrule:game", game); }, [game, gloaded]);
  if (!gloaded) return null;
  return <HyruleGame key={game} game={game} setGame={setGame} games={GAMES} />;
}
function GamePicker({ games, game, setGame }) {
  const ids = Object.keys(games);
  if (ids.length < 2) return null;
  return (
    <div className="game-picker">
      {ids.map((id) => (<button key={id} className={"game-pill" + (id === game ? " game-pill-on" : "")} onClick={() => setGame(id)}>{games[id].short}</button>))}
    </div>
  );
}

/* The per-game app. Remounted (key={game}) by the wrapper on a game switch, so each game's
   storage loads cleanly. G shadows the data globals with the active game's data (ADR 0005). */
function HyruleGame({ game, setGame, games }) {
  const G = games[game];
  const { REGIONS, SHRINES, ARMOR, BESTIARY, COOKING, KOROKS, WORLD, SIDE_QUESTS, TOWERS, GREAT_FAIRIES, REGION_MAPS, MAP_NODES, RUNES, TIPS, COOK_RULES, RECIPES, COOK_INGREDIENTS, CATS, ROADMAP, STATUS_RUNES, CHAMPIONS, terms, guideSegs, postRegionId } = G;
  const K = (s) => game + ":" + s; // storage key namespace per game (botw:* preserves existing data)
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState({});
  const [tab, setTab] = useState("status");
  const [region, setRegion] = useState(() => REGIONS[0].id);
  const [guideSub, setGuideSub] = useState("runes");
  const [openSections, setOpenSections] = useState(() => ({ [REGIONS[0].sections[0].id]: true }));
  const [query, setQuery] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [koroks, setKoroks] = useState(0);          // Korok-seed counter (botw:koroks)
  const [notes, setNotes] = useState({});           // per-step/shrine notes (botw:notes)
  const [armorTier, setArmorTier] = useState({});   // armor upgrade tier 0..4 by set index (botw:armortier)
  const [recipes, setRecipes] = useState([]);       // v10: saved cooking builds (botw:recipes)
  const [reading, setReading] = useState({});        // v11: lore reading position {chapterId:{page,pct,at}} (hyrule:reading)
  const [bookmarks, setBookmarks] = useState({});    // v11: saved lore chapters (hyrule:bookmarks)
  const [readerPrefs, setReaderPrefs] = useState({ scale: 1, theme: "slate" }); // v11: lore reader prefs (hyrule:readerprefs)
  const [loreArt, setLoreArt] = useState({});        // v11: per-chapter personal cover images, device-local base64 (hyrule:loreart)
  const [userBooks, setUserBooks] = useState([]);    // v12: imported on-device books index (hyrule:books); page blobs live in IndexedDB
  const [bookBusy, setBookBusy] = useState(null);    // v12: import status {name,done,total} | {name,error}
  const [searchOpen, setSearchOpen] = useState(false);
  const [gquery, setGquery] = useState("");          // global-search query
  const [noteOpen, setNoteOpen] = useState(null);    // which step/shrine's note editor is open
  const [spoiler, setSpoiler] = useState(false);     // hide shrine hints + future rewards until tapped (hyrule:prefs)
  const [flash, setFlash] = useState(null);          // v9: step id whose check is pulsing (joy pass)
  const [stepFlash, setStepFlash] = useState(null);  // v9: step id highlighted after a Resume jump
  const [shrinePin, setShrinePin] = useState(null);     // v12.3: "I'm here" current-shrine id (botw:shrinepin)
  const [shrineRecents, setShrineRecents] = useState([]); // v12.3: recently focused shrine ids (botw:shrinerecents)
  const [shrineFlash, setShrineFlash] = useState(null);   // v12.3: shrine row highlight after a focus jump
  const [revealed, setRevealed] = useState(() => new Set()); // v9: journey reward/boss spoilers tapped open
  const progressRef = useRef({});                    // v9: read current progress inside toggle without re-memoizing
  const flashTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, ui, kk, nt, at, pr, rc, rd, bm, rp, la, bk, spin, srec] = await Promise.all([
        store.get(K("progress")), store.get(K("ui")), store.get(K("koroks")), store.get(K("notes")), store.get(K("armortier")), store.get("hyrule:prefs"), store.get(K("recipes")),
        store.get("hyrule:reading"), store.get("hyrule:bookmarks"), store.get("hyrule:readerprefs"), store.get("hyrule:loreart"), store.get("hyrule:books"),
        store.get(K("shrinepin")), store.get(K("shrinerecents")),
      ]);
      if (cancelled) return;
      try { if (p) setProgress(JSON.parse(p)); } catch (e) {}
      try { if (ui) { const u = JSON.parse(ui); if (u.tab) setTab(u.tab); if (u.region) setRegion(u.region); if (u.openSections) setOpenSections(u.openSections); if (u.guideSub) setGuideSub(u.guideSub); } } catch (e) {}
      try { if (kk != null) setKoroks(parseInt(kk, 10) || 0); } catch (e) {}
      try { if (nt) setNotes(JSON.parse(nt)); } catch (e) {}
      try { if (at) setArmorTier(JSON.parse(at)); } catch (e) {}
      try { if (pr) { const o = JSON.parse(pr); if (o && typeof o.spoiler === "boolean") setSpoiler(o.spoiler); } } catch (e) {}
      try { if (rc) { const a = JSON.parse(rc); if (Array.isArray(a)) setRecipes(a); } } catch (e) {}
      try { if (rd) { const o = JSON.parse(rd); if (o && typeof o === "object") setReading(o); } } catch (e) {}
      try { if (bm) { const o = JSON.parse(bm); if (o && typeof o === "object") setBookmarks(o); } } catch (e) {}
      try { if (rp) { const o = JSON.parse(rp); if (o && typeof o === "object") setReaderPrefs((d) => ({ ...d, ...o })); } } catch (e) {}
      try { if (la) { const o = JSON.parse(la); if (o && typeof o === "object") setLoreArt(o); } } catch (e) {}
      try { if (bk) { const a = JSON.parse(bk); if (Array.isArray(a)) setUserBooks(a); } } catch (e) {}
      try { if (spin) setShrinePin(JSON.parse(spin)); } catch (e) {}
      try { if (srec) { const a = JSON.parse(srec); if (Array.isArray(a)) setShrineRecents(a); } } catch (e) {}
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (loaded) store.set(K("progress"), JSON.stringify(progress)); }, [progress, loaded]);
  useEffect(() => { if (loaded) store.set(K("ui"), JSON.stringify({ tab, region, openSections, guideSub })); }, [tab, region, openSections, guideSub, loaded]);
  useEffect(() => { if (loaded) store.set(K("koroks"), String(koroks)); }, [koroks, loaded]);
  useEffect(() => { if (loaded) store.set(K("notes"), JSON.stringify(notes)); }, [notes, loaded]);
  useEffect(() => { if (loaded) store.set(K("armortier"), JSON.stringify(armorTier)); }, [armorTier, loaded]);
  useEffect(() => { if (loaded) store.set(K("recipes"), JSON.stringify(recipes)); }, [recipes, loaded]);
  useEffect(() => { if (loaded) store.set("hyrule:prefs", JSON.stringify({ spoiler })); }, [spoiler, loaded]);
  useEffect(() => { if (loaded) store.set("hyrule:reading", JSON.stringify(reading)); }, [reading, loaded]);
  useEffect(() => { if (loaded) store.set("hyrule:bookmarks", JSON.stringify(bookmarks)); }, [bookmarks, loaded]);
  useEffect(() => { if (loaded) store.set("hyrule:readerprefs", JSON.stringify(readerPrefs)); }, [readerPrefs, loaded]);
  useEffect(() => { if (loaded) store.set("hyrule:loreart", JSON.stringify(loreArt)); }, [loreArt, loaded]);
  useEffect(() => { if (loaded) store.set("hyrule:books", JSON.stringify(userBooks)); }, [userBooks, loaded]);
  useEffect(() => { if (loaded) store.set(K("shrinepin"), JSON.stringify(shrinePin)); }, [shrinePin, loaded]);
  useEffect(() => { if (loaded) store.set(K("shrinerecents"), JSON.stringify(shrineRecents)); }, [shrineRecents, loaded]);

  // v12: import / remove on-device books. Page blobs go to IndexedDB; the index rides in localStorage.
  const importBooks = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      try {
        setBookBusy({ name: file.name, done: 0, total: 0 });
        const rec = await importBookFromFile(file, (d, t) => setBookBusy({ name: file.name, done: d, total: t }));
        rec.addedAt = Date.now();
        setUserBooks((bs) => [...bs.filter((b) => b.id !== rec.id), rec]);
        if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) {} }
      } catch (e) {
        setBookBusy({ name: file.name, error: (e && e.message) || "import failed" });
        await new Promise((r) => setTimeout(r, 2600));
      }
    }
    setBookBusy(null);
  }, []);
  const removeUserBook = useCallback(async (id) => {
    try { await booksDB.deleteBook(id); } catch (e) {}
    setUserBooks((bs) => bs.filter((b) => b.id !== id));
    setReading((m) => { const n = { ...m }; delete n[id]; return n; });
    setBookmarks((m) => { const n = { ...m }; delete n[id]; return n; });
  }, []);

  progressRef.current = progress;
  const toggleStep = useCallback((id) => {
    const turningOn = !progressRef.current[id];
    setProgress((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });
    if (turningOn) { setFlash(id); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(null), 650); } // v9: pulse only on check-on, never on load
  }, []);
  const reveal = useCallback((id) => setRevealed((s) => { const n = new Set(s); n.add(id); return n; }), []); // v9: progressive spoiler reveal
  const toggleSection = useCallback((id) => setOpenSections((o) => ({ ...o, [id]: !o[id] })), []);
  const setNote = useCallback((id, text) => setNotes((m) => { const n = { ...m }; if (text && text.trim()) n[id] = text; else delete n[id]; return n; }), []);
  const setTier = useCallback((i, t) => setArmorTier((m) => ({ ...m, [i]: Math.max(0, Math.min(4, t)) })), []);
  const resetAll = useCallback(() => { setProgress({}); setKoroks(0); setNotes({}); setArmorTier({}); setRecipes([]); setConfirmReset(false); }, []);
  // export/import the whole save as a portable code (offline backup, ADR 0002)
  const exportSave = useCallback(() => {
    const blob = { v: 7, progress, koroks, notes, armorTier, recipes };
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(blob)))); } catch (e) { return JSON.stringify(blob); }
  }, [progress, koroks, notes, armorTier, recipes]);
  const importSave = useCallback((code) => {
    try {
      const raw = code.trim().startsWith("{") ? code : decodeURIComponent(escape(atob(code.trim())));
      const b = JSON.parse(raw);
      if (b && typeof b === "object") {
        if (b.progress && typeof b.progress === "object") setProgress(b.progress);
        if (Number.isFinite(b.koroks)) setKoroks(b.koroks);
        if (b.notes && typeof b.notes === "object") setNotes(b.notes);
        if (b.armorTier && typeof b.armorTier === "object") setArmorTier(b.armorTier);
        if (Array.isArray(b.recipes)) setRecipes(b.recipes);
        return true;
      }
    } catch (e) {}
    return false;
  }, []);

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
    let done = 0, total = 0;
    for (const g of SHRINES) g.shrines.forEach((_, i) => { total++; if (progress["shr_" + g.regionKey + "_" + i]) done++; });
    return { done, total };
  }, [progress, SHRINES]);

  const extraStats = useMemo(() => {
    let mem = 0, memTotal = 0, sq = 0, sqTotal = 0, gf = 0, arm = 0;
    for (const reg of REGIONS) for (const sec of reg.sections) for (const st of sec.steps) if (st.id.indexOf("m_l") === 0) { memTotal++; if (progress[st.id]) mem++; }
    SIDE_QUESTS.forEach((g, ri) => g.quests.forEach((_, qi) => { sqTotal++; if (progress["sq_" + ri + "_" + qi]) sq++; }));
    GREAT_FAIRIES.forEach((_, i) => { if (progress["gf_" + i]) gf++; });
    ARMOR.sets.forEach((_, i) => { if (progress["arm_" + i]) arm++; });
    return { mem, memTotal, sq, sqTotal, gf, gfTotal: GREAT_FAIRIES.length, arm, armTotal: ARMOR.sets.length };
  }, [progress]);

  const currentRegion = REGIONS.find((r) => r.id === region) || REGIONS[0];

  const statusOf = useCallback((secId) => { const s = sectionStats[secId]; if (!s || s.total === 0) return "idle"; if (s.complete) return "done"; if (s.done > 0) return "active"; return "idle"; }, [sectionStats]);

  const continueTarget = useMemo(() => {
    for (const reg of REGIONS) for (const sec of reg.sections) { const s = sectionStats[sec.id]; if (s && s.total > 0 && !s.complete) return { regionId: reg.id, sec }; }
    return null;
  }, [sectionStats]);
  // v9: the single furthest-progressed uncompleted step — "you're here" on the linear spine.
  // Follows the main-quest spine (k:"step") ONLY: loot/optional pickups are skippable (you can grab a
  // Traveler's Bow from a different chest, or just miss a Claymore), so an unchecked side-collectible must
  // never trap Resume in the past. reward-only sections (Master Sword, the final blow) aren't anchors either —
  // they have no checkable step and you pass them by being there.
  const resumeTarget = useMemo(() => {
    // "You're here" = the FRONTIER: the next mandatory (k:"step") step AFTER your furthest completed step —
    // not the first gap. Using furthest progress (not first incomplete) means a skipped earlier step — e.g. an
    // optional Warm Doublet you never grabbed but walked past — can never drag Resume back into the past. (v12.5)
    const spine = [];
    for (const reg of REGIONS) for (const sec of reg.sections) for (const step of sec.steps)
      if (step.k === "step") spine.push({ regionId: reg.id, secId: sec.id, stepId: step.id, regionName: reg.name, secName: sec.name, done: !!progress[step.id] });
    let lastDone = -1;
    for (let i = 0; i < spine.length; i++) if (spine[i].done) lastDone = i;
    for (let i = lastDone + 1; i < spine.length; i++) if (!spine[i].done) { const { done, ...t } = spine[i]; return t; }
    return null; // everything ahead of your furthest point is done → you've reached the end
  }, [progress]);
  const resumeIdx = useMemo(() => resumeTarget ? REGIONS.findIndex((r) => r.id === resumeTarget.regionId) : REGIONS.length, [resumeTarget]);

  const jumpTo = useCallback((regionId, secId) => {
    setTab("journey"); setRegion(regionId); setOpenSections((o) => ({ ...o, [secId]: true }));
    setTimeout(() => { const el = document.getElementById("sec-" + secId); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
  }, []);
  // v9: jump straight to a step, open its section, scroll it to center, and flash it
  const jumpToStep = useCallback((regionId, secId, stepId) => {
    setTab("journey"); setRegion(regionId); setQuery(""); setOpenSections((o) => ({ ...o, [secId]: true }));
    setStepFlash(stepId);
    setTimeout(() => { const el = document.getElementById("step-" + stepId) || document.getElementById("sec-" + secId); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 90);
    setTimeout(() => setStepFlash(null), 2200);
  }, []);
  const openRegion = useCallback((regionId) => {
    const reg = REGIONS.find((r) => r.id === regionId);
    const firstIncomplete = reg.sections.find((s) => { const st = sectionStats[s.id]; return st && st.total > 0 && !st.complete; }) || reg.sections[0];
    jumpTo(regionId, firstIncomplete.id);
  }, [sectionStats, jumpTo]);
  const jumpShrineRegion = useCallback((rk) => {
    setTab("shrines"); setQuery(""); setOpenSections((o) => ({ ...o, ["shrg_" + rk]: true }));
    setTimeout(() => { const el = document.getElementById("shrg-" + rk); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
  }, []);
  // v12.3: "I'm here" pin + recents. pinShrine marks the current shrine; focusShrine scrolls to + flashes any shrine.
  const pinShrine = useCallback((id) => {
    setShrinePin(id);
    if (id) setShrineRecents((r) => [id, ...r.filter((x) => x !== id)].slice(0, 8));
  }, []);
  const focusShrine = useCallback((rk, id) => {
    setTab("shrines"); setQuery("");
    setOpenSections((o) => ({ ...o, ["shrg_" + rk]: true }));
    setShrineRecents((r) => [id, ...r.filter((x) => x !== id)].slice(0, 8));
    setShrineFlash(id);
    setTimeout(() => { const el = document.getElementById("shrow-" + id); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 90);
    setTimeout(() => setShrineFlash(null), 2200);
  }, []);

  const q = query.trim().toLowerCase();
  const filterSections = useMemo(() => {
    if (!q) return currentRegion.sections;
    return currentRegion.sections.map((sec) => {
      const match = sec.name.toLowerCase().includes(q) || (sec.sub || "").toLowerCase().includes(q);
      const steps = match ? sec.steps : sec.steps.filter((s) => s.t.toLowerCase().includes(q));
      return steps.length ? { ...sec, steps } : null;
    }).filter(Boolean);
  }, [q, currentRegion]);
  // v9: this region sits ahead of where you are on the path → veil its rewards/bosses (spoiler mode, not while searching)
  const regionVeiled = useMemo(() => spoiler && !q && REGIONS.findIndex((r) => r.id === currentRegion.id) > resumeIdx, [spoiler, q, currentRegion, resumeIdx]);

  return (
    <div className="app">
      <StyleBlock />
      <header className="topbar">
        <div className="brand">
          <span className="eye" aria-hidden><Glyph name="eye" size={30} /></span>
          <div><div className="kicker">Sheikah Slate · Adventure Log</div><h1 className="title">Hyrule Companion</h1></div>
        </div>
        <div className="topbar-r">
          {resumeTarget && <button className="resume-trigger" onClick={() => jumpToStep(resumeTarget.regionId, resumeTarget.secId, resumeTarget.stepId)} aria-label={"Resume — you're here: " + resumeTarget.secName}><Glyph name="pin" size={15} /><span>Resume</span></button>}
          <button className="search-trigger" onClick={() => { setSearchOpen(true); }} aria-label="Search everything"><Glyph name="search" size={18} /></button>
          <div className="region-chip">{pct}%</div>
        </div>
      </header>

      {searchOpen && (
        <SearchOverlay query={gquery} setQuery={setGquery} onClose={() => setSearchOpen(false)}
          data={{ REGIONS, SHRINES, ARMOR, BESTIARY, RECIPES, SIDE_QUESTS, TOWERS }}
          nav={{
            step: (rid, sid) => jumpTo(rid, sid),
            shrine: (rk, sid) => (sid ? focusShrine(rk, sid) : jumpShrineRegion(rk)),
            guide: (seg) => { setTab("guide"); setGuideSub(seg); },
            cook: () => setTab("cook"),
          }} />
      )}

      <main className="body" key={tab}>
        {!loaded ? (<div className="loading">Syncing the Slate…</div>) : tab === "status" ? (
          <div className="status">
            <GamePicker games={games} game={game} setGame={setGame} />
            <div className="hero">
              <div className="hero-ring" style={{ background: `conic-gradient(var(--cyan) ${pct * 3.6}deg, rgba(255,255,255,0.07) 0deg)` }}>
                <div className="hero-ring-in"><span className="hero-pct">{pct}%</span><span className="hero-pct-l">Overall</span></div>
              </div>
              <div className="hero-side">
                <div className="hero-line"><span className="hero-num">{done}</span><span className="hero-num-l">/ {total} steps done</span></div>
                <div className="hero-line"><span className="hero-num">{inventory.invDone}</span><span className="hero-num-l">/ {inventory.invTotal} items found</span></div>
                {resumeTarget ? (<button className="hero-cont" onClick={() => jumpToStep(resumeTarget.regionId, resumeTarget.secId, resumeTarget.stepId)}><span className="hero-cont-k"><Glyph name="pin" size={13} /> Resume — you're here</span><span className="hero-cont-s">{resumeTarget.secName}</span></button>) : (<div className="hero-done">All chapters complete — onward!</div>)}
              </div>
            </div>

            {Object.keys(MAP_NODES || {}).length > 0 && <div className="panel">
              <div className="panel-h">Map of Hyrule</div>
              <HyruleMap shrines={SHRINES} nodes={MAP_NODES} beasts={MAP_BEASTS} progress={progress} onJump={jumpShrineRegion} />
            </div>}

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
              <div className="panel-h">{terms.orbs}</div>
              <div className="orb-row">
                <div className="orb-big"><Glyph name="orb" size={28} /></div>
                <div className="orb-meta">
                  <div className="orb-count">{inventory.orbsDone}<span className="dim"> {terms.orbWord}</span></div>
                  <div className="orb-sub">{upgrades >= 1 ? `${upgrades} upgrade${upgrades > 1 ? "s" : ""} earned (4 ${terms.orbWord} each) — pray at a Goddess Statue` : `${4 - (inventory.orbsDone % 4)} more for your next upgrade`}</div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">Shrines</div>
              <button className="reg-row" onClick={() => setTab("shrines")}>
                <span className="reg-ic"><Glyph name="shrine" size={18} /></span>
                <span className="reg-name">All {shrineStats.total} shrines</span>
                <span className="reg-bar"><span className="reg-fill" style={{ width: (shrineStats.total ? shrineStats.done / shrineStats.total * 100 : 0) + "%", background: shrineStats.total && shrineStats.done === shrineStats.total ? "var(--cyan)" : "var(--orange)" }} /></span>
                <span className={"reg-count" + (shrineStats.total && shrineStats.done === shrineStats.total ? " reg-done" : "")}>{shrineStats.done}/{shrineStats.total}</span>
              </button>
            </div>

            {(extraStats.memTotal > 0 || extraStats.gfTotal > 0 || extraStats.sqTotal > 0 || KOROKS) && <div className="panel">
              <div className="panel-h">Collectibles</div>
              {extraStats.memTotal > 0 && <button className="reg-row" onClick={() => openRegion("memories")}>
                <span className="reg-ic"><Glyph name="camera" size={16} /></span><span className="reg-name">Memories</span>
                <span className="reg-bar"><span className="reg-fill" style={{ width: (extraStats.mem / extraStats.memTotal * 100) + "%", background: extraStats.mem === extraStats.memTotal ? "var(--cyan)" : "var(--orange)" }} /></span>
                <span className={"reg-count" + (extraStats.mem === extraStats.memTotal ? " reg-done" : "")}>{extraStats.mem}/{extraStats.memTotal}</span>
              </button>}
              {extraStats.gfTotal > 0 && <button className="reg-row" onClick={() => { setTab("guide"); setGuideSub("fairies"); }}>
                <span className="reg-ic"><Glyph name="fairy" size={16} /></span><span className="reg-name">Great Fairies</span>
                <span className="reg-bar"><span className="reg-fill" style={{ width: (extraStats.gf / extraStats.gfTotal * 100) + "%", background: extraStats.gf === extraStats.gfTotal ? "var(--cyan)" : "var(--orange)" }} /></span>
                <span className={"reg-count" + (extraStats.gf === extraStats.gfTotal ? " reg-done" : "")}>{extraStats.gf}/{extraStats.gfTotal}</span>
              </button>}
              {extraStats.sqTotal > 0 && <button className="reg-row" onClick={() => { setTab("guide"); setGuideSub("quests"); }}>
                <span className="reg-ic"><Glyph name="scroll" size={16} /></span><span className="reg-name">Side quests</span>
                <span className="reg-bar"><span className="reg-fill" style={{ width: (extraStats.sq / extraStats.sqTotal * 100) + "%", background: extraStats.sq === extraStats.sqTotal ? "var(--cyan)" : "var(--orange)" }} /></span>
                <span className={"reg-count" + (extraStats.sq === extraStats.sqTotal ? " reg-done" : "")}>{extraStats.sq}/{extraStats.sqTotal}</span>
              </button>}
              {KOROKS && <button className="reg-row" onClick={() => { setTab("guide"); setGuideSub("koroks"); }}>
                <span className="reg-ic"><Glyph name="leaf" size={16} /></span><span className="reg-name">Korok seeds</span>
                <span className="reg-bar"><span className="reg-fill" style={{ width: Math.min(100, koroks / 441 * 100) + "%", background: koroks >= 441 ? "var(--cyan)" : "var(--moss)" }} /></span>
                <span className="reg-count">{koroks}</span>
              </button>}
            </div>}

            {STATUS_RUNES.length > 0 && <div className="panel">
              <div className="panel-h">{terms.runesLabel}</div>
              <div className="rune-row">
                {STATUS_RUNES.map((r) => (<div key={r.name} className={"rune-pip" + (progress[r.step] ? " rune-on" : "")}><Glyph name={r.glyph} size={24} /><span>{r.name}</span></div>))}
              </div>
            </div>}

            {CHAMPIONS.length > 0 && <div className="panel">
              <div className="panel-h">{terms.championsLabel}</div>
              <div className="champ-row">
                {CHAMPIONS.map((ch) => { const on = ch.step && progress[ch.step]; return (
                  <div key={ch.name} className={"champ-pip" + (on ? " champ-on" : "")}>
                    <Glyph name="champion" size={20} />
                    <div className="champ-txt"><span className="champ-name">{ch.name}</span><span className="champ-note">{on ? ch.note : ch.from}</span></div>
                  </div>); })}
              </div>
            </div>}

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

            {currentRegion.kind === "beast" && (<div className="beast-banner"><Glyph name="beast" size={18} /> {terms.regionBanner} · {currentRegion.champion ? (regionVeiled && !revealed.has("champ_" + currentRegion.id) ? <button className="veil-inline" onClick={() => reveal("champ_" + currentRegion.id)}>grants ••• tap to reveal</button> : <>grants <b>{currentRegion.champion}</b></>) : "free a sage"}</div>)}
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
                  {sec.reward && (regionVeiled && !revealed.has("rwd_" + sec.id)
                    ? <button className="reward-banner reward-veil" onClick={() => reveal("rwd_" + sec.id)}><Glyph name="eye" size={14} /> Grants: <span className="veil-tap">tap to reveal</span></button>
                    : <div className="reward-banner"><Glyph name="eye" size={14} /> Grants: {sec.reward}</div>)}
                  {open && (
                    <ul className="steps">
                      {sec.steps.map((step) => {
                        const checkable = CHECKABLE.has(step.k); const meta = KIND_META[step.k] || KIND_META.step; const checked = !!progress[step.id];
                        const hidden = regionVeiled && step.k === "reward" && !revealed.has(step.id); // veil the "you get X" payoff until tapped
                        return (
                          <li id={"step-" + step.id} key={step.id} className={"step k-" + step.k + (checked ? " checked" : "") + (stepFlash === step.id ? " step-hl" : "")}>
                            {checkable ? (<button className={"box" + (checked ? " box-on" : "") + (flash === step.id ? " box-flash" : "")} onClick={() => toggleStep(step.id)} aria-label={checked ? "Mark not done" : "Mark done"}>{checked && <Glyph name="check" size={15} />}</button>) : (<span className="dot" style={{ background: meta.color }} aria-hidden />)}
                            <div className="step-body">
                              <span className="tag" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
                              {hidden
                                ? <span className="step-text"><button className="spoiler-hint" onClick={() => reveal(step.id)}>reward hidden — tap to reveal</button></span>
                                : <span className="step-text">{step.t}</span>}
                              {step.items && !hidden && (<span className="step-items">{step.items.map((it, i) => <span key={i} className="chip">＋ {it.name}</span>)}</span>)}
                              {step.stuck && !hidden && <StuckReveal id={step.id} text={step.stuck} />}
                              <NoteAffordance id={step.id} notes={notes} setNote={setNote} open={noteOpen} setOpen={setNoteOpen} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}

            {!q && region === postRegionId && ROADMAP.length > 0 && (
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
          <ShrinesView groups={SHRINES} progress={progress} toggleStep={toggleStep} openSections={openSections} toggleSection={toggleSection} query={query} setQuery={setQuery} stats={shrineStats} notes={notes} setNote={setNote} noteOpen={noteOpen} setNoteOpen={setNoteOpen} spoiler={spoiler} regionMaps={REGION_MAPS} flash={flash} shrinePin={shrinePin} pinShrine={pinShrine} clearPin={() => setShrinePin(null)} shrineRecents={shrineRecents} focusShrine={focusShrine} shrineFlash={shrineFlash} />
        ) : tab === "items" ? (
          <PouchView inventory={inventory} progress={progress} jumpTo={jumpTo} regions={REGIONS} region={region} cats={CATS} />
        ) : tab === "cook" ? (
          <CookView ingredients={COOK_INGREDIENTS} recipes={RECIPES} rules={COOK_RULES} cooking={COOKING} saved={recipes} setSaved={setRecipes} />
        ) : tab === "library" ? (
          <LibraryView books={LORE} userBooks={userBooks} onImportBooks={importBooks} onRemoveBook={removeUserBook} bookBusy={bookBusy} getPageBlob={(id, name) => booksDB.getPage(id, name)} reading={reading} setReading={setReading} bookmarks={bookmarks} setBookmarks={setBookmarks} prefs={readerPrefs} setPrefs={setReaderPrefs} loreArt={loreArt} setLoreArt={setLoreArt} />
        ) : (
          <div className="ref">
            <div className="seg seg-scroll">
              {guideSegs.map(([id, label]) => (
                <button key={id} className={"seg-btn" + (guideSub === id ? " seg-on" : "")} onClick={() => setGuideSub(id)}>{label}</button>
              ))}
            </div>
            {guideSub === "runes" ? (
              <>
                <p className="ref-lede">Your core {terms.runesLabel.replace(/ Unlocked$/, "").toLowerCase()} — every shrine and overworld puzzle is solved with these.</p>
                {RUNES.map((rn) => (
                  <div className="rune-card" key={rn.id}>
                    <div className="rune-icon"><Glyph name={rn.glyph} size={30} /></div>
                    <div className="rune-cbody"><div className="rune-top"><span className="rune-name">{rn.name}</span><span className="rune-from">{rn.from}</span></div><p className="rune-what">{rn.what}</p><p className="rune-tip">▸ {rn.tip}</p></div>
                  </div>
                ))}
              </>
            ) : guideSub === "armor" ? <ArmorView data={ARMOR} progress={progress} toggleStep={toggleStep} armorTier={armorTier} setTier={setTier} />
            : guideSub === "fairies" ? <FairiesView data={GREAT_FAIRIES} progress={progress} toggleStep={toggleStep} />
            : guideSub === "towers" ? <TowersView data={TOWERS} />
            : guideSub === "quests" ? <QuestsView data={SIDE_QUESTS} progress={progress} toggleStep={toggleStep} />
            : guideSub === "enemies" ? <EnemiesView data={BESTIARY} />
            : guideSub === "koroks" ? <KoroksView data={KOROKS} koroks={koroks} setKoroks={setKoroks} />
            : guideSub === "world" ? <WorldView data={WORLD} />
            : guideSub === "settings" ? <SettingsView spoiler={spoiler} setSpoiler={setSpoiler} doExport={exportSave} doImport={importSave} confirmReset={confirmReset} setConfirmReset={setConfirmReset} doReset={resetAll} />
            : (
              <>
                <p className="ref-lede">The handful of things that stop the early game from feeling brutal.</p>
                {TIPS.map((g) => (<div className="tip-card" key={g.id}><div className="tip-name">{g.name}</div><ul className="tip-list">{g.items.map((it, idx) => <li key={idx}>{it}</li>)}</ul></div>))}
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
        <TabBtn active={tab === "library"} onClick={() => setTab("library")} glyph="scroll" label="Lore" />
      </nav>
    </div>
  );
}

function TabBtn({ active, onClick, glyph, label }) {
  return (<button className={"tab" + (active ? " tab-on" : "")} onClick={onClick}><Glyph name={glyph} size={21} /><span>{label}</span></button>);
}

/* ============================================================ LORE LIBRARY TAB (v11) ============================================================ */
/* A reader for original, sourced Zelda lore. Page-turn engine = CSS multi-column flow inside a
   fixed-height viewport, shifted by translateX one page-width at a time (no epub.js, fully offline). */
const LORE_THEMES = {
  slate: { bg: "var(--abyss)", fg: "var(--parch)", dim: "var(--parch-dim)" },
  sepia: { bg: "#efe5d0", fg: "#3b2f1d", dim: "#8a7252" },
  night: { bg: "#04070a", fg: "#c6cec8", dim: "#6f8489" },
};
const LORE_SCALES = [0.9, 1, 1.14, 1.3];
const LORE_NOTE = { canon: { label: "Canon", glyph: "◈" }, creator: { label: "Creator note", glyph: "✦" }, theory: { label: "Theory", glyph: "◇" } };

// Render full-screen readers at document.body level so they escape the tab content's
// stacking context (.body has z-index:1) and any ancestor transform — otherwise the
// fixed reader gets painted under the tab bar / offset by the containing block. (v12.2 fix)
const portal = (node) => (typeof ReactDOM !== "undefined" && ReactDOM.createPortal && typeof document !== "undefined")
  ? ReactDOM.createPortal(node, document.body) : node;

const BOOK_HUES = {
  historia: ["#1d3a2e", "#0b1812"], ootmanga: ["#37202f", "#140a11"],
  explorer: ["#163039", "#091820"], pathways: ["#332c17", "#14110a"],
  yuwguide: ["#2a1c16", "#130c09"], _default: ["#1b2b33", "#0b151a"],
};

function BookSpine({ book, pct, done, onOpen, confirming, onAskRemove, onConfirmRemove }) {
  const hue = BOOK_HUES[book.id] || BOOK_HUES._default;
  const sub = book.type === "pages" ? book.pages + " pages" : "text · readable";
  return (
    <div className="bk-cell">
      <button className="bk-spine" style={{ "--bk1": hue[0], "--bk2": hue[1] }} onClick={onOpen}>
        <span className="bk-spine-band" />
        <span className="bk-spine-emblem"><Glyph name="book" size={17} /></span>
        <span className="bk-spine-title">{book.title}</span>
        <span className="bk-spine-by">{book.author}{book.year ? " · " + book.year : ""}</span>
        <span className="bk-spine-kind">{book.kind}</span>
        {pct > 0 && <span className="bk-spine-bar"><span style={{ width: Math.max(5, pct) + "%" }} /></span>}
        {pct > 0 && <span className="bk-spine-badge">{done ? "✓ read" : pct + "%"}</span>}
      </button>
      <div className="bk-cell-foot">
        <span className="bk-cell-sub">{sub}</span>
        {confirming
          ? <span className="bk-rm-grp"><button className="bk-rm-yes" onClick={onConfirmRemove}>Remove</button><button className="bk-rm-no" onClick={onAskRemove}>keep</button></span>
          : <button className="bk-rm" onClick={onAskRemove}>remove</button>}
      </div>
    </div>
  );
}

function LibraryView({ books, userBooks, onImportBooks, onRemoveBook, bookBusy, getPageBlob, reading, setReading, bookmarks, setBookmarks, prefs, setPrefs, loreArt, setLoreArt }) {
  const [openId, setOpenId] = useState(null);
  const [confirmRm, setConfirmRm] = useState(null);
  const fileRef = useRef(null);
  const lore = books || [], shelf = userBooks || [];
  const all = useMemo(() => [...(books || []), ...(userBooks || [])], [books, userBooks]);
  const open = openId ? all.find((b) => b.id === openId) : null;
  const cont = useMemo(() => {
    let best = null;
    for (const b of all) { const r = reading[b.id]; if (r && (r.pct || 0) < 0.985 && (r.at || 0)) { if (!best || (r.at || 0) > (reading[best.id].at || 0)) best = b; } }
    return best;
  }, [all, reading]);

  if (open) {
    const tog = () => setBookmarks((m) => { const n = { ...m }; if (n[open.id]) delete n[open.id]; else n[open.id] = { at: Date.now() }; return n; });
    if (open.type === "pages")
      return portal(<BookReader book={open} getPageBlob={getPageBlob} reading={reading} setReading={setReading} bookmarked={!!bookmarks[open.id]} toggleBookmark={tog} onClose={() => setOpenId(null)} />);
    const chapter = open.type === "text" ? { ...open, eyebrow: open.eyebrow || ((open.author ? open.author + " · " : "") + (open.kind || "Guide")) } : open;
    return portal(<LoreReader chapter={chapter} prefs={prefs} setPrefs={setPrefs} reading={reading} setReading={setReading} loreArt={loreArt} setLoreArt={setLoreArt}
      bookmarked={!!bookmarks[open.id]} toggleBookmark={tog} onClose={() => setOpenId(null)} />);
  }

  return (
    <div className="ref">
      <h2 className="ref-title">Lore Library</h2>
      <p className="ref-lede">The real story of Hyrule — sourced, spoiler-aware, and written to be read. Tap a tale to open it.</p>
      {cont && (() => { const r = reading[cont.id]; const pct = Math.round((r.pct || 0) * 100); return (
        <button className="lore-cont" onClick={() => setOpenId(cont.id)}>
          <span className="lore-cont-bar" style={{ width: Math.max(3, pct) + "%" }} />
          <span className="lore-cont-k">Continue reading</span>
          <span className="lore-cont-t">{cont.title}</span>
          <span className="lore-cont-s">{pct}% · {cont.eyebrow || cont.kind}</span>
        </button>); })()}
      <div className="lore-shelf">
        {lore.map((b, i) => { const r = reading[b.id]; const pct = r ? Math.round((r.pct || 0) * 100) : 0; const done = pct >= 98; return (
          <button key={b.id} className="lore-card" onClick={() => setOpenId(b.id)}>
            <span className="lore-card-no">{String(i + 1).padStart(2, "0")}</span>
            <span className="lore-card-body">
              <span className="lore-card-eye">{b.eyebrow}</span>
              <span className="lore-card-title">{b.title}</span>
              <span className="lore-card-meta">{b.estMin ? b.estMin + " min read" : ""}{bookmarks[b.id] ? " · ◈ saved" : ""}{pct > 0 ? " · " + (done ? "finished" : pct + "%") : ""}</span>
            </span>
            {pct > 0 && (<span className="lore-card-ring" style={{ background: "conic-gradient(var(--cyan) " + (pct * 3.6) + "deg, rgba(255,255,255,0.09) 0)" }}><span className="lore-card-ring-in">{done ? <Glyph name="check" size={12} /> : pct}</span></span>)}
          </button>); })}
      </div>

      <div className="bk-shelf-head">
        <h3 className="bk-shelf-title"><Glyph name="book" size={14} /> Bookshelf</h3>
        <button className="bk-add" onClick={() => fileRef.current && fileRef.current.click()}>＋ Add a book</button>
      </div>
      <p className="bk-shelf-note">Your own books &amp; comics, stored <b>only on this device</b> — never uploaded or published. Import the <code>.hbook.zip</code> packs (in iCloud → <code>_companion-packs</code>).</p>
      <input type="file" accept=".zip,application/zip" multiple ref={fileRef} onChange={(e) => { onImportBooks(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
      {bookBusy && (
        <div className={"bk-busy" + (bookBusy.error ? " bk-busy-err" : "")}>
          {bookBusy.error
            ? "Couldn't import " + bookBusy.name + " — " + bookBusy.error
            : "Importing " + bookBusy.name + "… " + (bookBusy.total ? Math.round((bookBusy.done / bookBusy.total) * 100) + "%" : "reading")}
        </div>)}
      {shelf.length === 0
        ? <button className="bk-empty" onClick={() => fileRef.current && fileRef.current.click()}><b>Your bookshelf is empty.</b><span>Tap to add a book pack.</span></button>
        : <div className="bk-grid">{shelf.map((b) => { const r = reading[b.id]; const pct = r ? Math.round((r.pct || 0) * 100) : 0; const done = pct >= 98; return (
            <BookSpine key={b.id} book={b} pct={pct} done={done} onOpen={() => setOpenId(b.id)}
              confirming={confirmRm === b.id} onAskRemove={() => setConfirmRm(confirmRm === b.id ? null : b.id)}
              onConfirmRemove={() => { onRemoveBook(b.id); setConfirmRm(null); }} />
          ); })}</div>}

      <p className="panel-note" style={{ marginTop: 14 }}>Lore passages are tagged <b style={{ color: "var(--cyan)" }}>Canon</b>, <b style={{ color: "var(--gold)" }}>Creator</b>, or <b style={{ color: "var(--orange)" }}>Theory</b>. Your imported books are your own copies — the lore tales above are sourced from them and the other guides.</p>
      <div className="footer-space" />
    </div>
  );
}

function BookReader({ book, getPageBlob, reading, setReading, bookmarked, toggleBookmark, onClose }) {
  const files = book.files || [];
  const total = files.length;
  const [page, setPage] = useState(() => Math.min(Math.max(0, (reading[book.id] && reading[book.id].page) || 0), Math.max(0, total - 1)));
  const [urls, setUrls] = useState({});
  const [fit, setFit] = useState("page"); // 'page' = whole page (swipe) · 'width' = fill width + scroll
  const urlsRef = useRef({});
  const stageRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const want = [page, page + 1, page - 1, page + 2].filter((i) => i >= 0 && i < total);
      const next = { ...urlsRef.current };
      for (const i of want) {
        if (next[i]) continue;
        try { const blob = await getPageBlob(book.id, files[i]); if (!alive) return; if (blob) next[i] = URL.createObjectURL(blob); } catch (e) {}
      }
      for (const k of Object.keys(next)) { const i = +k; if (Math.abs(i - page) > 3) { URL.revokeObjectURL(next[i]); delete next[i]; } }
      urlsRef.current = next; if (alive) setUrls({ ...next });
    })();
    return () => { alive = false; };
  }, [page, total, book.id]);
  useEffect(() => () => { Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)); urlsRef.current = {}; }, []);
  useEffect(() => { const pct = total > 1 ? page / (total - 1) : 1; setReading((m) => ({ ...m, [book.id]: { page, pct, at: Date.now() } })); }, [page, total, book.id]);
  useEffect(() => { if (stageRef.current) stageRef.current.scrollTop = 0; }, [page, fit]);

  const [chrome, setChrome] = useState(true);     // tap-center toggles the top/bottom bars
  const [dim, setDim] = useState(0);              // 0..3 night-dim overlay
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpVal, setJumpVal] = useState("");
  const go = useCallback((d) => setPage((p) => Math.max(0, Math.min(total - 1, p + d))), [total]);
  const touch = useRef({ x: 0, y: 0 });
  const swiped = useRef(false);
  const onTS = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTE = (e) => { const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y; if (fit === "page" && Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) { swiped.current = true; go(dx < 0 ? 1 : -1); } };
  const lastTap = useRef(0), tapTimer = useRef(null);
  const onStageTap = () => {
    if (swiped.current) { swiped.current = false; return; }       // a swipe shouldn't toggle chrome
    const now = Date.now();
    if (now - lastTap.current < 280) { clearTimeout(tapTimer.current); lastTap.current = 0; setFit((f) => (f === "page" ? "width" : "page")); } // double-tap = zoom
    else { lastTap.current = now; tapTimer.current = setTimeout(() => setChrome((c) => !c), 280); }
  };
  const doJump = () => { const n = parseInt(jumpVal, 10); if (n >= 1 && n <= total) setPage(n - 1); setJumpOpen(false); setJumpVal(""); };
  const cur = urls[page];

  return (
    <div className={"bk-reader" + (chrome ? "" : " reader-chrome-off")}>
      <div className="bk-rbar reader-bar-top">
        <button className="bk-x" onClick={onClose}>‹ Library</button>
        <div className="bk-rtitle">{book.title}</div>
        <div className="bk-rctrls">
          <button className={"bk-ic" + (dim ? " bk-ic-on" : "")} onClick={() => setDim((d) => (d + 1) % 4)} aria-label="Dim screen">☾</button>
          <button className={"bk-ic" + (bookmarked ? " bk-ic-on" : "")} onClick={toggleBookmark} aria-label="Save place">◈</button>
          <button className="bk-ic" onClick={() => setFit((f) => (f === "page" ? "width" : "page"))} aria-label="Toggle zoom">{fit === "page" ? "⤢" : "▢"}</button>
        </div>
      </div>
      <div className={"bk-stage bk-stage-" + fit} ref={stageRef} onTouchStart={onTS} onTouchEnd={onTE} onClick={onStageTap}>
        {cur ? <img className="bk-img" src={cur} alt={"Page " + (page + 1)} draggable={false} /> : <div className="bk-loading">Loading page {page + 1}…</div>}
        {dim > 0 && <div className="bk-dim" style={{ opacity: dim * 0.22 }} />}
        {fit === "page" && <>
          <button className="bk-edge bk-edge-l" onClick={(e) => { e.stopPropagation(); go(-1); }} disabled={page <= 0} aria-label="Previous page" />
          <button className="bk-edge bk-edge-r" onClick={(e) => { e.stopPropagation(); go(1); }} disabled={page >= total - 1} aria-label="Next page" />
        </>}
        {!chrome && <div className="bk-tiphint">tap to show controls</div>}
      </div>
      <div className="bk-foot reader-bar-bot">
        <button className="bk-nav" onClick={() => go(-1)} disabled={page <= 0} aria-label="Previous page">‹</button>
        <input className="bk-scrub" type="range" min={0} max={Math.max(0, total - 1)} value={page} onChange={(e) => setPage(+e.target.value)} aria-label="Jump to page" />
        {jumpOpen
          ? <span className="bk-jump"><input className="bk-jump-in" type="number" min="1" max={total} value={jumpVal} placeholder={String(page + 1)} autoFocus onChange={(e) => setJumpVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doJump()} /><button className="bk-jump-go" onClick={doJump}>Go</button></span>
          : <button className="bk-page" onClick={() => { setJumpOpen(true); setJumpVal(""); }} aria-label="Type a page number">{page + 1} / {total}</button>}
        <button className="bk-nav" onClick={() => go(1)} disabled={page >= total - 1} aria-label="Next page">›</button>
      </div>
    </div>
  );
}

function LoreBlock({ b }) {
  if (b.t === "art") return null; // banner art is rendered once at the top of the reader, not inline
  if (b.t === "pq") return <blockquote className="lore-pq">{b.text}</blockquote>;
  if (b.t === "h") return <h3 className="lore-h2">{b.text}</h3>;
  if (b.t === "note") {
    const m = LORE_NOTE[b.kind] || LORE_NOTE.canon;
    return (<aside className={"lore-note lore-note-" + (b.kind || "canon")}>
      <span className="lore-note-k">{m.glyph} {m.label}{b.source ? <span className="lore-note-src"> · {b.source}</span> : null}</span>
      <span className="lore-note-t">{b.text}</span>
    </aside>);
  }
  return <p className="lore-p">{b.text}</p>;
}

function LoreReader({ chapter, prefs, setPrefs, reading, setReading, bookmarked, toggleBookmark, onClose, loreArt, setLoreArt }) {
  const PAD = 18, GAP = 36;
  const viewRef = useRef(null);
  const colsRef = useRef(null);
  const [dims, setDims] = useState({ w: 300, h: 440 }); // w = inner page (text) width
  const [page, setPage] = useState(() => (reading[chapter.id] && reading[chapter.id].page) || 0);
  const [pages, setPages] = useState(1);
  const [showSet, setShowSet] = useState(false);
  const theme = LORE_THEMES[prefs.theme] || LORE_THEMES.slate;
  const scaleIdx = prefs.scale != null ? prefs.scale : 1;
  const scale = LORE_SCALES[scaleIdx] || 1;

  useEffect(() => {
    const measure = () => {
      const el = viewRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top;
      const h = Math.max(260, el.clientHeight || Math.round((window.innerHeight || 640) - top - 64));
      setDims({ w: Math.max(200, el.clientWidth - PAD * 2), h });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [showSet]);

  useEffect(() => {
    const el = colsRef.current; if (!el || !dims.w) return;
    const total = Math.max(1, Math.round((el.scrollWidth + GAP) / (dims.w + GAP)));
    setPages(total);
    setPage((p) => Math.min(p, total - 1));
  }, [dims.w, dims.h, chapter.id, scaleIdx, prefs.theme]);

  useEffect(() => {
    const pct = pages > 1 ? page / (pages - 1) : 1;
    setReading((m) => ({ ...m, [chapter.id]: { page, pct, at: Date.now() } }));
  }, [page, pages, chapter.id]);

  const go = useCallback((d) => setPage((p) => Math.max(0, Math.min(pages - 1, p + d))), [pages]);
  const touchX = useRef(0);
  const onTS = (e) => { touchX.current = e.touches[0].clientX; };
  const onTE = (e) => { const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 44) go(dx < 0 ? 1 : -1); };
  const progPct = pages > 1 ? (page / (pages - 1)) * 100 : 100;
  const fileRef = useRef(null);
  const onPickImage = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setLoreArt((m) => ({ ...m, [chapter.id]: r.result })); r.readAsDataURL(f); e.target.value = ""; };
  const personalArt = loreArt && loreArt[chapter.id];
  const artBlock = chapter.blocks.find((b) => b.t === "art");

  return (
    <div className="lore-reader" style={{ "--rbg": theme.bg, "--rfg": theme.fg, "--rdim": theme.dim }}>
      <div className="lore-rbar">
        <button className="lore-x" onClick={onClose}>‹ Library</button>
        <div className="lore-rtitle">{chapter.title}</div>
        <div className="lore-rctrls">
          <button className={"lore-bm" + (bookmarked ? " lore-bm-on" : "")} onClick={toggleBookmark} aria-label="Save this tale">◈</button>
          <button className="lore-aa" onClick={() => setShowSet((s) => !s)} aria-label="Reading settings">Aa</button>
        </div>
      </div>
      {showSet && (
        <div className="lore-settings">
          <div className="lore-set-grp">
            <button className="lore-step" onClick={() => setPrefs((p) => ({ ...p, scale: Math.max(0, (p.scale != null ? p.scale : 1) - 1) }))}>A−</button>
            <button className="lore-step" onClick={() => setPrefs((p) => ({ ...p, scale: Math.min(LORE_SCALES.length - 1, (p.scale != null ? p.scale : 1) + 1) }))}>A+</button>
          </div>
          <div className="lore-set-grp">
            {["slate", "sepia", "night"].map((t) => (<button key={t} className={"lore-sw lore-sw-" + t + ((prefs.theme || "slate") === t ? " lore-sw-on" : "")} onClick={() => setPrefs((p) => ({ ...p, theme: t }))} aria-label={t + " theme"} />))}
          </div>
          <div className="lore-set-grp">
            <button className="lore-step" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Add a cover image">▣ Cover</button>
            {personalArt && <button className="lore-step" onClick={() => setLoreArt((m) => { const n = { ...m }; delete n[chapter.id]; return n; })} aria-label="Reset to original art">Reset</button>}
          </div>
        </div>
      )}
      <input type="file" accept="image/*" ref={fileRef} onChange={onPickImage} style={{ display: "none" }} />
      <div className="lore-view" ref={viewRef}>
        <div className="lore-cols" ref={colsRef} onTouchStart={onTS} onTouchEnd={onTE}
          style={{ width: dims.w + "px", height: dims.h, columnWidth: dims.w + "px", columnGap: GAP + "px", fontSize: Math.round(16 * scale) + "px", transform: "translateX(" + (-page * (dims.w + GAP)) + "px)" }}>
          {(personalArt || artBlock) && (personalArt
            ? <div className="lore-banner"><img className="lore-banner-img" src={personalArt} alt="" /></div>
            : <div className="lore-banner" dangerouslySetInnerHTML={{ __html: artBlock.svg }} />)}
          <div className="lore-eyebrow">{chapter.eyebrow}</div>
          <h1 className="lore-h1">{chapter.title}</h1>
          {chapter.blocks.map((b, i) => <LoreBlock key={i} b={b} />)}
          <div className="lore-end">◈</div>
        </div>
        <button className="lore-edge lore-edge-l" onClick={() => go(-1)} disabled={page <= 0} aria-label="Previous page" />
        <button className="lore-edge lore-edge-r" onClick={() => go(1)} disabled={page >= pages - 1} aria-label="Next page" />
      </div>
      <div className="lore-foot">
        <button className="lore-nav" onClick={() => go(-1)} disabled={page <= 0} aria-label="Previous page">‹</button>
        <input className="lore-scrub" type="range" min={0} max={Math.max(0, pages - 1)} value={page} onChange={(e) => setPage(+e.target.value)} aria-label="Jump to page" />
        <div className="lore-page">{page + 1} / {pages}</div>
        <button className="lore-nav" onClick={() => go(1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
      </div>
    </div>
  );
}

/* ============================================================ SHRINES TAB ============================================================ */
function ShrinesView({ groups, progress, toggleStep, openSections, toggleSection, query, setQuery, stats, notes, setNote, noteOpen, setNoteOpen, spoiler, regionMaps, flash, shrinePin, pinShrine, clearPin, shrineRecents, focusShrine, shrineFlash }) {
  const [revealed, setRevealed] = useState(() => new Set());
  const reveal = (id) => setRevealed((s) => { const n = new Set(s); n.add(id); return n; });
  const q = query.trim().toLowerCase();
  const pct = Math.round((stats.done / 120) * 100);
  const upgrades = Math.floor(stats.done / 4);
  const shrineById = useMemo(() => {
    const m = {};
    groups.forEach((g) => g.shrines.forEach((sh, i) => { m["shr_" + g.regionKey + "_" + i] = { sh, i, regionKey: g.regionKey, regionName: g.regionName }; }));
    return m;
  }, [groups]);
  // search by anything you can remember: name, region, nearest town/landmark, hint, shrine-quest, or puzzle type
  const hay = (g, sh) => (g.regionName + " " + sh.name + " " + sh.location + " " + sh.oneLine + " " + (sh.shrineQuest || "") + " " + (SHRINE_CAT[sh.category] || SHRINE_CAT.puzzle).label).toLowerCase();
  const view = q
    ? groups.map((g) => {
        const shrines = g.shrines.filter((sh, i) => hay(g, sh).includes(q) ? (sh._i = i, true) : false);
        return shrines.length ? { ...g, shrines: shrines.map((sh) => ({ sh, i: sh._i })) } : null;
      }).filter(Boolean)
    : groups.map((g) => ({ ...g, shrines: g.shrines.map((sh, i) => ({ sh, i })) }));
  const pinned = shrinePin && shrineById[shrinePin];
  const recents = (shrineRecents || []).map((id) => ({ id, r: shrineById[id] })).filter((x) => x.r).slice(0, 6);
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
        <input className="search-input" placeholder="Find a shrine — name, region, town, or puzzle type…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button className="search-clear" onClick={() => setQuery("")}>✕</button>}
      </div>
      {pinned && (() => {
        const id = shrinePin, done = !!progress[id];
        return (
          <div className={"shrine-pin" + (done ? " shrine-pin-done" : "")}>
            <div className="shrine-pin-k"><Glyph name="pin" size={12} /> You're here{done ? " · cleared" : ""}</div>
            <button className="shrine-pin-main" onClick={() => focusShrine(pinned.regionKey, id)}>
              <div className="shrine-pin-name">{pinned.sh.name}</div>
              <div className="shrine-pin-loc"><Glyph name="tower" size={10} /> {pinned.regionName} · {pinned.sh.location}</div>
              <div className="shrine-pin-hint">{pinned.sh.oneLine}</div>
            </button>
            <div className="shrine-pin-acts">
              <button className="shrine-pin-done-btn" onClick={() => { if (!done) toggleStep(id); }} disabled={done}>{done ? "✓ Done" : "Mark done"}</button>
              <button className="shrine-pin-clear" onClick={clearPin}>Clear pin</button>
            </div>
          </div>
        );
      })()}
      {!q && recents.length > 0 && (
        <div className="shrine-recents">
          <span className="shrine-recents-k">Recent</span>
          {recents.map(({ id, r }) => <button key={id} className={"shrine-chip" + (progress[id] ? " shrine-chip-done" : "") + (shrinePin === id ? " shrine-chip-pin" : "")} onClick={() => focusShrine(r.regionKey, id)}>{progress[id] ? "✓ " : ""}{r.sh.name}</button>)}
        </div>
      )}
      {view.length === 0 && <div className="empty">No shrines match “{query}”.</div>}
      {view.map((g) => {
        const okey = "shrg_" + g.regionKey;
        const open = q ? true : !!openSections[okey];
        const total = groups.find((x) => x.regionKey === g.regionKey).shrines.length;
        const done = groups.find((x) => x.regionKey === g.regionKey).shrines.filter((_, i) => progress["shr_" + g.regionKey + "_" + i]).length;
        return (
          <section id={"shrg-" + g.regionKey} key={g.regionKey} className={"card" + (done === total ? " card-done" : "")}>
            <button className="card-head" onClick={() => !q && toggleSection(okey)}>
              <div className="card-head-main"><div className="card-name">{g.regionName}</div><div className="card-sub">{total} shrines</div></div>
              <div className="card-head-side"><span className={"pips" + (done === total ? " pips-done" : "")}>{done}/{total}</span>{!q && <span className={"chev" + (open ? " chev-open" : "")}>›</span>}</div>
            </button>
            {open && (
              <>
              {!q && regionMaps && regionMaps[g.regionKey] && <RegionMap map={regionMaps[g.regionKey]} shrines={groups.find((x) => x.regionKey === g.regionKey).shrines} regionKey={g.regionKey} progress={progress} toggleStep={toggleStep} />}
              <ul className="steps">
                {g.shrines.map(({ sh, i }) => {
                  const id = "shr_" + g.regionKey + "_" + i; const checked = !!progress[id];
                  const meta = SHRINE_CAT[sh.category] || SHRINE_CAT.puzzle;
                  return (
                    <li key={id} id={"shrow-" + id} className={"step shrine-row" + (checked ? " checked" : "") + (shrineFlash === id ? " step-hl" : "")}>
                      <button className={"box" + (checked ? " box-on" : "") + (flash === id ? " box-flash" : "")} onClick={() => toggleStep(id)} aria-label={checked ? "Mark not done" : "Mark done"}>{checked && <Glyph name="check" size={15} />}</button>
                      <div className="step-body">
                        <div className="shrine-row-top">
                          <span className="tag" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
                          <button className={"shrine-pinbtn" + (shrinePin === id ? " shrine-pinbtn-on" : "")} onClick={() => (shrinePin === id ? clearPin() : pinShrine(id))} aria-label={shrinePin === id ? "Unpin" : "Pin as the shrine you're in"}><Glyph name="pin" size={11} /> {shrinePin === id ? "pinned" : "I'm here"}</button>
                        </div>
                        <span className="step-text"><span className="shrine-num">{i + 1}</span><b className="shrine-name">{sh.name}</b>{spoiler && !revealed.has(id) ? <button className="spoiler-hint" onClick={() => reveal(id)}>— tap to reveal hint</button> : <> — {sh.oneLine}</>}</span>
                        <span className="shrine-loc"><Glyph name="tower" size={11} /> {sh.location}{sh.shrineQuest ? <span className="shrine-q"> · Quest: {sh.shrineQuest}</span> : null}</span>
                        <NoteAffordance id={id} notes={notes} setNote={setNote} open={noteOpen} setOpen={setNoteOpen} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </section>
        );
      })}
      <div className="footer-space" />
    </div>
  );
}

/* ============================================================ GUIDE REFERENCE VIEWS ============================================================ */
function ArmorView({ data, progress, toggleStep, armorTier, setTier }) {
  const tone = (p) => (/begin/i.test(p || "") ? "var(--cyan)" : /mid/i.test(p || "") ? "var(--gold)" : /late/i.test(p || "") ? "var(--malice)" : "var(--cyan-dim)");
  const owned = data.sets.filter((_, i) => progress["arm_" + i]).length;
  return (
    <>
      <p className="ref-lede">Armor sets give passive effects; a full set of 3 (each upgraded) grants a powerful set bonus. Tick what you own and track its upgrade tier (★ = a Great Fairy level).</p>
      <div className="track-meter"><span>Sets owned</span><span className="track-count">{owned}/{data.sets.length}</span></div>
      {data.sets.map((a, i) => {
        const have = !!progress["arm_" + i]; const tier = armorTier[i] || 0;
        return (
        <div className={"rune-card" + (have ? " card-done" : "")} key={i}>
          <div className="rune-icon" style={{ color: have ? "var(--orange)" : "var(--ink-line)" }}><Glyph name="armor" size={28} /></div>
          <div className="rune-cbody">
            <div className="rune-top"><span className="rune-name">{a.name}</span>{a.priority && <span className="prio-pill" style={{ color: tone(a.priority), borderColor: tone(a.priority) }}>{a.priority}</span>}</div>
            <p className="rune-what"><b>Effect:</b> {a.bonus}</p>
            <p className="ref-line"><b>Where:</b> {a.where}</p>
            <p className="ref-line"><b>Pieces:</b> {a.pieces} · <b>Upgrade:</b> {a.upgrade}</p>
            <div className="armor-track">
              <button className={"track-box" + (have ? " track-box-on" : "")} onClick={() => toggleStep("arm_" + i)}>{have ? "✓ Owned" : "Own it"}</button>
              {have && (
                <div className="tier-step">
                  <span className="tier-stars">{[1, 2, 3, 4].map((k) => <span key={k} className={"star" + (k <= tier ? " star-on" : "")} onClick={() => setTier(i, tier === k ? k - 1 : k)}>★</span>)}</span>
                  <span className="tier-label">{tier === 0 ? "base" : "★" + tier}</span>
                </div>
              )}
            </div>
          </div>
        </div>);
      })}
    </>
  );
}
function FairiesView({ data, progress, toggleStep }) {
  const done = data.filter((_, i) => progress["gf_" + i]).length;
  return (
    <>
      <p className="ref-lede">Unlock each Great Fairy Fountain by paying its fee once; afterward she upgrades your armor for monster parts. Each one you unlock raises the upgrade tier for ALL armor. Tick the ones you've found.</p>
      <div className="track-meter"><span>Fountains unlocked</span><span className="track-count">{done}/{data.length}</span></div>
      {data.map((f, i) => {
        const on = !!progress["gf_" + i];
        return (
        <div className={"rune-card" + (on ? " card-done" : "")} key={i}>
          <div className="rune-icon" style={{ color: on ? "var(--heart)" : "var(--ink-line)" }}><Glyph name="fairy" size={28} /></div>
          <div className="rune-cbody">
            <div className="rune-top"><span className="rune-name">{f.name}</span>
              <button className={"track-box" + (on ? " track-box-on" : "")} onClick={() => toggleStep("gf_" + i)}>{on ? "✓ Unlocked" : "Unlock"}</button>
            </div>
            <p className="rune-what">{f.location}</p>
            <p className="rune-tip">◈ {f.region} · Fee: {f.cost}</p>
          </div>
        </div>);
      })}
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
function QuestsView({ data, progress, toggleStep }) {
  const total = data.reduce((n, g) => n + g.quests.length, 0);
  const done = data.reduce((n, g, ri) => n + g.quests.filter((_, qi) => progress["sq_" + ri + "_" + qi]).length, 0);
  return (
    <>
      <p className="ref-lede">A taste of Hyrule's side quests, by region — many reward gear, rupees, or unlock shrines. Hundreds more are out there; these are the standouts. Tick the ones you finish.</p>
      <div className="track-meter"><span>Side quests done</span><span className="track-count">{done}/{total}</span></div>
      {data.map((g, i) => {
        const gd = g.quests.filter((_, qi) => progress["sq_" + i + "_" + qi]).length;
        return (
        <div className="quest-group" key={i}>
          <div className="quest-region">{g.region}<span className="quest-region-c">{gd}/{g.quests.length}</span></div>
          {g.quests.map((qq, j) => {
            const id = "sq_" + i + "_" + j; const on = !!progress[id];
            return (
            <div className={"quest-card" + (on ? " quest-done" : "")} key={j}>
              <button className={"box box-sm" + (on ? " box-on" : "")} onClick={() => toggleStep(id)} aria-label={on ? "Mark not done" : "Mark done"}>{on && <Glyph name="check" size={12} />}</button>
              <div className="quest-body">
                <div className="quest-top"><span className="quest-name">{qq.name}</span>{qq.reward && <span className="quest-reward">◈ {qq.reward}</span>}</div>
                <p className="quest-line">{qq.oneLine}</p>
                {qq.giver && <p className="quest-giver">— {qq.giver}</p>}
              </div>
            </div>);
          })}
        </div>);
      })}
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
function KoroksView({ data, koroks, setKoroks }) {
  const pct = Math.min(100, Math.round((koroks / 441) * 100));
  return (
    <>
      <p className="ref-lede">{data.what}</p>
      <div className="panel korok-counter">
        <div className="korok-c-top">
          <div className="korok-c-num"><span className="hero-num">{koroks}</span><span className="hero-num-l">seeds</span></div>
          <div className="korok-c-btns">
            <button onClick={() => setKoroks((k) => Math.max(0, k - 1))}>−1</button>
            <button onClick={() => setKoroks((k) => k + 1)}>+1</button>
            <button onClick={() => setKoroks((k) => k + 5)}>+5</button>
          </div>
        </div>
        <div className="reg-bar shrine-bar"><span className="reg-fill" style={{ width: pct + "%", background: koroks >= 441 ? "var(--cyan)" : "var(--moss)" }} /></div>
        <p className="korok-c-note">{koroks >= 441 ? "Enough to max every weapon/bow/shield slot!" : `${441 - koroks} more to max all inventory slots (441). 900 seeds exist in total.`}</p>
      </div>
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
      <p className="ref-lede">The systems that tie Hyrule together — how you grow stronger and the rare things worth chasing.</p>
      {data.upgrades && data.upgrades.length > 0 && <div className="tip-card"><div className="tip-name"><Glyph name="orb" size={16} /> Getting stronger</div><ul className="tip-list">{data.upgrades.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
      {data.systems && data.systems.length > 0 && (<><div className="inv-head" style={{ marginTop: 6 }}><span className="inv-head-l"><span className="inv-glyph"><Glyph name="tower" size={18} /></span>Systems</span><span className="inv-count">{data.systems.length}</span></div>
        {data.systems.map((m, i) => (<div className="enemy-row" key={i}><div className="enemy-name">{m.name}</div><p className="enemy-tactic">{m.what || m.use}</p></div>))}</>)}
      {data.materials && data.materials.length > 0 && (<><div className="inv-head" style={{ marginTop: 6 }}><span className="inv-head-l"><span className="inv-glyph"><Glyph name="gem" size={18} /></span>Special materials</span><span className="inv-count">{data.materials.length}</span></div>
        {data.materials.map((m, i) => (<div className="enemy-row" key={i}><div className="enemy-name">{m.name}</div><p className="enemy-tactic">{m.use}</p>{m.where && <p className="enemy-drops">{m.where}</p>}</div>))}</>)}
      {data.fairies && data.fairies.length > 0 && (<><div className="inv-head" style={{ marginTop: 6 }}><span className="inv-head-l"><span className="inv-glyph" style={{ color: "var(--heart)" }}><Glyph name="fairy" size={18} /></span>Great Fairies</span><span className="inv-count">{data.fairies.length}</span></div>
        {data.fairies.map((f, i) => (<div className="enemy-row" key={i}><div className="enemy-name">{f.name}</div><p className="enemy-tactic">{f.location}{f.cost ? " · " + f.cost : ""}</p></div>))}</>)}
      {data.dlc && data.dlc.length > 0 && (
        <div className="tip-card" style={{ marginTop: 12 }}><div className="tip-name"><Glyph name="champion" size={16} /> DLC · Expansion Pass</div><ul className="tip-list">{data.dlc.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
      )}
    </>
  );
}

/* ============================================================ MAP OF HYRULE ============================================================ */
// schematic geographic layout of the 15 shrine regions (original art — no Nintendo map, ADR 0003)
const MAP_NODES = {
  hebra: { x: 58, y: 52, l: "Hebra" }, tabantha: { x: 66, y: 116, l: "Tabantha" }, ridgeland: { x: 106, y: 184, l: "Ridge" },
  gerudo: { x: 64, y: 250, l: "G. Highlands" }, wasteland: { x: 56, y: 320, l: "G. Desert" },
  woodland: { x: 178, y: 92, l: "Woodland" }, central_hyrule: { x: 182, y: 178, l: "Central" },
  great_plateau: { x: 166, y: 250, l: "Plateau" }, lake: { x: 150, y: 330, l: "Lake" }, faron: { x: 218, y: 346, l: "Faron" },
  eldin: { x: 250, y: 92, l: "Eldin" }, akkala: { x: 300, y: 66, l: "Akkala" }, lanayru: { x: 294, y: 174, l: "Lanayru" },
  "dueling-peaks": { x: 228, y: 266, l: "Dueling Pk" }, hateno: { x: 290, y: 286, l: "Hateno" },
};
const MAP_BEASTS = [{ x: 300, y: 150, n: "Ruta" }, { x: 78, y: 96, n: "Medoh" }, { x: 264, y: 70, n: "Rudania" }, { x: 78, y: 296, n: "Naboris" }];
function HyruleMap({ shrines, nodes, beasts, progress, onJump }) {
  const stat = (rk) => { const g = shrines.find((s) => s.regionKey === rk); if (!g) return { d: 0, t: 0 }; let d = 0; g.shrines.forEach((_, i) => { if (progress["shr_" + rk + "_" + i]) d++; }); return { d, t: g.shrines.length }; };
  const r = 11, C = 2 * Math.PI * 11;
  return (
    <div className="hmap-wrap">
      <svg viewBox="0 0 340 384" className="hmap" role="img" aria-label="Map of Hyrule — shrine progress by region">
        <path d="M44 70 Q58 34 120 42 Q210 28 296 52 Q332 120 320 196 Q332 300 276 332 Q200 372 128 354 Q56 360 44 296 Q30 188 44 70 Z" fill="rgba(95,214,226,0.045)" stroke="rgba(95,214,226,0.16)" strokeWidth="1.2" />
        <circle cx="182" cy="178" r="20" fill="none" stroke="rgba(224,80,107,0.35)" strokeWidth="1" strokeDasharray="2 4" />
        {(beasts || []).map((b, i) => (<g key={i} opacity="0.5"><circle cx={b.x} cy={b.y} r="2.4" fill="var(--cyan-dim)" /><text x={b.x} y={b.y - 5} textAnchor="middle" className="hmap-beast">{b.n}</text></g>))}
        {Object.entries(nodes).map(([rk, n]) => {
          const { d, t } = stat(rk); const frac = t ? d / t : 0; const done = t > 0 && d === t;
          const col = done ? "var(--cyan)" : d > 0 ? "var(--orange)" : "var(--ink-line)";
          return (
            <g key={rk} onClick={() => onJump(rk)} style={{ cursor: "pointer" }}>
              <circle cx={n.x} cy={n.y} r={r} fill={done ? "rgba(95,214,226,0.16)" : "rgba(240,144,42,0.07)"} stroke="rgba(255,255,255,0.12)" strokeWidth="1.4" />
              <circle cx={n.x} cy={n.y} r={r} fill="none" stroke={col} strokeWidth="2.6" strokeDasharray={`${(frac * C).toFixed(2)} ${C.toFixed(2)}`} transform={`rotate(-90 ${n.x} ${n.y})`} strokeLinecap="round" />
              <text x={n.x} y={n.y + 3.5} textAnchor="middle" className="hmap-n">{d}</text>
              <text x={n.x} y={n.y + r + 11} textAnchor="middle" className="hmap-l">{n.l}</text>
            </g>
          );
        })}
        <g><circle cx="182" cy="178" r="3" fill="var(--malice)" /><text x="182" y="166" textAnchor="middle" className="hmap-castle">Castle</text></g>
      </svg>
      <p className="map-cap">Tap a region → its shrines · ring = cleared · <span style={{ color: "var(--cyan)" }}>cyan</span> = 100% · <span style={{ color: "var(--malice)" }}>◆</span> Ganon</p>
    </div>
  );
}

/* per-region schematic map (coordinates from build/inline-data → knowledge/region-maps.json) */
const LM_COLOR = { town: "var(--gold)", stable: "var(--moss)", lake: "var(--cyan)", peak: "var(--parch-dim)", beast: "var(--cyan)", "tech-lab": "var(--orange)", landmark: "var(--parch-dim)" };
function RegionMap({ map, shrines, regionKey, progress, toggleStep }) {
  if (!map) return null;
  const short = (s) => (s.length > 15 ? s.slice(0, 14) + "…" : s);
  return (
    <div className="rmap-wrap">
      <svg viewBox="0 0 100 100" className="rmap" role="img" aria-label={"Map of " + regionKey + " shrines"}>
        <rect x="1.5" y="1.5" width="97" height="97" rx="4" fill="rgba(95,214,226,0.03)" stroke="rgba(95,214,226,0.12)" strokeWidth="0.5" />
        {map.landmarks.map((l, i) => (
          <g key={"l" + i} opacity="0.6"><circle cx={l.x} cy={l.y} r="1.1" fill={LM_COLOR[l.kind] || "var(--parch-dim)"} /><text x={l.x} y={l.y - 2.2} textAnchor="middle" className="rmap-lm">{short(l.name)}</text></g>
        ))}
        {map.tower && (<g><path d={"M" + map.tower.x + " " + (map.tower.y - 3.6) + " L" + (map.tower.x + 2.6) + " " + (map.tower.y + 2.2) + " L" + (map.tower.x - 2.6) + " " + (map.tower.y + 2.2) + " Z"} fill="var(--cyan-dim)" opacity="0.85" /><text x={map.tower.x} y={map.tower.y + 5.4} textAnchor="middle" className="rmap-tw">Tower</text></g>)}
        {map.fairy && (<g><circle cx={map.fairy.x} cy={map.fairy.y} r="1.9" fill="var(--heart)" /><text x={map.fairy.x} y={map.fairy.y - 2.6} textAnchor="middle" className="rmap-fr">{map.fairy.name.replace(/^Great Fairy\s+/, "")}</text></g>)}
        {shrines.map((sh, i) => {
          const p = map.shrines[sh.name]; if (!p) return null;
          const id = "shr_" + regionKey + "_" + i; const done = !!progress[id];
          return (
            <g key={id} onClick={() => toggleStep(id)} style={{ cursor: "pointer" }}>
              <circle cx={p.x} cy={p.y} r="3.4" fill={done ? "var(--cyan)" : "rgba(240,144,42,0.14)"} stroke={done ? "var(--cyan)" : "var(--orange)"} strokeWidth="0.9" />
              <text x={p.x} y={p.y + 1.3} textAnchor="middle" className={"rmap-sn" + (done ? " rmap-sn-done" : "")}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
      <p className="map-cap">Tap a dot to mark a shrine · numbers match the list · <span style={{ color: "var(--cyan)" }}>cyan</span> = cleared</p>
    </div>
  );
}

/* ============================================================ BACKUP / RESTORE ============================================================ */
function BackupBox({ doExport, doImport }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [imp, setImp] = useState("");
  const [msg, setMsg] = useState("");
  const reveal = () => { setCode(doExport()); setOpen(true); setMsg(""); };
  const copy = () => { try { navigator.clipboard.writeText(code); setMsg("Copied to clipboard ✓"); } catch (e) { setMsg("Select the text above and copy it manually."); } };
  const restore = () => { const ok = doImport(imp); setMsg(ok ? "Restored ✓ — your progress is back." : "That code didn't look right — check you copied all of it."); if (ok) setImp(""); };
  return (
    <div className="tip-card backup-box">
      <div className="tip-name"><Glyph name="key" size={16} /> Back up / restore progress</div>
      <p className="ref-line" style={{ marginBottom: 10 }}>Your progress lives only on this device. Copy a backup code to keep it safe, or to move it to another phone or tablet.</p>
      <div className="backup-btns"><button className="track-box" onClick={reveal}>{open ? "Refresh code" : "Show backup code"}</button>{open && <button className="track-box" onClick={copy}>Copy</button>}</div>
      {open && <textarea className="backup-ta" readOnly value={code} onFocus={(e) => e.target.select()} />}
      <details className="backup-imp"><summary>Restore from a code</summary>
        <textarea className="backup-ta" placeholder="Paste a backup code here…" value={imp} onChange={(e) => setImp(e.target.value)} />
        <button className="track-box" onClick={restore} disabled={!imp.trim()}>Restore</button>
      </details>
      {msg && <p className="backup-msg">{msg}</p>}
    </div>
  );
}

/* ============================================================ SETTINGS ============================================================ */
function SettingsView({ spoiler, setSpoiler, doExport, doImport, confirmReset, setConfirmReset, doReset }) {
  const ver = (typeof window !== "undefined" && window.__APP_VERSION__) || "dev";
  return (
    <>
      <p className="ref-lede">Make the app yours. Everything here is saved on your device — no account, no server.</p>
      <div className="set-row">
        <div className="set-txt"><div className="set-name">Spoiler-free mode</div><div className="set-sub">Hide shrine solutions, plus the rewards and champions of regions you haven't reached yet — explore first, tap to reveal whenever you want.</div></div>
        <button className={"toggle" + (spoiler ? " toggle-on" : "")} onClick={() => setSpoiler(!spoiler)} role="switch" aria-checked={spoiler} aria-label="Spoiler-free mode"><span className="toggle-knob" /></button>
      </div>
      <div className="set-row">
        <div className="set-txt"><div className="set-name">Version & updates</div><div className="set-sub">You're on build <b style={{ color: "var(--cyan-dim)" }}>{ver}</b>. Updates arrive automatically when you reopen the app online; if a “new version” banner appears, tap Update.</div></div>
      </div>
      <BackupBox doExport={doExport} doImport={doImport} />
      <div className="reset-zone">
        {!confirmReset ? (<button className="reset-btn" onClick={() => setConfirmReset(true)}>Reset all progress</button>) : (
          <div className="reset-confirm"><span>Clear every checkmark, shrine, tracker, and note? This can't be undone — back it up first.</span><div className="reset-actions"><button className="reset-yes" onClick={doReset}>Yes, reset</button><button className="reset-no" onClick={() => setConfirmReset(false)}>Keep it</button></div></div>
        )}
      </div>
    </>
  );
}

/* ============================================================ COOKING TOOL (v10) ============================================================ */
const ROLE_LABEL = { effect: "buff food", neutral: "filler", critter: "critter", monster: "monster part", dragon: "dragon part", special: "special" };

function CookResultCard({ r, toneOf }) {
  if (!r) return <div className="pot-empty"><Glyph name="pot" size={26} /><span>Tap ingredients below — I'll tell you what you'll cook <b>before</b> you waste anything.</span></div>;
  const tone = r.effect ? toneOf(r.effect) : null;
  return (
    <div className={"pot-result" + (r.dubious ? " pot-bad" : r.effect ? " pot-good" : "")}>
      <div className="pot-dish-row">
        <span className="pot-dish">{r.dish}</span>
        {r.effect && <span className={"pot-eff eff-" + tone}>{r.effect}{r.tier ? " · Lv " + r.tier + (r.tierMax ? " (max)" : "") : ""}</span>}
        {r.crit === "on" && <span className="pot-crit">★ critical</span>}
      </div>
      <div className="pot-stats">
        {r.heartyYellow != null ? <span className="pst pst-h">♥ full heal + {r.heartyYellow} bonus</span>
          : r.hearts != null && r.hearts > 0 ? <span className="pst pst-h">♥ ≈ {r.hearts % 1 ? r.hearts.toFixed(2) : r.hearts}</span> : null}
        {r.durSec != null && <span className="pst pst-t">⏱ ≈ {fmtDur(r.durSec)}</span>}
        <span className="pst pst-c">{r.count}/5 in pot</span>
      </div>
      {r.warn.map((w, i) => <div key={i} className={"pot-warn pw-" + w.kind}>{w.t}</div>)}
    </div>
  );
}

function CookView({ ingredients, recipes, rules, cooking, saved, setSaved }) {
  const interactive = ingredients && ingredients.length > 0;
  const [mode, setMode] = useState("make");
  const [pot, setPot] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [goal, setGoal] = useState((COOK_GOALS[0] || {}).effect);

  const result = useMemo(() => cookResult(pot), [pot]);
  const toneOf = useCallback((eff) => ((recipes || []).find((r) => r.eff === eff) || {}).tone || "heart", [recipes]);
  if (!interactive) return <CookReference recipes={recipes} rules={rules} cooking={cooking} />;

  const add = (ing) => setPot((p) => (p.length >= 5 ? p : [...p, ing]));
  const removeAt = (idx) => setPot((p) => p.filter((_, i) => i !== idx));
  const FILTERS = [["all", "All"], ["Hearty", "♥ Hearty"], ["effect", "Buffs"], ["neutral", "Fillers"], ["critter", "Critters"], ["monster", "Monster"], ["dragon", "Dragon"], ["special", "Special"]];
  const ql = q.trim().toLowerCase();
  const picker = ingredients.filter((i) => {
    if (ql && !(i.name.toLowerCase().includes(ql) || (i.effect || "").toLowerCase().includes(ql))) return false;
    if (filter === "all") return true;
    if (["effect", "neutral", "critter", "monster", "dragon", "special"].includes(filter)) return i.role === filter;
    return i.effect === filter;
  });
  const loadStaple = (eff) => {
    const base = ingredients.find((i) => i.effect === eff && i.role === "effect") || ingredients.find((i) => i.effect === eff);
    if (base) { setPot(Array(eff === "Hearty" ? 5 : 4).fill(base)); setMode("make"); }
  };
  const saveCurrent = () => {
    if (!pot.length || !result) return;
    const entry = { names: pot.map((i) => i.name), dish: result.dish, effect: result.effect };
    setSaved([entry, ...(saved || []).filter((s) => s.names.join("|") !== entry.names.join("|"))].slice(0, 40));
  };
  const loadSaved = (s) => { setPot(s.names.map((n) => ingredients.find((i) => i.name === n)).filter(Boolean)); setMode("make"); };
  const delSaved = (idx) => setSaved((saved || []).filter((_, i) => i !== idx));

  const MODES = [["make", "Make"], ["goals", "I need…"], ["browse", "Ingredients"], ["book", "Cookbook"], ["rules", "Rules"]];

  return (
    <div className="ref cookv">
      <h2 className="ref-title">Cooking</h2>
      <p className="ref-lede">The one system the game never explains. Build a pot and I'll predict the dish — and warn you the moment a combo would cancel or waste a rare ingredient.</p>
      <div className="seg seg-scroll">{MODES.map(([k, l]) => <button key={k} className={"seg-btn" + (mode === k ? " seg-on" : "")} onClick={() => setMode(k)}>{l}</button>)}</div>

      {mode === "make" && <>
        <div className="pot-slots">
          {[0, 1, 2, 3, 4].map((i) => {
            const ing = pot[i];
            return <button key={i} className={"pot-slot" + (ing ? " pot-slot-full" : "")} onClick={() => ing && removeAt(i)} aria-label={ing ? "Remove " + ing.name : "Empty slot"}>
              {ing ? <><span className="ps-name">{ing.name}</span><span className="ps-x">✕</span></> : <span className="ps-empty">+</span>}
            </button>;
          })}
        </div>
        <CookResultCard r={result} toneOf={toneOf} />
        <div className="pot-actions">
          <button className="pot-btn" onClick={() => setPot([])} disabled={!pot.length}>Clear</button>
          <button className="pot-btn pot-btn-save" onClick={saveCurrent} disabled={!pot.length}><Glyph name="book" size={13} /> Save to cookbook</button>
        </div>
        <div className="search"><input className="search-input" placeholder="Add an ingredient — search by name or effect…" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="search-clear" onClick={() => setQ("")}>✕</button>}</div>
        <div className="seg seg-scroll cook-filters">{FILTERS.map(([k, l]) => <button key={k} className={"seg-btn" + (filter === k ? " seg-on" : "")} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <div className="ing-grid">
          {picker.map((i) => <button key={i.name} className={"ing-chip ic-" + i.role + (pot.length >= 5 ? " ic-dis" : "")} onClick={() => add(i)} disabled={pot.length >= 5}>
            <span className="ic-name">{i.name}</span>
            <span className="ic-meta">{i.effect ? <span className={"ic-eff eff-" + toneOf(i.effect)}>{i.effect}</span> : <span className="ic-role">{ROLE_LABEL[i.role]}</span>}</span>
          </button>)}
          {picker.length === 0 && <div className="empty">No ingredient matches.</div>}
        </div>
      </>}

      {mode === "goals" && <>
        <p className="panel-note" style={{ margin: "0 0 12px" }}>First-timers think in goals, not combos. Pick what you need — I'll decode the buzzword and give you the dead-simple recipe.</p>
        <div className="goal-grid">{COOK_GOALS.map((g) => <button key={g.goal} className={"goal-chip" + (goal === g.effect ? " goal-on" : "")} onClick={() => setGoal(g.effect)}>{g.goal}</button>)}</div>
        {(() => {
          const g = COOK_GOALS.find((x) => x.effect === goal); const r = (recipes || []).find((x) => x.eff === goal); if (!g) return null;
          return <div className="goal-card">
            <div className={"goal-eff eff-" + toneOf(goal)}>{goal}</div>
            <div className="goal-decode">{g.sub}</div>
            {r && <><div className="recipe-does">{r.does}</div><div className="recipe-key"><b>Use any of:</b> {r.key}</div><div className="recipe-make"><b>Easiest dish:</b> {r.recipe}</div></>}
            <button className="pot-btn pot-btn-save" style={{ marginTop: 10 }} onClick={() => loadStaple(goal)}><Glyph name="pot" size={13} /> Load a sample into the pot</button>
          </div>;
        })()}
        <div className="goal-card goal-money">
          <div className="goal-eff eff-gold">Make money</div>
          <div className="recipe-does">Cooked dishes sell for far more than raw parts. 5 Raw Gourmet Meat → a ~490-rupee skewer; a Lynel-guts monster elixir can fetch 2,000+.</div>
          <div className="recipe-key"><b>Never</b> put gems or ore in a pot — sell those raw or save them for armor upgrades.</div>
        </div>
      </>}

      {mode === "browse" && <>
        <p className="panel-note" style={{ margin: "0 0 10px" }}>The thing the game hides: every ingredient with its effect shown up front. Tap one to drop it in the pot.</p>
        <div className="search"><input className="search-input" placeholder="Search ingredients…" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="search-clear" onClick={() => setQ("")}>✕</button>}</div>
        <div className="seg seg-scroll cook-filters">{FILTERS.map(([k, l]) => <button key={k} className={"seg-btn" + (filter === k ? " seg-on" : "")} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <div className="ing-list">
          {picker.map((i) => <button key={i.name} className="ing-row" onClick={() => add(i)}>
            <span className="ir-main"><span className="ir-name">{i.name}</span>{i.where && <span className="ir-where">{i.where}</span>}</span>
            <span className="ir-side">{i.effect ? <span className={"ic-eff eff-" + toneOf(i.effect)}>{i.effect}</span> : <span className="ic-role">{ROLE_LABEL[i.role]}</span>}{i.sell ? <span className="ir-sell">{i.sell}r</span> : null}</span>
          </button>)}
          {picker.length === 0 && <div className="empty">No ingredient matches.</div>}
        </div>
      </>}

      {mode === "book" && <>
        <p className="panel-note" style={{ margin: "0 0 12px" }}>The cookbook the game refuses to give you. Saved on this device; rides along in your backup.</p>
        {(!saved || saved.length === 0) && <div className="empty">No saved recipes yet. Build a dish in <b>Make</b> and tap “Save to cookbook”.</div>}
        {(saved || []).map((s, idx) => <div className="book-row" key={idx}>
          <button className="book-main" onClick={() => loadSaved(s)}>
            <span className="book-dish">{s.dish}{s.effect ? <span className={"ic-eff eff-" + toneOf(s.effect)}>{s.effect}</span> : null}</span>
            <span className="book-ings">{s.names.join(" + ")}</span>
          </button>
          <button className="book-del" onClick={() => delSaved(idx)} aria-label="Delete">✕</button>
        </div>)}
      </>}

      {mode === "rules" && <CookReference recipes={recipes} rules={rules} cooking={cooking} rulesOnly />}
      <div className="footer-space" />
    </div>
  );
}

// Reference view: rules + go-to recipes + dragon parts (also the TotK / no-data fallback for the Cook tab).
function CookReference({ recipes, rules, cooking, rulesOnly }) {
  return (
    <div className="ref">
      {!rulesOnly && <><h2 className="ref-title">Cooking</h2>
        <p className="ref-lede">Drop ingredients in a pot; the buff comes from the ingredient's prefix. Match one effect to what you need.</p></>}
      <div className="rules">{(rules || []).map((r, i) => <div className="rule" key={i}><span className="rule-dot" />{r}</div>)}</div>
      {!rulesOnly && (recipes || []).map((r) => (
        <div className={"recipe" + (r.now ? " recipe-now" : "")} key={r.eff}>
          <div className={"eff eff-" + r.tone}>{r.eff}</div>
          <div className="recipe-body">{r.now && <div className="recipe-flag">You need this on the Plateau</div>}<div className="recipe-does">{r.does}</div><div className="recipe-key"><b>Use:</b> {r.key}</div><div className="recipe-make"><b>Try:</b> {r.recipe}</div></div>
        </div>
      ))}
      {cooking && cooking.dragons && cooking.dragons.length > 0 && (
        <div className="cook-extra">
          <div className="inv-head"><span className="inv-head-l"><span className="inv-glyph" style={{ color: "var(--heart)" }}><Glyph name="champion" size={18} /></span>Dragon parts (guaranteed crit)</span></div>
          <p className="panel-note" style={{ margin: "0 0 10px" }}>Shoot a passing dragon (never kill it) to knock loose a part — each makes a potent elixir and guarantees a critical cook. Horn shard maxes the timer to 30:00, then claw, fang, scale.</p>
          {cooking.dragons.map((d, i) => (<div className="dragon-row" key={i}><div className="dragon-name">{d.name}<span className="dragon-el">{d.element}</span></div><p className="ref-line">{d.where}{d.parts ? " · " + d.parts : ""}</p></div>))}
        </div>
      )}
      {cooking && cooking.notes && <p className="panel-note" style={{ marginTop: 12 }}>{cooking.notes}</p>}
    </div>
  );
}

/* ============================================================ STUCK? REVEAL (v9) ============================================================ */
/* The GameFAQs "scroll down for the answer," but hidden by default: the step stays scannable,
   the exact how is one tap away. Spoiler-aware content, sourced like the rest of the guide. */
function StuckReveal({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stuck-wrap">
      <button className={"stuck-btn" + (open ? " stuck-open" : "")} onClick={() => setOpen(!open)}><Glyph name="eye" size={11} /> {open ? "Hide hint" : "Stuck? Tap for the exact how"}</button>
      {open && <p className="stuck-text">{text}</p>}
    </div>
  );
}

/* ============================================================ PERSONAL NOTES ============================================================ */
function NoteAffordance({ id, notes, setNote, open, setOpen }) {
  const has = !!notes[id]; const isOpen = open === id;
  return (
    <div className="note-wrap">
      {!isOpen && has && <p className="note-show" onClick={() => setOpen(id)}>{notes[id]}</p>}
      <button className={"note-chip" + (has ? " note-chip-on" : "")} onClick={() => setOpen(isOpen ? null : id)}><Glyph name="pencil" size={11} /> {has ? "Edit note" : "Add note"}</button>
      {isOpen && <textarea className="note-ta" autoFocus placeholder="Your note (saved on this device)…" value={notes[id] || ""} onChange={(e) => setNote(id, e.target.value)} onBlur={() => setOpen(null)} />}
    </div>
  );
}

/* ============================================================ GLOBAL SEARCH ============================================================ */
function PouchView({ inventory, progress, jumpTo, regions, region, cats }) {
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const query = q.trim().toLowerCase();
  const matches = (it) => !query || (it.name + " " + (it.note || "") + " " + (it.where || "")).toLowerCase().includes(query);
  const shown = cats
    .map((cat) => {
      const list = (inventory.byCat[cat.id] || []).filter((it) => (activeCat === "all" || activeCat === cat.id) && matches(it));
      return list.length ? { cat, list } : null;
    })
    .filter(Boolean);
  const totalShown = shown.reduce((n, s) => n + s.list.length, 0);
  return (
    <div className="ref">
      <h2 className="ref-title">Pouch</h2>
      <p className="ref-lede">Everything you collect lands here automatically. Search or filter to find a piece of gear fast; tap an item to jump to where you find it. Found {inventory.invDone} of {inventory.invTotal}.</p>
      <div className="search">
        <input className="search-input" placeholder="Search your pouch — name, where, effect…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="search-clear" onClick={() => setQ("")}>✕</button>}
      </div>
      <div className="seg seg-scroll inv-filter">
        <button className={"seg-btn" + (activeCat === "all" ? " seg-on" : "")} onClick={() => setActiveCat("all")}>All</button>
        {cats.map((c) => { const list = inventory.byCat[c.id]; if (!list || !list.length) return null; const got = list.filter((it) => progress[it.stepId]).length; return (
          <button key={c.id} className={"seg-btn" + (activeCat === c.id ? " seg-on" : "")} onClick={() => setActiveCat(c.id)}>{c.name} <span className="seg-ct">{got}/{list.length}</span></button>
        ); })}
      </div>
      {totalShown === 0 && <div className="empty">{query ? "Nothing in your pouch matches “" + q + "”." : "Nothing here yet — collect items as you play."}</div>}
      {shown.map(({ cat, list }) => {
        const got = list.filter((it) => progress[it.stepId]).length;
        return (
          <div className="inv-cat" key={cat.id}>
            <div className="inv-head"><span className="inv-head-l"><span className="inv-glyph"><Glyph name={cat.glyph} size={18} /></span>{cat.name}</span><span className={"inv-count" + (got === list.length ? " inv-count-done" : "")}>{got}/{list.length}</span></div>
            <div className="inv-grid">
              {list.map((it, i) => { const has = !!progress[it.stepId]; return (
                <button key={it.stepId + i} className={"item" + (has ? " item-on" : "")} onClick={() => jumpTo((regions.find((r) => r.name === it.where) || {}).id || region, it.secId)}>
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
  );
}

function SearchOverlay({ query, setQuery, onClose, nav, data }) {
  const { REGIONS, SHRINES, ARMOR, BESTIARY, RECIPES, SIDE_QUESTS, TOWERS } = data;
  const q = query.trim().toLowerCase();
  const groups = [];
  if (q) {
    const cap = 6;
    const stepHits = [];
    for (const reg of REGIONS) for (const sec of reg.sections) for (const st of sec.steps) {
      if ((sec.name + " " + (sec.sub || "") + " " + st.t).toLowerCase().includes(q)) { stepHits.push({ label: sec.name, sub: st.t, act: () => nav.step(reg.id, sec.id) }); if (stepHits.length >= cap) break; }
    }
    if (stepHits.length) groups.push({ cat: "Walkthrough", glyph: "tower", items: stepHits });
    const shrineHits = [];
    for (const g of SHRINES) g.shrines.forEach((sh, i) => { if (shrineHits.length < cap && (sh.name + " " + sh.location + " " + sh.oneLine + " " + g.regionName + " " + (sh.shrineQuest || "")).toLowerCase().includes(q)) shrineHits.push({ label: sh.name, sub: g.regionName + " · " + sh.location, act: () => nav.shrine(g.regionKey, "shr_" + g.regionKey + "_" + i) }); });
    if (shrineHits.length) groups.push({ cat: "Shrines", glyph: "shrine", items: shrineHits });
    const armorHits = ARMOR.sets.filter((a) => (a.name + " " + a.bonus + " " + a.where).toLowerCase().includes(q)).slice(0, cap).map((a) => ({ label: a.name, sub: a.bonus, act: () => nav.guide("armor") }));
    if (armorHits.length) groups.push({ cat: "Armor", glyph: "armor", items: armorHits });
    const enemyHits = BESTIARY.enemies.filter((e) => (e.name + " " + e.tactic).toLowerCase().includes(q)).slice(0, cap).map((e) => ({ label: e.name, sub: e.tactic, act: () => nav.guide("enemies") }));
    if (enemyHits.length) groups.push({ cat: "Enemies", glyph: "skull", items: enemyHits });
    const questHits = []; SIDE_QUESTS.forEach((g) => g.quests.forEach((qq) => { if (questHits.length < cap && (qq.name + " " + qq.oneLine).toLowerCase().includes(q)) questHits.push({ label: qq.name, sub: g.region + " · " + qq.oneLine, act: () => nav.guide("quests") }); }));
    if (questHits.length) groups.push({ cat: "Side quests", glyph: "scroll", items: questHits });
    const cookHits = RECIPES.filter((r) => (r.eff + " " + r.does + " " + r.key).toLowerCase().includes(q)).slice(0, cap).map((r) => ({ label: r.eff, sub: r.does, act: () => nav.cook() }));
    if (cookHits.length) groups.push({ cat: "Cooking", glyph: "pot", items: cookHits });
    const towerHits = TOWERS.filter((t) => (t.name + " " + t.region + " " + t.location).toLowerCase().includes(q)).slice(0, cap).map((t) => ({ label: t.name, sub: t.region, act: () => nav.guide("towers") }));
    if (towerHits.length) groups.push({ cat: "Towers", glyph: "tower", items: towerHits });
  }
  return (
    <div className="search-overlay">
      <div className="search-bar">
        <input className="search-input" autoFocus placeholder="Search everything — shrines, items, enemies…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="search-x" onClick={onClose}>Close</button>
      </div>
      <div className="search-results">
        {!q && <div className="empty">Type to search shrines, the walkthrough, armor, enemies, side quests, recipes & towers.</div>}
        {q && groups.length === 0 && <div className="empty">Nothing matches “{query}”.</div>}
        {groups.map((g) => (
          <div className="srch-group" key={g.cat}>
            <div className="srch-cat"><span className="srch-cat-ic"><Glyph name={g.glyph} size={15} /></span>{g.cat}</div>
            {g.items.map((it, i) => (
              <button className="srch-item" key={i} onClick={() => { it.act(); onClose(); }}>
                <div className="srch-label">{it.label}</div><div className="srch-sub">{it.sub}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
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
/* --- v6: trackers (fairies, armor, quests, koroks) --- */
.track-meter{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:12px;border:1px solid rgba(95,214,226,0.2);border-radius:12px;background:rgba(95,214,226,0.05);font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--cyan-dim);}
.track-count{font-size:15px;font-weight:700;color:var(--cyan);}
.track-box{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--orange);background:rgba(240,144,42,0.08);border:1px solid rgba(240,144,42,0.4);border-radius:20px;padding:4px 12px;cursor:pointer;white-space:nowrap;flex-shrink:0;}
.track-box-on{color:var(--cyan);background:rgba(95,214,226,0.1);border-color:rgba(95,214,226,0.5);}
.armor-track{display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap;}
.tier-step{display:flex;align-items:center;gap:8px;}
.tier-stars{display:flex;gap:3px;}
.star{font-size:18px;color:var(--ink-line);cursor:pointer;line-height:1;}
.star-on{color:var(--gold);}
.tier-label{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:11px;color:var(--parch-dim);}
.quest-card{display:flex;gap:10px;align-items:flex-start;}
.box-sm{width:20px;height:20px;border-radius:6px;margin-top:2px;}
.quest-body{min-width:0;flex:1;}
.quest-done .quest-name{color:var(--parch-dim);text-decoration:line-through;text-decoration-color:rgba(95,214,226,0.5);}
.quest-region-c{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;color:var(--cyan-dim);margin-left:8px;}
.korok-counter{padding:14px 15px;}
.korok-c-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}
.korok-c-num{display:flex;align-items:baseline;gap:7px;}
.korok-c-btns{display:flex;gap:6px;}
.korok-c-btns button{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;color:var(--moss);background:rgba(155,192,138,0.1);border:1px solid rgba(155,192,138,0.4);border-radius:9px;padding:7px 12px;cursor:pointer;}
.korok-c-note{font-size:12px;color:var(--parch-dim);margin:9px 0 0;line-height:1.4;}
.hmap-wrap{margin:2px -4px 0;}
.hmap{width:100%;height:auto;display:block;}
.hmap-n{fill:var(--parch);font-family:'Rajdhani',sans-serif;font-size:9px;font-weight:700;}
.hmap-l{fill:var(--parch-dim);font-family:'Rajdhani',sans-serif;font-size:8px;font-weight:600;letter-spacing:.2px;}
.hmap-beast{fill:var(--cyan-dim);font-family:'Rajdhani',sans-serif;font-size:7px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;}
.hmap-castle{fill:var(--malice);font-family:'Rajdhani',sans-serif;font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;}
/* --- v6: topbar search, overlay, backup, notes --- */
.topbar-r{display:flex;align-items:center;gap:9px;}
.search-trigger{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:rgba(95,214,226,0.06);border:1px solid rgba(95,214,226,0.22);color:var(--cyan-dim);cursor:pointer;}
.search-overlay{position:fixed;inset:0;z-index:50;background:rgba(7,14,18,0.97);backdrop-filter:blur(6px);display:flex;flex-direction:column;max-width:560px;margin:0 auto;padding-top:env(safe-area-inset-top,0px);}
.search-bar{display:flex;gap:8px;padding:14px 16px 10px;border-bottom:1px solid rgba(95,214,226,0.14);}
.search-bar .search-input{flex:1;}
.search-x{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--parch-dim);background:none;border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:0 14px;cursor:pointer;}
.search-results{flex:1;overflow-y:auto;padding:12px 16px calc(20px + env(safe-area-inset-bottom,0px));}
.srch-group{margin-bottom:16px;}
.srch-cat{display:flex;align-items:center;gap:8px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--cyan-dim);margin-bottom:8px;}
.srch-cat-ic{display:flex;color:var(--orange);}
.srch-item{display:block;width:100%;text-align:left;padding:9px 12px;margin-bottom:6px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;background:rgba(255,255,255,0.02);cursor:pointer;}
.srch-label{font-size:13.5px;font-weight:600;color:var(--parch);}
.srch-sub{font-size:11.5px;color:var(--parch-dim);line-height:1.4;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.backup-box .backup-btns{display:flex;gap:8px;margin-bottom:8px;}
.backup-ta{width:100%;min-height:54px;margin:8px 0;padding:9px 11px;border-radius:10px;background:var(--abyss);border:1px solid rgba(95,214,226,0.2);color:var(--parch-dim);font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.4;resize:vertical;word-break:break-all;}
.backup-imp{margin-top:8px;}
.backup-imp summary{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;letter-spacing:.5px;color:var(--cyan-dim);cursor:pointer;}
.backup-msg{font-size:12px;color:var(--cyan);margin:8px 0 0;}
.note-btn{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;margin-top:1px;background:none;border:1px solid rgba(255,255,255,0.1);color:var(--parch-dim);cursor:pointer;}
.note-btn-on{color:var(--gold);border-color:rgba(242,193,78,0.4);background:rgba(242,193,78,0.06);}
.note-ta{width:100%;margin-top:8px;padding:8px 10px;border-radius:9px;background:var(--abyss);border:1px solid rgba(242,193,78,0.3);color:var(--parch);font-family:'Inter',sans-serif;font-size:13px;line-height:1.45;resize:vertical;min-height:40px;}
.note-wrap{margin-top:7px;}
.note-chip{display:inline-flex;align-items:center;gap:5px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--parch-dim);background:none;border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:3px 9px;cursor:pointer;}
.note-chip-on{color:var(--gold);border-color:rgba(242,193,78,0.4);background:rgba(242,193,78,0.06);}
.note-show{font-size:12.5px;line-height:1.5;color:var(--gold);background:rgba(242,193,78,0.06);border-left:2px solid rgba(242,193,78,0.5);border-radius:0 7px 7px 0;padding:6px 10px;margin:0 0 6px;cursor:pointer;white-space:pre-wrap;}
/* --- v7: per-region maps --- */
.rmap-wrap{margin:4px 14px 10px;}
.rmap{width:100%;height:auto;display:block;border-radius:12px;}
.rmap-lm{fill:var(--parch-dim);font-family:'Rajdhani',sans-serif;font-size:2.5px;font-weight:600;}
.rmap-tw{fill:var(--cyan-dim);font-family:'Rajdhani',sans-serif;font-size:2.5px;font-weight:700;letter-spacing:.2px;}
.rmap-fr{fill:var(--heart);font-family:'Rajdhani',sans-serif;font-size:2.5px;font-weight:700;}
.rmap-sn{fill:var(--orange);font-family:'Rajdhani',sans-serif;font-size:3.4px;font-weight:700;}
.rmap-sn-done{fill:var(--abyss);}
.shrine-num{display:inline-block;min-width:15px;height:15px;line-height:15px;text-align:center;border-radius:5px;background:rgba(95,214,226,0.12);color:var(--cyan-dim);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10px;margin-right:7px;vertical-align:1px;}
.checked .shrine-num{background:rgba(255,255,255,0.05);color:var(--ink-line);}
/* --- v8: settings, spoiler toggle --- */
.set-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 14px;border:1px solid rgba(255,255,255,0.07);border-radius:13px;margin-bottom:11px;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.5));}
.set-txt{min-width:0;}
.set-name{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:15px;color:var(--parch);}
.set-sub{font-size:12.5px;color:var(--parch-dim);line-height:1.5;margin-top:3px;}
.toggle{flex-shrink:0;width:46px;height:27px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);position:relative;cursor:pointer;transition:background .2s,border-color .2s;}
.toggle-knob{position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;background:var(--parch-dim);transition:transform .2s,background .2s;}
.toggle-on{background:rgba(95,214,226,0.22);border-color:rgba(95,214,226,0.55);}
.toggle-on .toggle-knob{transform:translateX(19px);background:var(--cyan);}
.spoiler-hint{font-family:'Inter',sans-serif;font-size:13px;color:var(--cyan-dim);background:rgba(95,214,226,0.07);border:1px dashed rgba(95,214,226,0.35);border-radius:7px;padding:1px 9px;margin-left:6px;cursor:pointer;letter-spacing:.2px;}
.game-picker{display:flex;gap:7px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:13px;padding:5px;margin:0 0 16px;}
.game-pill{flex:1;font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:14px;color:var(--parch-dim);background:none;border:none;border-radius:9px;padding:9px 8px;cursor:pointer;letter-spacing:.3px;}
.game-pill-on{color:var(--abyss);background:linear-gradient(180deg,var(--cyan),var(--cyan-dim));box-shadow:0 2px 10px rgba(95,214,226,0.25);}
/* --- v10: cooking tool (pot simulator, guardrails, goal finder, cookbook) --- */
.pot-slots{display:flex;gap:6px;margin:2px 0 12px;}
.pot-slot{flex:1;min-width:0;height:58px;border-radius:12px;border:1.5px dashed rgba(95,214,226,0.25);background:rgba(95,214,226,0.03);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;padding:4px;position:relative;transition:all .2s;}
.pot-slot-full{border-style:solid;border-color:rgba(240,144,42,0.45);background:rgba(240,144,42,0.07);}
.ps-empty{font-size:22px;color:var(--ink-line);font-weight:300;}
.ps-name{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10px;line-height:1.1;text-align:center;color:var(--parch);overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;}
.ps-x{position:absolute;top:3px;right:5px;font-size:9px;color:var(--parch-dim);}
.pot-result{border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:13px 14px;margin-bottom:11px;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.55));}
.pot-good{border-color:rgba(95,214,226,0.32);box-shadow:0 0 18px rgba(95,214,226,0.07);}
.pot-bad{border-color:rgba(224,80,107,0.4);box-shadow:0 0 18px rgba(224,80,107,0.08);}
.pot-empty{display:flex;align-items:center;gap:12px;border:1px dashed rgba(95,214,226,0.22);border-radius:14px;padding:16px;margin-bottom:11px;color:var(--parch-dim);font-size:13.5px;line-height:1.5;}
.pot-empty svg{color:var(--cyan-dim);flex-shrink:0;}
.pot-dish-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:9px;}
.pot-dish{font-family:'Cinzel',Georgia,serif;font-weight:700;font-size:18px;color:var(--parch);}
.pot-bad .pot-dish{color:var(--malice);}
.pot-eff{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11.5px;letter-spacing:.5px;padding:2px 9px;border-radius:20px;border:1px solid;}
.pot-crit{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;letter-spacing:.5px;color:var(--gold);border:1px solid rgba(242,193,78,0.4);background:rgba(242,193,78,0.08);border-radius:20px;padding:2px 9px;}
.pot-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;}
.pst{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12.5px;padding:3px 10px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);}
.pst-h{color:var(--heart);}.pst-t{color:var(--cyan-dim);}.pst-c{color:var(--parch-dim);}
.pot-warn{font-size:13px;line-height:1.5;border-radius:9px;padding:8px 11px;margin-top:8px;border:1px solid;}
.pw-bad{color:#f3c0c8;background:rgba(224,80,107,0.09);border-color:rgba(224,80,107,0.32);}
.pw-warn{color:var(--gold);background:rgba(242,193,78,0.07);border-color:rgba(242,193,78,0.3);}
.pw-tip{color:var(--cyan-dim);background:rgba(95,214,226,0.06);border-color:rgba(95,214,226,0.25);}
.pot-actions{display:flex;gap:8px;margin-bottom:16px;}
.pot-btn{flex:1;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12.5px;letter-spacing:.5px;color:var(--parch-dim);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}
.pot-btn:disabled{opacity:.4;cursor:default;}
.pot-btn-save{color:var(--cyan);border-color:rgba(95,214,226,0.3);background:rgba(95,214,226,0.06);}
.cook-filters{margin-bottom:12px;}
.cook-filters .seg-btn{padding:7px 13px;font-size:12px;}
.ing-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.ing-chip{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;padding:9px 11px;border-radius:11px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);cursor:pointer;border-left:3px solid var(--ink-line);transition:all .15s;}
.ing-chip:disabled{opacity:.4;cursor:default;}
.ic-effect{border-left-color:var(--orange);}.ic-critter{border-left-color:var(--sneak);}.ic-monster{border-left-color:var(--malice);}.ic-dragon{border-left-color:var(--gold);}.ic-neutral{border-left-color:var(--ink-line);}.ic-special{border-left-color:var(--cyan);}
.ic-name{font-weight:600;font-size:13px;color:var(--parch);line-height:1.2;}
.ic-meta{display:flex;}
.ic-eff{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10px;letter-spacing:.4px;padding:1px 7px;border-radius:20px;border:1px solid;}
.ic-role{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10px;letter-spacing:.4px;text-transform:uppercase;color:var(--parch-dim);}
.ing-list{display:flex;flex-direction:column;gap:6px;}
.ing-row{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;padding:10px 12px;border-radius:11px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.015);cursor:pointer;}
.ir-main{min-width:0;display:flex;flex-direction:column;gap:2px;}
.ir-name{font-weight:600;font-size:13.5px;color:var(--parch);}
.ir-where{font-size:11px;color:var(--parch-dim);}
.ir-side{display:flex;align-items:center;gap:7px;flex-shrink:0;}
.ir-sell{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:11px;color:var(--gold);}
.goal-grid{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px;}
.goal-chip{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12.5px;letter-spacing:.3px;color:var(--parch-dim);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:20px;padding:8px 13px;cursor:pointer;}
.goal-on{color:var(--abyss);background:var(--cyan);border-color:var(--cyan);}
.goal-card{border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;margin-bottom:11px;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,0.5));}
.goal-eff{display:inline-block;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12.5px;letter-spacing:.5px;padding:3px 11px;border-radius:8px;border:1px solid;margin-bottom:9px;}
.goal-decode{font-size:13.5px;line-height:1.5;color:var(--gold);margin-bottom:9px;}
.goal-money .recipe-does{color:var(--parch);}
.book-row{display:flex;align-items:stretch;gap:8px;margin-bottom:8px;}
.book-main{flex:1;min-width:0;text-align:left;padding:11px 13px;border-radius:11px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);cursor:pointer;display:flex;flex-direction:column;gap:4px;}
.book-dish{display:flex;align-items:center;gap:8px;font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:14.5px;color:var(--parch);}
.book-ings{font-size:12px;color:var(--parch-dim);line-height:1.4;}
.book-del{flex-shrink:0;width:40px;border-radius:11px;border:1px solid rgba(224,80,107,0.25);background:rgba(224,80,107,0.05);color:var(--malice);cursor:pointer;font-size:13px;}
/* --- v9: joy pass (check animation, tactile press, transitions), resume, stuck, progressive spoiler --- */
.box{position:relative;}
.box-flash{animation:box-bounce .36s ease;}
.box-flash::after{content:"";position:absolute;inset:-5px;border-radius:11px;border:2px solid var(--cyan);animation:sheikah-pop .6s ease-out forwards;pointer-events:none;}
@keyframes box-bounce{0%{transform:scale(1);}42%{transform:scale(1.22);}100%{transform:scale(1);}}
@keyframes sheikah-pop{0%{transform:scale(.55);opacity:.95;border-color:var(--orange);}100%{transform:scale(1.75);opacity:0;border-color:var(--cyan);}}
.steps{animation:stepsIn .28s ease;}
@keyframes stepsIn{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
.body{animation:fadeIn .24s ease;}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}} /* opacity-only: a transform here would become the containing block for the fixed readers (.bk-reader/.lore-reader) and break them */
.reg-row:active,.regchip:active,.seg-btn:active,.tab:active,.item:active,.big-link:active,.hero-cont:active,.resume-trigger:active,.search-trigger:active,.game-pill:active,.card-head:active,.srch-item:active,.set-row:active{transform:scale(.975);}
.step-hl{animation:stephl 2.2s ease;border-radius:10px;}
@keyframes stephl{0%,100%{background:transparent;}14%{background:rgba(240,144,42,0.17);}55%{background:rgba(240,144,42,0.10);}}
/* Resume — "you're here" (topbar + hero) */
.resume-trigger{display:inline-flex;align-items:center;gap:5px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--abyss);background:linear-gradient(180deg,var(--orange),#df7d1f);border:none;border-radius:18px;padding:6px 11px 6px 8px;cursor:pointer;box-shadow:0 2px 9px rgba(240,144,42,0.32);white-space:nowrap;}
.resume-trigger svg{filter:drop-shadow(0 0 2px rgba(255,255,255,0.45));}
.hero-cont{display:flex;flex-direction:column;align-items:flex-start;gap:2px;}
.hero-cont-k{display:inline-flex;align-items:center;gap:5px;color:var(--orange);font-weight:700;letter-spacing:.4px;}
.hero-cont-k svg{filter:drop-shadow(0 0 4px rgba(240,144,42,0.5));}
.hero-cont-s{color:var(--parch);font-weight:600;font-size:12.5px;opacity:.92;}
/* Stuck? reveal */
.stuck-wrap{margin-top:7px;}
.stuck-btn{display:inline-flex;align-items:center;gap:5px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--orange);background:rgba(240,144,42,0.07);border:1px dashed rgba(240,144,42,0.42);border-radius:7px;padding:3px 9px;cursor:pointer;}
.stuck-open{color:var(--cyan-dim);border-color:rgba(95,214,226,0.42);background:rgba(95,214,226,0.06);border-style:solid;}
.stuck-text{margin:7px 0 2px;font-size:13px;line-height:1.55;color:var(--parch);background:rgba(95,214,226,0.05);border-left:2px solid var(--cyan-dim);border-radius:0 8px 8px 0;padding:8px 11px;animation:stepsIn .25s ease;}
/* Progressive spoiler veil (journey) */
.reward-veil{cursor:pointer;text-align:left;font:inherit;}
.veil-tap{color:var(--cyan-dim);text-decoration:underline;text-underline-offset:2px;font-weight:700;}
.veil-inline{font:inherit;color:var(--cyan-dim);background:none;border:none;text-decoration:underline;text-underline-offset:2px;cursor:pointer;padding:0;}
@media (max-width:380px){.resume-trigger span{display:none;}.resume-trigger{padding:6px 8px;}}
/* Lore Library (v11) */
.lore-cont{position:relative;display:block;width:100%;text-align:left;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,.5));border:1px solid rgba(95,214,226,.25);border-radius:14px;padding:14px 15px;margin:0 0 16px;cursor:pointer;overflow:hidden;}
.lore-cont-bar{position:absolute;top:0;left:0;height:3px;background:var(--cyan);}
.lore-cont-k{display:block;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--cyan-dim);margin-bottom:3px;}
.lore-cont-t{display:block;font-family:'Cinzel',Georgia,serif;font-size:17px;color:var(--parch);margin-bottom:2px;}
.lore-cont-s{display:block;font-size:12px;color:var(--parch-dim);}
.lore-shelf{display:flex;flex-direction:column;gap:9px;}
.lore-card{display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,.5));border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:13px 14px;cursor:pointer;color:inherit;}
.lore-card-no{font-family:'Cinzel',Georgia,serif;font-size:15px;color:var(--cyan-dim);opacity:.65;flex-shrink:0;width:22px;text-align:center;}
.lore-card-body{flex:1;min-width:0;}
.lore-card-eye{display:block;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:9.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--cyan-dim);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lore-card-title{display:block;font-family:'Cinzel',Georgia,serif;font-size:16px;color:var(--parch);line-height:1.2;margin-bottom:3px;}
.lore-card-meta{display:block;font-size:11px;color:var(--parch-dim);}
.lore-card-ring{flex-shrink:0;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;}
.lore-card-ring-in{width:27px;height:27px;border-radius:50%;background:var(--panel);display:flex;align-items:center;justify-content:center;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10px;color:var(--cyan);}
.lore-reader{position:fixed;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:560px;height:100vh;height:100dvh;z-index:60;background:var(--rbg);color:var(--rfg);display:flex;flex-direction:column;}
.lore-rbar{display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top,0px)) calc(14px + env(safe-area-inset-right,0px)) 10px calc(14px + env(safe-area-inset-left,0px));border-bottom:1px solid rgba(127,127,127,.18);}
.lore-x{background:none;border:none;color:var(--rdim);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:.5px;cursor:pointer;flex-shrink:0;}
.lore-rtitle{flex:1;min-width:0;text-align:center;font-family:'Cinzel',Georgia,serif;font-size:13px;color:var(--rfg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.82;}
.lore-rctrls{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.lore-bm{background:none;border:none;color:var(--rdim);font-size:16px;cursor:pointer;line-height:1;padding:0;}
.lore-bm-on{color:var(--cyan);}
.lore-aa{background:none;border:none;color:var(--rdim);font-family:'Cinzel',Georgia,serif;font-size:15px;cursor:pointer;padding:0;}
.lore-settings{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 16px;border-bottom:1px solid rgba(127,127,127,.18);}
.lore-set-grp{display:flex;gap:7px;}
.lore-step{background:rgba(127,127,127,.12);border:1px solid rgba(127,127,127,.28);color:var(--rfg);border-radius:8px;padding:5px 12px;font-family:'Cinzel',Georgia,serif;font-size:13px;cursor:pointer;}
.lore-sw{width:24px;height:24px;border-radius:50%;border:1px solid rgba(127,127,127,.45);cursor:pointer;padding:0;}
.lore-sw-slate{background:#0f1c22;}.lore-sw-sepia{background:#efe5d0;}.lore-sw-night{background:#04070a;}
.lore-sw-on{box-shadow:0 0 0 2px var(--cyan);}
.lore-view{position:relative;overflow:hidden;width:100%;padding:0 18px;flex:1;min-height:0;}
.lore-banner{margin:16px 0 6px;border-radius:12px;overflow:hidden;border:1px solid rgba(127,127,127,.2);break-inside:avoid;line-height:0;}
.lore-banner svg,.lore-banner-img{display:block;width:100%;height:auto;}
.lore-banner-img{max-height:200px;object-fit:cover;}
.lore-cols{column-fill:auto;will-change:transform;transition:transform .26s ease;}
.lore-eyebrow{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:.7em;letter-spacing:2.5px;text-transform:uppercase;color:var(--cyan-dim);margin:16px 0 8px;}
.lore-h1{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:1.62em;line-height:1.2;margin:0 0 18px;color:var(--rfg);}
.lore-p{font-size:1em;line-height:1.78;margin:0 0 15px;color:var(--rfg);}
.lore-h2{font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:1.14em;margin:8px 0 10px;color:var(--rfg);}
.lore-pq{font-family:'Cinzel',Georgia,serif;font-style:italic;font-size:1.2em;line-height:1.4;border-left:3px solid var(--cyan);margin:8px 0 17px;padding:2px 0 2px 15px;color:var(--rfg);break-inside:avoid;}
.lore-note{display:block;border-left:3px solid var(--cyan);background:rgba(127,127,127,.09);border-radius:0 8px 8px 0;padding:10px 13px;margin:6px 0 16px;break-inside:avoid;}
.lore-note-creator{border-left-color:var(--gold);}
.lore-note-theory{border-left-color:var(--orange);}
.lore-note-k{display:block;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:.62em;letter-spacing:1.2px;text-transform:uppercase;color:var(--cyan-dim);margin-bottom:4px;}
.lore-note-creator .lore-note-k{color:var(--gold);}
.lore-note-theory .lore-note-k{color:var(--orange);}
.lore-note-src{opacity:.7;}
.lore-note-t{display:block;font-size:.86em;line-height:1.6;color:var(--rfg);opacity:.92;}
.lore-end{text-align:center;color:var(--rdim);font-size:1em;margin:4px 0 18px;opacity:.6;}
.lore-edge{position:absolute;top:0;bottom:0;width:22%;background:none;border:none;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent;}
.lore-edge-l{left:0;}.lore-edge-r{right:0;}
.lore-edge:disabled{cursor:default;}
.lore-foot{display:flex;align-items:center;gap:11px;padding:11px 16px calc(11px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(127,127,127,.18);}
.lore-nav{background:rgba(127,127,127,.12);border:1px solid rgba(127,127,127,.28);color:var(--rfg);width:34px;height:34px;border-radius:9px;font-size:18px;line-height:1;cursor:pointer;flex-shrink:0;}
.lore-nav:disabled{opacity:.3;cursor:default;}
.lore-prog{flex:1;height:4px;border-radius:4px;background:rgba(127,127,127,.18);overflow:hidden;}
.lore-prog-bar{display:block;height:100%;background:var(--cyan);transition:width .25s;}
.lore-page{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;color:var(--rdim);flex-shrink:0;min-width:44px;text-align:right;}
/* ---- v12 Bookshelf (on-device books) ---- */
.bk-shelf-head{display:flex;align-items:center;justify-content:space-between;margin:26px 0 4px;}
.bk-shelf-title{display:flex;align-items:center;gap:7px;font-family:'Cinzel',Georgia,serif;font-size:15px;color:var(--parch);margin:0;}
.bk-add{background:rgba(95,214,226,.12);border:1px solid var(--cyan);color:var(--cyan);border-radius:9px;padding:6px 12px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:.4px;cursor:pointer;}
.bk-shelf-note{font-size:11px;line-height:1.55;color:var(--parch-dim);margin:0 0 12px;}
.bk-shelf-note code{font-family:ui-monospace,Menlo,monospace;font-size:10px;background:rgba(255,255,255,.06);padding:1px 4px;border-radius:4px;}
.bk-busy{background:rgba(95,214,226,.1);border:1px solid rgba(95,214,226,.35);color:var(--cyan);border-radius:9px;padding:9px 12px;font-size:12px;margin-bottom:12px;font-family:'Rajdhani',sans-serif;font-weight:600;}
.bk-busy-err{background:rgba(214,95,95,.12);border-color:rgba(214,95,95,.4);color:#e7a3a3;}
.bk-empty{display:flex;flex-direction:column;gap:4px;width:100%;text-align:center;background:linear-gradient(180deg,var(--panel),rgba(15,28,34,.4));border:1px dashed rgba(255,255,255,.16);border-radius:13px;padding:26px 16px;cursor:pointer;color:var(--parch-dim);}
.bk-empty b{color:var(--parch);font-family:'Cinzel',Georgia,serif;font-weight:600;font-size:14px;}
.bk-empty span{font-size:12px;}
.bk-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.bk-cell{display:flex;flex-direction:column;gap:5px;}
.bk-spine{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:5px;text-align:left;aspect-ratio:3/4.1;background:linear-gradient(155deg,var(--bk1),var(--bk2));border:1px solid rgba(255,255,255,.1);border-left:4px solid rgba(255,255,255,.16);border-radius:5px 10px 10px 5px;padding:13px 12px;cursor:pointer;color:var(--parch);overflow:hidden;box-shadow:0 5px 14px rgba(0,0,0,.32);}
.bk-spine-band{position:absolute;top:0;bottom:0;left:9px;width:1px;background:rgba(255,255,255,.1);}
.bk-spine-emblem{color:var(--gold);opacity:.85;margin-bottom:2px;}
.bk-spine-title{font-family:'Cinzel',Georgia,serif;font-size:13px;line-height:1.22;color:#f3ead4;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;}
.bk-spine-by{font-family:'Rajdhani',sans-serif;font-size:10px;color:var(--parch-dim);line-height:1.25;}
.bk-spine-kind{margin-top:auto;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--cyan-dim);}
.bk-spine-bar{display:block;width:100%;height:3px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden;}
.bk-spine-bar span{display:block;height:100%;background:var(--cyan);}
.bk-spine-badge{position:absolute;top:9px;right:9px;background:rgba(7,15,18,.7);border:1px solid rgba(95,214,226,.4);color:var(--cyan);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:9px;padding:1px 6px;border-radius:20px;}
.bk-cell-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 2px;}
.bk-cell-sub{font-size:10px;color:var(--parch-dim);font-family:'Rajdhani',sans-serif;}
.bk-rm{background:none;border:none;color:var(--parch-dim);opacity:.6;font-size:10px;cursor:pointer;padding:0;text-decoration:underline;}
.bk-rm-grp{display:flex;gap:6px;align-items:center;}
.bk-rm-yes{background:rgba(214,95,95,.16);border:1px solid rgba(214,95,95,.45);color:#e7a3a3;border-radius:6px;font-size:10px;padding:2px 7px;cursor:pointer;}
.bk-rm-no{background:none;border:none;color:var(--parch-dim);font-size:10px;cursor:pointer;}
/* book reader (page images) */
.bk-reader{position:fixed;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:560px;height:100vh;height:100dvh;z-index:60;background:#06090c;color:#e8eef1;display:flex;flex-direction:column;}
.bk-rbar{display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top,0px)) calc(14px + env(safe-area-inset-right,0px)) 10px calc(14px + env(safe-area-inset-left,0px));border-bottom:1px solid rgba(255,255,255,.1);}
.bk-x{background:none;border:none;color:var(--cyan);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:.5px;cursor:pointer;flex-shrink:0;}
.bk-rtitle{flex:1;min-width:0;text-align:center;font-family:'Cinzel',Georgia,serif;font-size:12px;color:#cfd8dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85;}
.bk-rctrls{display:flex;align-items:center;gap:12px;flex-shrink:0;}
.bk-bm{background:none;border:none;color:#7b8a90;font-size:16px;cursor:pointer;padding:0;line-height:1;}
.bk-bm-on{color:var(--cyan);}
.bk-fit{background:none;border:none;color:#7b8a90;font-size:16px;cursor:pointer;padding:0;line-height:1;}
.bk-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#06090c;}
.bk-stage-page{overflow:hidden;}
.bk-stage-page .bk-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;}
.bk-stage-width{overflow-y:auto;overflow-x:hidden;align-items:flex-start;justify-content:flex-start;-webkit-overflow-scrolling:touch;}
.bk-stage-width .bk-img{width:100%;height:auto;display:block;}
.bk-img{user-select:none;-webkit-user-drag:none;}
.bk-loading{color:#7b8a90;font-family:'Rajdhani',sans-serif;font-size:13px;}
.bk-edge{position:absolute;top:0;bottom:0;width:26%;background:none;border:none;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent;}
.bk-edge-l{left:0;}.bk-edge-r{right:0;}
.bk-foot{display:flex;align-items:center;gap:11px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(255,255,255,.1);background:#06090c;}
.bk-nav{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#e8eef1;width:34px;height:34px;border-radius:9px;font-size:18px;line-height:1;cursor:pointer;flex-shrink:0;}
.bk-nav:disabled{opacity:.3;cursor:default;}
.bk-prog{flex:1;height:4px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden;}
.bk-prog-bar{display:block;height:100%;background:var(--cyan);transition:width .25s;}
.bk-page{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;color:#9aa7ac;flex-shrink:0;min-width:54px;text-align:right;background:none;border:none;cursor:pointer;padding:4px 2px;}
/* ---- v12.4 reader tools: safe-area, chrome toggle, scrubber, jump, dim ---- */
.reader-chrome-off .reader-bar-top,.reader-chrome-off .reader-bar-bot{display:none;}
.bk-ic{background:none;border:none;color:#7b8a90;font-size:16px;cursor:pointer;padding:2px 3px;line-height:1;}
.bk-ic-on{color:var(--cyan);}
.bk-dim{position:absolute;inset:0;background:#000;pointer-events:none;}
.bk-tiphint{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:.5px;color:rgba(255,255,255,.5);background:rgba(0,0,0,.45);padding:4px 11px;border-radius:20px;pointer-events:none;}
.bk-jump{display:flex;align-items:center;gap:5px;flex-shrink:0;}
.bk-jump-in{width:46px;background:rgba(255,255,255,.1);border:1px solid var(--cyan);color:#e8eef1;border-radius:7px;padding:4px 6px;font-size:12px;text-align:center;}
.bk-jump-go{background:rgba(95,214,226,.16);border:1px solid var(--cyan);color:var(--cyan);border-radius:7px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;}
/* range scrubbers (drag to any page) */
.bk-scrub,.lore-scrub{flex:1;-webkit-appearance:none;appearance:none;height:22px;background:transparent;cursor:pointer;margin:0;}
.bk-scrub::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:rgba(255,255,255,.2);}
.lore-scrub::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:rgba(127,127,127,.28);}
.bk-scrub::-moz-range-track,.lore-scrub::-moz-range-track{height:4px;border-radius:4px;background:rgba(127,127,127,.28);}
.bk-scrub::-webkit-slider-thumb,.lore-scrub::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:17px;height:17px;border-radius:50%;background:var(--cyan);margin-top:-6.5px;box-shadow:0 1px 4px rgba(0,0,0,.45);}
.bk-scrub::-moz-range-thumb,.lore-scrub::-moz-range-thumb{width:17px;height:17px;border:none;border-radius:50%;background:var(--cyan);box-shadow:0 1px 4px rgba(0,0,0,.45);}
/* ---- v12.3 mid-game usability: pouch filters + shrine quick-find / pin / recents ---- */
.inv-filter{margin-bottom:14px;}
.seg-ct{opacity:.6;font-size:.82em;font-weight:600;margin-left:3px;}
.shrine-pin{background:linear-gradient(180deg,rgba(240,144,42,.12),rgba(15,28,34,.5));border:1px solid var(--orange);border-radius:13px;padding:11px 13px;margin-bottom:12px;}
.shrine-pin-done{border-color:var(--cyan);background:linear-gradient(180deg,rgba(95,214,226,.1),rgba(15,28,34,.5));}
.shrine-pin-k{display:flex;align-items:center;gap:5px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--orange);margin-bottom:6px;}
.shrine-pin-done .shrine-pin-k{color:var(--cyan);}
.shrine-pin-main{display:block;width:100%;text-align:left;background:none;border:none;color:inherit;cursor:pointer;padding:0;}
.shrine-pin-name{font-family:'Cinzel',Georgia,serif;font-size:17px;color:var(--parch);line-height:1.2;}
.shrine-pin-loc{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--cyan-dim);margin:3px 0;}
.shrine-pin-hint{font-size:12px;line-height:1.45;color:var(--parch-dim);}
.shrine-pin-acts{display:flex;gap:8px;margin-top:9px;}
.shrine-pin-done-btn{flex:1;background:rgba(95,214,226,.14);border:1px solid var(--cyan);color:var(--cyan);border-radius:8px;padding:7px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;cursor:pointer;}
.shrine-pin-done-btn:disabled{opacity:.6;cursor:default;}
.shrine-pin-clear{background:none;border:1px solid rgba(255,255,255,.16);color:var(--parch-dim);border-radius:8px;padding:7px 12px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;cursor:pointer;}
.shrine-recents{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:12px;}
.shrine-recents-k{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--parch-dim);}
.shrine-chip{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--parch);border-radius:20px;padding:4px 11px;font-size:11.5px;cursor:pointer;white-space:nowrap;}
.shrine-chip-done{color:var(--cyan);border-color:rgba(95,214,226,.4);}
.shrine-chip-pin{border-color:var(--orange);color:var(--orange);}
.shrine-row-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;}
.shrine-pinbtn{display:inline-flex;align-items:center;gap:3px;background:none;border:1px solid rgba(255,255,255,.14);color:var(--parch-dim);border-radius:14px;padding:2px 9px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;flex-shrink:0;}
.shrine-pinbtn-on{border-color:var(--orange);color:var(--orange);background:rgba(240,144,42,.1);}
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
      { id: "md2", k: "step", t: "Warp to Tabantha Tower and glide north to Rito Village, built around a tall rock spire." },
      { id: "md3", k: "optional", t: "Activate the Akh Va'quot Shrine in the village for a warp point.", items: [{ name: "Spirit Orb", cat: "key", note: "Akh Va'quot Shrine", orb: true }] },
      { id: "md4", k: "loot", t: "Buy the Snowquill armor set from the village shop — strong cold resistance for the whole northwest.", items: [{ name: "Snowquill Set", cat: "armor", note: "Cold resistance (Rito shop)" }] },
      { id: "md5", k: "step", t: "At the top, talk to Elder Kaneli — he asks you to help Teba take on Vah Medoh. Talk to Saki (next hut) to learn Teba is at the Flight Range." },
    ]},
    { id: "md_teba", name: "Teba & the Flight Range", sub: "Archery test", steps: [
      { id: "md6", k: "warn", t: "The Flight Range is an even colder (level 2) area — make sure your cold resistance is solid before gliding over from Revali's Landing." },
      { id: "md7", k: "step", stuck: "Glide off the platform's edge to catch the updraft, then draw your bow mid-air for slow-mo and pop the blue targets. Riding the updraft refills stamina, so grab the Swallow Bow there and just keep gliding and shooting.", t: "Reach the Flight Range and talk to Teba. Agree to help. His test: hit 5 targets in 3 minutes using the updrafts to glide and shoot." },
      { id: "md8", k: "loot", t: "Pass the test for 20 Bomb Arrows and the Falcon Bow (long range — perfect for the boss).", items: [{ name: "Falcon Bow", cat: "bow", note: "Long-range bow from Teba" }, { name: "Bomb Arrows ×20", cat: "material", note: "For Medoh's cannons" }] },
    ]},
    { id: "md_attack", name: "Ground Vah Medoh", sub: "Ride Teba · 4 cannons", steps: [
      { id: "md9", k: "step", t: "Talk to Teba to launch the assault. He flies you up alongside Medoh as it circles." },
      { id: "md10", k: "step", stuck: "Glide toward each cannon and fire a Bomb Arrow at it. When a cannon's laser locks on (Guardian-style targeting beep), let go of the paraglider to drop straight down, let the laser pass, then re-open and climb back up.", t: "Destroy the 4 cannons — one on each wing, one on the tail, one on the beak — with Bomb Arrows. They fire Guardian-style lasers; release the paraglider to drop and dodge, then re-open it." },
      { id: "md11", k: "step", t: "With all 4 cannons down, the barrier drops and Teba lands you on Medoh." },
    ]},
    { id: "md_inside", name: "Inside Vah Medoh", sub: "Activate 5 terminals", reward: "Control of Vah Medoh", steps: [
      { id: "md12", k: "step", stuck: "Equip Magnesis to spot and pull the metal footholds and blocks into reach. Shoot the orange Malice eyes to dissolve the goo blocking a path; the floating Guardian Scouts can be killed with a few arrows or melee hits.", t: "Revali's intro: light 5 terminals, then the main control unit. Shoot the glowing Malice eyeballs to clear paths and deal with Guardian Scouts." },
      { id: "md13", k: "step", stuck: "Open the dungeon map to reach the tilt control: three settings tilt Medoh up, neutral, or down. Tilting redirects the updrafts and ramps, so set the tilt that aims an updraft at the terminal you want, then glide.", t: "The map terminal lets you TILT the whole beast. Rotate Medoh to redirect its built-in updrafts and walkways, then ride updrafts + paraglider to reach each terminal." },
      { id: "md14", k: "loot", stuck: "The Sapphire chest is right where you boarded, at the tail behind the starting point, so grab it before heading inward. Other chests sit near the terminals; once you start the boss you cannot come back, so sweep first.", t: "Grab the chests as you go (a Sapphire sits behind you at the tail when you board). You can't return after the boss.", items: [{ name: "Sapphire", cat: "material", note: "Chest on Medoh's tail" }] },
    ]},
    { id: "md_boss", name: "Boss: Windblight Ganon", sub: "Free Revali", reward: "Revali's Gale + Heart Container", steps: [
      { id: "md_b1", k: "step", stuck: "Ride a floor vent's updraft, then draw your bow in the air for slow-mo and aim at the single glowing EYE on its head. Two hits (Bomb Arrows best) drop it stunned for melee; duck behind a pillar from its laser.", t: "Phase 1: it floats and fires wind blasts and a laser. Use the updrafts on the arena to fly up and get slow-mo bow shots at its EYE (the Falcon Bow shines here); bomb arrows stun it. Hide behind pillars from the laser." },
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
      { id: "rd5", k: "step", stuck: "Hit the lever on the cannon to swing its barrel left until it lines up with the bridge, THEN whistle Yunobo into it and shoot the same lever again to fire him. Wait for the aim before launching or he misses.", t: "Yunobo can curl up and use Daruk's Protection — so he survives being fired from a cannon. Hit the cannon's switch to aim it at the bridge, then launch Yunobo to lower it." },
    ]},
    { id: "rd_climb", name: "Up Death Mountain", sub: "Cannon Yunobo at Rudania", steps: [
      { id: "rd6", k: "warn", stuck: "When the alarm sounds and Rudania's spotlight sweeps, run under one of the big rock overhangs and stand still until it passes. Don't climb in the open. You can also whistle Yunobo to stay put so HE isn't spotted either.", t: "Vah Rudania patrols sentries (Guardian drones). If a sentry spots you OR Yunobo, Rudania triggers a magma rockslide that knocks you back. Hide under rocks and let them pass." },
      { id: "rd7", k: "step", stuck: "Whistle is D-pad down: one tone tells Yunobo to follow, again to wait. Walk the spiral path always turning the same way; the four weak points are the orange glowing spots on Rudania's shoulders.", t: "Climb the mountain counter-clockwise. Whistle (D-pad down) to tell Yunobo to follow or stay. At each cannon, aim and fire Yunobo at Rudania's 4 glowing weak points." },
      { id: "rd8", k: "step", t: "Four hits force Rudania to retreat into the crater — drop in and board it." },
    ]},
    { id: "rd_inside", name: "Inside Vah Rudania", sub: "Activate 5 terminals", reward: "Control of Vah Rudania", steps: [
      { id: "rd9", k: "step", stuck: "Each Malice eyeball blocking a path is destroyed with one arrow or a hit. Use Magnesis (the red rune) to slide the metal cube blocks out of the way, and Remote Bombs to clear cracked rock walls.", t: "Light 5 terminals, then the main control unit. Shoot Malice eyeballs, bomb obstacles, and use Magnesis on the metal blocks." },
      { id: "rd10", k: "step", stuck: "At the map terminal pick the tilt to rotate Rudania 90 degrees, then paraglide to a terminal and rotate back for the next. Smash the eyeballs in the first room first: it frees three chests, one holds 5 Ice Arrows.", t: "The map terminal ROTATES the whole beast (it walks on walls and the ceiling). Tilt Rudania 90° to reposition platforms, then paraglide across to the terminals. Grab Ice Arrow chests — they're gold for the boss.", items: [{ name: "Ice Arrows", cat: "material", note: "Chests inside / North Mine — for the fire boss" }] },
    ]},
    { id: "rd_boss", name: "Boss: Fireblight Ganon", sub: "Free Daruk", reward: "Daruk's Protection + Heart Container", steps: [
      { id: "rd_b1", k: "step", t: "Phase 1: it swings a massive flaming sword — jump sideways for vertical slashes, jump over horizontal ones (or just keep distance), and Flurry Rush after a dodge. Ice Arrows to the eye stun it and deal big damage." },
      { id: "rd_b2", k: "step", stuck: "When it floats up and the fire orb starts forming, drop a Remote Bomb right under it: the orb's pull sucks the bomb in. Detonate the instant it's inside to pop the shield and stun it, then fire Ice Arrows at the eye.", t: "Phase 2 (~50% HP): it floats up and charges a giant fireball — throw a Remote Bomb so the fireball SUCKS it in, then detonate to stun it. Follow with Ice Arrows to the eye, then melee." },
      { id: "rd_b3", k: "reward", stuck: "Easy to miss: after the beast, return to Goron City and talk to Yunobo near the entrance, then to Bludo. Bludo hands over the Boulder Breaker, a powerful two-handed Champion weapon worth grabbing.", t: "GRAB the Heart Container, then activate the main control unit to free Daruk. He grants Daruk's Protection — hold ZL for a shield that blocks 3 hits and reflects Guardian lasers. Back in Goron City, see Yunobo then Bludo for the Boulder Breaker.", items: [{ name: "Heart Container", cat: "key", note: "From Fireblight Ganon" }, { name: "Boulder Breaker", cat: "weapon", note: "Daruk's two-hander (from Bludo)" }] },
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
      { id: "nb2", k: "step", stuck: "Vilia stands on the rock atop the Kara Kara Bazaar inn — climb up to reach her. When asked how she looks, pick \"You're very beautiful!\" and don't accuse her, or she won't sell. The set also grants heat resistance.", t: "Gerudo Town bars men. Buy the Gerudo (vai) outfit — Veil, Top, and Sirwal — for ~600 rupees from Vilia at Kara Kara Bazaar on the way in. Wear all three to get past the guards.", items: [{ name: "Gerudo Vai Set", cat: "armor", note: "Disguise to enter Gerudo Town" }] },
      { id: "nb3", k: "step", t: "Inside, speak to Chief Riju. She'll help against Naboris — but you need the Thunder Helm, stolen by the Yiga Clan. Talk to Captain Teake for the hideout's location." },
    ]},
    { id: "nb_yiga", name: "The Thunder Helm", sub: "Yiga Hideout · Master Kohga", steps: [
      { id: "nb4", k: "step", stuck: "Shoot the Mighty Bananas sitting on high wall platforms to drop them as bait. While a Blademaster is distracted eating, creep up behind him and Sneakstrike (crouch-walk in) to one-shot him with any weapon.", t: "Sneak through the Yiga Hideout (the Yiga love Mighty Bananas — drop one to lure a guard away). Getting spotted summons tough Yiga Blademasters." },
      { id: "nb5", k: "step", stuck: "In the final phase Kohga summons the big spiked ball overhead. Magnesis-grab it and yank it onto his head, but his shield regrows instantly, so swing the ball back and forth to land two hits fast.", t: "At the end, fight Master Kohga. He hurls spiked iron balls — use Magnesis to grab the ball and smash him with it (or make him drop it on his own head)." },
      { id: "nb6", k: "loot", t: "Take the Thunder Helm from the chest and return it to Riju (she's on the 2nd floor now). She wears it and meets you at the lookout post south of town.", items: [{ name: "Thunder Helm", cat: "key", note: "Blocks Naboris's lightning" }] },
    ]},
    { id: "nb_attack", name: "Ground Vah Naboris", sub: "Sand seal · 4 feet", steps: [
      { id: "nb7", k: "step", t: "You NEED a sand seal — rent one in town or catch a wild one. Ride to the lookout post; Riju gives you 20 Bomb Arrows." },
      { id: "nb8", k: "step", stuck: "Aim at the glowing pink feet, not the legs — each takes 2 Bomb Arrows. Stay inside the green ring around Riju so the lightning misses you; once all four are hit, Naboris buckles and kneels.", t: "Ride your sand seal alongside Riju, staying inside her Thunder Helm field to block the lightning. Shoot each of Naboris's 4 feet with Bomb Arrows — 2 per foot, 8 hits total — to stun it." },
      { id: "nb9", k: "step", t: "Board Naboris while it's down." },
    ]},
    { id: "nb_inside", name: "Inside Vah Naboris", sub: "Activate 5 terminals", reward: "Control of Vah Naboris", steps: [
      { id: "nb10", k: "warn", t: "Don't use metal weapons or shields in here — Naboris runs on electricity and they'll shock you." },
      { id: "nb11", k: "step", t: "Light 5 terminals, then the main control unit. Naboris is built from rotating cylinder sections — use the map terminal to spin them and align paths, and route the electric current through the conductors." },
      { id: "nb12", k: "tip", t: "The fiddly one is the 5th terminal — power it by placing the two metal balls on the two pedestals (use Magnesis to carry them up and drop them in)." },
    ]},
    { id: "nb_boss", name: "Boss: Thunderblight Ganon", sub: "Free Urbosa", reward: "Urbosa's Fury + Heart Container", steps: [
      { id: "nb_b1", k: "step", t: "Phase 1: it's FAST and teleports. Bait its quick lunge and Flurry Rush; shoot to stun, then strike. Use NON-metal gear so its lightning doesn't fry you." },
      { id: "nb_b2", k: "step", stuck: "Equip Magnesis the instant phase 2 starts and stay close to Thunderblight so a pillar is always near. When the lightning zaps your held pillar and staggers him, rush in and flurry; dodge his lunges for Flurry Rush.", t: "Phase 2 (~50% HP): it drops metal pillars and charges lightning. Grab a pillar with Magnesis so the lightning hits IT instead of you — that staggers Thunderblight; then flurry. Shock arrows help too." },
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
      { id: "ms2", k: "step", stuck: "The Horned Statue (the talking goddess statue) is by Firly Pond at the southwest edge of Hateno Village, right beside Link's house. Sell a heart for 100 rupees, then buy a stamina vessel back for 120, or vice versa.", t: "That's 10 heart upgrades beyond your starting 3 — i.e. 40 Spirit Orbs spent on hearts. If you sank orbs into stamina, swap them at the Horned Statue in Hateno Village (it trades hearts ↔ stamina)." },
    ]},
    { id: "ms_woods", name: "The Lost Woods", sub: "Follow the embers", steps: [
      { id: "ms3", k: "step", t: "Head to the Great Hyrule Forest (Woodland region, north of Hyrule Castle). Nearest tower: Woodland Tower. Enter the foggy Lost Woods." },
      { id: "ms4", k: "step", stuck: "The first torches are posted along the path — walk torch-to-torch until you reach two torches with a carved tree-face between them (the checkpoint). Light a torch or wooden weapon off a lit one to carry your own flame.", t: "First stretch: follow the lit torches. After the checkpoint (two torches and a carved face), light your own torch (or a wooden weapon)." },
      { id: "ms5", k: "step", stuck: "Stand still and watch the glowing embers drifting off your flame; walk the way they drift. Move at a walk (sprinting makes the cue easy to miss) and stop to re-check, backtracking whenever the fog starts to brighten.", t: "Stand still and watch which way the EMBERS blow off your flame — walk that direction, re-checking every few steps. If the fog turns bright white, you went wrong; backtrack. Follow the embers out into the Korok Forest." },
    ]},
    { id: "ms_pull", name: "The Great Deku Tree", sub: "Claim the sword", steps: [
      { id: "ms6", k: "optional", stuck: "Keo Ruug Shrine sits by the Great Deku Tree, northeast of (to the right of, facing the tree) the sword pedestal in Korok Forest. Activate its orange pedestal to register the travel point before pulling the sword.", t: "Activate Keo Ruug Shrine right by the Deku Tree so you can fast-travel here later instead of re-running the Lost Woods.", items: [{ name: "Spirit Orb", cat: "key", note: "Keo Ruug Shrine", orb: true }] },
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
      { id: "dg4", k: "loot", stuck: "The Hylian Shield is in the Lockup, the dungeon under the castle's northeast side. Raise the barred gate with Cryonis (or climb in), then beat the Stalnox that traps you inside; its chest holds the shield.", t: "Worth grabbing on the way up: the Royal Guard set and Royal weapons scattered inside — and the Hylian Shield (the best shield in the game) from a chest in the castle Lockup/dungeon.", items: [{ name: "Hylian Shield", cat: "shield", note: "Best shield in the game (castle Lockup)" }] },
      { id: "dg5", k: "step", t: "Climb to the Sanctum at the top of the castle. Entering it triggers the Divine Beasts' lasers (if freed) and starts the fight." },
    ]},
    { id: "dg_calamity", name: "Calamity Ganon", sub: "Phase 1 boss", steps: [
      { id: "dg6", k: "step", t: "Calamity Ganon uses all four Blights' moves — fire, water, wind, thunder, a flaming sword, and a laser. Flurry Rush its sword swings; deflect the laser back; shoot its glowing EYE to stun, then unload with the Master Sword and Ancient Arrows." },
      { id: "dg7", k: "step", stuck: "Urbosa's Fury pierces the shield instantly and stuns him. No Fury? Wait for him to charge his beam, then perfect-parry (raise shield as it hits) to bounce the laser back and drop the shield.", t: "At critical HP it raises a shield that nullifies most attacks. Break it with Urbosa's Fury (lightning pierces it) or by deflecting its charged beam back — then finish it off." },
    ]},
    { id: "dg_darkbeast", name: "Dark Beast Ganon", sub: "The final shot", steps: [
      { id: "dg8", k: "step", stuck: "Shoot in waves: hit the three glowing spots on one side, wait for Zelda's cue and hit three on the other side, then the spot under its belly. Only after those six does the eye appear on its forehead.", t: "Ganon flees onto Hyrule Field as a colossal Dark Beast. Zelda gives you the Bow of Light (unlimited Light Arrows). Shoot the glowing orange weak points on its body to expose the eyes.", items: [{ name: "Bow of Light", cat: "bow", note: "Zelda's bow — unlimited Light Arrows" }] },
      { id: "dg9", k: "reward", stuck: "The forehead eye snaps shut if you shoot from the ground. Glide into the updraft, then while still falling press the aim button to enter slow-motion bullet-time and fire the Light Arrow mid-air.", t: "When it attacks, an updraft forms in front of it — glide up (or use Revali's Gale) and, in mid-air slow-mo, fire a Light Arrow into its huge eye. Land the final shot to end the Calamity. Roll credits — and if you found every memory, stay for the bonus scene." },
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
const REGION_MAPS = {
 "great_plateau": {
  "shrines": {
   "Keh Namut Shrine": {
    "x": 20,
    "y": 18
   },
   "Oman Au Shrine": {
    "x": 58,
    "y": 22
   },
   "Ja Baij Shrine": {
    "x": 84,
    "y": 40
   },
   "Owa Daim Shrine": {
    "x": 24,
    "y": 78
   }
  },
  "tower": {
   "name": "Great Plateau Tower",
   "x": 50,
   "y": 50
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Shrine of Resurrection",
    "kind": "landmark",
    "x": 70,
    "y": 14
   },
   {
    "name": "Temple of Time",
    "kind": "landmark",
    "x": 40,
    "y": 62
   },
   {
    "name": "Forest of Spirits",
    "kind": "landmark",
    "x": 48,
    "y": 30
   },
   {
    "name": "Mount Hylia",
    "kind": "peak",
    "x": 16,
    "y": 60
   },
   {
    "name": "Eastern Abbey",
    "kind": "landmark",
    "x": 82,
    "y": 52
   }
  ]
 },
 "dueling-peaks": {
  "shrines": {
   "Hila Rao Shrine": {
    "x": 40,
    "y": 12
   },
   "Bosh Kala Shrine": {
    "x": 14,
    "y": 46
   },
   "Shee Venath Shrine": {
    "x": 46,
    "y": 40
   },
   "Ree Dahee Shrine": {
    "x": 47,
    "y": 52
   },
   "Shee Vaneer Shrine": {
    "x": 46,
    "y": 64
   },
   "Ha Dahamar Shrine": {
    "x": 62,
    "y": 50
   },
   "Toto Sah Shrine": {
    "x": 50,
    "y": 84
   },
   "Ta'loh Naeg Shrine": {
    "x": 80,
    "y": 66
   },
   "Lakna Rokee Shrine": {
    "x": 84,
    "y": 82
   }
  },
  "tower": {
   "name": "Dueling Peaks Tower",
   "x": 33,
   "y": 47
  },
  "fairy": {
   "name": "Great Fairy Cotera",
   "x": 88,
   "y": 54
  },
  "landmarks": [
   {
    "name": "Dueling Peaks Stable",
    "kind": "stable",
    "x": 68,
    "y": 42
   },
   {
    "name": "Kakariko Village",
    "kind": "town",
    "x": 86,
    "y": 72
   },
   {
    "name": "North Dueling Peak",
    "kind": "peak",
    "x": 44,
    "y": 36
   },
   {
    "name": "South Dueling Peak",
    "kind": "peak",
    "x": 44,
    "y": 68
   },
   {
    "name": "Proxim Bridge",
    "kind": "landmark",
    "x": 12,
    "y": 56
   }
  ]
 },
 "hateno": {
  "shrines": {
   "Jitan Sa'mi Shrine": {
    "x": 70,
    "y": 10
   },
   "Tahno O'ah Shrine": {
    "x": 78,
    "y": 30
   },
   "Kam Urog Shrine": {
    "x": 44,
    "y": 28
   },
   "Dow Na'eh Shrine": {
    "x": 14,
    "y": 42
   },
   "Myahm Agana Shrine": {
    "x": 64,
    "y": 52
   },
   "Mezza Lo Shrine": {
    "x": 52,
    "y": 74
   },
   "Chaas Qeta Shrine": {
    "x": 86,
    "y": 88
   }
  },
  "tower": {
   "name": "Hateno Tower",
   "x": 34,
   "y": 50
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Mount Lanayru",
    "kind": "peak",
    "x": 80,
    "y": 16
   },
   {
    "name": "Hateno Village",
    "kind": "town",
    "x": 58,
    "y": 44
   },
   {
    "name": "Hateno Ancient Tech Lab",
    "kind": "tech-lab",
    "x": 70,
    "y": 40
   },
   {
    "name": "Hateno Beach",
    "kind": "lake",
    "x": 46,
    "y": 86
   },
   {
    "name": "Fort Hateno",
    "kind": "landmark",
    "x": 22,
    "y": 54
   }
  ]
 },
 "lanayru": {
  "shrines": {
   "Sheh Rata Shrine": {
    "x": 18,
    "y": 40
   },
   "Kaya Wan Shrine": {
    "x": 16,
    "y": 62
   },
   "Daka Tuss Shrine": {
    "x": 30,
    "y": 78
   },
   "Soh Kofi Shrine": {
    "x": 38,
    "y": 50
   },
   "Ne'ez Yohma Shrine": {
    "x": 52,
    "y": 30
   },
   "Dagah Keek Shrine": {
    "x": 60,
    "y": 20
   },
   "Shai Yota Shrine": {
    "x": 88,
    "y": 42
   },
   "Kah Mael Shrine": {
    "x": 76,
    "y": 64
   },
   "Rucco Maag Shrine": {
    "x": 66,
    "y": 76
   }
  },
  "tower": {
   "name": "Lanayru Tower",
   "x": 30,
   "y": 64
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Zora's Domain",
    "kind": "town",
    "x": 50,
    "y": 24
   },
   {
    "name": "Divine Beast Vah Ruta",
    "kind": "beast",
    "x": 44,
    "y": 12
   },
   {
    "name": "Wetland Stable",
    "kind": "stable",
    "x": 14,
    "y": 70
   },
   {
    "name": "Lanayru Sea",
    "kind": "lake",
    "x": 78,
    "y": 54
   },
   {
    "name": "Mount Lanayru",
    "kind": "peak",
    "x": 62,
    "y": 90
   }
  ]
 },
 "lake": {
  "shrines": {
   "Pumaag Nitae Shrine": {
    "x": 22,
    "y": 14
   },
   "Ishto Soh Shrine": {
    "x": 42,
    "y": 20
   },
   "Ka'o Makagh Shrine": {
    "x": 70,
    "y": 46
   },
   "Ya Naga Shrine": {
    "x": 50,
    "y": 62
   },
   "Shoqa Tatone Shrine": {
    "x": 20,
    "y": 74
   },
   "Shae Katha Shrine": {
    "x": 80,
    "y": 78
   }
  },
  "tower": {
   "name": "Lake Tower",
   "x": 30,
   "y": 50
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Lake Hylia",
    "kind": "lake",
    "x": 48,
    "y": 64
   },
   {
    "name": "Hylia Island",
    "kind": "landmark",
    "x": 50,
    "y": 58
   },
   {
    "name": "Bridge of Hylia",
    "kind": "landmark",
    "x": 62,
    "y": 60
   },
   {
    "name": "Highland Stable",
    "kind": "stable",
    "x": 74,
    "y": 38
   },
   {
    "name": "Spring of Courage",
    "kind": "landmark",
    "x": 84,
    "y": 70
   }
  ]
 },
 "faron": {
  "shrines": {
   "Tawa Jinn Shrine": {
    "x": 27,
    "y": 9
   },
   "Shai Utoh Shrine": {
    "x": 35,
    "y": 49
   },
   "Shoda Sah Shrine": {
    "x": 66,
    "y": 33
   },
   "Qukah Nata Shrine": {
    "x": 13,
    "y": 61
   },
   "Yah Rin Shrine": {
    "x": 74,
    "y": 69
   },
   "Kah Yah Shrine": {
    "x": 91,
    "y": 60
   },
   "Muwo Jeem Shrine": {
    "x": 82,
    "y": 90
   },
   "Korgu Chideh Shrine": {
    "x": 64,
    "y": 92
   }
  },
  "tower": {
   "name": "Faron Tower",
   "x": 40,
   "y": 30
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Lakeside Stable",
    "kind": "stable",
    "x": 44,
    "y": 41
   },
   {
    "name": "Lake Floria",
    "kind": "lake",
    "x": 53,
    "y": 47
   },
   {
    "name": "Mount Floria",
    "kind": "peak",
    "x": 60,
    "y": 58
   },
   {
    "name": "Lurelin Village",
    "kind": "town",
    "x": 89,
    "y": 80
   },
   {
    "name": "Eventide Island",
    "kind": "landmark",
    "x": 76,
    "y": 92
   }
  ]
 },
 "central_hyrule": {
  "shrines": {
   "Saas Ko'sah Shrine": {
    "x": 52,
    "y": 18
   },
   "Noya Neha Shrine": {
    "x": 60,
    "y": 24
   },
   "Namika Ozz Shrine": {
    "x": 71,
    "y": 30
   },
   "Kaam Ya'tak Shrine": {
    "x": 41,
    "y": 50
   },
   "Katah Chuki Shrine": {
    "x": 38,
    "y": 36
   },
   "Wahgo Katta Shrine": {
    "x": 80,
    "y": 72
   },
   "Rota Ooh Shrine": {
    "x": 20,
    "y": 70
   },
   "Dah Kaso Shrine": {
    "x": 14,
    "y": 56
   }
  },
  "tower": {
   "name": "Central Tower",
   "x": 50,
   "y": 40
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Hyrule Castle",
    "kind": "landmark",
    "x": 50,
    "y": 22
   },
   {
    "name": "Outskirt Stable",
    "kind": "stable",
    "x": 16,
    "y": 78
   },
   {
    "name": "Riverside Stable",
    "kind": "stable",
    "x": 84,
    "y": 64
   },
   {
    "name": "Great Plateau",
    "kind": "peak",
    "x": 30,
    "y": 90
   },
   {
    "name": "Digdogg Suspension Bridge",
    "kind": "landmark",
    "x": 12,
    "y": 48
   }
  ]
 },
 "ridgeland": {
  "shrines": {
   "Maag No'rah Shrine": {
    "x": 46,
    "y": 24
   },
   "Mogg Latan Shrine": {
    "x": 64,
    "y": 90
   },
   "Zalta Wa Shrine": {
    "x": 60,
    "y": 16
   },
   "Mijah Rokee Shrine": {
    "x": 73,
    "y": 63
   },
   "Sheem Dagoze Shrine": {
    "x": 75,
    "y": 80
   },
   "Toh Yahsa Shrine": {
    "x": 39,
    "y": 46
   },
   "Shae Loya Shrine": {
    "x": 15,
    "y": 34
   }
  },
  "tower": {
   "name": "Ridgeland Tower",
   "x": 66,
   "y": 50
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Satori Mountain",
    "kind": "peak",
    "x": 58,
    "y": 89
   },
   {
    "name": "Tabantha Bridge Stable",
    "kind": "stable",
    "x": 11,
    "y": 22
   },
   {
    "name": "Serenne Stable",
    "kind": "stable",
    "x": 52,
    "y": 8
   },
   {
    "name": "Thundra Plateau",
    "kind": "landmark",
    "x": 30,
    "y": 54
   },
   {
    "name": "Rauru Settlement Ruins",
    "kind": "town",
    "x": 84,
    "y": 44
   }
  ]
 },
 "tabantha": {
  "shrines": {
   "Sha Warvo Shrine": {
    "x": 44,
    "y": 14
   },
   "Akh Va'quot Shrine": {
    "x": 50,
    "y": 33
   },
   "Voo Lota Shrine": {
    "x": 24,
    "y": 38
   },
   "Tena Ko'sah Shrine": {
    "x": 80,
    "y": 36
   },
   "Bareeda Naag Shrine": {
    "x": 54,
    "y": 56
   },
   "Kah Okeo Shrine": {
    "x": 16,
    "y": 80
   }
  },
  "tower": {
   "name": "Tabantha Tower",
   "x": 60,
   "y": 70
  },
  "fairy": {
   "name": "Great Fairy Kaysa",
   "x": 72,
   "y": 88
  },
  "landmarks": [
   {
    "name": "Rito Village",
    "kind": "town",
    "x": 48,
    "y": 28
   },
   {
    "name": "Divine Beast Vah Medoh",
    "kind": "beast",
    "x": 38,
    "y": 22
   },
   {
    "name": "Flight Range",
    "kind": "landmark",
    "x": 56,
    "y": 9
   },
   {
    "name": "Lake Totori",
    "kind": "lake",
    "x": 64,
    "y": 50
   },
   {
    "name": "Tanagar Canyon",
    "kind": "landmark",
    "x": 46,
    "y": 78
   }
  ]
 },
 "hebra": {
  "shrines": {
   "Hia Miu Shrine": {
    "x": 12,
    "y": 12
   },
   "To Quomo Shrine": {
    "x": 40,
    "y": 9
   },
   "Qaza Tokki Shrine": {
    "x": 80,
    "y": 14
   },
   "Sha Gehma Shrine": {
    "x": 61,
    "y": 21
   },
   "Goma Asaagh Shrine": {
    "x": 25,
    "y": 35
   },
   "Shada Naw Shrine": {
    "x": 51,
    "y": 38
   },
   "Lanno Kooh Shrine": {
    "x": 33,
    "y": 49
   },
   "Mozo Shenno Shrine": {
    "x": 18,
    "y": 51
   },
   "Rok Uwog Shrine": {
    "x": 63,
    "y": 46
   },
   "Rin Oyaa Shrine": {
    "x": 83,
    "y": 53
   },
   "Maka Rah Shrine": {
    "x": 47,
    "y": 57
   },
   "Gee Ha'rah Shrine": {
    "x": 31,
    "y": 68
   },
   "Dunba Taag Shrine": {
    "x": 17,
    "y": 81
   }
  },
  "tower": {
   "name": "Hebra Tower",
   "x": 42,
   "y": 42
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Hebra Peak",
    "kind": "peak",
    "x": 31,
    "y": 24
   },
   {
    "name": "Snowfield Stable",
    "kind": "stable",
    "x": 73,
    "y": 64
   },
   {
    "name": "Rito Village",
    "kind": "town",
    "x": 24,
    "y": 90
   },
   {
    "name": "Tanagar Canyon",
    "kind": "landmark",
    "x": 9,
    "y": 92
   },
   {
    "name": "Lake Kilsie",
    "kind": "lake",
    "x": 13,
    "y": 63
   }
  ]
 },
 "woodland": {
  "shrines": {
   "Ketoh Wawai Shrine": {
    "x": 16,
    "y": 16
   },
   "Keo Ruug Shrine": {
    "x": 44,
    "y": 28
   },
   "Daag Chokah Shrine": {
    "x": 70,
    "y": 22
   },
   "Rona Kachta Shrine": {
    "x": 88,
    "y": 34
   },
   "Maag Halan Shrine": {
    "x": 60,
    "y": 42
   },
   "Monya Toma Shrine": {
    "x": 26,
    "y": 50
   },
   "Kuhn Sidajj Shrine": {
    "x": 30,
    "y": 72
   },
   "Mirro Shaz Shrine": {
    "x": 72,
    "y": 70
   }
  },
  "tower": {
   "name": "Woodland Tower",
   "x": 48,
   "y": 60
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Korok Forest",
    "kind": "landmark",
    "x": 44,
    "y": 20
   },
   {
    "name": "Typhlo Ruins",
    "kind": "landmark",
    "x": 16,
    "y": 28
   },
   {
    "name": "Lost Woods",
    "kind": "landmark",
    "x": 52,
    "y": 38
   },
   {
    "name": "Lake Saria",
    "kind": "lake",
    "x": 36,
    "y": 78
   },
   {
    "name": "Woodland Stable",
    "kind": "stable",
    "x": 84,
    "y": 64
   }
  ]
 },
 "eldin": {
  "shrines": {
   "Tah Muhl Shrine": {
    "x": 14,
    "y": 74
   },
   "Sah Dahaj Shrine": {
    "x": 40,
    "y": 86
   },
   "Mo'a Keet Shrine": {
    "x": 84,
    "y": 78
   },
   "Gorae Torr Shrine": {
    "x": 82,
    "y": 58
   },
   "Daqa Koh Shrine": {
    "x": 58,
    "y": 60
   },
   "Qua Raym Shrine": {
    "x": 47,
    "y": 44
   },
   "Shae Mo'sah Shrine": {
    "x": 50,
    "y": 33
   },
   "Kayra Mah Shrine": {
    "x": 64,
    "y": 24
   },
   "Shora Hah Shrine": {
    "x": 46,
    "y": 13
   }
  },
  "tower": {
   "name": "Eldin Tower",
   "x": 22,
   "y": 60
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Goron City",
    "kind": "town",
    "x": 52,
    "y": 38
   },
   {
    "name": "Death Mountain Summit",
    "kind": "peak",
    "x": 50,
    "y": 20
   },
   {
    "name": "Divine Beast Vah Rudania",
    "kind": "beast",
    "x": 38,
    "y": 18
   },
   {
    "name": "Foothill Stable",
    "kind": "stable",
    "x": 88,
    "y": 86
   },
   {
    "name": "Goronbi Lake",
    "kind": "lake",
    "x": 44,
    "y": 48
   }
  ]
 },
 "akkala": {
  "shrines": {
   "Zuna Kai Shrine": {
    "x": 40,
    "y": 12
   },
   "Ritaag Zumo Shrine": {
    "x": 74,
    "y": 22
   },
   "Tu Ka'loh Shrine": {
    "x": 88,
    "y": 16
   },
   "Dah Hesho Shrine": {
    "x": 52,
    "y": 44
   },
   "Katosa Aug Shrine": {
    "x": 78,
    "y": 48
   },
   "Ze Kasho Shrine": {
    "x": 30,
    "y": 66
   },
   "Ke'nai Shakah Shrine": {
    "x": 70,
    "y": 70
   },
   "Tutsuwa Nima Shrine": {
    "x": 80,
    "y": 86
   }
  },
  "tower": {
   "name": "Akkala Tower",
   "x": 34,
   "y": 54
  },
  "fairy": {
   "name": "Great Fairy Mija",
   "x": 26,
   "y": 56
  },
  "landmarks": [
   {
    "name": "Skull Lake",
    "kind": "lake",
    "x": 46,
    "y": 18
   },
   {
    "name": "Lake Akkala",
    "kind": "lake",
    "x": 60,
    "y": 40
   },
   {
    "name": "Tarrey Town",
    "kind": "town",
    "x": 62,
    "y": 52
   },
   {
    "name": "East Akkala Stable",
    "kind": "stable",
    "x": 82,
    "y": 40
   },
   {
    "name": "South Akkala Stable",
    "kind": "stable",
    "x": 22,
    "y": 74
   },
   {
    "name": "Akkala Ancient Tech Lab",
    "kind": "tech-lab",
    "x": 88,
    "y": 92
   }
  ]
 },
 "gerudo": {
  "shrines": {
   "Kema Kosassa Shrine": {
    "x": 58,
    "y": 12
   },
   "Sho Dantu Shrine": {
    "x": 72,
    "y": 30
   },
   "Keeha Yoog Shrine": {
    "x": 78,
    "y": 44
   },
   "Sasa Kai Shrine": {
    "x": 70,
    "y": 56
   },
   "Joloo Nah Shrine": {
    "x": 34,
    "y": 50
   },
   "Kuh Takkar Shrine": {
    "x": 22,
    "y": 78
   }
  },
  "tower": {
   "name": "Gerudo Tower",
   "x": 64,
   "y": 48
  },
  "fairy": null,
  "landmarks": [
   {
    "name": "Gerudo Summit",
    "kind": "peak",
    "x": 80,
    "y": 34
   },
   {
    "name": "Mount Nabooru",
    "kind": "peak",
    "x": 26,
    "y": 40
   },
   {
    "name": "Mount Agaat",
    "kind": "peak",
    "x": 50,
    "y": 20
   },
   {
    "name": "Risoka Snowfield",
    "kind": "landmark",
    "x": 48,
    "y": 40
   },
   {
    "name": "Laparoh Mesa",
    "kind": "peak",
    "x": 18,
    "y": 66
   }
  ]
 },
 "wasteland": {
  "shrines": {
   "Dako Tah Shrine": {
    "x": 18,
    "y": 18
   },
   "Kema Zoos Shrine": {
    "x": 30,
    "y": 34
   },
   "Daqo Chisay Shrine": {
    "x": 34,
    "y": 50
   },
   "Kay Noh Shrine": {
    "x": 72,
    "y": 15
   },
   "Jee Noh Shrine": {
    "x": 84,
    "y": 38
   },
   "Hawa Koth Shrine": {
    "x": 88,
    "y": 60
   },
   "Korsh O'hu Shrine": {
    "x": 68,
    "y": 56
   },
   "Suma Sahma Shrine": {
    "x": 60,
    "y": 60
   },
   "Misae Suma Shrine": {
    "x": 48,
    "y": 62
   },
   "Tho Kayu Shrine": {
    "x": 44,
    "y": 76
   },
   "Raqa Zunzo Shrine": {
    "x": 16,
    "y": 70
   },
   "Dila Maag Shrine": {
    "x": 30,
    "y": 88
   }
  },
  "tower": {
   "name": "Wasteland Tower",
   "x": 62,
   "y": 40
  },
  "fairy": {
   "name": "Great Fairy Tera Fountain",
   "x": 58,
   "y": 90
  },
  "landmarks": [
   {
    "name": "Gerudo Town",
    "kind": "town",
    "x": 24,
    "y": 48
   },
   {
    "name": "Gerudo Canyon Stable",
    "kind": "stable",
    "x": 82,
    "y": 10
   },
   {
    "name": "Divine Beast Vah Naboris",
    "kind": "beast",
    "x": 50,
    "y": 40
   },
   {
    "name": "Gerudo Great Skeleton",
    "kind": "landmark",
    "x": 90,
    "y": 72
   },
   {
    "name": "Mount Granajh",
    "kind": "peak",
    "x": 46,
    "y": 88
   }
  ]
 }
};
const COOK_INGREDIENTS = [
 {
  "name": "Chillfin Trout",
  "role": "effect",
  "cat": "fish",
  "effect": "Chilly",
  "potency": 3,
  "hearts": 2,
  "sell": 6,
  "where": "cold waters of the Hebra Mountains and Tabantha "
 },
 {
  "name": "Chillshroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Chilly",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 30,
  "sell": 5,
  "where": "Cold climates: Hateno Tower region"
 },
 {
  "name": "Cool Safflina",
  "role": "effect",
  "cat": "herb",
  "effect": "Chilly",
  "potency": 1,
  "hearts": 0,
  "timeSec": 30,
  "sell": 3,
  "where": "Hebra Mtns / Gerudo Highlands snowy peaks"
 },
 {
  "name": "Hydromelon",
  "role": "effect",
  "cat": "fruit",
  "effect": "Chilly",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 150,
  "sell": 4,
  "where": "Gerudo Desert"
 },
 {
  "name": "Electric Safflina",
  "role": "effect",
  "cat": "herb",
  "effect": "Electro",
  "potency": 1,
  "hearts": 0,
  "timeSec": 30,
  "sell": 3,
  "where": "Gerudo Desert dunes / around Gerudo Town"
 },
 {
  "name": "Voltfin Trout",
  "role": "effect",
  "cat": "fish",
  "effect": "Electro",
  "potency": 3,
  "hearts": 2,
  "sell": 6,
  "where": "waters of Hyrule Ridge and the Tabantha Frontier"
 },
 {
  "name": "Voltfruit",
  "role": "effect",
  "cat": "fruit",
  "effect": "Electro",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 150,
  "sell": 4,
  "where": "Gerudo Desert on cactus-like plants near oases"
 },
 {
  "name": "Zapshroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Electro",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 30,
  "sell": 4,
  "where": "Gerudo Highlands and Deep Akkala"
 },
 {
  "name": "Endura Carrot",
  "role": "effect",
  "cat": "veg",
  "effect": "Enduring",
  "potency": 2,
  "hearts": 2,
  "bonus": "+ stamina wheel",
  "sell": 30,
  "where": "Satori Mountain / Malanya Spring"
 },
 {
  "name": "Endura Shroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Enduring",
  "potency": 1,
  "hearts": 1,
  "bonus": "+ stamina wheel",
  "sell": 24,
  "where": "Hyrule Ridge"
 },
 {
  "name": "Bright-Eyed Crab",
  "role": "effect",
  "cat": "fish",
  "effect": "Energizing",
  "potency": 2,
  "hearts": 1,
  "bonus": "refills stamina",
  "sell": 10,
  "where": "beaches and riverbanks across Necluda and Hyrule"
 },
 {
  "name": "Stamella Shroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Energizing",
  "potency": 1,
  "hearts": 0.5,
  "bonus": "refills stamina",
  "sell": 5,
  "where": "Forests across Hyrule"
 },
 {
  "name": "Staminoka Bass",
  "role": "effect",
  "cat": "fish",
  "effect": "Energizing",
  "hearts": 1,
  "bonus": "refills stamina",
  "sell": 18,
  "where": "remote ponds, notably around West Necluda / Lake"
 },
 {
  "name": "Fleet-Lotus Seeds",
  "role": "effect",
  "cat": "fruit",
  "effect": "Hasty",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 150,
  "sell": 5,
  "where": "Floating lotus plants in ponds/marshes"
 },
 {
  "name": "Rushroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Hasty",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 30,
  "sell": 3,
  "where": "On cliff walls / rock faces, especially Lanayru "
 },
 {
  "name": "Swift Carrot",
  "role": "effect",
  "cat": "veg",
  "effect": "Hasty",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 150,
  "sell": 4,
  "where": "Grown/sold around Kakariko and Hateno"
 },
 {
  "name": "Swift Violet",
  "role": "effect",
  "cat": "herb",
  "effect": "Hasty",
  "potency": 2,
  "hearts": 0,
  "timeSec": 30,
  "sell": 10,
  "where": "cliffsides: Ludfo's Bog, Thundra Plateau, Gerudo"
 },
 {
  "name": "Big Hearty Radish",
  "role": "effect",
  "cat": "veg",
  "effect": "Hearty",
  "hearts": 4,
  "bonus": "hearty:+5",
  "sell": 15,
  "where": "Satori Mountain and Hyrule Field"
 },
 {
  "name": "Big Hearty Truffle",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Hearty",
  "hearts": 3,
  "bonus": "hearty:+16",
  "sell": 15,
  "where": "Rare"
 },
 {
  "name": "Hearty Bass",
  "role": "effect",
  "cat": "fish",
  "effect": "Hearty",
  "bonus": "hearty:+2",
  "sell": 18,
  "where": "bodies of water across Hyrule, most common in We"
 },
 {
  "name": "Hearty Blueshell Snail",
  "role": "effect",
  "cat": "fish",
  "effect": "Hearty",
  "bonus": "hearty:+3",
  "sell": 15,
  "where": "beaches and coastal rocks, especially the shore "
 },
 {
  "name": "Hearty Durian",
  "role": "effect",
  "cat": "fruit",
  "effect": "Hearty",
  "hearts": 3,
  "bonus": "hearty:+4",
  "sell": 15,
  "where": "Faron jungle"
 },
 {
  "name": "Hearty Radish",
  "role": "effect",
  "cat": "veg",
  "effect": "Hearty",
  "hearts": 2.5,
  "bonus": "hearty:+3",
  "sell": 8,
  "where": "Hyrule Field, near Satori Mountain, Sanidin Park"
 },
 {
  "name": "Hearty Salmon",
  "role": "effect",
  "cat": "fish",
  "effect": "Hearty",
  "bonus": "hearty:+4",
  "sell": 10,
  "where": "cold rivers/lakes of the Hebra Mountains and Tab"
 },
 {
  "name": "Hearty Truffle",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Hearty",
  "hearts": 2,
  "bonus": "hearty:+4",
  "sell": 6,
  "where": "Shaded spots under cliffs/rocks, often near cave"
 },
 {
  "name": "Mighty Bananas",
  "role": "effect",
  "cat": "fruit",
  "effect": "Mighty",
  "potency": 2,
  "hearts": 0.5,
  "timeSec": 90,
  "sell": 5,
  "where": "Tropical Faron jungle and the Yiga Hideout"
 },
 {
  "name": "Mighty Carp",
  "role": "effect",
  "cat": "fish",
  "effect": "Mighty",
  "potency": 2,
  "hearts": 2,
  "timeSec": 50,
  "sell": 10,
  "where": "rivers and lakes of Lanayru, e"
 },
 {
  "name": "Mighty Thistle",
  "role": "effect",
  "cat": "herb",
  "effect": "Mighty",
  "potency": 2,
  "timeSec": 90,
  "sell": 5,
  "where": "Spiky purple weed in Akkala, Eldin, Hebra"
 },
 {
  "name": "Razorclaw Crab",
  "role": "effect",
  "cat": "fish",
  "effect": "Mighty",
  "potency": 2,
  "hearts": 2,
  "timeSec": 50,
  "sell": 8,
  "where": "beaches and riverbanks across Necluda and much o"
 },
 {
  "name": "Razorshroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Mighty",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 30,
  "sell": 5,
  "where": "Hyrule Ridge / Tabantha region"
 },
 {
  "name": "Blue Nightshade",
  "role": "effect",
  "cat": "herb",
  "effect": "Sneaky",
  "potency": 1,
  "hearts": 0,
  "timeSec": 30,
  "sell": 4,
  "where": "near Cotera's Great Fairy"
 },
 {
  "name": "Silent Princess",
  "role": "effect",
  "cat": "herb",
  "effect": "Sneaky",
  "potency": 2,
  "hearts": 0,
  "timeSec": 30,
  "sell": 10,
  "where": "Satori Mtn, Korok Forest, several Great Fairy fo"
 },
 {
  "name": "Silent Shroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Sneaky",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 30,
  "sell": 3,
  "where": "Grows at night"
 },
 {
  "name": "Sneaky River Snail",
  "role": "effect",
  "cat": "fish",
  "effect": "Sneaky",
  "potency": 1,
  "hearts": 2,
  "sell": 6,
  "where": "shores in West Necluda and the Lanayru Great Spr"
 },
 {
  "name": "Stealthfin Trout",
  "role": "effect",
  "cat": "fish",
  "effect": "Sneaky",
  "potency": 2,
  "hearts": 2,
  "sell": 10,
  "where": "Great Hyrule Forest and the Eldin region"
 },
 {
  "name": "Sizzlefin Trout",
  "role": "effect",
  "cat": "fish",
  "effect": "Spicy",
  "potency": 3,
  "hearts": 2,
  "sell": 6,
  "where": "hot-spring waters and lakes of the Eldin Mountai"
 },
 {
  "name": "Spicy Pepper",
  "role": "effect",
  "cat": "veg",
  "effect": "Spicy",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 150,
  "sell": 3,
  "where": "Eldin foothills, Necluda/Hyrule woods, near camp"
 },
 {
  "name": "Sunshroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Spicy",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 30,
  "sell": 4,
  "where": "Eldin / Death Mountain region"
 },
 {
  "name": "Warm Safflina",
  "role": "effect",
  "cat": "herb",
  "effect": "Spicy",
  "potency": 1,
  "hearts": 0,
  "timeSec": 30,
  "sell": 3,
  "where": "Gerudo Desert"
 },
 {
  "name": "Armoranth",
  "role": "effect",
  "cat": "herb",
  "effect": "Tough",
  "potency": 2,
  "timeSec": 90,
  "sell": 8,
  "where": "Reddish leafy plant in Faron, Necluda, Hyrule Fi"
 },
 {
  "name": "Armored Carp",
  "role": "effect",
  "cat": "fish",
  "effect": "Tough",
  "potency": 2,
  "hearts": 2,
  "timeSec": 50,
  "sell": 10,
  "where": "bodies of water around Hyrule, especially the La"
 },
 {
  "name": "Fortified Pumpkin",
  "role": "effect",
  "cat": "veg",
  "effect": "Tough",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 90,
  "sell": 5,
  "where": "Grown at Kakariko/Hateno gardens"
 },
 {
  "name": "Ironshell Crab",
  "role": "effect",
  "cat": "fish",
  "effect": "Tough",
  "potency": 2,
  "hearts": 2,
  "timeSec": 50,
  "sell": 8,
  "where": "beaches and riverbanks across Necluda and Hyrule"
 },
 {
  "name": "Ironshroom",
  "role": "effect",
  "cat": "mushroom",
  "effect": "Tough",
  "potency": 1,
  "hearts": 0.5,
  "timeSec": 30,
  "sell": 5,
  "where": "Akkala and Deep Akkala forests"
 },
 {
  "name": "Acorn",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 0.25,
  "where": "drops from trees when chopped"
 },
 {
  "name": "Apple",
  "role": "neutral",
  "cat": "fruit",
  "effect": null,
  "hearts": 0.5,
  "sell": 3,
  "where": "Everywhere"
 },
 {
  "name": "Bird Egg",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 2,
  "sell": 3,
  "where": "bird nests in trees"
 },
 {
  "name": "Cane Sugar",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 0,
  "sell": 3,
  "where": "buy: general stores in Goron City / Rito Village"
 },
 {
  "name": "Chickaloo Tree Nut",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 0.25,
  "sell": 3,
  "where": "scattered plains/forests"
 },
 {
  "name": "Fresh Milk",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 1,
  "sell": 3,
  "where": "buy: Hateno Village general store"
 },
 {
  "name": "Goat Butter",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 0,
  "sell": 3,
  "where": "buy: Rito Village / Kakariko / Hateno general st"
 },
 {
  "name": "Goron Spice",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 0,
  "sell": 4,
  "where": "buy: Goron City general store"
 },
 {
  "name": "Hylian Rice",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 1,
  "sell": 3,
  "where": "cut grass in East Necluda"
 },
 {
  "name": "Hylian Shroom",
  "role": "neutral",
  "cat": "mushroom",
  "effect": null,
  "hearts": 0.5,
  "sell": 3,
  "where": "Extremely common in forests/grasslands Hyrule-wi"
 },
 {
  "name": "Hylian Tomato",
  "role": "neutral",
  "cat": "veg",
  "effect": null,
  "hearts": 1,
  "sell": 4,
  "where": "Central Hyrule fields, Hateno/Necluda"
 },
 {
  "name": "Hyrule Bass",
  "role": "neutral",
  "cat": "fish",
  "effect": null,
  "hearts": 2,
  "sell": 6,
  "where": "rivers, ponds and coasts all over Hyrule"
 },
 {
  "name": "Palm Fruit",
  "role": "neutral",
  "cat": "fruit",
  "effect": null,
  "hearts": 1,
  "sell": 4,
  "where": "Tropical Faron palm trees, Lurelin Village"
 },
 {
  "name": "Raw Bird Drumstick",
  "role": "neutral",
  "cat": "meat",
  "effect": null,
  "hearts": 2,
  "sell": 8,
  "where": "Drops from pigeons, sparrows, seagulls and other"
 },
 {
  "name": "Raw Bird Thigh",
  "role": "neutral",
  "cat": "meat",
  "effect": null,
  "hearts": 3,
  "sell": 15,
  "where": "Drops from hawks, larger pigeons and Eldin ostri"
 },
 {
  "name": "Raw Gourmet Meat",
  "role": "neutral",
  "cat": "meat",
  "effect": null,
  "hearts": 6,
  "sell": 35,
  "where": "Rare drop from the largest animals"
 },
 {
  "name": "Raw Meat",
  "role": "neutral",
  "cat": "meat",
  "effect": null,
  "hearts": 2,
  "sell": 8,
  "where": "Drops from boars, foxes, deer and other low-tier"
 },
 {
  "name": "Raw Prime Meat",
  "role": "neutral",
  "cat": "meat",
  "effect": null,
  "hearts": 3,
  "sell": 15,
  "where": "Drops from water buffalo, mountain goats and lar"
 },
 {
  "name": "Raw Whole Bird",
  "role": "neutral",
  "cat": "meat",
  "effect": null,
  "hearts": 6,
  "sell": 35,
  "where": "Drops from White Pigeons and Eldin Ostriches"
 },
 {
  "name": "Rock Salt",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 0,
  "sell": 2,
  "where": "mined from ore/rock deposits in caves & mountain"
 },
 {
  "name": "Sanke Carp",
  "role": "neutral",
  "cat": "fish",
  "effect": null,
  "hearts": 2,
  "sell": 20,
  "where": "the pool around Impa's Hall"
 },
 {
  "name": "Tabantha Wheat",
  "role": "neutral",
  "cat": "other",
  "effect": null,
  "hearts": 1,
  "sell": 3,
  "where": "cut grass around Tabantha/Rito"
 },
 {
  "name": "Wildberry",
  "role": "neutral",
  "cat": "fruit",
  "effect": null,
  "hearts": 0.5,
  "sell": 3,
  "where": "Bushes in hilly/forest regions"
 },
 {
  "name": "Cold Darner",
  "role": "critter",
  "cat": "critter",
  "effect": "Chilly",
  "potency": 2,
  "sell": 2,
  "where": "Cool highland and snow-edge grass"
 },
 {
  "name": "Winterwing Butterfly",
  "role": "critter",
  "cat": "critter",
  "effect": "Chilly",
  "potency": 1,
  "sell": 2,
  "where": "Cold/snowy areas"
 },
 {
  "name": "Electric Darner",
  "role": "critter",
  "cat": "critter",
  "effect": "Electro",
  "potency": 2,
  "sell": 2,
  "where": "Stormy / desert-edge areas"
 },
 {
  "name": "Thunderwing Butterfly",
  "role": "critter",
  "cat": "critter",
  "effect": "Electro",
  "potency": 1,
  "sell": 2,
  "where": "Gerudo Desert / Thundra Plateau and stormy Hyrul"
 },
 {
  "name": "Tireless Frog",
  "role": "critter",
  "cat": "critter",
  "effect": "Enduring",
  "potency": 2,
  "hearts": 3,
  "bonus": "+ stamina wheel",
  "sell": 20,
  "where": "Near water in Lanayru, Hyrule Ridge, and the Nec"
 },
 {
  "name": "Energetic Rhino Beetle",
  "role": "critter",
  "cat": "critter",
  "effect": "Energizing",
  "potency": 6,
  "bonus": "refills stamina",
  "sell": 30,
  "where": "On tree trunks at night/early morning in Faron, "
 },
 {
  "name": "Restless Cricket",
  "role": "critter",
  "cat": "critter",
  "effect": "Energizing",
  "potency": 1,
  "bonus": "refills stamina",
  "sell": 2,
  "where": "In grass across Hyrule"
 },
 {
  "name": "Fireproof Lizard",
  "role": "critter",
  "cat": "critter",
  "effect": "Fireproof",
  "potency": 1,
  "sell": 5,
  "where": "Death Mountain / Eldin"
 },
 {
  "name": "Smotherwing Butterfly",
  "role": "critter",
  "cat": "critter",
  "effect": "Fireproof",
  "potency": 2,
  "sell": 2,
  "where": "Death Mountain / Eldin"
 },
 {
  "name": "Hightail Lizard",
  "role": "critter",
  "cat": "critter",
  "effect": "Hasty",
  "potency": 1,
  "sell": 2,
  "where": "On trees/grass in warmer regions"
 },
 {
  "name": "Hot-Footed Frog",
  "role": "critter",
  "cat": "critter",
  "effect": "Hasty",
  "potency": 2,
  "sell": 2,
  "where": "Near ponds/waterfalls in Lanayru"
 },
 {
  "name": "Hearty Lizard",
  "role": "critter",
  "cat": "critter",
  "effect": "Hearty",
  "bonus": "hearty:+4",
  "sell": 20,
  "where": "On palm trees in Gerudo Desert and along the Nec"
 },
 {
  "name": "Bladed Rhino Beetle",
  "role": "critter",
  "cat": "critter",
  "effect": "Mighty",
  "potency": 1,
  "sell": 4,
  "where": "On tree trunks at night in Central Hyrule / Hyru"
 },
 {
  "name": "Sunset Firefly",
  "role": "critter",
  "cat": "critter",
  "effect": "Sneaky",
  "potency": 1,
  "sell": 2,
  "where": "Glowing at night near water/grass in many region"
 },
 {
  "name": "Summerwing Butterfly",
  "role": "critter",
  "cat": "critter",
  "effect": "Spicy",
  "potency": 1,
  "sell": 2,
  "where": "Warm grasslands"
 },
 {
  "name": "Warm Darner",
  "role": "critter",
  "cat": "critter",
  "effect": "Spicy",
  "potency": 2,
  "sell": 2,
  "where": "Warm/temperate grasslands"
 },
 {
  "name": "Rugged Rhino Beetle",
  "role": "critter",
  "cat": "critter",
  "effect": "Tough",
  "potency": 1,
  "sell": 4,
  "where": "On tree trunks at night in Faron / Lanayru and H"
 },
 {
  "name": "Bokoblin Fang",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 80,
  "sell": 3,
  "where": "Dropped by Bokoblins"
 },
 {
  "name": "Bokoblin Guts",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 160,
  "sell": 20,
  "where": "Rarer Bokoblin drop"
 },
 {
  "name": "Bokoblin Horn",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 3,
  "where": "Dropped by red/common Bokoblins everywhere"
 },
 {
  "name": "Chuchu Jelly",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 5,
  "where": "Dropped by Chuchus"
 },
 {
  "name": "Hinox Guts",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 160,
  "sell": 80,
  "where": "Dropped by Hinox"
 },
 {
  "name": "Hinox Toenail",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 20,
  "where": "Dropped by Hinox"
 },
 {
  "name": "Keese Eyeball",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 80,
  "sell": 20,
  "where": "Rarer Keese drop"
 },
 {
  "name": "Keese Wing",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 3,
  "where": "Dropped by Keese"
 },
 {
  "name": "Lizalfos Horn",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 10,
  "where": "Dropped by Lizalfos"
 },
 {
  "name": "Lizalfos Tail",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 160,
  "sell": 28,
  "where": "Rarer Lizalfos drop"
 },
 {
  "name": "Lizalfos Talon",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 80,
  "sell": 8,
  "where": "Dropped by Lizalfos"
 },
 {
  "name": "Lynel Guts",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 160,
  "sell": 200,
  "where": "Rare Lynel drop"
 },
 {
  "name": "Lynel Hoof",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 80,
  "sell": 50,
  "where": "Dropped by Lynels"
 },
 {
  "name": "Lynel Horn",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 40,
  "where": "Dropped by Lynels"
 },
 {
  "name": "Moblin Fang",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 80,
  "sell": 8,
  "where": "Dropped by Moblins"
 },
 {
  "name": "Moblin Guts",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 160,
  "sell": 25,
  "where": "Rarer Moblin drop"
 },
 {
  "name": "Moblin Horn",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 5,
  "where": "Dropped by Moblins"
 },
 {
  "name": "Molduga Fin",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 80,
  "sell": 30,
  "where": "Dropped by the four Molduga"
 },
 {
  "name": "Molduga Guts",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 160,
  "sell": 110,
  "where": "Dropped by Molduga"
 },
 {
  "name": "Octorok Eyeball",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 80,
  "sell": 25,
  "where": "Rarer Octorok drop"
 },
 {
  "name": "Octorok Tentacle",
  "role": "monster",
  "cat": "monster",
  "effect": null,
  "timeSec": 40,
  "sell": 5,
  "where": "Dropped by Octoroks"
 },
 {
  "name": "Dinraal's Claw",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 210,
  "bonus": "guaranteed crit",
  "sell": 180,
  "where": "Shoot Dinraal's claws/legs as it flies over Eldi"
 },
 {
  "name": "Dinraal's Scale",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 90,
  "bonus": "guaranteed crit",
  "sell": 150,
  "where": "Shoot Dinraal"
 },
 {
  "name": "Farosh's Claw",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 210,
  "bonus": "guaranteed crit",
  "sell": 180,
  "where": "Shoot Farosh's claws/legs around Lake Hylia"
 },
 {
  "name": "Farosh's Scale",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 90,
  "bonus": "guaranteed crit",
  "sell": 150,
  "where": "Shoot Farosh"
 },
 {
  "name": "Naydra's Claw",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 210,
  "bonus": "guaranteed crit",
  "sell": 180,
  "where": "Shoot Naydra's claws/legs around Mount Lanayru"
 },
 {
  "name": "Naydra's Scale",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 90,
  "bonus": "guaranteed crit",
  "sell": 150,
  "where": "Shoot Naydra"
 },
 {
  "name": "Shard of Dinraal's Fang",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 630,
  "bonus": "guaranteed crit",
  "sell": 250,
  "where": "Shoot Dinraal in the mouth as it flies over Eldi"
 },
 {
  "name": "Shard of Dinraal's Horn",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 1800,
  "bonus": "maxes 30:00 · guaranteed crit",
  "sell": 300,
  "where": "Shoot Dinraal's horns as it flies over Eldin"
 },
 {
  "name": "Shard of Farosh's Fang",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 630,
  "bonus": "guaranteed crit",
  "sell": 250,
  "where": "Shoot Farosh in the mouth around Lake Hylia"
 },
 {
  "name": "Shard of Farosh's Horn",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 1800,
  "bonus": "maxes 30:00 · guaranteed crit",
  "sell": 300,
  "where": "Shoot Farosh's horns around Lake Hylia"
 },
 {
  "name": "Shard of Naydra's Fang",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 630,
  "bonus": "guaranteed crit",
  "sell": 250,
  "where": "Shoot Naydra in the mouth around Mount Lanayru"
 },
 {
  "name": "Shard of Naydra's Horn",
  "role": "dragon",
  "cat": "dragon",
  "effect": null,
  "timeSec": 1800,
  "bonus": "maxes 30:00 · guaranteed crit",
  "sell": 300,
  "where": "Shoot Naydra's horns around Mount Lanayru"
 },
 {
  "name": "Fairy",
  "role": "special",
  "cat": "other",
  "effect": null,
  "bonus": "heal tonic",
  "sell": 2,
  "where": "Great Fairy Fountains and hidden spots"
 },
 {
  "name": "Monster Extract",
  "role": "special",
  "cat": "other",
  "effect": null,
  "bonus": "randomizes · cancels crit",
  "sell": 3,
  "where": "Reward/drop"
 },
 {
  "name": "Star Fragment",
  "role": "special",
  "cat": "other",
  "effect": null,
  "bonus": "guaranteed crit",
  "sell": 300,
  "where": "Falls as a shooting star at night"
 }
];
const LORE = [
 {
  "id": "lore_goddesses",
  "title": "The Three Who Shaped the World",
  "eyebrow": "The making of Hyrule",
  "estMin": 4,
  "spoiler": "Creation myth and series origins only; no Breath of the Wild story spoilers beyond Link waking on the Great Plateau.",
  "blocks": [
   {
    "t": "art",
    "svg": "<svg width=\"100%\" viewBox=\"0 0 680 300\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\"><title>Creation</title><desc>Three motes of golden light hover above a dark formless void; below where they descend, a single radiant three-lobed golden sigil coalesces, light pressing into deep abyss with gold and cyan glow.</desc><defs><radialGradient id=\"void\" cx=\"0.5\" cy=\"0.16\" r=\"1.05\"><stop offset=\"0\" stop-color=\"#13252b\"/><stop offset=\"0.42\" stop-color=\"#0f1c22\"/><stop offset=\"1\" stop-color=\"#070f12\"/></radialGradient><radialGradient id=\"descent\" cx=\"0.5\" cy=\"0.16\" r=\"0.62\"><stop offset=\"0\" stop-color=\"#f2c14e\" stop-opacity=\"0.34\"/><stop offset=\"0.45\" stop-color=\"#f0902a\" stop-opacity=\"0.12\"/><stop offset=\"1\" stop-color=\"#f0902a\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"mote\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#fff4d6\" stop-opacity=\"1\"/><stop offset=\"0.3\" stop-color=\"#f2c14e\" stop-opacity=\"0.85\"/><stop offset=\"1\" stop-color=\"#f2c14e\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"cyanmist\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.6\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"emblemglow\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#fff2c4\" stop-opacity=\"0.95\"/><stop offset=\"0.35\" stop-color=\"#f2c14e\" stop-opacity=\"0.55\"/><stop offset=\"0.7\" stop-color=\"#f0902a\" stop-opacity=\"0.18\"/><stop offset=\"1\" stop-color=\"#f0902a\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"lobeFill\" cx=\"0.5\" cy=\"0.3\" r=\"0.75\"><stop offset=\"0\" stop-color=\"#fff3cc\"/><stop offset=\"0.55\" stop-color=\"#f2c14e\"/><stop offset=\"1\" stop-color=\"#f0902a\"/></radialGradient><radialGradient id=\"floorpool\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.22\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient></defs><rect width=\"680\" height=\"300\" fill=\"url(#void)\"/><rect width=\"680\" height=\"300\" fill=\"url(#descent)\"/><ellipse cx=\"340\" cy=\"262\" rx=\"300\" ry=\"40\" fill=\"url(#floorpool)\"/><g stroke=\"#5fd6e2\" stroke-width=\"0.6\" opacity=\"0.12\"><line x1=\"206\" y1=\"74\" x2=\"474\" y2=\"74\"/><line x1=\"206\" y1=\"74\" x2=\"340\" y2=\"200\"/><line x1=\"474\" y1=\"74\" x2=\"340\" y2=\"200\"/></g><g opacity=\"0.5\"><circle cx=\"120\" cy=\"50\" r=\"1.4\" fill=\"#79b8c0\"/><circle cx=\"560\" cy=\"44\" r=\"1.2\" fill=\"#79b8c0\"/><circle cx=\"610\" cy=\"96\" r=\"1.6\" fill=\"#f2c14e\"/><circle cx=\"70\" cy=\"120\" r=\"1.2\" fill=\"#f2c14e\"/><circle cx=\"500\" cy=\"120\" r=\"1\" fill=\"#5fd6e2\"/><circle cx=\"170\" cy=\"150\" r=\"1\" fill=\"#79b8c0\"/></g><circle cx=\"206\" cy=\"74\" r=\"46\" fill=\"url(#cyanmist)\" opacity=\"0.7\"/><circle cx=\"340\" cy=\"60\" r=\"50\" fill=\"url(#cyanmist)\" opacity=\"0.7\"/><circle cx=\"474\" cy=\"74\" r=\"46\" fill=\"url(#cyanmist)\" opacity=\"0.7\"/><circle cx=\"206\" cy=\"74\" r=\"40\" fill=\"url(#mote)\"/><circle cx=\"340\" cy=\"60\" r=\"46\" fill=\"url(#mote)\"/><circle cx=\"474\" cy=\"74\" r=\"40\" fill=\"url(#mote)\"/><circle cx=\"206\" cy=\"74\" r=\"4.4\" fill=\"#fff8e6\"/><circle cx=\"340\" cy=\"60\" r=\"5.2\" fill=\"#fff8e6\"/><circle cx=\"474\" cy=\"74\" r=\"4.4\" fill=\"#fff8e6\"/><g opacity=\"0.55\"><path d=\"M206 74 Q230 130 300 184\" stroke=\"#f2c14e\" stroke-width=\"1.2\" fill=\"none\"/><path d=\"M340 60 Q340 130 340 184\" stroke=\"#f2c14e\" stroke-width=\"1.4\" fill=\"none\"/><path d=\"M474 74 Q450 130 380 184\" stroke=\"#f2c14e\" stroke-width=\"1.2\" fill=\"none\"/></g><circle cx=\"340\" cy=\"218\" r=\"118\" fill=\"url(#emblemglow)\"/><g opacity=\"0.92\"><path d=\"M340 200 C322 178 318 160 340 150 C362 160 358 178 340 200 Z\" fill=\"url(#lobeFill)\"/><path d=\"M340 224 C360 216 380 218 386 240 C368 256 348 250 340 224 Z\" fill=\"url(#lobeFill)\"/><path d=\"M340 224 C320 216 300 218 294 240 C312 256 332 250 340 224 Z\" fill=\"url(#lobeFill)\"/></g><g fill=\"none\" stroke=\"#fff3cc\" stroke-width=\"1\" opacity=\"0.45\"><path d=\"M340 200 C322 178 318 160 340 150 C362 160 358 178 340 200 Z\"/><path d=\"M340 224 C360 216 380 218 386 240 C368 256 348 250 340 224 Z\"/><path d=\"M340 224 C320 216 300 218 294 240 C312 256 332 250 340 224 Z\"/></g><circle cx=\"340\" cy=\"208\" r=\"16\" fill=\"none\" stroke=\"#5fd6e2\" stroke-width=\"0.7\" opacity=\"0.4\"/><circle cx=\"340\" cy=\"208\" r=\"5\" fill=\"#fff8e6\" opacity=\"0.95\"/><g fill=\"#f2c14e\" opacity=\"0.7\"><circle cx=\"262\" cy=\"232\" r=\"1.3\"/><circle cx=\"418\" cy=\"236\" r=\"1.3\"/><circle cx=\"300\" cy=\"280\" r=\"1.1\"/><circle cx=\"384\" cy=\"278\" r=\"1.1\"/><circle cx=\"340\" cy=\"142\" r=\"1.2\"/></g></svg>"
   },
   {
    "t": "p",
    "text": "The land had no shape before it had a name. Out of the chaos came three goddesses, sisters, descending on a place that was not yet a world. There was nothing under their feet to stand on. So they made it."
   },
   {
    "t": "p",
    "text": "Din came first. The oldest tellings give her arms of fire, and she set them to the raw stuff of the place the way a farmer sets hands to a field — pressing, turning, working it until it held a shape and stayed. Where there had been nothing solid, there was ground. Ocarina of Time, the version most players have actually heard, says only that she cultivated the land and made the earth. The later books add the color: red earth, they call it, a hue that has followed Din ever since as the goddess of Power."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "\"Strong flaming arms\" and \"the earth\" come from Ocarina of Time's prologue. The red earth is the later phrasing in Hyrule Historia and the Encyclopedia. The familiar picture of Din heaving up mountains is an embellishment — the canonical lines never mention them.",
    "source": "OoT prologue; Hyrule Historia / Encyclopedia"
   },
   {
    "t": "p",
    "text": "Nayru, goddess of Wisdom, built nothing you could stand on. She poured her wisdom onto the new earth and gave it law — order itself, laid down over the ground like a second substance. The later books make the gesture larger: she lit the firmament overhead with her wisdom and set the fundamental rules the realm would run by. Before her, the ground simply existed. After her, it obeyed."
   },
   {
    "t": "p",
    "text": "Farore came last, goddess of Courage, and she filled what the others had readied. The game says her rich soul made all the life that would uphold the law — living things given a duty from the first breath. The fuller telling lingers on the order of it. She breathed life onto the barren earth and into the seas, and the green things came first, grasses and trees and vines, and only after them the many peoples of Hyrule. Each sister worked on what the one before had left. A bare sphere, then a sphere with rules, then a sphere finally alive."
   },
   {
    "t": "pq",
    "text": "Their work done, the three returned to the heavens — and left a mark on the world where they had stood."
   },
   {
    "t": "p",
    "text": "That mark was the Triforce: three golden triangles locked together, one for each sister's essence, Power and Wisdom and Courage. Ocarina of Time puts it plainly. Where the Triforce stood became sacred land. The Golden Power did not hover in some abstraction; it pressed an imprint into the ground, and that place — later lore names it the Sacred Realm — has been worth dying for in every age since."
   },
   {
    "t": "p",
    "text": "Here is the dangerous heart of it. The Triforce grants a wish to whatever hand touches it, and it does not care whose hand that is. No test of worth. No moral filter. But it answers an honest hand and a divided one differently. A heart balanced in equal parts Power, Wisdom, and Courage can hold the whole relic and command it. A heart that leans — and most do — cannot. The Triforce breaks apart, and the one who reached for it keeps only the single triangle of the trait they believe in most. That fracture is the quiet engine under the whole long saga: Power left in one set of hands, Wisdom and Courage scattered to others."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "The balanced-heart-versus-shattering mechanic comes chiefly from A Link to the Past and is formalized in the Encyclopedia. It is not part of Ocarina of Time's creation narration, though it holds consistent across the series.",
    "source": "A Link to the Past; Zelda Encyclopedia"
   },
   {
    "t": "p",
    "text": "The three sisters never came back to tend what they made. Skyward Sword tells what happened next. They entrusted the world and the Triforce to a different goddess entirely — Hylia, a guardian, not one of the three and not bound to any single virtue. When demons led by Demise tore up through a fissure in the earth, reaching for the relic, Hylia gathered the surviving people onto a slab of ground and ripped it loose into the air, lifting them and the Triforce above a sea of clouds. That single act split the sky from the surface. Later, because a god cannot wield the Triforce, she gave up her divinity to be reborn mortal — the first thread of the line that becomes Princess Zelda."
   },
   {
    "t": "p",
    "text": "By the time Link wakes on the Great Plateau, none of this is spoken aloud. Breath of the Wild never recites the old creation myth, and the Triforce itself never appears as a thing you can hold — only the faint gold on Zelda's raised hand and the crests worn into royal stone. The three sisters survive there mostly as three names carved over spring water: Power, Wisdom, Courage. The statues you pray to are Hylia's. The makers had stepped so far back they became almost the geography itself."
   },
   {
    "t": "note",
    "kind": "theory",
    "text": "Where the goddesses went, and whether they still watch, Nintendo leaves open. The texts say only that they departed for the heavens — not that they are dead, gone, or looking on. Anything past that is a reader's guess, not canon.",
    "source": "reading of OoT / Hyrule Historia (deliberately unresolved)"
   }
  ],
  "sources": [
   "The Legend of Zelda: Ocarina of Time — prologue narration",
   "The Legend of Zelda: Hyrule Historia (Dark Horse, 2013) — creation passage, via transcription",
   "The Legend of Zelda Encyclopedia / Zelda Wiki & Zelda Dungeon Wiki — Golden Goddesses & Triforce",
   "A Link to the Past — Triforce as the Golden Power, and the balanced-heart mechanic",
   "Skyward Sword — Hylia, the entrusted goddess; the raising of the land",
   "Wikipedia, 'Triforce'"
  ]
 },
 {
  "id": "lore_cycle",
  "title": "The Curse That Would Not Die",
  "eyebrow": "Why the story always returns",
  "estMin": 4,
  "spoiler": "Touches the endings of Skyward Sword and Breath of the Wild.",
  "blocks": [
   {
    "t": "art",
    "svg": "<svg width=\"100%\" viewBox=\"0 0 680 300\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\"><title>The eternal return</title><desc>A great luminous ring turning in the dark, a thread of red malice woven through it, and three faint repeating marks spaced around the wheel suggesting an endless cycle.</desc><defs><radialGradient id=\"void\" cx=\"0.5\" cy=\"0.46\" r=\"0.72\"><stop offset=\"0\" stop-color=\"#13252b\"/><stop offset=\"0.55\" stop-color=\"#0c1a1f\"/><stop offset=\"1\" stop-color=\"#091317\"/></radialGradient><radialGradient id=\"core\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#f2c14e\" stop-opacity=\"0.9\"/><stop offset=\"0.4\" stop-color=\"#5fd6e2\" stop-opacity=\"0.35\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"ringgrad\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5fd6e2\"/><stop offset=\"0.5\" stop-color=\"#79b8c0\"/><stop offset=\"1\" stop-color=\"#f2c14e\"/></linearGradient><radialGradient id=\"haze\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.5\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient></defs><rect width=\"680\" height=\"300\" fill=\"url(#void)\"/><g opacity=\"0.5\"><circle cx=\"120\" cy=\"60\" r=\"1\" fill=\"#79b8c0\"/><circle cx=\"600\" cy=\"48\" r=\"1.3\" fill=\"#5fd6e2\"/><circle cx=\"560\" cy=\"240\" r=\"1\" fill=\"#79b8c0\"/><circle cx=\"80\" cy=\"230\" r=\"1.2\" fill=\"#5fd6e2\"/><circle cx=\"640\" cy=\"150\" r=\"1\" fill=\"#79b8c0\"/><circle cx=\"40\" cy=\"140\" r=\"1\" fill=\"#79b8c0\"/><circle cx=\"340\" cy=\"30\" r=\"1.1\" fill=\"#5fd6e2\"/></g><circle cx=\"340\" cy=\"150\" r=\"150\" fill=\"url(#haze)\" opacity=\"0.7\"/><g fill=\"none\"><circle cx=\"340\" cy=\"150\" r=\"118\" stroke=\"#0f1c22\" stroke-width=\"20\" opacity=\"0.9\"/><circle cx=\"340\" cy=\"150\" r=\"118\" stroke=\"url(#ringgrad)\" stroke-width=\"6\" opacity=\"0.95\"/><circle cx=\"340\" cy=\"150\" r=\"106\" stroke=\"#5fd6e2\" stroke-width=\"1\" opacity=\"0.45\"/><circle cx=\"340\" cy=\"150\" r=\"130\" stroke=\"#f2c14e\" stroke-width=\"1\" opacity=\"0.35\"/></g><g stroke=\"#5fd6e2\" stroke-width=\"1.4\" opacity=\"0.55\"><line x1=\"340\" y1=\"32\" x2=\"340\" y2=\"60\"/><line x1=\"458\" y1=\"150\" x2=\"430\" y2=\"150\"/><line x1=\"340\" y1=\"268\" x2=\"340\" y2=\"240\"/><line x1=\"222\" y1=\"150\" x2=\"250\" y2=\"150\"/><line x1=\"424\" y1=\"66\" x2=\"405\" y2=\"85\"/><line x1=\"424\" y1=\"234\" x2=\"405\" y2=\"215\"/><line x1=\"256\" y1=\"234\" x2=\"275\" y2=\"215\"/><line x1=\"256\" y1=\"66\" x2=\"275\" y2=\"85\"/></g><path d=\"M340 32 C402 60 408 110 372 150 C338 188 268 196 256 234 C300 250 380 248 424 234 C400 200 410 130 448 118 C420 70 388 44 340 32 Z\" fill=\"none\" stroke=\"#e0506b\" stroke-width=\"2.6\" opacity=\"0.85\"/><path d=\"M340 32 C402 60 408 110 372 150 C338 188 268 196 256 234\" fill=\"none\" stroke=\"#e0506b\" stroke-width=\"1\" opacity=\"0.5\"/><g fill=\"#e0506b\" opacity=\"0.7\"><circle cx=\"372\" cy=\"150\" r=\"3\"/><circle cx=\"256\" cy=\"234\" r=\"3\"/><circle cx=\"448\" cy=\"118\" r=\"2.4\"/></g><circle cx=\"340\" cy=\"150\" r=\"62\" fill=\"url(#core)\"/><g opacity=\"0.9\"><path d=\"M340 92 L350 132 L340 124 L330 132 Z\" fill=\"#f2c14e\"/><path d=\"M340 92 L350 132 L340 124 L330 132 Z\" fill=\"#f0902a\" opacity=\"0.4\"/></g><g opacity=\"0.85\" transform=\"translate(391 178)\"><path d=\"M0 -26 L9 -4 L0 18 L-9 -4 Z\" fill=\"#5fd6e2\"/><path d=\"M0 -26 L9 -4 L0 18 L-9 -4 Z\" fill=\"#79b8c0\" opacity=\"0.3\"/></g><g opacity=\"0.85\" transform=\"translate(289 178)\" stroke=\"#e0506b\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"><circle cx=\"0\" cy=\"0\" r=\"6\"/><line x1=\"0\" y1=\"-15\" x2=\"0\" y2=\"-10\"/><line x1=\"0\" y1=\"10\" x2=\"0\" y2=\"15\"/><line x1=\"-15\" y1=\"0\" x2=\"-10\" y2=\"0\"/><line x1=\"10\" y1=\"0\" x2=\"15\" y2=\"0\"/></g><g fill=\"#091317\" opacity=\"0.55\"><path d=\"M0 268 L150 252 L300 270 L460 256 L680 272 L680 300 L0 300 Z\"/></g><circle cx=\"340\" cy=\"150\" r=\"5.5\" fill=\"#eafcff\"/><circle cx=\"340\" cy=\"150\" r=\"2.5\" fill=\"#f2c14e\"/></svg>"
   },
   {
    "t": "p",
    "text": "At the end of the oldest game in the chronology, a dying king pauses to compliment the man who killed him. \"Extraordinary,\" he says. The hero stands as a paragon of his kind; he fights like no human or demon the king has ever known. And then — though this is not the end. The Demon King Demise spends his last breath not on rage but on arithmetic, a sentence built to outlast him."
   },
   {
    "t": "p",
    "text": "What he leaves behind is not a son or an heir but a pattern. In the English script of Skyward Sword he lays his curse across two bloodlines at once: the line that carries the blood of the goddess Hylia, and the line that carries the spirit of the hero. Something of him, he promises, will keep coming back to meet them, over and over, with no door at the end of the hall."
   },
   {
    "t": "pq",
    "text": "An incarnation of my hatred shall ever follow your kind, dooming them to wander a blood-soaked sea of darkness for all time."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "Demise's exact words at the close of Skyward Sword (2011). The image is deliberately physical — not vague dread but a sea of blood and dark the cursed lines must wander without end.",
    "source": "The Legend of Zelda: Skyward Sword, ending dialogue (Demise); Zelda Wiki (Fandom) 'Demise'"
   },
   {
    "t": "p",
    "text": "Here the three roles every player half-recognizes get stated almost as a formula: a princess descended from a goddess, a hero who fights like no one else, and a returning darkness that wears a new face each time but carries the same hatred underneath. Skyward Sword sits first in the official timeline, so the curse reaches forward over every game that follows and backward over every one made before, and recasts all of them as another turn of one wheel."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "The tidy 'three bound souls' framing is largely a synthesis of Skyward Sword's dialogue with the supplementary books (Hyrule Historia, the Encyclopedia). And these are reincarnated roles, not one immortal trio — different Links and Zeldas across the ages, bound by another's hate.",
    "source": "Hyrule Historia; Zelda Encyclopedia; Zelda Wiki (Fandom) 'Curse of Demise'"
   },
   {
    "t": "p",
    "text": "The wheel has a real name underneath the translation. The Japanese word at the heart of the curse is on'nen — a Buddhist term for lingering malice caught inside samsara, the cycle of death and rebirth. The official Encyclopedia renders that malice as Demise's \"curse\"; the game's English script renders it as his \"hatred.\" Same concept, different weight: the English shrinks the wheel down to one furious being's grudge."
   },
   {
    "t": "note",
    "kind": "theory",
    "text": "Fan re-translations argue the Japanese frames this as the curse of an entire Demon Tribe, steeped in samsara rather than personal revenge. One close reading goes further still — that the curse may be born from Hylia's hatred as much as Demise's, so the 'incarnation' walks beside the hero and princess instead of merely hunting them. An interpretation of the Japanese, not stated canon, but it unsettles the story of one-sided vengeance.",
    "source": "'An Incarnation of My Hatred,' pocketseizure / Mossflower Journal; Zelda Dungeon, 'Demise's Speech Re-Translated By a Fan'"
   },
   {
    "t": "p",
    "text": "Now hold all of that against Breath of the Wild, and notice what is missing. Demise never appears. Ganondorf never appears. The name of the curse is never spoken. What the game shows instead is the pattern running on its own, told partly in cloth. The Calamity Ganon Tapestry depicts a war ten thousand years gone — an ancient Hero with the Sword that Seals the Darkness, a Princess marked by sacred Triforce power, and the Sheikah's Guardians and Divine Beasts. The Sheikah did not merely beat Ganon then. They wrote down that he would come back, and built their machines as a hedge against a return they treated as certain."
   },
   {
    "t": "p",
    "text": "And he did return — on a birthday. The Great Calamity broke a hundred years before Link wakes, on the day Zelda turned seventeen, her sacred power still locked inside her and unable to answer in time. When she finally names the enemy at the game's close, she calls Ganon \"a pure embodiment of the ancient evil that is reborn time and time again.\" It is the nearest Breath of the Wild ever comes to Demise's curse, and it gets there without him."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "The honest caveat: the named link between BotW's Ganon and Demise's curse comes from Skyward Sword and the supplementary books — not from BotW's own script, which mentions neither Demise nor Skyward Sword. Zelda's 'reborn time and time again' evokes the cycle; it does not confirm the source of it on screen. Whether Ganon literally is Demise reborn, Nintendo leaves open.",
    "source": "Breath of the Wild ending dialogue (Princess Zelda); Hyrule Historia; Zelda Wiki (Fandom) 'Demise'"
   },
   {
    "t": "note",
    "kind": "creator",
    "text": "One design choice tips Nintendo's hand without committing to it. A developer recounts that to make Demise resemble Ganondorf, the team didn't just give him red hair — they set it on fire. A strong implication of the connection, stated in commentary rather than in any game.",
    "source": "Hyrule Historia (developer commentary); Nintendo Life, 'Are Ganondorf And Ganon The Same Person?'"
   },
   {
    "t": "p",
    "text": "There is one more crack worth seeing clearly. When Ganon drops his schemes and becomes Dark Beast Ganon, the English says he \"has given up on reincarnation and assumed his pure, enraged form\" — hatred with the disguise stripped off. The Japanese reads almost the opposite: that the form was born from his refusal to give up on revival. The honest reconciliation is that he abandoned one battle's unfinished body, not the cycle itself."
   },
   {
    "t": "note",
    "kind": "theory",
    "text": "This ending line is a known localization landmine. English 'given up on reincarnation' and Japanese 'refused to give up on revival' scan as opposites; treat neither as the single literal meaning.",
    "source": "Nintendo Life, 'Translation of Zelda: BotW's Japanese Ending Prompts Interesting Debate' (Aug 2017); Legends of Localization"
   },
   {
    "t": "p",
    "text": "The wheel keeps turning either way. And when the final seal holds, the malice drains out of the land and Hyrule's monsters go quiet — as if the hatred had never belonged to Ganon alone, but had soaked into the world he kept coming back to ruin."
   }
  ],
  "sources": [
   "The Legend of Zelda: Skyward Sword — in-game ending dialogue (Demise's curse)",
   "The Legend of Zelda: Breath of the Wild — in-game ending dialogue (Princess Zelda on Ganon / Dark Beast Ganon)",
   "Hyrule Historia (Dark Horse / Nintendo) — official timeline placement and Demise/Ganondorf design commentary",
   "The Legend of Zelda Encyclopedia (Dark Horse / Nintendo) — Demise / curse (on'nen) terminology",
   "Zelda Wiki (Fandom): 'Demise' — https://zelda.fandom.com/wiki/Demise",
   "Zelda Wiki (Fandom): 'Curse of Demise' — https://zelda.fandom.com/wiki/Curse_of_Demise",
   "Nintendo Life: 'Are Ganondorf And Ganon The Same Person? — Zelda Villains Explained'",
   "Nintendo Life: 'Translation of Zelda: Breath of the Wild's Japanese Ending Prompts Interesting Debate' (Aug 2017)",
   "Legends of Localization: 'How Ganon's Motivation Changed in Breath of the Wild's English Translation'",
   "'An Incarnation of My Hatred' — pocketseizure / Mossflower Journal (close reading of the Japanese on'nen / gonge)",
   "Zelda Dungeon: 'Demise's Speech Re-Translated By a Fan'",
   "Zelda Wiki (Fandom): 'Great Calamity' / 'Calamity Ganon' / 'Calamity Ganon Tapestry'"
  ]
 },
 {
  "id": "lore_timeline",
  "title": "The Shape of Time",
  "eyebrow": "How every Zelda connects",
  "estMin": 4,
  "spoiler": "Reveals the endings of Ocarina of Time and Wind Waker, and where Breath of the Wild sits in the saga.",
  "blocks": [
   {
    "t": "art",
    "svg": "<svg width=\"100%\" viewBox=\"0 0 680 300\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\"><title>Time as a branching tree of light</title><desc>A single bright point at the base sends one luminous trunk rising into the dark abyss, splitting into three glowing boughs that represent three eras, their far tips fading into teal and gold.</desc><defs><radialGradient id=\"bgGlow\" cx=\"0.5\" cy=\"1\" r=\"1.05\"><stop offset=\"0\" stop-color=\"#12262b\"/><stop offset=\"0.45\" stop-color=\"#0d1c21\"/><stop offset=\"1\" stop-color=\"#091317\"/></radialGradient><radialGradient id=\"seed\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#fdf6e3\" stop-opacity=\"1\"/><stop offset=\"0.3\" stop-color=\"#f2c14e\" stop-opacity=\"0.95\"/><stop offset=\"0.7\" stop-color=\"#5fd6e2\" stop-opacity=\"0.35\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"trunk\" x1=\"0\" y1=\"1\" x2=\"0\" y2=\"0\"><stop offset=\"0\" stop-color=\"#f2c14e\"/><stop offset=\"0.5\" stop-color=\"#7fd9e0\"/><stop offset=\"1\" stop-color=\"#5fd6e2\"/></linearGradient><linearGradient id=\"boughGold\" x1=\"0\" y1=\"1\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#f2c14e\" stop-opacity=\"0.95\"/><stop offset=\"1\" stop-color=\"#f0902a\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"boughCyan\" x1=\"0\" y1=\"1\" x2=\"0\" y2=\"0\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.95\"/><stop offset=\"1\" stop-color=\"#79b8c0\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"boughCyanL\" x1=\"1\" y1=\"1\" x2=\"0\" y2=\"0\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.9\"/><stop offset=\"1\" stop-color=\"#79b8c0\" stop-opacity=\"0\"/></linearGradient><radialGradient id=\"tipGlow\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#eafcff\" stop-opacity=\"0.9\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient></defs><rect width=\"680\" height=\"300\" fill=\"url(#bgGlow)\"/><ellipse cx=\"340\" cy=\"290\" rx=\"300\" ry=\"70\" fill=\"#5fd6e2\" opacity=\"0.05\"/><g opacity=\"0.7\"><circle cx=\"120\" cy=\"60\" r=\"1.4\" fill=\"#79b8c0\"/><circle cx=\"560\" cy=\"48\" r=\"1.2\" fill=\"#f2c14e\"/><circle cx=\"470\" cy=\"90\" r=\"1\" fill=\"#79b8c0\"/><circle cx=\"230\" cy=\"40\" r=\"1\" fill=\"#79b8c0\"/><circle cx=\"610\" cy=\"120\" r=\"1.3\" fill=\"#5fd6e2\"/><circle cx=\"70\" cy=\"130\" r=\"1\" fill=\"#79b8c0\"/></g><g fill=\"none\" stroke-linecap=\"round\" opacity=\"0.28\"><path d=\"M340 288 C 320 230 300 200 250 170\" stroke=\"#5fd6e2\" stroke-width=\"10\"/><path d=\"M340 288 C 360 230 380 200 430 170\" stroke=\"#f2c14e\" stroke-width=\"10\"/></g><path d=\"M340 290 C 338 250 340 220 340 196\" fill=\"none\" stroke=\"url(#trunk)\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M340 290 C 338 250 340 220 340 196\" fill=\"none\" stroke=\"#eafcff\" stroke-width=\"2.6\" stroke-linecap=\"round\" opacity=\"0.8\"/><g fill=\"none\" stroke-linecap=\"round\"><path d=\"M340 200 C 320 168 250 150 150 116\" stroke=\"url(#boughCyanL)\" stroke-width=\"6.5\"/><path d=\"M340 198 C 342 150 348 110 352 64\" stroke=\"url(#boughCyan)\" stroke-width=\"6.5\"/><path d=\"M340 200 C 360 168 430 150 540 120\" stroke=\"url(#boughGold)\" stroke-width=\"6.5\"/></g><g fill=\"none\" stroke-linecap=\"round\" opacity=\"0.85\"><path d=\"M225 134 C 200 120 185 100 178 78\" stroke=\"url(#boughCyanL)\" stroke-width=\"3\"/><path d=\"M205 124 C 188 132 170 132 150 138\" stroke=\"url(#boughCyanL)\" stroke-width=\"2.4\"/><path d=\"M349 120 C 332 104 318 96 300 86\" stroke=\"url(#boughCyan)\" stroke-width=\"3\"/><path d=\"M350 96 C 364 82 380 76 396 66\" stroke=\"url(#boughCyan)\" stroke-width=\"2.6\"/><path d=\"M455 138 C 480 124 498 106 506 86\" stroke=\"url(#boughGold)\" stroke-width=\"3\"/><path d=\"M470 132 C 488 140 506 142 528 148\" stroke=\"url(#boughGold)\" stroke-width=\"2.4\"/></g><g fill=\"none\" stroke-linecap=\"round\" opacity=\"0.5\"><path d=\"M178 78 C 168 66 158 58 148 50\" stroke=\"#79b8c0\" stroke-width=\"1.5\"/><path d=\"M396 66 C 408 56 418 50 428 44\" stroke=\"#79b8c0\" stroke-width=\"1.5\"/><path d=\"M506 86 C 514 74 522 66 530 58\" stroke=\"#f2c14e\" stroke-width=\"1.5\"/></g><circle cx=\"150\" cy=\"116\" r=\"20\" fill=\"url(#tipGlow)\"/><circle cx=\"352\" cy=\"64\" r=\"22\" fill=\"url(#tipGlow)\"/><circle cx=\"540\" cy=\"120\" r=\"20\" fill=\"url(#tipGlow)\"/><circle cx=\"148\" cy=\"50\" r=\"10\" fill=\"url(#tipGlow)\"/><circle cx=\"428\" cy=\"44\" r=\"10\" fill=\"url(#tipGlow)\"/><circle cx=\"530\" cy=\"58\" r=\"10\" fill=\"url(#tipGlow)\"/><g fill=\"#eafcff\"><circle cx=\"150\" cy=\"116\" r=\"2.6\"/><circle cx=\"352\" cy=\"64\" r=\"2.8\"/><circle cx=\"540\" cy=\"120\" r=\"2.6\"/></g><g fill=\"#5fd6e2\" opacity=\"0.9\"><circle cx=\"148\" cy=\"50\" r=\"1.6\"/><circle cx=\"396\" cy=\"66\" r=\"1.4\"/><circle cx=\"428\" cy=\"44\" r=\"1.6\"/></g><g fill=\"#f2c14e\" opacity=\"0.9\"><circle cx=\"530\" cy=\"58\" r=\"1.6\"/><circle cx=\"300\" cy=\"86\" r=\"1.4\"/></g><circle cx=\"340\" cy=\"290\" r=\"70\" fill=\"url(#seed)\"/><circle cx=\"340\" cy=\"290\" r=\"6\" fill=\"#fdf6e3\"/></svg>"
   },
   {
    "t": "p",
    "text": "For twenty-five years the games arrived out of order and nobody minded. The 1986 original dropped a boy into a kingdom already in ruins; later games reached back behind that ruin, or sideways from it, and the threads never quite tied. Then, for the series' anniversary, Nintendo printed the knot. A book called Hyrule Historia ran a section it titled a chronology, and the scattered legend finally had an official order: this happened, then this, then the world split."
   },
   {
    "t": "p",
    "text": "It begins with almost nothing. Three golden goddesses — Din, Nayru, Farore — shape the world, leave the Triforce behind, and depart. They give its keeping to one goddess, Hylia, and everything after hangs from that single handoff. Skyward Sword sits first: the age just after creation, when Hylia seals away the demon Demise and lifts the surviving mortals onto islands floating above a sea of cloud, a whole people raised into the sky to keep them out of his reach. There a Link feeds three sacred flames into the goddess's blade and tempers it, on screen, into the Master Sword every later hero will draw. And there the dying Demise lays down a curse: the goddess and her chosen knight will be born again across the ages, and his hatred will return each time wearing the face of Ganon. That curse is the engine of the whole saga."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "The Master Sword, the Triforce, the Demise-to-Ganon curse, and the rebirth of Link and Zelda all begin here, in Skyward Sword's age — and then recur down every branch that follows. They belong to no single later game; they are the inheritance all of them share.",
    "source": "Hyrule Historia; Green Man Gaming timeline"
   },
   {
    "t": "p",
    "text": "From there a single line runs forward — the founding of Hyrule, the first quarrels over the Triforce, the era of the Minish and the Four Sword — until it reaches Ocarina of Time. And at Ocarina of Time the line does not bend. It shatters into three."
   },
   {
    "t": "pq",
    "text": "One boy's single adventure splays into three futures that cannot all be true at once."
   },
   {
    "t": "p",
    "text": "Two of the three are kinder. In one, the hero who beat Ganondorf as an adult is sent back to his own childhood to warn the princess before the man ever rises — the Child Era, where the warning holds and Majora's Mask, Twilight Princess, and Four Swords Adventures play out. In the other, that same return leaves the future with no hero in it at all; Ganon comes back, and the gods drown Hyrule beneath an endless ocean, until only the old mountaintops break the surface as islands. That is the Adult Era, the Great Sea, where Wind Waker opens on the waves, followed by Phantom Hourglass and Spirit Tracks."
   },
   {
    "t": "p",
    "text": "The third branch is the strange one. It asks what happens if Link simply loses — if the hero falls at Ocarina of Time and Ganon takes the whole Triforce. This is the Downfall branch, the canonized Game Over: the future where you failed, made real. No in-game text had ever declared it; the chronology took the hypothetical defeat and set it down as alternate history. Down that ruined road runs the oldest run of games — the 1986 original, Zelda II, A Link to the Past, Link's Awakening, the Oracle pair, A Link Between Worlds, Tri Force Heroes — the NES quest playing out in the ashes."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "The branch names drift between sources and translations: Downfall, Decline, and Fallen Hero all mean the same line. And the order inside it has already been revised — Nintendo later moved Link's Awakening ahead of the Oracle games. The chronology is treated as correctable, not carved. The pre-split early line, the Minish and Four Sword stretch most of all, is the thinnest and most contested part of it.",
    "source": "Kotaku (Schreier, 2018); Hyrule Historia"
   },
   {
    "t": "p",
    "text": "Which leaves the question every player asks: where does Breath of the Wild fall? Nintendo's answer is a deliberate non-answer. They placed it at the very end — but at the end of all three branches at once, refusing to pin it to one. When Famitsu pressed Aonuma on which timeline, he half-dodged: of course it's at the very end, he said — but you mean which timeline's end. Director Fujibayashi handed the question straight back: that's up to the player's imagination, isn't it. In Creating a Champion, Aonuma made the reasoning plain. A fixed placement would settle the story and close the room to imagine, and he liked watching players build their own readings out of the fragments. He has said Nintendo will never reveal it."
   },
   {
    "t": "note",
    "kind": "creator",
    "text": "For Tears of the Kingdom, Aonuma held the same line — chronology, he said, can box the design in and limit where the story is allowed to go — so its place in the order is left looser still. Read its position as openly unsettled, not as a branch waiting to be named.",
    "source": "Game Informer / IGN, Dec 2023; Creating a Champion (2018)"
   },
   {
    "t": "note",
    "kind": "creator",
    "text": "The book that fixed all this prints its own hedge: the chronicle, Nintendo wrote, merely collects what is believed to be true at this time. An official history that admits up front it may be wrong.",
    "source": "Hyrule Historia; Aonuma afterword"
   },
   {
    "t": "p",
    "text": "So the shape of time here is not a line but a tree — rooted in one goddess's hand and a dying demon's curse, splitting once at a boy's hardest choice. And at its furthest tip stands a kingdom Nintendo has set down exactly where every reading of it stays true at once."
   }
  ],
  "sources": [
   "The Legend of Zelda: Hyrule Historia (Shogakukan 2011 / Dark Horse 2013) — 'The History of Hyrule: A Chronology', overseen by Eiji Aonuma",
   "The Legend of Zelda: Breath of the Wild — Creating a Champion (2018) — Aonuma on deliberate ambiguity",
   "Famitsu (2017), Aonuma & Fujibayashi on BotW placement — via Kotaku, Jason Schreier, Aug 6 2018",
   "Nintendo Everything — Aonuma: Nintendo will never reveal BotW's placement",
   "Game Informer / IGN interview, Dec 2023 — Aonuma on chronology 'boxing us in' (TotK)",
   "Dexerto — Fallen Hero, Child and Adult Timelines explained (per-branch game lists)",
   "CBR — Legend of Zelda Downfall Timeline guide",
   "Green Man Gaming — The Legend of Zelda Timeline, all games in order (creation / Hylia / Demise)"
  ]
 },
 {
  "id": "lore_master_sword",
  "title": "The Blade That Seals the Darkness",
  "eyebrow": "The Master Sword, from the first goddess to the rusted pedestal",
  "estMin": 4,
  "spoiler": "Discusses Recovered Memory 18 and how Link gets the Master Sword in Breath of the Wild.",
  "blocks": [
   {
    "t": "art",
    "svg": "<svg width=\"100%\" viewBox=\"0 0 680 300\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\"><title>A blade resting in a forest pedestal</title><desc>A stylized sword stands point-down in a weathered stone pedestal within a quiet forest clearing, lit by a pale shaft of light from above with drifting motes, framed by faint dark trees.</desc><defs><linearGradient id=\"forest\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#070f12\"/><stop offset=\"0.55\" stop-color=\"#0c1a18\"/><stop offset=\"1\" stop-color=\"#091317\"/></linearGradient><linearGradient id=\"beam\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.42\"/><stop offset=\"0.6\" stop-color=\"#9bc08a\" stop-opacity=\"0.16\"/><stop offset=\"1\" stop-color=\"#9bc08a\" stop-opacity=\"0\"/></linearGradient><radialGradient id=\"clearing\" cx=\"0.5\" cy=\"0.42\" r=\"0.55\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.28\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"floor\" cx=\"0.5\" cy=\"0.9\" r=\"0.7\"><stop offset=\"0\" stop-color=\"#9bc08a\" stop-opacity=\"0.18\"/><stop offset=\"1\" stop-color=\"#9bc08a\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"blade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#79b8c0\"/><stop offset=\"0.5\" stop-color=\"#5fd6e2\"/><stop offset=\"1\" stop-color=\"#e9e2d2\"/></linearGradient><linearGradient id=\"grip\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#2a484e\"/><stop offset=\"0.5\" stop-color=\"#4a7880\"/><stop offset=\"1\" stop-color=\"#2a484e\"/></linearGradient><radialGradient id=\"gem\" cx=\"0.5\" cy=\"0.4\" r=\"0.6\"><stop offset=\"0\" stop-color=\"#f2c14e\"/><stop offset=\"1\" stop-color=\"#f0902a\"/></radialGradient></defs><rect width=\"680\" height=\"300\" fill=\"url(#forest)\"/><polygon points=\"290,0 390,0 430,300 250,300\" fill=\"url(#beam)\"/><ellipse cx=\"340\" cy=\"130\" rx=\"180\" ry=\"150\" fill=\"url(#clearing)\"/><g fill=\"#060d10\" opacity=\"0.92\"><polygon points=\"40,300 58,90 76,300\"/><polygon points=\"46,120 58,96 70,120\"/><polygon points=\"44,160 58,140 72,160\"/><polygon points=\"42,200 58,178 74,200\"/><polygon points=\"120,300 134,140 148,300\"/><polygon points=\"124,170 134,152 144,170\"/><polygon points=\"122,210 134,190 146,210\"/></g><g fill=\"#070f12\" opacity=\"0.9\"><polygon points=\"612,300 628,80 644,300\"/><polygon points=\"616,116 628,90 640,116\"/><polygon points=\"614,158 628,136 642,158\"/><polygon points=\"612,202 628,178 644,202\"/><polygon points=\"540,300 552,150 564,300\"/><polygon points=\"544,178 552,158 560,178\"/><polygon points=\"542,218 552,196 562,218\"/></g><g fill=\"#0a1518\" opacity=\"0.85\"><polygon points=\"200,300 210,200 220,300\"/><polygon points=\"470,300 480,196 490,300\"/></g><ellipse cx=\"340\" cy=\"262\" rx=\"150\" ry=\"26\" fill=\"url(#floor)\"/><g><polygon points=\"296,250 384,250 372,300 308,300\" fill=\"#0d1a1d\"/><polygon points=\"296,250 384,250 388,238 292,238\" fill=\"#16282b\"/><rect x=\"292\" y=\"234\" width=\"96\" height=\"8\" rx=\"2\" fill=\"#1d3236\"/><path d=\"M340 234 L340 224\" stroke=\"#5fd6e2\" stroke-width=\"1\" opacity=\"0.3\"/></g><g><polygon points=\"340,28 348,42 348,180 340,196 332,180 332,42\" fill=\"url(#blade)\"/><line x1=\"340\" y1=\"44\" x2=\"340\" y2=\"178\" stroke=\"#091317\" stroke-width=\"1\" opacity=\"0.35\"/><polygon points=\"340,28 344,40 340,46 336,40\" fill=\"#e9e2d2\"/></g><g><rect x=\"310\" y=\"180\" width=\"60\" height=\"9\" rx=\"3\" fill=\"#79b8c0\"/><polygon points=\"310,189 370,189 360,184 320,184\" fill=\"#5fd6e2\" opacity=\"0.5\"/><rect x=\"334\" y=\"189\" width=\"12\" height=\"40\" fill=\"url(#grip)\"/><circle cx=\"340\" cy=\"231\" r=\"6.5\" fill=\"url(#gem)\"/><circle cx=\"340\" cy=\"231\" r=\"6.5\" fill=\"none\" stroke=\"#f2c14e\" stroke-width=\"0.8\" opacity=\"0.6\"/></g><circle cx=\"340\" cy=\"120\" r=\"58\" fill=\"url(#clearing)\" opacity=\"0.7\"/><g fill=\"#e9e2d2\"><circle cx=\"312\" cy=\"96\" r=\"1.6\" opacity=\"0.8\"/><circle cx=\"368\" cy=\"150\" r=\"1.3\" opacity=\"0.6\"/><circle cx=\"326\" cy=\"200\" r=\"1.8\" opacity=\"0.7\"/><circle cx=\"356\" cy=\"78\" r=\"1.2\" opacity=\"0.5\"/><circle cx=\"300\" cy=\"168\" r=\"1.4\" opacity=\"0.55\"/><circle cx=\"380\" cy=\"110\" r=\"1.5\" opacity=\"0.6\"/><circle cx=\"344\" cy=\"60\" r=\"1.1\" opacity=\"0.5\"/><circle cx=\"318\" cy=\"140\" r=\"1.2\" opacity=\"0.65\"/></g><g fill=\"#f2c14e\"><circle cx=\"334\" cy=\"116\" r=\"1.3\" opacity=\"0.7\"/><circle cx=\"360\" cy=\"190\" r=\"1.2\" opacity=\"0.5\"/><circle cx=\"308\" cy=\"120\" r=\"1\" opacity=\"0.55\"/></g></svg>"
   },
   {
    "t": "p",
    "text": "Deep in the Lost Woods, past the fog that turns a traveler in circles until he quits, there is a clearing, and in the clearing a pedestal, and in the pedestal a sword. It has waited a hundred years. When Link finds it, it does not gleam the way the songs promise. The blade is chipped. Rust has spotted the steel. It looks like what it is: a holy thing that fought a war, lost, and was carried here to heal."
   },
   {
    "t": "p",
    "text": "The stories about where it came from do not agree, and the disagreement is itself part of its history. The oldest game to name it, A Link to the Past, said the people of Hyrule forged it — a blade made to resist magic, to turn aside even the power of the Triforce, so that mortals could stand against Ganon. They called it the Blade of Evil's Bane. Years later, Twilight Princess told it otherwise: not smiths but ancient sages had shaped it. Two answers, both spoken as truth."
   },
   {
    "t": "p",
    "text": "The account that now sits beneath the others arrived last and reaches furthest back. In Skyward Sword, the earliest tale in the whole chronology, the sword does not begin as a sword. The goddess Hylia made the Goddess Sword, and inside it she set a spirit named Fi — not an enchantment but a person of sorts, who speaks in cold arithmetic. She was made, by Hylia, for one purpose: to help the goddess's chosen hero carry the burden that was his to carry. Her own words put it long before her people kept any memory at all."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "Nintendo gave the contradiction an in-story alibi. Fi remarks that spoken tradition is among the least reliable ways to keep and pass on what is known — a quiet admission that the older origin tales were always going to drift.",
    "source": "Skyward Sword (Fi dialogue); Den of Geek"
   },
   {
    "t": "p",
    "text": "And it was the hero, not the goddess, who finished it. Link bathed the Goddess Sword in three Sacred Flames, each tied to one of the Golden Goddesses. Farore's green fire, in the Ancient Cistern, lengthened the blade and doubled its strength. Nayru's blue fire, aboard the Sandship, sharpened Fi's sense for hidden things. In the Fire Sanctuary, Din's red flame poured sacred light into the steel, tripled its strength again, and granted the one power that mattered — to repel evil. Green, then blue, then red, and the Goddess Sword became the Master Sword."
   },
   {
    "t": "pq",
    "text": "It was made to end one evil. That evil promised to come back, and the blade has been answering the same enemy ever since."
   },
   {
    "t": "p",
    "text": "When the demon king Demise fell, his last act was a curse: his hatred would be reborn again and again, a cycle with no clean end. That reborn malice is understood to become Ganon — not Demise himself, but the seed he left in the world. Link set the sword back in its pedestal at the Sealed Grounds to keep the sealed evil contained, where it would rest until it was needed again. So the work of the blade is never finished. Only postponed."
   },
   {
    "t": "note",
    "kind": "theory",
    "text": "Fans often say Demise's spirit is locked inside the Master Sword itself. The game never states that. What it shows is the blade returned to its pedestal to hold the seal, and a curse promising the evil will return — which is enough.",
    "source": "community interpretation; Zelda Dungeon Forums"
   },
   {
    "t": "p",
    "text": "Which brings the cycle back to that rusted blade in the Korok Forest. The Great Deku Tree watches over it, and calls it the weapon of the ancient goddess, the sword that seals the darkness, that only the chosen knight can raise against the Calamity. Against Ganon, or anything stained with his Malice, it kindles with holy light and shows what it can truly do — though the Deku Tree warns Link not to lean on that power too hard. A century before, Zelda had laid it here herself, battle-worn from the fight against the Calamity. She spoke to it like a comrade, asking it to trust that Link would come back, then had him carried to the Shrine of Resurrection."
   },
   {
    "t": "p",
    "text": "To draw it now, a hero needs at least thirteen full hearts; the borrowed yellow kind do not count. Pulling it costs life as you pull — the bar drains while Link strains, and the Deku Tree shouts for him to stop before it kills him. Earn the right and the reward is a blade that will not shatter like the rusting arsenal around it. It only runs out of light, and rests about ten minutes before it glows again: a weapon that wakes when evil is near and sleeps the rest of the time."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "How Link first won the sword, a hundred years earlier, was left blank on purpose. Creating a Champion says the details are lost to time, though he likely took it around age twelve or thirteen. Where Breath of the Wild sits on the series timeline was also left open, by Aonuma's own account.",
    "source": "Creating a Champion (Aonuma commentary)"
   }
  ],
  "sources": [
   "Wikipedia — Master Sword",
   "Den of Geek — 'Who Forged the Master Sword?'",
   "Zelda Dungeon Wiki — Sacred Flames; The Master Sword (Memory)",
   "Zelda Wiki (Fandom) — Fi; The Goddess Hylia; Curse of Demise; Korok Forest",
   "Game8; Nintendo Life; Dexerto — Master Sword (BotW)",
   "Orcz — Great Deku Tree dialogue transcript",
   "PRIMARY (in-game) — Skyward Sword (Fi); BotW Hyrule Compendium, Great Deku Tree dialogue, Recovered Memory 18",
   "PRIMARY (book) — Breath of the Wild – Creating a Champion (Dark Horse, 2018)"
  ]
 },
 {
  "id": "lore_calamity",
  "title": "When the Sky Turned Red",
  "eyebrow": "The Great Calamity · a hundred years before Link wakes",
  "estMin": 4,
  "spoiler": "Tells the full backstory of the Great Calamity — the Champions' fate and Zelda's stand. It's the history your game begins after, so it's safe to read from the start.",
  "blocks": [
   {
    "t": "art",
    "svg": "<svg width=\"100%\" viewBox=\"0 0 680 300\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\"><title>When the sky turned red</title><desc>A stylized castle on a far hill beneath a blood-red, malice-streaked sky, with one cold blue point of Guardian light on the dark foreground ridge. Original art, no Nintendo assets.</desc><defs><linearGradient id=\"cbsky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#08151b\"/><stop offset=\"0.48\" stop-color=\"#1b1320\"/><stop offset=\"0.76\" stop-color=\"#5e1f2c\"/><stop offset=\"1\" stop-color=\"#b1303f\"/></linearGradient><radialGradient id=\"cbglow\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#7fe6f2\" stop-opacity=\"0.9\"/><stop offset=\"1\" stop-color=\"#7fe6f2\" stop-opacity=\"0\"/></radialGradient></defs><rect width=\"680\" height=\"300\" fill=\"url(#cbsky)\"/><circle cx=\"92\" cy=\"40\" r=\"1.2\" fill=\"#bfe9f0\" opacity=\"0.7\"/><circle cx=\"170\" cy=\"26\" r=\"1\" fill=\"#bfe9f0\" opacity=\"0.5\"/><circle cx=\"262\" cy=\"50\" r=\"1.1\" fill=\"#bfe9f0\" opacity=\"0.6\"/><circle cx=\"540\" cy=\"34\" r=\"1\" fill=\"#bfe9f0\" opacity=\"0.5\"/><circle cx=\"616\" cy=\"58\" r=\"1.3\" fill=\"#bfe9f0\" opacity=\"0.6\"/><circle cx=\"436\" cy=\"120\" r=\"104\" fill=\"#c4384b\" opacity=\"0.16\"/><circle cx=\"436\" cy=\"120\" r=\"66\" fill=\"#d34255\" opacity=\"0.16\"/><path d=\"M312 120 q66 -44 142 -14 q56 24 24 78\" fill=\"none\" stroke=\"#e2566a\" stroke-width=\"2\" opacity=\"0.32\" stroke-linecap=\"round\"/><path d=\"M340 160 q74 -34 142 6\" fill=\"none\" stroke=\"#e2566a\" stroke-width=\"1.5\" opacity=\"0.24\" stroke-linecap=\"round\"/><path d=\"M0 196 L120 168 L212 192 L342 162 L470 190 L560 168 L680 196 L680 300 L0 300 Z\" fill=\"#0a141a\" opacity=\"0.85\"/><g fill=\"#070f14\"><rect x=\"396\" y=\"138\" width=\"18\" height=\"58\"/><polygon points=\"396,138 405,121 414,138\"/><rect x=\"420\" y=\"126\" width=\"24\" height=\"70\"/><polygon points=\"420,126 432,103 444,126\"/><rect x=\"450\" y=\"146\" width=\"16\" height=\"50\"/><polygon points=\"450,146 458,131 466,146\"/><rect x=\"378\" y=\"156\" width=\"13\" height=\"40\"/><polygon points=\"378,156 384,144 391,156\"/></g><path d=\"M0 236 L150 224 L300 246 L470 228 L680 252 L680 300 L0 300 Z\" fill=\"#04090c\"/><g transform=\"translate(214,236)\" fill=\"#04090c\"><circle cx=\"0\" cy=\"-12\" r=\"4\"/><rect x=\"-3\" y=\"-9\" width=\"6\" height=\"12\" rx=\"2.4\"/><rect x=\"-7\" y=\"-6\" width=\"4.6\" height=\"2.8\" rx=\"1.4\" transform=\"rotate(-26 -5 -5)\"/><rect x=\"2.4\" y=\"-8\" width=\"3.6\" height=\"13\" rx=\"1.8\" transform=\"rotate(18 4 -2)\"/></g><circle cx=\"150\" cy=\"224\" r=\"30\" fill=\"url(#cbglow)\"/><circle cx=\"150\" cy=\"224\" r=\"4.2\" fill=\"#eafcff\"/><circle cx=\"150\" cy=\"224\" r=\"2\" fill=\"#0a141a\"/><line x1=\"150\" y1=\"224\" x2=\"406\" y2=\"170\" stroke=\"#7fe6f2\" stroke-width=\"1\" opacity=\"0.4\" stroke-linecap=\"round\"/><circle cx=\"120\" cy=\"266\" r=\"1.4\" fill=\"#f0902a\" opacity=\"0.8\"/><circle cx=\"252\" cy=\"278\" r=\"1.1\" fill=\"#f0902a\" opacity=\"0.6\"/><circle cx=\"470\" cy=\"270\" r=\"1.3\" fill=\"#f0902a\" opacity=\"0.7\"/><circle cx=\"566\" cy=\"284\" r=\"1\" fill=\"#f0902a\" opacity=\"0.5\"/></svg>"
   },
   {
    "t": "p",
    "text": "Long before Link woke beneath the Great Plateau with the dust of a century on his skin, Hyrule had already died once — and saved itself, and forgotten how."
   },
   {
    "t": "p",
    "text": "The oldest stories begin ten thousand years ago, in a Hyrule far richer and wiser than the one Link would wake into, and they begin the way the worst stories do: with a warning that came true. Ganon, the histories say, was less a monster than a malice — old, patient, and bottomless — and when the seers foretold his coming, the people did not run. They built."
   },
   {
    "t": "p",
    "text": "It was the Sheikah who built, for no people in the world could match their craft. They made an army of Guardians: tall things that walked on jointed legs and watched the world through a single eye, and when that eye woke it shone a cold and certain blue, and a thread of light would unspool from it to settle on whatever it meant to kill. And they made four Divine Beasts — mountains that moved, each shaped after a living creature and each given an element to carry. An elephant for the water. A salamander for the fire. An eagle for the wind. A camel for the thunder."
   },
   {
    "t": "p",
    "text": "But it was not the engines that ended the first Calamity. In that age a princess was born with a sacred light inside her, and a knight rose to stand at her side bearing the sword that seals the darkness, and between the two of them — the power and the blade — they bound Ganon and sealed the darkness away. Their names should have outlasted the mountains. Instead the kingdom kept the machines and lost the people, and no one alive today can tell you who that first hero was, or that first princess. Only that they were."
   },
   {
    "t": "p",
    "text": "What came after is the part the Sheikah's children would pay for. The kings who followed looked at a people who could build a seeing eye and a walking fortress, and they were afraid — and fear did what fear always does. The Sheikah were thanked, and then watched, and then sent away, their works buried and their knowledge let go like a held breath. And there it stayed, under the grass and the years, until the prophecy came around again, the way prophecies do."
   },
   {
    "t": "p",
    "text": "That turning came a hundred years before our story. King Rhoam read the old signs — the same signs his ancestors had read — and understood that the Calamity was returning, and so Hyrule went digging in its own grave. Out of the soil came the sleeping Guardians and the four Divine Beasts, made, the king said, “by the hands of our distant ancestors”: a hundred centuries of earth brushed from machines that still remembered how to wake. And Rhoam chose four of his people to ride the Beasts into the war he knew was coming."
   },
   {
    "t": "p",
    "text": "He named them Champions. Mipha of the Zora, a princess whose hands could close a wound and draw the pain out after it. Daruk of the Gorons, broad and bright-hearted, built like the mountain that raised him. Revali of the Rito, the finest archer ever to leave the ground — and the first to tell you so. Urbosa, chief of the Gerudo, who could reach into a cloudless sky and pull the lightning down. Over them stood Princess Zelda, their commander, who carried in her blood the sealing light of the goddess Hylia; and at her side a knight named Link, chosen — as a nameless hero had been chosen long before — by that same sword that seals the darkness. Five of them, if you count Link. Count Link."
   },
   {
    "t": "p",
    "text": "Only one part of the plan was not made of metal and prophecy, and it was the part that broke. The goddess's light would not wake in Zelda. She knelt at every sacred spring the kingdom held and felt nothing rise to meet her, season after season, until a last cold morning high on Mount Lanayru, at the Spring of Wisdom, on her seventeenth birthday — when the water gave her back nothing but her own reflection. That was the morning the sky tore open."
   },
   {
    "t": "pq",
    "text": "They built an army to end Ganon. Ganon woke, and made the army his own."
   },
   {
    "t": "p",
    "text": "He came up out of the dark beneath Hyrule Castle, and a red light bled into the sky above its towers and spread until it could be seen from every corner of the land. He did not bother to fight the great engines waiting to destroy him. He simply took them. The Guardians raised to guard Castle Town turned and burned it down to its stones. And into each of the four Divine Beasts slipped a sliver of him — Waterblight, Fireblight, Windblight, Thunderblight, one shadow apiece — and in the dark of those vast bodies they killed the Champions who piloted them. Mipha. Daruk. Revali. Urbosa. Four of the five."
   },
   {
    "t": "p",
    "text": "The fifth was Link. He stood between the princess and the end of the world for as long as a body can, and then he went down, broken, still trying to shield her. The Sheikah who loved her — Impa, Purah, Robbie — carried him out of the burning to the one place that might undo his dying: the Shrine of Resurrection on the Great Plateau, a still chamber of old healing light, where they laid him down to sleep while it knit him slowly back together, over a hundred years."
   },
   {
    "t": "p",
    "text": "And in that hour — her knight dying, her Champions dead, her father the king dead, her city on fire — the light the goddess had withheld from Zelda all her life finally answered. It rose out of her in a blaze that stilled the Guardians closing in: too late to win, just in time to hold. So she did the only thing left to do. She folded that light around Ganon, and around herself, and shut the two of them inside the castle together. Not a victory. A hand closed around a coal, kept shut by a will that did not dare to open."
   },
   {
    "t": "p",
    "text": "She held on for a hundred years. And then, in a cave on the Great Plateau, a man with no memory opened his eyes to a voice he did not know — and the long, quiet ruin of Hyrule waited to see what he would do."
   },
   {
    "t": "note",
    "kind": "canon",
    "source": "In-game · Creating a Champion",
    "text": "The first princess and the first knight, the two who bound Ganon ten thousand years ago (as near as the histories can reckon it), are never named — not in the game, and not in the official books. Hyrule remembered the deed and forgot the hands that did it. That gap is the secret shape of the whole legend: a hero, a princess, a darkness — the same three threads spun new in every age."
   },
   {
    "t": "note",
    "kind": "theory",
    "source": "Fan reading",
    "text": "Readers have long suspected the Divine Beasts carry the names of sages from older tales — Ruta, Rudania, Medoh, and Naboris echoing Ruto, Darunia, Medli, and Nabooru — though Nintendo has never said so."
   }
  ],
  "sources": [
   "The Legend of Zelda: Breath of the Wild — Creating a Champion (Nintendo / Dark Horse)",
   "Breath of the Wild — in-game (King Rhoam's account; the Recovered Memories)",
   "Zelda Wiki / Zelda Dungeon (cross-check)"
  ]
 },
 {
  "id": "lore_champions",
  "title": "The Four Who Were Chosen",
  "eyebrow": "Mipha, Daruk, Revali, Urbosa",
  "estMin": 4,
  "spoiler": "How the four Champions died inside their Divine Beasts during the Great Calamity, and how Link frees their spirits a century later.",
  "blocks": [
   {
    "t": "art",
    "svg": "<svg width=\"100%\" viewBox=\"0 0 680 300\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\"><title>Four elemental sigils over a ceremonial field</title><desc>Four glowing original emblems arrayed across a dark altar — water in blue, fire in coral-orange, wind in teal, thunder in gold — balanced and reverent over a stone dais lit from below.</desc><defs><linearGradient id=\"field\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#070f12\"/><stop offset=\"0.55\" stop-color=\"#0b181d\"/><stop offset=\"1\" stop-color=\"#0f1c22\"/></linearGradient><radialGradient id=\"hall\" cx=\"0.5\" cy=\"0.42\" r=\"0.62\"><stop offset=\"0\" stop-color=\"#163038\" stop-opacity=\"0.55\"/><stop offset=\"1\" stop-color=\"#163038\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"gWater\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#5fd6e2\" stop-opacity=\"0.85\"/><stop offset=\"0.5\" stop-color=\"#79b8c0\" stop-opacity=\"0.28\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"gFire\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#f0902a\" stop-opacity=\"0.9\"/><stop offset=\"0.5\" stop-color=\"#f0902a\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#f0902a\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"gWind\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#9bc08a\" stop-opacity=\"0.8\"/><stop offset=\"0.5\" stop-color=\"#5fd6e2\" stop-opacity=\"0.25\"/><stop offset=\"1\" stop-color=\"#5fd6e2\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"gThunder\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#f2c14e\" stop-opacity=\"0.9\"/><stop offset=\"0.5\" stop-color=\"#f2c14e\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#f2c14e\" stop-opacity=\"0\"/></radialGradient></defs><rect width=\"680\" height=\"300\" fill=\"url(#field)\"/><rect width=\"680\" height=\"300\" fill=\"url(#hall)\"/><g opacity=\"0.5\"><line x1=\"120\" y1=\"300\" x2=\"170\" y2=\"236\" stroke=\"#16282f\" stroke-width=\"1\"/><line x1=\"270\" y1=\"300\" x2=\"295\" y2=\"236\" stroke=\"#16282f\" stroke-width=\"1\"/><line x1=\"410\" y1=\"300\" x2=\"385\" y2=\"236\" stroke=\"#16282f\" stroke-width=\"1\"/><line x1=\"560\" y1=\"300\" x2=\"510\" y2=\"236\" stroke=\"#16282f\" stroke-width=\"1\"/></g><path d=\"M0 238 L150 230 L340 224 L530 230 L680 238 L680 300 L0 300 Z\" fill=\"#0a141a\"/><path d=\"M0 238 L150 230 L340 224 L530 230 L680 238\" fill=\"none\" stroke=\"#1d3640\" stroke-width=\"1\" opacity=\"0.7\"/><ellipse cx=\"340\" cy=\"262\" rx=\"300\" ry=\"20\" fill=\"#0d1b21\" opacity=\"0.6\"/><line x1=\"40\" y1=\"150\" x2=\"640\" y2=\"150\" stroke=\"#13242b\" stroke-width=\"0.5\" opacity=\"0.6\"/><g><circle cx=\"130\" cy=\"148\" r=\"62\" fill=\"url(#gWater)\"/><path d=\"M130 110 C150 138 158 156 158 172 C158 190 146 202 130 202 C114 202 102 190 102 172 C102 156 110 138 130 110 Z\" fill=\"none\" stroke=\"#5fd6e2\" stroke-width=\"2\" opacity=\"0.9\"/><path d=\"M130 132 C140 150 145 162 145 173 C145 185 138 192 130 192\" fill=\"none\" stroke=\"#79b8c0\" stroke-width=\"1.5\" opacity=\"0.7\"/><circle cx=\"130\" cy=\"172\" r=\"5\" fill=\"#eafcff\"/><circle cx=\"130\" cy=\"148\" r=\"62\" fill=\"none\" stroke=\"#5fd6e2\" stroke-width=\"0.5\" opacity=\"0.35\"/></g><g><circle cx=\"270\" cy=\"148\" r=\"62\" fill=\"url(#gFire)\"/><path d=\"M270 104 C286 132 296 142 296 162 C296 186 285 202 270 202 C255 202 244 186 244 162 C244 142 254 132 270 104 Z\" fill=\"none\" stroke=\"#f0902a\" stroke-width=\"2\" opacity=\"0.95\"/><path d=\"M270 138 C278 156 282 164 282 176 C282 190 277 198 270 198 C263 198 258 190 258 176 C258 168 262 156 270 138 Z\" fill=\"#f0902a\" opacity=\"0.25\"/><path d=\"M270 150 C275 164 277 170 277 178 C277 188 274 194 270 194 C266 194 263 188 263 178 C263 170 265 164 270 150 Z\" fill=\"#f2c14e\" opacity=\"0.55\"/><circle cx=\"270\" cy=\"148\" r=\"62\" fill=\"none\" stroke=\"#f0902a\" stroke-width=\"0.5\" opacity=\"0.35\"/></g><g><circle cx=\"410\" cy=\"148\" r=\"62\" fill=\"url(#gWind)\"/><path d=\"M376 138 C404 124 442 124 446 142 C449 156 432 162 414 158\" fill=\"none\" stroke=\"#5fd6e2\" stroke-width=\"2\" opacity=\"0.9\"/><path d=\"M372 162 C404 150 452 150 456 170 C459 186 438 192 418 186\" fill=\"none\" stroke=\"#9bc08a\" stroke-width=\"2\" opacity=\"0.85\"/><path d=\"M380 184 C402 176 432 178 434 190 C436 200 424 204 412 200\" fill=\"none\" stroke=\"#79b8c0\" stroke-width=\"1.5\" opacity=\"0.7\"/><circle cx=\"410\" cy=\"148\" r=\"62\" fill=\"none\" stroke=\"#9bc08a\" stroke-width=\"0.5\" opacity=\"0.3\"/></g><g><circle cx=\"550\" cy=\"148\" r=\"62\" fill=\"url(#gThunder)\"/><path d=\"M561 108 L525 156 L547 156 L531 196 L575 142 L551 142 Z\" fill=\"none\" stroke=\"#f2c14e\" stroke-width=\"2\" opacity=\"0.95\"/><path d=\"M561 108 L525 156 L547 156 L531 196 L575 142 L551 142 Z\" fill=\"#f2c14e\" opacity=\"0.18\"/><circle cx=\"550\" cy=\"148\" r=\"62\" fill=\"none\" stroke=\"#f2c14e\" stroke-width=\"0.5\" opacity=\"0.35\"/></g><g opacity=\"0.5\"><line x1=\"130\" y1=\"210\" x2=\"270\" y2=\"210\" stroke=\"#5fd6e2\" stroke-width=\"0.5\"/><line x1=\"270\" y1=\"210\" x2=\"410\" y2=\"210\" stroke=\"#9bc08a\" stroke-width=\"0.5\"/><line x1=\"410\" y1=\"210\" x2=\"550\" y2=\"210\" stroke=\"#f2c14e\" stroke-width=\"0.5\"/></g><circle cx=\"130\" cy=\"210\" r=\"3\" fill=\"#5fd6e2\"/><circle cx=\"270\" cy=\"210\" r=\"3\" fill=\"#f0902a\"/><circle cx=\"410\" cy=\"210\" r=\"3\" fill=\"#9bc08a\"/><circle cx=\"550\" cy=\"210\" r=\"3\" fill=\"#f2c14e\"/><circle cx=\"40\" cy=\"46\" r=\"1.4\" fill=\"#5fd6e2\" opacity=\"0.5\"/><circle cx=\"636\" cy=\"58\" r=\"1.4\" fill=\"#f2c14e\" opacity=\"0.5\"/><circle cx=\"612\" cy=\"40\" r=\"1\" fill=\"#e9e2d2\" opacity=\"0.4\"/><circle cx=\"64\" cy=\"72\" r=\"1\" fill=\"#e9e2d2\" opacity=\"0.35\"/></svg>"
   },
   {
    "t": "p",
    "text": "Four machines, and each machine was a mountain. When the old kingdom dug the Divine Beasts out of the ground to fight Ganon a second time, no ordinary soldier could move them. So King Rhoam and his daughter went looking across every people in Hyrule for four who could. What they found were not soldiers. They were a healer, a glutton, a braggart, and a queen, and a hundred years before Link woke beneath the Plateau, the King gave each of them a blue sash and a beast that walked."
   },
   {
    "t": "p",
    "text": "Mipha took the elephant. Princess of the Zora, daughter of King Dorephan, elder sister to a small boy named Sidon, she carried the Lightscale Trident the way other royals carry a scepter — but the spear was never the point of her. Her hands were. No other Zora could do what she did: lay her palms on a wound and close it, glowing, the hurt simply gone. When Zelda set down her notes on the four, she wrote with some surprise that Mipha, who seemed the most fragile, had the easiest time of anyone bending her Divine Beast to her will. The gentle one was the natural pilot."
   },
   {
    "t": "p",
    "text": "Her diary says she first met Link when he was about four years old, already a swordsman who could beat grown men. She was older, and she did not forget him. In the quiet between the work she made him something. By an old Zora custom, a princess weaves armor from her own silver scales for the one she means to marry, and Mipha wove. She finished it. She never gave it. The proposal stayed folded inside the gift, the gift stayed unspoken, and then the time for both ran out."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "The Zora Armor and Mipha's diary make her love for Link plain. Whether Link felt the same is left deliberately blank — he never speaks. The armor was a gift she carried to her death, not a promise the two of them made aloud.",
    "source": "BotW — Zora Armor description; Mipha's Diary (The Champions' Ballad)"
   },
   {
    "t": "p",
    "text": "Daruk took the salamander. The Goron Champion was built like the boulders he broke, and he swung a two-handed maul called the Boulder Breaker as though it weighed nothing. He decided he liked Link after the two of them put down a fire-bodied Talus together — Link's strength impressed him, and so did the boy's willingness to eat absolutely anything — so Daruk did what Gorons do with the people they love, and made Link a sworn brother. His gift in battle is stubbornness shaped into light. Daruk's Protection throws up a barrier that snaps shut around its bearer the instant a blow comes in. His grandson Yunobo, a timid boy, still carries a thinner measure of it in his blood."
   },
   {
    "t": "p",
    "text": "Revali took the eagle, and resented every minute of the company he kept to do it. He was perhaps the finest archer the Rito ever produced, and his Great Eagle Bow loosed three arrows for the price of one. But where Mipha and Daruk were born able, Revali built his gift with his own bleeding hands. Alone, over and over, training past the point of injury, he taught the wind to lift him. Revali's Gale, an updraft summoned from nothing, flings a flier straight up into open sky. He was not given a legend. He manufactured one. And it galled him without end that the Champions answered to Link, a boy whose only claim was the sword on his back."
   },
   {
    "t": "pq",
    "text": "He invented the wind that lifts you. That is the thing to remember about Revali: every other gift here was a birthright. His was a wound he kept reopening until it learned to fly."
   },
   {
    "t": "note",
    "kind": "theory",
    "text": "His diary confirms Revali built his Gale through self-punishing solitary work, and his jealousy of Link is open canon. The common reading — that the arrogance is armor over deep self-doubt — is persuasive characterization, not a flat line in the game. Treat it as interpretation.",
    "source": "The Diary of Revali (canon); community character analysis (theory)"
   },
   {
    "t": "p",
    "text": "Urbosa took the camel, Vah Naboris, the lightning-beast, and of the four she needed it least to be frightening. Chief of the Gerudo, she fought with the Scimitar of the Seven and the mirror-bright Daybreaker shield, and her gift was the storm itself: a snap of her fingers, and lightning fell where she pointed. But the storm was not the half of her that mattered. Urbosa had been a friend of Hyrule's late Queen, and when the Queen died she stepped without being asked into the cold place she left behind. She stood over Zelda — who could not yet unlock her own power, and was breaking under the failure — as something fiercer and warmer than a guardian. A second mother, with a sword."
   },
   {
    "t": "note",
    "kind": "creator",
    "text": "Designer Naoki Mori described Urbosa as kind, relaxed, and sassy, and the team gave her a deliberately maternal bearing meant to hold the strength of a warrior and a mother at once. For Mipha, lead artist Hirohito Shinoda began from a dolphin, dressing her in delicate Zora pieces to make her feel fleeting and soft.",
    "source": "Creating a Champion (Dark Horse / Nintendo, 2018)"
   },
   {
    "t": "p",
    "text": "There is one happy picture of them all. At the inauguration in Hyrule Castle, Purah lined up the Sheikah Slate to capture Link, Zelda, and the four, and at the last second Daruk's huge arm swept everyone together into a crooked, laughing crowd. That photograph is the last warm thing. When Ganon woke, the Divine Beasts turned, and the malice ran each Champion down inside the very machine chosen to carry them. Their spirits stayed locked in there, in the dark, for a hundred years. Link freed them one by one, fighting through the Blight that had taken each beast — Waterblight in Ruta, Fireblight in Rudania, Windblight in Medoh, Thunderblight in Naboris — and each Champion, ghost-blue and finally able to rest, pressed a gift into his hands on the way out."
   }
  ],
  "sources": [
   "The Legend of Zelda: Breath of the Wild (Nintendo, 2017) — recovered memories, Champion ability and item descriptions, NPC dialogue (King Dorephan, Zelda's research notes)",
   "BotW — The Champions' Ballad DLC (Mipha's Diary, The Diary of Revali, the inauguration / Picture of the Champions memory)",
   "BotW — Creating a Champion (Dark Horse / Nintendo, 2018) — developer design notes (Shinoda on Mipha; Mori on Urbosa)",
   "Zelda Dungeon Wiki — Mipha, Daruk, Urbosa, Champion, Blight Ganon, Picture of the Champions",
   "Zelda Wiki / Fandom — Daruk, Revali, Revali's Gale, Scimitar of the Seven",
   "Wikipedia — Urbosa; GameFAQs — Champion Weaponry guide"
  ]
 },
 {
  "id": "lore_peoples",
  "title": "The Peoples of Hyrule",
  "eyebrow": "The races of the kingdom",
  "estMin": 4,
  "spoiler": "Names the four Champions and how each died in the Calamity; touches the Sheikah's exile and where the Master Sword now rests.",
  "blocks": [
   {
    "t": "art",
    "svg": "<svg width=\"100%\" viewBox=\"0 0 680 300\" role=\"img\" xmlns=\"http://www.w3.org/2000/svg\"><title>The Many Realms of One Kingdom</title><desc>A panoramic twilight vista rendered in layered silhouette bands: still reflecting water in the foreground, a glowing volcano, a desert dune, a high cold snow peak, and a forest edge, beneath a teal-to-gold sky.</desc><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#091317\"/><stop offset=\"0.42\" stop-color=\"#16323a\"/><stop offset=\"0.74\" stop-color=\"#3c6a63\"/><stop offset=\"1\" stop-color=\"#f2c14e\"/></linearGradient><radialGradient id=\"sun\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#f2c14e\" stop-opacity=\"0.95\"/><stop offset=\"0.5\" stop-color=\"#f0902a\" stop-opacity=\"0.4\"/><stop offset=\"1\" stop-color=\"#f0902a\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"ember\" cx=\"0.5\" cy=\"0.3\" r=\"0.7\"><stop offset=\"0\" stop-color=\"#f0902a\" stop-opacity=\"0.85\"/><stop offset=\"0.5\" stop-color=\"#e0506b\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#e0506b\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"water\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#16323a\"/><stop offset=\"1\" stop-color=\"#091317\"/></linearGradient><linearGradient id=\"snowpk\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#79b8c0\"/><stop offset=\"1\" stop-color=\"#0f1c22\"/></linearGradient></defs><rect width=\"680\" height=\"300\" fill=\"url(#sky)\"/><circle cx=\"372\" cy=\"150\" r=\"150\" fill=\"url(#sun)\"/><circle cx=\"372\" cy=\"150\" r=\"30\" fill=\"#f2c14e\" opacity=\"0.5\"/><g opacity=\"0.7\"><circle cx=\"540\" cy=\"48\" r=\"1.4\" fill=\"#5fd6e2\"/><circle cx=\"600\" cy=\"70\" r=\"1\" fill=\"#79b8c0\"/><circle cx=\"120\" cy=\"40\" r=\"1.2\" fill=\"#5fd6e2\"/><circle cx=\"78\" cy=\"84\" r=\"0.9\" fill=\"#79b8c0\"/><circle cx=\"640\" cy=\"36\" r=\"1\" fill=\"#5fd6e2\"/></g><path d=\"M0 150 L70 132 L150 156 L235 92 L300 150 L360 124 L360 175 L0 175 Z\" fill=\"#16323a\" opacity=\"0.55\"/><polygon points=\"235,92 268,150 202,150\" fill=\"url(#snowpk)\" opacity=\"0.85\"/><polygon points=\"235,98 248,118 240,116 233,128 226,116 222,120\" fill=\"#e9e2d2\" opacity=\"0.7\"/><path d=\"M340 175 L410 142 L460 158 L520 120 L560 150 L620 134 L680 158 L680 175 Z\" fill=\"#1a2c2e\" opacity=\"0.6\"/><polygon points=\"520,120 565,178 475,178\" fill=\"#0f1c22\"/><circle cx=\"520\" cy=\"132\" r=\"26\" fill=\"url(#ember)\"/><path d=\"M512 124 L520 110 L528 124 L524 130 L520 122 L516 130 Z\" fill=\"#f0902a\" opacity=\"0.8\"/><path d=\"M520 118 Q524 108 521 100 Q528 106 525 116 Z\" fill=\"#e0506b\" opacity=\"0.6\"/><path d=\"M0 188 L80 178 L180 192 L320 170 L470 190 L600 176 L680 192 L680 200 L0 200 Z\" fill=\"#0f1c22\"/><path d=\"M40 188 L60 168 L80 188 Z M64 188 L84 162 L104 188 Z M86 188 L102 172 L118 188 Z M110 190 L132 166 L154 190 Z M138 190 L156 174 L174 190 Z\" fill=\"#091317\"/><path d=\"M55 168 L57 160 L59 168 Z M129 166 L131 158 L133 166 Z\" fill=\"#9bc08a\" opacity=\"0.5\"/><path d=\"M380 175 Q480 160 600 178 L680 175 L680 195 L380 195 Z\" fill=\"#1a2c2e\" opacity=\"0.5\"/><path d=\"M420 178 Q520 165 640 182\" fill=\"none\" stroke=\"#f2c14e\" stroke-width=\"0.8\" opacity=\"0.25\"/><rect x=\"0\" y=\"200\" width=\"680\" height=\"100\" fill=\"url(#water)\"/><circle cx=\"372\" cy=\"200\" r=\"120\" fill=\"url(#sun)\" opacity=\"0.35\"/><line x1=\"372\" y1=\"200\" x2=\"372\" y2=\"282\" stroke=\"#f2c14e\" stroke-width=\"14\" opacity=\"0.18\"/><line x1=\"372\" y1=\"200\" x2=\"372\" y2=\"270\" stroke=\"#f2c14e\" stroke-width=\"4\" opacity=\"0.3\"/><line x1=\"520\" y1=\"200\" x2=\"520\" y2=\"260\" stroke=\"#f0902a\" stroke-width=\"6\" opacity=\"0.2\"/><line x1=\"235\" y1=\"200\" x2=\"235\" y2=\"252\" stroke=\"#79b8c0\" stroke-width=\"4\" opacity=\"0.18\"/><g stroke=\"#5fd6e2\" stroke-width=\"0.7\" opacity=\"0.22\"><line x1=\"40\" y1=\"216\" x2=\"180\" y2=\"216\"/><line x1=\"260\" y1=\"232\" x2=\"430\" y2=\"232\"/><line x1=\"480\" y1=\"222\" x2=\"640\" y2=\"222\"/><line x1=\"120\" y1=\"250\" x2=\"300\" y2=\"250\"/><line x1=\"380\" y1=\"262\" x2=\"560\" y2=\"262\"/></g><line x1=\"372\" y1=\"200\" x2=\"100\" y2=\"190\" stroke=\"#f2c14e\" stroke-width=\"0.6\" opacity=\"0.2\"/><line x1=\"372\" y1=\"200\" x2=\"600\" y2=\"188\" stroke=\"#5fd6e2\" stroke-width=\"0.6\" opacity=\"0.18\"/></svg>"
   },
   {
    "t": "p",
    "text": "Walk far enough across Hyrule and the land names its people before any of them speak. A stone town under a hill-castle, where the folk have ears tapered to a point. A city of pearl and falling water in the green of Lanayru. A village of forge and rubble baking under a volcano. Warriors with copper skin who turn men away at a desert gate. Each people grew into the place that shaped it, and each holds a different piece of the old story."
   },
   {
    "t": "p",
    "text": "The Hylians are the most numerous, and the kingdom is theirs in name. The older lore says their pointed ears were made to catch the voices of the gods, and that their name comes down from Hylia, the goddess who was said to have made them. Their castle and the town below it look out of medieval Europe: stone walls, a king, a court. For an age that court was guarded by a stranger people who asked for nothing but the right to serve."
   },
   {
    "t": "p",
    "text": "Those were the Sheikah, a long-lived, red-eyed folk sworn to the goddess and to the royal line that descended from her. No hands in the world were finer at making things. Some ten thousand years ago, when the histories say Ganon was coming, it was the Sheikah who built the defense: the watchful Guardians, the four Divine Beasts, the shrines, the towers, the Shrine of Resurrection where a dying hero could be mended. Ganon was sealed. And then the Hylians the Sheikah had saved grew afraid of what their saviors could build."
   },
   {
    "t": "pq",
    "text": "They saved Hyrule, and Hyrule, frightened by how, drove them out."
   },
   {
    "t": "p",
    "text": "Much of the old technology was buried. The Sheikah were named a threat and pushed into exile, and the wound of it never fully closed. Most kept faith regardless. They founded Kakariko Village, where loyal Sheikah still live, and they gave the kingdom its long memory in people like Impa, once the king's advisor; her sister Purah, who will tell you she is about a hundred and twenty-four; and the researcher Robbie. But some never forgave. The Sheikah crest is an open eye with three lashes and a single tear, read as the eye that seeks the truth and the tear for how far the tribe would go, and how long it had suffered. The bitter ones took that emblem and turned it upside down."
   },
   {
    "t": "note",
    "kind": "canon",
    "text": "That inverted eye belongs to the Yiga Clan, Sheikah who renounced the royal family and pledged themselves to Ganon. The named clan is only about a century old, founded under Master Kohga in Karusa Valley near the desert; the grievance it feeds on is ten thousand years older than the banner.",
    "source": "Breath of the Wild (in-game); Creating a Champion (Dark Horse, 2018)"
   },
   {
    "t": "p",
    "text": "The other peoples kept to their corners of the map. The Zora are an aquatic folk of the Lanayru springs, and their dialogue implies lifespans that run into centuries: Prince Sidon, child-sized barely a hundred years ago, is a grown warrior now and still counted young. Their bodies hold water even on dry land, which makes a single bolt of lightning agony. King Dorephan rules their domain. His daughter Mipha forged Link's Zora Armor and carried feelings for him, and she piloted the elephant-shaped Vah Ruta until Ganon's blight killed her inside it."
   },
   {
    "t": "p",
    "text": "Up on Death Mountain live the Gorons, called the rock people since the days Hylia ruled. They eat stone, the molten delicacy being Rock Roast, and they mine the mountain. Curiously, no one can point to a Goron woman, a riddle the game leaves unsolved. Their Champion Daruk drove the lizard-shaped Vah Rudania, and his shielding power, Daruk's Protection, still runs in his descendant Yunobo. Across the sands the Gerudo are an almost wholly female people; in their tongue a woman is vai and a man is voe, and Gerudo Town bars every voe at the wall. Tradition holds that one male is born to them roughly once a century, to be their king. Ganondorf is the one the histories name. Their Champion Urbosa, who knew the Calamity had risen out of that ancient king, called lightning down from the camel-shaped Vah Naboris; a hundred years on, the young chief Riju leads them."
   },
   {
    "t": "p",
    "text": "High in the cold of the Hebra frontier perch the Rito, a bird-people whose Champion Revali flew the eagle-shaped Vah Medoh and left behind the updraft called Revali's Gale. And in a wood reached only through the maze of the Lost Woods live the Koroks, small forest spirits, nine hundred of them hidden across the land, each squeaking \"Ya-ha-ha! You found me!\" when you stumble on one. They are the cherished children of the Great Deku Tree, the ancient guardian who has watched the forest since long before this age, and who now keeps the Master Sword where Princess Zelda set it in his shade."
   },
   {
    "t": "note",
    "kind": "creator",
    "text": "Director Eiji Aonuma has said the Rito are evolved Zora and the Koroks are what the forest Kokiri became after they left the woods, both adaptations tied to The Wind Waker's drowned timeline, not stated anywhere in Breath of the Wild. Since BotW shows Rito and Zora living side by side, treat the lineage as a creator's note across games, not in-game fact.",
    "source": "Eiji Aonuma interview (The Wind Waker era)"
   }
  ],
  "sources": [
   "The Legend of Zelda: Breath of the Wild (Nintendo, 2017) — in-game text, memories, and NPC dialogue",
   "The Legend of Zelda Encyclopedia (Dark Horse, 2018)",
   "The Legend of Zelda: Breath of the Wild – Creating a Champion (Dark Horse, 2018)",
   "The Legend of Zelda: Hyrule Historia (Dark Horse, 2013)",
   "Eiji Aonuma interview (The Wind Waker era)"
  ]
 }
];
const TOTK = {
 "id": "totk",
 "label": "Tears of the Kingdom",
 "short": "TotK",
 "REGIONS": [
  {
   "id": "t_sky",
   "name": "Great Sky Island",
   "sub": "Main Quest - The opening tutorial",
   "kind": "region",
   "tagline": "Wake on a floating island, learn Link's four new arm powers, then dive to the surface of Hyrule below.",
   "champion": null,
   "sections": [
    {
     "id": "t_sky_s_awaken",
     "name": "Awakening and First Steps",
     "sub": "Room of Awakening, meeting the Steward Construct",
     "reward": "Purah Pad",
     "steps": [
      {
       "id": "t_sky_awaken_01",
       "k": "step",
       "t": "Wake in the Room of Awakening. Pick up the Decayed Master Sword off the ground and slash the vines blocking the way to exit.",
       "items": [
        {
         "name": "Decayed Master Sword",
         "cat": "weapon",
         "note": "Power 1; only used to cut the exit vines, then sent back to Zelda in the ending cutscene."
        }
       ]
      },
      {
       "id": "t_sky_awaken_02",
       "k": "step",
       "t": "In the main hall, touch the Dragon Head Island terminal. It starts the cogs turning and lights the gate, then head out toward the water.",
       "items": []
      },
      {
       "id": "t_sky_awaken_03",
       "k": "loot",
       "t": "Dive down through the pools to reach the island surface. On the third, biggest dive, surface by the rubble and open the chest for Archaic Legwear.",
       "items": [
        {
         "name": "Archaic Legwear",
         "cat": "armor",
         "note": "Your starting trousers; equip them right away for a little defense."
        }
       ]
      },
      {
       "id": "t_sky_awaken_04",
       "k": "step",
       "t": "Approach the sleeping Steward Construct. It wakes, hands you the Purah Pad, and points you toward the Temple of Time.",
       "items": [
        {
         "name": "Purah Pad",
         "cat": "key",
         "note": "Your map and ability menu, like the Sheikah Slate in the last game."
        }
       ]
      },
      {
       "id": "t_sky_awaken_05",
       "k": "tip",
       "t": "Your right arm has no power yet. Each Sky Island shrine restores one ability. Take them in the order below for the smoothest run.",
       "items": []
      }
     ]
    },
    {
     "id": "t_sky_s_ukouh",
     "name": "Ukouh Shrine - Ultrahand",
     "sub": "Your first ability: grab, move, and glue objects",
     "reward": "Ultrahand",
     "steps": [
      {
       "id": "t_sky_ukouh_01",
       "k": "step",
       "t": "Head to the glowing Ukouh Shrine near the Steward and enter to receive Ultrahand.",
       "items": [
        {
         "name": "Ultrahand",
         "cat": "ability",
         "note": "Pick up, rotate, move, and stick objects together to build things."
        }
       ]
      },
      {
       "id": "t_sky_ukouh_02",
       "k": "step",
       "t": "Use Ultrahand to grab the boards and lay them across the gap to make a bridge, then cross.",
       "items": []
      },
      {
       "id": "t_sky_ukouh_03",
       "k": "step",
       "t": "Attach a hook to the moving rail platform, then ride it across the next gap. Glue boards together if you need a wider deck.",
       "items": []
      },
      {
       "id": "t_sky_ukouh_04",
       "k": "reward",
       "t": "Touch the green altar to finish the shrine and earn a Light of Blessing. Collect four of these for a heart container.",
       "items": [
        {
         "name": "Light of Blessing",
         "cat": "key",
         "note": "Four equal one heart container at a Goddess Statue."
        }
       ]
      },
      {
       "id": "t_sky_ukouh_05",
       "k": "tip",
       "t": "Hold the Ultrahand button to enter build mode. The control stick rotates the held piece; let go to drop it.",
       "items": []
      }
     ]
    },
    {
     "id": "t_sky_s_inisa",
     "name": "In-isa Shrine - Fuse",
     "sub": "Stick materials onto weapons, shields, and arrows",
     "reward": "Fuse",
     "steps": [
      {
       "id": "t_sky_inisa_01",
       "k": "step",
       "t": "From Ukouh, head toward the lake. Use Ultrahand to build a raft from logs and a fan or sail, or attach logs and paddle across.",
       "items": []
      },
      {
       "id": "t_sky_inisa_02",
       "k": "step",
       "t": "Enter the In-isa Shrine to receive Fuse.",
       "items": [
        {
         "name": "Fuse",
         "cat": "ability",
         "note": "Combine a material with a weapon, shield, or arrow for more power, reach, or new effects."
        }
       ]
      },
      {
       "id": "t_sky_inisa_03",
       "k": "step",
       "t": "Fuse a rock to your stick to smash the cracked wall, and fuse an item to your shield where the puzzle asks.",
       "items": []
      },
      {
       "id": "t_sky_inisa_04",
       "k": "loot",
       "t": "Fuse a Fire Fruit to an arrow to hit a target or light the way, then claim the chest reward inside the shrine.",
       "items": [
        {
         "name": "Fire Fruit",
         "cat": "material",
         "note": "Fuse to arrows for a fire shot that bursts into flame on impact."
        }
       ]
      },
      {
       "id": "t_sky_inisa_05",
       "k": "reward",
       "t": "Reach the altar to complete the shrine and bank another Light of Blessing.",
       "items": []
      },
      {
       "id": "t_sky_inisa_06",
       "k": "loot",
       "t": "Just east of In-isa, slip into Pondside Cave through the narrow tunnel and open the chest for the Archaic Tunic so you are not freezing.",
       "items": [
        {
         "name": "Archaic Tunic",
         "cat": "armor",
         "note": "Your starting shirt, found in Pondside Cave near In-isa Shrine."
        }
       ]
      }
     ]
    },
    {
     "id": "t_sky_s_gutanbac",
     "name": "Gutanbac Shrine - Ascend",
     "sub": "The snowy peak: swim up through ceilings",
     "reward": "Ascend",
     "steps": [
      {
       "id": "t_sky_gutanbac_01",
       "k": "warn",
       "t": "The route climbs a cold, snowy mountain. Without cold protection you will lose hearts steadily.",
       "items": []
      },
      {
       "id": "t_sky_gutanbac_02",
       "k": "step",
       "t": "At the base of the slope, pick the Spicy Peppers scattered nearby and cook them at a cooking pot to make a warm dish.",
       "items": [
        {
         "name": "Spicy Pepper",
         "cat": "material",
         "note": "Cook into a dish for temporary cold resistance."
        }
       ]
      },
      {
       "id": "t_sky_gutanbac_03",
       "k": "tip",
       "t": "Pass through the caves on the way up. Throw or fuse Brightbloom Seeds to light the dark passages.",
       "items": [
        {
         "name": "Brightbloom Seed",
         "cat": "material",
         "note": "Throw to light up caves and the Depths later."
        }
       ]
      },
      {
       "id": "t_sky_gutanbac_04",
       "k": "step",
       "t": "Eat the warm dish, climb to the Gutanbac Shrine, and enter to receive Ascend.",
       "items": [
        {
         "name": "Ascend",
         "cat": "ability",
         "note": "Swim straight up through most ceilings and pop out on the surface above."
        }
       ]
      },
      {
       "id": "t_sky_gutanbac_05",
       "k": "step",
       "t": "Use Ascend to rise through the platforms instead of climbing, then finish at the altar for another Light of Blessing.",
       "items": []
      },
      {
       "id": "t_sky_gutanbac_06",
       "k": "tip",
       "t": "Look up before using Ascend; you surface at the first solid ceiling above you. It is the fastest way out of caves and tall rooms.",
       "items": []
      }
     ]
    },
    {
     "id": "t_sky_s_tot",
     "name": "Temple of Time - Recall and the Closed Door",
     "sub": "Meet Rauru's spirit and start The Closed Door",
     "reward": "Recall",
     "steps": [
      {
       "id": "t_sky_tot_01",
       "k": "step",
       "t": "Glide or build your way to the Temple of Time with your three Lights of Blessing. Wing devices or a fan-and-board flyer make the trip easy.",
       "items": []
      },
      {
       "id": "t_sky_tot_02",
       "k": "step",
       "t": "Touch the large tear-shaped stone inside. You see a vision of Zelda and are granted Recall.",
       "items": [
        {
         "name": "Recall",
         "cat": "ability",
         "note": "Send an object backward along its own recent path through time."
        }
       ]
      },
      {
       "id": "t_sky_tot_03",
       "k": "step",
       "t": "Two giant cogs turn on either side of the hall. Use Recall on one to reverse it, hop on, and ride it up to the central ledge.",
       "items": []
      },
      {
       "id": "t_sky_tot_04",
       "k": "step",
       "t": "Try to open the big sealed door. Rauru's spirit appears but lacks the vitality to open it, starting the main quest The Closed Door.",
       "items": []
      },
      {
       "id": "t_sky_tot_05",
       "k": "tip",
       "t": "Rauru is the founding king of Hyrule, not the fifth sage. You meet Mineru and the Spirit Temple much later in the game.",
       "items": []
      }
     ]
    },
    {
     "id": "t_sky_s_nachoyah",
     "name": "Nachoyah Shrine - The Fourth Blessing",
     "sub": "Earn the heart container to open the door",
     "reward": "Heart Container",
     "steps": [
      {
       "id": "t_sky_nachoyah_01",
       "k": "step",
       "t": "Rauru sends you to the hidden Nachoyah Shrine. Use Ascend and the cogs to climb up to reach it.",
       "items": []
      },
      {
       "id": "t_sky_nachoyah_02",
       "k": "step",
       "t": "Enter Nachoyah, which tests Recall. Reverse the moving parts so the path lines up and you can reach the altar.",
       "items": []
      },
      {
       "id": "t_sky_nachoyah_03",
       "k": "reward",
       "t": "Finish the altar for your fourth Light of Blessing.",
       "items": []
      },
      {
       "id": "t_sky_nachoyah_04",
       "k": "step",
       "t": "Return to the Goddess Statue and trade four Lights of Blessing for a heart container.",
       "items": [
        {
         "name": "Heart Container",
         "cat": "key",
         "note": "Your fourth heart; enough vitality to open the sealed door."
        }
       ]
      },
      {
       "id": "t_sky_nachoyah_05",
       "k": "step",
       "t": "Open the big door at the Temple of Time to complete The Closed Door and trigger the cutscene that sets up your descent.",
       "items": []
      }
     ]
    },
    {
     "id": "t_sky_s_dive",
     "name": "Diving to the Surface",
     "sub": "Leaving Great Sky Island for Hyrule below",
     "reward": "null",
     "steps": [
      {
       "id": "t_sky_dive_01",
       "k": "step",
       "t": "After the cutscene, head to the edge of Great Sky Island. You have no paraglider yet, so you will free-fall toward Hyrule's surface.",
       "items": []
      },
      {
       "id": "t_sky_dive_02",
       "k": "step",
       "t": "Skydive off Great Sky Island down toward the surface of Hyrule far below.",
       "items": []
      },
      {
       "id": "t_sky_dive_03",
       "k": "tip",
       "t": "While skydiving, tilt forward to fall faster and spread out to slow down. You splash into water below, so aim for the lake to land safely.",
       "items": []
      },
      {
       "id": "t_sky_dive_04",
       "k": "step",
       "t": "You touch down on the surface and are told to head for Lookout Landing, the new base camp near Hyrule Castle. This begins your surface adventure.",
       "items": []
      },
      {
       "id": "t_sky_dive_05",
       "k": "tip",
       "t": "You do not get the Paraglider here; Purah hands it over at Lookout Landing after you raise the first Skyview Tower. Until then, use water to break falls.",
       "items": []
      }
     ]
    }
   ]
  },
  {
   "id": "t_lookout",
   "name": "Lookout Landing",
   "sub": "Main Quest - Hyrule Surface Hub",
   "kind": "region",
   "tagline": "Land in Hyrule's wartime hub, reunite with Purah, raise your first Skyview Tower, earn the Paraglider, and set out to fix the four Regional Phenomena.",
   "champion": null,
   "sections": [
    {
     "id": "t_lookout_arrival",
     "name": "Landing at Lookout Landing",
     "sub": "From the Great Sky Island to the Surface hub",
     "steps": [
      {
       "id": "t_lookout_arrival_s1",
       "k": "step",
       "t": "After diving from the Great Sky Island, you land near central Hyrule. Head to Lookout Landing, the walled camp just south of Hyrule Castle."
      },
      {
       "id": "t_lookout_arrival_s2",
       "k": "tip",
       "t": "Open the map and place a pin on Lookout Landing if you wander. It is the game's main hub, with shops, beds, and an Emergency Shelter."
      },
      {
       "id": "t_lookout_arrival_s3",
       "k": "step",
       "t": "Enter the camp and find Purah, the small white-haired researcher in a lab coat. She is near the central Skyview Tower with Josha and Robbie."
      },
      {
       "id": "t_lookout_arrival_warn",
       "k": "warn",
       "t": "Gloom-covered enemies roam Hyrule now. Gloom caps your hearts until you reach light or a Lightroot, so avoid the red-black ooze early on."
      }
     ]
    },
    {
     "id": "t_lookout_purah",
     "name": "Meeting Purah",
     "sub": "Reunion and the Purah Pad",
     "reward": "Crisis at Hyrule Castle quest",
     "steps": [
      {
       "id": "t_lookout_purah_s1",
       "k": "step",
       "t": "Speak with Purah at Lookout Landing. She explains the Upheaval, Zelda's disappearance, and the Gloom spreading across Hyrule."
      },
      {
       "id": "t_lookout_purah_s2",
       "k": "loot",
       "t": "Your slate-like device is the Purah Pad, your new map tool. It will sync with Skyview Towers to chart the world once activated.",
       "items": [
        {
         "name": "Purah Pad",
         "cat": "key",
         "note": "Your map device. Stores your abilities and unlocks fast travel and tower sync. The successor to the BotW Sheikah Slate."
        }
       ]
      },
      {
       "id": "t_lookout_purah_s3",
       "k": "tip",
       "t": "Your five abilities are already learned on the Great Sky Island: Ultrahand, Fuse, Ascend, Recall, and Autobuild. They are not runes; the Pad just stores them."
      }
     ]
    },
    {
     "id": "t_lookout_castle",
     "name": "Crisis at Hyrule Castle",
     "sub": "Investigating the disturbance to the north",
     "steps": [
      {
       "id": "t_lookout_castle_s1",
       "k": "step",
       "t": "Purah sends you north to the Hyrule Castle area. The castle has torn free of the ground and floats above a column of Gloom."
      },
      {
       "id": "t_lookout_castle_s2",
       "k": "step",
       "t": "Head to the First Gatehouse in the Hyrule Castle Town Ruins and speak with Captain Hoz, who is watching the castle and the figure resembling Zelda."
      },
      {
       "id": "t_lookout_castle_s3",
       "k": "step",
       "t": "Report back to Purah at Lookout Landing. She realizes the old map data is gone and that you need a Skyview Tower to chart Hyrule."
      },
      {
       "id": "t_lookout_castle_tip",
       "k": "tip",
       "t": "You can't storm the castle yet. The story routes you through the four regions first, so Crisis at Hyrule Castle stays open until much later."
      }
     ]
    },
    {
     "id": "t_lookout_tower",
     "name": "Raising the Skyview Tower",
     "sub": "Your first tower and the Paraglider",
     "reward": "Surface map data + Paraglider",
     "steps": [
      {
       "id": "t_lookout_tower_s1",
       "k": "step",
       "t": "Meet Purah at the Lookout Landing Skyview Tower beside the camp. Step inside and interact with the terminal to register your Purah Pad."
      },
      {
       "id": "t_lookout_tower_s2",
       "k": "step",
       "t": "The tower scans you, then launches you high into the sky, revealing the surrounding central Hyrule Surface map for the first time."
      },
      {
       "id": "t_lookout_tower_loot",
       "k": "loot",
       "t": "As you fall, Purah hands you the Paraglider so you can glide down safely. Press the jump button while airborne to deploy it and float to the ground.",
       "items": [
        {
         "name": "Paraglider",
         "cat": "key",
         "note": "Glide after tower launches or any fall. Press the jump button mid-air to deploy; gliding drains stamina."
        }
       ]
      },
      {
       "id": "t_lookout_tower_s3",
       "k": "tip",
       "t": "Skyview Towers double as fast-travel points and launch pads. Use them to reach the Sky islands floating above each region."
      },
      {
       "id": "t_lookout_tower_s4",
       "k": "step",
       "t": "Return to Purah after activating the tower. She gives you your next main objective."
      }
     ]
    },
    {
     "id": "t_lookout_phenomena",
     "name": "The Four Regional Phenomena",
     "sub": "Main objective: help the four peoples",
     "reward": "Regional Phenomena quest",
     "steps": [
      {
       "id": "t_lookout_phenomena_s1",
       "k": "step",
       "t": "Purah starts the Regional Phenomena quest: strange disasters are striking the Rito, Goron, Zora, and Gerudo. Investigate all four."
      },
      {
       "id": "t_lookout_phenomena_tip",
       "k": "tip",
       "t": "Wind Temple (Rito, Tulin) near Rito Village; Fire (Goron, Yunobo) at Goron City; Water (Zora, Sidon) at Zora's Domain; Lightning (Gerudo, Riju) at Gerudo Town."
      },
      {
       "id": "t_lookout_phenomena_s2",
       "k": "optional",
       "t": "Tackle the regions in any order, but Rito Village (Wind) to the northwest is the gentlest first temple and a great starting point."
      },
      {
       "id": "t_lookout_phenomena_tip2",
       "k": "tip",
       "t": "A fifth sage, Mineru, and her Spirit Temple come later in the story after the four phenomena. Don't worry about her yet."
      }
     ]
    },
    {
     "id": "t_lookout_camera",
     "name": "The Camera and Hyrule Compendium",
     "sub": "The Camera Work in the Depths quest",
     "reward": "Camera ability + Hyrule Compendium",
     "steps": [
      {
       "id": "t_lookout_camera_s1",
       "k": "step",
       "t": "After getting the Paraglider, talk to Josha and Robbie in the Lookout Landing lab. They start the quest Camera Work in the Depths."
      },
      {
       "id": "t_lookout_camera_s2",
       "k": "step",
       "t": "Robbie adds the camera to your Purah Pad and asks you to meet him at the chasm south of Lookout Landing. Dive in and glide down into the Depths.",
       "items": [
        {
         "name": "Camera",
         "cat": "ability",
         "note": "Purah Pad feature. Open the ability menu and pick the camera to take photos and register Compendium entries."
        }
       ]
      },
      {
       "id": "t_lookout_camera_loot",
       "k": "loot",
       "t": "Photograph the statue Robbie points out to unlock the Hyrule Compendium, then report back to the lab. Josha rewards you with some Zonaite.",
       "items": [
        {
         "name": "Hyrule Compendium",
         "cat": "key",
         "note": "In-game catalog. Snap photos to fill entries for monsters, materials, weapons, and creatures; handy for tracking locations."
        }
       ]
      },
      {
       "id": "t_lookout_camera_tip",
       "k": "tip",
       "t": "Lightroots, not shrines, are the Depths' map and light points. Activate them like Skyview Towers to brighten and chart the dark underground."
      }
     ]
    }
   ]
  },
  {
   "id": "t_wind",
   "name": "Wind Temple",
   "sub": "Rito Village & Hebra - Regional Phenomena",
   "kind": "beast",
   "tagline": "Brave the Hebra blizzard, climb the sky islands with Tulin, and storm the floating Stormwind Ark to wake the Sage of Wind.",
   "champion": "Tulin's Gust",
   "sections": [
    {
     "id": "t_wind_s_arrive",
     "name": "Reaching Rito Village",
     "sub": "Find your way into the snowstorm",
     "steps": [
      {
       "id": "t_wind_arrive_1",
       "k": "step",
       "t": "Head northwest from Lookout Landing across Hyrule Ridge toward Rito Village; the unending blizzard over Hebra marks your destination."
      },
      {
       "id": "t_wind_arrive_2",
       "k": "tip",
       "t": "The cold up here saps hearts. Bring warm food, a cold-resistance set like the Snowquill armor, or spicy peppers before you push into Hebra."
      },
      {
       "id": "t_wind_arrive_3",
       "k": "step",
       "t": "Climb to the top of Rito Village to Revali's Landing, where Tulin is arguing with his father Teba, the new Village Elder, and his mother Saki."
      },
      {
       "id": "t_wind_arrive_4",
       "k": "reward",
       "t": "The Tulin of Rito Village quest begins. Tulin flies off to investigate the storm, and you set out after him."
      }
     ]
    },
    {
     "id": "t_wind_s_tulin",
     "name": "Tracking Down Tulin",
     "sub": "Across the Hebra mountains",
     "steps": [
      {
       "id": "t_wind_tulin_1",
       "k": "step",
       "t": "Follow the snowy trail north into Hebra. The blizzard blocks the open slopes, so take the cave route that climbs up through the mountain."
      },
      {
       "id": "t_wind_tulin_2",
       "k": "tip",
       "t": "In the cave, light the campfire and drop a Hylian Pine Cone on it to make an updraft, then glide up through the shaft to keep climbing."
      },
      {
       "id": "t_wind_tulin_3",
       "k": "step",
       "t": "Reach the lone cedar tree at the summit of Talonto Peak. Tulin is perched there, upset that an enemy stole his bow nearby."
      },
      {
       "id": "t_wind_tulin_4",
       "k": "reward",
       "t": "Tulin joins you and lends his Power of Wind, firing a gust that hurls you forward while you glide.",
       "items": [
        {
         "name": "Tulin's Gust",
         "cat": "ability",
         "note": "A wind burst from Tulin that boosts your paraglide forward through the air; he travels with you for the quest."
        }
       ]
      }
     ]
    },
    {
     "id": "t_wind_s_climb",
     "name": "Climbing to the Sky",
     "sub": "The Rising Island Chain",
     "steps": [
      {
       "id": "t_wind_climb_1",
       "k": "step",
       "t": "From the Hebra peaks, paraglide off the heights and use Tulin's Gust to launch between the floating stone ruins of the Rising Island Chain."
      },
      {
       "id": "t_wind_climb_2",
       "k": "step",
       "t": "Alternate Tulin's Gust to cross gaps horizontally and Ascend to rise up through the undersides of the higher platforms."
      },
      {
       "id": "t_wind_climb_3",
       "k": "tip",
       "t": "Make a campfire and drop a Hylian Pine Cone on it to create an updraft, then glide up to islands that look out of reach."
      },
      {
       "id": "t_wind_climb_4",
       "k": "optional",
       "t": "Activate any shrine you find among the sky islands to set a fast-travel point and a warm respite from the cold."
      },
      {
       "id": "t_wind_climb_5",
       "k": "step",
       "t": "Climb to the top of the chain, then skydive into the eye of the giant tornado to drop onto the Stormwind Ark - the Wind Temple."
      }
     ]
    },
    {
     "id": "t_wind_s_locks",
     "name": "Inside the Stormwind Ark",
     "sub": "The five locks puzzle",
     "reward": "Central hatch unlocked",
     "steps": [
      {
       "id": "t_wind_locks_1",
       "k": "step",
       "t": "The Ark is a flying ship with a sealed hatch in the center. Activate all five locks to open it and quell the storm."
      },
      {
       "id": "t_wind_locks_2",
       "k": "tip",
       "t": "Every lock works the same way: get a fan or windmill spinning, then hit it with Tulin's Gust. You can tackle the five in any order."
      },
      {
       "id": "t_wind_locks_3",
       "k": "step",
       "t": "One lock sits behind a broken lever: grab a fallen icicle with Ultrahand, attach it to the lever to free it, then aim a Gust at the fan."
      },
      {
       "id": "t_wind_locks_4",
       "k": "step",
       "t": "Another lock uses rotating gears - line up a slab or icicle piece with Ultrahand, use Recall on a turning wheel if needed, then Gust the fan."
      },
      {
       "id": "t_wind_locks_5",
       "k": "step",
       "t": "Drop to a lower deck and cross the scaffolding gaps with Tulin's Gust, then blast the fan set up there to light that lock."
      },
      {
       "id": "t_wind_locks_6",
       "k": "step",
       "t": "Out on the exterior, glide a laser-lined tunnel and dive past the obstacles to reach a fan platform, then power it with a Gust."
      },
      {
       "id": "t_wind_locks_7",
       "k": "step",
       "t": "For the last lock, clear the Constructs guarding the rigging, get the final windmill turning, and finish it with Tulin's Gust."
      },
      {
       "id": "t_wind_locks_8",
       "k": "reward",
       "t": "With all five locks lit, return to the center. The hatch opens and Colgera bursts out, dragging you into a midair duel."
      }
     ]
    },
    {
     "id": "t_wind_s_colgera",
     "name": "Boss: Colgera",
     "sub": "Aerial Phenomenon",
     "reward": "Heart Container",
     "steps": [
      {
       "id": "t_wind_colgera_1",
       "k": "step",
       "t": "You skydive after Colgera. Target its three ice-covered cores - the rounded weak points on its head, body, and tail."
      },
      {
       "id": "t_wind_colgera_2",
       "k": "tip",
       "t": "Aim the bow while falling to enter slow-motion. Fuse arrows with a Keese Eyeball to home in, or with fire to crack the ice faster.",
       "items": [
        {
         "name": "Bow",
         "cat": "bow",
         "note": "Any bow works; pair with arrows for the diving aerial fight."
        },
        {
         "name": "Keese Eyeball",
         "cat": "material",
         "note": "Fuse to an arrow so the shot homes in on Colgera's weak cores."
        }
       ]
      },
      {
       "id": "t_wind_colgera_3",
       "k": "step",
       "t": "Shatter all three cores. Colgera dives away through a portal, then reappears with its weak points restored for phase two."
      },
      {
       "id": "t_wind_colgera_4",
       "k": "warn",
       "t": "In phase two Colgera summons rows of tornadoes that sweep the arena - glide through the safe gaps while you keep diving on the cores."
      },
      {
       "id": "t_wind_colgera_5",
       "k": "step",
       "t": "Break the three cores a second time to finish Colgera and disperse the blizzard choking Hebra."
      },
      {
       "id": "t_wind_colgera_6",
       "k": "reward",
       "t": "Clearing the temple grants a Heart Container that permanently raises your maximum hearts.",
       "items": [
        {
         "name": "Heart Container",
         "cat": "material",
         "note": "Permanent +1 to your maximum hearts, awarded for clearing the temple."
        }
       ]
      }
     ]
    },
    {
     "id": "t_wind_s_reward",
     "name": "The Sage of Wind",
     "sub": "Tulin's vow",
     "reward": "Vow of Tulin, Sage of Wind",
     "steps": [
      {
       "id": "t_wind_reward_1",
       "k": "step",
       "t": "Tulin awakens as the Sage of Wind and gives his vow, joining you permanently as a summonable sage companion."
      },
      {
       "id": "t_wind_reward_2",
       "k": "reward",
       "t": "You gain the Vow of Tulin, letting you call his avatar and use Tulin's Gust anywhere in the open world.",
       "items": [
        {
         "name": "Tulin's Gust",
         "cat": "ability",
         "note": "Summon Tulin's avatar and interact to fire a forward wind burst that supercharges your paraglide and aerial attacks."
        }
       ]
      },
      {
       "id": "t_wind_reward_3",
       "k": "reward",
       "t": "The Hebra blizzard ends and Rito Village's regional phenomenon is resolved - one of four temples down."
      },
      {
       "id": "t_wind_reward_4",
       "k": "tip",
       "t": "Tulin's Gust is amazing for travel: jump, glide, and pulse the Gust to cross huge distances and reach far-off sky islands."
      }
     ]
    }
   ]
  },
  {
   "id": "t_fire",
   "name": "Fire Temple",
   "sub": "Goron Regional Phenomenon",
   "kind": "beast",
   "tagline": "Snap Yunobo out of his Marbled Rock Roast craze, blast Moragia off Death Mountain, dive into the Depths, and ring the gongs to clear the Fire Temple.",
   "champion": "Yunobo's Charge",
   "sections": [
    {
     "id": "t_fire_s_arrive",
     "name": "Crisis at Goron City",
     "sub": "Eldin region, near Death Mountain",
     "steps": [
      {
       "id": "t_fire_s_arrive_step1",
       "k": "step",
       "t": "Head to Goron City in the Eldin region. The area is volcanic, so gear up for heat before you go.",
       "items": [
        {
         "name": "Flamebreaker Armor",
         "cat": "armor",
         "note": "Sold by the Goron in Goron City, or cook fireproof meals. Stops Eldin's heat damage."
        }
       ]
      },
      {
       "id": "t_fire_s_arrive_warn1",
       "k": "warn",
       "t": "Eldin's heat sets wooden weapons and shields on fire and drains hearts. Carry fireproof food or wear heat-proof gear."
      },
      {
       "id": "t_fire_s_arrive_step2",
       "k": "step",
       "t": "In Goron City the Gorons are obsessed with Marbled Rock Roast, a gloom-tainted rock food that has them too dazed to listen or work."
      },
      {
       "id": "t_fire_s_arrive_tip1",
       "k": "tip",
       "t": "The Marbled Rock Roast is the corruption itself. Don't try to feed or bargain with the dazed Gorons; you'll fix it by clearing the temple."
      },
      {
       "id": "t_fire_s_arrive_step3",
       "k": "step",
       "t": "Boss Yunobo is up at YunoboCo HQ, north of the city. Goron kids guard a hot cave nearby where he waits in a strange mask; make your way in."
      }
     ]
    },
    {
     "id": "t_fire_s_yunobo",
     "name": "Snap Yunobo Out of It",
     "reward": "Yunobo joins you and teaches his rolling charge",
     "steps": [
      {
       "id": "t_fire_s_yunobo_step1",
       "k": "step",
       "t": "The masked Yunobo turns hostile, curls into a ball, and revs in place before launching himself at you across the room."
      },
      {
       "id": "t_fire_s_yunobo_step2",
       "k": "step",
       "t": "Dodge sideways so he rolls past and slams into a wall; he's stunned briefly. Run in and attack the mask before he recovers."
      },
      {
       "id": "t_fire_s_yunobo_warn1",
       "k": "warn",
       "t": "He's immune to damage until he hits a wall. Don't stand in his charge line; a wall hit is the only opening to damage him."
      },
      {
       "id": "t_fire_s_yunobo_step3",
       "k": "step",
       "t": "Stun and hit him three times until the corrupted mask shatters. Yunobo comes back to his senses and offers to help reach the temple.",
       "items": [
        {
         "name": "Yunobo's Charge",
         "cat": "ability",
         "note": "Field version: aim and fire Yunobo like a rolling cannonball to smash marbled rock, gongs and foes."
        }
       ]
      },
      {
       "id": "t_fire_s_yunobo_tip1",
       "k": "tip",
       "t": "Each time he's hit, his wind-up gets shorter, down to about two seconds. Once stunned you can also tag him with a bow."
      }
     ]
    },
    {
     "id": "t_fire_s_descent",
     "name": "Up Death Mountain, Then Into the Depths",
     "sub": "Beat Moragia, then dive the crater chasm",
     "steps": [
      {
       "id": "t_fire_s_descent_step1",
       "k": "step",
       "t": "Follow Yunobo to the mine-cart rails up Death Mountain. Use Ultrahand to attach a fan to a cart so it self-propels along the track.",
       "items": [
        {
         "name": "Fan (Zonai device)",
         "cat": "material",
         "note": "Stick it to a mine cart with Ultrahand for forward thrust along the rails."
        }
       ]
      },
      {
       "id": "t_fire_s_descent_step2",
       "k": "step",
       "t": "As you ride up, fire Yunobo's charge to smash marbled-rock blockages on the track so the cart keeps climbing toward the summit."
      },
      {
       "id": "t_fire_s_descent_step3",
       "k": "step",
       "t": "At the peak, the dragon-like boss Moragia rises from the crater. Board the nearby Zonai fan-glider with a cart and steering stick to fight it."
      },
      {
       "id": "t_fire_s_descent_step4",
       "k": "step",
       "t": "Fly the glider and fire Yunobo at each of Moragia's three marbled-rock heads. Destroy all three and its body crumbles.",
       "items": [
        {
         "name": "Yunobo's Charge",
         "cat": "ability",
         "note": "Aim from the glider and launch Yunobo at a head; each one downed cuts Moragia's health by a third."
        }
       ]
      },
      {
       "id": "t_fire_s_descent_warn1",
       "k": "warn",
       "t": "Moragia spits fireballs and lava rocks at the glider. Keep moving and watch your Zonai battery so you don't drop into the lava."
      },
      {
       "id": "t_fire_s_descent_step5",
       "k": "step",
       "t": "With Moragia gone, dive into the Death Mountain crater chasm to descend into the Depths beneath Eldin."
      },
      {
       "id": "t_fire_s_descent_step6",
       "k": "loot",
       "t": "Activate the Mustis Lightroot to light up the area and add it to your map for fast travel.",
       "items": [
        {
         "name": "Mustis Lightroot",
         "cat": "key",
         "note": "Lightroots are the Depths' answer to shrines; touch it to banish the gloom-dark nearby."
        }
       ]
      },
      {
       "id": "t_fire_s_descent_step7",
       "k": "step",
       "t": "Head west through the Depths toward Lost Gorondia, using carts, fans and Brightbloom Seeds for light until you reach the Fire Temple."
      }
     ]
    },
    {
     "id": "t_fire_s_temple",
     "name": "Inside the Fire Temple",
     "sub": "Ring five gongs to open the boss door",
     "steps": [
      {
       "id": "t_fire_s_temple_step1",
       "k": "step",
       "t": "The temple's central gate has five padlocks. Each lock opens when you ring its matching gong somewhere in the building. Any order works."
      },
      {
       "id": "t_fire_s_temple_step2",
       "k": "step",
       "t": "Explore the multi-level rooms and fire Yunobo's charge into each large gong. A solid hit rings it and pops one lock off the gate."
      },
      {
       "id": "t_fire_s_temple_tip1",
       "k": "tip",
       "t": "Aim Yunobo from the top of a ramp, not the bottom; he loses steam uphill. Use rail carts and fans to line up tricky gong angles."
      },
      {
       "id": "t_fire_s_temple_step3",
       "k": "step",
       "t": "Use Yunobo to smash the marbled rocks blocking paths, and Ascend through ceilings to reach gongs on the upper floors quickly.",
       "items": [
        {
         "name": "Ascend",
         "cat": "ability",
         "note": "Swim up through any solid ceiling; great for skipping back up after a lower-floor gong."
        }
       ]
      },
      {
       "id": "t_fire_s_temple_tip2",
       "k": "tip",
       "t": "Watch for Hydrant Zonai devices: spray water onto lava to harden it into safe stepping platforms toward out-of-reach gongs."
      },
      {
       "id": "t_fire_s_temple_loot1",
       "k": "loot",
       "t": "Open chests along the way for arrows, weapons and a small key while hunting gongs.",
       "items": [
        {
         "name": "Fire Temple chests",
         "cat": "material",
         "note": "Side rooms hold useful gear; grab them before the boss door."
        }
       ]
      },
      {
       "id": "t_fire_s_temple_step4",
       "k": "step",
       "t": "With all five locks broken, fire Yunobo up the wall to smash the red boulders on the ceiling above the gate, dropping the temple boss."
      }
     ]
    },
    {
     "id": "t_fire_s_boss",
     "name": "Boss: Marbled Gohma",
     "sub": "The spider that spawned the rock roast",
     "reward": "Heart Container",
     "steps": [
      {
       "id": "t_fire_s_boss_step1",
       "k": "step",
       "t": "Phase 1: Gohma stands on marbled-rock legs. Fire Yunobo's charge at a leg to shatter it; break enough and it collapses, exposing its eye."
      },
      {
       "id": "t_fire_s_boss_step2",
       "k": "step",
       "t": "While it's down, climb onto the boss and wail on the glowing eye with your best melee weapon before it recovers."
      },
      {
       "id": "t_fire_s_boss_warn1",
       "k": "warn",
       "t": "It hurls explosive rocks and swipes with its legs when you're close. After enough eye hits it shakes you off and counters; back away when it stirs."
      },
      {
       "id": "t_fire_s_boss_step3",
       "k": "step",
       "t": "Phase 2: below half health it climbs onto the ceiling. Center the camera on the leg farthest from you and fire Yunobo to knock it down."
      },
      {
       "id": "t_fire_s_boss_tip1",
       "k": "tip",
       "t": "Pick the far leg each time; closer legs are hard for Yunobo to reach on the ceiling. Drop it, attack the eye, repeat until it falls."
      },
      {
       "id": "t_fire_s_boss_reward1",
       "k": "reward",
       "t": "Defeat Marbled Gohma to clear the Fire Temple and claim a Heart Container.",
       "items": [
        {
         "name": "Heart Container",
         "cat": "key",
         "note": "Permanently adds one full heart to your max health."
        }
       ]
      }
     ]
    },
    {
     "id": "t_fire_s_after",
     "name": "Yunobo, Sage of Fire",
     "reward": "Sage's Vow; Yunobo's Charge sage power",
     "steps": [
      {
       "id": "t_fire_s_after_step1",
       "k": "step",
       "t": "With Gohma gone, the gloom-tainted Marbled Rock Roast loses its hold across Goron City and the Gorons snap back to normal."
      },
      {
       "id": "t_fire_s_after_reward1",
       "k": "reward",
       "t": "Yunobo grants you his Sage's Vow, summoning his spirit to fight alongside you.",
       "items": [
        {
         "name": "Sage's Vow (Yunobo)",
         "cat": "ability",
         "note": "Yunobo's avatar joins your party; activate his Charge to roll through rock and enemies."
        },
        {
         "name": "Yunobo's Charge",
         "cat": "ability",
         "note": "Sage power: press the Sage button near Yunobo to launch a fiery rolling charge that smashes ore, rock and foes."
        }
       ]
      },
      {
       "id": "t_fire_s_after_tip1",
       "k": "tip",
       "t": "Yunobo's Charge is great for ore deposits and breakable walls out in the field, not just combat. Keep him handy in Eldin."
      },
      {
       "id": "t_fire_s_after_optional1",
       "k": "optional",
       "t": "Talk to the recovered Gorons and shopkeepers around Goron City; many reopen their stores and offer new dialogue and side quests."
      },
      {
       "id": "t_fire_s_after_step2",
       "k": "step",
       "t": "Report back to advance the main quest. With Fire done, pursue the remaining temples and the wider Regional Phenomena story."
      }
     ]
    }
   ]
  },
  {
   "id": "t_water",
   "name": "Water Temple",
   "sub": "Sidon of the Zora - Lanayru Regional Phenomenon",
   "kind": "beast",
   "tagline": "Clear the sludge drowning Zora's Domain, shoot open a fish-shaped sky island, and wash the muck monster Mucktorok out of the Water Temple.",
   "champion": "Vow of Sidon, Sage of Water",
   "sections": [
    {
     "id": "t_water_s1",
     "name": "Sludge Over Zora's Domain",
     "sub": "Reach the Domain and find Prince Sidon",
     "steps": [
      {
       "id": "t_water_s1_q1",
       "k": "step",
       "t": "Travel to Zora's Domain (northeast Lanayru). Sludge coats everything, the locals are suffering, and King Dorephan is gravely ill."
      },
      {
       "id": "t_water_s1_q2",
       "k": "tip",
       "t": "Sludge is sticky and damages over time. Wash it off by jumping in clean water or rolling, and clear it before it builds up on you."
      },
      {
       "id": "t_water_s1_q3",
       "k": "step",
       "t": "Meet Prince Sidon at Mipha Court, the statue plaza near Ploymus Mountain. He asks for help, kicking off the main quest Sidon of the Zora."
      },
      {
       "id": "t_water_s1_q4",
       "k": "step",
       "t": "Find King Dorephan hidden in the Pristine Sanctum behind a waterfall (between Mipha Court and Mikau Lake). Talk to him for the key item."
      },
      {
       "id": "t_water_s1_q5",
       "k": "loot",
       "t": "Receive 5 King's Scales from King Dorephan.",
       "items": [
        {
         "name": "King's Scale",
         "cat": "key",
         "note": "Fuse one to an arrow and shoot the floating teardrop near the sky island to open the way. You get five, so misses are forgiven."
        }
       ]
      },
      {
       "id": "t_water_s1_q6",
       "k": "tip",
       "t": "Grab the Zora Armor if you don't have it. It lets you swim up waterfalls, very handy around Zora's Domain and for the temple approach.",
       "items": [
        {
         "name": "Zora Armor",
         "cat": "armor",
         "note": "Swim up waterfalls. Helpful for getting around the Domain and reaching the sky."
        }
       ]
      }
     ]
    },
    {
     "id": "t_water_s2",
     "name": "The Fish-Shaped Sky Island",
     "sub": "Shoot the teardrop to open the sludge source",
     "steps": [
      {
       "id": "t_water_s2_q1",
       "k": "step",
       "t": "Look up to the fish-shaped Floating Scales Island in the sky, source of the sludge. That island is your target."
      },
      {
       "id": "t_water_s2_q2",
       "k": "step",
       "t": "Get airborne to reach it: glide from a high point, or ride a falling sky-island chunk up using Recall."
      },
      {
       "id": "t_water_s2_q3",
       "k": "step",
       "t": "Climb to the island's peak and look southwest to spot a cluster of floating rocks forming a giant teardrop shape hanging in the air."
      },
      {
       "id": "t_water_s2_q4",
       "k": "step",
       "t": "Fuse a King's Scale to an arrow and fire it through the center of the teardrop. Jump first to slow time and steady your aim in midair."
      },
      {
       "id": "t_water_s2_q5",
       "k": "reward",
       "t": "The teardrop lights up and a pillar of light erupts from East Reservoir Lake, marking your next destination on the map."
      }
     ]
    },
    {
     "id": "t_water_s3",
     "name": "Sidon's Power of Water",
     "sub": "Reach East Reservoir Lake and dive to the temple",
     "steps": [
      {
       "id": "t_water_s3_q1",
       "k": "step",
       "t": "Head to East Reservoir Lake and meet Sidon at the green light in the water. He shares his Power of Water for the journey ahead."
      },
      {
       "id": "t_water_s3_q2",
       "k": "step",
       "t": "Stand near Sidon and use the prompt to wrap yourself in his water bubble. Your attacks now fling water that washes off sludge.",
       "items": [
        {
         "name": "Sidon's Power of Water",
         "cat": "ability",
         "note": "Sidon's water bubble: melee swings throw a tidal wave of water that strips sludge and breaks shields."
        }
       ]
      },
      {
       "id": "t_water_s3_q3",
       "k": "step",
       "t": "Practice the loop on any sludge enemy: blast the muck off with the water bubble, then strike the exposed foe until it falls."
      },
      {
       "id": "t_water_s3_q4",
       "k": "step",
       "t": "With Sidon along, dive into the whirlpool he forms at the green light. It pulls you up into the sky toward the floating Water Temple."
      },
      {
       "id": "t_water_s3_q5",
       "k": "tip",
       "t": "Re-grab Sidon's bubble any time it lapses. It refreshes for free and is your main tool for clearing sludge inside the temple."
      }
     ]
    },
    {
     "id": "t_water_s4",
     "name": "The Four Faucets",
     "sub": "Restore water flow inside the Water Temple",
     "reward": "Access to the boss; faucets can be done in any order",
     "steps": [
      {
       "id": "t_water_s4_q1",
       "k": "step",
       "t": "Touch the central terminal to mark the four faucets on your map. Open all four to restore the flow and reach the boss. Any order works."
      },
      {
       "id": "t_water_s4_q2",
       "k": "step",
       "t": "Most faucet wheels just need water hitting the paddles. Use Sidon's water blast, a nearby water bubble, or a water spout to spin them."
      },
      {
       "id": "t_water_s4_q3",
       "k": "step",
       "t": "One faucet uses Ascend to reach a high platform; have Tulin's gust push a paddle, or carry water to the wheel to turn it open."
      },
      {
       "id": "t_water_s4_q4",
       "k": "step",
       "t": "Sludge-blocked switches: clear the muck with Splash Fruit or Chuchu Jelly arrows, an Opal-fused weapon, or Sidon's water, then hit the switch."
      },
      {
       "id": "t_water_s4_q5",
       "k": "step",
       "t": "For the fast-spinning box atop the tall tower, leap off, aim your bow in midair to slow time, and shoot the switch inside to drain the room."
      },
      {
       "id": "t_water_s4_q6",
       "k": "tip",
       "t": "Stuck on a wheel? Look for a water source nearby. Ultrahand and Recall can reposition or replay water bubbles and platforms to get flow going."
      },
      {
       "id": "t_water_s4_q7",
       "k": "loot",
       "t": "Open the chests around the faucets for arrows and useful materials while you explore.",
       "items": [
        {
         "name": "Bundle of Arrows",
         "cat": "material",
         "note": "Common temple chest reward; stock up before the boss."
        }
       ]
      }
     ]
    },
    {
     "id": "t_water_s5",
     "name": "Boss: Mucktorok",
     "sub": "Scourge of the Water Temple",
     "reward": "Heart Container",
     "steps": [
      {
       "id": "t_water_s5_q1",
       "k": "warn",
       "t": "With all four faucets open, use the central pedestal to drop into the arena. Bring Sidon's Power of Water; it's the fastest way to expose the boss."
      },
      {
       "id": "t_water_s5_q2",
       "k": "step",
       "t": "Phase 1: Mucktorok rides as a sludge shark, slamming shockwaves and firing a sludge beam. Hit it with water (Sidon's bubble) to wash off the sludge."
      },
      {
       "id": "t_water_s5_q3",
       "k": "step",
       "t": "Washing it reveals a small Octorok. While it's exposed and flopping, rush in with melee. Repeat the wash-then-hit cycle to drop its health."
      },
      {
       "id": "t_water_s5_q4",
       "k": "step",
       "t": "Phase 2 (half health): it coats the floor in sludge pools and hops between them while spewing muck. Wash a pool with water to deny it cover."
      },
      {
       "id": "t_water_s5_q5",
       "k": "step",
       "t": "Catch the Octorok on cleared ground, stun it with a water hit, then close in and finish it with heavy attacks."
      },
      {
       "id": "t_water_s5_q6",
       "k": "tip",
       "t": "Stay on clean tiles. Standing in sludge slows you and chips your health. Low gravity here lets you jump and glide over the wave and beam attacks."
      },
      {
       "id": "t_water_s5_q7",
       "k": "reward",
       "t": "Defeat Mucktorok for a Heart Container plus some Octorok materials, and the temple's sludge is cleared for good.",
       "items": [
        {
         "name": "Heart Container",
         "cat": "material",
         "note": "Permanent extra heart awarded for clearing the temple boss."
        }
       ]
      }
     ]
    },
    {
     "id": "t_water_s6",
     "name": "Sidon's Vow",
     "sub": "Awaken the Sage of Water",
     "reward": "Vow of Sidon, Sage of Water",
     "steps": [
      {
       "id": "t_water_s6_q1",
       "k": "step",
       "t": "After the fight, Sidon awakens as the Sage of Water. Speak with him to complete the main quest Sidon of the Zora."
      },
      {
       "id": "t_water_s6_q2",
       "k": "reward",
       "t": "Receive the Vow of Sidon. His avatar now follows you; trigger his water ability in the field to shield yourself and clear sludge.",
       "items": [
        {
         "name": "Vow of Sidon, Sage of Water",
         "cat": "ability",
         "note": "Summon Sidon's water bubble in the overworld for an offensive and defensive water shield."
        }
       ]
      },
      {
       "id": "t_water_s6_q3",
       "k": "tip",
       "t": "Sidon's vow pairs well with archery: stand in his bubble so arrows pick up water, useful against fire foes and Gibdos later."
      },
      {
       "id": "t_water_s6_q4",
       "k": "optional",
       "t": "Return to King Dorephan and the now-clear Zora's Domain for grateful villagers, restocked shops, and follow-up side quests."
      }
     ]
    }
   ]
  },
  {
   "id": "t_lightning",
   "name": "Lightning Temple",
   "sub": "Gerudo Desert - Riju, Sage of Lightning",
   "kind": "beast",
   "tagline": "Pierce the sand shroud, stand with Riju against the Gibdo swarm, and charge the temple's four batteries to face Queen Gibdo.",
   "champion": "Vow of Riju",
   "sections": [
    {
     "id": "t_lightning_s_arrival",
     "name": "The Sand Shroud and Gerudo Refuge",
     "sub": "Reaching Gerudo Town and finding Riju",
     "steps": [
      {
       "id": "t_lightning_s_arrival_st1",
       "k": "step",
       "t": "Head to the Gerudo Desert in Hyrule's southwest. A thick sand shroud now blankets it, so visibility on the ground is near zero."
      },
      {
       "id": "t_lightning_s_arrival_st2",
       "k": "tip",
       "t": "To navigate the shroud, climb high and paraglide, or pop a Zonai Rocket to rise above the haze where the map reads clearly again."
      },
      {
       "id": "t_lightning_s_arrival_st3",
       "k": "warn",
       "t": "Gibdos roam the sand. These mummy-like foes resist normal hits but crumble fast to electric attacks, so pack shock arrows or electric weapons."
      },
      {
       "id": "t_lightning_s_arrival_st4",
       "k": "step",
       "t": "Reach Gerudo Town. With the town evacuated, the residents shelter in the Gerudo Shelter cave. Head inside to find Riju and Buliara."
      },
      {
       "id": "t_lightning_s_arrival_st5",
       "k": "step",
       "t": "Speak with Riju and Buliara. Riju agrees to help you find the source of the sand shroud and confront whatever is sending the Gibdos."
      }
     ]
    },
    {
     "id": "t_lightning_s_riju",
     "name": "Riju's Lightning and the Town Defense",
     "sub": "Learning her power and holding the line",
     "steps": [
      {
       "id": "t_lightning_s_riju_st1",
       "k": "step",
       "t": "Riju shares her lightning power. She creates a charged field around your aim point; draw your bow inside it and fire to call a lightning strike.",
       "items": [
        {
         "name": "Riju's Power of Lightning",
         "cat": "ability",
         "note": "Stand in Riju's electric field, aim an arrow, and release to call down a lightning bolt on the target."
        }
       ]
      },
      {
       "id": "t_lightning_s_riju_st2",
       "k": "tip",
       "t": "Riju's lightning is your best tool against the Gibdo nests that keep spawning enemies, and it lights up dark spaces so you can see nearby walls."
      },
      {
       "id": "t_lightning_s_riju_st3",
       "k": "step",
       "t": "Fend off the Gibdo assault on Gerudo Town. Clear the waves and protect Riju while you fight your way toward the desert beyond the walls."
      },
      {
       "id": "t_lightning_s_riju_st4",
       "k": "warn",
       "t": "Lightning conducts through water and metal. Don't fire Riju's lightning while standing in water or holding a metal weapon, or you'll shock yourself."
      },
      {
       "id": "t_lightning_s_riju_st5",
       "k": "tip",
       "t": "Stock up first: grab electric weapons, shock arrows, and plain arrows. You'll burn through arrows powering Riju's lightning all dungeon long."
      }
     ]
    },
    {
     "id": "t_lightning_s_temple",
     "name": "Reaching the Lightning Temple",
     "sub": "Crossing the desert to the temple entrance",
     "steps": [
      {
       "id": "t_lightning_s_temple_st1",
       "k": "step",
       "t": "With Riju along, ride out into the desert toward the source of the shroud, following the trail of Gibdos to the half-buried temple."
      },
      {
       "id": "t_lightning_s_temple_st2",
       "k": "warn",
       "t": "At the entrance you fight a preview battle against Queen Gibdo. You can't kill her yet; survive her charge, sand beam, and tornadoes to learn her patterns."
      },
      {
       "id": "t_lightning_s_temple_st3",
       "k": "step",
       "t": "At the doors, a gloom cocoon blocks the way. Hit it with Riju's lightning, then loose an arrow into it to burst it open and step inside.",
       "items": [
        {
         "name": "Riju's Power of Lightning",
         "cat": "ability",
         "note": "Zap the gloom cocoon over the door, then fire an arrow to break it and open the temple."
        }
       ]
      },
      {
       "id": "t_lightning_s_temple_st4",
       "k": "loot",
       "t": "Just inside, grab the Korok Frond. Swing it to blow away mounds of sand covering devices and paths as you explore the temple.",
       "items": [
        {
         "name": "Korok Frond",
         "cat": "weapon",
         "note": "A leaf-fan weapon found inside; swing it to blow sand off hidden devices and platforms."
        }
       ]
      }
     ]
    },
    {
     "id": "t_lightning_s_interior",
     "name": "Inside the Temple: Four Batteries",
     "sub": "Light, mirrors, and powering the elevator",
     "reward": "Access to the boss elevator",
     "steps": [
      {
       "id": "t_lightning_s_interior_st1",
       "k": "step",
       "t": "Enter the main room and activate the central Zonai device. This unlocks the temple's travel point and sets the goal: charge four batteries."
      },
      {
       "id": "t_lightning_s_interior_st2",
       "k": "tip",
       "t": "The four batteries sit on different floors and can be charged in any order. Power all four to bring the central elevator online."
      },
      {
       "id": "t_lightning_s_interior_st3",
       "k": "step",
       "t": "Each battery is reached by routing a beam of light through mirrors to a receptor. Use Ultrahand to grab and rotate mirror panels and aim the beam.",
       "items": [
        {
         "name": "Ultrahand",
         "cat": "ability",
         "note": "Grab and rotate mirror panels to aim light beams at the receptors that open the way to each battery."
        }
       ]
      },
      {
       "id": "t_lightning_s_interior_st4",
       "k": "step",
       "t": "Watch for Soldier Constructs guarding the rooms, some perched on Hover Stones. Clear them, then steady the reflected beam so the receptor activates."
      },
      {
       "id": "t_lightning_s_interior_st5",
       "k": "step",
       "t": "Use Ascend to reach higher floors and Recall to reverse rotating wheels and platforms when lining up a beam.",
       "items": [
        {
         "name": "Ascend",
         "cat": "ability",
         "note": "Rise up through ceilings to reach battery platforms and upper floors."
        },
        {
         "name": "Recall",
         "cat": "ability",
         "note": "Reverse moving platforms or wheels to line up a light beam."
        }
       ]
      },
      {
       "id": "t_lightning_s_interior_st6",
       "k": "step",
       "t": "At each battery, fire Riju's lightning at the prong on top to charge it. With all four charged, return to the center and ride the elevator to the boss."
      },
      {
       "id": "t_lightning_s_interior_st7",
       "k": "reward",
       "t": "All four batteries charged opens the way down. Reactivate the central Zonai device to power the elevator that carries you to Queen Gibdo."
      }
     ]
    },
    {
     "id": "t_lightning_s_boss",
     "name": "Boss: Queen Gibdo",
     "sub": "The source of the sand shroud",
     "reward": "Vow of Riju and a Heart Container",
     "steps": [
      {
       "id": "t_lightning_s_boss_st1",
       "k": "warn",
       "t": "Queen Gibdo's hardened shell shrugs off ordinary attacks. You must break it with Riju's lightning before any of your hits will land."
      },
      {
       "id": "t_lightning_s_boss_st2",
       "k": "step",
       "t": "Stand in Riju's field, aim, and fire to zap the Queen. Her armor flakes off and she turns white and vulnerable for a short window."
      },
      {
       "id": "t_lightning_s_boss_st3",
       "k": "step",
       "t": "While she's exposed, rush in and unload with your strongest melee weapon before the armor reforms. Repeat the shock-then-strike loop."
      },
      {
       "id": "t_lightning_s_boss_st4",
       "k": "warn",
       "t": "Dodge her three attacks: a forward charge, a ground-tracking sand beam, and summoned tornadoes. Keep moving and hold some distance to read them."
      },
      {
       "id": "t_lightning_s_boss_st5",
       "k": "step",
       "t": "At about half health she enters phase two and summons Gibdos from the nests around the arena. Blast the nests with Riju's lightning, then resume the loop."
      },
      {
       "id": "t_lightning_s_boss_st6",
       "k": "reward",
       "t": "Down Queen Gibdo to lift the sand shroud and free the Gerudo. Riju joins you as the Sage of Lightning, and you claim a Heart Container.",
       "items": [
        {
         "name": "Vow of Riju",
         "cat": "ability",
         "note": "Sage of Lightning. Summon Riju's avatar in the field to fight alongside you."
        },
        {
         "name": "Heart Container",
         "cat": "key",
         "note": "Boss reward; permanently adds one heart to your max health."
        }
       ]
      }
     ]
    },
    {
     "id": "t_lightning_s_vow",
     "name": "Using the Vow of Riju",
     "sub": "The Sage of Lightning's power in the field",
     "steps": [
      {
       "id": "t_lightning_s_vow_st1",
       "k": "step",
       "t": "Leave any settlement, then approach Riju's avatar in the field and press the prompt to activate her power, conjuring a lightning field around your aim.",
       "items": [
        {
         "name": "Vow of Riju",
         "cat": "ability",
         "note": "Activate near Riju's avatar, then fire an arrow into her field to call a lightning strike on enemies."
        }
       ]
      },
      {
       "id": "t_lightning_s_vow_st2",
       "k": "tip",
       "t": "Fire an arrow inside the field to drop a lightning bolt that hits everything caught in it. Great for crowds, electric puzzles, and Gibdos anywhere."
      },
      {
       "id": "t_lightning_s_vow_st3",
       "k": "tip",
       "t": "The field also outlines nearby walls and mounds, so it doubles as a way to see and navigate dark areas like the Depths."
      },
      {
       "id": "t_lightning_s_vow_st4",
       "k": "warn",
       "t": "Lightning conducts through water and metal. Don't trigger it while standing in a puddle or holding a metal weapon, or you'll shock yourself."
      },
      {
       "id": "t_lightning_s_vow_st5",
       "k": "optional",
       "t": "Bring a Sage's Will to the Spirit Temple later to upgrade the Vow of Riju, raising its strength."
      }
     ]
    }
   ]
  },
  {
   "id": "t_spirit",
   "name": "The Fifth Sage",
   "sub": "Main Quest: Guidance from Ages Past",
   "kind": "beast",
   "tagline": "Chase the masked light to the Construct Factory, build Mineru a body, then duel the Seized Construct to wake the Sage of Spirit.",
   "champion": "Vow of Mineru",
   "sections": [
    {
     "id": "t_spirit_s1",
     "name": "Dragonhead Island & the Mask",
     "sub": "Sky layer above Faron",
     "steps": [
      {
       "id": "t_spirit_s1_1",
       "k": "tip",
       "t": "This quest opens after the four temples. Bring plenty of hearts and stock Zonai devices like wings, fans, and a steering stick.",
       "items": []
      },
      {
       "id": "t_spirit_s1_2",
       "k": "step",
       "t": "Travel to Dragonhead Island in the sky, the large stone dragon-head ruin floating above the Faron region. Use a tower launch or skydive in.",
       "items": []
      },
      {
       "id": "t_spirit_s1_3",
       "k": "step",
       "t": "Reach Joku-u Shrine on the island. Just past it, pick up the Zonai mask that emits a green homing light beam.",
       "items": []
      },
      {
       "id": "t_spirit_s1_4",
       "k": "step",
       "t": "Build a flying machine (wings or fans plus a steering stick) and Ultrahand the mask onto the front so the green beam points your flight path.",
       "items": [
        {
         "name": "Ultrahand",
         "cat": "ability",
         "note": "Attach the mask to your build so its light guides you."
        }
       ]
      },
      {
       "id": "t_spirit_s1_5",
       "k": "step",
       "t": "Follow the green beam down to the surface. It leads to a large stone owl statue with a pedestal out front, near Tobio's Hollow Chasm.",
       "items": []
      },
      {
       "id": "t_spirit_s1_6",
       "k": "step",
       "t": "Land and set the mask on the owl's pedestal. A cutscene plays and the platform lowers you into the Depths toward the Construct Factory.",
       "items": []
      }
     ]
    },
    {
     "id": "t_spirit_s2",
     "name": "The Construct Factory",
     "sub": "Faron Depths",
     "steps": [
      {
       "id": "t_spirit_s2_1",
       "k": "step",
       "t": "The platform drops you at the Construct Factory in the Depths, where Mineru's spirit greets you and asks you to build her a body.",
       "items": []
      },
      {
       "id": "t_spirit_s2_2",
       "k": "step",
       "t": "First, rotate the Zonai mask and set it into the head slot on the construct frame at the central platform before gathering the limbs.",
       "items": [
        {
         "name": "Ultrahand",
         "cat": "ability",
         "note": "Rotate and seat the mask into the head socket."
        }
       ]
      },
      {
       "id": "t_spirit_s2_3",
       "k": "tip",
       "t": "Light a nearby Lightroot if you pass one to brighten the Depths. The four limb depots branch off around the central factory.",
       "items": []
      },
      {
       "id": "t_spirit_s2_4",
       "k": "step",
       "t": "Visit the four storehouses in any order: Left-Arm Depot, Right-Arm Depot, Left-Leg Depot, and Right-Leg Depot. Solve each room's Zonai puzzle to claim its part.",
       "items": [
        {
         "name": "Ultrahand",
         "cat": "ability",
         "note": "Most depot puzzles use Ultrahand to move parts, rails, and platforms."
        }
       ]
      },
      {
       "id": "t_spirit_s2_5",
       "k": "tip",
       "t": "Carry each retrieved limb out yourself or build a hauler. If you drop one, your map still marks the depot so you can backtrack.",
       "items": []
      },
      {
       "id": "t_spirit_s2_6",
       "k": "step",
       "t": "Return to the frame and use Ultrahand to attach each arm and leg to its correct socket. Once all parts fit, Mineru's Construct comes to life.",
       "items": []
      }
     ]
    },
    {
     "id": "t_spirit_s3",
     "name": "Piloting Mineru's Construct",
     "sub": "To the Spirit Temple",
     "steps": [
      {
       "id": "t_spirit_s3_1",
       "k": "step",
       "t": "Climb aboard and pilot Mineru's Construct. Moving steadily drains its energy, so let it rest to recharge as you travel and watch the gauge.",
       "items": []
      },
      {
       "id": "t_spirit_s3_2",
       "k": "tip",
       "t": "Fuse weapons to the construct's hands. Mineru suggests a Spiked Iron Ball and a Shock Emitter; a Zonai Cannon also helps a lot for the boss.",
       "items": [
        {
         "name": "Fuse",
         "cat": "ability",
         "note": "Attach a Spiked Iron Ball and a Shock Emitter (and a Cannon if you have one)."
        },
        {
         "name": "Spiked Iron Ball",
         "cat": "material",
         "note": "Heavy melee hits to combo the boss while it is down."
        },
        {
         "name": "Shock Emitter",
         "cat": "material",
         "note": "Zonai device; stuns the boss so you can close in."
        }
       ]
      },
      {
       "id": "t_spirit_s3_3",
       "k": "step",
       "t": "Follow the path through the Depths, clearing Constructs as practice, until you reach the entrance to the Spirit Temple.",
       "items": []
      },
      {
       "id": "t_spirit_s3_4",
       "k": "warn",
       "t": "If the energy gauge empties the construct slows and stalls. Pause to let it recharge, or stock extra Zonai Charges before the boss arena.",
       "items": []
      }
     ]
    },
    {
     "id": "t_spirit_s4",
     "name": "Boss: Seized Construct",
     "sub": "Spirit Temple",
     "reward": "Heart Container",
     "steps": [
      {
       "id": "t_spirit_s4_1",
       "k": "warn",
       "t": "Stay aboard Mineru's Construct. The arena floor is covered in Gloom that drains Link fast on foot, and the ring is fenced by barbed wire.",
       "items": []
      },
      {
       "id": "t_spirit_s4_2",
       "k": "step",
       "t": "Phase 1: guard its telegraphed punches, then counter. Stun it with the Shock Emitter, walk in, and land spiked-ball hits to shove it into the wire fence.",
       "items": []
      },
      {
       "id": "t_spirit_s4_3",
       "k": "tip",
       "t": "Knocking it into the barbed-wire fence is the big damage. Circle the boss to dodge its melee swings and ranged shots between knockdowns.",
       "items": []
      },
      {
       "id": "t_spirit_s4_4",
       "k": "step",
       "t": "Phase 2: it grows extra arms and fuses a Rocket to fly, firing Cannons. Hit it with a Cannon shot to slam it back down, then resume your combos.",
       "items": []
      },
      {
       "id": "t_spirit_s4_5",
       "k": "reward",
       "t": "Beat the Seized Construct to earn a Heart Container.",
       "items": [
        {
         "name": "Heart Container",
         "cat": "key",
         "note": "Adds one full heart to your maximum."
        }
       ]
      }
     ]
    },
    {
     "id": "t_spirit_s5",
     "name": "The Sage of Spirit",
     "sub": "Quest reward",
     "reward": "Vow of Mineru (Sage of Spirit)",
     "steps": [
      {
       "id": "t_spirit_s5_1",
       "k": "reward",
       "t": "Mineru is freed as the fifth sage. She grants the Vow of Mineru, joining your party as the Sage of Spirit.",
       "items": [
        {
         "name": "Vow of Mineru",
         "cat": "ability",
         "note": "Sage of Spirit; summons her construct avatar to fight at your side."
        }
       ]
      },
      {
       "id": "t_spirit_s5_2",
       "k": "tip",
       "t": "Mineru's construct avatar charges in and pounds enemies, and rounds out all five sage vows.",
       "items": []
      },
      {
       "id": "t_spirit_s5_3",
       "k": "tip",
       "t": "With all five sages secured, you're ready for the endgame. Pursue the Trail of the Master Sword and the final approach to Ganondorf.",
       "items": []
      }
     ]
    }
   ]
  },
  {
   "id": "t_castle",
   "name": "Find the Princess",
   "sub": "Chase Zelda's trail across Hyrule",
   "kind": "region",
   "tagline": "Follow the Dragon's Tears, face the false Zelda at Hyrule Castle, claim the Master Sword, and ready yourself for the Depths.",
   "champion": null,
   "sections": [
    {
     "id": "t_castle_s1_tears",
     "name": "The Dragon's Tears",
     "sub": "Read the geoglyphs and uncover Zelda's fate",
     "reward": "Story memories that reveal Zelda's journey to the past",
     "steps": [
      {
       "id": "t_castle_s1_st1",
       "k": "step",
       "t": "Find the first geoglyph by New Serenne Stable in Hyrule Ridge, then head to the Forgotten Temple northwest of there to begin The Dragon's Tears.",
       "items": []
      },
      {
       "id": "t_castle_s1_st2",
       "k": "step",
       "t": "Meet Impa and Cado at the Forgotten Temple. They reveal a floor map marking every geoglyph and point you toward the rest.",
       "items": [
        {
         "name": "Impa",
         "cat": "key",
         "note": "Quest-giver who studies the geoglyphs from her hot-air balloon."
        }
       ]
      },
      {
       "id": "t_castle_s1_st3",
       "k": "step",
       "t": "Touch the Dragon's Tear in the first geoglyph, the King Rauru drawing by New Serenne Stable, to watch its memory cutscene.",
       "items": []
      },
      {
       "id": "t_castle_s1_st4",
       "k": "loot",
       "t": "Visit all 11 geoglyphs across the surface and touch each Dragon's Tear, the solid teardrop among the hollow ones, to collect its memory.",
       "items": []
      },
      {
       "id": "t_castle_s1_st5",
       "k": "tip",
       "t": "Activate Skyview Towers first. From the air you can spot the huge ground drawings and pin each geoglyph on your Purah Pad map.",
       "items": []
      },
      {
       "id": "t_castle_s1_st6",
       "k": "tip",
       "t": "Memories play out of order, so the story may feel scrambled. Viewing them by number in your Adventure Log keeps things clear.",
       "items": []
      },
      {
       "id": "t_castle_s1_st7",
       "k": "warn",
       "t": "These memories are heavy spoilers for the whole plot. They are optional, but they explain who you have really been chasing.",
       "items": []
      }
     ]
    },
    {
     "id": "t_castle_s2_lightdragon",
     "name": "The Twelfth Tear",
     "sub": "Chase the dragon for the final memory",
     "reward": "The truth: Zelda became the Light Dragon",
     "steps": [
      {
       "id": "t_castle_s2_st1",
       "k": "step",
       "t": "After the 11 geoglyph memories, you're told a final, 12th tear waits in the Akkala region. A new marker appears far to the northeast.",
       "items": []
      },
      {
       "id": "t_castle_s2_st2",
       "k": "step",
       "t": "Travel to the tip of Rist Peninsula in Akkala and touch the final Dragon's Tear resting there.",
       "items": [
        {
         "name": "Light Dragon",
         "cat": "key",
         "note": "The eternal dragon that circles Hyrule; the final tear reveals its true identity."
        }
       ]
      },
      {
       "id": "t_castle_s2_st3",
       "k": "reward",
       "t": "The last memory confirms Zelda swallowed her Secret Stone and became the Light Dragon to one day restore the broken Master Sword.",
       "items": []
      },
      {
       "id": "t_castle_s2_st4",
       "k": "tip",
       "t": "Remember this. The Light Dragon's flight path now matters: she carries the Master Sword you'll claim later in this chapter.",
       "items": []
      }
     ]
    },
    {
     "id": "t_castle_s3_castle",
     "name": "Crisis at Hyrule Castle",
     "sub": "Chase the Zelda sightings into the throne room",
     "reward": "Heart Container",
     "steps": [
      {
       "id": "t_castle_s3_st1",
       "k": "step",
       "t": "At Lookout Landing, Purah's telescope spots Princess Zelda at risen Hyrule Castle. Speak with Purah to start Crisis at Hyrule Castle.",
       "items": [
        {
         "name": "Purah",
         "cat": "key",
         "note": "Lookout Landing's lead researcher; sends you to the castle after the Zelda sighting."
        }
       ]
      },
      {
       "id": "t_castle_s3_st2",
       "k": "step",
       "t": "Cross to Hyrule Castle, now floating above its moat. Climb or use Ascend to follow the figure of Zelda deeper inside.",
       "items": []
      },
      {
       "id": "t_castle_s3_st3",
       "k": "step",
       "t": "Chase the phantom Zelda through the halls. She lures you on, and enemies like Shock Likes block the way as you press toward the throne room.",
       "items": []
      },
      {
       "id": "t_castle_s3_st4",
       "k": "step",
       "t": "In the throne room the false Zelda vanishes and the real threat appears: Phantom Ganon, a puppet of Ganondorf, attacks in multiple forms.",
       "items": [
        {
         "name": "Phantom Ganon",
         "cat": "key",
         "note": "Ganondorf's puppet boss; several spawn at once, then a second wave adds gloom to the floor."
        }
       ]
      },
      {
       "id": "t_castle_s3_st5",
       "k": "step",
       "t": "Defeat every Phantom Ganon to win. Summon your sages to keep the copies busy so you can fight them one at a time.",
       "items": []
      },
      {
       "id": "t_castle_s3_st6",
       "k": "reward",
       "t": "You earn a Heart Container. The castle Zelda was a fake; return to Purah to close the quest and begin Find the Fifth Sage.",
       "items": []
      },
      {
       "id": "t_castle_s3_st7",
       "k": "tip",
       "t": "Gloom lowers your max hearts. Bring sunny dishes made with sundelions to recover, and strong fused weapons for the Phantom Ganon fight.",
       "items": []
      }
     ]
    },
    {
     "id": "t_castle_s4_dekutree",
     "name": "Recovering the Hero's Sword",
     "sub": "Cleanse Korok Forest and seek the Deku Tree",
     "reward": "A quest marker tracking the Master Sword",
     "steps": [
      {
       "id": "t_castle_s4_st1",
       "k": "step",
       "t": "Head for the Lost Woods and Korok Forest. The surface path is sealed by gloom fog, so you'll need to reach the Great Deku Tree from below.",
       "items": []
      },
      {
       "id": "t_castle_s4_st2",
       "k": "step",
       "t": "Drop into the Depths via a nearby chasm, then use Ascend to rise up inside the Deku Tree and defeat the Gloom Hands and Phantom Ganon at the source.",
       "items": [
        {
         "name": "Gloom Hands",
         "cat": "key",
         "note": "Crawling gloom arms; fire and bomb flowers work well, and a Phantom Ganon appears once they fall."
        }
       ]
      },
      {
       "id": "t_castle_s4_st3",
       "k": "step",
       "t": "With the forest cleansed, speak with the Great Deku Tree to start Recovering the Hero's Sword. He confirms the Master Sword rests with the Light Dragon.",
       "items": [
        {
         "name": "Great Deku Tree",
         "cat": "key",
         "note": "Guardian of Korok Forest; points you to the Master Sword on the dragon."
        }
       ]
      },
      {
       "id": "t_castle_s4_st4",
       "k": "reward",
       "t": "The quest adds a marker that always points to the Master Sword, tracking the Light Dragon wherever she flies.",
       "items": []
      }
     ]
    },
    {
     "id": "t_castle_s5_mastersword",
     "name": "The Master Sword",
     "sub": "Pull the blade from the Light Dragon",
     "reward": "Master Sword",
     "steps": [
      {
       "id": "t_castle_s5_st1",
       "k": "warn",
       "t": "Pulling the sword drains stamina fast. You need two full stamina wheels, so upgrade with Stamina Vessels and Lights of Blessing first.",
       "items": []
      },
      {
       "id": "t_castle_s5_st2",
       "k": "step",
       "t": "Track the Light Dragon along her slow circuit. Launch from a Skyview Tower or sky island and glide down onto her back.",
       "items": []
      },
      {
       "id": "t_castle_s5_st3",
       "k": "step",
       "t": "Walk along the dragon's spine toward her head. Tulin's gust helps cover distance if you fall short on the glide.",
       "items": [
        {
         "name": "Tulin's Gust",
         "cat": "ability",
         "note": "Rito sage ability; a burst of wind that extends your glide to reach the dragon."
        }
       ]
      },
      {
       "id": "t_castle_s5_st4",
       "k": "reward",
       "t": "At the dragon's head, hold the interact button as she shakes to draw out the restored Master Sword, the Blade of Evil's Bane.",
       "items": [
        {
         "name": "Master Sword",
         "cat": "weapon",
         "note": "Legendary sword; never breaks, recharges after use, and doubles its power against Ganondorf and Phantom Ganon."
        }
       ]
      },
      {
       "id": "t_castle_s5_st5",
       "k": "tip",
       "t": "No safe landing spot? Stand on the dragon's broad back to refill stamina between attempts, then move up when your wheel is full.",
       "items": []
      },
      {
       "id": "t_castle_s5_st6",
       "k": "optional",
       "t": "While riding, harvest dragon parts. Touching the Light Dragon's scales, claws, fangs, or horn yields rare crafting materials.",
       "items": [
        {
         "name": "Light Dragon's Scale",
         "cat": "material",
         "note": "Rare fuse and upgrade material gathered by touching the dragon's body."
        }
       ]
      }
     ]
    },
    {
     "id": "t_castle_s6_depths",
     "name": "Preparing for the Depths",
     "sub": "Gear up before going underground",
     "reward": "A safer descent into the dark",
     "steps": [
      {
       "id": "t_castle_s6_st1",
       "k": "step",
       "t": "Find a chasm on the surface and drop in to enter the Depths, the pitch-black world layer beneath Hyrule.",
       "items": []
      },
      {
       "id": "t_castle_s6_st2",
       "k": "step",
       "t": "Activate Lightroots to light up areas and reveal the map. Each Lightroot sits directly below a surface shrine.",
       "items": [
        {
         "name": "Lightroot",
         "cat": "key",
         "note": "Glowing root that illuminates a chunk of the Depths and acts as a fast-travel point."
        }
       ]
      },
      {
       "id": "t_castle_s6_st3",
       "k": "tip",
       "t": "Stock Brightbloom Seeds. Throw them for light, or fuse them to arrows to scout ahead and reveal nearby Lightroots in the dark.",
       "items": [
        {
         "name": "Brightbloom Seed",
         "cat": "material",
         "note": "Glowing seed; throw or fuse to arrows to light the Depths."
        }
       ]
      },
      {
       "id": "t_castle_s6_st4",
       "k": "warn",
       "t": "Gloom covers much of the Depths floor and lowers your max hearts. Bring sundelion dishes to recover safely.",
       "items": []
      },
      {
       "id": "t_castle_s6_st5",
       "k": "tip",
       "t": "The Master Sword and gloom-resistant gear like the Depths armor sets make exploring far less punishing down there.",
       "items": []
      },
      {
       "id": "t_castle_s6_st6",
       "k": "tip",
       "t": "Use Autobuild to quickly rebuild light-rigged vehicles or bridges once you've collected Zonaite and schematics in the Depths.",
       "items": [
        {
         "name": "Autobuild",
         "cat": "ability",
         "note": "Recreates saved or recent builds, great for traversing the vast dark Depths."
        }
       ]
      }
     ]
    }
   ]
  },
  {
   "id": "t_depths",
   "name": "Imprisoning the Demon King",
   "sub": "Final descent beneath Hyrule Castle",
   "kind": "region",
   "champion": null,
   "tagline": "Plunge into the chasm below Hyrule Castle, fight through the Demon King's Army, and end the war with Ganondorf for good.",
   "sections": [
    {
     "id": "t_depths_s1_prep",
     "name": "Before You Drop In",
     "sub": "Get ready for the point of no return",
     "steps": [
      {
       "id": "t_depths_s1_warn_pnr",
       "k": "warn",
       "t": "Once you reach the final arena you cannot leave or warp out without reloading a save. Finish your prep beforehand."
      },
      {
       "id": "t_depths_s1_tip_save",
       "k": "tip",
       "t": "This quest is the endgame, not the end of the game. Beating it returns you to before the descent, so feel free to dive when ready."
      },
      {
       "id": "t_depths_s1_step_meals",
       "k": "step",
       "t": "Cook a stack of Sunny meals with Sundelions to recover hearts lost to Gloom, plus your best hearty or full-heal dishes.",
       "items": [
        {
         "name": "Sundelion",
         "cat": "material",
         "note": "Cook into Sunny dishes to restore Gloom-locked hearts during the fight."
        }
       ]
      },
      {
       "id": "t_depths_s1_step_armor",
       "k": "step",
       "t": "Equip Gloom-resist gear if you have it. The Depths armor set or Gloom-resist food eases the long descent through the chasm.",
       "items": [
        {
         "name": "Depths Armor Set",
         "cat": "armor",
         "note": "Optional. Reduces Gloom buildup while traversing the chasm; not required if you carry Sunny food."
        }
       ]
      },
      {
       "id": "t_depths_s1_step_master",
       "k": "step",
       "t": "Bring the Master Sword if you have it. You can still start the fight without it, but you will want it for the Demon Dragon finale.",
       "items": [
        {
         "name": "Master Sword",
         "cat": "weapon",
         "note": "Strongly recommended for the dragon. If missing, Zelda the Light Dragon delivers it before that phase."
        }
       ]
      },
      {
       "id": "t_depths_s1_step_arrows",
       "k": "step",
       "t": "Pack plenty of arrows plus Bomb Flowers, Puffshrooms, and tough Fuse materials. Stock shields and a few spare weapons too."
      }
     ]
    },
    {
     "id": "t_depths_s2_descent",
     "name": "Into the Chasm",
     "sub": "Descend beneath Hyrule Castle",
     "steps": [
      {
       "id": "t_depths_s2_step_chasm",
       "k": "step",
       "t": "Travel to Hyrule Castle and dive into the Hyrule Castle Chasm. Paraglide down into the dark and land safely in the Depths below."
      },
      {
       "id": "t_depths_s2_loot_lightroot",
       "k": "loot",
       "t": "Activate the Lightroot at the bottom to light the area and set a fast-travel point right at the start of the descent."
      },
      {
       "id": "t_depths_s2_step_path",
       "k": "step",
       "t": "Follow the path downward. Slip past Horriblins and Like Likes; you do not have to clear every enemy to keep moving."
      },
      {
       "id": "t_depths_s2_warn_lynel",
       "k": "warn",
       "t": "Lynels roam parts of the route. Fight one for great loot or sprint past to the next passage if you would rather save resources."
      },
      {
       "id": "t_depths_s2_step_chamber",
       "k": "step",
       "t": "Pass the Forgotten Foundation and the familiar opening-scene mural, then reach the Imprisoning Chamber where Ganondorf was sealed."
      },
      {
       "id": "t_depths_s2_step_dive",
       "k": "step",
       "t": "Blast open the path and dive off the platform into the hole below to fall into Gloom's Lair. A cutscene plays, then the gauntlet begins."
      }
     ]
    },
    {
     "id": "t_depths_s3_army",
     "name": "The Demon King's Army",
     "sub": "Survive the gauntlet of monsters",
     "reward": "The sages rejoin you for the battle",
     "steps": [
      {
       "id": "t_depths_s3_step_waves",
       "k": "step",
       "t": "Battle four waves of the army: a swarm of Bokoblins with a Boss Bokoblin, then Lizalfos, then Gibdos, and finally Moblins."
      },
      {
       "id": "t_depths_s3_tip_sages",
       "k": "tip",
       "t": "Any sages you have unlocked fight alongside you here. Stand near a sage and press the prompt to trigger their ability and thin the crowd fast."
      },
      {
       "id": "t_depths_s3_step_gibdo",
       "k": "step",
       "t": "Stun Gibdos with a Dazzlefruit blast, a Splash Fruit, or any elemental hit to break their armor, then strike while they are exposed."
      },
      {
       "id": "t_depths_s3_warn_gloom",
       "k": "warn",
       "t": "The floor pools with Gloom in spots. Avoid standing in it; eat a Sunny dish if your max hearts shrink too far."
      },
      {
       "id": "t_depths_s3_reward_clear",
       "k": "reward",
       "t": "Clear all the waves to trigger a cutscene. The sages pledge to fight with you, then Ganondorf rises for the final battle."
      }
     ]
    },
    {
     "id": "t_depths_s4_ganon1",
     "name": "Demon King Ganondorf: Phases 1 & 2",
     "sub": "Sword duel, then the Phantom Ganons",
     "steps": [
      {
       "id": "t_depths_s4_tip_master",
       "k": "tip",
       "t": "If you arrive without the Master Sword, a cutscene has Zelda the Light Dragon deliver it before the dragon phase. Having it early is easier."
      },
      {
       "id": "t_depths_s4_step_p1",
       "k": "step",
       "t": "Phase 1: Ganondorf cycles one-handed, two-handed, spear, and bow attacks. Watch his telegraphed swings, dodge late, and Flurry Rush for free hits."
      },
      {
       "id": "t_depths_s4_warn_gloomhit",
       "k": "warn",
       "t": "His attacks deal Gloom damage that locks off hearts. Keep distance, heal with Sunny food, and do not over-commit."
      },
      {
       "id": "t_depths_s4_step_p2",
       "k": "step",
       "t": "Phase 2: He summons five Phantom Ganon copies. Send your sages to occupy the phantoms while you focus the real Ganondorf."
      },
      {
       "id": "t_depths_s4_tip_recall",
       "k": "tip",
       "t": "When he hurls Gloom projectiles, use Recall to fling one straight back at him, opening a window to rush in and attack."
      },
      {
       "id": "t_depths_s4_step_absorb",
       "k": "step",
       "t": "At the halfway mark Ganondorf absorbs the phantoms and banishes your sages, ending the phase and starting the one-on-one fight."
      }
     ]
    },
    {
     "id": "t_depths_s5_ganon2",
     "name": "Demon King Ganondorf: Phase 3",
     "sub": "One-on-one with the secret stone",
     "steps": [
      {
       "id": "t_depths_s5_step_swallow",
       "k": "step",
       "t": "Ganondorf draws on his secret stone and powers up alone. His attacks shift to fast melee combos and Gloom magic AoE blasts."
      },
      {
       "id": "t_depths_s5_step_flurry",
       "k": "step",
       "t": "Keep dodging into Flurry Rushes; it is your safest damage. The Master Sword hits especially hard against the Demon King's power."
      },
      {
       "id": "t_depths_s5_warn_arms",
       "k": "warn",
       "t": "Beware his unblockable Gloom-hand grab and ground eruptions. Stay mobile and bait attacks rather than trading blows."
      },
      {
       "id": "t_depths_s5_step_defeat",
       "k": "step",
       "t": "Empty his health to trigger a long cutscene: Ganondorf swallows his secret stone whole and transforms into the Demon Dragon."
      }
     ]
    },
    {
     "id": "t_depths_s6_dragon",
     "name": "The Demon Dragon",
     "sub": "Aerial finale with the Light Dragon",
     "steps": [
      {
       "id": "t_depths_s6_step_skydive",
       "k": "step",
       "t": "You skydive onto the Demon Dragon's back. The Light Dragon, Zelda, soars beside you to carry you back up whenever you fall."
      },
      {
       "id": "t_depths_s6_warn_swordreq",
       "k": "warn",
       "t": "Use the Master Sword here; it deals huge bonus damage to the dragon's weak points and trivializes the phase. It is delivered now if you lacked it."
      },
      {
       "id": "t_depths_s6_step_blisters",
       "k": "step",
       "t": "Glide and run along the dragon, slashing the clusters of glowing demonic eyes set in the Gloom on its back and limbs until they are destroyed."
      },
      {
       "id": "t_depths_s6_step_head",
       "k": "step",
       "t": "With the back weak points cleared, climb to the head and strike the secret stone glowing on the dragon's forehead."
      },
      {
       "id": "t_depths_s6_tip_dive",
       "k": "tip",
       "t": "Dive-attack the eyes and the head stone for big damage, or fire arrows mid-dive, then glide back up as the dragon recovers. Repeat the cycle."
      },
      {
       "id": "t_depths_s6_reward_win",
       "k": "reward",
       "t": "Shatter the forehead secret stone to defeat the Demon King for good and trigger the ending. The war for Hyrule is over."
      }
     ]
    },
    {
     "id": "t_depths_s7_ending",
     "name": "The Ending",
     "sub": "Zelda returned, Hyrule at peace",
     "steps": [
      {
       "id": "t_depths_s7_step_fall",
       "k": "step",
       "t": "As they fall through the sky, Link reaches out and catches Zelda mid-air. The two reunite as the dragons fade."
      },
      {
       "id": "t_depths_s7_step_restore",
       "k": "step",
       "t": "Channeling Rauru and Sonia's power through his arm, Link recalls Zelda's true form, restoring her from dragon to human despite the supposedly irreversible change."
      },
      {
       "id": "t_depths_s7_tip_credits",
       "k": "tip",
       "t": "Enjoy the credits and the reunion with Purah, the sages, and your friends. Hyrule begins to rebuild in peace."
      },
      {
       "id": "t_depths_s7_tip_postgame",
       "k": "tip",
       "t": "After the credits roll, your save loads back to just before the final dive, with a star marking your completed playthrough."
      },
      {
       "id": "t_depths_s7_optional_cleanup",
       "k": "optional",
       "t": "Return to the world to finish shrines, Lightroots, side quests, the Master Kohga arc, and the rest of the map at your pace."
      }
     ]
    }
   ]
  }
 ],
 "SHRINES": [
  {
   "regionKey": "great_sky_island",
   "regionName": "Great Sky Island",
   "shrines": [
    {
     "name": "Ukouh Shrine",
     "location": "Southwest of the Temple of Time, just past the first pond at the start of the game.",
     "category": "puzzle",
     "oneLine": "Grants Ultrahand. Build a bridge across the gap, then attach a hook to a plank and ride it along the rail to reach the exit.",
     "shrineQuest": null
    },
    {
     "name": "In-isa Shrine",
     "location": "West side of the island, south across the frozen lake near a stone ruin and the In-isa cold cave.",
     "category": "puzzle",
     "oneLine": "Grants Fuse. Fuse a rock to your sword, fire fruit to arrows, and a rock to your shield to clear the rooms, then beat the Construct.",
     "shrineQuest": null
    },
    {
     "name": "Gutanbac Shrine",
     "location": "Snowy peak in the island's upper northwest area, reached by climbing up through the cold caves.",
     "category": "puzzle",
     "oneLine": "Grants Ascend. Ascend through ceilings to bypass obstacles, including rising through a moving spike door, then defeat the Construct.",
     "shrineQuest": null
    },
    {
     "name": "Nachoyah Shrine",
     "location": "Near the Temple of Time; unlocks after the first three shrines and getting Recall at the Temple of Time.",
     "category": "puzzle",
     "oneLine": "Practice Recall. Rewind water-borne planks and waterwheels to cross, rewind a cogwheel to climb to a chest, then stack and rewind the clock hands to open the exit.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "central",
   "regionName": "Central Hyrule",
   "shrines": [
    {
     "name": "Kyononis Shrine",
     "location": "Hyrule Castle Town Ruins central square, north of Lookout Landing",
     "category": "combat",
     "oneLine": "Combat Training: a training Construct teaches side hop, backflip, perfect guard (parry) and charged attacks; clear the drills to finish.",
     "shrineQuest": null
    },
    {
     "name": "Yamiyo Shrine",
     "location": "Romani Plains, east of Hyrule Castle Town Ruins, northeast of Lookout Landing",
     "category": "combat",
     "oneLine": "Combat Training: Throwing - learn to throw materials and fused weapons as projectiles, then defeat the Constructs to pass.",
     "shrineQuest": null
    },
    {
     "name": "Teniten Shrine",
     "location": "South of Lookout Landing near Lake Kolomo, Hyrule Field",
     "category": "combat",
     "oneLine": "Combat Training: Throwing - ZL-target and throw weapons to hit out-of-reach Constructs; aim carefully to clear the room.",
     "shrineQuest": null
    },
    {
     "name": "Kamizun Shrine",
     "location": "West of East Post Ruins, southern Hyrule Field",
     "category": "combat",
     "oneLine": "Proving Grounds: Beginner - stripped of gear, grab only the weapons in the arena; fuse a spiked ball and defeat every enemy to pass.",
     "shrineQuest": null
    },
    {
     "name": "Jojon Shrine",
     "location": "Crenel Peak Cave, east of Lookout Landing across the river, Hyrule Field",
     "category": "combat",
     "oneLine": "Proving Grounds: Rotation - enter with no gear; dodge the rotating flame emitters and use arena weapons to defeat all enemies.",
     "shrineQuest": null
    },
    {
     "name": "Ishodag Shrine",
     "location": "Rocky hill west of Hyrule Castle Town Ruins, Hyrule Field",
     "category": "puzzle",
     "oneLine": "An Uplifting Device: attach Zonai fans/lift devices with Ultrahand to raise platforms and carry yourself up to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Sinakawak Shrine",
     "location": "Near New Serenne Stable, northwest Hyrule Field",
     "category": "puzzle",
     "oneLine": "An Uplifting Device: build with fans and platforms so a lifting rig rises high enough to reach the upper ledge.",
     "shrineQuest": null
    },
    {
     "name": "Jiosin Shrine",
     "location": "South of Lookout Landing, beside the Hyrule Field Chasm",
     "category": "puzzle",
     "oneLine": "Shape Rotation: rotate the irregular stone blocks with Ultrahand so they pass through the matching symbol-shaped holes.",
     "shrineQuest": null
    },
    {
     "name": "Susuyai Shrine",
     "location": "Passeri Greenbelt, southwest of Lookout Landing, Hyrule Field",
     "category": "puzzle",
     "oneLine": "A Spinning Device: use Zonai small wheels to power and time the spinning carts so they carry you across to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Mayachin Shrine",
     "location": "North of Hyrule Field Skyview Tower, next to Exchange Ruins, Hyrule Field",
     "category": "puzzle",
     "oneLine": "A Fixed Device: anchor and arrange Zonai devices so a fixed mechanism moves you or objects to open the path.",
     "shrineQuest": null
    },
    {
     "name": "Tajikats Shrine",
     "location": "Near Riverside Stable, south of Lookout Landing, Hyrule Field",
     "category": "puzzle",
     "oneLine": "Building With Logs: use Ultrahand to assemble logs into a bridge or raft to cross the water and reach the altar.",
     "shrineQuest": null
    },
    {
     "name": "Kyokugon Shrine",
     "location": "Great Plateau foothill, southwest Hyrule Field",
     "category": "puzzle",
     "oneLine": "Alignment of the Circles: rotate and line up the circular gears/discs with Ultrahand so the mechanism unlocks the way forward.",
     "shrineQuest": null
    },
    {
     "name": "Tsutsu-um Shrine",
     "location": "South of Outskirts Stable, southwest Hyrule Field",
     "category": "puzzle",
     "oneLine": "The Stakes Guide You: drive and use the protruding stakes as steps and anchors to climb and reach the exit.",
     "shrineQuest": null
    },
    {
     "name": "Riogok Shrine",
     "location": "East of Hyrule Field Mini Stable, west of Hopper Pond, Hyrule Field",
     "category": "puzzle",
     "oneLine": "Force Transfer: route Zonai energy/motion through connected devices so the transferred force opens the gates.",
     "shrineQuest": null
    },
    {
     "name": "Tadarok Shrine",
     "location": "Waterfall cave near the River of the Dead, southwest Hyrule Field",
     "category": "puzzle",
     "oneLine": "Fire and Water: use flame and water elements together (melt ice / douse fire) to clear the path and finish.",
     "shrineQuest": null
    },
    {
     "name": "Serutabomac Shrine",
     "location": "Floating island behind/northeast of Hyrule Castle (reached from the castle)",
     "category": "puzzle",
     "oneLine": "The Way Up: build and stack Zonai devices to ascend the vertical chamber and reach the altar at the top.",
     "shrineQuest": null
    },
    {
     "name": "Sepapa Shrine",
     "location": "Small land between Hyrule Castle and Crenel Hills, north-northeast Central Hyrule",
     "category": "puzzle",
     "oneLine": "Backtrack: use Recall to send moving objects (gears, platforms, debris) back through time and ride them to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Ren-iz Shrine",
     "location": "Carved tree at Crenel Hills, northern Hyrule Field",
     "category": "puzzle",
     "oneLine": "Jump the Gaps: time jumps and glides across moving/disappearing platforms to cross the chasms to the altar.",
     "shrineQuest": null
    },
    {
     "name": "Tenmaten Shrine",
     "location": "drop in, light the cavern with Brightbloom seeds, grab the chest and blessing.",
     "category": "blessing",
     "oneLine": "Rauru's Blessing inside Elma Knolls Well in Hyrule Field — drop in, light the cavern with Brightbloom seeds, grab the chest and blessing.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "necluda",
   "regionName": "Necluda",
   "shrines": [
    {
     "name": "Makasura Shrine",
     "location": "West Necluda, on a cliff just west/southwest above Kakariko Village; NE of Sahasra Slope Skyview Tower.",
     "category": "puzzle",
     "oneLine": "Use Ascend through the rock ceilings and ride the stone platforms up; cross the gaps to reach the exit.",
     "shrineQuest": null
    },
    {
     "name": "Joju-u-u Shrine",
     "location": "West Necluda, Ubota Point south of Lakeside Stable, above the cliffs by Lake Floria.",
     "category": "puzzle",
     "oneLine": "Building Bridges: use Ultrahand to drape the hinged bridge over the post and add the stone box as a counterweight.",
     "shrineQuest": null
    },
    {
     "name": "Jochisiu Shrine",
     "location": "West Necluda, west side of South Dueling Peaks by Squabble River.",
     "category": "puzzle",
     "oneLine": "Keys Born of Water quest: use the fire and ice emitters to melt/freeze ice and clear the path, then enter.",
     "shrineQuest": "Keys Born of Water"
    },
    {
     "name": "Eshos Shrine",
     "location": "West Necluda, on the eastern cliff of Dueling Peaks.",
     "category": "combat",
     "oneLine": "Combat Training: Shields. Parry the Training Constructs' attacks; use a non-metallic shield against the electric one.",
     "shrineQuest": null
    },
    {
     "name": "Susub Shrine",
     "location": "West Necluda, inside Deya Village Ruins East Well, south of Deya Village Ruins.",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: no puzzle. Drop into the well and reach the shrine; grab the chest and the Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Utojis Shrine",
     "location": "West Necluda, inside Tobio's Hollow Cave.",
     "category": "puzzle",
     "oneLine": "Legend of the Soaring Spear: fuse a Keese Wing to a spear, stand on the glowing pedestal and throw it through the ring.",
     "shrineQuest": "Legend of the Soaring Spear"
    },
    {
     "name": "Tokiy Shrine",
     "location": "East Necluda, inside Oakle's Navel Cave (north of Rabella Wetlands Skyview Tower).",
     "category": "blessing",
     "oneLine": "The Oakle's Navel Cave Crystal: carry the crystal past falling boulders (Recall the big one) to its stand to reveal it.",
     "shrineQuest": "The Oakle's Navel Cave Crystal"
    },
    {
     "name": "Zanmik Shrine",
     "location": "East Necluda, on a hill southwest of Hateno Village.",
     "category": "puzzle",
     "oneLine": "Scoop it Out: Ultrahand four plates into a box, attach it to the wheel as a scoop, then plate the nodes to power it.",
     "shrineQuest": null
    },
    {
     "name": "Mayahisik Shrine",
     "location": "East Necluda, inside Retsam Forest Cave near the Hateno Ancient Tech Lab.",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: no puzzle. Enter the cave, break the rocks and follow the path to the shrine for the Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Anedamimik Shrine",
     "location": "East Necluda, inside Deepback Bay Cave, east of Hateno Village.",
     "category": "puzzle",
     "oneLine": "A Retraced Path: ride the moving platform across, then use Recall on the rolling ball to send it into the receptacle.",
     "shrineQuest": null
    },
    {
     "name": "Bamitok Shrine",
     "location": "East Necluda, inside Mount Dunsel Cave near Lurelin Village.",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: no puzzle. Swim across, lift the plank and Ascend up to reach the shrine and Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Sifumim Shrine",
     "location": "East Necluda, on a hill just northwest of Lurelin Village.",
     "category": "combat",
     "oneLine": "Proving Grounds: Flow. Weapons removed. Knock the Soldier Constructs off the rotating platforms into the water.",
     "shrineQuest": null
    },
    {
     "name": "Marari-In Shrine",
     "location": "Necluda Sea, on Eventide Island via the sea cave entrance (far southeast).",
     "category": "puzzle",
     "oneLine": "Solve the puzzle inside the Eventide cave to reveal it; reach it by raft/boat or paraglide from the Hateno coast.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "lanayru",
   "regionName": "Lanayru",
   "shrines": [
    {
     "name": "Tukarok Shrine",
     "location": "Lanayru Wetlands, just south of Wetland Stable",
     "category": "puzzle",
     "oneLine": "Forward Force. Stick the ball to a wheeled cart and ride it across lava, then build a paddle raft to ferry the ball to the altar.",
     "shrineQuest": null
    },
    {
     "name": "Morok Shrine",
     "location": "Lanayru Wetlands, atop a floating island near Sahasra Slope, northwest of Sahasra Slope Skyview Tower",
     "category": "puzzle",
     "oneLine": "A Bouncy Device. Stack and fuse the Zonai springs, then activate them to launch yourself up to the chest and the altar.",
     "shrineQuest": null
    },
    {
     "name": "Jonsau Shrine",
     "location": "Lanayru Wetlands, on the southern hills of Mercay Island near the center of the Wetlands",
     "category": "puzzle",
     "oneLine": "Deep Force. Ultrahand the ball under the target and push it deep underwater so it rockets up and strikes the switch.",
     "shrineQuest": null
    },
    {
     "name": "Maoikes Shrine",
     "location": "Lanayru Wetlands, inside Bone Pond Cave (drop in through the skull on the hilltop)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. No puzzle inside; just reach it through the cave, grab the chest, and touch the altar.",
     "shrineQuest": null
    },
    {
     "name": "Mogawak Shrine",
     "location": "Lanayru Great Spring, below the walkways of Zora's Domain beneath the Great Zora Bridge",
     "category": "puzzle",
     "oneLine": "The Power of Water. Charge the battery with the waterfall's hydro power to run the elevator up to the altar.",
     "shrineQuest": null
    },
    {
     "name": "Ihen-a Shrine",
     "location": "Lanayru Great Spring, Mipha Court atop Ploymus Mountain, east of Zora's Domain",
     "category": "puzzle",
     "oneLine": "Midair Perch. Splash-arrow the gooped entrance, then Ascend up a Hover Stone and lay the bridge as a ramp to cross the gaps.",
     "shrineQuest": null
    },
    {
     "name": "Apogek Shrine",
     "location": "Lanayru Great Spring, southeast of East Reservoir Lake near Zora's Domain",
     "category": "puzzle",
     "oneLine": "Wings on the Wind. Fuse a fan to a Zonai wing, set it on the rail, then ride it across the room to the altar.",
     "shrineQuest": null
    },
    {
     "name": "Yomizuk Shrine",
     "location": "Lanayru Great Spring, inside Tarm Point Cave, north of Tarm Point",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. No puzzle; find it through the cave, open the chest, and touch the altar for the Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Joniu Shrine",
     "location": "Lanayru Great Spring, inside Ralis Channel, northwest of Veiled Falls",
     "category": "blessing",
     "oneLine": "Rauru's Blessing, unlocked via a shrine quest. Toss a Brightbloom Seed to light the dark channel and follow the right path in.",
     "shrineQuest": "The Ralis Channel Crystal"
    },
    {
     "name": "Kurakat Shrine",
     "location": "Lanayru Great Spring, northwest of Quatta's Shelf",
     "category": "blessing",
     "oneLine": "Rauru's Blessing behind a dyeing riddle: read the clue, dye your armor the right color at Hateno, then claim the chest and altar.",
     "shrineQuest": "Dyeing to Find It"
    },
    {
     "name": "O-ogim Shrine",
     "location": "Lanayru Great Spring, south of Lanayru Heights below the broken Lanayru Bridge",
     "category": "blessing",
     "oneLine": "Rauru's Blessing reward for a shrine quest; deliver the crystal to make the shrine appear, then take the chest and altar.",
     "shrineQuest": "The Lanayru Road Crystal"
    },
    {
     "name": "Jikais Shrine",
     "location": "Mount Lanayru, east of the Lanayru Range beyond Madorna Mountain",
     "category": "puzzle",
     "oneLine": "Jailbreak. Use Ultrahand to stack and move blocks, then Ascend up through them to reach the altar.",
     "shrineQuest": null
    },
    {
     "name": "Zakusu Shrine",
     "location": "Mount Lanayru, Naydra Snowfield, southwest of Mount Lanayru Skyview Tower",
     "category": "combat",
     "oneLine": "Proving Grounds: Ascension. Stripped of gear, use only the shrine's weapons and Ascend to beat the foes; gated behind a shrine quest.",
     "shrineQuest": "The High Spring and the Light Rings"
    },
    {
     "name": "Jogou Shrine",
     "location": "Mount Lanayru, inside Lanayru Road East Cave on the northwest slopes (below the Lanayru Road East Gate)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. No puzzle inside; just find it within the cave and touch the altar for the Light of Blessing.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "faron",
   "regionName": "Faron",
   "shrines": [
    {
     "name": "En-oma Shrine",
     "location": "Lake Hylia Whirlpool Cave, beneath Lake Hylia (approx 0105, -2514, 0088); enter by letting the visible whirlpool suck Link down",
     "category": "blessing",
     "oneLine": "No trial inside; reward for The Lake Hylia Crystal quest. Grab the crystal on the sky island above the whirlpool and drop it into the hole below.",
     "shrineQuest": "The Lake Hylia Crystal"
    },
    {
     "name": "Ishokin Shrine",
     "location": "Faron Grasslands near Zokassa Ridge, east of Oseira Plains (approx -0565, -3524, 0129)",
     "category": "blessing",
     "oneLine": "No trial inside; appears after Ride the Giant Horse. Tame the Giant White Stallion in the nearby grove and show it to Baddek for the crystal.",
     "shrineQuest": "Ride the Giant Horse"
    },
    {
     "name": "Jiukoum Shrine",
     "location": "Faron Grasslands, south side of Popla Foothills overlooking Dracozu Lake, SE of Popla Foothills Skyview Tower (approx 0867, -2279, 0141)",
     "category": "puzzle",
     "oneLine": "Built for Rails: use Ultrahand to join the boards into a stable platform, set it on the rails, and ride it across each gap to the altar.",
     "shrineQuest": null
    },
    {
     "name": "Utsushok Shrine",
     "location": "Faron Grasslands, northeast of Highland Stable, east of Fural Plain atop a hill (approx 0668, -3358, 0072)",
     "category": "puzzle",
     "oneLine": "Long or Wide: with Ultrahand add length or weight to the paddle to knock balls into switches, then ride the spawned cart along the rails.",
     "shrineQuest": null
    },
    {
     "name": "Ekochiu Shrine",
     "location": "Rise and Fall: ride rising/falling platforms and time Ultrahand to cross. North ",
     "category": "puzzle",
     "oneLine": "Rise and Fall: ride rising/falling platforms and time Ultrahand to cross. North of Woodland Stable, Great Hyrule Forest.",
     "shrineQuest": null
    },
    {
     "name": "Kikakin Shrine",
     "location": "Shining in Darkness: cross a pitch-black shrine using light orbs / Brightbloom s",
     "category": "puzzle",
     "oneLine": "Shining in Darkness: cross a pitch-black shrine using light orbs / Brightbloom seeds. NE of Mount Drena, west Great Hyrule Forest.",
     "shrineQuest": null
    },
    {
     "name": "Kiuyoyou Shrine",
     "location": "Fire and Ice: melt and freeze ice blocks with flame and Zonai devices to align p",
     "category": "puzzle",
     "oneLine": "Fire and Ice: melt and freeze ice blocks with flame and Zonai devices to align platforms. Rowan Plain, east of the Forgotten Temple.",
     "shrineQuest": null
    },
    {
     "name": "Musanokir Shrine",
     "location": "Swing to Hit: build a weighted pendulum with Ultrahand to smash targets and ball",
     "category": "puzzle",
     "oneLine": "Swing to Hit: build a weighted pendulum with Ultrahand to smash targets and balls into goals. Within Korok Forest.",
     "shrineQuest": null
    },
    {
     "name": "Ninjis Shrine",
     "location": "appears after the 'Maca's Special Place' quest (post-Phantom Ganon). South edge ",
     "category": "blessing",
     "oneLine": "Rauru's Blessing — appears after the 'Maca's Special Place' quest (post-Phantom Ganon). South edge of Korok Forest; collect the blessing.",
     "shrineQuest": "Maca's Special Place"
    },
    {
     "name": "Pupunke Shrine",
     "location": "Quest-gated blessing: finish 'A Pretty Stone and Five Golden Apples' (give a lum",
     "category": "quest",
     "oneLine": "Quest-gated blessing: finish 'A Pretty Stone and Five Golden Apples' (give a luminous stone + 5 golden apples), then walk in.",
     "shrineQuest": "A Pretty Stone and Five Golden Apples"
    },
    {
     "name": "Sakunbomar Shrine",
     "location": "Quest-gated blessing: complete 'None Shall Pass' in Great Hyrule Forest, then fo",
     "category": "quest",
     "oneLine": "Quest-gated blessing: complete 'None Shall Pass' in Great Hyrule Forest, then follow the light beam to the shrine.",
     "shrineQuest": "None Shall Pass"
    }
   ]
  },
  {
   "regionKey": "gerudo",
   "regionName": "Gerudo",
   "shrines": [
    {
     "name": "Kudanisar Shrine",
     "location": "Gerudo Desert, west of Gerudo Town near the Statue of the Eighth Heroine",
     "category": "puzzle",
     "oneLine": "Bridging the Sands: use Ultrahand to build wooden bridges and a fan-cart to cross the stamina-draining quicksand to the altar.",
     "shrineQuest": null
    },
    {
     "name": "Mayatat Shrine",
     "location": "Gerudo Desert, southwest of Gerudo Desert Gateway near Kara Kara Bazaar",
     "category": "puzzle",
     "oneLine": "A Sliding Device: hop onto one of the descending sleds, then use Recall to ride it back up across the quicksand to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Soryotanog Shrine",
     "location": "Gerudo Desert, high on the cliffs directly above Gerudo Town",
     "category": "puzzle",
     "oneLine": "Buried Light: turn on a fan with Ultrahand to blow away the sand, then guide the light beam to the crystal to open the way.",
     "shrineQuest": null
    },
    {
     "name": "Siwakama Shrine",
     "location": "Gerudo Desert, north of the East Barrens",
     "category": "puzzle",
     "oneLine": "Moving the Spheres: Ultrahand the big balls to bridge the gaps, then use Recall to ride a returning sphere across to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Chichim Shrine",
     "location": "Gerudo Desert, inside the Ancient Prison Ruins reached by sinking through the quicksand at Palu Wasteland east of Gerudo Town",
     "category": "puzzle",
     "oneLine": "Drop into the Ancient Prison Ruins via the sinkhole, flip the Ultrahand switches and dodge Gibdos, then clear the shrine inside.",
     "shrineQuest": null
    },
    {
     "name": "Karahatag Shrine",
     "location": "Gerudo Desert, south of the Southern Oasis",
     "category": "puzzle",
     "oneLine": "Drifting Flame: lift a lit brazier high with Ultrahand, hit Recall so it hangs, then run to light the inverted ceiling pillars.",
     "shrineQuest": null
    },
    {
     "name": "Irasak Shrine",
     "location": "Gerudo Desert, south of Arbiter's Grounds",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: no trial inside. Just reach it across the desert, open the chest, and claim the Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Miryotanog Shrine",
     "location": "Gerudo Desert, south of Toruma Dunes, east of Gerudo Town and north of the Lightning Temple",
     "category": "combat",
     "oneLine": "Proving Grounds: Lure. Stripped of gear, grab the local weapons and lure the five constructs into the rolling-boulder traps.",
     "shrineQuest": null
    },
    {
     "name": "Motsusis Shrine",
     "location": "Gerudo Desert, hidden inside the South Lomei Labyrinth maze southeast of the desert",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: the only challenge is reaching it. Solve the South Lomei Labyrinth maze, then claim the free Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Rakakudaj Shrine",
     "location": "Gerudo Highlands, along the Gerudo Canyon Path near Gerudo Canyon Stable",
     "category": "blessing",
     "oneLine": "Rauru's Blessing unlocked by The Gerudo Canyon Crystal quest: deliver the crystal along the path to make the shrine appear.",
     "shrineQuest": "The Gerudo Canyon Crystal"
    },
    {
     "name": "Turakamik Shrine",
     "location": "Gerudo Highlands, north of Gerudo Canyon Mine, east of Gerudo Canyon Stable",
     "category": "puzzle",
     "oneLine": "Hidden Metal: use Ultrahand to clink the electrified metal balls onto the others, sending current through gears to open the gates.",
     "shrineQuest": null
    },
    {
     "name": "Kitawak Shrine",
     "location": "Gerudo Highlands area, on the East Gerudo Mesa ridge that separates the desert from Faron",
     "category": "puzzle",
     "oneLine": "Upward and Forward: Ultrahand planks onto the raised bridges to lower them, then use the gears and catapults to launch upward.",
     "shrineQuest": null
    },
    {
     "name": "Otutsum Shrine",
     "location": "Gerudo Highlands, in the north of Risoka Snowfield, far northeast of Gerudo Highlands Skyview Tower",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: no trial. Brave the cold snowfield to reach it, then grab the Light of Blessing and the chest inside.",
     "shrineQuest": null
    },
    {
     "name": "Mayamats Shrine",
     "location": "Gerudo Highlands, southeast of Gerudo Highlands Skyview Tower",
     "category": "puzzle",
     "oneLine": "A Route for a Ball: build a track with Ultrahand and use Ascend, then roll the correct ball into the floor socket by the gate.",
     "shrineQuest": null
    },
    {
     "name": "Suariwak Shrine",
     "location": "Gerudo Highlands, inside Taafei Hill Cave (the Yiga Blademaster Station) northeast of Gerudo Canyon Stable",
     "category": "blessing",
     "oneLine": "Rauru's Blessing with no puzzle, but the door stays locked until you pass The Yiga Clan Exam side quest in Yiga disguise.",
     "shrineQuest": "The Yiga Clan Exam"
    },
    {
     "name": "Rotsumamu Shrine",
     "location": "Gerudo Highlands, in a gully between Vatorsa Snowfield and Sapphia's Table beside a Depths chasm",
     "category": "puzzle",
     "oneLine": "A Balanced Plan: attach heavy weights to the seesaws with Ultrahand to balance and ride them up, or shortcut with Recall.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "ridgeland",
   "regionName": "Hyrule Ridge",
   "shrines": [
    {
     "name": "Makurukis Shrine",
     "location": "Hyrule Ridge Surface, north of Tabantha Bridge Stable on a ledge of Mount Rhoam (approx -2847, 0630, 0233).",
     "category": "combat",
     "oneLine": "Combat Training: Archery. Grab the bow by the door and headshot each construct. For the trio, Ascend a side pillar and shoot in bullet time as you fall.",
     "shrineQuest": null
    },
    {
     "name": "Runakit Shrine",
     "location": "Hyrule Ridge Surface, west of Lindor's Brow Skyview Tower between Upland Lindor and Mount Rhoam (approx -2531, 1170, 0178).",
     "category": "puzzle",
     "oneLine": "Built to Carry. Use Ultrahand to attach stone cylinders or slabs to the orb so it rolls down the rails, then drop it into the floor switch to open the bars.",
     "shrineQuest": null
    },
    {
     "name": "Sonapan Shrine",
     "location": "Hyrule Ridge Surface, on the eastern cliff of Satori Mountain, southwest of Lookout Landing (approx -1921, 0357, 0228).",
     "category": "puzzle",
     "oneLine": "Missing Pathways. Use Ascend on overhangs and slide the stone bricks to build paths across the gaps, repositioning blocks to reach each higher ledge.",
     "shrineQuest": null
    },
    {
     "name": "Taki-ihaban Shrine",
     "location": "Hyrule Ridge Surface, inside Lindor's Brow Cave just east of Lindor's Brow Skyview Tower (approx -1829, 1149, 0147).",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. No puzzle inside; the cave is the trial. Gloom Hands lurk at the platform base, so sprint past and climb up to claim the Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Usazum Shrine",
     "location": "Hyrule Ridge Surface, just south of Satori Mountain Foothill Cave at the foot of Satori Mountain (approx -2139, -0874, 0093).",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Activate the shrine; its green beam points to the cave. Take the crystal from the Hinox inside, then carry it back to the shrine to claim the blessing.",
     "shrineQuest": "The Satori Mountain Crystal"
    }
   ]
  },
  {
   "regionKey": "tabantha",
   "regionName": "Tabantha",
   "shrines": [
    {
     "name": "Gasas Shrine",
     "location": "Southwest of Tanagar Canyon, in the far southwest corner of Tabantha Frontier (approx -4153, 0098, 0055).",
     "category": "puzzle",
     "oneLine": "Well-Timed Cuts: cut the rope to drop the big cube onto the ramp with an overhang, then Ascend up through it to cross the gap.",
     "shrineQuest": null
    },
    {
     "name": "Gatakis Shrine",
     "location": "North of Rospro Pass Skyview Tower; launch from the tower and glide north to reach it (approx -3652, 1806, 0168).",
     "category": "puzzle",
     "oneLine": "Ride the Winds: glide on the updrafts, weave through the laser gaps, and open your paraglider in the gusts to rise to each exit.",
     "shrineQuest": null
    },
    {
     "name": "Ikatak Shrine",
     "location": "Southwestern Tabantha Frontier, just above Gisa Crater south of Rito Village (approx -3950, 1138, 0112).",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: no puzzle inside. Appears after the shrine quest. Open the chest and touch the altar for the Light of Blessing.",
     "shrineQuest": "The Gisa Crater Crystal"
    },
    {
     "name": "Iun-orok Shrine",
     "location": "Underground inside Tanagar Canyon West Cave, in the valley below the canyon (approx -3539, 0851, -0119).",
     "category": "puzzle",
     "oneLine": "The Right Roll: glue only TWO balls together (not three) so the orb rolls straight down the ramp and lands on the target.",
     "shrineQuest": null
    },
    {
     "name": "Mayausiy Shrine",
     "location": "Deep inside the Forgotten Temple, north of Tanagar Canyon near Lindor's Brow (approx -1165, 2602, -0083).",
     "category": "puzzle",
     "oneLine": "Building Blocks: use Ultrahand to grab and rotate the loose L-pieces so the incomplete square matches the finished model beside it.",
     "shrineQuest": null
    },
    {
     "name": "Nouda Shrine",
     "location": "Inside Kopeeki Drifts Cave; ride a horse from Snowfield Stable to reach the snowy cave entrance (approx -2319, 2200, 0173).",
     "category": "combat",
     "oneLine": "Proving Grounds: Intermediate. Stripped of your gear, grab the supplied weapons, fuse enemy parts onto them, and Ascend up to clear each tier.",
     "shrineQuest": null
    },
    {
     "name": "Oromuwak Shrine",
     "location": "On a mountaintop southeast of the Lucky Clover Gazette, near Brightcap Cave (approx -3079, 1617, 0243).",
     "category": "puzzle",
     "oneLine": "A Launching Device: fuse a Rocket to a minecart, point it up the rails, hop in and ignite it to ride up to the next area.",
     "shrineQuest": null
    },
    {
     "name": "Turakawak Shrine",
     "location": "Northern Tabantha Frontier near Tabantha Hills, at the region's north edge (approx -3497, -0197, 0066).",
     "category": "puzzle",
     "oneLine": "Stacking a Path: use Ultrahand to stack the climbable blocks into a tower against each ledge, then climb to reach the ladder and exit.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "hebra",
   "regionName": "Hebra",
   "shrines": [
    {
     "name": "Eutoum Shrine",
     "location": "Hebra Mountains (Surface), inside Goflam's Secret Hot Spring, northern Hebra Mountains",
     "category": "combat",
     "oneLine": "Proving Grounds: Infiltration. You start stripped of gear, so grab the weapons by the entrance, then sneak or fight past the Soldier Constructs.",
     "shrineQuest": null
    },
    {
     "name": "Mayaotaki Shrine",
     "location": "Hebra Mountains (Surface), at the center of North Lomei Labyrinth in North Tabantha Snowfield",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Solving the North Lomei Labyrinth maze to reach it is the trial; the shrine itself has no inner puzzle.",
     "shrineQuest": null
    },
    {
     "name": "Orochium Shrine",
     "location": "Hebra Mountains (Surface), near Snowfield Stable in South Tabantha Snowfield, northwest of the Forgotten Temple",
     "category": "puzzle",
     "oneLine": "Courage to Fall. Step off the edge and ride the rising gusts of wind to drift safely down onto the lower platforms toward the exit.",
     "shrineQuest": null
    },
    {
     "name": "Oshozan-u Shrine",
     "location": "Hebra Mountains (Surface), atop an icy hill west of North Lomei Labyrinth",
     "category": "puzzle",
     "oneLine": "Mallet Smash. Wield the big hammer with Ultrahand to smash blocks and pound the switches that open the way forward.",
     "shrineQuest": null
    },
    {
     "name": "Otak Shrine",
     "location": "Hebra Mountains (Surface), inside Icefall Foothills Cave (melt the ice blocking the entrance with fire)",
     "category": "combat",
     "oneLine": "Proving Grounds: Traps. You start weaponless, so use the provided gear to fight Constructs while dodging the spike and floor traps.",
     "shrineQuest": null
    },
    {
     "name": "Rutafu-um Shrine",
     "location": "Hebra Mountains (Surface), inside Hebra Mountains Northwest Cave, northwest of Hebra East Summit",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Do The Northwest Hebra Cave Crystal quest: carry the crystal through the cave to its pedestal to spawn the shrine.",
     "shrineQuest": "The Northwest Hebra Cave Crystal"
    },
    {
     "name": "Sahirow Shrine",
     "location": "Hebra Mountains (Surface), atop Corvash Peak, east of Rospro Pass Skyview Tower, north of Rito Village",
     "category": "puzzle",
     "oneLine": "Aid from Above. Use Ascend to phase up through the ceilings, rising past the laser nets to reach each higher level and the exit.",
     "shrineQuest": null
    },
    {
     "name": "Sisuran Shrine",
     "location": "Hebra Mountains (Surface), northwest of Pikida Stonegrove Skyview Tower, northeast of Hebra East Summit",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Do The North Hebra Mountains Crystal quest: beat the Frost Talus (Fire Arrows or Yunobo) and haul its crystal to the pedestal.",
     "shrineQuest": "The North Hebra Mountains Crystal"
    },
    {
     "name": "Tauyosipun Shrine",
     "location": "Hebra Mountains (Surface), on the western slopes southwest of Hebra West Summit",
     "category": "puzzle",
     "oneLine": "Forward or Backward? Use Recall to reverse moving platforms and rails so they carry you the direction you actually need to go.",
     "shrineQuest": null
    },
    {
     "name": "Wao-os Shrine",
     "location": "Hebra Mountains (Surface), inside West Lake Totori Cave, west of Rito Village",
     "category": "puzzle",
     "oneLine": "Lever Power. Use Ultrahand with the lever-arm contraptions to apply force, swinging platforms or launching yourself across the gaps.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "eldin",
   "regionName": "Eldin",
   "shrines": [
    {
     "name": "Sikukuu Shrine",
     "location": "Eldin Mountains, southeast of Thyphlo Ruins (0696, 2792, 0225)",
     "category": "puzzle",
     "oneLine": "Spinning Gears: use Recall to reverse the big gears so platforms carry you upward, riding them to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Marakuguc Shrine",
     "location": "Eldin Canyon, on a cliff above Goron City (1761, 2508, 0437)",
     "category": "puzzle",
     "oneLine": "Wheeled Wonders: Ultrahand the two wheeled carts together, ride your build, and strike the wheels to roll across the lava.",
     "shrineQuest": null
    },
    {
     "name": "Timawak Shrine",
     "location": "Eldin Canyon, overlooking Bedrock Bistro (1798, 1635, 0311)",
     "category": "puzzle",
     "oneLine": "Against the Flow: cross cooled-lava platforms, then Ultrahand spare platforms into a bridge to reach the orb and chest.",
     "shrineQuest": null
    },
    {
     "name": "Isisim Shrine",
     "location": "Eldin Canyon, inside YunoboCo HQ East Cave (1841, 2841, 0363)",
     "category": "combat",
     "oneLine": "Proving Grounds: In Reverse. Use only provided gear; Recall the gears to flip enemy approaches and clear the Constructs.",
     "shrineQuest": null
    },
    {
     "name": "Sitsum Shrine",
     "location": "Death Mountain, west side near the summit (2367, 2597, 0790)",
     "category": "puzzle",
     "oneLine": "A Controlling Device: take a steering stick, drive a cart across the lava, then attach it to a fan-wing and fly to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Sibajitak Shrine",
     "location": "Eldin Canyon, north of Death Caldera (2399, 3269, 0402)",
     "category": "puzzle",
     "oneLine": "Alignment: use Recall to line up the rotating pillar's segments, then Ascend straight up through them to reach the exit.",
     "shrineQuest": null
    },
    {
     "name": "Kimayat Shrine",
     "location": "Eldin Canyon, west of Skull Lake (2871, 3625, 0239)",
     "category": "combat",
     "oneLine": "Proving Grounds: Smash. Defeat all the Constructs (melee on the floor, archers above) with only the weapons provided.",
     "shrineQuest": null
    },
    {
     "name": "Mayachideg Shrine",
     "location": "Eldin Canyon, west of Kanalet Ridge (3062, 1817, 0216)",
     "category": "combat",
     "oneLine": "Proving Grounds: The Hunt. Use only the items inside (start with a Wooden Stick) to hunt down and defeat the Constructs.",
     "shrineQuest": null
    },
    {
     "name": "Mayak Shrine",
     "location": "Eldin Mountains, west of East Deplian Badlands (1270, 3733, 0106)",
     "category": "puzzle",
     "oneLine": "A timing puzzle: launch up, Ultrahand a boulder onto the ramp, then swing the glowing post so it lands on the target.",
     "shrineQuest": null
    },
    {
     "name": "Minetak Shrine",
     "location": "Eldin Mountains, inside Deplian Badlands Cave (0394, 3485, 0068)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: reach the shrine deep in the cave, open the chest, and touch the altar for the Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Jiotak Shrine",
     "location": "Eldin Canyon, inside Isle of Rabac Gallery cave (1833, 3179, 0257)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: wear Flamebreaker gear, navigate the hot cave to the shrine, grab the chest, and claim the blessing.",
     "shrineQuest": null
    },
    {
     "name": "Momosik Shrine",
     "location": "Eldin Canyon, near Death Caldera (2957, 2759, 0524)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: appears after the crystal quest; enter, open the chest for a Big Battery, and take the blessing.",
     "shrineQuest": "The Death Caldera Crystal"
    },
    {
     "name": "Moshapin Shrine",
     "location": "Eldin Canyon, inside Lake Intenoch Cave (2678, 1905, 0131)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: carry the green crystal to the shrine to unlock it, open the chest, then claim the blessing.",
     "shrineQuest": "The Lake Intenoch Cave Crystal"
    },
    {
     "name": "Kisinona Shrine",
     "location": "Eldin Canyon, between Maw of Death Mountain and Cephla Lake (2568, 1245, 0173)",
     "category": "puzzle",
     "oneLine": "Wind Power: attach and activate the Zonai fans onto the turbine to generate wind and push platforms to the exit.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "akkala",
   "regionName": "Akkala",
   "shrines": [
    {
     "name": "Domizuin Shrine",
     "location": "Akkala Highlands, southeast of South Akkala Stable up the mountain (3305, 1443, 0426)",
     "category": "puzzle",
     "oneLine": "A Prone Pathway: Hit the inside and outside rotation pillars to roll the giant cube until its steps line up, then platform to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Gatanisis Shrine",
     "location": "Akkala Highlands, far east near Ulria Grotto by the Akkala Sea coast (4501, 0826, 0095)",
     "category": "puzzle",
     "oneLine": "A Well-Timed Bounce: Recall the spring platform as the ball rolls across it to fling the ball up into the switch.",
     "shrineQuest": null
    },
    {
     "name": "Jochi-iu Shrine",
     "location": "Deep Akkala, just northeast of East Akkala Stable (4350, 2972, 0164)",
     "category": "puzzle",
     "oneLine": "Courage to Pluck: Ultrahand metal blocks out of the Jenga-like tower without toppling it, then climb to the altar.",
     "shrineQuest": null
    },
    {
     "name": "Gemimik Shrine",
     "location": "Akkala Sea, southeast of East Akkala Stable on the spiral Rist Peninsula island (4521, 2126, 0001)",
     "category": "puzzle",
     "oneLine": "Turbine Power: Attach the propeller to the motor and bridge the wiring with a metal plate to power the fan and braziers.",
     "shrineQuest": null
    },
    {
     "name": "Rasiwak Shrine",
     "location": "Deep Akkala, northeast of Akkala Ancient Tech Lab (4663, 3263, 0002)",
     "category": "puzzle",
     "oneLine": "Flotational Brilliance: Fuse spheres and fans to metal planks so they float, then ferry a boat onto the exit switch.",
     "shrineQuest": null
    },
    {
     "name": "Kamatukis Shrine",
     "location": "Deep Akkala, north of Tempest Gulch (3427, 3345, 0070)",
     "category": "puzzle",
     "oneLine": "A Precise Strike: Aim launched balls and rotating cogs so a ball strikes the target switch to open the way forward.",
     "shrineQuest": null
    },
    {
     "name": "Sinatanika Shrine",
     "location": "Akkala Highlands, northeast of Ulri Mountain Skyview Tower (3842, 2299, 0048)",
     "category": "combat",
     "oneLine": "Combat Training Sneakstrike: Stay crouched in the patrolling construct's blind spot and slip behind for a one-hit sneakstrike.",
     "shrineQuest": null
    },
    {
     "name": "Rasitakiwak Shrine",
     "location": "Akkala Highlands, southeast of Tarrey Town near Kaepora Pass (4161, 1324, 0229)",
     "category": "combat",
     "oneLine": "Proving Grounds Vehicles: Stripped of gear, fuse the emitters and cannon to a Zonai vehicle and ride it to crush the constructs.",
     "shrineQuest": null
    },
    {
     "name": "Jochi-ihiga Shrine",
     "location": "Akkala Highlands, northeast of Akkala Falls near Lake Akkala (3813, 1218, 0090)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: Buy Hagie's green crystal in Tarrey Town and boat it to the light beam to reveal the shrine, then claim the reward.",
     "shrineQuest": "Rock for Sale"
    },
    {
     "name": "Igashuk Shrine",
     "location": "Akkala Sea, inside Lomei Labyrinth Island in the far northeast (4655, 3712, 0131)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing: Navigate the Lomei Labyrinth Island maze to reach the shrine, then walk to the altar for the free reward.",
     "shrineQuest": null
    }
   ]
  },
  {
   "regionKey": "sky",
   "regionName": "Sky Islands",
   "shrines": [
    {
     "name": "Mogisari Shrine",
     "location": "Lomei Sky Labyrinth, Akkala Sea Sky (4655, 3501, 1010)",
     "category": "puzzle",
     "oneLine": "Solve the Lomei Sky Labyrinth maze; ascend and navigate the floating labyrinth to reach the shrine at its heart.",
     "shrineQuest": null
    },
    {
     "name": "Gikaku Shrine",
     "location": "Sky Mine, Akkala Sea Sky (4506, 2165, 1155)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'The Sky Mine Crystal'. Fetch the crystal from Luminous Stone Island and return it to the Sky Mine shrine.",
     "shrineQuest": null
    },
    {
     "name": "Natak Shrine",
     "location": "Sokkala Sky Archipelago, Akkala Sky (3671, 1484, 1158)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'The Sokkala Sky Crystal'. Catapult into the sphere, set the spring, and launch the crystal to the shrine.",
     "shrineQuest": null
    },
    {
     "name": "Kadaunar Shrine",
     "location": "South Eldin Sky Archipelago, Eldin Sky (1881, 1203, 1251)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'Water Makes a Way'. Use a water source to float and route the crystal to the shrine's foundation.",
     "shrineQuest": null
    },
    {
     "name": "Mayam Shrine",
     "location": "Great Hyrule Forest Sky (0340, 2814, 1821)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Transport the green crystal across the floating islands to the shrine's pedestal to reveal it.",
     "shrineQuest": null
    },
    {
     "name": "Simosiwak Shrine",
     "location": "Bravery Island, Great Hyrule Forest Sky (0163, 1972, 0759)",
     "category": "combat",
     "oneLine": "Proving Grounds: Lights Out. Gear is stripped; grab the provided weapons and flame emitters to defeat three Constructs.",
     "shrineQuest": null
    },
    {
     "name": "Jinodok Shrine",
     "location": "South Hyrule Sky Archipelago (-1256, -1482, 1008)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'South Hyrule Sky Crystal'. Guide the crystal across the islands to the shrine to claim the reward.",
     "shrineQuest": null
    },
    {
     "name": "Joku-usin Shrine",
     "location": "Thunderhead Isles, over Sarjon Woods (1077, -3349, 0786)",
     "category": "combat",
     "oneLine": "Proving Grounds: Short Circuit. Use only in-shrine gear; grab the Shock Emitter and use electric attacks to beat the Constructs.",
     "shrineQuest": null
    },
    {
     "name": "Joku-u Shrine",
     "location": "Dragonhead Island, Thunderhead Isles (1378, -3342, 0429)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing inside the eye of Dragonhead Island. Reach it via the Thunderhead Isles for a free Light of Blessing.",
     "shrineQuest": null
    },
    {
     "name": "Siyamotsus Shrine",
     "location": "South Lomei Castle, Gerudo Sky (-1795, -3296, 1011)",
     "category": "puzzle",
     "oneLine": "Cross the dark castle interior; light torches and time the platforms in the gloom to navigate through to the shrine.",
     "shrineQuest": null
    },
    {
     "name": "Rakashog Shrine",
     "location": "East Gerudo Sky Archipelago, Gerudo Highlands Sky (-1713, -2120, 1149)",
     "category": "puzzle",
     "oneLine": "A Reflective Device. Use Ultrahand to aim mirrors and bounce light beams onto hexagonal switches to open the doors.",
     "shrineQuest": null
    },
    {
     "name": "Mayasiar Shrine",
     "location": "Starview Island, Gerudo Highlands Sky (-3547, -0320, 1976)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Rotate Starview Island's mirror wheels to light the top switch; the shrine then appears (no interior trial).",
     "shrineQuest": null
    },
    {
     "name": "Taunhiy Shrine",
     "location": "Courage Island, Hyrule Ridge Sky (-2402, 0825, 0615)",
     "category": "combat",
     "oneLine": "Combat Training: Archery. Use air vents and your glider to stay airborne, then hit the lone Construct three times with a bow.",
     "shrineQuest": null
    },
    {
     "name": "Ganos Shrine",
     "location": "Tabantha Sky Archipelago (-3370, 0467, 1695)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'Tabantha Sky Crystal'. Carry the crystal across the Tabantha islands to the shrine pedestal.",
     "shrineQuest": null
    },
    {
     "name": "Ga-ahisas Shrine",
     "location": "Lightcast Island, Tabantha Frontier Sky (-3596, 0961, 1699)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Drain the water, then redirect mirror light through the cave to open the way to the shrine.",
     "shrineQuest": null
    },
    {
     "name": "Ijo-o Shrine",
     "location": "West Hebra Sky Archipelago (-3860, 2682, 0702)",
     "category": "puzzle",
     "oneLine": "More Than Defense. Use a shield and Recall to reflect or ride incoming objects and cross the gaps to the exit.",
     "shrineQuest": null
    },
    {
     "name": "Mayaumekis Shrine",
     "location": "Rising Island Chain, Hebra Sky (-2948, 3050, 0896)",
     "category": "puzzle",
     "oneLine": "Downward Force. Bounce off the roofs of the flying ships and use dropped weight to launch yourself up to the terminals.",
     "shrineQuest": null
    },
    {
     "name": "Kahatanaum Shrine",
     "location": "Rising Island Chain, Hebra Sky (-3295, 3430, 1347)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Navigate the Rising Island Chain's ascending platforms to reach the shrine for a free blessing.",
     "shrineQuest": null
    },
    {
     "name": "Taninoud Shrine",
     "location": "East Hebra Sky Archipelago (-1801, 3406, 0949)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'The East Hebra Sky Crystal'. Build a fan flyer to bring the crystal back to the shrine, then claim it.",
     "shrineQuest": null
    },
    {
     "name": "Tenbez Shrine",
     "location": "North Lomei Castle, Hebra Sky (-0966, 3540, 1011)",
     "category": "puzzle",
     "oneLine": "Gravity and Velocity. Use ramps and falling momentum to roll balls and carts onto distant switches and targets.",
     "shrineQuest": null
    },
    {
     "name": "Jirutagumac Shrine",
     "location": "Near Wellspring Island, Lanayru Sky (2916, 0534, 0965)",
     "category": "puzzle",
     "oneLine": "A Flying Device. Build a fan-powered flyer with Ultrahand and pilot it across the gaps to the shrine's exit.",
     "shrineQuest": null
    },
    {
     "name": "Igoshon Shrine",
     "location": "Water Temple path, Lanayru Sky (3481, 0664, 1325)",
     "category": "puzzle",
     "oneLine": "Orbs of Water. Ride water orbs and use Recall and Ultrahand to ferry yourself across the gaps to the goal.",
     "shrineQuest": null
    },
    {
     "name": "Sihajog Shrine",
     "location": "Valor Island, Lanayru Sky (4546, -0846, 1135)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Complete Valor Island's Dive Ceremony (fall through the green rings) to make the shrine appear.",
     "shrineQuest": null
    },
    {
     "name": "Mayanas Shrine",
     "location": "South Lanayru Sky Archipelago, near Valor Island (4613, -0947, 1790)",
     "category": "puzzle",
     "oneLine": "The Ice Guides You. Make ice plates on water with Ice Fruit or Frost Emitters to build sliding ramps onto the targets.",
     "shrineQuest": null
    },
    {
     "name": "Josiu Shrine",
     "location": "North Necluda Sky Archipelago (1760, -1208, 0924)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing. Ferry the green crystal across the Necluda sky islands to the shrine base to reveal it.",
     "shrineQuest": null
    },
    {
     "name": "Yansamin Shrine",
     "location": "Zonaite Forge Island, Necluda Sky (2353, -1783, 1475)",
     "category": "combat",
     "oneLine": "Proving Grounds: Low Gravity. In reduced gravity with only provided gear, defeat the Constructs to clear the trial.",
     "shrineQuest": null
    },
    {
     "name": "Ukoojisi Shrine",
     "location": "West Necluda Sky Archipelago (1468, -2168, 0585)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'West Necluda Sky Crystal'. Move the crystal across the islands to the shrine's foundation.",
     "shrineQuest": null
    },
    {
     "name": "Kumamayn Shrine",
     "location": "South Necluda Sky Archipelago (2856, -2857, 1212)",
     "category": "blessing",
     "oneLine": "Rauru's Blessing 'Necluda Sky Crystal'. Escort the green crystal across the floating islands to the shrine pedestal.",
     "shrineQuest": null
    }
   ]
  }
 ],
 "ARMOR": {
  "sets": [
   {
    "name": "Archaic / Well-Worn",
    "pieces": "Archaic Tunic, Archaic Legwear, Well-Worn Trousers (no headpiece)",
    "where": "Starting gear on the Great Sky Island; from chests and the Steward Construct as you begin the game.",
    "bonus": "No set bonus; just basic starter defense to get you off the tutorial island.",
    "upgrade": "Not upgradable at Great Fairies; starter clothing you replace fast.",
    "priority": "Have it by default"
   },
   {
    "name": "Hylian Set",
    "pieces": "Hylian Hood, Hylian Tunic, Hylian Trousers",
    "where": "Buy from Hateno Village's Ventest Clothing Boutique and other early shops.",
    "bonus": "No set bonus, but cheap, balanced all-purpose defense for the early game.",
    "upgrade": "Upgrade theme: common monster parts like Bokoblin Horns plus Hylian plants.",
    "priority": "Solid early default"
   },
   {
    "name": "Climbing Gear (Climber's Set)",
    "pieces": "Climber's Bandanna, Climbing Gear (chest), Climbing Boots",
    "where": "Three separate chests in caves: North Hyrule Plain Cave, Ploymus Mountain Cave, and Upland Zorana Byroad.",
    "bonus": "Full set bonus Climbing Jump Stamina Up: halves the stamina used when jumping mid-climb. No per-piece speed boost.",
    "upgrade": "Upgrade theme: lizards and climbing critters like Lizalfos Tails.",
    "priority": "Great early quality-of-life"
   },
   {
    "name": "Glide Set",
    "pieces": "Glide Mask, Glide Shirt, Glide Tights",
    "where": "Complete the three Sky dive ring challenges on Courage, Bravery, and Valor Islands (one piece each).",
    "bonus": "Each piece boosts dive speed; full set upgraded to 2 stars gives Impact Proof - immunity to all fall damage.",
    "upgrade": "Upgrade theme: sky/flight critters and Zonai materials.",
    "priority": "Fun and very useful for fliers"
   },
   {
    "name": "Zonaite Set",
    "pieces": "Zonaite Helm, Zonaite Waistguard, Zonaite Greaves",
    "where": "Three chests on the Sky Islands, in different areas of the sky.",
    "bonus": "Full set bonus Energy Recharge Up: doubles how fast your Zonai battery (energy cells) recharge.",
    "upgrade": "Upgrade theme: Zonaite ore and Zonai device/construct materials.",
    "priority": "Best-in-slot for Zonai vehicle builders"
   },
   {
    "name": "Charged Set",
    "pieces": "Charged Headdress, Charged Shirt, Charged Trousers",
    "where": "Three caves along the Dracozu River (marked by Tall Dragon Pillars) during the Secret of the Ring Ruins quest.",
    "bonus": "Full set bonus Stormy Weather Charge: charges weapon attacks faster while in stormy weather.",
    "upgrade": "Upgrade theme: electric monster parts (Electric Lizalfos, Electric Keese).",
    "priority": "Niche, late-game"
   },
   {
    "name": "Froggy Set",
    "pieces": "Froggy Hood, Froggy Sleeve, Froggy Leggings",
    "where": "Rewards from completing all of Penn's Lucky Clover Gazette side quests (12 stable jobs) for Traysi.",
    "bonus": "Slip Resistance per piece; full set greatly reduces slipping while climbing wet or icy surfaces.",
    "upgrade": "Upgrade theme: frogs like Hot-Footed Frog and Tireless Frog.",
    "priority": "Huge for rainy climbing"
   },
   {
    "name": "Rubber Set",
    "pieces": "Rubber Helm, Rubber Armor, Rubber Tights",
    "where": "Three chests in caves around Hyrule; the helm is an easy early grab before facing Gerudo storms.",
    "bonus": "Shock Resistance per piece; fully upgraded set bonus Unshockable negates electric/lightning shock damage.",
    "upgrade": "Upgrade theme: electric parts like Electric Lizalfos Tails.",
    "priority": "Worth it before lightning zones"
   },
   {
    "name": "Desert Voe Set",
    "pieces": "Desert Voe Headband, Desert Voe Spaulder, Desert Voe Trousers",
    "where": "Buy from the clothing shop in Gerudo Town once you reach the desert.",
    "bonus": "Heat Resistance per piece; fully upgraded set bonus adds Shock Damage Resist, ideal for the Gerudo region.",
    "upgrade": "Upgrade theme: desert critters and Electric Safflina.",
    "priority": "Needed for hot Gerudo daytime"
   },
   {
    "name": "Snowquill Set",
    "pieces": "Snowquill Headdress, Snowquill Tunic, Snowquill Trousers",
    "where": "Buy from the Rito Village shop (Brazen Beak) in the snowy Hebra/Tabantha region.",
    "bonus": "Cold Resistance per piece; fully upgraded set bonus Unfreezable keeps you from freezing in blizzards.",
    "upgrade": "Upgrade theme: cold-region critters (Cold Darner, Winterwing Butterfly).",
    "priority": "Essential for Rito/Hebra cold"
   },
   {
    "name": "Flamebreaker Set",
    "pieces": "Flamebreaker Helm, Flamebreaker Armor, Flamebreaker Boots",
    "where": "Buy at the Goron armor shop in Goron City near Death Mountain.",
    "bonus": "Fire Resistance per piece; fully upgraded set bonus Fireproof stops flames from burning you.",
    "upgrade": "Upgrade theme: fire materials like Fireproof Lizards and Flint.",
    "priority": "Required for Death Mountain/Depths lava"
   },
   {
    "name": "Zora Set (Zora Armor)",
    "pieces": "Zora Helm, Zora Armor, Zora Greaves",
    "where": "Zora Armor from Lady Yona during Sidon of the Zora (needs an ancient arowana; Dento points you to it). Helm and greaves found around the region.",
    "bonus": "Swim Speed Up per piece; full set lets you swim up waterfalls, very handy in Zora areas.",
    "upgrade": "Upgrade theme: fish and Zora-region materials.",
    "priority": "Great for water traversal"
   },
   {
    "name": "Champion's Leathers",
    "pieces": "One-piece outfit (no separate head/legs)",
    "where": "Hidden chest in the Sanctum (throne room) of Hyrule Castle; light the two torches behind the throne to open the tomb.",
    "bonus": "No set bonus (single piece), but strong scaling defense as you upgrade and a classic blue look.",
    "upgrade": "Upgrade theme: Star Fragments plus rarer monster parts at higher stars.",
    "priority": "Reliable main-story staple"
   },
   {
    "name": "Miner's Set (glow set)",
    "pieces": "Miner's Mask, Miner's Top, Miner's Trousers",
    "where": "Three chests in Depths mines: Abandoned Kara Kara, Daphnes Canyon, and Hylia Canyon mines.",
    "bonus": "Pieces glow to light the dark Depths; full upgraded set bonus Shining Steps leaves a glowing petal trail.",
    "upgrade": "Upgrade theme: Brightcaps and luminous Depths materials.",
    "priority": "Best early light source for the Depths"
   },
   {
    "name": "Tunic of the Wild (Of the Wild Set)",
    "pieces": "Cap of the Wild, Tunic of the Wild, Trousers of the Wild",
    "where": "Misko's Treasure side quests - three Dark Skeletons in the Depths (Hebra, Gerudo, Eldin). The Eldin piece needs fire protection. NOT an all-shrines reward like BotW.",
    "bonus": "Full set upgraded to 2 stars grants Attack Up. The classic green Champion look.",
    "upgrade": "Upgrade theme: Dragon Parts (scales, claws, horns, fangs).",
    "priority": "Iconic late-game reward"
   },
   {
    "name": "Tunic of Memories",
    "pieces": "Single body piece (not part of a set)",
    "where": "Buy for 400 Poes from any Bargainer Statue after speaking to all of them and clearing A Call from the Depths.",
    "bonus": "No set bonus; a nostalgic outfit referencing Link's classic green tunic, mainly for the look.",
    "upgrade": "Upgrade theme: Depths/Gloom-adjacent materials at the Great Fairies.",
    "priority": "Cosmetic, optional"
   },
   {
    "name": "Fierce Deity Set",
    "pieces": "Fierce Deity Mask, Fierce Deity Armor, Fierce Deity Boots",
    "where": "Three caves (Skull Lake Cave, Citadel Ruins Summit Cave, Ancient Tree Stump) without amiibo, or via the Majora's Mask Link amiibo.",
    "bonus": "Attack Up per piece; full set upgraded to 3 stars adds the Charge Atk. Stamina Up bonus. Strong offensive set.",
    "upgrade": "Upgrade theme: rare monster horns/guts at higher stars.",
    "priority": "Powerful end-game offense"
   }
  ]
 },
 "BESTIARY": {
  "enemies": [
   {
    "name": "Bokoblin",
    "tier": "common",
    "tactic": "Sneak up for a stealth strike, or flurry-rush their swing. Fuse a horn or rock to your weapon for far higher damage on early ones.",
    "drops": "Bokoblin Horn, Bokoblin Fang, Bokoblin Guts"
   },
   {
    "name": "Moblin",
    "tier": "common",
    "tactic": "Big and slow. Dodge the wide club swing for a flurry rush, or knock it off ledges. Fused horns/rocks make short work of it.",
    "drops": "Moblin Horn, Moblin Fang, Moblin Guts"
   },
   {
    "name": "Lizalfos",
    "tier": "common",
    "tactic": "Fast and dodgy; they spit elemental bursts. Hit with the opposite element or just flurry-rush their lunge, then finish quickly.",
    "drops": "Lizalfos Horn, Lizalfos Tail, Lizalfos Talon"
   },
   {
    "name": "Horriblin",
    "tier": "common",
    "tactic": "Clings to cave ceilings and grabs you with its tongue. Shoot the head to drop it, then beat it on the ground. Higher tiers spit gloom.",
    "drops": "Horriblin Horn, Horriblin Claw, Horriblin Guts"
   },
   {
    "name": "Aerocuda",
    "tier": "common",
    "tactic": "Flying bat-eye that swoops and can carry off Bokoblins. Shoot it down with any arrow; a Keese Eyeball-fused arrow homes right in.",
    "drops": "Aerocuda Eyeball, Aerocuda Wing"
   },
   {
    "name": "Construct (Soldier / Captain)",
    "tier": "construct",
    "tactic": "Zonai automata in the Sky. Soldiers are basic; Captains hit harder. Flurry-rush, or knock their weapon off to steal a Construct weapon to Fuse.",
    "drops": "Soldier/Captain Construct Horn, Zonai Charge, Construct weapons"
   },
   {
    "name": "Like Like",
    "tier": "common",
    "tactic": "Tube that swallows you and spits you out, dropping a weapon. Shoot the open mouth or its eye to stun, then attack. Watch for Ice/Rock variants.",
    "drops": "Opal, chest gear; Ice Like Stone or Rock Like Stone from variants"
   },
   {
    "name": "Gibdo",
    "tier": "common",
    "tactic": "Gerudo desert mummies that harden and revive unless finished with an element. Hit with fire/electric/ice to weaken, then strike to end them.",
    "drops": "Gibdo Bone, Gibdo Wing, Gibdo Guts"
   },
   {
    "name": "Gloom Hands (Gloom Spawn)",
    "tier": "gloom",
    "tactic": "Crawling gloom arms that drain max hearts. Get high ground and rain Bomb Flower arrows into the cluster; bright light (Brightbloom seeds) also weakens them.",
    "drops": "Dark Clump"
   },
   {
    "name": "Phantom Ganon",
    "tier": "boss",
    "tactic": "Spawns after clearing Gloom Hands. Wear gloom-resist gear; flurry-rush his lunges with a strong fast weapon, then punish. Repeat through his phases.",
    "drops": "Demon King's Bow, a Gloom weapon (Sword/Club/Spear), Dark Clump"
   },
   {
    "name": "Boss Bokoblin",
    "tier": "mini-boss",
    "tactic": "Huge Bokoblin that leads camps and charges. Sidestep the rush for a flurry rush, hit the head, and use a heavy Fuse (Silver Bokoblin Horn, rocks).",
    "drops": "Boss Bokoblin Horn, Boss Bokoblin Guts"
   },
   {
    "name": "Hinox",
    "tier": "mini-boss",
    "tactic": "One-eyed giant; sleeps with weapons stuck in it. Shoot the eye to stagger, then melee. Loot the weapons off its necklace before finishing.",
    "drops": "Hinox Horn, Hinox Guts, Hinox Toenail, Hinox Tooth"
   },
   {
    "name": "Stalnox",
    "tier": "mini-boss",
    "tactic": "Skeletal Hinox in caves/Depths. Shoot the eye to make the head pop off, grab the loose head with Ultrahand or smash it before the body reassembles.",
    "drops": "Stalnox Horn, Hinox Tooth"
   },
   {
    "name": "Stone Talus (incl. Luminous / Rare)",
    "tier": "mini-boss",
    "tactic": "Rock golem with an ore weak spot on its back. Climb up and hammer the black ore, or Ascend through it to reach the top. Luminous/Rare variants drop gems.",
    "drops": "Flint, Amber, Luminous Stone; gems like Topaz/Diamond/Ruby/Sapphire on rare types"
   },
   {
    "name": "Frox",
    "tier": "boss",
    "tactic": "Giant Depths frog-toad. Shoot its eye (Dazzle Fruit or Keese-eye arrow) to topple it, climb on and smash the glowing Zonaite ore on its back. Repeat.",
    "drops": "Frox Fang, Frox Fingernail, Frox Guts, Zonaite, Large Zonaite, Crystallized Charge"
   },
   {
    "name": "Flux Construct",
    "tier": "boss",
    "tactic": "Floating cube golem; hit or Ultrahand-pull the glowing block to break it apart. In ball form dodge its body-slam, then strike the weak block. I/II/III scale up.",
    "drops": "Flux Construct Core, Zonaite, Large Zonaite"
   },
   {
    "name": "Molduga",
    "tier": "boss",
    "tactic": "Sand shark in Gerudo dunes. Drop a Bomb Flower (or use a fused bomb) to lure it up, hit the bomb to flip it onto land, then wail on it while it's beached.",
    "drops": "Molduga Fin, Molduga Jaw, Molduga Guts"
   },
   {
    "name": "Gleeok (Fire / Frost / Thunder)",
    "tier": "boss",
    "tactic": "Multi-headed dragon. Shoot each head to stun, then in its air phase use an elemental-counter arrow (e.g. Frost for Fire) and finish heads fast.",
    "drops": "Fire/Frost/Thunder Gleeok Horn, Wing, Guts"
   },
   {
    "name": "King Gleeok",
    "tier": "boss",
    "tactic": "Toughest Gleeok, all three elements. Bring lots of arrows and a fast bow; stun all three heads, then in the aerial storm phase hit heads with bomb/elemental arrows.",
    "drops": "King Gleeok Horn, Wing, Guts"
   },
   {
    "name": "Lynel",
    "tier": "mini-boss",
    "tactic": "Brutal centaur. Shoot the face to stun, mount it for free hits, and flurry-rush its charge. Fuse a Lynel horn for a devastating weapon. Save before trying.",
    "drops": "Lynel Saber Horn or Mace Horn, Lynel Hoof, Lynel Guts, Lynel weapons"
   },
   {
    "name": "Temple bosses (Colgera, Marbled Gohma, Mucktorok, Queen Gibdo)",
    "tier": "boss",
    "tactic": "Each temple boss is solved by its dungeon gimmick plus your sage's power: Colgera (Wind), Marbled Gohma (Fire), Mucktorok (Water), Queen Gibdo (Lightning).",
    "drops": "Heart Container, sage's vow"
   },
   {
    "name": "Demon King Ganondorf",
    "tier": "boss",
    "tactic": "Final humanoid fight; he mirrors your moves and inflicts gloom. Use gloom-resist food, flurry-rush his combos, and call all five sages to swarm him.",
    "drops": null
   },
   {
    "name": "Demon Dragon",
    "tier": "boss",
    "tactic": "Final form, fought in free-fall. Dive onto its back and hit the four glowing weak spots with the Master Sword (10x dmg); the Light Dragon lifts you between each.",
    "drops": null
   }
  ]
 },
 "COOKING": {
  "rules": [
   "One effect per dish: mixing two different effect ingredients (e.g. Spicy + Hasty) cancels both, leaving a plain meal that only heals.",
   "Stack the same prefix to go further: more same-effect ingredients raise the tier (Spicy to Spicy to Hot-Footed style) and lengthen the timer.",
   "Cook in a lit Cooking Pot. Holding ingredients and dropping them in a campfire or open flame does NOT make effect meals.",
   "Elixirs need a critter plus a monster part: e.g. Hightail Lizard + monster part = Hasty Elixir. No critter or no monster part means no elixir.",
   "Monster parts set elixir duration, not the effect. Tougher monster part = longer timer; the critter decides which effect you get.",
   "Add a Dragon Horn shard (Dinraal/Naydra/Farosh/Light) to any elixir to max the timer to 30 minutes instantly.",
   "Sundelions add the Sunny effect, the only way to cook back gloom-damaged (locked) hearts; Sun Pumpkin also gives Sunny.",
   "Brightcaps and Glowing Cave Fish make Bright meals that give Link a glowing aura: hugely useful in the dark Depths and caves.",
   "Muddle Buds and Dazzlefruit are throw/Fuse materials, not cooking ingredients: they confuse or blind enemies, they do not make meals.",
   "Star fragments and most gems/ores can't be cooked; adding a non-food item usually produces Dubious Food with no effect.",
   "Up to 5 ingredients per dish. Adding more of the same effect food gives more hearts/duration up to the cap.",
   "Hearty-effect dishes fully heal and add temporary yellow (bonus) hearts; they ignore the normal heart count."
  ],
  "effects": [
   {
    "effect": "Hearty",
    "does": "Fully restores hearts and adds temporary bonus (yellow) hearts on top of your max.",
    "ingredients": "Big Hearty Radish, Hearty Radish, Hearty Truffle, Big Hearty Truffle, Hearty Salmon, Hearty Bass.",
    "elixir": null
   },
   {
    "effect": "Energizing",
    "does": "Instantly refills part of your stamina wheel for climbing, gliding, and sprinting.",
    "ingredients": "Stamella Shroom, Stambulb, plus Energetic Rhino Beetle for elixirs.",
    "elixir": "Energetic Rhino Beetle + any monster part = Energizing Elixir."
   },
   {
    "effect": "Enduring",
    "does": "Overfills stamina past full with extra green wheels (best for long climbs/glides).",
    "ingredients": "Endura Carrot, Endura Shroom, plus Tireless Frog for elixirs.",
    "elixir": "Tireless Frog + any monster part = Enduring Elixir."
   },
   {
    "effect": "Spicy (cold resistance)",
    "does": "Keeps Link warm in cold regions so you don't take freezing chip damage.",
    "ingredients": "Spicy Pepper, Sizzlefin Trout, plus Warm Darner for elixirs.",
    "elixir": "Warm Darner + any monster part = Spicy Elixir."
   },
   {
    "effect": "Chilly (heat resistance)",
    "does": "Stops heat damage in hot areas like the Gerudo Desert and Eldin's hot lowlands. Note: Death Mountain's extreme heat needs Fireproof, not this.",
    "ingredients": "Hydromelon, Cool Safflina, Chillfin Trout, plus Cold Darner for elixirs.",
    "elixir": "Cold Darner + any monster part = Chilly Elixir."
   },
   {
    "effect": "Fireproof",
    "does": "Prevents Link bursting into flame in extreme heat (e.g. Death Mountain). Elixir only.",
    "ingredients": "Fireproof Lizard or Smotherwing Butterfly, each plus any monster part.",
    "elixir": "Fireproof Lizard (or Smotherwing Butterfly) + any monster part = Fireproof Elixir."
   },
   {
    "effect": "Electro (shock resistance)",
    "does": "Reduces or blocks electric/shock damage and stops weapons being knocked from your hand.",
    "ingredients": "Voltfruit, Zapshroom, Electric Safflina, Voltfin Trout, plus Electric Darner for elixirs.",
    "elixir": "Electric Darner + any monster part = Electro Elixir."
   },
   {
    "effect": "Mighty",
    "does": "Temporarily raises your attack power so weapons hit harder.",
    "ingredients": "Mighty Bananas, Razorshroom, Razorclaw Crab, Mighty Carp, plus Bladed Rhino Beetle for elixirs.",
    "elixir": "Bladed Rhino Beetle + any monster part = Mighty Elixir."
   },
   {
    "effect": "Tough",
    "does": "Temporarily raises defense so you take less damage from hits.",
    "ingredients": "Ironshroom, Fortified Pumpkin, Armored Carp, Ironshell Crab, plus Rugged Rhino Beetle for elixirs.",
    "elixir": "Rugged Rhino Beetle + any monster part = Tough Elixir."
   },
   {
    "effect": "Hasty",
    "does": "Increases Link's movement and running speed on foot.",
    "ingredients": "Swift Carrot, Fleet-Lotus Seeds, Swift Violet, Hyrule Bass, plus Hightail Lizard for elixirs.",
    "elixir": "Hightail Lizard + any monster part = Hasty Elixir."
   },
   {
    "effect": "Sneaky",
    "does": "Lowers the noise Link makes so enemies and animals are harder to alert.",
    "ingredients": "Silent Princess, Blue Nightshade, Silent Shroom, Sneaky River Snail, plus Sunset Firefly for elixirs.",
    "elixir": "Sunset Firefly + any monster part = Sneaky Elixir."
   },
   {
    "effect": "Sticky",
    "does": "Prevents slipping while climbing on wet surfaces or in the rain.",
    "ingredients": "Sticky Lizard or Sticky Frog, each plus any monster part (elixir only).",
    "elixir": "Sticky Lizard (or Sticky Frog) + any monster part = Sticky Elixir."
   },
   {
    "effect": "Bright",
    "does": "Surrounds Link with a glowing aura that lights the area: vital in the dark Depths and caves.",
    "ingredients": "Brightcap, Glowing Cave Fish; a simple Bright meal is Brightcap + Apple.",
    "elixir": "Deep Firefly + any monster part = Bright Elixir."
   },
   {
    "effect": "Gloom-recovery (Sunny)",
    "does": "Heals normal hearts AND restores gloom-damaged (locked) hearts, which nothing else cooks back.",
    "ingredients": "Sundelion (best), Sun Pumpkin; both give the Sunny effect.",
    "elixir": null
   }
  ],
  "recipes": [
   {
    "name": "Sunny Fried Wild Greens",
    "makes": "Restores gloom-damaged hearts (up to ~15 from Gloom)",
    "why": "Sun Pumpkin + Sundelion. The go-to before Depths runs and gloom-heavy fights, since Sunny is the only gloom cure."
   },
   {
    "name": "Hearty Steamed Fish",
    "makes": "Full heal plus many temporary bonus hearts",
    "why": "Hearty Salmon or Hearty Bass alone in the pot. Tons of yellow hearts for tough bosses; stack more Hearty fish for more."
   },
   {
    "name": "Enduring Carrot Stew",
    "makes": "Overfilled stamina with extra wheels",
    "why": "Endura Carrots only. Extra green stamina wheels make long climbs and sky-glides trivial; better than plain Energizing."
   },
   {
    "name": "Mighty Crab Stir-Fry",
    "makes": "Strong, lasting attack-up",
    "why": "Razorclaw Crab + Mighty ingredient + Goron Spice/Hylian herbs. Easy, high-tier attack boost for fights and the Depths."
   },
   {
    "name": "Bright Meal (Brightcap + Apple)",
    "makes": "Glowing aura to light dark areas",
    "why": "Cheap, farmable Brightcaps. Lights your path in the Depths so you can navigate between Lightroots without flares."
   },
   {
    "name": "Fireproof Elixir",
    "makes": "Flame Guard (no burning in extreme heat)",
    "why": "Fireproof Lizard or Smotherwing Butterfly + any monster part. Needed around Death Mountain before Goron/Fire content."
   }
  ],
  "dragons": [
   {
    "name": "Dinraal",
    "element": "Fire",
    "where": "Circles Eldin and Akkala; enters Depths at Drenan Highlands Chasm, exits at East Akkala Plains Chasm. Catch from Ulri Mountain or Thyphlo Ruins Skyview Tower.",
    "parts": "Scale, Claw, Fang, Horn (shard), Spike. Don't use a wooden bow near it (fire). Fuse for fire weapons; Horn maxes elixir timer to 30 min."
   },
   {
    "name": "Naydra",
    "element": "Ice",
    "where": "Emerges near Mount Lanayru, circles Necluda/Hateno, dives near East Hill above Kakariko. Easy farm from Mount Lanayru Skyview Tower.",
    "parts": "Scale, Claw, Fang, Horn (shard), Spike. She is freezing-cold, so bring cold resistance. Fuse for ice weapons; Horn maxes elixir timer."
   },
   {
    "name": "Farosh",
    "element": "Electric",
    "where": "Circles Gerudo and Faron; enters Depths at Hills of Baumer Chasm, exits at East Gerudo Chasm. Wait at Popla Foothills Skyview Tower or Mount Hylia.",
    "parts": "Scale, Claw, Fang, Horn (shard), Spike. Don't use a metal bow near it (shock). Fuse for electric weapons; Horn maxes elixir timer."
   },
   {
    "name": "Light Dragon",
    "element": "Light",
    "where": "Circles the entire map at the far edges and a very high altitude; needs Sky islands/towers to reach. (Tied to the main story; spoiler-light here.)",
    "parts": "Scale, Claw, Fang, Horn (shard), Spike. Parts make powerful light/holy fuses and its Horn maxes elixir timers like the others."
   }
  ],
  "notes": "CORRECTIONS MADE (web-verified vs Game8, Zelda Dungeon, Gamer Rant, June 2026): (1) Removed 'Hearty Durian' from Hearty ingredients — it does NOT exist in TotK (it was a BotW item, cut from this game). Replaced with Big Hearty Truffle, a real TotK Hearty item. (2) Fixed Chilly 'does' line: removed 'Death Mountain foothills' as a Chilly use, since Death Mountain's extreme heat requires the Fireproof effect, not heat resistance — leaving this could send a first-timer to Death Mountain with the wrong dish and get them burned. (3) Corrected Dinraal's Depths entry to the proper in-game name 'Drenan Highlands Chasm' (was 'Drenan Highland Chasm') and clarified exit as 'East Akkala Plains Chasm'. Everything else verified ACCURATE: all effect/critter/elixir mappings (Energetic Rhino Beetle=Energizing, Tireless Frog=Enduring, Warm/Cold/Electric Darner, Hightail Lizard, Bladed/Rugged Rhino Beetle, Sunset Firefly, Deep Firefly=Bright Elixir, Fireproof Lizard/Smotherwing Butterfly, Sticky Lizard/Frog); Spicy=cold resist and Chilly=heat resist (correctly assigned, not swapped); the cooking rules (two effects cancel to a plain heal, same-prefix stacking, lit pot required, critter+monster part for elixirs, monster part sets duration, Dragon Horn shard = 30-min max for all four dragons including Light); Sundelion/Sun Pumpkin=Sunny gloom cure (Sundelion ~3 hearts each, Sun Pumpkin ~1); Brightcap/Glowing Cave Fish=Bright; Muddle Bud/Dazzlefruit being throw/Fuse not cooking; all four dragon routes and farming towers (Mount Lanayru, Ulri Mountain, Thyphlo Ruins, Popla Foothills towers all real). Lower confidence remains on the exact 'best' single critter per effect since many share an effect — listed ones are confirmed correct, just not guaranteed the absolute optimum. All steps kept under 170 chars, plain text, real in-game proper names. Light Dragon kept deliberately spoiler-aware."
 },
 "RECIPES": [
  {
   "eff": "Hearty",
   "tone": "heart",
   "does": "Fully restores hearts and adds temporary bonus (yellow) hearts on top of your max.",
   "key": "Big Hearty Radish, Hearty Radish, Hearty Truffle, Big Hearty Truffle, Hearty Salmon, Hearty Bass.",
   "recipe": "Cook the ingredients in a pot.",
   "now": false
  },
  {
   "eff": "Energizing",
   "tone": "stam",
   "does": "Instantly refills part of your stamina wheel for climbing, gliding, and sprinting.",
   "key": "Stamella Shroom, Stambulb, plus Energetic Rhino Beetle for elixirs.",
   "recipe": "Energetic Rhino Beetle + any monster part = Energizing Elixir.",
   "now": false
  },
  {
   "eff": "Enduring",
   "tone": "stam",
   "does": "Overfills stamina past full with extra green wheels (best for long climbs/glides).",
   "key": "Endura Carrot, Endura Shroom, plus Tireless Frog for elixirs.",
   "recipe": "Tireless Frog + any monster part = Enduring Elixir.",
   "now": false
  },
  {
   "eff": "Spicy (cold resistance)",
   "tone": "warm",
   "does": "Keeps Link warm in cold regions so you don't take freezing chip damage.",
   "key": "Spicy Pepper, Sizzlefin Trout, plus Warm Darner for elixirs.",
   "recipe": "Warm Darner + any monster part = Spicy Elixir.",
   "now": false
  },
  {
   "eff": "Chilly (heat resistance)",
   "tone": "cool",
   "does": "Stops heat damage in hot areas like the Gerudo Desert and Eldin's hot lowlands. Note: Death Mountain's extreme heat needs Fireproof, not this.",
   "key": "Hydromelon, Cool Safflina, Chillfin Trout, plus Cold Darner for elixirs.",
   "recipe": "Cold Darner + any monster part = Chilly Elixir.",
   "now": false
  },
  {
   "eff": "Fireproof",
   "tone": "fire",
   "does": "Prevents Link bursting into flame in extreme heat (e.g. Death Mountain). Elixir only.",
   "key": "Fireproof Lizard or Smotherwing Butterfly, each plus any monster part.",
   "recipe": "Fireproof Lizard (or Smotherwing Butterfly) + any monster part = Fireproof Elixir.",
   "now": false
  },
  {
   "eff": "Electro (shock resistance)",
   "tone": "volt",
   "does": "Reduces or blocks electric/shock damage and stops weapons being knocked from your hand.",
   "key": "Voltfruit, Zapshroom, Electric Safflina, Voltfin Trout, plus Electric Darner for elixirs.",
   "recipe": "Electric Darner + any monster part = Electro Elixir.",
   "now": false
  },
  {
   "eff": "Mighty",
   "tone": "atk",
   "does": "Temporarily raises your attack power so weapons hit harder.",
   "key": "Mighty Bananas, Razorshroom, Razorclaw Crab, Mighty Carp, plus Bladed Rhino Beetle for elixirs.",
   "recipe": "Bladed Rhino Beetle + any monster part = Mighty Elixir.",
   "now": false
  },
  {
   "eff": "Tough",
   "tone": "def",
   "does": "Temporarily raises defense so you take less damage from hits.",
   "key": "Ironshroom, Fortified Pumpkin, Armored Carp, Ironshell Crab, plus Rugged Rhino Beetle for elixirs.",
   "recipe": "Rugged Rhino Beetle + any monster part = Tough Elixir.",
   "now": false
  },
  {
   "eff": "Hasty",
   "tone": "speed",
   "does": "Increases Link's movement and running speed on foot.",
   "key": "Swift Carrot, Fleet-Lotus Seeds, Swift Violet, Hyrule Bass, plus Hightail Lizard for elixirs.",
   "recipe": "Hightail Lizard + any monster part = Hasty Elixir.",
   "now": false
  },
  {
   "eff": "Sneaky",
   "tone": "sneak",
   "does": "Lowers the noise Link makes so enemies and animals are harder to alert.",
   "key": "Silent Princess, Blue Nightshade, Silent Shroom, Sneaky River Snail, plus Sunset Firefly for elixirs.",
   "recipe": "Sunset Firefly + any monster part = Sneaky Elixir.",
   "now": false
  },
  {
   "eff": "Sticky",
   "tone": "def",
   "does": "Prevents slipping while climbing on wet surfaces or in the rain.",
   "key": "Sticky Lizard or Sticky Frog, each plus any monster part (elixir only).",
   "recipe": "Sticky Lizard (or Sticky Frog) + any monster part = Sticky Elixir.",
   "now": false
  },
  {
   "eff": "Bright",
   "tone": "volt",
   "does": "Surrounds Link with a glowing aura that lights the area: vital in the dark Depths and caves.",
   "key": "Brightcap, Glowing Cave Fish; a simple Bright meal is Brightcap + Apple.",
   "recipe": "Deep Firefly + any monster part = Bright Elixir.",
   "now": false
  },
  {
   "eff": "Gloom-recovery (Sunny)",
   "tone": "heart",
   "does": "Heals normal hearts AND restores gloom-damaged (locked) hearts, which nothing else cooks back.",
   "key": "Sundelion (best), Sun Pumpkin; both give the Sunny effect.",
   "recipe": "Cook the ingredients in a pot.",
   "now": false
  }
 ],
 "COOK_RULES": [
  "One effect per dish: mixing two different effect ingredients (e.g. Spicy + Hasty) cancels both, leaving a plain meal that only heals.",
  "Stack the same prefix to go further: more same-effect ingredients raise the tier (Spicy to Spicy to Hot-Footed style) and lengthen the timer.",
  "Cook in a lit Cooking Pot. Holding ingredients and dropping them in a campfire or open flame does NOT make effect meals.",
  "Elixirs need a critter plus a monster part: e.g. Hightail Lizard + monster part = Hasty Elixir. No critter or no monster part means no elixir.",
  "Monster parts set elixir duration, not the effect. Tougher monster part = longer timer; the critter decides which effect you get.",
  "Add a Dragon Horn shard (Dinraal/Naydra/Farosh/Light) to any elixir to max the timer to 30 minutes instantly.",
  "Sundelions add the Sunny effect, the only way to cook back gloom-damaged (locked) hearts; Sun Pumpkin also gives Sunny.",
  "Brightcaps and Glowing Cave Fish make Bright meals that give Link a glowing aura: hugely useful in the dark Depths and caves.",
  "Muddle Buds and Dazzlefruit are throw/Fuse materials, not cooking ingredients: they confuse or blind enemies, they do not make meals.",
  "Star fragments and most gems/ores can't be cooked; adding a non-food item usually produces Dubious Food with no effect.",
  "Up to 5 ingredients per dish. Adding more of the same effect food gives more hearts/duration up to the cap.",
  "Hearty-effect dishes fully heal and add temporary yellow (bonus) hearts; they ignore the normal heart count."
 ],
 "WORLD": {
  "systems": [
   {
    "name": "The three layers: Surface, Sky, Depths",
    "what": "Hyrule has three stacked worlds. Sky has floating islands and Skyview Towers. The Depths sit beneath the Surface, dark and full of Gloom."
   },
   {
    "name": "The Depths and Gloom",
    "what": "The Depths are pitch-black. Toss Brightbloom Seeds or hit Lightroots to light them. Gloom damages and locks hearts until you reach light or eat a sundelion dish."
   },
   {
    "name": "Lightroots mirror shrines",
    "what": "Activating a Lightroot lights a chunk of the Depths and marks the map. All 120 Lightroots sit under the 120 Surface shrines, names spelled backwards."
   },
   {
    "name": "Poes and Bargainer Statues",
    "what": "Poes are blue flames found in the Depths; they are currency. Spend them at the seven Bargainer Statues to buy Gloom-resistant gear and items."
   },
   {
    "name": "Shrines and Light of Blessing",
    "what": "There are 152 shrines across Surface and Sky. Each gives a Light of Blessing. Trade 4 at any Goddess Statue for one heart or one stamina vessel."
   },
   {
    "name": "Heart and stamina swap",
    "what": "At the Horned Statue in the bunker beneath Lookout Landing you can rebalance hearts and stamina. It costs rupees: sell an essence for 100, buy the other back for 120."
   },
   {
    "name": "Battery and Energy Cells",
    "what": "Energy Cells power Zonai devices. Mine Zonaite in the Depths, trade 3 to a Forge Construct for a Crystallized Charge, then add cells at a Crystal Refinery."
   },
   {
    "name": "Skyview Towers",
    "what": "15 Skyview Towers reveal the regional map and launch you skyward. Open the shutters by solving each tower's small puzzle, then get fired into the Sky."
   },
   {
    "name": "Zonai devices and Autobuild",
    "what": "Zonai devices (fans, wheels, rockets) attach with Ultrahand. Autobuild rebuilds saved or recent creations from materials, spending Zonaite for missing parts."
   },
   {
    "name": "Great Fairies",
    "what": "Four Great Fairies (Tera, Cotera, Kaysa, Mija) upgrade armor. Unlock each by reuniting the Stable Trotters troupe, led by conductor Mastro, near a stable."
   },
   {
    "name": "Korok seeds and Hestu",
    "what": "Find Korok seeds (900 total) and give them to Hestu to expand your weapon, bow, and shield pouches. Many hide behind carry-a-Korok-to-its-friend puzzles."
   },
   {
    "name": "Dragon's Tears and geoglyphs",
    "what": "Visit the geoglyphs drawn across the Surface to unlock the Dragon's Tears memories, telling the Imprisoning War story out of order."
   },
   {
    "name": "Sage abilities and Sage's Will",
    "what": "The five sages grant abilities you trigger by their avatar (Tulin gusts, Yunobo charges, etc.). Offer 4 Sage's Wills at a Goddess Statue to boost one sage (about 1.3x)."
   },
   {
    "name": "The four temples and the fifth sage",
    "what": "Wind (Rito/Tulin), Fire (Goron/Yunobo), Water (Zora/Sidon), Lightning (Gerudo/Riju). Mineru, the fifth sage, comes from the Spirit Temple."
   }
  ],
  "upgrades": [
   "Hearts and stamina: collect Lights of Blessing from shrines (152 total) and trade 4 at a Goddess Statue for one heart container or one stamina vessel.",
   "Heart/stamina swap: at the Horned Statue in the Lookout Landing bunker you can rebalance later. It is not free; each swap nets about 20 rupees (sell 100, rebuy 120).",
   "Battery (Energy Cells): mine Zonaite in the Depths, trade 3 Zonaite per Crystallized Charge at a Forge Construct, then spend 100 charges per cell at a Crystal Refinery.",
   "Pouch slots: hand Korok seeds to Hestu to add weapon, bow, and shield inventory slots; costs climb as you expand.",
   "Armor: upgrade gear at any of the four Great Fairy fountains once unlocked, spending materials and rupees per level.",
   "Sage power: collect Sage's Wills (20 exist; some guarded by Gleeoks) and offer 4 at a Goddess Statue to strengthen a chosen sage's ability about 1.3x."
  ],
  "fairies": [
   {
    "name": "Tera",
    "location": "Near Woodland Stable in Eldin, by Pico Pond. You meet conductor Mastro and the Stable Trotters here; awaken Tera first to unlock the others.",
    "cost": "Free to unlock (reunite the Stable Trotters); armor upgrades then cost materials plus rupees"
   },
   {
    "name": "Cotera",
    "location": "Near Dueling Peaks Stable, south of Kakariko Village on the east side of Dueling Peaks.",
    "cost": "Free to unlock (reunite the next Stable Trotters musician); upgrades cost materials plus rupees"
   },
   {
    "name": "Kaysa",
    "location": "Near Outskirt Stable, southwest edge of Hyrule Field, west of the Coliseum Ruins.",
    "cost": "Free to unlock (reunite the Stable Trotters); upgrades cost materials plus rupees"
   },
   {
    "name": "Mija",
    "location": "Near Snowfield Stable in the South Tabantha Snowfield (cold region; pack warm gear).",
    "cost": "Free to unlock (final Stable Trotters performance); upgrades cost materials plus rupees"
   }
  ],
  "notes": "Web-verified against Nintendo Life, Game8, GameWith, ZeldaDungeon, Fextralife. CORRECTIONS to the source dataset: (1) The heart/stamina swap is done at the HORNED STATUE (also nicknamed the Cursed Statue), hidden in the Emergency Shelter bunker beneath Lookout Landing, unlocked via the \"Who Goes There?!\" quest. It is NOT a Goddess Statue and NOT a Bargainer/\"Statue of the Dead\" (those are the separate Poe-trading statues). (2) The swap is NOT free: you sell an essence for 100 rupees and rebuy the other type for 120, a net 20 rupees per swap. The source's own note that recommended dropping the Horned Statue reference was backwards and has been reversed. (3) Korok seed total corrected from 1000 to 900 (giving all to Hestu fully maxes pouches; the famous \"1000th\" is a meme/extra, but the real count is 900). (4) Softened \"press A\" sage-activation wording since activation differs per sage (Tulin gust on glide, Yunobo charge on aim+attack, etc.); walking up + prompt is the secondary cue. Confirmed accurate as given: 152 shrines, 120 Lightroots (names spelled backwards under Surface shrines), 15 Skyview Towers, 7 Bargainer Statues (1 Surface + 6 Depths), 20 Sage's Wills (some guarded by King Gleeoks), 4 Sage's Wills per upgrade at ~1.3x, 4 Lights of Blessing per vessel, 3 Zonaite per Crystallized Charge at a Forge Construct, 100 charges per Energy Cell at the Crystal Refinery, 4 Great Fairies (Tera, Cotera, Kaysa, Mija) unlocked via the Stable Trotters troupe led by conductor Mastro, Tera awakened first. Medium-high confidence on stable pairings; Tera-first ordering is firm. Note: Korok total of 900 is well documented but some count the bonus, so if your app already standardized on 900 keep it."
 },
 "RUNES": [
  {
   "id": "ultrahand",
   "name": "Ultrahand",
   "glyph": "magnesis",
   "from": "Ukouh Shrine, your first shrine on the Great Sky Island.",
   "what": "Grab, move, rotate and glue almost any object together to build bridges, vehicles, and machines from Zonai parts.",
   "tip": "Hold the button to fine-tune angle and distance; objects snap and turn yellow when they'll stick. Press up on the D-pad to detach mistakes."
  },
  {
   "id": "fuse",
   "name": "Fuse",
   "glyph": "sword",
   "from": "In-isa Shrine, the second Great Sky Island shrine.",
   "what": "Attach an object or material to a weapon, shield, or arrow to boost damage, change its effect, or add reach.",
   "tip": "Fuse a rock onto a flimsy stick for a hammer, or a Keese eyeball onto arrows for homing shots. It saves your weak weapons from breaking fast."
  },
  {
   "id": "ascend",
   "name": "Ascend",
   "glyph": "cryonis",
   "from": "Gutanbac Shrine, the third Great Sky Island shrine.",
   "what": "Swim straight up through any ceiling above you and pop out standing on top of it.",
   "tip": "Use it to skip climbing in caves and towers. Aim for a flat ceiling overhead, not slopes, and watch the cursor turn yellow when it's valid."
  },
  {
   "id": "recall",
   "name": "Recall",
   "glyph": "stasis",
   "from": "From Zelda's spirit at the Temple of Time on the Great Sky Island, after clearing the first three shrines.",
   "what": "Reverse an object's recent movement, sending it back along the exact path it just traveled.",
   "tip": "Ride a fallen sky rock back up to the islands, or send enemy projectiles flying back. Great for reaching high places without building."
  },
  {
   "id": "autobuild",
   "name": "Autobuild",
   "glyph": "gem",
   "from": "From a Construct at the Great Abandoned Central Mine in the Depths, during the quest A Mystery in the Depths (not on the Great Sky Island).",
   "what": "Instantly recreate saved or recently built Zonai constructions, spending Zonaite for parts you don't have on hand.",
   "tip": "Save favorite vehicles like a hover bike so you can rebuild them anywhere. Capturing schematics from machines you find expands your options."
  }
 ],
 "STATUS_RUNES": [
  {
   "name": "Ultrahand",
   "glyph": "magnesis",
   "step": "t_sky_ukouh_01"
  },
  {
   "name": "Fuse",
   "glyph": "sword",
   "step": "t_sky_inisa_02"
  },
  {
   "name": "Ascend",
   "glyph": "cryonis",
   "step": "t_sky_gutanbac_04"
  },
  {
   "name": "Recall",
   "glyph": "stasis",
   "step": "t_sky_tot_02"
  },
  {
   "name": "Autobuild",
   "glyph": "gem",
   "step": "t_castle_s6_st6"
  }
 ],
 "CHAMPIONS": [
  {
   "name": "Tulin's Gust",
   "from": "Wind Temple",
   "step": "t_wind_reward_3",
   "note": "Tulin's Gust"
  },
  {
   "name": "Yunobo's Charge",
   "from": "Fire Temple",
   "step": "t_fire_s_after_reward1",
   "note": "Yunobo's Charge"
  },
  {
   "name": "Vow of Sidon, Sage of Water",
   "from": "Water Temple",
   "step": "t_water_s6_q2",
   "note": "Vow of Sidon, Sage of Water"
  },
  {
   "name": "Vow of Riju",
   "from": "Lightning Temple",
   "step": "t_lightning_s_boss_st6",
   "note": "Vow of Riju"
  },
  {
   "name": "Vow of Mineru",
   "from": "The Fifth Sage",
   "step": "t_spirit_s5_1",
   "note": "Vow of Mineru"
  }
 ],
 "CATS": [
  {
   "id": "ability",
   "name": "Abilities",
   "glyph": "stasis"
  },
  {
   "id": "weapon",
   "name": "Weapons",
   "glyph": "sword"
  },
  {
   "id": "bow",
   "name": "Bows",
   "glyph": "bow"
  },
  {
   "id": "shield",
   "name": "Shields",
   "glyph": "shield"
  },
  {
   "id": "armor",
   "name": "Armor",
   "glyph": "armor"
  },
  {
   "id": "key",
   "name": "Key Items",
   "glyph": "key"
  },
  {
   "id": "material",
   "name": "Materials",
   "glyph": "gem"
  }
 ],
 "ROADMAP": [
  {
   "id": "shrines",
   "name": "152 Shrines",
   "sub": "Lights of Blessing",
   "note": "Every shrine grants a Light of Blessing; four trade for a heart or stamina vessel. The long-haul goal across Surface and Sky.",
   "reward": "Hearts & stamina"
  },
  {
   "id": "lightroots",
   "name": "120 Lightroots",
   "sub": "Light up the Depths",
   "note": "Each Lightroot mirrors a Surface shrine and lights a patch of the pitch-black Depths.",
   "reward": "A lit map below"
  },
  {
   "id": "koroks",
   "name": "1000 Korok Seeds",
   "sub": "Hestu again",
   "note": "Tiny puzzles all over Surface, Sky, and Depths. Trade to Hestu to expand your pouches.",
   "reward": "Bigger inventory"
  },
  {
   "id": "sages",
   "name": "Sage's Wills & armor",
   "sub": "Power up",
   "note": "Upgrade your sage abilities with Sage's Wills, and armor at the Great Fairies once you reunite Mastro's troupe.",
   "reward": "Stronger party & gear"
  },
  {
   "id": "sky_depths",
   "name": "Sky & Depths",
   "sub": "Two more Hyrules",
   "note": "Sky islands, the vast Depths, Yiga schematics, Zonai device dispensers, and the addisons — a whole game beyond the Surface.",
   "reward": "Exploration"
  }
 ],
 "TIPS": [
  {
   "id": "build",
   "name": "Build & Fuse freely",
   "items": [
    "Ultrahand + Fuse is the heart of the game — fuse rocks/monster parts to weapons for power, and stick Zonai devices together to travel.",
    "Out of battery in the sky? Recall a fallen platform and ride it back up, or glide.",
    "Autobuild (from the Fifth Sage) recreates your favorite vehicles for a little Zonaite."
   ]
  },
  {
   "id": "depths",
   "name": "Surviving the Depths",
   "items": [
    "The Depths are pitch black and full of Gloom that caps your hearts. Carry Brightbloom Seeds (throw or fuse to arrows) and light Lightroots.",
    "Cure gloom-damaged (cracked) hearts with Sundelion dishes or by warping to the Surface.",
    "Every Lightroot sits directly under a Surface shrine — a handy way to find shrines."
   ]
  }
 ],
 "terms": {
  "orbs": "Lights of Blessing",
  "orbWord": "lights",
  "runesLabel": "Abilities",
  "championsLabel": "Sage Vows",
  "regionBanner": "Temple"
 },
 "guideSegs": [
  [
   "runes",
   "Abilities"
  ],
  [
   "tips",
   "Tips"
  ],
  [
   "armor",
   "Armor"
  ],
  [
   "enemies",
   "Enemies"
  ],
  [
   "world",
   "World"
  ],
  [
   "settings",
   "Settings"
  ]
 ],
 "postRegionId": "t_depths",
 "TOWERS": [],
 "GREAT_FAIRIES": [],
 "SIDE_QUESTS": [],
 "REGION_MAPS": {},
 "MAP_NODES": {},
 "KOROKS": null,
 "MAP_BEASTS": []
};
const GAMES = { botw: { id:"botw", label:"Breath of the Wild", short:"BotW", REGIONS, SHRINES, ARMOR, BESTIARY, COOKING, KOROKS, WORLD, SIDE_QUESTS, TOWERS, GREAT_FAIRIES, REGION_MAPS, MAP_NODES, MAP_BEASTS, RUNES, TIPS, COOK_RULES, RECIPES, COOK_INGREDIENTS, CATS, ROADMAP, STATUS_RUNES, CHAMPIONS, terms:{orbs:"Spirit Orbs",orbWord:"orbs",runesLabel:"Runes Unlocked",championsLabel:"Champion Abilities",regionBanner:"Divine Beast"}, guideSegs:[["runes","Runes"],["tips","Tips"],["armor","Armor"],["fairies","Fairies"],["towers","Towers"],["quests","Quests"],["enemies","Enemies"],["koroks","Koroks"],["world","World"],["settings","Settings"]], postRegionId:"destroy_ganon" }, totk: TOTK };
/* GEN:DATA:END */
