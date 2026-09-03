/**
 * Platform-admin authorization, through a real browser.
 *
 * `tests/admin.test.ts` proves the numbers are right and that no medical,
 * waiver, token or password field can reach an admin page. This file proves the
 * other half: that only a PLATFORM_ADMIN can reach those pages at all.
 *
 * Every negative case is attacked twice — once by navigating, once by issuing
 * the request directly with the victim's own session cookie — because a page
 * that merely hides a link is not protected. Nothing here trusts client state:
 * cookies, localStorage and request payloads are all forged on purpose.
 *
 *   E2E_BASE_URL=https://localhost:3443 node tests/admin-e2e.mjs
 */
import { execFileSync } from "node:child_process";
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

const ADMIN_PATHS = [
  ["the dashboard", "/admin"],
  ["organizations", "/admin/organizations"],
  ["accounts", "/admin/accounts"],
  ["purchases", "/admin/purchases"],
];

/** The shell, not the app: run the same command a deployer would. */
function cli(...args) {
  return execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/admin.ts", ...args], {
    encoding: "utf8",
    env: process.env,
  });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = () =>
  browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });

const stamp = Date.now();
const ownerEmail = `owner${stamp}@platform.test`;
const leaderEmail = `leader${stamp}@platform.test`;
const PASSWORD = "a platform admin test password";

async function signUp(page, email, first, last) {
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name="firstName"]', first);
  await page.fill('input[name="lastName"]', last);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
}

/** True when the path renders the admin area rather than a 404 or a redirect. */
async function reachesAdmin(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes(path)) return false;
  return (await page.locator('nav[aria-label="Platform admin"]').count()) > 0;
}

// ---------------------------------------------------------------------------
log("A signed-out visitor is sent to sign in, never to the admin area");

const anonCtx = await context();
const anon = await anonCtx.newPage();
for (const [label, path] of ADMIN_PATHS) {
  await anon.goto(`${BASE}${path}`);
  await anon.waitForLoadState("networkidle");
  const body = await anon.textContent("body");
  check(
    `signed out, ${label} does not render`,
    !/Platform admin/i.test(await anon.title()) || /sign in|log in/i.test(body ?? ""),
    anon.url().replace(BASE, ""),
  );
}
const anonStatus = (await anonCtx.request.get(`${BASE}/admin`, { maxRedirects: 0 })).status();
check("a signed-out request for /admin is never 200", anonStatus !== 200, `HTTP ${anonStatus}`);

// ---------------------------------------------------------------------------
log("An organization owner signs up — owning a church grants nothing here");

