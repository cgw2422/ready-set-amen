import { prisma } from "@/lib/db";
import { generateToken, hashDocument, hashPassword } from "@/lib/crypto";
import { emptyContent, type WaiverContent } from "@/lib/waiver-content";
import {
  issueSigningLink,
  markSigningLinkViewed,
  recordSignature,
  syncWaiverRecipients,
} from "@/lib/waiver-service";
import { WAIVER_TERMS_TEXT } from "@/lib/legal";
import {
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_OWNER_EMAIL,
  DEMO_WAIVER_NOTICE,
  demoTripName,
  demoTripStart,
} from "@/lib/demo/constants";
import {
  DEMO_ALLERGIES,
  DEMO_CONDITIONS,
  DEMO_DIETARY,
  DEMO_DOCUMENTS,
  DEMO_FAMILIES,
  DEMO_HEADCOUNTS,
  DEMO_ITINERARY,
  DEMO_LEADER_ROLES,
  DEMO_LEADERS,
  DEMO_MEDICATIONS,
  DEMO_PRAYER_FOCUSES,
  DEMO_ROOMS,
  DEMO_SOLO_STUDENTS,
  DEMO_TASKS,
  DEMO_TRIP,
  DEMO_VEHICLES,
} from "@/lib/demo/data";

/**
 * The demo's deliberate imperfections.
 *
 * A demo where everything is finished proves nothing. These numbers produce the
 * "almost ready" state the dashboard is designed to surface, and completing
 * them by hand during a demonstration walks the trip to READY. SET. AMEN.
 */
const SHORTFALL = {
  unsignedWaivers: 4,
  missingEmergencyContacts: 2,
  unassignedToVehicle: 1,
  unassignedToRoom: 2,
  incompleteTasks: 2,
  unfilledLeaderRoles: 2,
  /** Attendees who owe the full fee, and those who have paid a deposit only. */
  unpaid: 5,
  partiallyPaid: 2,
  scholarships: 3,
  /** Completed count per required document, in DEMO_DOCUMENTS order. */
  documentsComplete: [46, 41, 33],
};

export type DemoSeedResult = {
  organizationId: string;
  organizationSlug: string;
  tripId: string;
  tripName: string;
  ownerEmail: string;
  /** Only set when this run generated a password; never read back afterwards. */
  generatedPassword?: string;
  counts: Record<string, number>;
};

function demoWaiverContent(): WaiverContent {
  const content = emptyContent(DEMO_ORG_NAME, "Participant Release and Medical Authorization");

  content.sections.intro.enabled = true;
  content.sections.intro.body =
    `${DEMO_WAIVER_NOTICE}\n\n` +
    "This form is required for every participant travelling with Ready Set Amen Demo Church to " +
    "the Ohio Youth Convention. Please read it carefully before signing.\n\n" +
    "If the participant is under 18, a parent or legal guardian must complete and sign.";

  content.sections.release.enabled = true;
  content.sections.release.body =
    "**Sample wording — not legal advice.** In consideration of being permitted to participate in " +
    "this trip, I release the organization, its staff and its volunteers from claims arising out " +
    "of participation, except for claims caused by gross negligence or wilful misconduct.\n\n" +
    "*A real church replaces this section entirely with language its own attorney has approved.*";

  content.sections.assumptionOfRisk.enabled = true;
  content.sections.assumptionOfRisk.body =
    "I understand that travel and group activities carry inherent risks, including but not limited to:\n" +
    "- vehicle travel\n- recreational and service activities\n- illness or injury\n\n" +
    "I accept those risks on behalf of the participant.";

  content.sections.medicalAuthorization.enabled = true;
  content.sections.medicalAuthorization.body =
    "I authorize the trip leaders to consent to medical treatment for the participant if I cannot " +
    "be reached, and I agree to be responsible for the cost of any treatment provided.";

  content.sections.photoRelease.enabled = true;
  content.sections.photoRelease.body =
    "I give permission for photographs and video taken during this trip to be used by the church " +
    "in ministry communications.";

  content.sections.footer.enabled = true;
  content.sections.footer.body =
    "Questions? Contact the student ministry office at 614-555-0100.\n\n" + DEMO_WAIVER_NOTICE;

  content.acknowledgements = [
    { key: "readAndUnderstood", label: "I have read this document in full and I understand it.", required: true },
    {
      key: "guardianAuthority",
      label:
        "I confirm I am the participant, or the participant's parent or legal guardian with authority to sign.",
      required: true,
    },
    { key: "photoConsent", label: "I consent to the photo and media release above.", required: false },
  ];

  for (const field of content.fields) {
    field.enabled = [
      "participantName",
      "participantDob",
      "guardianName",
      "guardianEmail",
      "guardianPhone",
      "emergencyContactName",
      "emergencyContactPhone",
      "emergencyContactRelation",
      "allergies",
      "medicalConditions",
      "medications",
      "dietaryRestrictions",
      "shirtSize",
    ].includes(field.key);
    field.required = ["participantName", "emergencyContactName", "emergencyContactPhone"].includes(
      field.key,
    );
  }

  return content;
}

