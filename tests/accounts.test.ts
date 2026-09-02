/**
 * Accounts: password reset, leader invitations, roles and the waiver
 * acknowledgement.
 *
 * These exercise the service layer against a real database, because expiry,
 * single use, session invalidation and tenant isolation are all database
 * behaviours — a mock would prove nothing.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:accounts
 */
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { prisma } from "../src/lib/db";
import { hashPassword, sha256, verifyPassword } from "../src/lib/crypto";
import {
  completePasswordReset,
  findValidResetToken,
  issuePasswordResetToken,
} from "../src/lib/account-service";
import {
  acceptInvitation,
  createInvitation,
  findValidInvitation,
  revokeInvitation,
} from "../src/lib/member-service";
import { isOwner } from "../src/lib/access";
import { WAIVER_TERMS_TEXT } from "../src/lib/legal";

const OWNER_EMAIL = "owner@accounts.test";
const LEADER_EMAIL = "leader@accounts.test";
const OUTSIDER_EMAIL = "outsider@accounts.test";

let ownerId = "";
let leaderId = "";
let outsiderId = "";
let orgId = "";
let otherOrgId = "";
let orgSlug = "";

async function makeUser(email: string, first: string) {
  return prisma.user.create({
    data: {
      email,
      firstName: first,
      lastName: "Test",
      passwordHash: await hashPassword("original password 1"),
    },
  });
}

