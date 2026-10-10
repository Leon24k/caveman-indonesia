// Functional checks the scroll harness does not cover: rail overflow, page
// overflow, copy button outcome, keyboard focus order, chisel end state.
// Run from site/: node tools/check.mjs
import { createRequire } from "node:module";
import path from "node:path";
const { chromium } = createRequire(path.join(process.cwd(), "package.json"))("playwright-core");

const URL = process.env.URL || "http://localhost:4500";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
let fail = 0;
const ok = (c, msg) => { console.log((c ? "ok   " : "FAIL ") + msg); if (!c) fail++; };

for (const [w, h] of [[1440, 900], [390, 844], [360, 640]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const m = await page.evaluate(() => ({
    rail: document.querySelector(".rail").scrollWidth - innerWidth,
    pageX: document.documentElement.scrollWidth - innerWidth,
    toks: document.querySelectorAll(".reply--normal .tok").length,
    irit: document.querySelectorAll(".reply--irit .tok").length,
  }));
  ok(m.rail > w * 0.5, `${w}px rail overflow ${m.rail}px (want > ${w * 0.5})`);
  ok(m.pageX <= 0, `${w}px no horizontal page overflow (${m.pageX})`);
  ok(m.toks === 160 && m.irit === 48, `${w}px tokens rendered ${m.toks} / ${m.irit}`);

  // Keyboard: first Tab lands on the skip link.
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement.className);
  ok(first === "skip", `${w}px first focus is skip link (${first})`);

  // Chisel end state: scroll to 90% of the peak act.
  const end = await page.evaluate(async () => {
    const a = document.getElementById("pahat");
    const top = a.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (a.offsetHeight - innerHeight) * 0.9, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 500));
    return { num: document.querySelector("[data-chisel-num]").textContent, phase: document.querySelector("[data-chisel-phase]").textContent };
  });
  ok(end.num === "48", `${w}px chisel lands on ${end.num}: "${end.phase}"`);

  // Copy button: real clipboard contents and visible confirmation.
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(300);
  await page.locator(".hero .copy").click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const label = await page.locator(".hero .copy").textContent();
  ok(clip === "npx caveman-indonesia" && label === "Tersalin", `${w}px copy -> "${clip}", label "${label}"`);

  // Theme switch: dark system -> dark page; click -> light ground, label flips,
  // choice survives a reload; a light system with no saved choice starts light.
  const bg = () => page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return { theme: document.documentElement.dataset.theme, lum: (m[0] + m[1] + m[2]) / 765, label: document.querySelector(".theme__label").textContent };
  });
  const t0 = await bg();
  await page.locator("[data-theme-toggle]").click();
  await page.waitForTimeout(900);
  const t1 = await bg();
  await page.reload({ waitUntil: "networkidle" });
  const t2 = await bg();
  ok(t0.theme === "dark" && t0.lum < 0.15 && t1.theme === "light" && t1.lum > 0.85 && t1.label === "Mode gelap" && t2.theme === "light",
    `${w}px theme ${t0.theme}(${t0.lum.toFixed(2)}) -> ${t1.theme}(${t1.lum.toFixed(2)}, "${t1.label}") -> reload ${t2.theme}`);
  const lctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "light" });
  const lp = await lctx.newPage();
  await lp.goto(URL, { waitUntil: "networkidle" });
  const sysTheme = await lp.evaluate(() => document.documentElement.dataset.theme);
  ok(sysTheme === "light", `${w}px light system starts ${sysTheme}`);
  await lctx.close();

  ok(errors.length === 0, `${w}px console errors: ${errors.join(" | ") || "none"}`);
  await ctx.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