/**
 * Finds the demo organization, refusing to proceed if the slug belongs to a
 * real church. This is the guard every destructive path goes through.
 */
export async function findDemoOrganization() {
  const existing = await prisma.organization.findUnique({
    where: { slug: DEMO_ORG_SLUG },
    select: { id: true, isDemo: true, name: true },
  });
  if (!existing) return null;
  if (!existing.isDemo) {
    throw new Error(
      `Refusing to continue: an organization named "${existing.name}" already uses the slug ` +
        `"${DEMO_ORG_SLUG}" and is NOT marked as demo data. Nothing has been changed.`,
    );
  }
  return existing;
}

/** Deletes the demo organization — and only ever the demo organization. */
export async function deleteDemoOrganization(): Promise<boolean> {
  const demo = await findDemoOrganization();
  if (!demo) return false;

  // Delete by id, after the isDemo check above. A slug-based or name-based
  // delete would be one typo away from removing a real church.
  await prisma.organization.delete({ where: { id: demo.id } });
  return true;
}

export async function seedDemoOrganization(options: {
  password?: string;
}): Promise<DemoSeedResult> {
  const existing = await findDemoOrganization();
  if (existing) {
    throw new Error("The demo organization already exists. Run the reset command instead.");
  }

  let generatedPassword: string | undefined;
  const password = options.password ?? (generatedPassword = `demo-${generateToken(9)}`);

  // --- owner ---------------------------------------------------------------
  const owner = await prisma.user.upsert({
    where: { email: DEMO_OWNER_EMAIL },
    create: {
      email: DEMO_OWNER_EMAIL,
      firstName: "Jamie",
      lastName: "Rivera",
      passwordHash: await hashPassword(password),
    },
    update: { passwordHash: await hashPassword(password) },
    select: { id: true },
  });

  const organization = await prisma.organization.create({
    data: {
      name: DEMO_ORG_NAME,
      slug: DEMO_ORG_SLUG,
      city: "Columbus",
      state: "OH",
      isDemo: true,
      waiverTermsAcceptedAt: new Date(),
      waiverTermsAcceptedBy: owner.id,
      waiverTermsText: WAIVER_TERMS_TEXT,
      members: { create: { userId: owner.id, role: "OWNER" } },
    },
    select: { id: true },
  });

  // --- trip ----------------------------------------------------------------
  const start = demoTripStart();
  const tripName = demoTripName(start);
  const end = new Date(start.getTime() + 3 * 86_400_000);

  const trip = await prisma.trip.create({
    data: {
      organizationId: organization.id,
      name: tripName,
      destination: DEMO_TRIP.destination,
      startDate: start,
      endDate: end,
      departureLocation: DEMO_TRIP.departureLocation,
      description: DEMO_TRIP.description,
      costPerPerson: DEMO_TRIP.costPerPerson,
      depositAmount: DEMO_TRIP.depositAmount,
      depositDueDate: new Date(start.getTime() - 45 * 86_400_000),
      finalPaymentDueDate: new Date(start.getTime() - 14 * 86_400_000),
      tasks: {
        create: [
          ...DEMO_TASKS.map((title, index) => ({ title, isDefault: true, sortOrder: index })),
          {
            title: "Pray Over The Group",
            description:
              "Take time with your leaders to pray over every person, the travel, the services, the ministry, and what God wants to accomplish through this trip.",
            isDefault: true,
            isPrayerStep: true,
            sortOrder: 99,
          },
        ],
      },
      documentRequirements: {
        create: DEMO_DOCUMENTS.map((doc, index) => ({
          name: doc.name,
          description: doc.description,
          required: doc.required,
          sortOrder: index,
        })),
      },
      leaderAssignments: {
        create: DEMO_LEADER_ROLES.map((r, index) => ({
          role: r.role,
          required: r.required,
          sortOrder: index,
        })),
      },
      prayerFocuses: {
        create: DEMO_PRAYER_FOCUSES.map((text, index) => ({ text, sortOrder: index })),
      },
    },
    select: { id: true },
  });

  // --- people --------------------------------------------------------------
  const leaderIds: string[] = [];
  for (const [i, leader] of DEMO_LEADERS.entries()) {
    const created = await prisma.attendee.create({
      data: {
        tripId: trip.id,
        firstName: leader.first,
        lastName: leader.last,
        gender: leader.gender,
        isMinor: false,
        isLeader: true,
        phone: leader.phone,
        email: `${leader.first.toLowerCase()}.${leader.last.toLowerCase()}@example.com`,
        emergencyContactName: "Church Office",
        emergencyContactPhone: "614-555-0100",
        emergencyContactRelation: "Employer",
        shirtSize: ["M", "L", "XL"][i % 3],
        amountDue: DEMO_TRIP.costPerPerson,
        amountPaid: DEMO_TRIP.costPerPerson,
        paymentStatus: "PAID",
      },
      select: { id: true },
    });
    leaderIds.push(created.id);
  }

  const students: { first: string; last: string; guardian: string; relationship: string }[] = [];
  for (const family of DEMO_FAMILIES) {
    for (const child of family.children) {
      students.push({
        first: child,
        last: family.last,
        guardian: family.guardian,
        relationship: family.guardianRelationship,
      });
    }
  }
  for (const solo of DEMO_SOLO_STUDENTS) {
    students.push({ first: solo.first, last: solo.last, guardian: solo.guardian, relationship: "Parent" });
  }

  const studentIds: string[] = [];
  const missingEmergencyIds: string[] = [];
  for (const [i, student] of students.entries()) {
    const guardianEmail = `${student.guardian.split(" ")[0].toLowerCase()}.${student.last
      .toLowerCase()
      .replace(/[^a-z]/g, "")}@example.com`;

    // Payments: a realistic mixture rather than a tidy one.
    const scholarship = i < SHORTFALL.scholarships;
    const unpaid = !scholarship && i >= SHORTFALL.scholarships && i < SHORTFALL.scholarships + SHORTFALL.unpaid;
    const partial =
      !scholarship &&
      !unpaid &&
      i >= SHORTFALL.scholarships + SHORTFALL.unpaid &&
      i < SHORTFALL.scholarships + SHORTFALL.unpaid + SHORTFALL.partiallyPaid;

    const amountDue = scholarship ? 0 : DEMO_TRIP.costPerPerson;
    const amountPaid = scholarship ? 0 : unpaid ? 0 : partial ? 70 : DEMO_TRIP.costPerPerson;

    // The two attendees missing an emergency contact are the ones the dashboard
    // will name.
    const missingEmergency = i >= students.length - SHORTFALL.missingEmergencyContacts;

    const created = await prisma.attendee.create({
      data: {
        tripId: trip.id,
        firstName: student.first,
        lastName: student.last,
        gender: i % 2 === 0 ? "Female" : "Male",
        dateOfBirth: new Date(Date.UTC(2026 - 12 - (i % 6), i % 12, (i % 27) + 1)),
        isMinor: true,
        phone: i % 4 === 0 ? `614-555-${String(2000 + i).slice(-4)}` : null,
        emergencyContactName: missingEmergency ? null : student.guardian,
        emergencyContactPhone: missingEmergency ? null : `614-555-${String(3000 + i).slice(-4)}`,
        emergencyContactRelation: missingEmergency ? null : student.relationship,
        allergies: i % 7 === 0 ? DEMO_ALLERGIES[i % DEMO_ALLERGIES.length] : null,
        medicalConditions: i % 9 === 0 ? DEMO_CONDITIONS[i % DEMO_CONDITIONS.length] : null,
        medications: i % 9 === 0 ? DEMO_MEDICATIONS[i % DEMO_MEDICATIONS.length] : null,
        dietaryRestrictions: i % 8 === 0 ? DEMO_DIETARY[i % DEMO_DIETARY.length] : null,
        insuranceProvider: i % 10 === 0 ? "Buckeye Health" : null,
        shirtSize: ["YL", "S", "M", "L", "XL"][i % 5],
        amountDue,
        amountPaid,
        paymentStatus: scholarship
          ? "SCHOLARSHIP"
          : unpaid
            ? "UNPAID"
            : partial
              ? "PARTIAL"
              : "PAID",
        guardians: {
          create: {
            name: student.guardian,
            email: guardianEmail,
            emailNormalized: guardianEmail,
            phone: `614-555-${String(4000 + i).slice(-4)}`,
            relationship: student.relationship,
            isPrimary: true,
          },
        },
      },
      select: { id: true },
    });
    studentIds.push(created.id);
    if (missingEmergency) missingEmergencyIds.push(created.id);
  }

  const allAttendeeIds = [...leaderIds, ...studentIds];

  // --- vehicles and seats ---------------------------------------------------
  const vehicleIds: string[] = [];
  for (const [i, vehicle] of DEMO_VEHICLES.entries()) {
    const driver = DEMO_LEADERS.findIndex((l) => `${l.first} ${l.last}` === vehicle.driver);
    const created = await prisma.vehicle.create({
      data: {
        tripId: trip.id,
        name: vehicle.name,
        type: vehicle.type,
        capacity: vehicle.capacity,
        reservedSeats: vehicle.reservedSeats,
        driverAttendeeId: driver >= 0 ? leaderIds[driver] : null,
        sortOrder: i,
      },
      select: { id: true },
    });
    vehicleIds.push(created.id);
  }

  const riders = allAttendeeIds.slice(0, allAttendeeIds.length - SHORTFALL.unassignedToVehicle);
  const capacities = DEMO_VEHICLES.map((v) => v.capacity - v.reservedSeats);
  let seatIndex = 0;
  for (const [v, capacity] of capacities.entries()) {
    for (let seat = 0; seat < capacity && seatIndex < riders.length; seat += 1) {
      await prisma.vehicleAssignment.create({
        data: { vehicleId: vehicleIds[v], attendeeId: riders[seatIndex] },
      });
      seatIndex += 1;
    }
  }

  // --- rooms ---------------------------------------------------------------
  const roomIds: string[] = [];
  for (const [i, room] of DEMO_ROOMS.entries()) {
    const created = await prisma.room.create({
      data: {
        tripId: trip.id,
        name: room.name,
        type: "Hotel Room",
        capacity: room.capacity,
        designation: room.designation,
        requiresLeader: room.requiresLeader,
        sortOrder: i,
      },
      select: { id: true },
    });
    roomIds.push(created.id);
  }

  // Fill rooms by gender so the demo looks like a real rooming list.
  const byGender = await prisma.attendee.findMany({
    where: { tripId: trip.id },
    select: { id: true, gender: true, isLeader: true },
    orderBy: [{ isLeader: "desc" }, { lastName: "asc" }],
  });
  const sleepers = byGender.slice(0, byGender.length - SHORTFALL.unassignedToRoom);
  const female = sleepers.filter((a) => a.gender === "Female").map((a) => a.id);
  const male = sleepers.filter((a) => a.gender !== "Female").map((a) => a.id);

  const leaderSet = new Set(byGender.filter((a) => a.isLeader).map((a) => a.id));

  /**
   * Chaperoned rooms get a leader each before anyone else is placed. Filling
   * sequentially would put every leader in the first room and leave the second
   * chaperoned room with a "needs an adult leader" warning — true, but a sloppy
   * thing to show a pastor.
   */
  const place = async (ids: string[], designation: string) => {
    const rooms = DEMO_ROOMS.map((r, i) => ({ ...r, id: roomIds[i] })).filter(
      (r) => r.designation === designation || r.designation === "ANY",
    );
    const remaining = [...ids];
    const spaceLeft = new Map(rooms.map((r) => [r.id, r.capacity]));

    for (const room of rooms.filter((r) => r.requiresLeader)) {
      const index = remaining.findIndex((id) => leaderSet.has(id));
      if (index === -1) continue;
      const [leaderId] = remaining.splice(index, 1);
      await prisma.roomAssignment.create({ data: { roomId: room.id, attendeeId: leaderId } });
      spaceLeft.set(room.id, (spaceLeft.get(room.id) ?? 0) - 1);
    }

    let index = 0;
    for (const room of rooms) {
      for (let spot = 0; spot < (spaceLeft.get(room.id) ?? 0) && index < remaining.length; spot += 1) {
        await prisma.roomAssignment.create({
          data: { roomId: room.id, attendeeId: remaining[index] },
        });
        index += 1;
      }
    }
  };
  await place(female, "FEMALE");
  await place(male, "MALE");

  // --- schedule ------------------------------------------------------------
  await prisma.itineraryItem.createMany({
    data: DEMO_ITINERARY.map((item) => ({
      tripId: trip.id,
      date: new Date(start.getTime() + item.day * 86_400_000),
      startTime: item.start ?? null,
      endTime: item.end ?? null,
      title: item.title,
      location: item.location ?? null,
      description: item.description ?? null,
    })),
  });

  // --- leaders, tasks -------------------------------------------------------
  const roles = await prisma.leaderAssignment.findMany({
    where: { tripId: trip.id },
    orderBy: { sortOrder: "asc" },
  });
  for (const [i, role] of roles.entries()) {
    if (i >= roles.length - SHORTFALL.unfilledLeaderRoles) continue;
    const leader = DEMO_LEADERS.findIndex((l) => l.role === role.role);
    await prisma.leaderAssignment.update({
      where: { id: role.id },
      data: { attendeeId: leaderIds[leader >= 0 ? leader : i % leaderIds.length] },
    });
  }

  const tasks = await prisma.task.findMany({
    where: { tripId: trip.id, isPrayerStep: false },
    orderBy: { sortOrder: "asc" },
  });
  for (const [i, task] of tasks.entries()) {
    if (i >= tasks.length - SHORTFALL.incompleteTasks) continue;
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "DONE", completedAt: new Date(), completedBy: owner.id },
    });
  }

  // --- documents ------------------------------------------------------------
  const requirements = await prisma.documentRequirement.findMany({
    where: { tripId: trip.id },
    orderBy: { sortOrder: "asc" },
  });
  for (const [i, requirement] of requirements.entries()) {
    const complete = requirement.required ? (SHORTFALL.documentsComplete[i] ?? 0) : 0;
    await prisma.attendeeDocumentStatus.createMany({
      data: allAttendeeIds.map((attendeeId, index) => ({
        attendeeId,
        requirementId: requirement.id,
        status: requirement.required
          ? index < complete
            ? ("COMPLETE" as const)
            : ("MISSING" as const)
          : ("NOT_REQUIRED" as const),
      })),
    });
  }

  // --- waivers, signed through the real signing path ------------------------
  const content = demoWaiverContent();
  const template = await prisma.waiverTemplate.create({
    data: {
      organizationId: organization.id,
      name: `${tripName} Release (demo)`,
      description: DEMO_WAIVER_NOTICE,
      versions: {
        create: {
          versionNumber: 1,
          content,
          contentHash: hashDocument(content),
          createdBy: owner.id,
        },
      },
    },
    include: { versions: true },
  });

  const requirementRow = await prisma.tripWaiverRequirement.create({
    data: {
      tripId: trip.id,
      versionId: template.versions[0].id,
      title: `${tripName} Release`,
      appliesToAll: true,
    },
  });
  await syncWaiverRecipients(trip.id);

  const recipients = await prisma.waiverRecipient.findMany({
    where: { requirementId: requirementRow.id },
    include: {
      attendee: {
        select: {
          firstName: true,
          lastName: true,
          isMinor: true,
          guardians: { select: { name: true, email: true, relationship: true }, take: 1 },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  // Signing copies an emergency contact from the waiver answers onto the
  // attendee — the same helpful behaviour a real parent gets. So the people we
  // deliberately left without a contact have to be among the people whose
  // waiver is still outstanding, or the dashboard's punch list would quietly
  // fix itself the moment the demo was seeded.
  const unsignedIds = new Set(
    recipients
      .filter((r) => missingEmergencyIds.includes(r.attendeeId))
      .slice(0, SHORTFALL.unsignedWaivers)
      .map((r) => r.id),
  );
  for (const recipient of [...recipients].reverse()) {
    if (unsignedIds.size >= SHORTFALL.unsignedWaivers) break;
    unsignedIds.add(recipient.id);
  }
  const toSign = recipients.filter((r) => !unsignedIds.has(r.id));
  for (const [i, recipient] of toSign.entries()) {
    const url = await issueSigningLink(recipient.id, owner.id);
    const token = url.split("/sign/")[1]!;
    const guardian = recipient.attendee.guardians[0];
    const participant = `${recipient.attendee.firstName} ${recipient.attendee.lastName}`;
    const signerName = recipient.attendee.isMinor ? (guardian?.name ?? "Parent or Guardian") : participant;

    const result = await recordSignature({
      token,
      signerName,
      signerRelationship: recipient.attendee.isMinor ? (guardian?.relationship ?? "Parent") : "Self",
      signerEmail: recipient.attendee.isMinor ? (guardian?.email ?? null) : null,
      signerPhone: null,
      typedSignature: signerName,
      drawnSignature: null,
      consentToElectronicRecords: true,
      acknowledgements: [
        { key: "readAndUnderstood", label: "I have read this document in full and I understand it.", checked: true },
        {
          key: "guardianAuthority",
          label:
            "I confirm I am the participant, or the participant's parent or legal guardian with authority to sign.",
          checked: true,
        },
        { key: "photoConsent", label: "I consent to the photo and media release above.", checked: i % 5 !== 0 },
      ],
      responses: [
        { key: "participantName", label: "Participant Name", value: participant },
        { key: "emergencyContactName", label: "Emergency Contact Name", value: guardian?.name ?? "Church Office" },
        { key: "emergencyContactPhone", label: "Emergency Contact Phone", value: `614-555-${String(3000 + i).slice(-4)}` },
        { key: "guardianName", label: "Parent / Guardian Name", value: guardian?.name ?? "" },
        { key: "guardianEmail", label: "Parent / Guardian Email", value: guardian?.email ?? "" },
      ],
      ipAddress: "203.0.113.42",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    });

    if (!result.ok) throw new Error(`Demo signing failed for ${participant}: ${result.error}`);

    // Spread the signatures over the weeks before the trip.
    await prisma.signedWaiver.updateMany({
      where: { recipientId: recipient.id },
      data: { signedAt: new Date(Date.now() - (i % 21) * 86_400_000) },
    });
  }

  // The four still outstanding: one untouched, two sent, one opened but not signed.
  const outstanding = recipients.filter((r) => unsignedIds.has(r.id));
  for (const [i, recipient] of outstanding.entries()) {
    if (i === 0) continue; // NOT_SENT
    const url = await issueSigningLink(recipient.id, owner.id);
    if (i === outstanding.length - 1) {
      const link = await prisma.waiverSigningLink.findFirstOrThrow({
        where: { recipientId: recipient.id, revokedAt: null },
        orderBy: { createdAt: "desc" },
      });
      await markSigningLinkViewed(link.id, recipient.id);
    }
    void url;
  }

  // --- headcount history ----------------------------------------------------
  for (const [i, session] of DEMO_HEADCOUNTS.entries()) {
    const created = await prisma.headcountSession.create({
      data: {
        tripId: trip.id,
        label: session.label,
        scope: "TRIP",
        startedBy: owner.id,
        expectedCount: allAttendeeIds.length,
        startedAt: new Date(Date.now() - (DEMO_HEADCOUNTS.length - i) * 3_600_000),
        closedAt: new Date(Date.now() - (DEMO_HEADCOUNTS.length - i) * 3_600_000 + 240_000),
        records: {
          create: allAttendeeIds.map((attendeeId, index) => ({
            attendeeId,
            present: index < allAttendeeIds.length - session.missing,
            markedAt: index < allAttendeeIds.length - session.missing ? new Date() : null,
          })),
        },
      },
      select: { id: true },
    });
    void created;
  }

  const counts = {
    attendees: await prisma.attendee.count({ where: { tripId: trip.id } }),
    minors: await prisma.attendee.count({ where: { tripId: trip.id, isMinor: true } }),
    leaders: await prisma.attendee.count({ where: { tripId: trip.id, isLeader: true } }),
    guardians: await prisma.guardian.count({ where: { attendee: { tripId: trip.id } } }),
    vehicles: await prisma.vehicle.count({ where: { tripId: trip.id } }),
    rooms: await prisma.room.count({ where: { tripId: trip.id } }),
    itineraryItems: await prisma.itineraryItem.count({ where: { tripId: trip.id } }),
    tasks: await prisma.task.count({ where: { tripId: trip.id } }),
    signedWaivers: await prisma.signedWaiver.count({ where: { attendee: { tripId: trip.id } } }),
    unsignedWaivers: await prisma.waiverRecipient.count({
      where: { requirement: { tripId: trip.id }, status: { not: "SIGNED" } },
    }),
    headcountSessions: await prisma.headcountSession.count({ where: { tripId: trip.id } }),
  };

  return {
    organizationId: organization.id,
    organizationSlug: DEMO_ORG_SLUG,
    tripId: trip.id,
    tripName,
    ownerEmail: DEMO_OWNER_EMAIL,
    generatedPassword,
    counts,
  };
}

/** Rebuilds the demo from scratch. Only ever touches the demo organization. */
export async function resetDemoOrganization(options: {
  password?: string;
}): Promise<DemoSeedResult> {
  await deleteDemoOrganization();
  return seedDemoOrganization(options);
}

/** Sets the demo owner's password without rebuilding any data. */
export async function setDemoPassword(password: string): Promise<void> {
  const demo = await findDemoOrganization();
  if (!demo) throw new Error("The demo organization does not exist yet. Seed it first.");

  await prisma.user.update({
    where: { email: DEMO_OWNER_EMAIL },
    data: { passwordHash: await hashPassword(password) },
  });
  // Changing the password signs the demo account out everywhere, same as a real
  // password change.
  await prisma.session.deleteMany({ where: { user: { email: DEMO_OWNER_EMAIL } } });
}
