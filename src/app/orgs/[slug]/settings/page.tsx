import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { LogoLockup } from "@/components/brand";
import { OrgMenu } from "@/components/org-menu";
import { OrgSettingsForm } from "./org-settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization settings" };

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organization.id },
    select: {
      name: true,
      city: true,
      state: true,
      createdAt: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

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
          canEdit={ctx.role === "OWNER" || ctx.role === "ADMIN"}
          values={{
            name: organization.name,
            city: organization.city ?? "",
            state: organization.state ?? "",
          }}
        />

        <Card className="p-4">
          <p className="font-display text-base font-bold text-navy">Who has access</p>
          <p className="mt-1 text-sm text-navy-soft">
            Everyone listed here can see attendee and medical information for this
            organization&rsquo;s trips.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {organization.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">
                    {member.user.firstName} {member.user.lastName}
                  </p>
                  <p className="truncate text-xs text-navy-faint">{member.user.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={member.role === "OWNER" ? "green" : "muted"}>
                    {member.role.toLowerCase()}
                  </Badge>
                  <span className="hidden text-xs text-navy-faint sm:inline">
                    since {formatDate(member.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-navy-faint">
            Inviting additional leaders arrives after V1. For now, everyone in this organization has
            the same access to its trips.
          </p>
        </Card>
      </main>
    </div>
  );
}
