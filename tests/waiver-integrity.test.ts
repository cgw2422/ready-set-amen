/**
 * Electronic waiver integrity audit.
 *
 * These run against a real Postgres database because the guarantees being
 * checked — immutability, single use, atomic signing — are database behaviours,
 * not pure functions. Point TEST_DATABASE_URL at a throwaway database:
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:integrity
 */
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { hashDocument, sha256 } from "../src/lib/crypto";
import { emptyContent } from "../src/lib/waiver-content";
import {
  issueSigningLink,
  markSigningLinkViewed,
  recordSignature,
  resolveSigningToken,
  syncWaiverRecipients,
} from "../src/lib/waiver-service";

const db: PrismaClient = prisma;

let organizationId = "";
let tripId = "";
let templateId = "";
let requirementId = "";
let versionOneId = "";

/** Maddie and Jordan share a guardian; Tom is an adult signing for himself. */
const people: Record<string, { attendeeId: string; recipientId: string }> = {};
const GUARDIAN_EMAIL = "rosa.mercer@example.com";

function contentWithText(text: string) {
  const content = emptyContent("Grace Community Church", "Release and Waiver");
  content.sections.intro.body = "Please read this before the trip.";
  content.sections.release.enabled = true;
  content.sections.release.body = text;
  content.acknowledgements = [
    { key: "readAndUnderstood", label: "I have read this document in full.", required: true },
    { key: "optional", label: "Optional acknowledgement.", required: false },
  ];
  return content;
}

