import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Create your organization" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (membership) redirect(`/orgs/${membership.organization.slug}`);

  return <OnboardingForm firstName={user.firstName} />;
}
