import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  canonicalJson,
  generateToken,
  hashDocument,
  hashPassword,
  sha256,
  verifyPassword,
} from "../src/lib/crypto";

test("a password verifies against its own hash and nothing else", async () => {
  const hash = await hashPassword("keep the trip together");
  assert.ok(hash.startsWith("scrypt$"));
  assert.equal(await verifyPassword("keep the trip together", hash), true);
  assert.equal(await verifyPassword("Keep the trip together", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("the same password hashes differently every time (per-user salt)", async () => {
  const a = await hashPassword("same password");
  const b = await hashPassword("same password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same password", a), true);
  assert.equal(await verifyPassword("same password", b), true);
});

test("a malformed stored hash fails closed", async () => {
  assert.equal(await verifyPassword("anything", "not-a-hash"), false);
  assert.equal(await verifyPassword("anything", "scrypt$x$8$1$aaaa$bbbb"), false);
  assert.equal(await verifyPassword("anything", ""), false);
});

test("signing tokens are long, unique, and URL safe", () => {
  const tokens = new Set(Array.from({ length: 500 }, () => generateToken(32)));
  assert.equal(tokens.size, 500);
  for (const token of tokens) {
    assert.equal(token.length, 43, "32 random bytes in base64url");
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  }
});

test("document hashing ignores key order but not content", () => {
  const a = { title: "Release", sections: { intro: "Hello", release: "Terms" } };
  const b = { sections: { release: "Terms", intro: "Hello" }, title: "Release" };
  const c = { sections: { release: "Terms.", intro: "Hello" }, title: "Release" };

  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(hashDocument(a), hashDocument(b), "reordering keys must not change the hash");
  assert.notEqual(hashDocument(a), hashDocument(c), "a single character change must change it");
});

test("sha256 is stable — stored session and link hashes stay comparable", () => {
  assert.equal(sha256("abc"), sha256("abc"));
  assert.equal(sha256("abc").length, 64);
  assert.notEqual(sha256("abc"), sha256("abd"));
});