before(async () => {
  await db.organization.deleteMany({ where: { slug: "integrity-test-church" } });
  await db.user.deleteMany({ where: { email: "integrity@test.local" } });

  const user = await db.user.create({
    data: {
      email: "integrity@test.local",
      firstName: "Test",
      lastName: "Leader",
      passwordHash: "scrypt$32768$8$1$AAAA$AAAA",
    },
  });

  const org = await db.organization.create({
    data: {
      name: "Grace Community Church",
      slug: "integrity-test-church",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  organizationId = org.id;

  const content = contentWithText("ORIGINAL RELEASE TEXT — version one.");
  const template = await db.waiverTemplate.create({
    data: {
      organizationId,
      name: "Integrity Template",
      versions: {
        create: { versionNumber: 1, content, contentHash: hashDocument(content) },
      },
    },
    include: { versions: true },
  });
  templateId = template.id;
  versionOneId = template.versions[0].id;

  const trip = await db.trip.create({
    data: {
      organizationId,
      name: "Integrity Trip",
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  tripId = trip.id;

  for (const [key, spec] of Object.entries({
    maddie: { first: "Maddie", minor: true },
    jordan: { first: "Jordan", minor: true },
    tom: { first: "Tom", minor: false },
  })) {
    const attendee = await db.attendee.create({
      data: {
        tripId,
        firstName: spec.first,
        lastName: "Mercer",
        isMinor: spec.minor,
        ...(spec.minor
          ? {
              guardians: {
                create: {
                  name: "Rosa Mercer",
                  email: GUARDIAN_EMAIL,
                  emailNormalized: GUARDIAN_EMAIL,
                  isPrimary: true,
                },
              },
            }
          : {}),
      },
    });
    people[key] = { attendeeId: attendee.id, recipientId: "" };
  }

  const requirement = await db.tripWaiverRequirement.create({
    data: { tripId, versionId: versionOneId, title: "Integrity Waiver", appliesToAll: true },
  });
  requirementId = requirement.id;

  await syncWaiverRecipients(tripId);

  for (const key of Object.keys(people)) {
    const recipient = await db.waiverRecipient.findFirstOrThrow({
      where: { requirementId, attendeeId: people[key].attendeeId },
    });
    people[key].recipientId = recipient.id;
  }
});

after(async () => {
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { email: "integrity@test.local" } });
  await db.$disconnect();
});

function tokenFrom(url: string): string {
  return url.split("/sign/")[1]!;
}

function baseSubmission(token: string) {
  return {
    token,
    signerName: "Rosa Mercer",
    signerRelationship: "Mother",
    signerEmail: GUARDIAN_EMAIL,
    signerPhone: "615-555-0100",
    typedSignature: "Rosa Mercer",
    drawnSignature: null,
    consentToElectronicRecords: true,
    acknowledgements: [
      { key: "readAndUnderstood", label: "I have read this document in full.", checked: true },
      { key: "optional", label: "Optional acknowledgement.", checked: false },
    ],
    responses: [
      { key: "participantName", label: "Participant Name", value: "Maddie Mercer" },
      { key: "emergencyContactName", label: "Emergency Contact Name", value: "Dad Mercer" },
      { key: "emergencyContactPhone", label: "Emergency Contact Phone", value: "615-555-0199" },
      { key: "allergies", label: "Allergies", value: "Peanuts" },
    ],
    ipAddress: "203.0.113.7",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  };
}

// ---------------------------------------------------------------------------

test("the raw signing token is never stored — only its hash", async () => {
  const url = await issueSigningLink(people.tom.recipientId);
  const token = tokenFrom(url);

  const byRawToken = await db.waiverSigningLink.findFirst({ where: { tokenHash: token } });
  assert.equal(byRawToken, null, "a raw token must not match any stored hash");

  const stored = await db.waiverSigningLink.findUniqueOrThrow({
    where: { tokenHash: sha256(token) },
  });
  assert.equal(stored.tokenHash.length, 64);
  assert.ok(!stored.tokenHash.includes(token));
  assert.equal(token.length, 43, "256 bits of entropy, base64url");
});

test("a guessed or unknown token reveals nothing at all", async () => {
  const url = await issueSigningLink(people.tom.recipientId);
  const real = tokenFrom(url);

  const guesses = [
    "a".repeat(43),
    real.slice(0, 42) + (real.endsWith("A") ? "B" : "A"), // one character off
    real.slice(0, 20),
    real + "x",
    "",
    "../../etc/passwd",
    "'; DROP TABLE waiver_signing_links; --",
  ];

  for (const guess of guesses) {
    const resolved = await resolveSigningToken(guess);
    assert.equal(resolved, null, `token "${guess.slice(0, 12)}…" must not resolve`);
  }

  // The real token still works — the guesses did not corrupt anything.
  assert.notEqual(await resolveSigningToken(real), null);
});

test("a signer needs no account: the token alone resolves the whole context", async () => {
  const url = await issueSigningLink(people.maddie.recipientId);
  const context = await resolveSigningToken(tokenFrom(url));

  assert.ok(context);
  assert.equal(context.attendee.firstName, "Maddie");
  assert.equal(context.signerRole, "GUARDIAN", "a minor's waiver is signed by a guardian");
  assert.equal(context.guardian?.email, GUARDIAN_EMAIL);
  assert.ok(context.content.sections.release.body.includes("ORIGINAL RELEASE TEXT"));
});

test("an expired link fails safely", async () => {
  const url = await issueSigningLink(people.tom.recipientId);
  const token = tokenFrom(url);
  await db.waiverSigningLink.update({
    where: { tokenHash: sha256(token) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(await resolveSigningToken(token), null);
});

test("a revoked link fails safely, and issuing a new one revokes the old", async () => {
  const first = tokenFrom(await issueSigningLink(people.tom.recipientId));
  assert.notEqual(await resolveSigningToken(first), null);

  const second = tokenFrom(await issueSigningLink(people.tom.recipientId));
  assert.equal(await resolveSigningToken(first), null, "regenerating kills the previous link");
  assert.notEqual(await resolveSigningToken(second), null);
});

test("status moves Not sent -> Sent -> Viewed -> Signed", async () => {
  const before = await db.waiverRecipient.findUniqueOrThrow({
    where: { id: people.jordan.recipientId },
  });
  assert.equal(before.status, "NOT_SENT");

  const url = await issueSigningLink(people.jordan.recipientId);
  const afterSend = await db.waiverRecipient.findUniqueOrThrow({
    where: { id: people.jordan.recipientId },
  });
  assert.equal(afterSend.status, "SENT");
  assert.ok(afterSend.sentAt);

  const context = await resolveSigningToken(tokenFrom(url));
  assert.ok(context);
  await markSigningLinkViewed(context.linkId, context.recipientId);

  const afterView = await db.waiverRecipient.findUniqueOrThrow({
    where: { id: people.jordan.recipientId },
  });
  assert.equal(afterView.status, "VIEWED");
  assert.ok(afterView.viewedAt);

  const result = await recordSignature({
    ...baseSubmission(tokenFrom(url)),
    responses: baseSubmission(tokenFrom(url)).responses.map((r) =>
      r.key === "participantName" ? { ...r, value: "Jordan Mercer" } : r,
    ),
  });
  assert.equal(result.ok, true);

  const afterSign = await db.waiverRecipient.findUniqueOrThrow({
    where: { id: people.jordan.recipientId },
  });
  assert.equal(afterSign.status, "SIGNED");
  assert.ok(afterSign.signedAt);
});

test("a used link cannot be replayed", async () => {
  const url = await issueSigningLink(people.maddie.recipientId);
  const token = tokenFrom(url);

  const first = await recordSignature(baseSubmission(token));
  assert.equal(first.ok, true);

  assert.equal(await resolveSigningToken(token), null, "the link is dead after use");

  const replay = await recordSignature(baseSubmission(token));
  assert.equal(replay.ok, false);

  const signatures = await db.signedWaiver.count({
    where: { attendeeId: people.maddie.attendeeId },
  });
  assert.equal(signatures, 1, "replaying must not create a second signature");
});

test("the signed record retains the full audit payload", async () => {
  const record = await db.signedWaiver.findFirstOrThrow({
    where: { attendeeId: people.maddie.attendeeId },
    include: { responses: true },
  });

  assert.equal(record.signerName, "Rosa Mercer");
  assert.equal(record.participantNameAtSigning, "Maddie Mercer");
  assert.equal(record.signerRole, "GUARDIAN");
  assert.equal(record.signerRelationship, "Mother");
  assert.equal(record.signerEmail, GUARDIAN_EMAIL);
  assert.equal(record.typedSignature, "Rosa Mercer");
  assert.equal(record.consentToElectronicRecords, true);
  assert.ok(record.consentText.includes("electronic signature"));
  assert.equal(record.ipAddress, "203.0.113.7");
  assert.ok(record.userAgent?.includes("iPhone"));
  assert.ok(record.signedAt instanceof Date);
  assert.equal(record.documentHash.length, 64);
  assert.ok(record.id.length > 10, "a unique signed-waiver id");

  const acks = record.acknowledgements as { key: string; checked: boolean }[];
  assert.equal(acks.find((a) => a.key === "readAndUnderstood")?.checked, true);
  assert.equal(acks.find((a) => a.key === "optional")?.checked, false);

  const allergies = record.responses.find((r) => r.fieldKey === "allergies");
  assert.equal(allergies?.value, "Peanuts");

  // The snapshot hash must actually verify against the stored snapshot.
  assert.equal(hashDocument(record.documentSnapshot), record.documentHash);
});

test("editing the template afterwards does not alter the signed record", async () => {
  const before = await db.signedWaiver.findFirstOrThrow({
    where: { attendeeId: people.maddie.attendeeId },
  });

  const rewritten = contentWithText("COMPLETELY REWRITTEN TEXT — version two.");
  await db.waiverTemplateVersion.create({
    data: {
      templateId,
      versionNumber: 2,
      content: rewritten,
      contentHash: hashDocument(rewritten),
    },
  });

  const after = await db.signedWaiver.findFirstOrThrow({
    where: { attendeeId: people.maddie.attendeeId },
  });

  assert.equal(after.documentHash, before.documentHash, "the hash must not move");
  const snapshot = after.documentSnapshot as { content: { sections: Record<string, { body: string }> } };
  assert.ok(
    snapshot.content.sections.release.body.includes("ORIGINAL RELEASE TEXT"),
    "the signed copy still shows the words that were signed",
  );
  assert.ok(!snapshot.content.sections.release.body.includes("REWRITTEN"));

  // Version 1 itself is untouched and still referenced.
  const v1 = await db.waiverTemplateVersion.findUniqueOrThrow({ where: { id: versionOneId } });
  const v1Content = v1.content as { sections: Record<string, { body: string }> };
  assert.ok(v1Content.sections.release.body.includes("ORIGINAL RELEASE TEXT"));
  assert.equal(after.versionId, versionOneId);
});

test("a tampered stored version is refused rather than signed", async () => {
  const content = contentWithText("Tamper target.");
  const template = await db.waiverTemplate.create({
    data: {
      organizationId,
      name: "Tamper Template",
      versions: { create: { versionNumber: 1, content, contentHash: hashDocument(content) } },
    },
    include: { versions: true },
  });
  const requirement = await db.tripWaiverRequirement.create({
    data: { tripId, versionId: template.versions[0].id, title: "Tamper", appliesToAll: false },
  });
  const attendee = await db.attendee.create({
    data: { tripId, firstName: "Tamper", lastName: "Target", isMinor: false },
  });
  const recipient = await db.waiverRecipient.create({
    data: { requirementId: requirement.id, attendeeId: attendee.id, signerRole: "SELF" },
  });

  const token = tokenFrom(await issueSigningLink(recipient.id));

  // Someone edits the version row directly, leaving the stored hash behind.
  const tampered = contentWithText("Text quietly swapped after the fact.");
  await db.waiverTemplateVersion.update({
    where: { id: template.versions[0].id },
    data: { content: tampered },
  });

  const result = await recordSignature({ ...baseSubmission(token), signerRelationship: "Self" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /could not be verified/i);
  assert.equal(await db.signedWaiver.count({ where: { attendeeId: attendee.id } }), 0);
});

test("required acknowledgements and consent are enforced server-side", async () => {
  const attendee = await db.attendee.create({
    data: { tripId, firstName: "Strict", lastName: "Check", isMinor: false },
  });
  await syncWaiverRecipients(tripId);
  const recipient = await db.waiverRecipient.findFirstOrThrow({
    where: { requirementId, attendeeId: attendee.id },
  });

  const noConsent = tokenFrom(await issueSigningLink(recipient.id));
  const a = await recordSignature({
    ...baseSubmission(noConsent),
    signerRelationship: "Self",
    consentToElectronicRecords: false,
  });
  assert.equal(a.ok, false);

  const noAck = tokenFrom(await issueSigningLink(recipient.id));
  const b = await recordSignature({
    ...baseSubmission(noAck),
    signerRelationship: "Self",
    acknowledgements: [
      { key: "readAndUnderstood", label: "I have read this document in full.", checked: false },
    ],
  });
  assert.equal(b.ok, false);

  const noSignature = tokenFrom(await issueSigningLink(recipient.id));
  const c = await recordSignature({
    ...baseSubmission(noSignature),
    signerRelationship: "Self",
    typedSignature: " ",
  });
  assert.equal(c.ok, false);

  const missingRequiredField = tokenFrom(await issueSigningLink(recipient.id));
  const d = await recordSignature({
    ...baseSubmission(missingRequiredField),
    signerRelationship: "Self",
    responses: [{ key: "participantName", label: "Participant Name", value: "Strict Check" }],
  });
  assert.equal(d.ok, false, "a required emergency contact cannot be skipped");

  assert.equal(await db.signedWaiver.count({ where: { attendeeId: attendee.id } }), 0);
});

test("one guardian signing for several children works, and each gets its own record", async () => {
  // Reset the two siblings so the guardian starts fresh.
  await db.signedWaiver.deleteMany({
    where: { attendeeId: { in: [people.maddie.attendeeId, people.jordan.attendeeId] } },
  });
  await db.waiverRecipient.updateMany({
    where: { id: { in: [people.maddie.recipientId, people.jordan.recipientId] } },
    data: { status: "NOT_SENT", signedAt: null },
  });

  const token = tokenFrom(await issueSigningLink(people.maddie.recipientId));
  const result = await recordSignature(baseSubmission(token));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.siblings.length, 1, "Jordan is offered to the same guardian");
  assert.match(result.siblings[0].name, /Jordan/);

  // The sibling link is a real, working, separate credential.
  const siblingToken = tokenFrom(result.siblings[0].url);
  const siblingContext = await resolveSigningToken(siblingToken);
  assert.ok(siblingContext);
  assert.equal(siblingContext.attendee.firstName, "Jordan");

  const second = await recordSignature({
    ...baseSubmission(siblingToken),
    responses: baseSubmission(siblingToken).responses.map((r) =>
      r.key === "participantName" ? { ...r, value: "Jordan Mercer" } : r,
    ),
  });
  assert.equal(second.ok, true);

  const records = await db.signedWaiver.findMany({
    where: { attendeeId: { in: [people.maddie.attendeeId, people.jordan.attendeeId] } },
  });
  assert.equal(records.length, 2, "two participants, two independent signatures");
  assert.notEqual(records[0].id, records[1].id);
  assert.notEqual(records[0].recipientId, records[1].recipientId);
});

test("sibling links are not offered to an email that is not on file", async () => {
  const attendee = await db.attendee.create({
    data: {
      tripId,
      firstName: "Solo",
      lastName: "Child",
      isMinor: true,
      guardians: {
        create: {
          name: "Real Parent",
          email: "real.parent@example.com",
          emailNormalized: "real.parent@example.com",
          isPrimary: true,
        },
      },
    },
  });
  await syncWaiverRecipients(tripId);
  const recipient = await db.waiverRecipient.findFirstOrThrow({
    where: { requirementId, attendeeId: attendee.id },
  });

  const token = tokenFrom(await issueSigningLink(recipient.id));
  // A link holder types someone else's address, fishing for their children.
  const result = await recordSignature({
    ...baseSubmission(token),
    signerEmail: GUARDIAN_EMAIL,
    responses: [
      ...baseSubmission(token).responses,
      { key: "guardianEmail", label: "Parent / Guardian Email", value: GUARDIAN_EMAIL },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.siblings.length,
    0,
    "an address that is not this participant's guardian must reveal no other children",
  );
});

test("a not-required waiver is excluded and cannot be signed", async () => {
  const attendee = await db.attendee.create({
    data: { tripId, firstName: "Not", lastName: "Required", isMinor: false },
  });
  await syncWaiverRecipients(tripId);
  const recipient = await db.waiverRecipient.findFirstOrThrow({
    where: { requirementId, attendeeId: attendee.id },
  });

  const token = tokenFrom(await issueSigningLink(recipient.id));
  await db.waiverRecipient.update({
    where: { id: recipient.id },
    data: { status: "NOT_REQUIRED" },
  });
  await db.waiverSigningLink.updateMany({
    where: { recipientId: recipient.id },
    data: { revokedAt: new Date() },
  });

  assert.equal(await resolveSigningToken(token), null);
  const result = await recordSignature(baseSubmission(token));
  assert.equal(result.ok, false);
});

test("two simultaneous submissions produce exactly one signature", async () => {
  const attendee = await db.attendee.create({
    data: { tripId, firstName: "Double", lastName: "Tap", isMinor: false },
  });
  await syncWaiverRecipients(tripId);
  const recipient = await db.waiverRecipient.findFirstOrThrow({
    where: { requirementId, attendeeId: attendee.id },
  });

  const token = tokenFrom(await issueSigningLink(recipient.id));
  const submission = { ...baseSubmission(token), signerRelationship: "Self" };

  const [a, b] = await Promise.all([recordSignature(submission), recordSignature(submission)]);
  const succeeded = [a, b].filter((r) => r.ok).length;

  assert.equal(succeeded, 1, "a double tap on a slow phone must not sign twice");
  assert.equal(await db.signedWaiver.count({ where: { attendeeId: attendee.id } }), 1);
});
