import Link from "next/link";
import type { Metadata } from "next";
import { checkResetToken } from "@/lib/actions/account";
import { LogoLockup } from "@/components/brand";
import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const check = await checkResetToken(token);

  if (!check.valid) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
        <div className="mb-8 flex justify-center">
          <LogoLockup />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-navy">
          This reset link is no longer valid.
        </h1>
        <p className="mt-2 text-navy-soft">
          Reset links last 30 minutes and can only be used once. Request a new one and it will be
          ready in a moment.
        </p>
        <Link
          href="/forgot-password"
          className="mx-auto mt-6 inline-flex min-h-[48px] items-center rounded-xl bg-green-brand px-5 font-semibold text-white"
        >
          Request a new link
        </Link>
      </main>
    );
  }

  return <ResetPasswordForm token={token} firstName={check.firstName} />;
}
