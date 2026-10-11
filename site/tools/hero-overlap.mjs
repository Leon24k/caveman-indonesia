// Hero wordmark fit check, measured on the INK of the letters (not the font box):
// at every viewport the letters of "irit" must be fully on screen (dots of the
// i's included) and end at least 16px above the headline, and the hero copy
// must fit on screen.
// Installed Chrome, or CHROME=/path/to/chromium.
// Run from site/ with the server up: node tools/hero-overlap.mjs
import { createRequire } from "node:module";
import path from "node:path";
const { chromium } = createRequire(path.join(process.cwd(), "package.json"))("playwright-core");

const SIZES = [[1568, 893], [1440, 900], [1440, 820], [1366, 768], [1280, 720], [1920, 1080], [2560, 1080], [1024, 700],
  [820, 1180], [430, 932], [390, 844], [375, 667], [360, 640]];
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: "chrome" });
let fail = 0;
for (const [w, h] of SIZES) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(process.env.URL || "http://localhost:4500", { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const m = document.querySelector(".hero__mark"), c = document.querySelector(".hero__copy").getBoundingClientRect();
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    m.appendChild(probe); const base = probe.getBoundingClientRect().bottom; probe.remove();
    const cs = getComputedStyle(m), fs = parseFloat(cs.fontSize) * parseFloat(cs.scale === "none" ? 1 : cs.scale);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    const t = ctx.measureText(m.textContent.trim());
    return { fs, inkTop: base - t.actualBoundingBoxAscent, inkBottom: base + t.actualBoundingBoxDescent, copyTop: c.top, copyBottom: c.bottom };
  });
  const gap = Math.round(r.copyTop - r.inkBottom);
  const bad = r.inkTop < 0 || gap < 16 || r.copyBottom > h;
  if (bad) fail++;
  console.log(`${bad ? "FAIL" : "ok  "} ${String(w + "x" + h).padEnd(10)} mark ${r.fs.toFixed(0).padStart(4)}px  ink top ${String(Math.round(r.inkTop)).padStart(3)}px  gap ${String(gap).padStart(4)}px  copy bottom ${Math.round(r.copyBottom)}/${h}`);
  await p.close();
}
await b.close();
process.exit(fail ? 1 : 0);
