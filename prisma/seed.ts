/**
 * Demo seed: one church, one trip, 42 people, a real waiver template, vehicles,
 * rooms, and a schedule. Enough to exercise every screen immediately.
 *
 * Idempotent — it removes and rebuilds the demo organization, so running it
 * twice against the same database leaves one copy, not two. It only ever
 * touches the demo account; other organizations in the database are untouched.
 *
 * Run with: npm run seed
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, sort(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/**
 * A realistic roster: families with several children on the same trip, a few
 * one-off students, a mix of medical notes, and one deliberately long name so
 * layout problems show up in seed data rather than in front of a youth pastor.
 */
const FAMILIES: { last: string; guardian: string; children: string[] }[] = [
  { last: "Mercer", guardian: "Rosa Mercer", children: ["Maddie", "Jordan", "Eli"] },
  { last: "Okafor", guardian: "Chidi Okafor", children: ["Ada", "Chinedu"] },
  { last: "Delgado", guardian: "Marisol Delgado", children: ["Sofia", "Mateo", "Lucia"] },
  { last: "Whitfield", guardian: "Karen Whitfield", children: ["Grace", "Owen"] },
  { last: "Nguyen", guardian: "Linh Nguyen", children: ["Anh", "Bao"] },
  { last: "Bennett", guardian: "Dale Bennett", children: ["Ruby", "Levi"] },
  { last: "Alvarez", guardian: "Pilar Alvarez", children: ["Micah", "Nova"] },
  { last: "Boone", guardian: "Susan Boone", children: ["Wren"] },
  { last: "Park", guardian: "Jae Park", children: ["Ivy", "Silas"] },
  { last: "Sandoval", guardian: "Ana Sandoval", children: ["Cora", "Ezra"] },
  { last: "Hayes", guardian: "Bill Hayes", children: ["Judah", "Emery"] },
  { last: "Kim", guardian: "Grace Kim", children: ["Talia"] },
  { last: "Brooks", guardian: "Tanya Brooks", children: ["Jonah", "Sadie"] },
  {
    last: "Vandenberg-Castellanos",
    guardian: "Alejandra Vandenberg-Castellanos",
    children: ["Maximiliano"],
  },
];

const SOLO_STUDENTS = [
  { first: "Beau", last: "Rivera" },
  { first: "Della", last: "Mercer" },
  { first: "Amos", last: "Hayes" },
  { first: "Elise", last: "Park" },
  { first: "Rhett", last: "Boone" },
  { first: "Marlowe", last: "Kim" },
  { first: "Cyrus", last: "Brooks" },
  { first: "Tobias", last: "Nguyen" },
  { first: "Hazel", last: "Delgado" },
  { first: "Asher", last: "Okafor" },
  { first: "Nora", last: "Bennett" },
  { first: "Josiah", last: "Alvarez" },
  { first: "Tess", last: "Whitfield" },
  { first: "Roman", last: "Sandoval" },
  { first: "Junie", last: "Rivera" },
];

const LEADERS = [
  { first: "Dana", last: "Reed", phone: "615-555-0180", gender: "Female" },
  { first: "Marcus", last: "Whitfield", phone: "615-555-0181", gender: "Male" },
  { first: "Priya", last: "Raman", phone: "615-555-0182", gender: "Female" },
  { first: "Tom", last: "Boone", phone: "615-555-0183", gender: "Male" },
  { first: "Alexis", last: "Grant", phone: "615-555-0184", gender: "Female" },
  { first: "Chris", last: "Okafor", phone: "615-555-0185", gender: "Male" },
  { first: "Renee", last: "Salas", phone: "615-555-0186", gender: "Female" },
  { first: "Victor", last: "Hollis", phone: "615-555-0187", gender: "Male" },
];

const ALLERGIES = ["Peanuts", "Bee stings", "Penicillin", "Shellfish", "Latex"];
const CONDITIONS = ["Asthma", "Type 1 diabetes", "Migraines", "Anxiety"];
const MEDICATIONS = ["Inhaler as needed", "Insulin pump", "Daily allergy tablet"];
const DIETARY = ["Vegetarian", "Gluten free", "No dairy"];

