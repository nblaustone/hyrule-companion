# Hyrule Compendium — Lore Style Bible

> The contract every Lore Library chapter is written and edited against. Voice locked v1 (2026-06-18),
> proven by the chapter **"When the Sky Turned Red."** Read this before writing or editing any lore.

## The voice in one line
A master fantasy novelist — someone with a folklorist's grounding in myth — telling an ancient legend
so vividly and so clearly that a newcomer reads it at speed and a lifelong fan still feels the weight.

The lineage: **Ursula K. Le Guin and Patricia McKillip.** Lyrical, sensory, layered — but never archaic,
never a dry explainer, never purple.

## The rules
1. **Concrete images do the work.** Awe is *earned* through specifics (the cold blue of a Guardian's
   eye, dust of a century on the skin), never *asserted* with adjectives ("epic," "vast," "incredible").
2. **Modern, fluid syntax.** No "thee/thou/ere/it came to pass." A first-timer must follow it easily.
   We rejected a Tolkien/Silmarillion register for being "too horseman-like" — keep it readable.
3. **Vary the rhythm.** Long flowing sentence, then a short one that lands. Earn your fragments.
4. **A told-tale intimacy.** The narrator may speak to the reader ("...if you count Link. Count Link.").
5. **Layered worldbuilding, woven in.** Drop history and texture mid-sentence; don't stop to lecture.
6. **Warmth where it's real.** The Champions were people. State loss plainly; don't milk it, don't gloss it.
7. **Earn every word.** Draft, then cut ~20–30%. If a word isn't carrying weight, it's dead weight.

## The banned-slop list (an edit pass kills these on sight)
> "rich and vibrant" · "delve" · "steeped in" · "shrouded in mystery" · "little did they know" ·
> "iconic"/"legendary" as filler · "it's worth noting" · hollow superlatives (epic/vast/incredible) ·
> adjective pile-ups · mixed metaphors · vague mystical filler · three-item lists that don't need three ·
> the "not just X, but Y" reflex · stacked em-dashes · ending on a limp rhetorical question.

## Honesty (the app's signature — non-negotiable)
- **Nothing un-sourced ships.** Every claim traces to *Hyrule Historia*, the *Zelda Encyclopedia*,
  *Creating a Champion*, or in-game text. The build can gate on it (`assemble-lore.mjs`).
- **Three visible tags.** `Canon` (official book / in-game), `Creator note` (an Aonuma/Fujibayashi
  interview), `Theory` (a fan reading, labeled as such). When Nintendo left something open — *where BotW
  sits on the timeline* — say so. An honest "we don't know" beats a confident guess.
- **Cross-game lore is flagged.** Demise's curse, the goddesses, the Master Sword's origin come from other
  games; name the source rather than implying it's all BotW.
- **Original words only.** We cite the books; we never copy their prose, art, or fonts. A short, attributed
  in-game phrase is the most we ever quote.

## Shape of a chapter
- ~450–750 words. Page-turn-sized, built to be *read*.
- Open on a concrete image or a hook — never a definition.
- Mostly paragraphs (`t:"p"`). At most one pull-quote (`t:"pq"`) and one–two tagged callouts
  (`t:"note"`, `kind:"canon"|"creator"|"theory"`). An optional subheading (`t:"h"`) only if it truly helps.
- Original SVG illustrations (`t:"art"`) are added by hand, chapter by chapter — never gate the writing on art.

## The standard
"When the Sky Turned Red" is the reference. New chapters are written to match its voice, rhythm, and
honesty, then run through the two-pass gate (fact-check against the source sheet + slop-hunt against this
list) before they ship.
