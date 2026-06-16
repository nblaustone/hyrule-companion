# 0006 — v9: polish one companion (no modes, no map rewrite)

**Status:** accepted · 2026-06-16

**Chose:** v9 is a **polish pass on the single existing companion**, not a new architecture. After a long
brainstorm the user twice talked the scope *down* — first from a 3-lens map, then from three "companion
personalities" (beginner/medium/light) — landing on: *one companion, made amazing*. The north star is the
GameFAQs text walkthrough the user grew up with — linear, trustworthy, there-when-stuck — but one that **knows
where you are, never spoils you by accident, and is always one tap from the thing you're stuck on.** v9 ships
four things against that thesis, all inside `HyruleCompanion.jsx`, all offline, no new tabs:

1. **Joy pass.** A Sheikah "activation" pulse when a step is checked (`box-flash`: an ember→cyan ring sweep +
   micro-bounce, driven by a transient `flash` state so it fires only on check-*on*, never on load), a section
   fade-in (`stepsIn`), a cross-tab fade (`key={tab}` on `<main>` + `fadeIn`), and `:active` press on the common
   tap targets. Every new animation sits above the existing global `prefers-reduced-motion` kill-switch, so
   reduced-motion users get none of it for free.
2. **Resume — "you're here."** A `resumeTarget` memo = the first incomplete checkable step in linear path order;
   surfaced as a persistent topbar pin (reachable one-thumbed from every tab) and the Status hero button.
   `jumpToStep` opens the section, centers the step, and flashes it (`step-hl`). This is the one thing GameFAQs
   never had, and it's nearly free given the flat `{stepId:true}` progress map.
3. **Progressive spoiler reveal.** The v8 shrine-only spoiler toggle becomes a **path-aware veil**: when spoiler
   mode is on, regions *ahead* of `resumeTarget` (`regionIndex > resumeIdx`, and not while searching) blur their
   champion banner, section reward banners, and `k:"reward"` step payoffs behind per-item "tap to reveal." It
   protects the player from scrolling ahead — the exact failure mode of the walkthroughs we're honoring.
4. **"Stuck?" reveals.** A new `stuck` field on a step renders a hidden "Stuck? tap for the exact how" disclosure
   (`StuckReveal`) — the GameFAQs "scroll down for the answer," but the step stays scannable and the precise how
   is one tap away. Content authored by a **sourced fan-out workflow** (author → adversarial web-verify, one
   agent per region), holding the same honesty bar as the rest of the guide (law #1).

**Why:** The user is happy with the app ("nothing major — just polish it") and uses it three ways (quick lookup,
comfy read, always-on). That's a "make the good thing shine" situation, not a "what's broken" one. New concepts
(map lenses, companion modes) were explicitly cut by the user as over-build. Each of the four is independently
lovable and ships behind the v8 service worker's auto-update, so they could land as a sequence — but were built
and verified together as one pass at the user's request.

**Rejected:**
- *The unified 3-lens map (Teach/Compass/Reference)* — the user's "three" meant companion intensities, not map
  lenses; then even that was cut. Reopening it would re-add the scope they removed.
- *Three companion personalities as a global intensity switch* — cut by the user: "one version, completely
  amazing… build from there." The existing spoiler toggle already gives the one axis that earns its keep.
- *Hand-authoring the "Stuck?" hints inline* — faster, but breaks law #1 (every fact traces to a real source).
  The workshop pattern (sourced author + adversarial verify) is how the rest of the guide was built; the hints
  hold the same bar. An empty hint set for a region is an honest, acceptable result.
- *A separate "hints" dataset / knowledge JSON* — the walkthrough lives hand-authored in the `.jsx` (not in the
  `GEN:DATA` block), so `stuck` is a field on the existing step objects, applied by `build/apply-stuck.mjs`. No
  pipeline change; `node build/build.mjs` is the only build step.

**Consequences:**
- `build.mjs` now also destructures `useRef` from the global React (the resume/flash logic needs a ref). Any
  future hook used in the `.jsx` must be added to that `head` line or it's `undefined` at runtime — caught this
  exact way in v9 (white-screen `ReferenceError: useRef is not defined`).
- The spoiler veil keys off `resumeTarget`; "ahead of you" is defined by linear region order, so a future
  re-ordering of `REGIONS` shifts what's veiled. Optional/collectible regions (Memories) veil early by design —
  they're heavy story spoilers.
- TotK inherits the joy pass, resume, and progressive-spoiler veil automatically (shared components/state). It
  has **no `stuck` hints yet** — that's a future sourced sweep, same workflow, when TotK depth is the focus.
- The "Stuck?" content is regenerable: `build/extract-walkthrough.mjs` → `build/gen-stuck-workflow.mjs` →
  Workflow → `build/apply-stuck.mjs`. Re-running is idempotent (skips steps that already carry a `stuck` field).
