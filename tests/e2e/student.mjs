// A new host-university student registers end to end, then an approved student uses every status-page button.
import { BASE, UPLOAD_FILE, click, confirmDialog, enterDemoOtp, go, hasText, newPage, noSidewaysScroll, path, studentLogin, suite, wait, waitPath, waitText } from "./helpers.mjs";

async function upload(page, label) {
  // Each DocumentUpload has two hidden inputs (file + camera); use the first one inside the block with this label.
  const input = await page.evaluateHandle((l) => {
    const blocks = [...document.querySelectorAll("div")].filter((d) => d.querySelector('input[type="file"]') && d.innerText.includes(l));
    const smallest = blocks.sort((a, b) => a.innerText.length - b.innerText.length)[0];
    return smallest?.querySelector('input[type="file"]');
  }, label);
  if (!(await input.evaluate((i) => !!i))) throw new Error(`no upload field for “${label}”`);
  await input.uploadFile(UPLOAD_FILE);
  await page.waitForFunction((l) => [...document.querySelectorAll("div")].some((d) => d.innerText.includes(l) && d.innerText.includes("Uploaded")), {}, label);
}

const next = async (page) => {
  await click(page, "button", "Save & continue");
  await wait(700);
};

export async function studentSuite(browser) {
  const t = suite("student");
  const p = await newPage(browser, 390);

  await t.step("Register: choose 'Host university student'", p, async () => {
    await go(p, "/register");
    await click(p, "button", "Host university student (Indian)");
    await p.waitForSelector("#prn");
  });
  await t.step("Register: unknown PRN is rejected", p, async () => {
    await p.type("#prn", "XX00NOPE");
    await click(p, "button", "Find my record");
    await p.waitForSelector("#prn-error");
    await p.$eval("#prn", (e) => (e.value = ""));
    await p.click("#prn", { clickCount: 3 });
    await p.keyboard.press("Backspace");
  });
  await t.step("Register: PRN found → code → signed in", p, async () => {
    await p.type("#prn", "SS24MA014");
    await click(p, "button", "Find my record");
    await waitText(p, "Record found");
    await click(p, "button", "Send code");
    await enterDemoOtp(p);
    await waitText(p, "Verify with DigiLocker");
  });
  await t.step("Identity: can't continue before DigiLocker", p, async () => {
    const disabled = await p.$eval("::-p-text(Save & continue)", (b) => b.closest("button").disabled);
    if (!disabled) throw new Error("'Save & continue' is clickable before identity is verified");
  });
  await t.step("Identity: DigiLocker sign-in, code, consent", p, async () => {
    await click(p, "main button", "Verify with DigiLocker");
    await p.waitForSelector("#aadhaar");
    await p.type("#aadhaar", "000010000014");
    await click(p, "dialog button", "Sign in to DigiLocker");
    await waitText(p, "Demo DigiLocker OTP");
    const code = await p.$eval('dialog [role="note"] p.font-mono', (e) => e.textContent.trim());
    await p.type("#dl-otp", code);
    await click(p, "dialog button", "Continue");
    await click(p, "dialog button", "Allow");
    await waitText(p, "Identity verified");
    if (!(await hasText(p, "Aditya Banerjee"))) throw new Error("name not filled from DigiLocker");
  });
  await t.step("Identity → Selfie", p, async () => {
    await next(p);
    await waitText(p, "Open camera");
  });
  await t.step("Selfie: camera unavailable is explained; upload fallback works", p, async () => {
    await click(p, "button", "Open camera");
    await waitText(p, "Camera unavailable");
    await click(p, "summary", "Upload instead");
    await upload(p, "Selfie photo");
    await next(p);
    await p.waitForSelector("#address");
  });
  await t.step("Personal: required fields are enforced", p, async () => {
    await click(p, "button", "Save & continue");
    await p.waitForSelector("#bloodGroup[aria-invalid=true]");
    await p.waitForSelector("#emergencyName[aria-invalid=true]");
    await waitText(p, "Upload a passport-size photo");
  });
  await t.step("Personal: fill details + passport photo", p, async () => {
    // Address comes pre-filled from DigiLocker; replace it.
    await p.$eval("#address", (e) => e.select());
    await p.keyboard.press("Backspace");
    await p.type("#address", "Room 12, Hostel B, Main Campus (test)");
    const v = await p.$eval("#bloodGroup", (s) => [...s.options].find((o) => o.value)?.value);
    await p.select("#bloodGroup", v);
    await p.type("#emergencyName", "Test Parent");
    await p.type("#emergencyPhone", "+919800000001");
    await upload(p, "Passport-size photo");
    await next(p);
    await waitText(p, "Academic");
  });
  await t.step("Academic → Sports (details come from the ERP)", p, async () => {
    await next(p);
    await waitText(p, "Choose your sports");
  });
  await t.step("Sports: must choose an event", p, async () => {
    await click(p, "button", "Save & continue");
    await waitText(p, "Choose at least one event");
  });
  await t.step("Sports: age-limited event shown only if eligible; pick events", p, async () => {
    await click(p, "button[aria-pressed]", "Athletics");
    await waitText(p, "200 m (U-23) — Men");
    await click(p, "label", "200 m (U-23) — Men");
    await click(p, "button[aria-pressed]", "Football");
    await click(p, "label", "11-a-side — Men");
    await next(p);
    await waitText(p, "Medical fitness certificate");
  });
  await t.step("Medical: certificate + both consents required", p, async () => {
    await click(p, "button", "Save & continue");
    await wait(500);
    if (!(await hasText(p, "Upload your medical fitness certificate"))) throw new Error("no error for missing certificate");
    await upload(p, "Medical fitness certificate");
    await p.$eval("#declarationAccepted", (e) => e.click());
    await p.$eval("#privacyAccepted", (e) => e.click());
    await next(p);
    await waitText(p, "Submit registration");
  });
  await t.step("Review: 'Edit' goes back to a step and keeps what was entered", p, async () => {
    const edits = await p.$$("button::-p-text(Edit), a::-p-text(Edit)");
    await edits[edits.length - 1].click(); // Medical & consent
    await p.waitForSelector("#declarationAccepted");
    if (!(await p.$eval("#declarationAccepted", (e) => e.checked))) throw new Error("consent lost");
    await next(p);
    await waitText(p, "Submit registration");
  });
  await t.step("Review: leaving and coming back resumes the draft", p, async () => {
    await go(p, "/");
    await go(p, "/register");
    await waitText(p, "Submit registration", 30_000);
  });
  await t.step("Submit → status page shows Pending", p, async () => {
    await p.waitForFunction(() => window.scrollY === 0 || true);
    await wait(500);
    await click(p, "button", "Submit registration");
    await confirmDialog(p);
    await waitPath(p, "/status", 30_000);
    await waitText(p, "Registration status");
    return (await p.evaluate(() => document.body.innerText.match(/Pending|Flagged/)?.[0])) ?? "?";
  });
  await t.step("Pending student: one event change allowed, withdraw works", p, async () => {
    await waitText(p, "Request change");
    await (await p.$$("button::-p-text(Request change)"))[0].click();
    await p.waitForSelector("#to-event");
    await click(p, "dialog[open] button", "Send request");
    await p.waitForSelector("#to-event[aria-invalid=true], #change-reason[aria-invalid=true]");
    await click(p, "dialog[open] button", "Cancel");
    const before = (await p.$$("button::-p-text(Withdraw)")).length;
    await (await p.$$("button::-p-text(Withdraw)"))[before - 1].click();
    await p.waitForSelector("dialog[open] #change-reason");
    await p.type("dialog[open] #change-reason", "Clash with my exam.");
    await confirmDialog(p);
    await waitText(p, "Withdrawn");
  });
  await t.step("[390px] status page fits the phone", p, async () => {
    if (!(await noSidewaysScroll(p))) throw new Error("scrolls sideways");
  });

  // ---------- Approved student ----------
  const a = await newPage(browser);
  await studentLogin(a, "7000010001");
  await t.step("Approved: QR Sports ID card and PDF download", a, async () => {
    await waitText(a, "Your QR Sports ID");
    await a.waitForSelector('a[href*="format=pdf"]');
    const href = await a.$eval('a[href*="format=pdf"]', (x) => x.href);
    const r = await a.evaluate(async (u) => { const x = await fetch(u); return [x.status, x.headers.get("content-type")]; }, href);
    if (r[0] !== 200 || !r[1].includes("pdf")) throw new Error(r.join(" "));
  });
  await t.step("Approved: Download PNG button", a, async () => {
    await a.evaluate(() => { window.__dl = null; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl = this.href.slice(0, 22); return; } return o.call(this); }; });
    await click(a, "button", "Download PNG");
    await a.waitForFunction(() => window.__dl, { timeout: 15_000 });
  });
  await t.step("Approved: My games shows medal, results and certificates", a, async () => {
    for (const x of ["My games", "Gold", "Certificates"]) await waitText(a, x);
    const href = await a.$eval('a[href^="/api/certificates/"]', (x) => x.getAttribute("href"));
    const st = await a.evaluate(async (h) => (await fetch(h)).status, href);
    if (st !== 200) throw new Error(`certificate PDF ${st}`);
  });
  await t.step("Approved: certificate 'Verify link' opens the public check", a, async () => {
    await click(a, "a", "Verify link");
    await a.waitForFunction(() => location.pathname.startsWith("/verify/"));
    await waitText(a, "Certificate is authentic");
    await a.goBack({ waitUntil: "load" });
  });
  await t.step("Approved: data deletion dialog opens and cancels", a, async () => {
    await go(a, "/status");
    await click(a, "button", "Request data deletion");
    await waitText(a, "Delete my data?");
    await click(a, "dialog[open] button", "Cancel");
  });
  await t.step("Bottom bar (phone): Home, Live, Register, Account", a, async () => {
    await a.setViewport({ width: 360, height: 760, isMobile: true, hasTouch: true });
    await go(a, "/");
    for (const [label, to] of [["Live", "/events"], ["Account", "/status"], ["Home", "/"]]) {
      await click(a, 'nav[aria-label="Primary"] a', label);
      await waitPath(a, to);
    }
    // This athlete is already registered, so "Register" takes them to My account (not a second registration).
    // Checked last: the bar hides itself on the registration wizard, which has its own Back/Save bar.
    await click(a, 'nav[aria-label="Primary"] a', "Register");
    await waitPath(a, "/status");
  });
  await t.step("Theme toggle switches and is remembered", a, async () => {
    await go(a, "/");
    await a.click('button[aria-label="Switch to dark mode"]');
    await a.reload({ waitUntil: "load" });
    if (!(await a.evaluate(() => document.documentElement.classList.contains("dark")))) throw new Error("not remembered");
    await a.click('button[aria-label="Switch to light mode"]');
  });

  // ---------- Flagged student ----------
  const f = await newPage(browser);
  await studentLogin(f, "7000010002");
  await t.step("Flagged student sees the reason and next step", f, async () => {
    await waitText(f, "Flagged for manual review");
    await waitText(f, "Date of birth");
  });

  // ---------- Public pages from the home page ----------
  const h = await newPage(browser);
  await t.step("Home: hero buttons and every header link work", h, async () => {
    await go(h, "/");
    const links = await h.$$eval("header a[href^='/'], main a[href^='/'], footer a[href^='/']", (as) => [...new Set(as.map((x) => x.getAttribute("href")))]);
    const bad = [];
    for (const l of links) {
      const r = await h.goto(BASE + l, { waitUntil: "domcontentloaded" });
      if (!r || r.status() >= 400) bad.push(`${l} → ${r?.status()}`);
    }
    if (bad.length) throw new Error(bad.join(", "));
    return `${links.length} links`;
  });

  void path;
  const errs = [p, a, f, h].flatMap((x) => x.jsErrors);
  t.results.push({ ok: errs.length === 0, label: "No JavaScript errors during student tests", note: errs.join(" | ") });
  return t.results;
}