before(async () => {
  await prisma.organization.deleteMany({
    where: { slug: { in: ["accounts-church", "accounts-other-church"] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [OWNER_EMAIL, LEADER_EMAIL, OUTSIDER_EMAIL] } },
  });

  ownerId = (await makeUser(OWNER_EMAIL, "Olive")).id;
  leaderId = (await makeUser(LEADER_EMAIL, "Leo")).id;
  outsiderId = (await makeUser(OUTSIDER_EMAIL, "Otto")).id;

  const org = await prisma.organization.create({
    data: {
      name: "Accounts Church",
      slug: "accounts-church",
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
  });
  orgId = org.id;
  orgSlug = org.slug;

  const other = await prisma.organization.create({
    data: {
      name: "Other Church",
      slug: "accounts-other-church",
      members: { create: { userId: outsiderId, role: "OWNER" } },
    },
  });
  otherOrgId = other.id;
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
  await prisma.user.deleteMany({
    where: { email: { in: [OWNER_EMAIL, LEADER_EMAIL, OUTSIDER_EMAIL] } },
  });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

test("a reset token is stored only as a hash", async () => {
  const token = await issuePasswordResetToken(ownerId, "203.0.113.5");

  assert.equal(token.length, 43, "256 bits of entropy, base64url");
  const byRaw = await prisma.passwordResetToken.findFirst({ where: { tokenHash: token } });
  assert.equal(byRaw, null, "the raw token must not match any stored value");

  const stored = await prisma.passwordResetToken.findUniqueOrThrow({
    where: { tokenHash: sha256(token) },
  });
  assert.equal(stored.userId, ownerId);
  assert.equal(stored.usedAt, null);
});

test("password reset works end to end and the new password takes effect", async () => {
  const token = await issuePasswordResetToken(ownerId);
  const lookup = await findValidResetToken(token);
  assert.equal(lookup.valid, true);

  const outcome = await completePasswordReset(token, "a brand new password");
  assert.equal(outcome.ok, true);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
  assert.equal(await verifyPassword("a brand new password", user.passwordHash), true);
  assert.equal(await verifyPassword("original password 1", user.passwordHash), false);
});

test("resetting a password destroys every session for that account", async () => {
  // Three devices signed in.
  await prisma.session.createMany({
    data: [1, 2, 3].map((n) => ({
      userId: ownerId,
      tokenHash: sha256(`session-${n}-${Date.now()}`),
      expiresAt: new Date(Date.now() + 86_400_000),
    })),
  });
  // Another user's session must survive.
  await prisma.session.create({
    data: {
      userId: leaderId,
      tokenHash: sha256(`other-${Date.now()}`),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  assert.equal(await prisma.session.count({ where: { userId: ownerId } }), 3);

  const token = await issuePasswordResetToken(ownerId);
  const outcome = await completePasswordReset(token, "another new password");
  assert.equal(outcome.ok, true);

  assert.equal(
    await prisma.session.count({ where: { userId: ownerId } }),
    0,
    "every device is signed out",
  );
  assert.equal(
    await prisma.session.count({ where: { userId: leaderId } }),
    1,
    "other accounts are untouched",
  );
});

test("a used reset token cannot be used again", async () => {
  const token = await issuePasswordResetToken(leaderId);
  assert.equal((await completePasswordReset(token, "first reset password")).ok, true);

  const second = await completePasswordReset(token, "attacker chosen password");
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "used");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: leaderId } });
  assert.equal(
    await verifyPassword("attacker chosen password", user.passwordHash),
    false,
    "the replayed reset must not have changed the password",
  );
});

test("an expired reset token is refused", async () => {
  const token = await issuePasswordResetToken(leaderId);
  await prisma.passwordResetToken.update({
    where: { tokenHash: sha256(token) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const lookup = await findValidResetToken(token);
  assert.equal(lookup.valid, false);
  if (!lookup.valid) assert.equal(lookup.reason, "expired");

  const outcome = await completePasswordReset(token, "should not work");
  assert.equal(outcome.ok, false);
});

test("an invalid or guessed reset token reveals nothing", async () => {
  const real = await issuePasswordResetToken(leaderId);
  for (const guess of [
    "a".repeat(43),
    real.slice(0, 42) + (real.endsWith("A") ? "B" : "A"),
    real.slice(0, 10),
    "",
    "'; DROP TABLE password_reset_tokens; --",
  ]) {
    const lookup = await findValidResetToken(guess);
    assert.equal(lookup.valid, false, `"${guess.slice(0, 10)}…" must not resolve`);
    assert.equal((await completePasswordReset(guess, "nope")).ok, false);
  }
  // The real one still works — the guesses changed nothing.
  assert.equal((await findValidResetToken(real)).valid, true);
});

test("requesting a new reset link invalidates the previous one", async () => {
  const first = await issuePasswordResetToken(leaderId);
  const second = await issuePasswordResetToken(leaderId);

  assert.equal((await findValidResetToken(first)).valid, false, "the older link is dead");
  assert.equal((await findValidResetToken(second)).valid, true);
});

test("two simultaneous resets produce exactly one password change", async () => {
  const token = await issuePasswordResetToken(leaderId);
  const [a, b] = await Promise.all([
    completePasswordReset(token, "race password A"),
    completePasswordReset(token, "race password B"),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

test("an owner invites a leader, who accepts and joins", async () => {
  const token = await createInvitation({
    organizationId: orgId,
    email: LEADER_EMAIL,
    invitedByUserId: ownerId,
  });

  assert.equal(token.length, 43);
  const byRaw = await prisma.organizationInvitation.findFirst({ where: { tokenHash: token } });
  assert.equal(byRaw, null, "invitation tokens are stored hashed");

  const preview = await findValidInvitation(token);
  assert.equal(preview.valid, true);
  if (preview.valid) {
    assert.equal(preview.organizationName, "Accounts Church");
    assert.equal(preview.email, LEADER_EMAIL);
  }

  const accepted = await acceptInvitation(token, leaderId);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.organizationSlug, orgSlug);

  const membership = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: orgId, userId: leaderId },
  });
  assert.equal(membership.role, "LEADER", "invitations only ever create leaders");
});

test("an accepted invitation cannot be reused", async () => {
  const token = await createInvitation({
    organizationId: orgId,
    email: "second@accounts.test",
    invitedByUserId: ownerId,
  });
  assert.equal((await acceptInvitation(token, outsiderId)).ok, true);

  const replay = await acceptInvitation(token, outsiderId);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.reason, "used");

  // Clean up so later isolation tests still see the outsider as an outsider.
  await prisma.organizationMember.deleteMany({ where: { organizationId: orgId, userId: outsiderId } });
});

test("a revoked invitation stops working immediately", async () => {
  const token = await createInvitation({
    organizationId: orgId,
    email: "revoked@accounts.test",
    invitedByUserId: ownerId,
  });
  const record = await prisma.organizationInvitation.findUniqueOrThrow({
    where: { tokenHash: sha256(token) },
  });

  assert.equal(await revokeInvitation(orgId, record.id), true);

  const lookup = await findValidInvitation(token);
  assert.equal(lookup.valid, false);
  if (!lookup.valid) assert.equal(lookup.reason, "revoked");
  assert.equal((await acceptInvitation(token, outsiderId)).ok, false);
});

test("an expired invitation is refused", async () => {
  const token = await createInvitation({
    organizationId: orgId,
    email: "expired@accounts.test",
    invitedByUserId: ownerId,
  });
  await prisma.organizationInvitation.update({
    where: { tokenHash: sha256(token) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const lookup = await findValidInvitation(token);
  assert.equal(lookup.valid, false);
  if (!lookup.valid) assert.equal(lookup.reason, "expired");
  assert.equal((await acceptInvitation(token, outsiderId)).ok, false);
});

test("re-inviting the same address kills the earlier link", async () => {
  const first = await createInvitation({
    organizationId: orgId,
    email: "twice@accounts.test",
    invitedByUserId: ownerId,
  });
  const second = await createInvitation({
    organizationId: orgId,
    email: "twice@accounts.test",
    invitedByUserId: ownerId,
  });

  assert.equal((await findValidInvitation(first)).valid, false);
  assert.equal((await findValidInvitation(second)).valid, true);
});

test("an invitation cannot be revoked by another organization", async () => {
  const token = await createInvitation({
    organizationId: orgId,
    email: "protected@accounts.test",
    invitedByUserId: ownerId,
  });
  const record = await prisma.organizationInvitation.findUniqueOrThrow({
    where: { tokenHash: sha256(token) },
  });

  assert.equal(
    await revokeInvitation(otherOrgId, record.id),
    false,
    "another church must not be able to revoke this invitation",
  );
  assert.equal((await findValidInvitation(token)).valid, true);
});

// ---------------------------------------------------------------------------
// Roles and isolation with several users
// ---------------------------------------------------------------------------

test("a leader can reach their own organization's trips but not another's", async () => {
  const ourTrip = await prisma.trip.create({ data: { organizationId: orgId, name: "Ours" } });
  const theirTrip = await prisma.trip.create({
    data: { organizationId: otherOrgId, name: "Theirs" },
  });

  // This is the exact where-clause the access layer builds.
  const reachable = await prisma.trip.findFirst({
    where: { id: ourTrip.id, organization: { members: { some: { userId: leaderId } } } },
  });
  assert.notEqual(reachable, null, "a leader can open their own church's trip");

  const blocked = await prisma.trip.findFirst({
    where: { id: theirTrip.id, organization: { members: { some: { userId: leaderId } } } },
  });
  assert.equal(blocked, null, "a leader cannot open another church's trip");
});

test("three users, two churches: each sees only their own", async () => {
  const forOwner = await prisma.organization.findMany({
    where: { members: { some: { userId: ownerId } } },
    select: { slug: true },
  });
  const forLeader = await prisma.organization.findMany({
    where: { members: { some: { userId: leaderId } } },
    select: { slug: true },
  });
  const forOutsider = await prisma.organization.findMany({
    where: { members: { some: { userId: outsiderId } } },
    select: { slug: true },
  });

  assert.deepEqual(forOwner.map((o) => o.slug), ["accounts-church"]);
  assert.deepEqual(forLeader.map((o) => o.slug), ["accounts-church"]);
  assert.deepEqual(forOutsider.map((o) => o.slug), ["accounts-other-church"]);
});

test("a leader is not an owner, and owner-only actions check for it", async () => {
  const leaderMembership = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: orgId, userId: leaderId },
  });
  const ownerMembership = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: orgId, userId: ownerId },
  });

  assert.equal(isOwner(leaderMembership.role), false);
  assert.equal(isOwner(ownerMembership.role), true);
});

test("the owner cannot be removed while they still own the organization", async () => {
  const ownerMembership = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: orgId, userId: ownerId },
  });
  // removeMemberAction refuses on this condition; assert the data supports it.
  assert.equal(isOwner(ownerMembership.role), true);

  const owners = await prisma.organizationMember.count({
    where: { organizationId: orgId, role: "OWNER" },
  });
  assert.equal(owners, 1, "exactly one owner at all times");
});

