// Sign-in, sign-out and access problems for students and staff.
import { click, confirmDialog, front, enterDemoOtp, go, hasText, newPage, path, staffLogin, studentLogin, suite, wait, waitPath, waitText } from "./helpers.mjs";

export async function signinSuite(browser) {
  const t = suite("signin");

  // ---------- Students ----------
  const s = await newPage(browser);
  await t.step("Student: empty mobile shows an error", s, async () => {
    await go(s, "/status");
    await click(s, "button", "Send code");
    await s.waitForSelector("#login-mobile[aria-invalid=true]");
  });
  await t.step("Student: invalid mobile shows an error", s, async () => {
    await s.type("#login-mobile", "12345");
    await click(s, "button", "Send code");
    await s.waitForFunction(() => document.querySelector("#login-mobile-error")?.textContent.length > 0);
    return await s.$eval("#login-mobile-error", (e) => e.textContent.trim());
  });
  await t.step("Student: unregistered mobile is told clearly", s, async () => {
    await s.$eval("#login-mobile", (e) => (e.value = ""));
    await go(s, "/status");
    await s.type("#login-mobile", "9876500000");
    await click(s, "button", "Send code");
    // The code is sent either way (so nobody can probe which numbers are registered); the error comes after it.
    await enterDemoOtp(s);
    await s.waitForSelector("#otp-error");
    const msg = await s.$eval("#otp-error", (e) => e.textContent.trim());
    if (!/No registration/i.test(msg)) throw new Error(`message was “${msg}”`);
    return msg;
  });
  await t.step("Student: wrong code is rejected, then right code works", s, async () => {
    await go(s, "/status");
    await s.type("#login-mobile", "7000010001");
    await click(s, "button", "Send code");
    await waitText(s, "Demo OTP");
    const code = await s.$eval('[role="note"] p.font-mono', (e) => e.textContent.trim());
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    await s.type("#otp", wrong);
    await click(s, "button", "Verify & continue");
    await s.waitForSelector("#otp-error");
    const msg = await s.$eval("#otp-error", (e) => e.textContent.trim());
    await s.$eval("#otp", (e) => (e.value = ""));
    await s.click("#otp", { clickCount: 3 });
    await s.keyboard.press("Backspace");
    await s.type("#otp", code);
    await click(s, "button", "Verify & continue");
    await waitText(s, "Registration status");
    return `wrong code → “${msg}”`;
  });
  await t.step("Student: stays signed in after reload", s, async () => {
    await s.reload({ waitUntil: "load" });
    await waitText(s, "Registration status");
  });
  await t.step("Student: blocked from the admin area with a way out", s, async () => {
    await go(s, "/admin");
    await waitText(s, "Access denied");
    if (!(await s.$('a[href="/staff/login"]'))) throw new Error("no 'switch account' link");
  });
  await t.step("Student: sign out returns to the sign-in form", s, async () => {
    await go(s, "/status");
    await click(s, "button", "Sign out");
    await s.waitForFunction(() => location.pathname === "/");
    await go(s, "/status");
    await s.waitForSelector("#login-mobile");
  });
  await t.step("Student: 'Change details' and resend countdown work", s, async () => {
    await s.type("#login-mobile", "7000010002");
    await click(s, "button", "Send code");
    await s.waitForSelector("#otp");
    const resendDisabled = await s.$eval("button::-p-text(Resend in)", (b) => b.disabled);
    if (!resendDisabled) throw new Error("resend should wait 30s");
    await click(s, "button", "Change details");
    await s.waitForSelector("#login-mobile");
  });
  await t.step("Student: email sign-in works", s, async () => {
    await go(s, "/status");
    await click(s, "[role=radio]", "Email");
    await s.type("#login-email", "aarav.kulkarni@students.sportssphere.example");
    await click(s, "button", "Send code");
    await s.waitForFunction(() => !!document.querySelector("#otp") || !!document.querySelector("#login-email-error"));
    if (await s.$("#login-email-error")) throw new Error(await s.$eval("#login-email-error", (e) => e.textContent));
    await enterDemoOtp(s);
    await waitText(s, "Registration status");
  });

  // ---------- Staff ----------
  const a = await newPage(browser);
  await t.step("Staff: empty form shows an error", a, async () => {
    await go(a, "/staff/login");
    await click(a, "form button[type=submit]", "Sign in");
    await waitText(a, "Enter your email and password");
  });
  await t.step("Staff: wrong password is rejected", a, async () => {
    await a.type("#email", "official@sportssphere.example");
    await a.type("#password", "wrong-password");
    await click(a, "form button[type=submit]", "Sign in");
    await waitText(a, "incorrect");
  });
  await t.step("Staff: show/hide password button", a, async () => {
    await a.click('button[aria-label="Show password"]');
    if ((await a.$eval("#password", (e) => e.type)) !== "text") throw new Error("still hidden");
    await a.click('button[aria-label="Hide password"]');
  });
  await t.step("Staff: 5 wrong passwords lock sign-in for that account", a, async () => {
    for (let i = 0; i < 6; i++) {
      await go(a, "/staff/login");
      await a.type("#email", "nobody@sportssphere.example");
      await a.type("#password", `bad-${i}`);
      await click(a, "form button[type=submit]", "Sign in");
      await a.waitForSelector('[role="alert"], .text-danger-fg, [class*="danger"]');
      await wait(300);
    }
    await waitText(a, "Too many attempts");
  });
  for (const [who, landing] of [["admin", "/admin"], ["official", "/desk"], ["medical", "/medical"], ["coach", "/coach"], ["admin2", "/admin"]]) {
    const p = await newPage(browser);
    await t.step(`Staff: ${who} lands on ${landing}`, p, async () => {
      await staffLogin(p, who, landing);
    });
    await p.browserContext().close();
  }
  await t.step("Staff: demo 'tap to fill' buttons fill the form", a, async () => {
    await go(a, "/staff/login");
    await click(a, "button", "Coach");
    if ((await a.$eval("#email", (e) => e.value)) !== "coach@sportssphere.example") throw new Error("not filled");
  });
  await t.step("Staff: protected link → sign in → back to that page", a, async () => {
    await go(a, "/admin/competition");
    await waitPath(a, "/staff/login");
    await a.type("#email", "admin@sportssphere.example");
    await a.type("#password", "Admin@12345");
    await click(a, "form button[type=submit]", "Sign in");
    await waitPath(a, "/admin/competition");
  });
  await t.step("Staff: already signed in → login page goes to dashboard", a, async () => {
    await go(a, "/staff/login");
    await waitPath(a, "/admin");
  });
  await t.step("Staff: sign out from the sidebar", a, async () => {
    await go(a, "/admin");
    await click(a, "aside button", "Sign out");
    await waitPath(a, "/staff/login");
    await go(a, "/admin");
    await waitPath(a, "/staff/login");
  });

  const o = await newPage(browser);
  await t.step("Staff: official opening an admin link lands somewhere useful", o, async () => {
    await go(o, "/staff/login?callbackUrl=%2Fadmin");
    await o.type("#email", "official@sportssphere.example");
    await o.type("#password", "Official@12345");
    await click(o, "form button[type=submit]", "Sign in");
    await o.waitForFunction(() => location.pathname !== "/staff/login");
    await wait(800);
    if (await hasText(o, "Access denied")) throw new Error(`official sent to ${path(o)} → Access denied`);
    return `→ ${path(o)}`;
  });

  // ---------- One browser, two kinds of account ----------
  const x = await newPage(browser);
  await t.step("Switching: staff opening /status is warned before losing the staff session", x, async () => {
    await staffLogin(x, "admin", "/admin");
    await go(x, "/status");
    await x.waitForSelector("#login-mobile");
    if (!(await x.evaluate(() => /signed in as staff|staff account/i.test(document.body.innerText)))) throw new Error("no warning that student sign-in will sign the admin out");
  });
  await t.step("Switching: student signed in sees a warning on the staff login", x, async () => {
    const y = await newPage(browser);
    await studentLogin(y, "7000010001");
    await go(y, "/staff/login");
    await y.waitForSelector("#email");
    const warned = await y.evaluate(() => /signed in as a student|student account/i.test(document.body.innerText));
    await y.browserContext().close();
    if (!warned) throw new Error("no warning that staff sign-in replaces the student session");
  });

  await t.step("Deactivated staff can't sign in; reactivated can", a, async () => {
    const ad = await newPage(browser);
    await staffLogin(ad, "admin", "/admin");
    await go(ad, "/admin/settings#staff");
    await ad.waitForSelector("#staff");
    const toggle = async (expect) => {
      await front(ad);
      const btn = await ad.evaluateHandle(() => [...document.querySelectorAll("#staff li")].find((li) => li.innerText.includes("medical@sportssphere.example"))?.querySelectorAll("button")[1]);
      const label = await btn.evaluate((b) => b?.innerText.trim() ?? "");
      if (label !== expect) throw new Error(`expected “${expect}”, got “${label}”`);
      await btn.click();
      await waitText(ad, expect === "Deactivate" ? "Account deactivated" : "Account reactivated");
    };
    await toggle("Deactivate");
    const m = await newPage(browser);
    await go(m, "/staff/login");
    await m.type("#email", "medical@sportssphere.example");
    await m.type("#password", "Medical@12345");
    await click(m, "form button[type=submit]", "Sign in");
    await waitText(m, "incorrect");
    await toggle("Reactivate");
    await go(m, "/staff/login");
    await m.type("#email", "medical@sportssphere.example");
    await m.type("#password", "Medical@12345");
    await click(m, "form button[type=submit]", "Sign in");
    await waitPath(m, "/medical");
    await m.browserContext().close();
    await ad.browserContext().close();
  });

  void confirmDialog;
  const errs = [s, a, o, x].flatMap((p) => p.jsErrors);
  t.results.push({ ok: errs.length === 0, label: "No JavaScript errors during sign-in tests", note: errs.join(" | ") });
  return t.results;
}
