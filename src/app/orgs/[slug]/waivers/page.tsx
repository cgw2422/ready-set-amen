import Link from "next/link";
import { prisma } from "@/lib/db";
import { isOwner, requireOrg } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { LEGAL_DISCLAIMER } from "@/lib/waiver-content";
import { WaiverTermsGate } from "./waiver-terms-gate";
import { Alert, Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { LogoLockup } from "@/components/brand";
import { OrgMenu } from "@/components/org-menu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waiver library" };

export default async function WaiverLibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organization.id },
    select: { waiverTermsAcceptedAt: true },
  });
  const needsAcknowledgement = organization.waiverTermsAcceptedAt === null;

  const templates = await prisma.waiverTemplate.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      archivedAt: true,
      updatedAt: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { versionNumber: true, createdAt: true, _count: { select: { signedWaivers: true } } },
      },
      _count: { select: { versions: true } },
    },
  });

  return (
    <div className="min-h-dvh bg-cream pb-16">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <LogoLockup href={`/orgs/${slug}`} />
          <OrgMenu slug={slug} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-green-brand">
              {ctx.organization.name}
            </p>
            <h1 className="font-display text-3xl font-extrabold text-navy">Waiver library</h1>
            <p className="mt-1 text-sm text-navy-soft">
              Reusable waivers you can apply to any trip.
            </p>
          </div>
          {needsAcknowledgement ? null : (
            <LinkButton href={`/orgs/${slug}/waivers/new`}>New waiver</LinkButton>
          )}
        </div>

        {needsAcknowledgement ? (
          <div className="mt-5">
            <WaiverTermsGate slug={slug} isOwner={isOwner(ctx.role)} />
          </div>
        ) : (
          <div className="mt-5">
            <Alert tone="warning">{LEGAL_DISCLAIMER}</Alert>
          </div>
        )}

        {templates.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No waivers yet."
              description="Create a waiver with your church's own approved language. Ready Set Amen never writes legal language for you."
              action={
                needsAcknowledgement ? undefined : (
                  <LinkButton href={`/orgs/${slug}/waivers/new`}>Create a waiver</LinkButton>
                )
              }
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {templates.map((t) => {
              const latest = t.versions[0];
              return (
                <Card as="li" key={t.id} className="p-0">
                  <Link href={`/orgs/${slug}/waivers/${t.id}`} className="block p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold text-navy">{t.name}</p>
                        <p className="text-sm text-navy-soft">
                          Version {latest?.versionNumber ?? 1} · {t._count.versions}{" "}
                          {t._count.versions === 1 ? "version" : "versions"} · updated{" "}
                          {formatDate(latest?.createdAt ?? t.updatedAt)}
                        </p>
                        {latest && latest._count.signedWaivers > 0 ? (
                          <p className="mt-1 text-xs text-navy-faint">
                            {latest._count.signedWaivers} signature
                            {latest._count.signedWaivers === 1 ? "" : "s"} on this version
                          </p>
                        ) : null}
                      </div>
                      {t.archivedAt ? <Badge tone="muted">Archived</Badge> : <Badge tone="green">Active</Badge>}
                    </div>
                  </Link>
                </Card>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
