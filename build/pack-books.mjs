#!/usr/bin/env node
/*
  pack-books.mjs — LOCAL prep tool (never part of the public build / never committed).

  Turns the owner's *own* book/comic files (sitting in iCloud) into lightweight,
  on-device "packs" the Hyrule Companion Bookshelf can import privately on the phone.

  WHY THIS EXISTS (ADR 0009):
    - The public repo is PUBLIC and GitHub rejects files > 100MB, so the books can
      never ride along in the committed build. Instead the public app stays lean and
      the books live ONLY on the owner's device. This tool makes the import packs.
    - We DOWNSCALE the page images (phones don't need 4000px scans) so ~250MB of
      source collapses to ~100MB that fits comfortably in on-device storage.
    - Packs are STORE-ONLY zips (zip -0). JPEGs are already compressed, so there's no
      size cost — and the in-app reader needs ZERO decompression library to read them
      (it just parses the zip directory and slices out the raw JPEG bytes). Keeps the
      offline build tiny.

  USAGE:
    node build/pack-books.mjs              # pack every book it can find
    node build/pack-books.mjs explorer     # pack just one (by id)
    node build/pack-books.mjs --out <dir>  # override output dir

  Output: one <id>.hbook.zip per book in OUT (default: a subfolder of the iCloud
  Zelda folder, so the packs auto-sync to the phone's Files app).
*/
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, readdirSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const HOME = process.env.HOME;
const ICLOUD = join(HOME, "Library/Mobile Documents/com~apple~CloudDocs/Zelda");
const EXPLORER_W = 1500, COMIC_W = 1240, GUIDE_W = 1200, JPEG_Q = 70;

// ---- which books, and how each is sourced/cited -------------------------------------
const BOOKS = [
  { id: "historia", type: "comic", match: "Hyrule Historia", maxw: COMIC_W,
    title: "The Legend of Zelda: Hyrule Historia", author: "Nintendo / Dark Horse", year: 2013,
    kind: "Official lore compendium", cite: "Dark Horse Books, 2013 · ISBN 978-1-61655-041-7" },
  { id: "ootmanga", type: "comic", match: "Ocarina of Time 02", maxw: COMIC_W,
    title: "The Legend of Zelda: Ocarina of Time — Vol. 2", author: "Akira Himekawa / VIZ", year: 2008,
    kind: "Manga (licensed fiction — not canon)", cite: "VIZ Media · Legendary Edition" },
  { id: "explorer", type: "guide", match: "Explorer", dpi: 150, maxw: EXPLORER_W,
    title: "Breath of the Wild — Explorer's Guide", author: "Nintendo", year: 2023,
    kind: "Official guide", cite: "Nintendo Co., Ltd., 2023" },
  { id: "pathways", type: "guide", match: "Pathways", dpi: 170, maxw: GUIDE_W,
    title: "Ocarina of Time: Pathways to Adventure", author: "Jason R. Rich", year: 1998,
    kind: "Strategy guide", cite: "Sybex Inc., 1998 · ISBN 0-7821-2478-X" },
  { id: "yuwguide", type: "epub", match: "Unofficial",
    title: "Breath of the Wild — Game Guide (Unofficial)", author: "The Yuw", year: 2017,
    kind: "Unofficial guide", cite: "PublishDrive, 2017" },
];

const args = process.argv.slice(2);
let OUT = join(ICLOUD, "_companion-packs");
const oi = args.indexOf("--out"); if (oi >= 0) { OUT = args[oi + 1]; args.splice(oi, 2); }
const only = args.filter((a) => !a.startsWith("--"));

function findSource(match) {
  if (!existsSync(ICLOUD)) throw new Error("iCloud Zelda folder not found: " + ICLOUD);
  const hit = readdirSync(ICLOUD).find((f) => f.includes(match));
  return hit ? join(ICLOUD, hit) : null;
}
function sh(cmd, a, opts = {}) { return execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 30, ...opts }); }
function downscale(src, dst, maxw) {
  // sips: resample so the LONGER side <= maxw-ish, re-encode JPEG at quality.
  sh("sips", ["-Z", String(maxw), "-s", "format", "jpeg", "-s", "formatOptions", String(JPEG_Q), src, "--out", dst]);
}
function naturalSort(a, b) { return a.localeCompare(b, undefined, { numeric: true }); }
function fmtMB(n) { return (n / 1048576).toFixed(1) + " MB"; }

function packImages(book, stage) {
  // stage holds page images named p0001.jpg ...; write book.json then store-only zip.
  const files = readdirSync(stage).filter((f) => /\.jpe?g$/i.test(f)).sort(naturalSort);
  const meta = {
    schema: 1, id: book.id, type: "pages", title: book.title, author: book.author,
    year: book.year, kind: book.kind, cite: book.cite, pages: files.length, files,
  };
  writeFileSync(join(stage, "book.json"), JSON.stringify(meta));
  mkdirSync(OUT, { recursive: true });
  const outZip = join(OUT, book.id + ".hbook.zip");
  if (existsSync(outZip)) rmSync(outZip);
  // -0 store (no compression), -j junk dirs (flat), -X strip extra attrs, -q quiet
  sh("zip", ["-0", "-j", "-X", "-q", outZip, join(stage, "book.json"), ...files.map((f) => join(stage, f))]);
  return { outZip, pages: files.length };
}