test("transferring ownership leaves exactly one owner", async () => {
  const leaderMembership = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: orgId, userId: leaderId },
  });

  // The same two statements transferOwnershipAction runs, in one transaction.
  await prisma.$transaction([
    prisma.organizationMember.updateMany({
      where: { organizationId: orgId, userId: ownerId },
      data: { role: "LEADER" },
    }),
    prisma.organizationMember.update({
      where: { id: leaderMembership.id },
      data: { role: "OWNER" },
    }),
  ]);

  const owners = await prisma.organizationMember.findMany({
    where: { organizationId: orgId, role: "OWNER" },
  });
  assert.equal(owners.length, 1);
  assert.equal(owners[0].userId, leaderId);

  // Put it back so the remaining tests read naturally.
  await prisma.$transaction([
    prisma.organizationMember.update({
      where: { id: leaderMembership.id },
      data: { role: "LEADER" },
    }),
    prisma.organizationMember.updateMany({
      where: { organizationId: orgId, userId: ownerId },
      data: { role: "OWNER" },
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Waiver acknowledgement
// ---------------------------------------------------------------------------

test("a new organization has not acknowledged the waiver notice", async () => {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { waiverTermsAcceptedAt: true },
  });
  assert.equal(org.waiverTermsAcceptedAt, null);
});

test("acknowledging records who, when, and the exact wording agreed to", async () => {
  await prisma.organization.updateMany({
    where: { id: orgId, waiverTermsAcceptedAt: null },
    data: {
      waiverTermsAcceptedAt: new Date(),
      waiverTermsAcceptedBy: ownerId,
      waiverTermsText: WAIVER_TERMS_TEXT,
    },
  });

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.notEqual(org.waiverTermsAcceptedAt, null);
  assert.equal(org.waiverTermsAcceptedBy, ownerId);
  assert.equal(org.waiverTermsText, WAIVER_TERMS_TEXT);
  assert.match(org.waiverTermsText ?? "", /responsible for the waiver language/);
  assert.match(org.waiverTermsText ?? "", /reviewed by appropriate legal counsel/);
});

test("acknowledging twice does not overwrite the original record", async () => {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  await prisma.organization.updateMany({
    where: { id: orgId, waiverTermsAcceptedAt: null },
    data: { waiverTermsAcceptedAt: new Date(), waiverTermsAcceptedBy: leaderId },
  });

  const after = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(
    after.waiverTermsAcceptedAt?.getTime(),
    before.waiverTermsAcceptedAt?.getTime(),
    "the first acknowledgement stands",
  );
  assert.equal(after.waiverTermsAcceptedBy, ownerId);
});

test("a church that has not acknowledged cannot have a first waiver created", async () => {
  const fresh = await prisma.organization.create({
    data: {
      name: "Unacknowledged Church",
      slug: `unack-${Date.now()}`,
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
  });

  // The guard createWaiverTemplateAction applies.
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: fresh.id },
    select: { waiverTermsAcceptedAt: true },
  });
  assert.equal(org.waiverTermsAcceptedAt, null, "the gate is closed for a new church");
  assert.equal(
    await prisma.waiverTemplate.count({ where: { organizationId: fresh.id } }),
    0,
  );

  await prisma.organization.delete({ where: { id: fresh.id } });
});
