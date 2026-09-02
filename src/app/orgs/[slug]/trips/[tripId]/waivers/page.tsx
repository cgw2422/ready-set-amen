import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { mailEnabled } from "@/lib/mailer";
import { displayName } from "@/lib/format";
import { Alert, Card, EmptyState, LinkButton } from "@/components/ui";
import { WaiverDashboard } from "./waiver-dashboard";
import { AssignWaiverForm } from "./assign-waiver-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waivers" };

export default async function TripWaiversPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { slug, tripId } = await params;
  const { filter } = await searchParams;
  const ctx = await requireTrip(tripId);
  const base = `/orgs/${slug}/trips/${tripId}`;

  const [requirements, templates, attendeeCount] = await Promise.all([
    prisma.tripWaiverRequirement.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        versionId: true,
        version: {
          select: {
            versionNumber: true,
            templateId: true,
            template: {
              select: {
                name: true,
                versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { versionNumber: true } },
              },
            },
          },
        },
        recipients: {
          orderBy: [{ attendee: { lastName: "asc" } }, { attendee: { firstName: "asc" } }],
          select: {
            id: true,
            status: true,
            signerRole: true,
            sentAt: true,
            viewedAt: true,
            signedAt: true,
            attendee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                preferredName: true,
                isMinor: true,
                email: true,
                guardians: { where: { isPrimary: true }, take: 1, select: { name: true, email: true } },
              },
            },
            signedWaiver: { select: { id: true } },
          },
        },
      },
    }),
    prisma.waiverTemplate.findMany({
      where: { organizationId: ctx.organization.id, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true } },
      },
    }),
    prisma.attendee.count({ where: { tripId } }),
  ]);

  const usable = templates.filter((t) => t.versions.length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Waivers</h1>
        <p className="text-sm text-navy-soft">
          Generate a secure link for each person, share it however you already talk to your group,
          and watch signatures come in.
        </p>
      </div>

      {requirements.length === 0 ? (
        <>
          <EmptyState
            title="No waiver assigned to this trip yet."
            description={
              usable.length === 0
                ? "Create a waiver in your organization's library first, then assign it here."
                : "Pick a waiver from your library and we'll set up a signing link for everyone on the roster."
            }
            action={
              usable.length === 0 ? (
                <LinkButton href={`/orgs/${slug}/waivers/new`}>Create a waiver</LinkButton>
              ) : null
            }
          />
          {usable.length > 0 ? (
            <Card className="p-4">
              <AssignWaiverForm
                tripId={tripId}
                templates={usable.map((t) => ({ id: t.id, name: t.name }))}
              />
            </Card>
          ) : null}
        </>
      ) : (
        <>
          {attendeeCount === 0 ? (
            <Alert tone="warning">
              There&rsquo;s nobody on the roster yet.{" "}
              <Link href={`${base}/people/quick-add`} className="font-semibold underline">
                Add people
              </Link>{" "}
              and they&rsquo;ll appear here automatically.
            </Alert>
          ) : null}

          {requirements.map((requirement) => (
            <WaiverDashboard
              key={requirement.id}
              tripId={tripId}
              base={base}
              requirement={{
                id: requirement.id,
                title: requirement.title,
                versionNumber: requirement.version.versionNumber,
                latestVersionNumber:
                  requirement.version.template.versions[0]?.versionNumber ??
                  requirement.version.versionNumber,
                templateId: requirement.version.templateId,
                templateName: requirement.version.template.name,
              }}
              orgSlug={slug}
              initialFilter={filter ?? "all"}
              emailAvailable={mailEnabled()}
              recipients={requirement.recipients.map((r) => ({
                id: r.id,
                status: r.status,
                signerRole: r.signerRole,
                signedWaiverId: r.signedWaiver?.id ?? null,
                attendeeId: r.attendee.id,
                name: displayName(r.attendee),
                isMinor: r.attendee.isMinor,
                contact:
                  r.signerRole === "GUARDIAN"
                    ? (r.attendee.guardians[0]?.email ?? null)
                    : (r.attendee.email ?? null),
                guardianName: r.attendee.guardians[0]?.name ?? null,
              }))}
            />
          ))}

          {usable.length > requirements.length ? (
            <Card className="p-4">
              <p className="mb-3 font-display text-base font-bold text-navy">Add another waiver</p>
              <AssignWaiverForm
                tripId={tripId}
                templates={usable
                  .filter((t) => !requirements.some((r) => r.version.templateId === t.id))
                  .map((t) => ({ id: t.id, name: t.name }))}
              />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
