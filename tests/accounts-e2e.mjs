/**
 * Password reset, invitations, roles and the waiver gate — through the browser.
 *
 * Run against a DEVELOPMENT server: the reset flow uses the development link
 * that is shown only when no mail provider is configured and NODE_ENV is not
 * production. tests/e2e.mjs separately asserts that link is absent in
 * production.
 *
 *   node tests/accounts-e2e.mjs
 */
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const OWNER = { email: "leader@example.church", password: "readysetamen2026" };

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
const stamp = Date.now();

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

// ---------------------------------------------------------------------------
log("A new church signs up and is asked to acknowledge waiver responsibility");

const churchCtx = await browser.newContext(PHONE);
const church = await churchCtx.newPage();
const pastorEmail = `pastor${stamp}@accounts.test`;

await church.goto(`${BASE}/signup`);
await church.fill('input[name="firstName"]', "Pat");
await church.fill('input[name="lastName"]', "Ryan");
await church.fill('input[name="email"]', pastorEmail);
await church.fill('input[name="password"]', "first password 123");
await church.click('button[type="submit"]');
await church.waitForURL(/\/onboarding/, { timeout: 30000 });

await church.fill('input[name="name"]', `Hillside Chapel ${stamp}`);
await church.click('button[type="submit"]');
await church.waitForURL(/\/orgs\//, { timeout: 30000 });
const orgUrl = church.url();
const orgSlug = orgUrl.split("/orgs/")[1].split("/")[0];
check("a new organization was created", Boolean(orgSlug), orgSlug);

await church.goto(`${BASE}/orgs/${orgSlug}/waivers`);
await church.waitForSelector("text=Before your first waiver", { timeout: 30000 });
const gateText = await church.textContent("main");
check(
  "the exact waiver responsibility wording is shown",
  gateText.includes(
    "Ready Set Amen provides tools to create and collect electronic waivers. Your church is responsible for the waiver language you use and should have it reviewed by appropriate legal counsel.",
  ),
);
check("no way to create a waiver before acknowledging", !(await church.$('a:has-text("New waiver")')));

// The gate is enforced server-side, not just by hiding the button.
await church.goto(`${BASE}/orgs/${orgSlug}/waivers/new`);
await church.waitForURL(`**/orgs/${orgSlug}/waivers`, { timeout: 30000 });
check("visiting the new-waiver URL directly is redirected back to the gate", true);

await church.click('button:has-text("I understand")');
await church.waitForSelector('a:has-text("New waiver")', { timeout: 30000 });
check("after acknowledging, waivers can be created", true);

await church.reload();
await church.waitForSelector("h1:text('Waiver library')", { timeout: 30000 });
check(
  "the notice does not come back after acknowledgement",
  !(await church.textContent("main")).includes("Before your first waiver"),
);

// ---------------------------------------------------------------------------
log("Inviting leaders needs lifetime access");

await church.goto(`${BASE}/orgs/${orgSlug}/settings`);
await church.waitForSelector("text=Invite a leader", { timeout: 30000 });
await church.fill('input[name="email"]', `blocked${stamp}@accounts.test`);
await church.click('button:has-text("Send invitation")');
await church.waitForURL(/\/unlock/, { timeout: 30000 });
check(
  "a church still in free setup is sent to unlock instead of inviting",
  /gate=leader-invitations/.test(church.url()),
);
check(
  "and nothing was sent",
  !(await church.textContent("main")).includes(`blocked${stamp}@accounts.test`),
);

// Grant it through the same CLI a pilot church would get, which is also the
// only way access is ever handed out without a payment.
execSync(`npm run grant -- ${orgSlug} "accounts e2e"`, { stdio: "pipe" });

// ---------------------------------------------------------------------------
log("The owner invites a leader");

await church.goto(`${BASE}/orgs/${orgSlug}/settings`);
await church.waitForSelector("text=Invite a leader", { timeout: 30000 });
const leaderEmail = `helper${stamp}@accounts.test`;
await church.fill('input[name="email"]', leaderEmail);
await church.click('button:has-text("Send invitation")');
await church.waitForSelector('input[aria-label="Invitation link"]', { timeout: 30000 });
const inviteUrl = (await church.inputValue('input[aria-label="Invitation link"]')).trim();
check("an invitation link was issued", /\/invite\/[A-Za-z0-9_-]{43}$/.test(inviteUrl));

await church.reload();
await church.waitForSelector("text=Pending invitations", { timeout: 30000 });
check("the invitation is listed as pending", (await church.textContent("main")).includes(leaderEmail));

// ---------------------------------------------------------------------------
log("The invited leader accepts");

const leaderCtx = await browser.newContext(PHONE);
const leader = await leaderCtx.newPage();
await leader.goto(inviteUrl);
await leader.waitForSelector("text=been invited", { timeout: 30000 });
check("the invite page names the church", (await leader.textContent("main")).includes("Hillside Chapel"));

await leader.click('a:has-text("Create an account")');
await leader.waitForSelector('input[name="firstName"]', { timeout: 30000 });
await leader.fill('input[name="firstName"]', "Hana");
await leader.fill('input[name="lastName"]', "Cole");
await leader.fill('input[name="email"]', leaderEmail);
await leader.fill('input[name="password"]', "leader password 123");
await leader.click('button[type="submit"]');

// Signing up from an invite returns to the invitation rather than onboarding.
await leader.waitForURL(/\/invite\//, { timeout: 30000 });
check("signing up from an invite returns to the invitation", true);

await leader.click('button:has-text("Accept invitation")');
await leader.waitForURL(new RegExp(`/orgs/${orgSlug}`), { timeout: 30000 });
check("the leader landed inside the church", leader.url().includes(orgSlug));

await leader.goto(inviteUrl);
await leader.waitForSelector("text=no longer available", { timeout: 30000 });
check("the invitation link is single use", true);

// ---------------------------------------------------------------------------
log("Role boundaries");

await leader.goto(`${BASE}/orgs/${orgSlug}/settings`);
await leader.waitForSelector("h1:text('Organization settings')", { timeout: 30000 });
const leaderSettings = await leader.textContent("main");
check("a leader sees the team but no invite form", !leaderSettings.includes("Invite a leader"));
check("a leader cannot see pending invitations", !leaderSettings.includes("Pending invitations"));
check("a leader cannot delete the organization", !leaderSettings.includes("Delete this organization"));
check(
  "a leader cannot edit organization details",
  Boolean(await leader.$('input[name="name"][disabled]')),
);

// A leader can still do the actual job.
await leader.goto(`${BASE}/orgs/${orgSlug}/trips/new`);
await leader.waitForSelector('input[name="name"]', { timeout: 30000 });
await leader.fill('input[name="name"]', "Leader Made This Trip");
await leader.click('button[type="submit"]');
await leader.waitForURL(/\/trips\//, { timeout: 30000 });
check("a leader can create and run trips", leader.url().includes("/trips/"));

// ---------------------------------------------------------------------------
log("Cross-organization isolation with real users");

const demoCtx = await browser.newContext(PHONE);
const demo = await demoCtx.newPage();
await signIn(demo, OWNER.email, OWNER.password);
await demo.waitForURL(/\/orgs\//, { timeout: 30000 });
const demoOrgUrl = demo.url();
const demoSlug = demoOrgUrl.split("/orgs/")[1].split("/")[0];

await leader.goto(`${BASE}/orgs/${demoSlug}`);
const leaderSawOtherChurch = await leader.textContent("body");
check(
  "a leader of one church cannot open another church",
  /not be found|404|This page could not be found/i.test(leaderSawOtherChurch),
  leader.url(),
);

await demo.goto(`${BASE}/orgs/${orgSlug}/settings`);
check(
  "and it is symmetric — the other owner cannot open this church either",
  /not be found|404|This page could not be found/i.test(await demo.textContent("body")),
);

// ---------------------------------------------------------------------------
log("Password reset end to end");

// Sign the owner in on a second device so we can prove sessions die.
const secondDeviceCtx = await browser.newContext(PHONE);
const secondDevice = await secondDeviceCtx.newPage();
await signIn(secondDevice, pastorEmail, "first password 123");
await secondDevice.waitForURL(/\/orgs\//, { timeout: 30000 });
check("the owner is signed in on a second device", secondDevice.url().includes("/orgs/"));

const resetCtx = await browser.newContext(PHONE);
const reset = await resetCtx.newPage();
await reset.goto(`${BASE}/login`);
await reset.click('a:has-text("Forgot password?")');
await reset.waitForURL(/\/forgot-password/, { timeout: 30000 });
await reset.fill('input[name="email"]', pastorEmail);
await reset.click('button:has-text("Send reset link")');
await reset.waitForSelector("text=Check your email", { timeout: 30000 });

const resetLink = await reset.inputValue('input[aria-label="Password reset link"]');
check("a reset link was issued", /\/reset-password\/[A-Za-z0-9_-]{43}$/.test(resetLink));

// An unknown address gets exactly the same answer.
await reset.goto(`${BASE}/forgot-password`);
await reset.fill('input[name="email"]', `nobody${stamp}@nowhere.test`);
await reset.click('button:has-text("Send reset link")');
await reset.waitForSelector("text=Check your email", { timeout: 30000 });
const unknownResponse = await reset.textContent("main");
check(
  "an unknown address gets the identical response",
  unknownResponse.includes("If that email address has a Ready Set Amen account"),
);
check(
  "and no link is produced for an address with no account",
  !(await reset.$('input[aria-label="Password reset link"]')),
);

await reset.goto(resetLink);
await reset.waitForSelector('input[name="password"]', { timeout: 30000 });
await reset.fill('input[name="password"]', "second password 456");
await reset.fill('input[name="confirm"]', "second password 456");
await reset.click('button:has-text("Set new password")');
await reset.waitForURL(/\/login\?reset=1/, { timeout: 30000 });
check("after resetting, the user is sent to sign in", true);
check("with a confirmation", (await reset.textContent("main")).includes("Password updated"));

await reset.goto(resetLink);
await reset.waitForSelector("text=no longer valid", { timeout: 30000 });
check("the reset link is single use", true);

await secondDevice.goto(`${BASE}/orgs/${orgSlug}`);
check(
  "the other device was signed out by the reset",
  secondDevice.url().includes("/login"),
  secondDevice.url(),
);

await signIn(reset, pastorEmail, "first password 123");
await reset.waitForTimeout(1500);
check("the old password no longer works", reset.url().includes("/login"));

await signIn(reset, pastorEmail, "second password 456");
await reset.waitForURL(/\/orgs\//, { timeout: 30000 });
check("the new password works", reset.url().includes("/orgs/"));

// ---------------------------------------------------------------------------
log("Owner-assisted reset (the path when email is not configured)");

await church.goto(`${BASE}/login`);
await signIn(church, pastorEmail, "second password 456");
await church.waitForURL(/\/orgs\//, { timeout: 30000 });
await church.goto(`${BASE}/orgs/${orgSlug}/settings`);
await church.waitForSelector('button:has-text("Reset link")', { timeout: 30000 });
await churchCtx.grantPermissions(["clipboard-read", "clipboard-write"]);
await church.click('button:has-text("Reset link")');
await church.waitForSelector('input[aria-label^="Password reset link"]', { timeout: 30000 });
const ownerIssued = await church.inputValue('input[aria-label^="Password reset link"]');
check(
  "an owner can hand a leader a reset link without email",
  /\/reset-password\/[A-Za-z0-9_-]{43}$/.test(ownerIssued),
);

await browser.close();
console.log(failures === 0 ? "\nAccount flows passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
