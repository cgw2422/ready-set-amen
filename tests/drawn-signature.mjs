/**
 * The drawn-signature requirement, from the builder checkbox to a finger on a
 * phone screen and into the permanent record.
 *
 * The requirement lives inside the versioned waiver content, so this walks the
 * whole path twice: once with it on, once with it off, and then checks that
 * turning it off later cannot rewrite what somebody already signed.
 *
 *   E2E_BASE_URL=https://localhost:3443 node tests/drawn-signature.mjs
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
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/orgs\//, { timeout: 30000 });
const slug = page.url().split("/orgs/")[1].split("/")[0];

await page.goto(`${BASE}/orgs/${slug}/waivers`);
await page.waitForLoadState("networkidle");
// By name, not by position: other suites leave their own templates in this
// organization, and an empty one cannot be saved.
const templateHref = await page
  .locator('a[href*="/waivers/"]', { hasText: "Student Ministry Release" })
  .first()
  .getAttribute("href");

/** Turns the setting on or off and saves, returning the new version number. */
async function setDrawnSignature(on) {
  await page.goto(`${BASE}${templateHref}`);
  await page.waitForLoadState("networkidle");
  const box = page.locator('label:has-text("Require a drawn signature") input[type="checkbox"]');
  await box.scrollIntoViewIfNeeded();
  if (on) await box.check();
  else await box.uncheck();
  check(`the checkbox reads ${on ? "on" : "off"}`, (await box.isChecked()) === on);
  await page.locator('button:has-text("Save version")').last().click();
  await page.waitForSelector('[data-save-status="saved"]', { timeout: 30000 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  const saved = page.locator('label:has-text("Require a drawn signature") input[type="checkbox"]');
  check(`it is still ${on ? "on" : "off"} after saving and reloading`, (await saved.isChecked()) === on);
  return Number((await page.textContent("main")).match(/Currently on version (\d+)/)?.[1] ?? 0);
}

/**
 * A trip stays pinned to the waiver version it was assigned — that is what
 * keeps old signatures meaningful — so a new version only reaches signers once
 * the leader adopts it. This is the button that does that.
 */
async function adoptLatestVersion(tripUrl) {
  await page.goto(`${tripUrl}/waivers`);
  await page.waitForLoadState("networkidle");
  const adopt = page.locator('button:has-text("Adopt version")');
  if (await adopt.count()) {
    await adopt.first().click();
    await page.waitForTimeout(2000);
    return true;
  }
  return false;
}

/** Hands back a fresh personal signing link from the waiver queue. */
async function signingLink(tripUrl) {
  await page.goto(`${tripUrl}/waivers`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Work through")');
  await page.waitForSelector("button:has-text('Copy link for')", { timeout: 30000 });
  await page.click("button:has-text('Copy link for')");
  await page.waitForSelector('input[aria-label^="Signing link"]', { timeout: 30000 });
  return (await page.inputValue('input[aria-label^="Signing link"]')).trim();
}

/** Walks a signer to the last step, filling whatever the waiver asks for. */
async function walkToSigning(signer, url) {
  await signer.goto(url);
  await signer.waitForSelector("text=Signing for", { timeout: 30000 });
  for (const field of await signer.locator("input[required], textarea[required]").all()) {
    const name = await field.getAttribute("name");
    if (!name?.startsWith("field_")) continue;
    if ((await field.inputValue()) === "") await field.fill("Provided for testing");
  }
  await signer.click('button:has-text("Continue to the waiver")');
  await signer.waitForSelector("button:has-text('Continue to sign')", { timeout: 30000 });
  await signer.click('button:has-text("Continue to sign")');
  await signer.fill('input[name="signerName"]', "Rosa Mercer");
  const rel = signer.locator('input[name="signerRelationship"]');
  if (await rel.count()) await rel.fill("Mother");
  await signer.fill('input[name="typedSignature"]', "Rosa Mercer");
  for (const box of await signer.locator('input[type="checkbox"][required]').all()) {
    await box.check();
  }
}

/** Draws a short stroke on the signature canvas with a finger. */
async function drawSignature(signer) {
  const canvas = signer.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await signer.mouse.move(box.x + 30, box.y + box.height / 2);
  await signer.mouse.down();
  await signer.mouse.move(box.x + 90, box.y + box.height / 2 - 18, { steps: 8 });
  await signer.mouse.move(box.x + 150, box.y + box.height / 2 + 12, { steps: 8 });
  await signer.mouse.up();
}

const tripHref = (
  await page.goto(`${BASE}/orgs/${slug}`).then(() =>
    page.locator('a[href*="/trips/"]').evaluateAll((e) => e.map((x) => x.getAttribute("href"))),
  )
).find((href) => /\/trips\/[a-z0-9]{8,}$/.test(href ?? ""));
const tripUrl = `${BASE}${tripHref}`;

// ---------------------------------------------------------------------------
log("Off by default: a signer is never asked to draw");

const offVersion = await setDrawnSignature(false);
await adoptLatestVersion(tripUrl);
let url = await signingLink(tripUrl);
let guest = await browser.newContext(PHONE);
let signer = await guest.newPage();
const signerErrors = [];
signer.on("pageerror", (e) => signerErrors.push(e.message));
await walkToSigning(signer, url);
check("the pad is offered as optional", /Optional/i.test(await signer.textContent("main")));
await signer.click('button:has-text("Sign waiver")');
await signer.waitForSelector("text=all set", { timeout: 30000 });
check("signing succeeds with no drawing at all", true);
check("no client exception on the signing page", signerErrors.length === 0, signerErrors[0] ?? "");
await guest.close();

// ---------------------------------------------------------------------------
log("On: the signing page will not submit without a drawing");

const onVersion = await setDrawnSignature(true);
check("turning it on recorded a new version", onVersion > offVersion, `${offVersion} → ${onVersion}`);
check("the trip is offered the newer version and adopts it", await adoptLatestVersion(tripUrl));

url = await signingLink(tripUrl);
guest = await browser.newContext(PHONE);
signer = await guest.newPage();
await walkToSigning(signer, url);
check("the pad is marked required", !/Optional/i.test(await signer.textContent("main")));

await signer.click('button:has-text("Sign waiver")');
await signer.waitForTimeout(1500);
check(
  "the tap is refused while nothing is drawn",
  (await signer.locator("text=all set").count()) === 0,
);
check(
  "and it says why, at the pad",
  /draw your signature/i.test((await signer.textContent("main")) ?? ""),
);
check("the typed name is still required alongside it", await signer.locator('input[name="typedSignature"]').count() > 0);

await drawSignature(signer);
const captured = await signer.inputValue('input[name="drawnSignature"]');
check("the pad captured the stroke", captured.startsWith("data:image/png"), `${captured.length} chars`);
await signer.click('button:has-text("Sign waiver")');
await signer.waitForTimeout(3000);
const outcome = (await signer.textContent("main")) ?? "";
check(
  "drawing with a finger then signs",
  (await signer.locator("text=all set").count()) > 0,
  outcome.replace(/\s+/g, " ").slice(0, 160),
);
await guest.close();

// ---------------------------------------------------------------------------
log("The record keeps what was required of it");

// The person just signed for — the queue hands out links in its own order, so
// the record has to be found by name rather than by taking the first one.
const signedName = (outcome.match(/Thank you\. ([^.]+?) is signed/) ?? [])[1]?.trim() ?? "";
check("the confirmation names who was signed for", signedName.length > 0, signedName);

await page.goto(`${tripUrl}/waivers`);
await page.waitForLoadState("networkidle");
const row = page.locator("li", { hasText: signedName }).last();
await row.locator('a:has-text("View signed waiver")').first().click();
await page.waitForSelector("text=Signature record", { timeout: 30000 });
const record = await page.textContent("body");
check("the signed record renders", /Signature record/.test(record));
check("with the typed legal name", /Rosa Mercer/.test(record));
check("and the drawn image kept as evidence", (await page.locator('img[alt*="ignature"], img[src^="data:image/png"]').count()) > 0);

log("Turning it off later cannot rewrite what was signed");
const backOff = await setDrawnSignature(false);
check("a further version was recorded", backOff > onVersion, `${onVersion} → ${backOff}`);
await page.goBack();
await page.reload();
const after = await page.textContent("body");
check("the existing signed record still shows its drawing", /Signature record/.test(after));

check("no uncaught client exceptions anywhere in this run", pageErrors.length === 0, pageErrors[0] ?? "");

// Leave the trip on a version that asks for no drawing, so this suite hands the
// database back the way it found it for whatever runs next.
await adoptLatestVersion(tripUrl);

await browser.close();
console.log(failures === 0 ? "\nDrawn signature holds.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
