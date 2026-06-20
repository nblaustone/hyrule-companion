#!/usr/bin/env node
/* ============================================================
   Hyrule Companion — build (ADR 0004)
   HyruleCompanion.jsx  ->  self-contained, OFFLINE index.html
   - transforms JSX with esbuild (via npx)
   - inlines React + ReactDOM (vendored UMD) + the app + styles
   - strips the Google-Fonts @import; inlines latin font subsets if reachable
   - generates an original Sheikah-eye PNG icon (no Nintendo assets, ADR 0003)
   - emits index.html, manifest.webmanifest, icon-512.png, icon-180.png
   The output makes ZERO external network requests. A build with any
   http(s):// or `@import url(` left in it is a bug — we grep for it.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { crc32 } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VENDOR = join(__dirname, "vendor");
const log = (...a) => console.log("·", ...a);

/* ---------- 1. original Sheikah-eye icon (dependency-free PNG) ---------- */
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "latin1");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}
function makeIcon(size) {
  const cx = size / 2, cy = size / 2;
  const oy = 0.30 * size, R = 0.50 * size;     // lens = intersection of two circles (vesica eye)
  const strokeW = 0.044 * size, irisR = 0.105 * size, pupilR = 0.045 * size;
  const buf = Buffer.alloc(size * size * 4);
  const clamp = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const segDist = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy));
    const qx = ax + t * vx, qy = ay + t * vy; return Math.hypot(px - qx, py - qy);
  };
  const ORANGE = [240, 144, 42], GLOW = [255, 182, 96];
  const bTip = cy + 0.20 * size; // bottom point of the eye
  // 3 lashes + a tear, fanning below the eye (echoes the app's eye glyph)
  const lashes = [
    [cx, bTip, cx, bTip + 0.085 * size],
    [cx - 0.06 * size, bTip - 0.01 * size, cx - 0.12 * size, bTip + 0.06 * size],
    [cx + 0.06 * size, bTip - 0.01 * size, cx + 0.12 * size, bTip + 0.06 * size],
  ];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const rr = clamp(Math.hypot(dx, dy) / (size * 0.62));
    let col = mix([18, 46, 56], [7, 16, 21], rr * rr); // dark-teal radial
    const dB = Math.hypot(dx, dy - oy) - R, dT = Math.hypot(dx, dy + oy) - R;
    const lens = Math.max(dB, dT);                       // <0 inside the eye
    let oc = 1 - smooth(strokeW / 2, strokeW / 2 + 1.6, Math.abs(lens)); // almond outline
    const dIris = Math.hypot(dx, dy) - irisR;
    oc = Math.max(oc, (1 - smooth(0, 1.6, dIris)));       // filled iris
    for (const [ax, ay, bx, by] of lashes)
      oc = Math.max(oc, 1 - smooth(strokeW * 0.42, strokeW * 0.42 + 1.6, segDist(x + 0.5, y + 0.5, ax, ay, bx, by)));
    col = mix(col, ORANGE, oc);
    const pupil = 1 - smooth(0, 1.4, Math.hypot(dx, dy) - pupilR); // dark pupil dot
    col = mix(col, [9, 19, 23], pupil * 0.9);
    const cl = 1 - smooth(0, 1.4, Math.hypot(dx + irisR * 0.28, dy - irisR * 0.30) - pupilR * 0.5);
    col = mix(col, GLOW, cl * 0.8); // catchlight
    const i = (y * size + x) * 4;
    buf[i] = Math.round(col[0]); buf[i + 1] = Math.round(col[1]); buf[i + 2] = Math.round(col[2]); buf[i + 3] = 255;
  }
  return encodePNG(buf, size);
}

/* ---------- 2. fonts: inline latin subsets if reachable, else fall back ---------- */
async function fontFaceCSS() {
  const want = [
    ["Cinzel", [600, 700]],
    ["Rajdhani", [500, 600, 700]],
    ["Inter", [400, 500, 600]],
  ];
  const families = want.map(([f, ws]) => `family=${f}:wght@${ws.join(";")}`).join("&");
  const url = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  try {
    const css = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" } }).then(r => r.text());
    // keep only the latin (non-ranged) @font-face blocks, inline each woff2 as base64
    const blocks = css.split("@font-face").slice(1);
    let out = "", n = 0;
    for (const b of blocks) {
      if (/unicode-range/.test(b) && !/U\+0000-00FF/.test(b)) continue; // latin / latin-ext only
      const m = b.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/);
      const fam = (b.match(/font-family:\s*'([^']+)'/) || [])[1];
      const wgt = (b.match(/font-weight:\s*(\d+)/) || [])[1] || "400";
      if (!m || !fam) continue;
      const bytes = Buffer.from(await fetch(m[1]).then(r => r.arrayBuffer()));
      out += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${wgt};font-display:swap;src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');}\n`;
      n++;
    }
    log(`inlined ${n} font subsets (${(out.length / 1024 | 0)} KB base64)`);
    return out;
  } catch (e) {
    log("font inlining skipped (offline build) — using system fallbacks:", e.message);
    return "";
  }
}

