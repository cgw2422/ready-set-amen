import type { Metadata } from "next";
import { clientIp } from "@/lib/request";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { markSigningLinkViewed, resolveSigningToken } from "@/lib/waiver-service";
import { displayName } from "@/lib/format";
import { LogoLockup } from "@/components/brand";
import { SigningForm } from "./signing-form";

export const dynamic = "force-dynamic";

// The signing page must never be indexed or cached — it carries a minor's
// medical answers behind a bearer token.
export const metadata: Metadata = {
  title: "Sign your waiver",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * One page, two modes (adult vs. guardian) — docs/ARCHITECTURE.md §9.
 * Every failure mode renders the identical "no longer available" screen so the
 * route never confirms whether a token exists.
 */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const ip = await clientIp();
  const limit = rateLimit(
    `signview:${ip}`,
    LIMITS.signingTokenLookup.limit,
    LIMITS.signingTokenLookup.windowMs,
  );

  const context = limit.allowed ? await resolveSigningToken(token) : null;

  if (!context) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
        <div className="mb-8 flex justify-center">
          <LogoLockup />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-navy">
          This signing link is no longer available.
        </h1>
        <p className="mt-2 text-navy-soft">
          It may have already been used, or it may have expired. Please ask your trip organizer for a
          new link.
        </p>
      </main>
    );
  }

  await markSigningLinkViewed(context.linkId, context.recipientId);

  return (
    <SigningForm
      token={token}
      content={context.content}
      signerRole={context.signerRole}
      participantName={displayName(context.attendee)}
      participantLegalName={`${context.attendee.firstName} ${context.attendee.lastName}`.trim()}
      participantDob={
        context.attendee.dateOfBirth ? context.attendee.dateOfBirth.toISOString().slice(0, 10) : ""
      }
      guardianName={context.guardian?.name ?? ""}
      guardianEmail={context.guardian?.email ?? ""}
      guardianPhone={context.guardian?.phone ?? ""}
      tripName={context.trip.name}
      tripDates={
        context.trip.startDate
          ? new Intl.DateTimeFormat("en-US", {
              timeZone: "UTC",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).formatRange(context.trip.startDate, context.trip.endDate ?? context.trip.startDate)
          : ""
      }
      organizationName={context.organizationName}
    />
  );
}
