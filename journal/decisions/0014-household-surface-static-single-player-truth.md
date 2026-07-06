# ADR 0014 — The household surface: a static, single-player truth for the brain

**Status:** accepted · **Date:** 2026-07-06 · **Builds on:** [0001](0001-single-file-component.md), [0002](0002-offline-first-localstorage.md)

## Context
Nathan's cross-app brain renders a Household tab from each repo's zero-PII `ops/household.json`
(first names, roles, status, waiting-invite count — never uids, emails, or content). Eight of nine
apps publish one; the Hyrule Companion was the last "not reporting yet" line on that tab.

## Chose
Publish a **committed, static** `ops/household.json` stating the app's structural truth: one member
(Nathan, owner), zero invites, and an `invitePath` that says plainly why there is no door — this is a
single-player companion with no accounts or profiles; progress lives in device-local localStorage
(ADR 0002) and never reaches the repo.

## Why static, and why no activity pulse
Every dynamic sibling publisher derives its pulse from something the repo can honestly observe
(vault/tide read membership metadata; coin uses real hand-action mtimes). This repo can observe
nothing about play — progress never leaves the phone — so the file **omits `lastActiveDay` entirely**
and says so in its own `note`. A dash with a reason beats a fake pulse (the house honesty law). The
file only changes if the app's structure changes (e.g. profiles ever exist), so a static commit IS
the freshness story.

## Rejected
- *A generated/stamped publisher script* — there is nothing changing to stamp; a fresh `generatedAt`
  every day would fabricate the impression of a measured pulse.
- *Skipping the surface* — "not reporting" reads as a gap; the honest state is "reporting: nothing to
  report, by design."

## Consequences
The brain's Household tab reads zelda as its ninth surface: "Nathan (owner)" with the no-door line
rendered verbatim. The guardrail sweep (ADR 0013) is unaffected — its single-file law scopes to
`.jsx`/`.html`, and `ops/household.json` is data, like the tracked `knowledge/*.json`.
