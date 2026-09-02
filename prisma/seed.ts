/**
 * Development seed: one church, one trip, 42 people, a real waiver template,
 * vehicles, rooms, and a schedule. Enough to exercise every screen.
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

const FIRST_NAMES = [
  "Maddie", "Jordan", "Ava", "Caleb", "Sophia", "Eli", "Grace", "Owen", "Lily", "Micah",
  "Ruby", "Levi", "Nora", "Asher", "Hazel", "Silas", "Ivy", "Josiah", "Emery", "Judah",
  "Cora", "Ezra", "Nova", "Tobias", "Wren", "Beau", "Della", "Amos", "Elise", "Rhett",
  "Marlowe", "Cyrus", "Talia", "Jonah", "Sadie",
];
const LAST_NAMES = [
  "Ellis", "Nguyen", "Rivera", "Bennett", "Okafor", "Hayes", "Delgado", "Kim", "Brooks",
  "Alvarez", "Whitfield", "Park", "Sandoval", "Mercer", "Boone", "Ellis", "Nguyen", "Hayes",
];

const LEADERS = [
  { first: "Dana", last: "Reed", phone: "615-555-0180" },
  { first: "Marcus", last: "Whitfield", phone: "615-555-0181" },
  { first: "Priya", last: "Raman", phone: "615-555-0182" },
  { first: "Tom", last: "Boone", phone: "615-555-0183" },
  { first: "Alexis", last: "Grant", phone: "615-555-0184" },
  { first: "Chris", last: "Okafor", phone: "615-555-0185" },
  { first: "Renee", last: "Salas", phone: "615-555-0186" },
];

async function main() {
  const email = "leader@example.church";
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
      slug: `grace-community-${Date.now().toString(36)}`,
      city: "Franklin",
      state: "TN",
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

  // 7 leaders + 35 students = 42 people.
  for (const leader of LEADERS) {
    await prisma.attendee.create({
      data: {
        tripId: trip.id,
        firstName: leader.first,
        lastName: leader.last,
        gender: ["Dana", "Priya", "Alexis", "Renee"].includes(leader.first) ? "Female" : "Male",
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
  }

  for (let i = 0; i < 35; i += 1) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[i % LAST_NAMES.length];
    const guardianEmail = `${last.toLowerCase()}.family${Math.floor(i / 3)}@example.com`;
    const paid = i % 4 === 0 ? 150 : i % 3 === 0 ? 50 : 0;

    await prisma.attendee.create({
      data: {
        tripId: trip.id,
        firstName: first,
        lastName: last,
        gender: i % 2 === 0 ? "Female" : "Male",
        dateOfBirth: new Date(Date.UTC(2010 - (i % 4), (i % 12), ((i % 27) + 1))),
        isMinor: true,
        phone: i % 5 === 0 ? `615-555-${String(2000 + i).slice(-4)}` : null,
        emergencyContactName: i % 7 === 0 ? null : `${last} Parent`,
        emergencyContactPhone: i % 7 === 0 ? null : `615-555-${String(3000 + i).slice(-4)}`,
        emergencyContactRelation: i % 2 === 0 ? "Mother" : "Father",
        allergies: i % 6 === 0 ? "Peanuts" : null,
        medications: i % 9 === 0 ? "Inhaler as needed" : null,
        shirtSize: ["YL", "S", "M", "L", "XL"][i % 5],
        amountDue: 150,
        amountPaid: paid,
        paymentStatus: paid >= 150 ? "PAID" : paid > 0 ? "DEPOSIT_PAID" : "UNPAID",
        guardians: {
          create: {
            name: `${last} Parent`,
            email: guardianEmail,
            emailNormalized: guardianEmail,
            phone: `615-555-${String(4000 + i).slice(-4)}`,
            relationship: i % 2 === 0 ? "Mother" : "Father",
            isPrimary: true,
          },
        },
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

  await prisma.vehicle.createMany({
    data: [
      { tripId: trip.id, name: "Church Van 1", type: "Van", capacity: 15, reservedSeats: 1, driverName: "Dana Reed", driverPhone: "615-555-0180", sortOrder: 0 },
      { tripId: trip.id, name: "Church Van 2", type: "Van", capacity: 15, reservedSeats: 1, driverName: "Marcus Whitfield", driverPhone: "615-555-0181", sortOrder: 1 },
      { tripId: trip.id, name: "Rental Van", type: "Rental", capacity: 15, reservedSeats: 1, driverName: "Tom Boone", driverPhone: "615-555-0183", sortOrder: 2 },
    ],
  });

  await prisma.room.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((n) => ({
        tripId: trip.id,
        name: `Room 20${n}`,
        type: "Hotel Room",
        capacity: 4,
        designation: "FEMALE",
        requiresLeader: n <= 2,
        sortOrder: n,
      })),
      ...[1, 2, 3, 4, 5].map((n) => ({
        tripId: trip.id,
        name: `Room 30${n}`,
        type: "Hotel Room",
        capacity: 4,
        designation: "MALE",
        requiresLeader: n <= 2,
        sortOrder: 10 + n,
      })),
      { tripId: trip.id, name: "Room 401", type: "Hotel Room", capacity: 2, designation: "ANY", sortOrder: 20 },
      { tripId: trip.id, name: "Room 402", type: "Hotel Room", capacity: 2, designation: "ANY", sortOrder: 21 },
    ],
  });

  await prisma.itineraryItem.createMany({
    data: [
      { tripId: trip.id, date: start, startTime: "07:00", title: "Meet at Church", location: "Church parking lot" },
      { tripId: trip.id, date: start, startTime: "07:45", title: "Departure" },
      { tripId: trip.id, date: start, startTime: "12:00", endTime: "13:00", title: "Lunch Stop", location: "Bowling Green, KY" },
      { tripId: trip.id, date: start, startTime: "15:30", title: "Hotel Check-In" },
      { tripId: trip.id, date: start, startTime: "19:00", endTime: "21:00", title: "Evening Service" },
      { tripId: trip.id, date: end, startTime: "09:00", title: "Pack and Load" },
      { tripId: trip.id, date: end, startTime: "10:00", title: "Return Home" },
    ],
  });

  console.info("Seeded.");
  console.info(`  Sign in: ${email} / readysetamen2026`);
  console.info(`  Organization: /orgs/${organization.slug}`);
  console.info(`  Trip: /orgs/${organization.slug}/trips/${trip.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