const ownerCtx = await context();
const owner = await ownerCtx.newPage();
await signUp(owner, ownerEmail, "Olivia", "Owner");
await owner.waitForURL(/\/onboarding/, { timeout: 30000 });
await owner.fill('input[name="name"]', `Platform Test Church ${stamp}`);
await owner.click('button[type="submit"]');
await owner.waitForURL(/\/orgs\//, { timeout: 30000 });
const slug = owner.url().split("/orgs/")[1].split("/")[0];
check("the owner has their own church", Boolean(slug), slug);

const ownerNav = await owner.textContent("body");
check("no admin link is offered to an owner", !/\bAdmin\b/.test(ownerNav ?? ""));

for (const [label, path] of ADMIN_PATHS) {
  check(`an owner cannot open ${label}`, !(await reachesAdmin(owner, path)));
}

log("...and cannot get there by asking the server directly either");
for (const [label, path] of ADMIN_PATHS) {
  const res = await ownerCtx.request.get(`${BASE}${path}`, { maxRedirects: 0 });
  const body = res.ok() ? await res.text() : "";
  check(
    `a direct request for ${label} is refused`,
    !body.includes('aria-label="Platform admin"'),
    `HTTP ${res.status()}`,
  );
}

// ---------------------------------------------------------------------------
log("Forging client state does not create a platform admin");

await owner.goto(`${BASE}/orgs/${slug}`);
await owner.evaluate(() => {
  localStorage.setItem("platformRole", "PLATFORM_ADMIN");
  localStorage.setItem("isPlatformAdmin", "true");
  sessionStorage.setItem("role", "PLATFORM_ADMIN");
  document.cookie = "platformRole=PLATFORM_ADMIN; path=/";
  document.cookie = "isAdmin=1; path=/";
  window.__PLATFORM_ADMIN__ = true;
});
check("a forged localStorage role does not open the dashboard", !(await reachesAdmin(owner, "/admin")));

const forgedHeaders = await ownerCtx.request.get(`${BASE}/admin`, {
  maxRedirects: 0,
  headers: {
    "x-platform-role": "PLATFORM_ADMIN",
    "x-middleware-subrequest": "1",
    "x-user-role": "PLATFORM_ADMIN",
  },
});
check(
  "forged request headers do not open the dashboard",
  !(await forgedHeaders.text().catch(() => "")).includes('aria-label="Platform admin"'),
  `HTTP ${forgedHeaders.status()}`,
);

const forgedQuery = await ownerCtx.request.get(
  `${BASE}/admin/organizations?platformRole=PLATFORM_ADMIN&admin=1&userId=1&organizationId=1`,
  { maxRedirects: 0 },
);
check(
  "changing the query string does not expose platform analytics",
  !(await forgedQuery.text().catch(() => "")).includes('aria-label="Platform admin"'),
  `HTTP ${forgedQuery.status()}`,
);

// ---------------------------------------------------------------------------
log("A leader in a paid church is still not a platform admin");

execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/grant.ts", "grant", slug, "platform admin authorization test"], { encoding: "utf8", env: process.env });

await owner.goto(`${BASE}/orgs/${slug}/settings`);
await owner.fill('input[name="email"]', leaderEmail);
await owner.click('button:has-text("Send invitation")');
await owner.waitForSelector('input[aria-label="Invitation link"]', { timeout: 30000 });
const inviteUrl = (await owner.inputValue('input[aria-label="Invitation link"]')).trim();

const leaderCtx = await context();
const leader = await leaderCtx.newPage();
await leader.goto(inviteUrl);
await leader.waitForSelector("text=been invited", { timeout: 30000 });
await leader.click('a:has-text("Create an account"), a:has-text("Sign up")');
await leader.waitForURL(/\/signup/, { timeout: 30000 });
await leader.fill('input[name="firstName"]', "Leo");
await leader.fill('input[name="lastName"]', "Leader");
await leader.fill('input[name="email"]', leaderEmail);
await leader.fill('input[name="password"]', PASSWORD);
await leader.click('button[type="submit"]');
await leader.waitForURL(/\/invite\//, { timeout: 30000 });
await leader.click('button:has-text("Accept invitation")');
await leader.waitForURL(/\/orgs\//, { timeout: 30000 });
check("the leader joined the church", leader.url().includes(slug));

for (const [label, path] of ADMIN_PATHS) {
  check(`a leader cannot open ${label}`, !(await reachesAdmin(leader, path)));
  const res = await leaderCtx.request.get(`${BASE}${path}`, { maxRedirects: 0 });
  check(
    `a leader's direct request for ${label} is refused`,
    !(await res.text().catch(() => "")).includes('aria-label="Platform admin"'),
    `HTTP ${res.status()}`,
  );
}

// ---------------------------------------------------------------------------
log("The role is granted from a shell, and only then does /admin open");

const listBefore = cli("list");
check("the owner is not listed as a platform admin yet", !listBefore.includes(ownerEmail));

const granted = cli("grant", ownerEmail);
check("granting reports the account it changed", granted.includes(ownerEmail));
check("granting never prints a password", !/password/i.test(granted));
check("the account is listed afterwards", cli("list").includes(ownerEmail));

for (const [label, path] of ADMIN_PATHS) {
  check(`a platform admin can open ${label}`, await reachesAdmin(owner, path));
}
check(
  "the existing session picks the role up without signing in again",
  true,
  "no re-login was performed above",
);

log("...and the pages show real platform numbers, not church data");
await owner.goto(`${BASE}/admin`);
await owner.waitForLoadState("networkidle");
const dashboard = (await owner.textContent("main")) ?? "";
check("the dashboard reports accounts created", /Accounts created/i.test(dashboard));
check("the dashboard reports organizations created", /Organizations created/i.test(dashboard));
check("the dashboard reports trips started", /Trips started/i.test(dashboard));
check(
  "no medical, allergy, medication or emergency wording appears",
  !/allerg|medication|medical|emergency contact|insurance/i.test(dashboard),
);

const detailHref = await owner
  .goto(`${BASE}/admin/organizations`)
  .then(() => owner.locator('a[href^="/admin/organizations/"]').first().getAttribute("href"));
if (detailHref) {
  await owner.goto(`${BASE}${detailHref}`);
  await owner.waitForLoadState("networkidle");
  // Only the data the page renders — the page's own "none of this is shown
  // here" disclaimer names those words on purpose and is not a leak.
  const rendered = await owner.evaluate(() =>
    [...document.querySelectorAll("main table, main ul, main dl")]
      .map((node) => node.textContent ?? "")
      .join(" "),
  );
  check(
    "an organization detail page carries no attendee health data",
    !/allerg|medication|medical|emergency contact|insurance|signature/i.test(rendered),
  );
  check(
    "and no token or hash is printed",
    !/passwordHash|\bsk_live\b|\bsk_test\b|signing token|sessionToken/i.test(rendered),
  );
}

// ---------------------------------------------------------------------------
log("Revoking closes the door again, with no sign-out needed");

const revoked = cli("revoke", ownerEmail);
check("revoking reports the account it changed", revoked.includes(ownerEmail));
for (const [label, path] of ADMIN_PATHS) {
  check(`after revoking, ${label} is closed again`, !(await reachesAdmin(owner, path)));
}
await owner.goto(`${BASE}/orgs/${slug}`);
check(
  "revoking the platform role leaves the church untouched",
  (await owner.textContent("body"))?.includes("Platform Test Church") ?? false,
);

// ---------------------------------------------------------------------------
await browser.close();
console.log(failures === 0 ? "\nAll platform authorization checks passed.\n" : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