/* ---------- 3. transform the app with esbuild ---------- */
function transformApp() {
  let src = readFileSync(join(ROOT, "HyruleCompanion.jsx"), "utf8");
  // strip the react import (hooks come off the global React), make the component a plain fn,
  // remove the external Google-Fonts @import (we inline fonts ourselves / fall back).
  src = src.replace(/^\s*import\s+\{[^}]*\}\s+from\s+["']react["'];?\s*$/m, "");
  src = src.replace(/export\s+default\s+function\s+HyruleCompanion/, "function HyruleCompanion");
  src = src.replace(/@import url\([^)]*fonts\.googleapis[^)]*\);?/g, "");
  const head = `const {useState,useEffect,useMemo,useCallback,useRef}=React;\n`;
  const mount = `\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(HyruleCompanion));\n`;
  const processed = head + src + mount;
  const tmp = join(__dirname, ".app.processed.jsx");
  writeFileSync(tmp, processed);
  const r = spawnSync("npx", ["--yes", "esbuild", tmp, "--jsx=transform", "--minify", "--format=esm", "--target=es2019"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(r.stderr || r.error); throw new Error("esbuild transform failed"); }
  log(`app transformed (${(r.stdout.length / 1024 | 0)} KB minified)`);
  return r.stdout;
}

