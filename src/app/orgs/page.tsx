import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LogoLockup } from "@/components/brand";
import { Card, LinkButton } from "@/components/ui";

export const metadata = { title: "Your organizations" };

export default async function OrganizationsPage() {
  const user = await requireUser();
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    include: {
      organization: {
        select: { name: true, slug: true, city: true, state: true, _count: { select: { trips: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) redirect("/onboarding");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <LogoLockup />
      <h1 className="mt-8 font-display text-3xl font-extrabold text-navy">Your organizations</h1>

      <ul className="mt-6 space-y-3">
        {memberships.map((m) => (
          <Card as="li" key={m.id} className="p-0">
            <Link
              href={`/orgs/${m.organization.slug}`}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-display text-lg font-bold text-navy">{m.organization.name}</p>
                <p className="text-sm text-navy-soft">
                  {[m.organization.city, m.organization.state].filter(Boolean).join(", ") ||
                    "No location set"}{" "}
                  · {m.organization._count.trips}{" "}
                  {m.organization._count.trips === 1 ? "trip" : "trips"}
                </p>
              </div>
              <span aria-hidden="true" className="text-navy-faint">
                &rsaquo;
              </span>
            </Link>
          </Card>
        ))}
      </ul>

      <div className="mt-6">
        <LinkButton href="/onboarding/new" variant="secondary">
          Add another organization
        </LinkButton>
      </div>
    </main>
  );
}