async function main() {
  const email = "leader@example.church";
  const slug = "grace-community-demo";

  // Rebuild from scratch so re-running never stacks up duplicate demo data.
  // Both cascade, so this clears the trip, roster, waivers and signatures too.
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      firstName: "Sam",
      lastName: "Carter",
      passwordHash: hashPassword("readysetamen2026"),
    },
  });

  const organization = await prisma.organization.create({
    data: {
      name: "Grace Community Church",
      slug,
      city: "Franklin",
      state: "TN",
      // The demo church has already acknowledged the waiver responsibility
      // notice, so the seeded trip has a working waiver to click through.
      waiverTermsAcceptedAt: new Date(),
      waiverTermsAcceptedBy: user.id,
      waiverTermsText:
        "Ready Set Amen provides tools to create and collect electronic waivers. Your " +
        "church is responsible for the waiver language you use and should have it " +
        "reviewed by appropriate legal counsel.",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  const waiverContent = {
    formatVersion: 1 as const,
    waiverTitle: "Release, Waiver, and Medical Authorization",
    organizationName: organization.name,
    sections: {
      intro: {
        enabled: true,
        heading: "Introduction",
        body: "This form is required for every participant traveling with Grace Community Church Student Ministry. Please read it carefully before signing.\n\nIf the participant is under 18, a parent or legal guardian must complete and sign this form.",
      },
      release: {
        enabled: true,
        heading: "Waiver / Release",
        body: "In consideration of being permitted to participate in this trip, I release Grace Community Church, its staff, and its volunteers from claims arising out of participation, except for claims caused by gross negligence or willful misconduct.\n\n**Replace this text with the language your church's attorney has approved.**",
      },
      assumptionOfRisk: {
        enabled: true,
        heading: "Assumption of Risk",
        body: "I understand that travel and group activities carry inherent risks, including but not limited to:\n- vehicle travel\n- recreational activities\n- illness or injury\n\nI accept those risks on behalf of the participant.",
      },
      medicalAuthorization: {
        enabled: true,
        heading: "Medical Authorization",
        body: "I authorize the trip leaders to consent to medical treatment for the participant if I cannot be reached, and I agree to be responsible for the cost of any treatment provided.",
      },
      photoRelease: {
        enabled: true,
        heading: "Photo / Media Release",
        body: "I give permission for photographs and video taken during this trip to be used by the church in ministry communications.",
      },
      emergencyTreatment: { enabled: false, heading: "Emergency Treatment Authorization", body: "" },
      customTerms: { enabled: false, heading: "Custom Terms", body: "" },
      footer: {
        enabled: true,
        heading: "Questions",
        body: "Contact the student ministry office at 615-555-0100 or students@example.church.",
      },
    },
    fields: [
      { key: "participantName", label: "Participant Name", type: "text" as const, enabled: true, required: true },
      { key: "participantDob", label: "Participant Date of Birth", type: "date" as const, enabled: true, required: true },
      { key: "guardianName", label: "Parent / Guardian Name", type: "text" as const, enabled: true, required: false },
      { key: "guardianEmail", label: "Parent / Guardian Email", type: "email" as const, enabled: true, required: false },
      { key: "guardianPhone", label: "Parent / Guardian Phone", type: "tel" as const, enabled: true, required: false },
      { key: "emergencyContactName", label: "Emergency Contact Name", type: "text" as const, enabled: true, required: true },
      { key: "emergencyContactPhone", label: "Emergency Contact Phone", type: "tel" as const, enabled: true, required: true },
      { key: "emergencyContactRelation", label: "Relationship to Emergency Contact", type: "text" as const, enabled: true, required: false },
      { key: "allergies", label: "Allergies", type: "textarea" as const, enabled: true, required: false },
      { key: "medicalConditions", label: "Medical Conditions", type: "textarea" as const, enabled: true, required: false },
      { key: "medications", label: "Medications", type: "textarea" as const, enabled: true, required: false },
      { key: "dietaryRestrictions", label: "Dietary Restrictions", type: "textarea" as const, enabled: true, required: false },
      { key: "insuranceProvider", label: "Insurance Provider", type: "text" as const, enabled: true, required: false },
      { key: "insurancePolicyNumber", label: "Insurance Policy Number", type: "text" as const, enabled: true, required: false },
      { key: "doctorName", label: "Doctor Name", type: "text" as const, enabled: false, required: false },
      { key: "doctorPhone", label: "Doctor Phone", type: "tel" as const, enabled: false, required: false },
      { key: "shirtSize", label: "Shirt Size", type: "text" as const, enabled: true, required: false },
    ],
    customQuestions: [],
    initials: [],
    acknowledgements: [
      { key: "readAndUnderstood", label: "I have read this document in full and I understand it.", required: true },
      { key: "guardianAuthority", label: "I confirm I am the participant, or the participant's parent or legal guardian with authority to sign.", required: true },
      { key: "photoConsent", label: "I consent to the photo and media release above.", required: false },
    ],
    requireDrawnSignature: false,
  };

  const template = await prisma.waiverTemplate.create({
    data: {
      organizationId: organization.id,
      name: "Student Ministry Release 2026",
      versions: {
        create: {
          versionNumber: 1,
          content: waiverContent,
          contentHash: createHash("sha256").update(canonical(waiverContent)).digest("hex"),
          createdBy: user.id,
        },
      },
    },
    include: { versions: true },
  });

  const start = new Date(Date.UTC(2026, 5, 14));
  const end = new Date(Date.UTC(2026, 5, 21));

  const trip = await prisma.trip.create({
    data: {
      organizationId: organization.id,
      name: "Summer Mission Trip",
      destination: "Nashville, TN",
      startDate: start,
      endDate: end,
      departureLocation: "Church parking lot",
      description: "Serving with local ministries and a nightly student service.",
      costPerPerson: 150,
      depositAmount: 50,
      depositDueDate: new Date(Date.UTC(2026, 3, 1)),
      finalPaymentDueDate: new Date(Date.UTC(2026, 5, 1)),
      tasks: {
        create: [
          "Collect Waivers",
          "Collect Other Forms",
          "Collect Payments",
          "Confirm Transportation",
          "Confirm Drivers",
          "Confirm Lodging",
          "Confirm Registration",
          "Prepare Emergency Information",
          "Pack First Aid Kit",
          "Leader Meeting",
          "Prepare Snacks",
          "Final Headcount Setup",
        ].map((title, index) => ({ title, isDefault: true, sortOrder: index })).concat([
          {
            title: "Pray Over The Group",
            isDefault: true,
            sortOrder: 99,
          } as never,
        ]),
      },
      documentRequirements: {
        create: [
          { name: "Insurance Card", required: true, sortOrder: 0 },
          { name: "Conference Registration", required: true, sortOrder: 1 },
          { name: "Medical Form", required: false, sortOrder: 2 },
          { name: "Permission Slip", required: false, sortOrder: 3 },
        ],
      },
      leaderAssignments: {
        create: [
          { role: "Trip Leader", required: true, sortOrder: 0 },
          { role: "Assistant Leader", sortOrder: 1 },
          { role: "Medication Coordinator", sortOrder: 2 },
          { role: "Headcount Leader", sortOrder: 3 },
          { role: "Emergency Contact Lead", sortOrder: 4 },
        ],
      },
      prayerFocuses: {
        create: [
          { text: "Safe travel", sortOrder: 0 },
          { text: "Unity among our students", sortOrder: 1 },
          { text: "Students responding to preaching", sortOrder: 2 },
        ],
      },
    },
  });

  await prisma.task.updateMany({
    where: { tripId: trip.id, title: "Pray Over The Group" },
    data: { isPrayerStep: true, description: "Take time with your leaders to pray over every person, the travel, the services, the ministry, and what God wants to accomplish through this trip." },
  });

  // 8 leaders + 42 students = 50 people.
  const leaderIds: string[] = [];
  for (const leader of LEADERS) {
    const created = await prisma.attendee.create({
      data: {
        tripId: trip.id,
        firstName: leader.first,
        lastName: leader.last,
        gender: leader.gender,
        isMinor: false,
        isLeader: true,
        phone: leader.phone,
        email: `${leader.first.toLowerCase()}@example.church`,
        emergencyContactName: "Church Office",
        emergencyContactPhone: "615-555-0100",
        emergencyContactRelation: "Employer",
        amountDue: 150,
        amountPaid: 150,
        paymentStatus: "PAID",
      },
    });
    leaderIds.push(created.id);
  }

  const students: { first: string; last: string; guardian: string | null }[] = [];
  for (const family of FAMILIES) {
    for (const child of family.children) {
      students.push({ first: child, last: family.last, guardian: family.guardian });
    }
  }
  for (const solo of SOLO_STUDENTS) {
    students.push({ first: solo.first, last: solo.last, guardian: null });
  }

  let index = 0;
  for (const student of students.slice(0, 42)) {
    const i = index++;
    // Payments deliberately messy: some paid in full, some deposit only, some
    // untouched, one scholarship.
    const paid = i % 7 === 0 ? 150 : i % 3 === 0 ? 50 : i % 5 === 0 ? 100 : 0;
    const scholarship = i === 11;
    // A few students are missing an emergency contact so the dashboard has
    // something real to complain about.
    const missingEmergency = i % 13 === 0;

    const guardianEmail = student.guardian
      ? `${student.guardian.split(" ")[0].toLowerCase()}.${student.last.toLowerCase().replace(/[^a-z]/g, "")}@example.com`
      : null;

    await prisma.attendee.create({
      data: {
        tripId: trip.id,
        firstName: student.first,
        lastName: student.last,
        gender: i % 2 === 0 ? "Female" : "Male",
        // Students are 12-17 relative to the trip year, so nobody is a "minor" at 19.
        dateOfBirth: new Date(Date.UTC(2026 - 12 - (i % 6), i % 12, (i % 27) + 1)),
        isMinor: true,
        phone: i % 4 === 0 ? `615-555-${String(2000 + i).slice(-4)}` : null,
        emergencyContactName: missingEmergency ? null : (student.guardian ?? `${student.last} Parent`),
        emergencyContactPhone: missingEmergency ? null : `615-555-${String(3000 + i).slice(-4)}`,
        emergencyContactRelation: i % 2 === 0 ? "Mother" : "Father",
        allergies: i % 6 === 0 ? ALLERGIES[i % ALLERGIES.length] : null,
        medicalConditions: i % 9 === 0 ? CONDITIONS[i % CONDITIONS.length] : null,
        medications: i % 9 === 0 ? MEDICATIONS[i % MEDICATIONS.length] : null,
        dietaryRestrictions: i % 8 === 0 ? DIETARY[i % DIETARY.length] : null,
        insuranceProvider: i % 10 === 0 ? "Blue Cross" : null,
        shirtSize: ["YL", "S", "M", "L", "XL"][i % 5],
        amountDue: 150,
        amountPaid: scholarship ? 0 : paid,
        paymentStatus: scholarship
          ? "SCHOLARSHIP"
          : paid >= 150
            ? "PAID"
            : paid > 0
              ? "PARTIAL"
              : "UNPAID",
        ...(guardianEmail
          ? {
              guardians: {
                create: {
                  name: student.guardian!,
                  email: guardianEmail,
                  emailNormalized: guardianEmail,
                  phone: `615-555-${String(4000 + i).slice(-4)}`,
                  relationship: i % 2 === 0 ? "Mother" : "Father",
                  isPrimary: true,
                },
              },
            }
          : {}),
      },
    });
  }

  const requirement = await prisma.tripWaiverRequirement.create({
    data: {
      tripId: trip.id,
      versionId: template.versions[0].id,
      title: "Student Ministry Release 2026",
      appliesToAll: true,
    },
  });

  const attendees = await prisma.attendee.findMany({
    where: { tripId: trip.id },
    select: { id: true, isMinor: true },
  });
  await prisma.waiverRecipient.createMany({
    data: attendees.map((a) => ({
      requirementId: requirement.id,
      attendeeId: a.id,
      signerRole: a.isMinor ? ("GUARDIAN" as const) : ("SELF" as const),
    })),
  });

  // 7 vehicles, 52 usable seats for 50 people — tight but workable, which is
  // what a real church fleet looks like.
  await prisma.vehicle.createMany({
    data: [
      { tripId: trip.id, name: "Church Van 1", type: "Van", capacity: 15, reservedSeats: 1, driverName: "Dana Reed", driverPhone: "615-555-0180", sortOrder: 0 },
      { tripId: trip.id, name: "Church Van 2", type: "Van", capacity: 15, reservedSeats: 1, driverName: "Marcus Whitfield", driverPhone: "615-555-0181", sortOrder: 1 },
      { tripId: trip.id, name: "Rental Van", type: "Rental", capacity: 12, reservedSeats: 1, driverName: "Tom Boone", driverPhone: "615-555-0183", sortOrder: 2 },
      { tripId: trip.id, name: "Pastor's Suburban", type: "SUV", capacity: 7, reservedSeats: 0, driverName: "Chris Okafor", driverPhone: "615-555-0185", sortOrder: 3 },
      { tripId: trip.id, name: "Grant Family SUV", type: "SUV", capacity: 6, reservedSeats: 0, driverName: "Alexis Grant", driverPhone: "615-555-0184", sortOrder: 4 },
      { tripId: trip.id, name: "Salas Car", type: "Car", capacity: 4, reservedSeats: 0, driverName: "Renee Salas", driverPhone: "615-555-0186", sortOrder: 5 },
      { tripId: trip.id, name: "Gear Truck", type: "Other", capacity: 3, reservedSeats: 1, notes: "Luggage and sound gear", sortOrder: 6 },
    ],
  });

  // 14 rooms: 6 female, 6 male, 2 leader rooms.
  await prisma.room.createMany({
    data: [
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        tripId: trip.id,
        name: `Room 20${n}`,
        type: "Hotel Room",
        capacity: 4,
        designation: "FEMALE",
        requiresLeader: n <= 2,
        sortOrder: n,
      })),
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        tripId: trip.id,
        name: `Room 30${n}`,
        type: "Hotel Room",
        capacity: 4,
        designation: "MALE",
        requiresLeader: n <= 2,
        sortOrder: 10 + n,
      })),
      { tripId: trip.id, name: "Room 401", type: "Hotel Room", capacity: 2, designation: "FEMALE", notes: "Leaders", sortOrder: 20 },
      { tripId: trip.id, name: "Room 402", type: "Hotel Room", capacity: 2, designation: "MALE", notes: "Leaders", sortOrder: 21 },
    ],
  });

  // Four days of schedule so "what's today?" is a real question.
  const day = (offset: number) =>
    new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);

  await prisma.itineraryItem.createMany({
    data: [
      { tripId: trip.id, date: day(0), startTime: "06:30", title: "Meet at Church", location: "Church parking lot", description: "Bags loaded before 7:00." },
      { tripId: trip.id, date: day(0), startTime: "07:00", title: "Load Vehicles" },
      { tripId: trip.id, date: day(0), startTime: "07:45", title: "Departure", description: "Headcount before we pull out." },
      { tripId: trip.id, date: day(0), startTime: "12:00", endTime: "13:00", title: "Lunch Stop", location: "Bowling Green, KY" },
      { tripId: trip.id, date: day(0), startTime: "15:30", title: "Hotel Check-In", location: "Downtown Inn" },
      { tripId: trip.id, date: day(0), startTime: "18:00", endTime: "19:00", title: "Dinner" },
      { tripId: trip.id, date: day(0), startTime: "19:30", endTime: "21:30", title: "Opening Service" },
      { tripId: trip.id, date: day(0), startTime: "23:00", title: "Hotel Curfew" },

      { tripId: trip.id, date: day(1), startTime: "07:30", title: "Breakfast" },
      { tripId: trip.id, date: day(1), startTime: "09:00", endTime: "12:00", title: "Serve Project — Food Bank", location: "Second Harvest" },
      { tripId: trip.id, date: day(1), startTime: "12:30", title: "Lunch" },
      { tripId: trip.id, date: day(1), startTime: "14:00", endTime: "16:30", title: "Free Time", location: "Hotel" },
      { tripId: trip.id, date: day(1), startTime: "19:00", endTime: "21:30", title: "Evening Service" },

      { tripId: trip.id, date: day(2), startTime: "07:30", title: "Breakfast" },
      { tripId: trip.id, date: day(2), startTime: "09:00", endTime: "12:00", title: "Serve Project — Neighborhood Cleanup" },
      { tripId: trip.id, date: day(2), startTime: "14:00", title: "Youth Activity", location: "City park" },
      { tripId: trip.id, date: day(2), startTime: "19:00", endTime: "21:30", title: "Evening Service" },

      { tripId: trip.id, date: day(3), startTime: "08:00", title: "Pack and Load" },
      { tripId: trip.id, date: day(3), startTime: "09:00", title: "Hotel Check-Out" },
      { tripId: trip.id, date: day(3), startTime: "10:00", title: "Return Home", description: "Final headcount before departure." },
    ],
  });

  // A handful of waivers already signed, so the dashboard shows real progress
  // against real outstanding work.
  const toSign = await prisma.waiverRecipient.findMany({
    where: { requirementId: requirement.id },
    include: { attendee: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } } },
    orderBy: { id: "asc" },
    take: 16,
  });

  for (const recipient of toSign) {
    const snapshot = {
      formatVersion: 1 as const,
      templateId: template.id,
      versionId: template.versions[0].id,
      versionNumber: 1,
      content: waiverContent,
      capturedAt: new Date().toISOString(),
    };
    const signerName =
      recipient.signerRole === "GUARDIAN"
        ? `${recipient.attendee.lastName} Parent`
        : `${recipient.attendee.firstName} ${recipient.attendee.lastName}`;

    await prisma.signedWaiver.create({
      data: {
        recipientId: recipient.id,
        attendeeId: recipient.attendee.id,
        versionId: template.versions[0].id,
        documentSnapshot: snapshot,
        documentHash: createHash("sha256").update(canonical(snapshot)).digest("hex"),
        participantNameAtSigning: `${recipient.attendee.firstName} ${recipient.attendee.lastName}`,
        participantDateOfBirth: recipient.attendee.dateOfBirth,
        signerName,
        signerRole: recipient.signerRole,
        signerRelationship: recipient.signerRole === "GUARDIAN" ? "Mother" : "Self",
        signerEmail: null,
        typedSignature: signerName,
        signedAt: new Date(Date.now() - Math.floor(Math.random() * 12) * 86_400_000),
        ipAddress: "203.0.113.42",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
        consentToElectronicRecords: true,
        consentText:
          "I agree to sign this document electronically. I understand that my electronic " +
          "signature is the legal equivalent of my handwritten signature, that this " +
          "record will be provided to me electronically, and that I may request a paper " +
          "copy from the organization at any time.",
        acknowledgements: [
          { key: "readAndUnderstood", label: "I have read this document in full and I understand it.", checked: true },
          { key: "guardianAuthority", label: "I confirm I am the participant, or the participant's parent or legal guardian with authority to sign.", checked: true },
          { key: "photoConsent", label: "I consent to the photo and media release above.", checked: true },
        ],
        responses: {
          create: [
            { fieldKey: "emergencyContactName", fieldLabel: "Emergency Contact Name", value: `${recipient.attendee.lastName} Parent` },
            { fieldKey: "emergencyContactPhone", fieldLabel: "Emergency Contact Phone", value: "615-555-0150" },
          ],
        },
      },
    });

    await prisma.waiverRecipient.update({
      where: { id: recipient.id },
      data: { status: "SIGNED", signedAt: new Date(), sentAt: new Date(Date.now() - 86_400_000) },
    });
  }

  // A few more have been sent but not signed, and a couple only viewed.
  const sentOnly = await prisma.waiverRecipient.findMany({
    where: { requirementId: requirement.id, status: "NOT_SENT" },
    orderBy: { id: "asc" },
    take: 9,
  });
  for (const [i, recipient] of sentOnly.entries()) {
    await prisma.waiverRecipient.update({
      where: { id: recipient.id },
      data:
        i < 3
          ? { status: "VIEWED", sentAt: new Date(Date.now() - 172_800_000), viewedAt: new Date(Date.now() - 86_400_000) }
          : { status: "SENT", sentAt: new Date(Date.now() - 172_800_000) },
    });
  }

  // Some preparation already done.
  await prisma.task.updateMany({
    where: { tripId: trip.id, title: { in: ["Confirm Transportation", "Confirm Drivers", "Confirm Lodging", "Leader Meeting"] } },
    data: { status: "DONE", completedAt: new Date() },
  });
  await prisma.task.updateMany({
    where: { tripId: trip.id, title: "Collect Waivers" },
    data: { status: "IN_PROGRESS" },
  });

  // Fill the leader roles so the trip looks like someone is actually running it.
  const leaderRoleNames = ["Trip Leader", "Assistant Leader", "Medication Coordinator", "Headcount Leader"];
  const roles = await prisma.leaderAssignment.findMany({
    where: { tripId: trip.id, role: { in: leaderRoleNames } },
  });
  for (const [i, role] of roles.entries()) {
    await prisma.leaderAssignment.update({
      where: { id: role.id },
      data: { attendeeId: leaderIds[i % leaderIds.length] },
    });
  }

  const base = (process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000")).replace(/\/+$/, "");

  console.info("Seeded.");
  console.info(`  Sign in at ${base}/login`);
  console.info(`  Email:    ${email}`);
  console.info(`  Password: readysetamen2026`);
  console.info(`  Trip:     ${base}/orgs/${organization.slug}/trips/${trip.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
