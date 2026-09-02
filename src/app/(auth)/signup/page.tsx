import { SignupForm } from "./signup-form";

export const metadata = { title: "Create an account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  return <SignupForm invite={invite ?? ""} />;
}
