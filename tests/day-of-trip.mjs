/**
 * Day-of-trip walkthrough at 390px.
 *
 * Plays the part of a youth pastor in a parking lot at 6:30am: everything here
 * is something they do while standing up, holding a clipboard, with one hand.
 * Each step is timed so slow paths show up as numbers rather than opinions.
 *
 *   node tests/day-of-trip.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const EMAIL = "leader@example.church";
const PASSWORD = "readysetamen2026";

let failures = 0;
const timings = [];

function check(label, condition, detail = "") {
  if (condition) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

async function step(label, fn) {
  const started = Date.now();
  const result = await fn();
  const ms = Date.now() - started;
  timings.push({ label, ms });
  console.log(`• ${label} (${ms}ms)`);
  return result;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
page.on("pageerror", (e) => {
  console.log("  ! page error:", e.message);
  failures += 1;
});

// ---------------------------------------------------------------------------

await step("Sign in", async () => {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/orgs\//, { timeout: 30000 });
});

const tripUrl = await step("Open the trip dashboard", async () => {
  await page.click("text=Summer Mission Trip");
  await page.waitForURL(/\/trips\//, { timeout: 30000 });
  await page.waitForSelector("text=Trip readiness");
  return page.url();
});

// --- 1. Quick Actions ------------------------------------------------------
await step("Quick Actions menu", async () => {
  const expected = [
    "Add Person",
    "Run Headcount",
    "Add Task",
    "Add Itinerary Item",
    "Add Vehicle",
    "Add Room",
  ];
  await page.click('button[aria-label="Quick actions"]');
  await page.waitForSelector('[role="dialog"][aria-label="Quick actions"]');
  const sheet = await page.textContent('[role="dialog"][aria-label="Quick actions"]');
  for (const label of expected) check(`quick action: ${label}`, sheet.includes(label));

  // Each destination must arrive with a form already open and focused.
  const destinations = [
    { label: "Add Task", expect: 'input[name="title"]' },
    { label: "Add Itinerary Item", expect: 'input[name="title"]' },
    { label: "Add Vehicle", expect: 'input[name="name"]' },
    { label: "Add Room", expect: 'input[name="name"]' },
    { label: "Add Person", expect: 'input[name="firstName"]' },
  ];
  for (const dest of destinations) {
    await page.goto(tripUrl);
    await page.waitForSelector("text=Trip readiness");
    // Wait for hydration: the sheet is client state, so a click landing before
    // React attaches would silently do nothing.
    await page.locator('button[aria-label="Quick actions"]').click();
    await page.waitForSelector('[role="dialog"][aria-label="Quick actions"]', { timeout: 20000 });
    await page.click(`[role="dialog"] a:has-text("${dest.label}")`);
    await page.waitForSelector(dest.expect, { timeout: 20000 });
    check(`${dest.label} opens a ready form`, true);
  }
});

// --- 2. Dashboard warnings are obvious and land on the cause ---------------
const warnings = await step("Read the dashboard warnings", async () => {
  await page.goto(tripUrl);
  await page.waitForSelector("text=Needs your attention");
  const rows = await page.$$eval('a[href*="filter="], a[href$="/transportation"], a[href$="/lodging"], a[href$="/leaders"]', (els) =>
    els
      .filter((el) => el.closest("li"))
      .map((el) => ({ href: el.getAttribute("href"), text: el.textContent?.trim() ?? "" })),
  );
  check("warnings are listed", rows.length > 0, `${rows.length} shown`);
  return rows;
});

await step("Tap a warning and land on the people causing it", async () => {
  const waiverWarning = warnings.find((r) => r.href?.includes("waivers?filter=unsigned"));
  check("unsigned-waiver warning present", Boolean(waiverWarning), waiverWarning?.text.slice(0, 40));

  const emergencyWarning = warnings.find((r) => r.href?.includes("missing-emergency"));
  check("missing-emergency warning present", Boolean(emergencyWarning));
  if (emergencyWarning) {
    await page.goto(`${BASE}${emergencyWarning.href}`);
    await page.waitForSelector("text=Showing");
    const body = await page.textContent("body");
    check(
      "filtered roster explains itself",
      /Showing \d+ of \d+ — no emergency contact on file/.test(body),
    );
  }

  const expectedLabels = {
    "no-vehicle": "not assigned to a vehicle",
    "no-room": "not assigned to a room",
    owing: "still owes money",
    "no-guardian": "minors without a parent or guardian",
  };
  for (const [filter, label] of Object.entries(expectedLabels)) {
    await page.goto(`${tripUrl}/people?filter=${filter}`);
    await page.waitForSelector("h1:text('People')");
    const heading = await page.textContent("main p.text-sm.font-semibold");
    check(`roster filter ${filter} explains itself`, (heading ?? "").includes(label), heading?.trim());
  }
});

// --- 3. Find the missing person, check their emergency contact -------------
const missingPerson = await step("Find someone missing an emergency contact", async () => {
  await page.goto(`${tripUrl}/people?filter=missing-emergency`);
  await page.waitForSelector("text=Showing");
  // Scope to the roster list — the header also links to /people/new.
  const row = page.locator('main ul li a[href*="/people/"]').first();
  const name = (await row.textContent())?.split("\n")[0];
  const href = await row.getAttribute("href");
  await row.click();
  await page.waitForURL(`**${href}`, { timeout: 30000 });
  await page.waitForSelector("main h1", { timeout: 30000 });
  const body = await page.textContent("main");
  check("attendee page flags the gap", body.includes("No emergency contact yet"));
  return name?.trim();
});

await step("Check emergency information for the whole group", async () => {
  await page.goto(`${tripUrl}/emergency`);
  await page.waitForSelector("h1:text('Emergency info')");
  await page.fill('input[type="search"]', "Mercer");
  await page.waitForTimeout(400);
  await page.locator("main ul li button").first().click();
  await page.waitForSelector("main dl, main p:has-text('Emergency contact')", { timeout: 30000 });
  const body = await page.textContent("main");
  check("emergency detail opens with contact and medical", /Emergency contact/i.test(body));
  const telLinks = await page.$$('a[href^="tel:"]');
  check("phone numbers are one tap to call", telLinks.length > 0, `${telLinks.length} tel: links`);
});

// --- 4. Whole-group headcount ----------------------------------------------
await step("Run a whole-group headcount", async () => {
  await page.goto(`${tripUrl}/headcount`);
  await page.fill('input[name="label"]', "Before Departure");
  await page.click('button:has-text("Start headcount")');
  await page.waitForURL(/\/headcount\/[a-z0-9]+/, { timeout: 30000 });
  await page.waitForSelector("text=0 / 50");
  check("counts all 50", true);

  const rows = await page.$$('button[aria-pressed="false"]');
  check("every person has a row", rows.length === 50, `${rows.length} rows`);

  const box = await rows[0].boundingBox();
  check("rows are big enough to tap while walking", (box?.height ?? 0) >= 60, `${Math.round(box?.height ?? 0)}px`);

  for (let i = 0; i < 49; i += 1) {
    await page.click('button[aria-pressed="false"] >> nth=0');
  }
  await page.waitForSelector("text=49 / 50", { timeout: 30000 });
  const body = await page.textContent("body");
  check("the one missing person is named", /Still missing/.test(body));
  const missingBanner = await page.textContent('[role="status"]');
  check("missing name shown in the banner", (missingBanner ?? "").trim().length > 0, missingBanner?.slice(0, 60));
});

// --- 5. Vehicle-specific headcount -----------------------------------------
await step("Run a vehicle-specific headcount", async () => {
  await page.goto(`${tripUrl}/transportation`);
  await page.waitForSelector("text=Auto assign");
  if ((await page.textContent("body")).includes("0 of 50 seated")) {
    await page.click('button:has-text("Auto assign vehicles")');
    await page.waitForSelector('[role="status"]', { timeout: 60000 });
  }

  await page.goto(`${tripUrl}/headcount`);
  await page.selectOption('select[name="scope"]', "VEHICLE");
  await page.waitForSelector('select[name="scopeId"]');
  await page.fill('input[name="label"]', "Van 1 — rest stop");
  await page.click('button:has-text("Start headcount")');
  await page.waitForURL(/\/headcount\/[a-z0-9]+/, { timeout: 30000 });
  const tally = (await page.textContent("main .font-display.text-4xl")) ?? "";
  const [, counted] = tally.match(/\d+\s*\/\s*(\d+)/) ?? [];
  check(
    "vehicle headcount counts only that van, not the whole trip",
    Number(counted) > 0 && Number(counted) < 50,
    `${tally.trim()} people`,
  );
});

// --- 6. Today's itinerary ---------------------------------------------------
await step("Check the schedule", async () => {
  await page.goto(`${tripUrl}/itinerary`);
  await page.waitForSelector("h1:text('Schedule')");
  const days = await page.$$("section h2");
  check("multiple days are shown", days.length >= 4, `${days.length} days`);
  const body = await page.textContent("body");
  check("first morning is there", body.includes("Meet at Church"));
  check("times are human-readable", /6:30 AM|7:45 AM/.test(body));
});

// --- 7. Room assignment ------------------------------------------------------
await step("Find a room assignment", async () => {
  await page.goto(`${tripUrl}/lodging`);
  await page.waitForSelector("text=Auto assign");
  if ((await page.textContent("body")).includes("0 of 50 assigned")) {
    await page.click('button:has-text("Auto assign rooms")');
    await page.waitForSelector('[role="status"]', { timeout: 60000 });
  }
  const body = await page.textContent("body");
  check("rooms show occupancy", /\d+ \/ 4/.test(body));
  check("14 rooms present", (body.match(/Room \d0\d/g) ?? []).length >= 14);
});

// --- 8. A signed waiver ------------------------------------------------------
await step("Open a signed waiver and read the audit record", async () => {
  await page.goto(`${tripUrl}/waivers?filter=signed`);
  await page.waitForSelector("text=Student Ministry Release");
  await page.click('a:has-text("View signed waiver")');
  await page.waitForSelector("text=Signature record");
  const body = await page.textContent("body");
  for (const label of [
    "Signed by",
    "Signing for",
    "Relationship",
    "Date and time signed",
    "Waiver version",
    "Document ID",
    "Electronic consent confirmed",
    "Audit information",
    "Document hash",
    "Document as signed",
  ]) {
    check(`audit shows "${label}"`, body.includes(label));
  }
  const printLink = await page.$('main a:has-text("Print / save as PDF")');
  check("printable", Boolean(printLink));
});

// --- 9. Driver / passenger roster -------------------------------------------
await step("Get the driver and passenger roster", async () => {
  const tripId = tripUrl.split("/trips/")[1];
  await page.goto(`${BASE}/print/trip/${tripId}/vehicles`);
  await page.waitForSelector("text=Vehicle Assignments");
  const body = await page.textContent("main, body");
  check("driver named on the roster", /driver Dana Reed|driver Marcus Whitfield/.test(body));
  check("passengers numbered", /1\. /.test(body));
});

// --- 10. Hostile waiver text stays text ------------------------------------
await step("Paste a hostile payload into a waiver and render it", async () => {
  // Waiver language is typed by an admin and then shown to every parent, and it
  // is snapshotted forever. It must never become markup.
  let alertFired = false;
  page.on("dialog", async (d) => {
    alertFired = true;
    await d.dismiss();
  });

  const orgSlug = tripUrl.split("/orgs/")[1].split("/")[0];
  await page.goto(`${BASE}/orgs/${orgSlug}/waivers/new`);
  await page.fill('input[name="name"]', `XSS probe ${Date.now()}`);
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Waiver builder", { timeout: 30000 });

  const payload = '<script>window.__pwned=1;alert("xss")</script><img src=x onerror="window.__pwned=1">';
  await page.locator('textarea[aria-label="Waiver / Release text"]').fill(payload);
  await page.click('button:has-text("Preview")');
  await page.waitForSelector("text=Waiver / Release", { timeout: 20000 });

  const pwned = await page.evaluate(() => "__pwned" in window);
  check("no injected script executed", pwned === false);
  check("no alert dialog appeared", alertFired === false);

  const scriptInBody = await page.evaluate(
    () => document.querySelectorAll("main script, main img[src='x']").length,
  );
  check("payload produced no script or img element", scriptInBody === 0);

  const shown = await page.textContent("main");
  check("the payload is displayed to the admin as plain text", shown.includes("<script>"));
});

// ---------------------------------------------------------------------------
console.log("\nStep timings (slowest first):");
for (const t of [...timings].sort((a, b) => b.ms - a.ms)) {
  console.log(`  ${String(t.ms).padStart(6)}ms  ${t.label}`);
}

await browser.close();
console.log(failures === 0 ? "\nDay-of-trip walkthrough passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
