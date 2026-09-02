import Link from "next/link";
import type { Metadata } from "next";
import { previewInvitation } from "@/lib/actions/members";
import { getCurrentUser } from "@/lib/auth";
import { Alert, Card } from "@/components/ui";
import { LogoLockup } from "@/components/brand";
import { AcceptInvitationButton } from "./accept-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Join your team",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await previewInvitation(token);
  const user = await getCurrentUser();

  if (!invitation.valid) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
        <div className="mb-8 flex justify-center">
          <LogoLockup />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-navy">
          This invitation is no longer available.
        </h1>
        <p className="mt-2 text-navy-soft">
          It may have already been used, been withdrawn, or expired. Ask whoever invited you to send
          a new one.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <LogoLockup />
      </div>

      <Card className="border-green-brand/30 bg-green-tint p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-green-deep">
          You&rsquo;ve been invited
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-navy">
          {invitation.organizationName}
        </h1>
        <p className="mt-1 text-sm text-navy-soft">
          {invitation.invitedBy} invited <span className="font-semibold">{invitation.email}</span> to
          help lead trips.
        </p>
      </Card>

      <div className="mt-6 space-y-4">
        {invitation.alreadyMember ? (
          <Alert tone="info">You&rsquo;re already part of this team.</Alert>
        ) : null}

        {user ? (
          <>
            <p className="text-sm text-navy-soft">
              Signed in as <span className="font-semibold text-navy">{user.email}</span>. Accepting
              adds this organization to your account.
            </p>
            {user.email !== invitation.email ? (
              <Alert tone="warning">
                This invitation was sent to {invitation.email}. Accepting will join your current
                account instead — sign out first if that isn&rsquo;t what you want.
              </Alert>
            ) : null}
            <AcceptInvitationButton token={token} />
            <form action="/logout" method="post">
              <button
                type="submit"
                className="inline-flex min-h-[44px] items-center text-sm font-semibold text-navy-soft underline"
              >
                Sign in as someone else
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-navy-soft">
              Sign in or create an account to accept. Use{" "}
              <span className="font-semibold text-navy">{invitation.email}</span> if you can.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href={`/signup?invite=${token}`}
                className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-green-brand px-4 font-semibold text-white"
              >
                Create an account
              </Link>
              <Link
                href={`/login?invite=${token}`}
                className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-line bg-white px-4 font-semibold text-navy"
              >
                I already have an account
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
