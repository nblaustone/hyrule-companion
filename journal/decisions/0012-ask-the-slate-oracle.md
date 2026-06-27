# ADR 0012 — Ask the Slate: an offline, grounded oracle (retrieval now, on-device LLM next)

**Status:** accepted (v18.1, Phase 1 shipped) · **Date:** 2026-06-26 · **Builds on:** [0009](0009-on-device-bookshelf.md) (device-local heavy assets), [0011](0011-living-slate-atmosphere.md) (the Living Slate arc)

## Context
The "finish building the Sheikah Slate itself" arc's headline feature: a companion you can **talk to** —
*"where do I go after the Zora?"* / *"what beats a Lynel?"* / *"fastest rupees?"* — answered in plain
language, **fully offline**, with voice. The owner greenlit it.

The tension is the project spine: the published `index.html` is a single, self-contained, **offline,
asset-clean** artifact (`build.mjs` fails on any external `src`/`href`/`@import`; first load needs no
network). A real LLM is hundreds of MB and its weights + the WebLLM engine load from a CDN — that cannot
live in the 1 MB build, and the first download needs network.

A 5-agent research sweep (run as a workflow) established the facts: MLC **WebLLM `@mlc-ai/web-llm` 0.2.84**,
loadable via a runtime `import("https://esm.run/@mlc-ai/web-llm@0.2.84")`, OpenAI-shaped
`engine.chat.completions.create`, weights cached to the **Cache API / IndexedDB** → **fully offline after a
one-time download**. **WebGPU** is required (Chrome/Edge 113+, Firefox 141+, Safari macOS Tahoe 26 / **iOS
26**); feature-detect `navigator.gpu`. A ~1B q4f16 instruct model (e.g. `Llama-3.2-1B-Instruct-q4f16_1-MLC`,
~0.9 GB; fallback `Qwen3-0.6B`/`gemma3-1b`) suits a phone. iOS Safari evicts storage under pressure →
`navigator.storage.persist()` + a re-download path; `file://` has no WebGPU/Cache (works only from the
Pages origin / installed PWA).

## Decision
Split the oracle into two phases so the law-abiding, verifiable value ships now and the LLM is additive.

### Phase 1 (shipped v18.1) — the grounded retrieval oracle. 100% offline, asset-clean, in the build.
- A natural-language **retrieval engine (`slateRetrieve`)** over the app's OWN verified data — shrines +
  solutions, enemy battle guides, side-quest how-tos, armor recipes, cooking, the item compendium,
  walkthrough stuck-hints, towers, and the Money/economy guide. Tokenizes the question, scores records
  (name match ≫ body), returns a ranked best answer + related hits, each carrying a deep-link.
- **The honesty law is structural here:** it answers ONLY from those records. No match → it SAYS so
  ("I couldn't find that… I won't guess"). It cannot invent, because it never generates — it retrieves.
- A conversational overlay (`SlateOracle`, portaled, safe-area-aware) with voice: **SpeechSynthesis**
  reads the answer (on-device); **SpeechRecognition** for voice input (online-assisted where the platform
  requires it — typing always works offline). Data-derived suggestion chips guarantee a strong first hit.
- Entry: a topbar ✦ button (+ logo-only topbar on phones to make room — the eye is the brand mark).

### Phase 2 (planned, opt-in, device-local) — the on-device LLM on top.
- When the owner taps "Download the oracle brain (~X MB, one time)", dynamically `import()` WebLLM from the
  CDN and `CreateMLCEngine(model)`; cache weights locally (Cache API/IndexedDB) → offline forever after.
- **RAG, not free generation:** Phase 1's retrieval IS the grounding — feed the top records as context and
  prompt the model to answer ONLY from them and cite which record, preserving "don't invent". Run in a Web
  Worker; request `navigator.storage.persist()`.
- **Asset-clean preserved (the [0009] split):** nothing ships in the repo/build; the model is fetched
  on-device once, gated behind an explicit user action. The dynamic `import()` is a RUNTIME request (not a
  static `<script src>`), so `build.mjs`'s offline check still passes. **Verify that against build.mjs
  before shipping Phase 2.** Feature-detect WebGPU and degrade to Phase 1 retrieval when absent (no WebGPU,
  `file://`, or a declined download → the oracle still works, just without synthesis).

## Consequences
- The oracle is useful and verifiable TODAY with zero model and zero new network — and it stays useful as
  the LLM's grounding layer, so Phase 1 is not throwaway.
- Phase 2 is the first feature that needs the network ONCE (opt-in) and a WebGPU device; it's the second
  use (after the Bookshelf) of the device-local heavy-asset pattern, and must degrade gracefully.
- Voice input is the one piece that may need network on iOS (platform limitation); typing is the offline
  guarantee. Stated honestly in-app.
