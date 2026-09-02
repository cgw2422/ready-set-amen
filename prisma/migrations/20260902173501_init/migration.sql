-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'LEADER');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'DEPOSIT_PAID', 'PARTIAL', 'PAID', 'SCHOLARSHIP', 'WAIVED');

-- CreateEnum
CREATE TYPE "DocumentStatusValue" AS ENUM ('MISSING', 'COMPLETE', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "WaiverRecipientStatus" AS ENUM ('NOT_SENT', 'SENT', 'VIEWED', 'SIGNED', 'NOT_REQUIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('SELF', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "HeadcountScope" AS ENUM ('TRIP', 'VEHICLE', 'ROOM', 'CUSTOM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'LEADER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "departureTime" TIMESTAMP(3),
    "departureLocation" TEXT,
    "returnTime" TIMESTAMP(3),
    "description" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNING',
    "costPerPerson" DECIMAL(10,2),
    "depositAmount" DECIMAL(10,2),
    "depositDueDate" TIMESTAMP(3),
    "finalPaymentDueDate" TIMESTAMP(3),
    "readinessConfig" JSONB,
    "prayerCompletedAt" TIMESTAMP(3),
    "prayerCompletedBy" TEXT,
    "prayerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendees" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "email" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "allergies" TEXT,
    "medicalConditions" TEXT,
    "medications" TEXT,
    "dietaryRestrictions" TEXT,
    "insuranceProvider" TEXT,
    "insurancePolicyNumber" TEXT,
    "doctorName" TEXT,
    "doctorPhone" TEXT,
    "shirtSize" TEXT,
    "notes" TEXT,
    "amountDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "relationship" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendee_document_statuses" (
    "id" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" "DocumentStatusValue" NOT NULL DEFAULT 'MISSING',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendee_document_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiver_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "waiver_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_waiver_requirements" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_waiver_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_recipients" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "status" "WaiverRecipientStatus" NOT NULL DEFAULT 'NOT_SENT',
    "signerRole" "SignerRole" NOT NULL DEFAULT 'SELF',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiver_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_signing_links" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "viewedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "waiver_signing_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signed_waivers" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "documentSnapshot" JSONB NOT NULL,
    "documentHash" TEXT NOT NULL,
    "participantNameAtSigning" TEXT NOT NULL,
    "participantDateOfBirth" TIMESTAMP(3),
    "signerName" TEXT NOT NULL,
    "signerRole" "SignerRole" NOT NULL,
    "signerRelationship" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerPhone" TEXT,
    "typedSignature" TEXT NOT NULL,
    "drawnSignature" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "consentToElectronicRecords" BOOLEAN NOT NULL,
    "consentText" TEXT NOT NULL,
    "acknowledgements" JSONB NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "signed_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_field_responses" (
    "id" TEXT NOT NULL,
    "signedWaiverId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "waiver_field_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Van',
    "capacity" INTEGER NOT NULL DEFAULT 15,
    "driverAttendeeId" TEXT,
    "secondaryDriverAttendeeId" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "reservedSeats" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_assignments" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "seatNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Hotel Room',
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "designation" TEXT NOT NULL DEFAULT 'ANY',
    "requiresLeader" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_assignments" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_items" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "responsibleAttendeeId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "isPrayerStep" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leader_assignments" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "attendeeId" TEXT,
    "personName" TEXT,
    "personPhone" TEXT,
    "notes" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leader_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayer_focuses" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prayer_focuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "headcount_sessions" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scope" "HeadcountScope" NOT NULL DEFAULT 'TRIP',
    "scopeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "startedBy" TEXT,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "headcount_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "headcount_records" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "markedAt" TIMESTAMP(3),

    CONSTRAINT "headcount_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "trips_organizationId_idx" ON "trips"("organizationId");

-- CreateIndex
CREATE INDEX "attendees_tripId_idx" ON "attendees"("tripId");

-- CreateIndex
CREATE INDEX "attendees_tripId_lastName_idx" ON "attendees"("tripId", "lastName");

-- CreateIndex
CREATE INDEX "guardians_attendeeId_idx" ON "guardians"("attendeeId");

-- CreateIndex
CREATE INDEX "guardians_emailNormalized_idx" ON "guardians"("emailNormalized");

-- CreateIndex
CREATE INDEX "payment_records_attendeeId_idx" ON "payment_records"("attendeeId");

-- CreateIndex
CREATE INDEX "document_requirements_tripId_idx" ON "document_requirements"("tripId");

-- CreateIndex
CREATE INDEX "attendee_document_statuses_requirementId_idx" ON "attendee_document_statuses"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "attendee_document_statuses_attendeeId_requirementId_key" ON "attendee_document_statuses"("attendeeId", "requirementId");

-- CreateIndex
CREATE INDEX "waiver_templates_organizationId_idx" ON "waiver_templates"("organizationId");

-- CreateIndex
CREATE INDEX "waiver_template_versions_templateId_idx" ON "waiver_template_versions"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_template_versions_templateId_versionNumber_key" ON "waiver_template_versions"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "trip_waiver_requirements_tripId_idx" ON "trip_waiver_requirements"("tripId");

-- CreateIndex
CREATE INDEX "trip_waiver_requirements_versionId_idx" ON "trip_waiver_requirements"("versionId");

-- CreateIndex
CREATE INDEX "waiver_recipients_attendeeId_idx" ON "waiver_recipients"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_recipients_requirementId_attendeeId_key" ON "waiver_recipients"("requirementId", "attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_signing_links_tokenHash_key" ON "waiver_signing_links"("tokenHash");

-- CreateIndex
CREATE INDEX "waiver_signing_links_recipientId_idx" ON "waiver_signing_links"("recipientId");

-- CreateIndex
CREATE INDEX "waiver_signing_links_expiresAt_idx" ON "waiver_signing_links"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "signed_waivers_recipientId_key" ON "signed_waivers"("recipientId");

-- CreateIndex
CREATE INDEX "signed_waivers_attendeeId_idx" ON "signed_waivers"("attendeeId");

-- CreateIndex
CREATE INDEX "signed_waivers_versionId_idx" ON "signed_waivers"("versionId");

-- CreateIndex
CREATE INDEX "waiver_field_responses_signedWaiverId_idx" ON "waiver_field_responses"("signedWaiverId");

-- CreateIndex
CREATE INDEX "vehicles_tripId_idx" ON "vehicles"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_assignments_attendeeId_key" ON "vehicle_assignments"("attendeeId");

-- CreateIndex
CREATE INDEX "vehicle_assignments_vehicleId_idx" ON "vehicle_assignments"("vehicleId");

-- CreateIndex
CREATE INDEX "rooms_tripId_idx" ON "rooms"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "room_assignments_attendeeId_key" ON "room_assignments"("attendeeId");

-- CreateIndex
CREATE INDEX "room_assignments_roomId_idx" ON "room_assignments"("roomId");

-- CreateIndex
CREATE INDEX "itinerary_items_tripId_date_idx" ON "itinerary_items"("tripId", "date");

-- CreateIndex
CREATE INDEX "tasks_tripId_idx" ON "tasks"("tripId");

-- CreateIndex
CREATE INDEX "leader_assignments_tripId_idx" ON "leader_assignments"("tripId");

-- CreateIndex
CREATE INDEX "prayer_focuses_tripId_idx" ON "prayer_focuses"("tripId");

-- CreateIndex
CREATE INDEX "headcount_sessions_tripId_idx" ON "headcount_sessions"("tripId");

-- CreateIndex
CREATE INDEX "headcount_records_attendeeId_idx" ON "headcount_records"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "headcount_records_sessionId_attendeeId_key" ON "headcount_records"("sessionId", "attendeeId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendee_document_statuses" ADD CONSTRAINT "attendee_document_statuses_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendee_document_statuses" ADD CONSTRAINT "attendee_document_statuses_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "document_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_templates" ADD CONSTRAINT "waiver_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_template_versions" ADD CONSTRAINT "waiver_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "waiver_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_waiver_requirements" ADD CONSTRAINT "trip_waiver_requirements_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_waiver_requirements" ADD CONSTRAINT "trip_waiver_requirements_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "waiver_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_recipients" ADD CONSTRAINT "waiver_recipients_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "trip_waiver_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_recipients" ADD CONSTRAINT "waiver_recipients_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_signing_links" ADD CONSTRAINT "waiver_signing_links_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "waiver_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_waivers" ADD CONSTRAINT "signed_waivers_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "waiver_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_waivers" ADD CONSTRAINT "signed_waivers_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_waivers" ADD CONSTRAINT "signed_waivers_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "waiver_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_field_responses" ADD CONSTRAINT "waiver_field_responses_signedWaiverId_fkey" FOREIGN KEY ("signedWaiverId") REFERENCES "signed_waivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driverAttendeeId_fkey" FOREIGN KEY ("driverAttendeeId") REFERENCES "attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_secondaryDriverAttendeeId_fkey" FOREIGN KEY ("secondaryDriverAttendeeId") REFERENCES "attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_responsibleAttendeeId_fkey" FOREIGN KEY ("responsibleAttendeeId") REFERENCES "attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_assignments" ADD CONSTRAINT "leader_assignments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_assignments" ADD CONSTRAINT "leader_assignments_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_focuses" ADD CONSTRAINT "prayer_focuses_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headcount_sessions" ADD CONSTRAINT "headcount_sessions_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headcount_records" ADD CONSTRAINT "headcount_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "headcount_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headcount_records" ADD CONSTRAINT "headcount_records_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
