/**
 * "Did that actually save?" — the drawn-signature setting and every save
 * confirmation, through a real browser at 390px.
 *
 * Two things are being proven. First, that toggling a normal waiver option
 * never throws: the crash this suite was written for was a handler reading
 * `event.currentTarget` inside a state updater, which React has already
 * emptied by then. Second, that a leader who has scrolled to the bottom of a
 * long form can tell whether their save worked without scrolling back up.
 *
 *   E2E_BASE_URL=https://localhost:3443 node tests/save-ux.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const EMAIL = "leader@example.church";
const PASSWORD = "readysetamen2026";

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}
const log = (m) => console.log(`• ${m}`);

const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ignoreHTTPSErrors: true,
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext(PHONE);
const page = await context.newPage();

// Any uncaught client exception fails the run — that is the class of bug here.
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const errorsSince = (n) => pageErrors.slice(n);

/** Is the top-of-form save confirmation actually on screen right now? */
async function confirmationVisible() {
  return page.evaluate(() => {
    const el = document.querySelector('[data-save-status="saved"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
  });
}

const scrollY = () => page.evaluate(() => window.scrollY);

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/orgs\//, { timeout: 30000 });
const slug = page.url().split("/orgs/")[1].split("/")[0];

// ---------------------------------------------------------------------------
log("The waiver builder: toggling options never throws");

await page.goto(`${BASE}/orgs/${slug}/waivers`);
await page.waitForLoadState("networkidle");
// By name, not by position: other suites leave their own templates in this
// organization, and an empty one cannot be saved.
const templateHref = await page
  .locator('a[href*="/waivers/"]', { hasText: "Student Ministry Release" })
  .first()
  .getAttribute("href");
check("a waiver template exists to edit", Boolean(templateHref), templateHref ?? "none");
await page.goto(`${BASE}${templateHref}`);
await page.waitForLoadState("networkidle");

const versionText = await page.textContent("main");
const startVersion = Number(versionText.match(/Currently on version (\d+)/)?.[1] ?? 0);
check("the builder states the current version", startVersion > 0, `version ${startVersion}`);

const drawn = page.locator('label:has-text("Require a drawn signature") input[type="checkbox"]');
let mark = pageErrors.length;
await drawn.scrollIntoViewIfNeeded();
await drawn.check();
check("the drawn-signature box turns on", await drawn.isChecked());
check("with no client-side exception", errorsSince(mark).length === 0, errorsSince(mark)[0] ?? "");

mark = pageErrors.length;
await drawn.uncheck();
check("and off again", !(await drawn.isChecked()));
check("still with no exception", errorsSince(mark).length === 0, errorsSince(mark)[0] ?? "");
await drawn.check();

// The two text fields that crashed for the same reason.
mark = pageErrors.length;
const title = page.locator('label:has-text("Title shown to signers") input, input[name="waiverTitle"]').first();
if (await title.count()) {
  await title.fill("Release and Waiver");
  await title.type(" X", { delay: 30 });
}
const orgName = page.locator('label:has-text("Organization name") input').first();
await orgName.type(" ", { delay: 30 });
check("typing in the header fields does not throw", errorsSince(mark).length === 0, errorsSince(mark)[0] ?? "");

log("The preview reflects the setting");
await page.click('button:has-text("Preview")');
await page.waitForTimeout(300);
check(
  "the preview says a drawn signature is required",
  (await page.locator('[data-preview="drawn-signature"]').count()) > 0,
);
await page.click('button:has-text("Back to editing")');

// ---------------------------------------------------------------------------
log("Saving from the bottom of the builder shows the confirmation");

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const beforeSave = await scrollY();
check("the leader is far down the page", beforeSave > 300, `scrollY ${Math.round(beforeSave)}`);

await page.locator('button:has-text("Save version")').last().click();
await page.waitForSelector('[data-save-status="saved"]', { timeout: 30000 });
await page.waitForTimeout(900); // let the smooth scroll land
check("the save confirmation is on screen without scrolling by hand", await confirmationVisible());
check("the page moved to the top", (await scrollY()) < beforeSave, `scrollY ${Math.round(await scrollY())}`);
check(
  "the confirmation says what happened",
  /A new version has been recorded/.test(await page.textContent('[data-save-status="saved"]')),
);

const afterOne = Number((await page.textContent("main")).match(/Currently on version (\d+)/)?.[1] ?? 0);
check("the version number went up by exactly one", afterOne === startVersion + 1, `${startVersion} → ${afterOne}`);
check("the setting survived the save", await drawn.isChecked());

// ---------------------------------------------------------------------------
log("A rapid double tap does not create two versions");

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const save = page.locator('button:has-text("Save version")').last();
await save.click();
await save.click({ force: true, timeout: 2000 }).catch(() => {}); // disabled — expected
await page.waitForTimeout(2500);
await page.reload();
await page.waitForLoadState("networkidle");
const afterDouble = Number((await page.textContent("main")).match(/Currently on version (\d+)/)?.[1] ?? 0);
check(
  "two taps produced at most one new version",
  afterDouble <= afterOne + 1,
  `${afterOne} → ${afterDouble}`,
);

// ---------------------------------------------------------------------------
log("The top and bottom save buttons behave identically");

await page.goto(`${BASE}${templateHref}`);
await page.waitForLoadState("networkidle");
const beforeTop = Number((await page.textContent("main")).match(/Currently on version (\d+)/)?.[1] ?? 0);
const orgField = page.locator('label:has-text("Organization name") input').first();
await orgField.fill("Grace Community Church");
await orgField.type(" ", { delay: 20 });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.locator('button:has-text("Save version")').first().scrollIntoViewIfNeeded();
await page.locator('button:has-text("Save version")').first().click();
await page.waitForSelector('[data-save-status="saved"]', { timeout: 30000 });
await page.waitForTimeout(900);
check("saving from the top button confirms too", await confirmationVisible());
const afterTop = Number((await page.textContent("main")).match(/Currently on version (\d+)/)?.[1] ?? 0);
check("and records exactly one version", afterTop === beforeTop + 1, `${beforeTop} → ${afterTop}`);

// ---------------------------------------------------------------------------
log("Trip settings behaves the same way");

await page.goto(`${BASE}/orgs/${slug}`);
await page.waitForLoadState("networkidle");
const tripHref = (
  await page.locator('a[href*="/trips/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")))
).find((href) => /\/trips\/[a-z0-9]{8,}$/.test(href ?? ""));
check("a trip exists to configure", Boolean(tripHref), tripHref ?? "none");
const tripUrl = `${BASE}${tripHref}`;
await page.goto(`${tripUrl}/settings`);
await page.waitForLoadState("networkidle");

const originalName = await page.inputValue('input[name="name"]');
await page.fill('input[name="destination"]', "Gatlinburg, TN");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const settingsScroll = await scrollY();
check("the leader is at the bottom of trip settings", settingsScroll > 200, `scrollY ${Math.round(settingsScroll)}`);

await page.click('button:has-text("Save trip settings")');
await page.waitForSelector('[data-save-status="saved"]', { timeout: 30000 });
await page.waitForTimeout(900);
check("the trip settings confirmation is on screen", await confirmationVisible());
check("the page moved up to it", (await scrollY()) < settingsScroll);
check("the saved value is still in the field", (await page.inputValue('input[name="destination"]')) === "Gatlinburg, TN");
check("the trip name was not disturbed", (await page.inputValue('input[name="name"]')) === originalName);

log("A failed save keeps the work and explains itself where the button is");

await page.fill('input[name="name"]', ""); // required by the schema, so this is rejected
await page.fill('input[name="destination"]', "Somewhere memorable");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const beforeFail = await scrollY();
await page.evaluate(() => {
  // The browser would block an empty required field before it ever posts; this
  // is about what happens when the server rejects it.
  document.querySelector('input[name="name"]')?.removeAttribute("required");
});
await page.click('button:has-text("Save trip settings")');
await page.waitForTimeout(2500);
check("the typed value survived the failure", (await page.inputValue('input[name="destination"]')) === "Somewhere memorable");
check("the failure is reported next to the button", (await page.locator("[data-save-error]").count()) > 0);
check(
  "and the page did not scroll away from the work",
  Math.abs((await scrollY()) - beforeFail) < 200,
  `${Math.round(beforeFail)} → ${Math.round(await scrollY())}`,
);
await page.fill('input[name="name"]', originalName);
await page.click('button:has-text("Save trip settings")');
await page.waitForSelector('[data-save-status="saved"]', { timeout: 30000 });

// ---------------------------------------------------------------------------
log("Nothing scrolls sideways and no exception was thrown anywhere");

for (const path of [`${tripUrl}/settings`, `${BASE}${templateHref}`, `${BASE}/orgs/${slug}/settings`]) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(`no horizontal scrolling at 390px on ${path.replace(BASE, "")}`, overflow <= 0, `${overflow}px`);
}
check("no uncaught client exceptions in the whole run", pageErrors.length === 0, pageErrors[0] ?? "");

await browser.close();
console.log(failures === 0 ? "\nSave UX holds.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
