# ADR 0008 — The Lore Library (a real reader for sourced Zelda lore)

**Status:** accepted (v11) · **Date:** 2026-06-18

## Context
The companion teaches a first-timer how to *play* BotW. The user (and his son) asked for the other
half: the **actual, legitimate lore** — the story of Hyrule and how this game connects to all the
others — presented in "a really amazing reader," modeled on the EPUB reader in the user's separate
`~/Desktop/preg` app. That reader is a heavyweight epub.js/RN/Firebase stack; only its *design* ports.

## Decision
Add a 7th tab, **Lore**, that is a from-scratch reader over original, sourced prose — no epub.js, no
network, fully offline like the rest of the app.

- **Content model.** Each chapter is a typed `ReadBlock[]` (`t: "p" | "h" | "pq" | "note"`; notes carry
  `kind: canon | creator | theory` + a `source`). Lives in `knowledge/lore.json`, inlined to the
  `LORE` const by `build/inline-data.mjs`. **Shared cross-game** (referenced directly, not per-game),
  since the lore is series-wide.
- **The reader (`LoreReader`).** Page-turn, not scroll (user's choice). Engine = CSS multi-column flow
  inside a fixed-height viewport, shifted by `translateX` one page-stride at a time. The load-bearing
  invariant: **column width must equal the viewport's inner width** so the single column can't stretch;
  page margins come from padding the *viewport* (`.lore-view`, 18px), and stride = `innerW + GAP`. (Got
  this wrong first pass — a block column stretched to fill, drifting 20px/page and clipping text. Fixed.)
  Re-paginates on resize, font-size, theme, and settings-bar open (height changes).
- **Premium feel, ported from the preg reader's *design*:** 4→3 themes (slate / sepia / night) via CSS
  vars on the reader root; A−/A+ font steps; a persistent **Continue reading** card; per-chapter
  **progress ring**; **bookmarks**; honest progress (page x / y). State is top-level `hyrule:*`
  (`hyrule:reading`, `hyrule:bookmarks`, `hyrule:readerprefs`) so it survives a game switch.
- **Voice (locked, see `docs/lore-style-bible.md`).** Auditioned three registers on one chapter:
  Andy Weir "clear explainer" (rejected), Tolkien/Silmarillion (rejected — "too horseman-like"), and
  the chosen **lyrical-folklore master-novelist** voice (Le Guin / McKillip lineage). Approved on
  "When the Sky Turned Red."
- **Honesty (inherits law #1).** Every claim traces to a fact-sheet sourced from *Hyrule Historia* /
  *Encyclopedia* / *Creating a Champion* / in-game; `canon`/`creator`/`theory` tags render in the UI;
  BotW's timeline branch is never asserted (Nintendo left it open). Authoring pipeline: per chapter,
  **source (cited fact-sheet) → draft to the bible + exemplar → adversarial edit (fact-check + slop-hunt)**,
  run as a background `Workflow` (the writers' room). The author gate stands: a sample is vetted before
  scale.

## v1 contents
Seven chapters, a reading arc: creation (goddesses) → the cycle (Demise's curse) → the timeline (the
three-branch split, BotW unconfirmed) → the Master Sword → the Great Calamity → the four Champions →
the peoples of Hyrule.

## Consequences / deferred
- Original SVG **illustrations** (`t:"art"`) — **done**: 7 chapter-banner scenes authored via a parallel
  illustration Workflow, sanitized offline-safe (script/external-ref stripped), rendered as the reader's top
  banner. Plus a **private cover-image slot** — a device-local picker (`hyrule:loreart`, base64 in
  localStorage, never in the file/repo) lets the user set any image of their own as a chapter banner. This is
  the agreed answer to "I want real Zelda art": neutral tooling + original art; we never embed Nintendo's
  assets ourselves (ADR 0003 holds; the app is published to Pages, so "not selling it" doesn't clear copyright).
- No `assemble-lore.mjs` honesty gate yet (chapters are workflow-generated + reviewed, then merged into
  `lore.json` by hand); add one if the library grows.
- More chapters (TotK-specific, individual older games) can slot in as further `LORE` entries.
- Build note: the reader uses only the hooks already in `build.mjs`'s destructure (`useRef` included).
