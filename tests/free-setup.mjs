/**
 * The whole free-to-paid boundary, through a real browser at 390px, as a real
 * new church — then again after granting lifetime access.
 *
 * The point is not that a button is hidden. Every gate is also attacked by
 * typing the URL directly and by posting the server action, because a paywall
 * that only exists in the UI is not a paywall.
 *
 *   node tests/free-setup.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

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
const ctx = await browser.newContext(PHONE);
const page = await ctx.newPage();
page.on("pageerror", (e) => {
  console.log("  ! page error:", e.message);
  failures += 1;
});
const stamp = Date.now();
const scratch = mkdtempSync(join(tmpdir(), "rsa-import-"));

/** Did navigating here land on the unlock screen for the expected gate? */
async function hitsPaywall(path, gate) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  const url = page.url();
  return url.includes("/unlock") && (!gate || url.includes(`gate=${gate}`));
}

// ---------------------------------------------------------------------------
log("Signup states the price before any work is done");

await page.goto(`${BASE}/signup`);
const signupCopy = await page.textContent("main");
check("the launch price is on the signup page", /\$14\.99/.test(signupCopy));
check("and it says no card is required", /No card required/i.test(signupCopy));
check(
  "the price is not buried in fine print",
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("p, span, strong")].find((n) =>
      n.textContent?.includes("$14.99"),
    );
    return el ? parseFloat(getComputedStyle(el).fontSize) >= 13 : false;
  }),
);

await page.fill('input[name="firstName"]', "Free");
await page.fill('input[name="lastName"]', "Setup");
await page.fill('input[name="email"]', `free${stamp}@setup.test`);
await page.fill('input[name="password"]', "a free setup password");
await page.click('button[type="submit"]');
await page.waitForURL(/\/onboarding/, { timeout: 30000 });

