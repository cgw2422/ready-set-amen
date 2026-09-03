/**
 * Accessibility and mobile polish audit.
 *
 * Walks every authenticated screen at iPhone width and checks the things that
 * actually break for a real user: targets too small to hit, unlabelled inputs,
 * text that fails contrast, layouts that scroll sideways, long names that
 * overflow, and what happens when someone has large text turned on.
 *
 *   node tests/accessibility.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
let failures = 0;
const findings = [];

function check(label, ok, detail = "") {
  if (ok) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    findings.push(`${label}${detail ? `: ${detail}` : ""}`);
    failures += 1;
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', "leader@example.church");
await page.fill('input[name="password"]', "readysetamen2026");
await page.click('button[type="submit"]');
await page.waitForURL(/\/orgs\//, { timeout: 30000 });
await page.click("text=Summer Mission Trip");
await page.waitForURL(/\/trips\//, { timeout: 30000 });
const trip = page.url();

const SCREENS = [
  ["Dashboard", ""],
  ["People", "/people"],
  ["Add person", "/people/new"],
  ["Waivers", "/waivers"],
  ["Forms", "/forms"],
  ["Payments", "/payments"],
  ["Transportation", "/transportation"],
  ["Lodging", "/lodging"],
  ["Schedule", "/itinerary"],
  ["Tasks", "/tasks"],
  ["Leaders", "/leaders"],
  ["Prayer", "/prayer"],
  ["Headcount", "/headcount"],
  ["Emergency", "/emergency"],
  ["Packet", "/packet"],
  ["Trip settings", "/settings"],
];

// --- Shared in-page auditors ------------------------------------------------

const AUDIT = `() => {
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (value) => {
    const m = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    return { rgb: [+m[1], +m[2], +m[3]], alpha: m[4] === undefined ? 1 : +m[4] };
  };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const parsed = parse(getComputedStyle(node).backgroundColor);
      if (parsed && parsed.alpha > 0.5) return parsed.rgb;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const ratio = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // aria-hidden content is decorative and not announced, so it is exempt.
    if (el.closest('[aria-hidden="true"]')) return false;
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  // Touch targets
  const interactive = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button]')].filter(visible);
  const targetRect = (el) => {
    // A checkbox or radio inside a label is tapped via the whole label.
    if (el.tagName === "INPUT" && /^(checkbox|radio)$/i.test(el.type)) {
      const label = el.closest("label");
      if (label) return label.getBoundingClientRect();
    }
    return el.getBoundingClientRect();
  };
  const small = interactive
    .filter((el) => {
      const r = targetRect(el);
      // Inline links inside a paragraph are exempt: they are text, not controls.
      const inProse =
        el.tagName === "A" &&
        (el.closest("p, li, summary, dd") || getComputedStyle(el).display === "inline");
      return !inProse && (r.height < 44 || r.width < 24);
    })
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 32),
      h: Math.round(targetRect(el).height),
      w: Math.round(targetRect(el).width),
    }));

  // Accessible names on form controls
  const controls = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(visible);
  const unlabelled = controls
    .filter((el) => {
      if (el.getAttribute("aria-label")) return false;
      if (el.getAttribute("aria-labelledby")) return false;
      if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return false;
      if (el.closest("label")) return false;
      if (el.getAttribute("title")) return false;
      return true;
    })
    .map((el) => el.getAttribute("name") || el.tagName.toLowerCase());

  // Contrast for text nodes
  const textEls = [...document.querySelectorAll('p, span, a, button, li, dt, dd, h1, h2, h3, label, td, th, summary')]
    .filter(visible)
    .filter((el) => (el.textContent || "").trim().length > 0)
    .filter((el) => [...el.children].every((c) => !(c.textContent || "").trim()));
  const lowContrast = [];
  for (const el of textEls.slice(0, 400)) {
    const style = getComputedStyle(el);
    const fg = parse(style.color);
    if (!fg) continue;
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;
    const r = ratio(fg.rgb, bgOf(el));
    if (r < required) {
      lowContrast.push({
        text: (el.textContent || "").trim().slice(0, 40),
        ratio: Math.round(r * 100) / 100,
        required,
        color: style.color,
        size: Math.round(size),
      });
    }
  }

  const docWidth = document.documentElement.clientWidth;
  // Ignore anything inside a deliberate horizontal scroller — a chip row that
  // scrolls is correct behaviour, not document overflow.
  const inScroller = (el) => {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      node = node.parentElement;
    }
    return false;
  };
  const wideCulprits = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > docWidth + 1 && r.width > 0 && !inScroller(el);
    })
    .slice(0, 6)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 70),
      right: Math.round(el.getBoundingClientRect().right),
      text: (el.textContent || "").trim().slice(0, 30),
    }));

  return {
    wideCulprits,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small,
    unlabelled,
    lowContrast,
    h1: document.querySelectorAll("main h1, h1").length,
    imagesWithoutAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
  };
}`;

console.log("Auditing every screen at 390px\n");

const allSmall = new Map();
const allLowContrast = new Map();

for (const [name, path] of SCREENS) {
  await page.goto(`${trip}${path}`);
  await page.waitForLoadState("networkidle");
  const r = await page.evaluate(`(${AUDIT})()`);

  const problems = [];
  if (r.overflow > 1) problems.push(`scrolls sideways by ${r.overflow}px`);
  if (r.h1 === 0) problems.push("no h1");
  if (r.imagesWithoutAlt > 0) problems.push(`${r.imagesWithoutAlt} img without alt`);
  if (r.unlabelled.length) problems.push(`unlabelled: ${r.unlabelled.join(", ")}`);

  for (const s of r.small) allSmall.set(`${s.tag} "${s.text}" ${s.w}x${s.h}`, name);
  for (const c of r.lowContrast) {
    allLowContrast.set(`"${c.text}" ${c.ratio}:1 (needs ${c.required}) ${c.color} @${c.size}px`, name);
  }

  check(`${name}`, problems.length === 0, problems.join("; "));
}

console.log("\nTouch targets under 44px:");
if (allSmall.size === 0) console.log("  ✓ none");
else for (const [k, v] of allSmall) console.log(`  ✗ ${v}: ${k}`);
check("all touch targets are at least 44px tall", allSmall.size === 0, `${allSmall.size} found`);

console.log("\nText below WCAG AA contrast:");
if (allLowContrast.size === 0) console.log("  ✓ none");
else for (const [k, v] of allLowContrast) console.log(`  ✗ ${v}: ${k}`);
check("all text meets WCAG AA contrast", allLowContrast.size === 0, `${allLowContrast.size} found`);

// --- Keyboard navigation ----------------------------------------------------
console.log("\nKeyboard navigation");
await page.goto(`${trip}/people/new`);
await page.waitForSelector('input[name="firstName"]');
const reached = [];
for (let i = 0; i < 12; i += 1) {
  await page.keyboard.press("Tab");
  reached.push(
    await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        name: el.getAttribute("name") || el.tagName.toLowerCase(),
        outline: style.outlineStyle !== "none" || style.boxShadow !== "none",
      };
    }),
  );
}
check("tabbing reaches form fields", reached.some((r) => r?.name === "lastName"));
check(
  "focused elements are visibly focused",
  reached.filter(Boolean).some((r) => r.outline),
  `${reached.filter((r) => r?.outline).length}/${reached.length} showed focus styling`,
);

// --- Long names -------------------------------------------------------------
console.log("\nLong names");
await page.goto(`${trip}/people?q=Vandenberg`);
await page.waitForSelector("main ul");
const longOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("a 33-character hyphenated surname does not break layout", longOverflow <= 1, `${longOverflow}px`);

// --- Large accessibility text ----------------------------------------------
console.log("\nLarge text (200%)");
const big = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ignoreHTTPSErrors: true,
  storageState: await context.storageState(),
});
const bigPage = await big.newPage();
await bigPage.addInitScript(() => {
  // Approximates the iOS/Android "larger text" accessibility setting.
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.style.fontSize = "32px";
  });
});
for (const [name, path] of [
  ["Dashboard", ""],
  ["People", "/people"],
  ["Headcount", "/headcount"],
  ["Waivers", "/waivers"],
]) {
  await bigPage.goto(`${trip}${path}`);
  await bigPage.waitForLoadState("networkidle");
  const overflow = await bigPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const culprits = await bigPage.evaluate(`(${AUDIT})()`);
  check(
    `${name} at 200% text`,
    overflow <= 1,
    overflow > 1 ? `${overflow}px — ${JSON.stringify(culprits.wideCulprits.slice(0, 3))}` : "",
  );
}

// --- Public signing page ----------------------------------------------------
console.log("\nPublic signing page");
await page.goto(`${trip}/waivers`);
await page.waitForSelector("text=Student Ministry Release");
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
await page.click('button:has-text("Work through")');
await page.waitForSelector("button:has-text('Copy link for')");
await page.click("button:has-text('Copy link for')");
await page.waitForSelector('input[aria-label^="Signing link"]');
const signUrl = await page.inputValue('input[aria-label^="Signing link"]');

const guest = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ignoreHTTPSErrors: true,
});
const signer = await guest.newPage();
await signer.goto(signUrl);
await signer.waitForSelector("text=Signing for");
const signAudit = await signer.evaluate(`(${AUDIT})()`);
check("signing page does not scroll sideways", signAudit.overflow <= 1, `${signAudit.overflow}px`);
check("signing page inputs are all labelled", signAudit.unlabelled.length === 0, signAudit.unlabelled.join(", "));
check("signing page targets are big enough", signAudit.small.length === 0, JSON.stringify(signAudit.small.slice(0, 3)));
check("signing page text meets contrast", signAudit.lowContrast.length === 0, JSON.stringify(signAudit.lowContrast.slice(0, 3)));

const fontSize = await signer.evaluate(() => {
  const el = document.querySelector('input[name="signerName"], input');
  return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
});
check("inputs are >=16px so iOS Safari does not zoom on focus", fontSize >= 16, `${fontSize}px`);

// --- Public marketing page --------------------------------------------------
// It is the first thing anyone sees and needs no account, so it is held to the
// same bar as the signing page: contrast, target size, a real heading, and no
// sideways scroll at 200% text.
console.log("\nPublic marketing page");
const visitorCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ignoreHTTPSErrors: true,
});
const visitor = await visitorCtx.newPage();
await visitor.goto(BASE);
await visitor.waitForLoadState("networkidle");

const marketing = await visitor.evaluate(`(${AUDIT})()`);
check("marketing page does not scroll sideways", marketing.overflow <= 1, `${marketing.overflow}px`);
check("marketing targets are big enough", marketing.small.length === 0, JSON.stringify(marketing.small.slice(0, 3)));
check("marketing text meets contrast", marketing.lowContrast.length === 0, JSON.stringify(marketing.lowContrast.slice(0, 3)));

const headings = await visitor.evaluate(() => ({
  h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
  order: [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1])),
}));
check("exactly one h1", headings.h1.length === 1, headings.h1.join(" | "));
check(
  "heading levels never skip",
  headings.order.every((level, i) => i === 0 || level - headings.order[i - 1] <= 1),
  headings.order.join(","),
);

// The FAQ is a native disclosure, so it must work with the keyboard alone.
await visitor.goto(`${BASE}/#faq`);
await visitor.waitForLoadState("networkidle");
const faqOpened = await visitor.evaluate(() => {
  const summary = document.querySelector("details summary");
  if (!summary) return false;
  summary.click();
  return summary.parentElement.hasAttribute("open");
});
check("FAQ answers open without JavaScript of our own", faqOpened);

const bigVisitor = await visitorCtx.newPage();
await bigVisitor.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.style.fontSize = "32px";
  });
});
await bigVisitor.goto(BASE);
await bigVisitor.waitForLoadState("networkidle");
const bigOverflow = await bigVisitor.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
const bigCulprits = await bigVisitor.evaluate(`(${AUDIT})()`);
check(
  "marketing page at 200% text",
  bigOverflow <= 1,
  bigOverflow > 1 ? `${bigOverflow}px — ${JSON.stringify(bigCulprits.wideCulprits.slice(0, 3))}` : "",
);

await browser.close();
console.log(failures === 0 ? "\nAccessibility audit passed." : `\n${failures} issue(s) found.`);
process.exit(failures === 0 ? 0 : 1);
