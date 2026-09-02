import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/access";
import { formatDateTime } from "@/lib/format";
import { emptyContent, waiverContentSchema } from "@/lib/waiver-content";
import { Badge, Card } from "@/components/ui";
import { LogoLockup } from "@/components/brand";
import { OrgMenu } from "@/components/org-menu";
import { WaiverBuilder } from "./waiver-builder";

export const dynamic = "force-dynamic";

export default async function WaiverTemplatePage({
  params,
}: {
  params: Promise<{ slug: string; templateId: string }>;
}) {
  const { slug, templateId } = await params;
  const ctx = await requireOrg(slug);

  const template = await prisma.waiverTemplate.findFirst({
    where: { id: templateId, organizationId: ctx.organization.id },
    select: {
      id: true,
      name: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          content: true,
          contentHash: true,
          createdAt: true,
          _count: { select: { signedWaivers: true, requirements: true } },
        },
      },
    },
  });
  if (!template) notFound();

  const latest = template.versions[0];
  const parsed = latest ? waiverContentSchema.safeParse(latest.content) : null;
  const content = parsed?.success
    ? parsed.data
    : emptyContent(ctx.organization.name, template.name);

  return (
    <div className="min-h-dvh bg-cream pb-16">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <LogoLockup href={`/orgs/${slug}`} />
          <OrgMenu slug={slug} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-6">
        <Link href={`/orgs/${slug}/waivers`} className="text-sm font-semibold text-green-brand">
          &lsaquo; Back to waiver library
        </Link>

        <WaiverBuilder
          templateId={template.id}
          templateName={template.name}
          initialContent={content}
          currentVersion={latest?.versionNumber ?? 1}
          locked={Boolean(latest && latest._count.signedWaivers > 0)}
        />

        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-navy">Version history</h2>
          <p className="mt-1 text-sm text-navy-soft">
            Every save creates a new version. Signed waivers always point at the exact version that
            was signed, so editing this waiver never changes a signature that already exists.
          </p>
          <ul className="mt-3 space-y-2">
            {template.versions.map((v) => (
              <Card as="li" key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-semibold text-navy">Version {v.versionNumber}</p>
                  <p className="text-xs text-navy-faint">
                    {formatDateTime(v.createdAt)} · hash {v.contentHash.slice(0, 12)}…
                  </p>
                </div>
                <div className="flex gap-2">
                  {v._count.signedWaivers > 0 ? (
                    <Badge tone="green">
                      {v._count.signedWaivers} signature{v._count.signedWaivers === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  {v._count.requirements > 0 ? (
                    <Badge tone="gold">
                      In use on {v._count.requirements} trip{v._count.requirements === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
              </Card>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