await page.fill('input[name="name"]', `Free Setup Church ${stamp}`);
await page.click('button[type="submit"]');
await page.waitForURL(/\/orgs\//, { timeout: 30000 });
const slug = page.url().split("/orgs/")[1].split("/")[0];

const badge = page.locator('a[href*="/unlock"]');
check("the organization shows a free setup indicator", (await badge.count()) > 0);
check("with the price on it", /\$14\.99/.test(await badge.first().innerText()));

// ---------------------------------------------------------------------------
log("Trip one is free; trip two is the boundary");

await page.goto(`${BASE}/orgs/${slug}/trips/new`);
await page.fill('input[name="name"]', "Fall Retreat");
await page.click('button[type="submit"]');
await page.waitForURL((url) => /\/trips\/[a-z0-9]{8,}$/.test(url.pathname), { timeout: 30000 });
const tripUrl = page.url().replace(/\/$/, "");
const tripId = tripUrl.split("/trips/")[1].split("/")[0];
check("the first trip was created without paying", Boolean(tripId), tripId);

check(
  "the new-trip page now sends them to unlock",
  await hitsPaywall(`/orgs/${slug}/trips/new`, "second-trip"),
);

// The form is gone, so post the action the way the browser would.
// However the request is shaped, no second trip may exist afterwards. The
// status code is not the assertion — a hand-made POST cannot carry Next's
// action envelope anyway — the roster is.
await page.evaluate(async (s) => {
  const body = new FormData();
  body.set("name", "Sneaky Second Trip");
  await fetch(`/orgs/${s}/trips/new`, { method: "POST", body }).catch(() => null);
}, slug);
await page.goto(`${BASE}/orgs/${slug}`);
const trips = await page.textContent("main");
check("a hand-made POST creates no second trip", !trips.includes("Sneaky Second Trip"));
check("and the church still has exactly one trip", (trips.match(/Fall Retreat/g) ?? []).length >= 1);

// ---------------------------------------------------------------------------
log("The manual add-person form");

async function addPerson(first, { emergency = true } = {}) {
  await page.goto(`${tripUrl}/people/new`);
  await page.fill('input[name="firstName"]', first);
  await page.fill('input[name="lastName"]', "Free");
  if (emergency) {
    await page.fill('input[name="emergencyContactName"]', "Dana Free");
    await page.fill('input[name="emergencyContactPhone"]', "615-555-0143");
  }
  await page.locator('form button[type="submit"]').first().click();
}

await addPerson("Ruby");
await page.waitForSelector("text=Person added", { timeout: 30000 });
const added = await page.textContent("main");
check("a successful save confirms who was added", /Ruby Free was added successfully/.test(added));
check("with a way to add another", Boolean(await page.$('a:has-text("Add another person")')));
check("and a way to finish", Boolean(await page.$('a:has-text("Done")')));

await page.click('a:has-text("Add another person")');
await page.waitForSelector('input[name="firstName"]', { timeout: 30000 });
const cleared = await page.evaluate(() =>
  [...document.querySelectorAll("form input[type=text], form input[type=tel], form textarea")]
    .map((el) => el.value)
    .filter((value) => value !== ""),
);
check("Add another person gives a completely blank form", cleared.length === 0, cleared.join("|"));

// A save that fails must not throw away everything they typed.
await page.fill('input[name="firstName"]', "Micah");
await page.fill('input[name="lastName"]', "Cole");
await page.fill('input[name="emergencyContactName"]', "Rosa Cole");
await page.fill('input[name="emergencyContactPhone"]', "615-555-0155");
await page.fill('textarea[name="allergies"]', "Bee stings");
await page.fill('input[name="email"]', "definitely-not-an-email");
await page.locator('form button[type="submit"]').first().click();
await page.waitForTimeout(2500);
const preserved = await page.evaluate(() => ({
  first: document.querySelector('input[name="firstName"]')?.value,
  allergies: document.querySelector('textarea[name="allergies"]')?.value,
  emergency: document.querySelector('input[name="emergencyContactName"]')?.value,
}));
check(
  "a failed save keeps every field the leader typed",
  preserved.first === "Micah" && preserved.allergies === "Bee stings" && preserved.emergency === "Rosa Cole",
  JSON.stringify(preserved),
);

// ---------------------------------------------------------------------------
log("Import templates are free to everyone");

for (const [label, path, signature] of [
  ["CSV template", "/api/import-template/csv", "First Name,Last Name"],
  ["Excel template", "/api/import-template/xlsx", "PK"],
]) {
  const result = await page.evaluate(async (p) => {
    const response = await fetch(p);
    const text = await response.text();
    return { status: response.status, head: text.slice(0, 40) };
  }, path);
  check(`${label} downloads in free setup`, result.status === 200, `${result.status}`);
  check(`${label} has the expected content`, result.head.includes(signature), result.head.slice(0, 24));
}

await page.goto(`${tripUrl}/people/import`);
await page.waitForSelector("text=Import people", { timeout: 30000 });
const importBody = await page.textContent("main");
check("the import screen explains what is required", /First Name/.test(importBody) && /Last Name/.test(importBody));
check("with both template downloads", /Download CSV/.test(importBody) && /Download Excel/.test(importBody));
check(
  "the Google Sheets button appears only when configured",
  process.env.GOOGLE_SHEETS_TEMPLATE_URL
    ? /Open Google Sheets Template/.test(importBody)
    : !/Open Google Sheets Template/.test(importBody),
);

// ---------------------------------------------------------------------------
log("Importing a spreadsheet in free setup");

function csv(rows) {
  const path = join(scratch, `import-${Math.random().toString(36).slice(2)}.csv`);
  writeFileSync(path, rows.join("\n"), "utf8");
  return path;
}

async function importFile(path) {
  await page.goto(`${tripUrl}/people/import`);
  await page.setInputFiles('input[type="file"]', path);
  await page.locator('button:has-text("Continue"), button:has-text("Re-read")').first().click();
  await page.waitForSelector("text=Preview", { timeout: 30000 });
}

// Two already added manually, so eight spots remain.
// One person was added manually above, so nine spots remain; import nine.
const nine = csv([
  "First Name,Last Name,DOB,Adult / Minor,Parent Email,Allergies",
  ...Array.from({ length: 9 }, (_, i) => `Kid${i},Import,2012-0${(i % 9) + 1}-05,Minor,p${i}@example.com,`),
]);
await importFile(nine);
const previewBody = await page.textContent("main");
check(
  "the preview says how many spots are left",
  /you can add \d+ more/i.test(previewBody),
  previewBody.match(/you can add \d+ more/i)?.[0] ?? "not stated",
);
check("and shows a row status", /Ready|Warning/.test(previewBody));

await page.locator('button:has-text("Import ")').last().click();
await page.waitForSelector("text=People added", { timeout: 60000 });
const result = await page.textContent("main");
check(
  "the people were imported",
  /\d+ people were added successfully/.test(result),
  result.match(/\d+ people were added successfully/)?.[0] ?? "",
);

await page.goto(`${tripUrl}/people`);
const roster = await page.textContent("main");
check("the roster now shows ten", /10 on this trip/.test(roster));
check("and says free setup is full", /reached it/i.test(roster));

// ---------------------------------------------------------------------------
log("The eleventh person, whatever the entry method");

await addPerson("Eleventh");
await page.waitForURL(/\/unlock/, { timeout: 30000 });
check("adding one more manually hits the paywall", page.url().includes("gate=attendee-limit"));
const unlockBody = await page.textContent("main");
check("the unlock screen names the price", /\$14\.99/.test(unlockBody) && /Lifetime access/i.test(unlockBody));
check("and promises nothing is lost", /nothing is deleted or locked/i.test(unlockBody));
check("with a way back to setup", Boolean(await page.$('a:has-text("Keep Setting Up")')));

await page.click('a:has-text("Keep Setting Up")');
await page.waitForURL(/\/orgs\//, { timeout: 30000 });
await page.goto(`${tripUrl}/people`);
check(
  "declining kept all ten and created no eleventh",
  /10 on this trip/.test(await page.textContent("main")),
);

// Importing more is the same limit, not a way around it.
const overflow = csv(["First Name,Last Name", "Extra,Person", "Another,Person"]);
await importFile(overflow);
const blockedPreview = await page.textContent("main");
check("a full church can still preview an import", /Preview/.test(blockedPreview));
check(
  "but is told importing needs an unlock",
  /you can add 0 more/i.test(blockedPreview) || /unlock/i.test(blockedPreview),
);
const importDisabled = await page.locator('button:has-text("Import ")').last().isDisabled();
check("and the import button is not usable", importDisabled);

// ---------------------------------------------------------------------------
log("Every other gate, by URL and by action");

check("the trip packet", await hitsPaywall(`${tripUrl.replace(BASE, "")}/packet`, "trip-packet"));
check("the printed packet", await hitsPaywall(`/print/trip/${tripId}/packet`, "trip-packet"));
check("a printed roster", await hitsPaywall(`/print/trip/${tripId}/roster`, "trip-packet"));
check("the emergency sheet export", await hitsPaywall(`/print/trip/${tripId}/emergency`, "trip-packet"));
check("the missing-forms report", await hitsPaywall(`/print/trip/${tripId}/missing-forms`, "trip-packet"));
check(
  "the outstanding-payments report",
  await hitsPaywall(`/print/trip/${tripId}/outstanding-payments`, "trip-packet"),
);

await page.goto(`${tripUrl}/headcount`);
await page.waitForLoadState("networkidle");
check("the headcount screen itself stays open", !page.url().includes("/unlock"));
await page.fill('input[name="label"]', "Practice");
await page.locator('form button[type="submit"]').first().click();
await page.waitForURL(/\/unlock/, { timeout: 30000 });
check("but starting one asks for payment", page.url().includes("gate=headcount"));

// ---------------------------------------------------------------------------
log("What must never be gated");

for (const [label, path] of [
  ["the dashboard", tripUrl],
  ["people", `${tripUrl}/people`],
  ["import", `${tripUrl}/people/import`],
  ["emergency info", `${tripUrl}/emergency`],
  ["transportation", `${tripUrl}/transportation`],
  ["lodging", `${tripUrl}/lodging`],
  ["the schedule", `${tripUrl}/itinerary`],
  ["tasks", `${tripUrl}/tasks`],
  ["prayer", `${tripUrl}/prayer`],
  ["payments", `${tripUrl}/payments`],
  ["forms", `${tripUrl}/forms`],
  ["leader assignments", `${tripUrl}/leaders`],
  ["trip settings", `${tripUrl}/settings`],
  ["the waiver library", `${BASE}/orgs/${slug}/waivers`],
  ["organization settings", `${BASE}/orgs/${slug}/settings`],
]) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  check(`${label} is open in free setup`, !page.url().includes("/unlock"));
}

// ---------------------------------------------------------------------------
log("Waivers can be built and previewed, but not sent");

await page.goto(`${BASE}/orgs/${slug}/waivers`);
await page.waitForSelector("text=Before your first waiver", { timeout: 30000 });
await page.click('button:has-text("I understand")');
await page.waitForSelector('a:has-text("New waiver")', { timeout: 30000 });
await page.click('a:has-text("New waiver")');
await page.waitForSelector('input[name="name"]', { timeout: 30000 });
await page.fill('input[name="name"]', "Free Setup Release");
await page.locator('form button[type="submit"]').first().click();
await page.waitForURL((url) => /\/waivers\/[a-z0-9]{8,}$/.test(url.pathname), {
  timeout: 30000,
});
check("a free church can create a waiver template", !page.url().includes("/unlock"));
const builder = await page.textContent("main");
check("and preview it", /Preview/i.test(builder));

// ---------------------------------------------------------------------------
log("Then grant lifetime access and repeat every blocked action");

execSync(`npm run grant -- ${slug} "free setup e2e"`, { stdio: "pipe" });

await page.goto(`${BASE}/orgs/${slug}/settings`);
const paidSettings = await page.textContent("main");
check("billing now reports lifetime access", /Lifetime Access/i.test(paidSettings));
check("with no unlock button", !/Unlock lifetime access/i.test(paidSettings));

await page.goto(`${BASE}/orgs/${slug}`);
// The badge itself, not the page text: this church is named "Free Setup
// Church", which any text match would hit forever.
check(
  "the free setup indicator is gone",
  (await page.locator('a[href*="/unlock"]').count()) === 0,
);

for (const [label, path] of [
  ["a second trip", `/orgs/${slug}/trips/new`],
  ["the trip packet", `${tripUrl.replace(BASE, "")}/packet`],
  ["the printed packet", `/print/trip/${tripId}/packet`],
  ["a printed roster", `/print/trip/${tripId}/roster`],
]) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  check(`${label} works immediately`, !page.url().includes("/unlock"), page.url().split("/orgs/")[1] ?? "");
}

