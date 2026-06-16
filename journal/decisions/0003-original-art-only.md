# 0003 — Original art only; describe, never embed

**Status:** accepted · 2026-06-15

**Chose:** Every visual is **ours** — hand-drawn inline SVG glyphs, CSS, an original Sheikah-inspired palette and
original typefaces (web fonts with generic fallbacks). We **never** embed Nintendo screenshots, sprites, map tiles,
official logos, or the game's actual fonts. Text is our own writing that *describes* the game; it is not copied
from a guide or the game's script.

**Why:** This is a fan companion. Keeping it firmly transformative and asset-clean is both the right thing and the
durable thing — it can be shared, hosted, or installed without sitting on someone else's copyrighted art. The
Sheikah look is achieved with our own geometry (the eye glyph, the rune icons), not ripped assets.

**Rejected:**
- *Pull official shrine/region images for clarity* — convenience now, takedown risk forever. A clean schematic map
  we drew (see `PlateauMap`) communicates enough.
- *Use the in-game UI font* — replaced with Cinzel/Rajdhani/Inter as a look-alike spirit, not the real thing.

**Consequences:** New icons mean a new `case` in `Glyph()`, not an `<img>`. Maps are schematic SVG we author. If a
section really needs a picture, we draw it. This is a hard line, not a preference.
