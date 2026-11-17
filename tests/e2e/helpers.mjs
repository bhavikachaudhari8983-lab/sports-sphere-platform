// Shared helpers for the browser tests. Requires a running app (BASE) seeded with `npm run db:seed`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

export const BASE = process.env.BASE ?? "http://localhost:3000";
export const ARTIFACTS = join(import.meta.dirname, ".artifacts");
mkdirSync(ARTIFACTS, { recursive: true });
export const UPLOAD_FILE = join(import.meta.dirname, "../../public/brand/sports-sphere-logo.png");

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const STAFF = {
  admin: ["admin@sportssphere.example", "Admin@12345"],
  admin2: ["admin2@sportssphere.example", "Admin2@12345"],
  official: ["official@sportssphere.example", "Official@12345"],
  medical: ["medical@sportssphere.example", "Medical@12345"],
  coach: ["coach@sportssphere.example", "Coach@12345"],
};

export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
}

/** A fresh, isolated browser profile (own cookies) at a given width. */
export async function newPage(browser, width = 1280) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.setViewport({ width, height: 860, isMobile: width < 500, hasTouch: width < 500 });
  page.setDefaultTimeout(20_000);
  await front(page);
  page.jsErrors = [];
  page.on("pageerror", (e) => page.jsErrors.push(`${new URL(page.url()).pathname}: ${e.message.split("\n")[0].slice(0, 160)}`));
  page.on("dialog", (d) => d.dismiss()); // never let a native alert/confirm block a test
  return page;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Chrome holds back animation frames in background tabs, so a tab left behind by another one runs
// requestAnimationFrame work (e.g. "focus the first invalid field", React updates) late — even mid-typing.
// Every navigation, click and step therefore brings its tab to the front first.
let fronted = null;
export async function front(page) {
  if (!page || page === fronted || page.isClosed()) return;
  await page.bringToFront();
  fronted = page;
}
export const go = async (page, path) => {
  await front(page);
  return page.goto(BASE + path, { waitUntil: "load" });
};
export const path = (page) => new URL(page.url()).pathname;
export const waitText = (page, text, timeout = 20_000) => page.waitForFunction((t) => document.body?.innerText.includes(t), { timeout }, text);
export const waitPath = (page, p, timeout = 20_000) => page.waitForFunction((x) => location.pathname === x, { timeout }, p);
export const hasText = (page, text) => page.evaluate((t) => document.body.innerText.includes(t), text);
export const click = async (page, selector, text) => {
  await front(page);
  return page.locator(`${selector}::-p-text(${text})`).click();
};
/** Clicks the confirm (last) button of the open native-<dialog> modal. */
export async function confirmDialog(page) {
  await page.waitForSelector("dialog[open]");
  const buttons = await page.$$("dialog[open] button");
  await buttons[buttons.length - 1].click();
}
export const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

export async function staffLogin(page, who, expectPath) {
  const [email, password] = STAFF[who];
  await go(page, "/staff/login");
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", password);
  await click(page, "form button[type=submit]", "Sign in");
  if (expectPath) await waitPath(page, expectPath);
}

/** Reads the on-screen demo OTP and enters it. */
export async function enterDemoOtp(page) {
  await waitText(page, "Demo OTP");
  const code = await page.$eval('[role="note"] p.font-mono', (e) => e.textContent.trim());
  await page.type("#otp", code);
  await click(page, "button", "Verify & continue");
  return code;
}

export async function studentLogin(page, mobile) {
  await go(page, "/status");
  await page.waitForSelector("#login-mobile");
  await page.type("#login-mobile", mobile);
  await click(page, "button", "Send code");
  await enterDemoOtp(page);
  await waitText(page, "Registration status");
}

/** Small test runner: named steps, screenshot on failure, summary at the end. */
export function suite(name) {
  const results = [];
  return {
    async step(label, page, fn) {
      try {
        await front(page);
        const note = await fn();
        results.push({ ok: true, label, note });
      } catch (e) {
        const file = join(ARTIFACTS, `${name}-${label.replace(/\W+/g, "_").slice(0, 60)}.png`);
        await page?.screenshot({ path: file, fullPage: true }).catch(() => {});
        results.push({ ok: false, label, note: String(e?.message ?? e).split("\n")[0], file });
      }
    },
    results,
  };
}

export function report(all) {
  let fails = 0;
  for (const [name, results] of all) {
    console.log(`\n== ${name} ==`);
    for (const r of results) {
      if (!r.ok) fails++;
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.note ? ` — ${r.note}` : ""}${r.file ? `\n      screenshot: ${r.file}` : ""}`);
    }
  }
  const total = all.reduce((n, [, r]) => n + r.length, 0);
  console.log(`\n${total - fails}/${total} passed${fails ? `, ${fails} FAILED` : ""}`);
  return fails;
}