await addPerson("Eleventh");
await page.waitForSelector("text=Person added", { timeout: 30000 });
check("the eleventh person is added without another word about money", true);

await page.goto(`${tripUrl}/headcount`);
await page.fill('input[name="label"]', "Departure");
await page.locator('form button[type="submit"]').first().click();
await page.waitForTimeout(3000);
check("a headcount starts", !page.url().includes("/unlock"), page.url().split("/trips/")[1] ?? "");

await page.goto(`${BASE}/orgs/${slug}/settings`);
await page.fill('input[name="email"]', `leader${stamp}@setup.test`);
await page.click('button:has-text("Send invitation")');
await page.waitForSelector('input[aria-label="Invitation link"]', { timeout: 30000 });
check("a leader can be invited", true);

const bigImport = csv([
  "First Name,Last Name",
  ...Array.from({ length: 30 }, (_, i) => `Paid${i},Import`),
]);
await importFile(bigImport);
check(
  "an import of thirty is no longer capped",
  !/you can add \d+ more/i.test(await page.textContent("main")),
);
await page.locator('button:has-text("Import ")').last().click();
await page.waitForSelector("text=People added", { timeout: 60000 });
check("and they all import", /30 people were added successfully/.test(await page.textContent("main")));

await browser.close();
console.log(failures === 0 ? "\nFree setup boundary holds." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
