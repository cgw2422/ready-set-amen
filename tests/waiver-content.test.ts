import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  activeFields,
  emptyContent,
  enabledSections,
  waiverContentSchema,
} from "../src/lib/waiver-content";
import { hashDocument } from "../src/lib/crypto";

test("a new waiver starts valid and empty of legal language", () => {
  const content = emptyContent("Grace Community Church", "Release and Waiver");
  const parsed = waiverContentSchema.safeParse(content);
  assert.equal(parsed.success, true);

  // Ready Set Amen never writes waiver language for a church.
  for (const section of Object.values(content.sections)) {
    assert.equal(section.body, "");
  }
  assert.equal(enabledSections(content).length, 0, "empty sections are not shown to a signer");
});

test("required fields survive a round trip through the schema", () => {
  const content = emptyContent("Church", "Waiver");
  const parsed = waiverContentSchema.parse(JSON.parse(JSON.stringify(content)));
  assert.deepEqual(activeFields(parsed).map((f) => f.key), activeFields(content).map((f) => f.key));
  assert.equal(hashDocument(parsed), hashDocument(content));
});

test("a section is only shown when it is both enabled and written", () => {
  const content = emptyContent("Church", "Waiver");
  content.sections.release.body = "  ";
  content.sections.intro.body = "Please read carefully.";
  content.sections.photoRelease.enabled = false;
  content.sections.photoRelease.body = "Photos may be used.";

  const shown = enabledSections(content).map((s) => s.key);
  assert.deepEqual(shown, ["intro"]);
});

test("unknown or malformed content is rejected rather than half-read", () => {
  assert.equal(waiverContentSchema.safeParse({}).success, false);
  assert.equal(waiverContentSchema.safeParse({ formatVersion: 2 }).success, false);

  const content = emptyContent("Church", "Waiver");
  const missingSection = JSON.parse(JSON.stringify(content));
  delete missingSection.sections.footer;
  assert.equal(waiverContentSchema.safeParse(missingSection).success, false);
});
