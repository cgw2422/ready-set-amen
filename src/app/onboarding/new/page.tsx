import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "../onboarding-form";

export const metadata = { title: "Add an organization" };

export default async function NewOrganizationPage() {
  const user = await requireUser();
  return <OnboardingForm firstName={user.firstName} />;
}
