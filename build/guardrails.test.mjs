#!/usr/bin/env node
/* ============================================================
   Hyrule Companion — guardrail sweep (ADR 0013)
   Mechanically enforces the repo's own written laws. Every
   invariant below cites where the law is written; nothing here
   is a new rule. A red sweep means a law is being broken.

   Run:  node build/guardrails.test.mjs        (zero dependencies)

   THE WIDEN-ONLY RULE (inherited from nala's guardrails #8 /
   the family safety spine): adding a new forbidden pattern or
   tightening a matcher is ALWAYS allowed without sign-off;
   removing or narrowing a matcher — or growing an allowlist —
   requires the owner's explicit sign-off and a new ADR.
   Never weaken a matcher to make a violation pass.

   Spec: docs/guardrails.md maps invariant -> matcher -> scope.
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJSON = (p) => JSON.parse(read(p));

/* the sweep judges the REPO (what ships / what's published), so file
   selection is driven off git ls-files — untracked local junk is not law. */
const ls = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (ls.status !== 0) { console.error("guardrails: `git ls-files` failed — run inside the repo"); process.exit(1); }
const TRACKED = ls.stdout.split("\0").filter(Boolean);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ------------------------------------------------------------------
   #1 — OFFLINE / AIRPLANE MODE: the built artifacts make zero external
   STATIC requests. (ADR 0002, ADR 0004; CLAUDE.md "Not a networked
   app… must work in airplane mode" + "The offline guarantee is
   mechanical".) The matcher is build.mjs's own: an external
   src= / href= / @import url( is a bug. Inert plain-string URLs
   (SVG xmlns, the esm.run dynamic-import literal, YouTube watch
   links, lore source strings) are runtime-opt-in by design
   (ADR 0012, v24) and deliberately NOT flagged.
   ------------------------------------------------------------------ */
const STATIC_REQ = /(?:src|href)\s*=\s*["']https?:\/\/|@import\s+url\(\s*["']?https?:/gi;
for (const f of ["index.html", "docs/index.html"]) {
  test(`#1 ${f} has zero external static requests (src/href/@import)`, () => {
    const hits = read(f).match(STATIC_REQ) || [];
    assert.equal(hits.length, 0, `${f}: external static request(s) left in the build: ${[...new Set(hits)].join(" | ")}`);
  });
}
for (const f of ["sw.js", "docs/sw.js"]) {
  test(`#1 ${f} references no external URL at all`, () => {
    const hits = read(f).match(/https?:\/\/[^\s"'`)]+/g) || [];
    assert.equal(hits.length, 0, `${f}: external URL(s) in the service worker: ${hits.join(" | ")}`);
  });
}
for (const f of ["manifest.webmanifest", "docs/manifest.webmanifest"]) {
  test(`#1 ${f} icons/start_url/scope are local`, () => {
    const m = readJSON(f);
    for (const k of ["start_url", "scope"])
      assert.ok(!/^https?:\/\//.test(m[k] || ""), `${f}: ${k} must be local, got ${m[k]}`);
    for (const icon of m.icons || [])
      assert.ok(!/^https?:\/\//.test(icon.src || ""), `${f}: icon src must be a local path or data: URI, got ${String(icon.src).slice(0, 60)}`);
  });
}

/* ------------------------------------------------------------------
   #2 — ORIGINAL ART ONLY / ASSET-CLEAN REPO: no raster image, font,
   audio, or video binary is ever tracked — the only rasters allowed
   are the four build-generated Sheikah-eye icons. (ADR 0003 "we never
   embed Nintendo screenshots, sprites, map tiles, official logos, or
   the game's actual fonts"; v29.0 "no Nintendo audio"; ADR 0009 keeps
   the published repo asset-clean — book formats pdf/epub/cbr/cbz and
   zips never enter git.) Widen-only: extending BIN_EXT is free;
   growing ICON_ALLOW needs an ADR.
   ------------------------------------------------------------------ */
const ICON_ALLOW = new Set(["icon-512.png", "icon-180.png", "docs/icon-512.png", "docs/icon-180.png"]);
const BIN_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|heic|ico|ttf|otf|woff2?|eot|mp3|m4a|wav|ogg|aac|flac|mp4|mov|webm|mkv|pdf|epub|zip)$/i;
test("#2 only the 4 generated Sheikah-eye icons may be binary assets", () => {
  const offenders = TRACKED.filter((f) => BIN_EXT.test(f) && !ICON_ALLOW.has(f));
  assert.equal(offenders.length, 0, `tracked binary asset(s) outside the icon allowlist: ${offenders.join(", ")}`);
  for (const icon of ICON_ALLOW)
    assert.ok(TRACKED.includes(icon), `expected PWA icon missing from the repo: ${icon}`);
});

/* ------------------------------------------------------------------
   #3 — THE BOOKSHELF BELT (ADR 0009): the owner's book artifacts are
   device-local forever. .gitignore must keep all five declared
   patterns, and no tracked path may match them.
   ------------------------------------------------------------------ */
const BOOK_PATTERNS = ["*.hbook.zip", "*.cbr", "*.cbz", "_companion-packs/", "books/"];
test("#3 .gitignore carries all five ADR-0009 book patterns", () => {
  const gi = read(".gitignore");
  for (const p of BOOK_PATTERNS)
    assert.ok(gi.split(/\r?\n/).some((l) => l.trim() === p), `.gitignore must contain the ADR-0009 line "${p}"`);
});
test("#3 no book artifact is tracked", () => {
  const offenders = TRACKED.filter((f) =>
    /\.hbook\.zip$|\.cbr$|\.cbz$/i.test(f) || /(^|\/)(_companion-packs|books)\//.test(f));
  assert.equal(offenders.length, 0, `ADR-0009 book artifact(s) tracked in git: ${offenders.join(", ")}`);
});

/* ------------------------------------------------------------------
   #4 — SINGLE-FILE DISCIPLINE (ADR 0001): one React component, one
   built deliverable (+ its GitHub-Pages mirror). A second app source
   or page appearing in git is the law breaking.
   ------------------------------------------------------------------ */
test("#4 the only tracked .jsx/.tsx is HyruleCompanion.jsx", () => {
  const src = TRACKED.filter((f) => /\.(jsx|tsx)$/.test(f)).sort();
  assert.deepEqual(src, ["HyruleCompanion.jsx"], `single-file law: unexpected app source file(s): ${src.join(", ")}`);
});
test("#4 the only tracked .html are index.html and its docs/ mirror", () => {
  const html = TRACKED.filter((f) => /\.html$/.test(f)).sort();
  assert.deepEqual(html, ["docs/index.html", "index.html"], `single-file law: unexpected page(s): ${html.join(", ")}`);
});

/* ------------------------------------------------------------------
   #5 — BUILD COHERENCE: index.html is generated, docs/ is its byte-
   identical GitHub-Pages mirror, and the app/sw version stamps agree.
   (ADR 0004 "don't hand-edit index.html"; build.mjs step 6 mirrors
   the site into docs/; house rule "build and sanity-check before
   pushing so we never deploy a white-screen".) Drift here means a
   hand edit or a partial build.
   ------------------------------------------------------------------ */
const MIRROR = [["index.html", "docs/index.html"], ["sw.js", "docs/sw.js"],
  ["manifest.webmanifest", "docs/manifest.webmanifest"],
  ["icon-512.png", "docs/icon-512.png"], ["icon-180.png", "docs/icon-180.png"]];
test("#5 docs/ (GitHub Pages) is a byte-identical mirror of the build", () => {
  for (const [a, b] of MIRROR) {
    const same = readFileSync(join(ROOT, a)).equals(readFileSync(join(ROOT, b)));
    assert.ok(same, `Pages mirror drifted: ${b} != ${a} — rerun node build/build.mjs`);
  }
  assert.ok(existsSync(join(ROOT, "docs/.nojekyll")), "docs/.nojekyll missing (Pages must serve files as-is)");
});
test("#5 index.html and sw.js carry the same build version", () => {
  const app = (read("index.html").match(/__APP_VERSION__\s*=\s*"([0-9a-f]+)"/) || [])[1];
  const sw = (read("sw.js").match(/VERSION\s*=\s*'([0-9a-f]+)'/) || [])[1];
  assert.ok(app, "index.html: window.__APP_VERSION__ stamp missing — not a build.mjs output?");
  assert.ok(sw, "sw.js: VERSION stamp missing — not a build.mjs output?");
  assert.equal(app, sw, `version drift: index.html=${app} vs sw.js=${sw} — partial build/hand edit`);
});

/* ------------------------------------------------------------------
   #6 — THE HOOKS LAW (CLAUDE.md build gotchas; ADR 0006): every React
   hook the .jsx calls must be in build.mjs's hardcoded destructure
   head, or the built app white-screens with a ReferenceError (bit us
   in v9 with useRef). The allowed set is parsed from build.mjs itself
   so the two can never drift.
   ------------------------------------------------------------------ */
test("#6 every hook used in HyruleCompanion.jsx is in build.mjs's React destructure", () => {
  const head = (read("build/build.mjs").match(/const head = `const \{([^}]*)\}=React;/) || [])[1];
  assert.ok(head, "build.mjs: could not find the `const {…}=React;` head line");
  const allowed = new Set(head.split(",").map((s) => s.trim()).filter(Boolean));
  const jsx = read("HyruleCompanion.jsx");
  const called = new Set([...jsx.matchAll(/(^|[^.\w])(use[A-Z]\w*)\s*\(/g)].map((m) => m[2]));
  const definedLocally = new Set([...jsx.matchAll(/(?:function\s+|const\s+)(use[A-Z]\w*)/g)].map((m) => m[1]));
  const missing = [...called].filter((h) => !allowed.has(h) && !definedLocally.has(h));
  assert.equal(missing.length, 0,
    `HyruleCompanion.jsx calls hook(s) not in build.mjs's head destructure (white-screen at runtime): ${missing.join(", ")} — add them to the head line in build/build.mjs`);
});

/* ------------------------------------------------------------------
   #7 — APP-SOURCE HYGIENE (CLAUDE.md "Build/edit gotchas" + ADR 0001
   post-edit sanity list): no <form> tags (onClick only), no Tailwind,
   a single injected <style> block, an even backtick count, and the
   async `store` adapter present. (Balanced {}/() is deliberately NOT
   swept: prose strings make a naive count dishonest — esbuild owns
   parse-soundness; see docs/guardrails.md.)
   ------------------------------------------------------------------ */
test("#7 HyruleCompanion.jsx: no <form> tags", () => {
  const n = (read("HyruleCompanion.jsx").match(/<form\b/gi) || []).length;
  assert.equal(n, 0, `HyruleCompanion.jsx: found ${n} <form> tag(s) — the app is onClick-only (CLAUDE.md gotchas)`);
});
test("#7 no Tailwind anywhere in the app source or build output", () => {
  for (const f of ["HyruleCompanion.jsx", "index.html"]) {
    const n = (read(f).match(/tailwind/gi) || []).length;
    assert.equal(n, 0, `${f}: Tailwind reference found — the app is custom-CSS only (CLAUDE.md gotchas)`);
  }
});
test("#7 HyruleCompanion.jsx: exactly one <style> block", () => {
  const jsx = read("HyruleCompanion.jsx");
  const open = (jsx.match(/<style\b/g) || []).length, close = (jsx.match(/<\/style>/g) || []).length;
  assert.ok(open === 1 && close === 1, `HyruleCompanion.jsx: expected exactly one <style>…</style>, found ${open} open / ${close} close`);
});
test("#7 HyruleCompanion.jsx: even backtick count", () => {
  const n = (read("HyruleCompanion.jsx").match(/`/g) || []).length;
  assert.equal(n % 2, 0, `HyruleCompanion.jsx: odd backtick count (${n}) — an unterminated template literal (post-edit sanity, ADR 0001)`);
});
test("#7 HyruleCompanion.jsx: the async `store` adapter is present", () => {
  assert.match(read("HyruleCompanion.jsx"), /const\s+store\s*=/, "HyruleCompanion.jsx: `const store =` missing (ADR 0002's storage adapter)");
});

/* ------------------------------------------------------------------
   #8 — THE HONESTY GATES ON COMMITTED DATA (CLAUDE.md build table;
   build/assemble-knowledge.mjs "refuses to write unless it sums to
   120 shrines / 15 towers / 4 Great Fairies, 0 dup names";
   build/assemble-cooking.mjs's 11-effect gate; v17.12 "all 152" TotK
   shrines, v13.3 "15 Skyview Towers, 4 Great Fairies"). The
   assemblers gate at write time; the sweep re-asserts on the
   committed JSON so a hand edit can't silently drift the data.
   The 11-effect list is parsed from the assembler (its source of truth).
   ------------------------------------------------------------------ */
const flatShrines = (p) => readJSON(p).flatMap((g) => g.shrines);
test("#8 BotW knowledge reconciles to 120 shrines / 15 towers / 4 fairies, 0 dup names", () => {
  const sh = flatShrines("knowledge/shrines.json");
  assert.equal(sh.length, 120, `knowledge/shrines.json: expected 120 shrines, found ${sh.length}`);
  const dups = sh.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i);
  assert.equal(dups.length, 0, `knowledge/shrines.json: duplicate shrine name(s): ${[...new Set(dups)].join(", ")}`);
  assert.equal(readJSON("knowledge/towers.json").length, 15, "knowledge/towers.json: expected 15 towers");
  assert.equal(readJSON("knowledge/great-fairies.json").length, 4, "knowledge/great-fairies.json: expected 4 Great Fairies");
});
test("#8 BotW cooking table: 120 ingredients covering all 11 effects", () => {
  const ci = readJSON("knowledge/cooking-ingredients.json");
  assert.equal(ci.length, 120, `knowledge/cooking-ingredients.json: expected 120 ingredients, found ${ci.length}`);
  const effectsSrc = (read("build/assemble-cooking.mjs").match(/const EFFECTS = new Set\(\[([^\]]*)\]\)/) || [])[1];
  assert.ok(effectsSrc, "build/assemble-cooking.mjs: EFFECTS list not found");
  const wanted = effectsSrc.match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  const have = new Set(ci.map((i) => i.effect).filter(Boolean));
  const missing = wanted.filter((e) => !have.has(e));
  assert.equal(missing.length, 0, `knowledge/cooking-ingredients.json: missing effect(s): ${missing.join(", ")}`);
});
test("#8 TotK knowledge holds 152 shrines (0 dup names) / 15 towers / 4 fairies", () => {
  const sh = flatShrines("knowledge/totk/shrines.json");
  assert.equal(sh.length, 152, `knowledge/totk/shrines.json: expected 152 shrines, found ${sh.length}`);
  const dups = sh.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i);
  assert.equal(dups.length, 0, `knowledge/totk/shrines.json: duplicate shrine name(s): ${[...new Set(dups)].join(", ")}`);
  assert.equal(readJSON("knowledge/totk/towers.json").towers.length, 15, "knowledge/totk/towers.json: expected 15 Skyview Towers");
  assert.equal(readJSON("knowledge/totk/great-fairies.json").fairies.length, 4, "knowledge/totk/great-fairies.json: expected 4 Great Fairies");
});

/* ------------------------------------------------------------------
   #9 — PROGRESS-ID INTEGRITY (CLAUDE.md "IDs must be globally unique
   … never reuse an id"; merge-walkthrough.mjs asserts unique ids;
   v12.11/ADR 0010 stable sq_<slug> ids; the v17.13 audit's "0 dup
   ids, all slugs unique" — re-asserted mechanically). Scope: every
   committed per-game bundle. BotW's hand-authored in-.jsx walkthrough
   is excluded (needs JS execution — see docs/guardrails.md).
   ------------------------------------------------------------------ */
const GAME_DIRS = TRACKED.filter((f) => /^knowledge\/[^/]+\/app-data\.json$/.test(f)).map((f) => f.split("/")[1]);
const walkIds = (regions) => regions.flatMap((r) => [r.id,
  ...(r.sections || []).flatMap((s) => [s.id, ...(s.steps || []).map((st) => st.id)])]);
const dupsOf = (ids) => [...new Set(ids.filter((x, i, a) => a.indexOf(x) !== i))];
test("#9 every per-game bundle has unique, present walkthrough ids", () => {
  assert.ok(GAME_DIRS.length >= 10, `expected the 10 non-BotW game bundles, found ${GAME_DIRS.length}`);
  for (const g of GAME_DIRS) {
    for (const p of [`knowledge/${g}/walkthrough.json`, `knowledge/${g}/app-data.json`]) {
      if (!TRACKED.includes(p)) continue;
      const d = readJSON(p);
      const ids = walkIds(Array.isArray(d) ? d : d.REGIONS || []);
      assert.equal(ids.filter((x) => !x).length, 0, `${p}: walkthrough entry with a missing id`);
      const dups = dupsOf(ids);
      assert.equal(dups.length, 0, `${p}: duplicate id(s) — progress keys would collide: ${dups.join(", ")}`);
    }
  }
});
test("#9 side-quest slugs are present and unique per game", () => {
  const sqIds = (sq) => ((sq && sq.regions) || sq || []).flatMap((g) => (g.quests || []).map((q) => q.id));
  for (const g of GAME_DIRS) {
    const ids = sqIds(readJSON(`knowledge/${g}/app-data.json`).SIDE_QUESTS);
    assert.equal(ids.filter((x) => !x).length, 0, `knowledge/${g}/app-data.json: side quest missing its stable slug id`);
    const dups = dupsOf(ids);
    assert.equal(dups.length, 0, `knowledge/${g}/app-data.json: duplicate side-quest slug(s): ${dups.join(", ")}`);
  }
  const botw = sqIds(readJSON("knowledge/side-quests.json"));
  assert.equal(botw.length, 78, `knowledge/side-quests.json: expected the complete 78 side quests, found ${botw.length}`);
  assert.equal(botw.filter((x) => !x).length, 0, "knowledge/side-quests.json: side quest missing its sq slug id");
  const dups = dupsOf(botw);
  assert.equal(dups.length, 0, `knowledge/side-quests.json: duplicate slug(s): ${dups.join(", ")}`);
});

/* ------------------------------------------------------------------
   #10 — VERIFICATION META NEVER REACHES THE UI (v13.2 rule: "strip
   any notes/verification meta before it reaches a render site";
   ADR 0010 / knowledge/README: merges strip sources/corrections).
   Scope: the wholesale-inlined per-game app-data.json bundles.
   KOROKS.notes is explicitly allowed ("Korok notes kept — real
   caveat", v13.2). _raw-research.json keeps provenance by design.
   ------------------------------------------------------------------ */
test("#10 no sources/corrections/confidence keys in any app-data bundle", () => {
  for (const g of GAME_DIRS) {
    const raw = read(`knowledge/${g}/app-data.json`);
    for (const key of ['"sources"', '"corrections"', '"confidence"']) {
      const n = raw.split(key).length - 1;
      assert.equal(n, 0, `knowledge/${g}/app-data.json: ${n} ${key} key(s) — verification meta would reach the UI`);
    }
  }
});
test("#10 no notes lede on BESTIARY/COOKING/WORLD in any app-data bundle", () => {
  for (const g of GAME_DIRS) {
    const d = readJSON(`knowledge/${g}/app-data.json`);
    for (const k of ["BESTIARY", "COOKING", "WORLD"]) {
      const v = d[k];
      assert.ok(!(v && !Array.isArray(v) && typeof v === "object" && "notes" in v),
        `knowledge/${g}/app-data.json: ${k}.notes present — renders as the view's lede (the v13.2 leak)`);
    }
  }
});

/* ---------------- runner (mirrors nala's guardrails harness) ---------------- */
let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${e.message}`);
  }
}
console.log(`guardrails: ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
