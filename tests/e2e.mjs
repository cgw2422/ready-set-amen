/**
 * End-to-end walkthrough of the V1 definition of done, driven through a real
 * browser at iPhone width (390px) because mobile usability is a product
 * requirement, not a nice-to-have.
 *
 *   1. npm run db:push && npm run seed
 *   2. APP_URL=http://localhost:3100 npm run dev -- -p 3100
 *   3. node tests/e2e.mjs
 *
 * Set CHROMIUM_PATH if Playwright's bundled Chromium lives somewhere unusual.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const EMAIL = "leader@example.church";
const PASSWORD = "readysetamen2026";

const log = (...args) => console.log("•", ...args);
let failures = 0;
function check(label, condition) {
  if (condition) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}`); failures += 1; }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// iPhone-sized viewport: this app is mobile-first and must work at 390px.
const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ignoreHTTPSErrors: true,
};
const context = await browser.newContext(PHONE);
const page = await context.newPage();
page.on("pageerror", (e) => { console.log("  ! page error:", e.message); failures += 1; });

log("Sign in");
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/orgs\//, { timeout: 30000 });
check("landed inside an organization", page.url().includes("/orgs/"));

log("Open the trip dashboard");
await page.click("text=Summer Mission Trip");
await page.waitForURL(/\/trips\//, { timeout: 30000 });
const tripUrl = page.url();
await page.waitForSelector("text=Trip readiness");
const body = await page.textContent("body");
check("dashboard shows readiness", /Trip readiness/.test(body));
check("dashboard surfaces waiver problems", /waivers still need a signature|waiver still needs a signature/.test(body));
check("prayer card present and not scored", /Prayer/.test(body) && /never scored/.test(body));

log("Roster");
await page.goto(`${tripUrl}/people`);
await page.waitForSelector("h1:text('People')");
const peopleText = await page.textContent("main");
const rosterSize = Number(peopleText.match(/(\d+) on this trip/)?.[1] ?? 0);
check("the roster loads with the whole group", rosterSize >= 50, `${rosterSize} people`);

log("Waivers: generate a signing link");
await page.goto(`${tripUrl}/waivers`);
await page.waitForSelector("text=Student Ministry Release 2026");
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
// Read the counts off the page first so the assertions hold on a re-run,
// where some waivers are already signed from a previous pass.
const mainText = () => page.textContent("main");
const outstandingBefore = Number((await mainText()).match(/Outstanding\s*(\d+)/)?.[1] ?? "0");
const signedBefore = Number((await mainText()).match(/(\d+)\s*\/\s*\d+\s*signed/)?.[1] ?? "0");
// The primary delivery flow is a queue that hands over one personal link at a
// time — bulk export is deliberately secondary and behind a warning.
await page.click('button:has-text("Work through")');
await page.waitForSelector("button:has-text('Copy link for')", { timeout: 30000 });
const queueHeading = await page.textContent("main");
check(
  "the queue shows the leader where they are",
  /1 of \d+/.test(queueHeading),
  queueHeading.match(/1 of \d+/)?.[0],
);

await page.click("button:has-text('Copy link for')");
await page.waitForSelector('input[aria-label^="Signing link"]', { timeout: 30000 });
const signUrl = (await page.inputValue('input[aria-label^="Signing link"]')).trim();
check("one personal signing link was issued", /\/sign\/[A-Za-z0-9_-]{43}$/.test(signUrl));
check(
  "the queue explains the link is personal",
  (await page.textContent("main")).includes("personal to them"),
);

log("Sign the waiver as a parent, with no account");
// A brand-new context: no cookies, no storage, nothing carried over from the
// leader's session. This is a parent opening a text message on their phone.
const guest = await browser.newContext(PHONE);
check("the signer's browser starts with no cookies at all", (await guest.cookies()).length === 0);
const signer = await guest.newPage();
signer.on("pageerror", (e) => { console.log("  ! signer page error:", e.message); failures += 1; });
await signer.goto(signUrl);
await signer.waitForSelector("text=Signing for");
const signPage = await signer.textContent("body");
check("page states who is being signed for", /Signing for/.test(signPage));
check("guardian mode is explained", /parent or legal guardian/.test(signPage));
check("signer was never redirected to a login screen", !signer.url().includes("/login"));
check("no sign-in prompt anywhere on the page", !/Sign in|Create an account/i.test(signPage));
check(
  "still no session cookie — the signer has no account",
  (await guest.cookies()).every((c) => c.name !== "rsa_session"),
);

await signer.fill('input[name="field_emergencyContactName"]', "Rosa Mercer");
await signer.fill('input[name="field_emergencyContactPhone"]', "615-555-0199");
await signer.fill('textarea[name="field_allergies"]', "Peanuts");
await signer.click('button:has-text("Continue to the waiver")');
await signer.waitForSelector("text=Assumption of Risk");
await signer.click('button:has-text("Continue to sign")');

await signer.fill('input[name="signerName"]', "Rosa Mercer");
await signer.fill('input[name="signerRelationship"]', "Mother");
await signer.fill('input[name="signerEmail"]', "mercer.family0@example.com");
await signer.fill('input[name="typedSignature"]', "Rosa Mercer");
await signer.check('input[name="ack_readAndUnderstood"]');
await signer.check('input[name="ack_guardianAuthority"]');
await signer.check('input[name="consent"]');
await signer.click('button:has-text("Sign waiver")');
await signer.waitForSelector("text=all set", { timeout: 30000 });
const done = await signer.textContent("body");
check("confirmation shown", /You.{0,3}re all set/.test(done));

log("The link cannot be reused");
await signer.goto(signUrl);
await signer.waitForSelector("text=no longer available");
check("used link is dead", (await signer.textContent("body")).includes("no longer available"));

log("An invented token reveals nothing");
await signer.goto(`${BASE}/sign/${"a".repeat(43)}`);
const bogus = await signer.textContent("body");
check("unknown token gives the same generic page", bogus.includes("no longer available"));
check("no participant name is leaked", !/Mercer|Ellis|Nguyen/.test(bogus));

log("Signature is recorded and visible to the leader");
await page.goto(`${tripUrl}/waivers`);
await page.waitForSelector("text=Student Ministry Release 2026");
const waiverBody = await page.textContent("main");
const signedAfter = Number(waiverBody.match(/(\d+)\s*\/\s*\d+\s*signed/)?.[1] ?? "-1");
check(
  `the new signature is counted (${signedBefore} -> ${signedAfter})`,
  signedAfter === signedBefore + 1,
);
await page.click('a:has-text("View signed waiver")');
await page.waitForSelector("text=Signature record");
const record = await page.textContent("body");
check(
  "audit trail stored",
  /Electronic consent confirmed/.test(record) &&
    /Audit information/.test(record) &&
    /Document hash/.test(record),
);
check("document snapshot rendered", /Assumption of Risk/.test(record));
check("collected answers stored", /Peanuts/.test(record));

log("Auto assign vehicles and rooms");
await page.goto(`${tripUrl}/transportation`);
await page.waitForSelector("text=Auto assign");
await page.click('button:has-text("Auto assign vehicles")');
await page.waitForSelector("text=Seats assigned", { timeout: 30000 });
const transport = await page.textContent("body");
check("everyone got a seat", /(\d+) of \1 seated/.test(transport), transport.match(/\d+ of \d+ seated/)?.[0]);

await page.goto(`${tripUrl}/lodging`);
await page.waitForSelector("text=Auto assign");
await page.click('button:has-text("Auto assign rooms")');
await page.waitForSelector("[role='status']", { timeout: 60000 });
const lodging = await page.textContent("body");
check("rooms filled", /\d+ of \d+ assigned/.test(lodging), lodging.match(/\d+ of \d+ assigned/)?.[0]);

log("Headcount");
await page.goto(`${tripUrl}/headcount`);
await page.fill('input[name="label"]', "Before Departure");
await page.click('button:has-text("Start headcount")');
await page.waitForURL(/\/headcount\/[a-z0-9]+/, { timeout: 30000 });
await page.waitForSelector("text=Before Departure");
check("headcount starts at zero", (await page.textContent("main")).includes("0 / "));
await page.click('button[aria-pressed="false"] >> nth=0');
await page.waitForFunction(() => (document.querySelector("main .font-display.text-4xl")?.textContent ?? "").trim().startsWith("1 /"), null, { timeout: 15000 });
check("tapping marks someone present", true);

log("Emergency info");
await page.goto(`${tripUrl}/emergency`);
await page.waitForSelector("h1:text('Emergency info')");
check("emergency screen loads", (await page.textContent("body")).includes("Emergency info"));

log("Print packet");
await page.goto(`${BASE}/print/trip/${tripUrl.split("/trips/")[1]}/packet?sections=overview,roster,emergency,vehicles,rooms,itinerary,phones`);
await page.waitForSelector("text=Trip Packet");
const packet = await page.textContent("body");
check("packet includes the roster", /Attendee Roster/.test(packet));
check("packet includes vehicle assignments", /Vehicle Assignments/.test(packet));

log("Prayer step");
await page.goto(`${tripUrl}/prayer`);
// Completing prayer is a one-way action, so a re-run of this suite finds it
// already done. Undo first and walk the real path rather than skipping it.
if (await page.$('button:has-text("Undo")')) {
  await page.click('button:has-text("Undo")');
  await page.waitForSelector('button:has-text("We prayed over the group")', { timeout: 30000 });
}
await page.waitForSelector("text=Pray over the group");
await page.click('button:has-text("We prayed over the group")');
await page.waitForSelector("text=ready to go", { timeout: 30000 });
const prayed = await page.textContent("body");
check("branded completion state", /Ready\.\s*Set\.\s*Amen\./i.test(prayed.replace(/\s+/g, " ")));

log("No horizontal scrolling at 390px");
for (const path of ["", "/people", "/waivers", "/transportation", "/lodging", "/itinerary", "/tasks", "/payments", "/forms", "/leaders", "/emergency", "/packet", "/settings", "/headcount"]) {
  await page.goto(`${tripUrl}${path}`);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no overflow on ${path || "/dashboard"} (${overflow}px)`, overflow <= 1);
}

log("Cross-organization access is refused");
const outsider = await browser.newContext({ ignoreHTTPSErrors: true });
const outsiderPage = await outsider.newPage();
const res = await outsiderPage.goto(tripUrl);
check("signed-out user is redirected to login", outsiderPage.url().includes("/login") || res.status() >= 400);

log("Production hardening");
{
  const health = await (await context.request.get(`${BASE}/api/health`)).json();
  check("health endpoint reports the database", health.status === "ok" && health.database === "connected");

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "rsa_session");
  check("session cookie exists", Boolean(session));
  if (session) {
    check("session cookie is httpOnly", session.httpOnly === true);
    check("session cookie is sameSite=Lax", session.sameSite === "Lax");
    if (BASE.startsWith("https://")) check("session cookie is Secure over TLS", session.secure === true);
    check("session cookie value is opaque, not a JWT", !session.value.includes("."));
  }

  const headers = (await context.request.get(`${BASE}/login`)).headers();
  check("nosniff header present", headers["x-content-type-options"] === "nosniff");
  check("clickjacking blocked", headers["x-frame-options"] === "DENY");

  const signHeaders = (await context.request.get(`${BASE}/sign/${"b".repeat(43)}`)).headers();
  check("signing pages are not cached", (signHeaders["cache-control"] ?? "").includes("no-store"));
  check("signing pages are not indexed", (signHeaders["x-robots-tag"] ?? "").includes("noindex"));
}

await browser.close();
console.log(failures === 0 ? "\nAll end-to-end checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
