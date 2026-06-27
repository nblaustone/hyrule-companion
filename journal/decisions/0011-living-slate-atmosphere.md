# ADR 0011 — The Living Slate: an atmosphere layer (procedural audio · circuit field · haptics)

**Status:** accepted (v18) · **Date:** 2026-06-26 · **Relates to:** [0001](0001-original-art-only.md)-era offline/asset-clean laws, [0006](0006-polish-one-companion.md)

## Context
With all 11 games at content parity (every dataset present or correctly N/A), the owner asked to make the
app "out of this world — futuristic, modern, spectacular." The agreed north star: **stop being a
walkthrough that *describes* Hyrule; finish building the *Sheikah Slate itself*** — an in-world device the
player holds in the real world. The owner greenlit starting with the highest-feel, lowest-risk piece: an
**atmosphere layer** ("The Living Slate"), with the offline AI oracle queued as the next, larger chase.

The hard constraint is the project's spine: the published `index.html` must stay a single, self-contained,
**offline, asset-clean** artifact (no external asset at runtime; the build fails on any external
`src`/`href`/`@import`). Anything atmospheric has to honor that — and the standing values of
reduced-motion respect and graceful degradation.

## Decision
Add a runtime atmosphere layer that is **100% generated on-device**, so it ships inside the offline build
with zero new assets:

1. **Procedural ambient audio (`SlateAudio`)** — a module-level singleton (lives *outside* React so it
   survives the per-game remount) that lazily boots a Web-Audio `AudioContext` **on a user gesture**
   (browsers require it) and synthesizes everything from oscillators + envelopes: a calm low drone whose
   chord **morphs per tab**, an occasional pentatonic shimmer, a boot arpeggio, and a check-on tick.
   **No audio files** → the offline/asset-clean law is untouched. Default **OFF** (never surprise the
   player with sound); toggled from a topbar speaker button and Settings.
2. **The circuit field (`SlateBackground`)** — a fixed `<canvas>` of drifting, linking Sheikah-tech nodes
   behind the app (`z-index:0`, `pointer-events:none`). JS-side **reduced-motion guard**: paints one
   static frame instead of animating. Only mounted when the Motion toggle is on.
3. **Haptics** — a guarded `navigator.vibrate(12)` on check-on (mobile only; silent no-op elsewhere).

All three are user-controllable in **Guide → Settings → "The Living Slate"** (Ancient circuitry · Ambient
sound · Haptic pulse) and persist in the existing `hyrule:prefs` key (`{spoiler, atmos:{motion,sound,haptics}}`).
They degrade gracefully: no Web-Audio/Canvas/Vibration support → the feature is simply absent, app unchanged.

## Consequences
- **First runtime audio + canvas + sensor use in the app.** The offline guarantee holds because nothing is
  fetched — it's all synthesized/drawn at runtime. `build.mjs`'s offline check still passes.
- **Defaults are conservative:** motion on (but reduced-motion-respecting), sound off, haptics on. The app
  feels the same until the player opts into sound.
- **Establishes the pattern** for the larger "Living/Thinking Slate" arc — next up: the on-device AI oracle
  ("Ask the Slate"), which will follow the [0009](0009-on-device-bookshelf.md) device-local (IndexedDB)
  pattern so the published artifact stays ~1 MB and asset-clean.
- **Not in the backup blob** — atmosphere prefs are cosmetic, not progress, so they're intentionally left
  out of export/import.
