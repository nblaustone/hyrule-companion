# ADR 0009 — On-device Bookshelf: the owner's own books, private to the device

**Status:** accepted (v12) · **Date:** 2026-06-18 · **Amends:** [0003](0003-original-art-only.md)

## Context
The owner gave the project a folder of real Zelda books/comics he owns copies of — *Hyrule Historia*,
the *Ocarina of Time* manga vol. 2, the official *BotW Explorer's Guide*, the unofficial *BotW Game
Guide* (The Yuw), and *OoT: Pathways to Adventure*. He asked for two things: **(1)** use them to
cross-check our content for accuracy, and **(2)** have *all of them readable inside the app's library,
on his phone.* He was explicit: "change the rule — I'm using this privately on my phone."

ADR 0003 forbids embedding Nintendo (or any third-party) assets. It was written for one reason: the app
is **published to a public GitHub repo / Pages**, and shipping copyrighted scans there is real
redistribution (and GitHub hard-rejects files > 100MB — *Hyrule Historia* alone is 181MB). That reason
is about **publishing**, not about the owner reading his own books on his own device.

## Decision
Split the concern that ADR 0003 conflated:

1. **The published build stays asset-clean — ADR 0003 holds, unchanged, as a hard line.** No copyrighted
   page, scan, font, or sprite ever enters `HyruleCompanion.jsx`, `knowledge/`, the built `index.html`,
   `docs/`, or the repo. All of *our* art remains original SVG. The public artifact is unaffected.

2. **The owner may load his own copies into private, on-device storage.** A new **Bookshelf** (in the
   Lore tab) is a *reader* — neutral tooling, like any ebook/comic app. The books live **only in the
   device's IndexedDB**, imported once by the owner; they are never uploaded, never committed, never in
   the published file. This is the same posture already accepted in ADR 0008 for the private cover-image
   slot ("neutral tooling + the user's own image"), scaled up to whole books.

### Mechanics (the guardrails that make this safe)
- **Source books live in iCloud, never in the repo.** `build/pack-books.mjs` (a **local** tool, not part
  of the build) turns each source into a downscaled `<id>.hbook.zip` pack written to
  `iCloud/Zelda/_companion-packs/` — which syncs to the phone's Files app. Downscaling (sips, ~1200–1500px,
  q70) collapses ~250MB of source to ~159MB of packs.
- **Packs are STORE-ONLY zips.** JPEGs are already compressed, so `zip -0` costs nothing — and the in-app
  reader parses them with a ~30-line zero-dependency `readHbook()` (central-directory walk + byte slice).
  No decompression library is shipped; the offline build stays ~1MB.
- **Two storage tiers.** Page **blobs** go to a dedicated IndexedDB db (`hyrule-books`); only a tiny book
  **index** (`hyrule:books`) rides in the normal `store`. `navigator.storage.persist()` is requested so
  iOS is less likely to evict.
- **Two readers, by type.** `type:"pages"` (comics + PDF guides, rendered to page images) → new
  `BookReader` (swipe / fit-page ↔ fit-width / progress). `type:"text"` (the EPUB, parsed to `blocks`) →
  reuses the existing `LoreReader` reflow engine. Reading state reuses `hyrule:reading` / `hyrule:bookmarks`.
- **Belt-and-suspenders against publishing.** `.gitignore` blocks `*.hbook.zip`, `*.cbr`, `*.cbz`,
  `_companion-packs/`, `books/`. The "always ship it" auto-push therefore *cannot* carry a book artifact
  even by accident. The offline-check in `build.mjs` still guarantees zero external requests.

## Why this is the right line
The distinction is **publish vs. read-my-own-copy.** ADR 0003 protects the *published artifact* from
hosting other people's art — that danger is unchanged and still fully respected. Letting the owner open
books he owns, stored only on his own phone, through neutral reader tooling, is categorically different —
it's what any reader app does. Nothing copyrighted is ever distributed by us.

## Consequences
- The books also become the **best sourcing input we have** for law #1 (don't invent): the official
  Explorer's Guide and *Hyrule Historia* are stronger cross-checks than the web guides we already cite.
  (Accuracy cross-reference pass: see learning log / follow-up.)
- `pack-books.mjs` is re-runnable; re-pack when a source changes. It is **not** wired into `build.mjs`.
- Storage is finite; 159MB fits comfortably, but a future "manage storage / total size" affordance may be
  worth adding if the shelf grows.
