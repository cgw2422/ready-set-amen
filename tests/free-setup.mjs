/**
 * The free-to-paid boundary, through the browser, as a real new church.
 *
 * Signs up, builds a trip in free setup, and then walks into every paid action
 * to prove three things at once: the gate is enforced on the server rather than
 * by hiding buttons, the unlock screen explains what was blocked, and declining
 * to pay costs the church nothing it had already entered.
 *
 *   node tests/free-setup.mjs
 */
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

// ---------------------------------------------------------------------------
log("The free-setup indicator is present but not shouting");

const orgBody = await page.textContent("main");
check("the organization shows a free setup indicator", /Free setup/i.test(orgBody));
check("with the price on it", /\$14\.99/.test(orgBody));

// ---------------------------------------------------------------------------
log("A church builds a real trip for free");

await page.goto(`${BASE}/orgs/${slug}/trips/new`);
await page.fill('input[name="name"]', "Fall Retreat");
await page.click('button[type="submit"]');
// Not just /trips/<something> — this page *is* /trips/new.
await page.waitForURL((url) => /\/trips\/[a-z0-9]{8,}$/.test(url.pathname), { timeout: 30000 });
const tripUrl = page.url().replace(/\/$/, "");
const tripId = tripUrl.split("/trips/")[1].split("/")[0];
check("the trip was created without paying", Boolean(tripId), tripId);

// Ten people is the free allowance; the eleventh is where the ask happens.
async function addPerson(first) {
  await page.goto(`${tripUrl}/people/new`);
  await page.fill('input[name="firstName"]', first);
  await page.fill('input[name="lastName"]', "Free");
  // The form requires these; leaving them blank stops the submit at the field.
  await page.fill('input[name="emergencyContactName"]', "Dana Free");
  await page.fill('input[name="emergencyContactPhone"]', "615-555-0143");
  await page.locator('button[type="submit"]').first().click();
}

for (let i = 1; i <= 10; i += 1) {
  await addPerson(`Student${i}`);
  // /people/new also matches /people/, so wait for the saved person's own page.
  await page.waitForURL((url) => /\/people\/[a-z0-9]{8,}$/.test(url.pathname), { timeout: 30000 });
}
await page.goto(`${tripUrl}/people`);
const peopleBody = await page.textContent("main");
check(
  "ten people were added in free setup",
  /10 on this trip/.test(peopleBody),
  peopleBody.slice(0, 60).replace(/\s+/g, " "),
);

// ---------------------------------------------------------------------------
log("The eleventh person asks for payment, and loses nothing");

await addPerson("Student11");
await page.waitForURL(/\/unlock/, { timeout: 30000 });
check("adding attendee 11 lands on the unlock page", page.url().includes("/unlock"));
const unlockBody = await page.textContent("main");
check("the unlock page names what was blocked", /Add your whole group/i.test(unlockBody));
check("and shows the one-time price", /\$14\.99/.test(unlockBody) && /Lifetime access/i.test(unlockBody));
check("and promises nothing is lost", /nothing is deleted or locked/i.test(unlockBody));
check("with a way back to setup", Boolean(await page.$('a:has-text("Keep Setting Up")')));

await page.click('a:has-text("Keep Setting Up")');
await page.waitForURL(/\/orgs\//, { timeout: 30000 });
await page.goto(`${tripUrl}/people`);
const afterDecline = await page.textContent("main");
check("declining kept every person already added", /10 on this trip/.test(afterDecline));
check("and the eleventh was not half-created", !/Student11/.test(afterDecline));

// ---------------------------------------------------------------------------
log("Every other paid action is gated server-side, not by hiding buttons");

for (const [label, path] of [
  ["the trip packet", `${tripUrl}/packet`],
  ["the printed packet", `${BASE}/print/trip/${tripId}/packet`],
  ["a printed roster", `${BASE}/print/trip/${tripId}/roster`],
]) {
  await page.goto(path);
  await page.waitForURL(/\/unlock/, { timeout: 30000 });
  check(`${label} redirects to unlock even when the URL is typed directly`, page.url().includes("/unlock"));
}

// Headcount and waivers are gated on the action, so the setup pages stay open.
await page.goto(`${tripUrl}/headcount`);
await page.fill('input[name="label"]', "Practice");
await page.click('button[type="submit"]');
await page.waitForURL(/\/unlock/, { timeout: 30000 });
check("starting a headcount asks for payment", /feature=headcount/.test(page.url()));

// ---------------------------------------------------------------------------
log("Setup itself is never gated");

for (const [label, path] of [
  ["the dashboard", tripUrl],
  ["people", `${tripUrl}/people`],
  ["transportation", `${tripUrl}/transportation`],
  ["lodging", `${tripUrl}/lodging`],
  ["the schedule", `${tripUrl}/itinerary`],
  ["tasks", `${tripUrl}/tasks`],
  ["prayer", `${tripUrl}/prayer`],
  ["payments", `${tripUrl}/payments`],
  ["settings", `${BASE}/orgs/${slug}/settings`],
]) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  check(`${label} is open in free setup`, !page.url().includes("/unlock"), page.url().split("/orgs/")[1]);
}

// ---------------------------------------------------------------------------
log("Billing says what the church has");

await page.goto(`${BASE}/orgs/${slug}/settings`);
const settingsBody = await page.textContent("main");
check("settings shows the free setup state", /Ready Set Amen Free Setup/.test(settingsBody));
check("with an unlock action", /Unlock lifetime access/i.test(settingsBody));

// ---------------------------------------------------------------------------
log("A paid church is never shown a purchase screen");

// A different account: this church already owns lifetime access. The free
// pastor above is not a member of it and would only get a 404, which would
// pass this check for the wrong reason.
const paidCtx = await browser.newContext(PHONE);
const paid = await paidCtx.newPage();
await paid.goto(`${BASE}/login`);
await paid.fill('input[name="email"]', "leader@example.church");
await paid.fill('input[name="password"]', "readysetamen2026");
await paid.click('button[type="submit"]');
await paid.waitForURL(/\/orgs/, { timeout: 30000 });

await paid.goto(`${BASE}/orgs/grace-community-demo/unlock`);
await paid.waitForLoadState("networkidle");
check(
  "an organization that already has access is sent back to its trips",
  !paid.url().includes("/unlock"),
  paid.url().split("/orgs/")[1] ?? paid.url(),
);

await paid.goto(`${BASE}/orgs/grace-community-demo/settings`);
const paidSettings = await paid.textContent("main");
check("and its billing section reports lifetime access", /Lifetime Access/i.test(paidSettings));
check("with no unlock button", !/Unlock lifetime access/i.test(paidSettings));

await browser.close();
console.log(failures === 0 ? "\nFree setup boundary holds." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