function doComic(book) {
  const src = findSource(book.match); if (!src) return console.log(`  ✗ ${book.id}: source not found (${book.match})`);
  console.log(`  • ${book.id}: extracting comic pages from ${basename(src)}`);
  const ex = mkdtempSync(join(tmpdir(), "hb-ex-")); const stage = mkdtempSync(join(tmpdir(), "hb-st-"));
  try {
    sh("bsdtar", ["-xf", src, "-C", ex]);
    // collect all jpgs anywhere under ex, in natural order
    const all = [];
    (function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); e.isDirectory() ? walk(p) : (/\.jpe?g$/i.test(e.name) && all.push(p)); } })(ex);
    all.sort(naturalSort);
    console.log(`    ${all.length} pages → downscaling to ${book.maxw}px / q${JPEG_Q}`);
    all.forEach((p, i) => downscale(p, join(stage, "p" + String(i).padStart(4, "0") + ".jpg"), book.maxw));
    const { outZip, pages } = packImages(book, stage);
    console.log(`    ✓ ${book.id}: ${pages} pages → ${basename(outZip)} (${fmtMB(statSync(outZip).size)})`);
  } finally { rmSync(ex, { recursive: true, force: true }); rmSync(stage, { recursive: true, force: true }); }
}

function doGuide(book) {
  const src = findSource(book.match); if (!src) return console.log(`  ✗ ${book.id}: source not found (${book.match})`);
  console.log(`  • ${book.id}: rendering PDF pages from ${basename(src)} @ ${book.dpi}dpi`);
  const ren = mkdtempSync(join(tmpdir(), "hb-pdf-")); const stage = mkdtempSync(join(tmpdir(), "hb-st-"));
  try {
    sh("pdftoppm", ["-jpeg", "-r", String(book.dpi), src, join(ren, "pg")]);
    const all = readdirSync(ren).filter((f) => /\.jpg$/i.test(f)).map((f) => join(ren, f)).sort(naturalSort);
    console.log(`    ${all.length} pages → downscaling to ${book.maxw}px / q${JPEG_Q}`);
    all.forEach((p, i) => downscale(p, join(stage, "p" + String(i).padStart(4, "0") + ".jpg"), book.maxw));
    const { outZip, pages } = packImages(book, stage);
    console.log(`    ✓ ${book.id}: ${pages} pages → ${basename(outZip)} (${fmtMB(statSync(outZip).size)})`);
  } finally { rmSync(ren, { recursive: true, force: true }); rmSync(stage, { recursive: true, force: true }); }
}

function htmlToBlocks(html) {
  const blocks = [];
  // crude but effective: pull headings + paragraphs in document order
  const re = /<(h[1-4]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi; let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    let txt = m[2].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
      .replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”")
      .replace(/&#8212;|&mdash;/g, "—").replace(/&#8211;|&ndash;/g, "–")
      .replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
    if (!txt) continue;
    blocks.push({ t: tag === "p" ? "p" : "h", text: txt });
  }
  return blocks;
}

function doEpub(book) {
  const src = findSource(book.match); if (!src) return console.log(`  ✗ ${book.id}: source not found (${book.match})`);
  console.log(`  • ${book.id}: parsing EPUB ${basename(src)}`);
  const ex = mkdtempSync(join(tmpdir(), "hb-ep-"));
  try {
    sh("unzip", ["-o", "-q", src, "-d", ex]);
    // spine order from content.opf
    let opf = null; (function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === "content.opf") opf = p; } })(ex);
    let files = [];
    if (opf) {
      const opfTxt = readFileSync(opf, "utf8"); const dir = opf.slice(0, opf.lastIndexOf("/"));
      const items = {}; let mm; const ire = /<item\b[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi;
      while ((mm = ire.exec(opfTxt))) items[mm[1]] = mm[2];
      const sre = /<itemref\b[^>]*idref="([^"]+)"/gi;
      while ((mm = sre.exec(opfTxt))) { const h = items[mm[1]]; if (h && /\.x?html?$/i.test(h)) files.push(join(dir, h)); }
    }
    if (!files.length) files = readdirSync(ex).filter((f) => /\.x?html?$/i.test(f)).sort(naturalSort).map((f) => join(ex, f));
    const blocks = [];
    for (const f of files) { if (existsSync(f)) blocks.push(...htmlToBlocks(readFileSync(f, "utf8"))); }
    const meta = {
      schema: 1, id: book.id, type: "text", title: book.title, author: book.author, year: book.year,
      kind: book.kind, cite: book.cite, blocks,
    };
    mkdirSync(OUT, { recursive: true });
    const outZip = join(OUT, book.id + ".hbook.zip");
    if (existsSync(outZip)) rmSync(outZip);
    const stage = mkdtempSync(join(tmpdir(), "hb-st-"));
    writeFileSync(join(stage, "book.json"), JSON.stringify(meta));
    sh("zip", ["-0", "-j", "-X", "-q", outZip, join(stage, "book.json")]);
    rmSync(stage, { recursive: true, force: true });
    console.log(`    ✓ ${book.id}: ${blocks.length} text blocks → ${basename(outZip)} (${fmtMB(statSync(outZip).size)})`);
  } finally { rmSync(ex, { recursive: true, force: true }); }
}

console.log(`\nHyrule Companion — book packer`);
console.log(`source: ${ICLOUD}`);
console.log(`output: ${OUT}\n`);
const todo = BOOKS.filter((b) => !only.length || only.includes(b.id));
for (const b of todo) {
  try { b.type === "comic" ? doComic(b) : b.type === "guide" ? doGuide(b) : doEpub(b); }
  catch (e) { console.log(`  ✗ ${b.id}: ${e.message.split("\n")[0]}`); }
}
console.log(`\nDone. Move the .hbook.zip files to your phone (they're already in iCloud → Files app),`);
console.log(`then in the app: Lore → Bookshelf → “Add a book”.\n`);
