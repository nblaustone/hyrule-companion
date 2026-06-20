# Hyrule Companion

A mobile, **offline**, Sheikah-Slate-styled companion for *The Legend of Zelda: Breath of the Wild* (Switch) —
built so a first-timer can play the whole game with one thumb. A living walkthrough + a complete, searchable
reference, with progress that persists on-device (no account, no server, works in airplane mode).

**What it covers (all sourced + adversarially verified):**
- **120 shrines** — region-grouped, with maps and a spoiler-gated **full solution** for every one (hidden shrines
  include how to make them appear).
- **Combat** — a Combat Basics primer + **"how to win this fight"** guides for the 26 marquee bosses/enemies.
- **Armor** — every set with **per-★ upgrade recipes** (materials + rupees) and where to farm them.
- **Cooking** — an interactive pot simulator + goal finder over 120 ingredients.
- **Quests** — the complete **78 side quests** (each with a how-to) + all **38 shrine quests**, cross-linked.
- **Items** — a **410-entry Compendium**: every weapon, bow, shield, armor piece, material, and creature; tap any
  for its stats, what it does, where to find it, and sell value.
- **Money** (rupee + farming guide), a **Korok puzzle solver**, a **"what to do next" coach**, and a from-scratch
  **Lore** reader + on-device bookshelf.
- **Answer-first search** — one tap on the magnifier; type a shrine/boss/recipe/item and the answer opens inline.

Also home to a second game (**Tears of the Kingdom**) behind a game picker; the BotW build is the gold-standard
shell future games inherit.

## 📱 Use it on your phone
**Live:** https://nblaustone.github.io/hyrule-companion/
1. Open that link in **Safari** on your iPhone.
2. Tap **Share** (the box-with-arrow) → **Add to Home Screen** → **Add**.
3. Launch it from the home-screen icon — it runs full-screen, works **offline**, and remembers your progress.

(On Android/Chrome: open the link → menu → **Install app**.) The whole thing is one self-contained file —
once it's loaded once, you never need a signal again.

```bash
node build/build.mjs      # compile the React source → a single self-contained index.html
open index.html           # works offline by double-click; on iPhone: Share → Add to Home Screen
```

- **`HyruleCompanion.jsx`** — the source (one React component; also runs as a Claude artifact).
- **`index.html`** — the built, self-contained, offline app. This is the one you put on your phone.
- **`CLAUDE.md`** — what it is, how it's built, the conventions, the three laws.
- **`journal/`** — the project's decisions (ADRs) + an append-only learning log.
- **`knowledge/`** — verified BotW data that feeds the app's reference tabs.

Original art only — no Nintendo assets. Every walkthrough step is cross-checked against real guides. Built to
work in airplane mode.