/* ---------- 4. assemble ---------- */
function assemble({ appJS, fontCSS, icon512b64, icon180b64, manifestDataURI, version }) {
  const react = readFileSync(join(VENDOR, "react.production.min.js"), "utf8");
  const reactDOM = readFileSync(join(VENDOR, "react-dom.production.min.js"), "utf8");
  // SW registration + "new version" banner. Guarded so file:// / unsupported browsers no-op.
  const swReg = `
window.__APP_VERSION__=${JSON.stringify(version)};
(function(){
  var secure=/^https/.test(location.protocol)||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  if(!('serviceWorker' in navigator) || !secure) return;
  function banner(reg){
    if(document.getElementById('sw-upd')) return;
    var b=document.createElement('div'); b.id='sw-upd';
    b.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:9999;background:#0f1c22;border:1px solid rgba(95,214,226,.5);color:#e9e2d2;border-radius:14px;padding:10px 14px;font:600 13px Rajdhani,system-ui,sans-serif;letter-spacing:.4px;box-shadow:0 8px 28px rgba(0,0,0,.5);display:flex;gap:12px;align-items:center;max-width:90%;';
    b.innerHTML='<span style="color:#5fd6e2">A new version is ready</span>';
    var u=document.createElement('button'); u.textContent='Update';
    u.style.cssText='background:#5fd6e2;color:#091317;border:none;border-radius:9px;padding:6px 14px;font:700 12px Rajdhani,sans-serif;letter-spacing:.6px;text-transform:uppercase;cursor:pointer;';
    u.onclick=function(){ if(reg.waiting) reg.waiting.postMessage('skipWaiting'); };
    var l=document.createElement('button'); l.textContent='Later'; l.setAttribute('aria-label','Dismiss update notice');
    l.style.cssText='background:transparent;color:#8aa3a8;border:none;padding:6px 4px;font:600 12px Rajdhani,sans-serif;letter-spacing:.6px;text-transform:uppercase;cursor:pointer;';
    l.onclick=function(){ b.remove(); };
    b.appendChild(u); b.appendChild(l); document.body.appendChild(b);
  }
  navigator.serviceWorker.register('./sw.js').then(function(reg){
    if(reg.waiting && navigator.serviceWorker.controller) banner(reg);
    reg.addEventListener('updatefound',function(){
      var nw=reg.installing; if(!nw) return;
      nw.addEventListener('statechange',function(){ if(nw.state==='installed' && navigator.serviceWorker.controller) banner(reg); });
    });
  }).catch(function(){});
  var reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){ if(reloaded) return; reloaded=true; location.reload(); });
})();`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#091317">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hyrule">
<meta name="description" content="An offline Sheikah-Slate companion for The Legend of Zelda: Breath of the Wild.">
<title>Hyrule Companion</title>
<link rel="icon" type="image/png" href="data:image/png;base64,${icon180b64}">
<link rel="apple-touch-icon" href="data:image/png;base64,${icon180b64}">
<link rel="manifest" href="${manifestDataURI}">
<style>
${fontCSS}html,body{margin:0;padding:0;background:#091317;}
body{overscroll-behavior-y:none;-webkit-tap-highlight-color:transparent;}
#root{min-height:100vh;}
</style>
</head>
<body>
<div id="root"></div>
<script>${react}</script>
<script>${reactDOM}</script>
<script>${appJS}</script>
<script>${swReg}</script>
</body>
</html>`;
}

/* ---------- run ---------- */
const fontCSS = await fontFaceCSS();
const appJS = transformApp();
const version = createHash("sha256").update(appJS).digest("hex").slice(0, 10); // changes whenever the app changes
const icon512 = makeIcon(512), icon180 = makeIcon(180);
writeFileSync(join(ROOT, "icon-512.png"), icon512);
writeFileSync(join(ROOT, "icon-180.png"), icon180);
const icon512b64 = icon512.toString("base64"), icon180b64 = icon180.toString("base64");

// service worker: network-first for navigations (online reopen = fresh; the real fix for the
// iOS Home-Screen "can't refresh" problem), cache-first for assets, offline-capable, versioned.
const SW_JS = `/* Hyrule Companion service worker */
const VERSION='${version}';
const CACHE='hyrule-'+VERSION;
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-512.png','./icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET')return;
  if(req.mode==='navigate'||(req.headers.get('accept')||'').includes('text/html')){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp));return r;}).catch(()=>caches.match('./index.html').then(r=>r||caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(c=>c||fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(ch=>ch.put(req,cp));return r;}).catch(()=>c)));
});`;

const manifest = {
  name: "Hyrule Companion", short_name: "Hyrule",
  description: "An offline Sheikah-Slate companion for The Legend of Zelda: Breath of the Wild.",
  start_url: ".", scope: ".", display: "standalone", orientation: "portrait",
  background_color: "#091317", theme_color: "#091317",
  icons: [
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `data:image/png;base64,${icon512b64}`, sizes: "512x512", type: "image/png", purpose: "maskable any" },
  ],
};
writeFileSync(join(ROOT, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));
// inline manifest so the single index.html installs even without the sidecar file
const inlineManifest = { ...manifest, icons: [{ src: `data:image/png;base64,${icon512b64}`, sizes: "512x512", type: "image/png", purpose: "any maskable" }] };
const manifestDataURI = "data:application/manifest+json;base64," + Buffer.from(JSON.stringify(inlineManifest)).toString("base64");

const html = assemble({ appJS, fontCSS, icon512b64, icon180b64, manifestDataURI, version });
writeFileSync(join(ROOT, "index.html"), html);
writeFileSync(join(ROOT, "sw.js"), SW_JS);

/* ---------- 5. verify the offline guarantee ---------- */
// inert string literals that are never fetched (SVG xmlns; React's console error-decoder link)
const INERT = ["http://www.w3.org/", "https://reactjs.org/docs/error-decoder"];
const offenders = (html.match(/https?:\/\/[^\s"')]+/g) || []).filter(u => !INERT.some(p => u.startsWith(p)));
// the requests that actually hit the network: external src/href/@import. There must be none.
const realReqs = (html.match(/(?:src|href)\s*=\s*["']https?:\/\/|@import\s+url\(\s*["']?https?:/gi) || []);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
log(`wrote index.html (${kb} KB), manifest.webmanifest, icon-512.png, icon-180.png`);
if (realReqs.length) {
  console.error("✗ OFFLINE CHECK FAILED — external requests left in output:\n  " + [...new Set(realReqs)].join("\n  "));
  process.exit(1);
}
log(`✓ offline check passed — zero external network requests` + (offenders.length ? ` (${offenders.length} inert string literal(s) in vendored React, never fetched)` : ""));

/* ---------- 6. mirror the site into docs/ for GitHub Pages (served from /docs) ---------- */
const DOCS = join(ROOT, "docs");
if (!existsSync(DOCS)) mkdirSync(DOCS);
writeFileSync(join(DOCS, "index.html"), html);
writeFileSync(join(DOCS, "sw.js"), SW_JS);
writeFileSync(join(DOCS, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));
writeFileSync(join(DOCS, "icon-512.png"), icon512);
writeFileSync(join(DOCS, "icon-180.png"), icon180);
writeFileSync(join(DOCS, ".nojekyll"), ""); // tell Pages to serve the files as-is
log(`✓ mirrored site into docs/ (GitHub Pages source) · version ${version}`);
