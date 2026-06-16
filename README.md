# Hyrule Companion

A mobile, **offline** walkthrough + living pouch for *The Legend of Zelda: Breath of the Wild* (Switch).
Sheikah-Slate styled. One thumb, one screen, your whole first playthrough — checkmarks and inventory persist
on-device with no account and no server.

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
