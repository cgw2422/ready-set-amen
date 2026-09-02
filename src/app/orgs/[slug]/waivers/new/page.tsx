import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/access";
import { LEGAL_DISCLAIMER } from "@/lib/waiver-content";
import { Alert } from "@/components/ui";
import { NewWaiverForm } from "./new-waiver-form";

export const metadata = { title: "New waiver" };

export default async function NewWaiverPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);

  // The acknowledgement is enforced here too, not only by hiding the button.
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organization.id },
    select: { waiverTermsAcceptedAt: true },
  });
  if (!organization.waiverTermsAcceptedAt) redirect(`/orgs/${slug}/waivers`);

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-8">
      <Link href={`/orgs/${slug}/waivers`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand">
        &lsaquo; Back to waiver library
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold text-navy">Create a waiver</h1>
      <p className="mt-1 text-navy-soft">
        Name it now — you&rsquo;ll paste in your church&rsquo;s approved language on the next screen.
      </p>
      <div className="mt-4">
        <Alert tone="warning">{LEGAL_DISCLAIMER}</Alert>
      </div>
      <NewWaiverForm slug={slug} />
    </main>
  );
}
