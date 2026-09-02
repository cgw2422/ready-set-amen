import { prisma } from "@/lib/db";
import { isOwner, requireOrg } from "@/lib/access";
import { mailEnabled } from "@/lib/mailer";
import { Card } from "@/components/ui";
import { LogoLockup } from "@/components/brand";
import { OrgMenu } from "@/components/org-menu";
import { OrgSettingsForm } from "./org-settings-form";
import { TeamManager } from "./team-manager";
import { DeleteOrganizationCard } from "./delete-organization";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization settings" };

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const owner = isOwner(ctx.role);

  const [organization, invitations] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organization.id },
      select: {
        name: true,
        city: true,
        state: true,
        waiverTermsAcceptedAt: true,
        members: {
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            role: true,
            createdAt: true,
            userId: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    }),
    // Pending invitations are owner-only information.
    owner
      ? prisma.organizationInvitation.findMany({
          where: {
            organizationId: ctx.organization.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, expiresAt: true, invitedByUserId: true },
        })
      : Promise.resolve([]),
  ]);

  const inviterNames = new Map(
    organization.members.map((m) => [m.userId, `${m.user.firstName} ${m.user.lastName}`.trim()]),
  );

  return (
    <div className="min-h-dvh bg-cream pb-16">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-4">
          <LogoLockup href={`/orgs/${slug}`} />
          <OrgMenu slug={slug} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-6">
        <h1 className="font-display text-3xl font-extrabold text-navy">Organization settings</h1>

        <OrgSettingsForm
          slug={slug}
          canEdit={owner}
          values={{
            name: organization.name,
            city: organization.city ?? "",
            state: organization.state ?? "",
          }}
        />

        <TeamManager
          slug={slug}
          isOwner={owner}
          emailConfigured={mailEnabled()}
          members={organization.members.map((m) => ({
            id: m.id,
            name: `${m.user.firstName} ${m.user.lastName}`.trim(),
            email: m.user.email,
            role: m.role,
            joined: m.createdAt.toISOString(),
            isSelf: m.userId === ctx.userId,
          }))}
          invitations={invitations.map((i) => ({
            id: i.id,
            email: i.email,
            invitedBy: inviterNames.get(i.invitedByUserId) ?? "An owner",
            expiresAt: i.expiresAt.toISOString(),
          }))}
        />

        {organization.waiverTermsAcceptedAt ? (
          <Card className="p-4">
            <p className="font-display text-base font-bold text-navy">Waiver responsibility</p>
            <p className="mt-1 text-sm text-navy-soft">
              An owner acknowledged responsibility for this church&rsquo;s waiver language on{" "}
              {organization.waiverTermsAcceptedAt.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
          </Card>
        ) : null}

        {owner ? <DeleteOrganizationCard slug={slug} organizationName={organization.name} /> : null}
      </main>
    </div>
  );
}
