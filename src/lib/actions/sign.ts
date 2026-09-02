"use server";

import { clientIp, assertSameOrigin, userAgent } from "@/lib/request";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { recordSignature, resolveSigningToken } from "@/lib/waiver-service";

export type SignState = {
  error?: string;
  success?: {
    signedWaiverId: string;
    attendeeName: string;
    tripName: string;
    siblings: { name: string; url: string }[];
  };
};

/**
 * The one public mutation in the app. Everything here is re-derived from the
 * template on the server — field labels included — so a modified form cannot
 * change what was asked or what gets recorded.
 */
export async function submitSignatureAction(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  await assertSameOrigin();

  const ip = await clientIp();
  const limit = await rateLimit(`sign:${ip}`, LIMITS.signingSubmit.limit, LIMITS.signingSubmit.windowMs);
  if (!limit.allowed) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const token = String(formData.get("token") ?? "");
  const context = await resolveSigningToken(token);
  if (!context) return { error: "This signing link is no longer available." };

  const value = (key: string): string => String(formData.get(key) ?? "").trim();

  // Labels come from the pinned template version, never from the submitted form.
  const responses: { key: string; label: string; value: string }[] = [];
  for (const field of context.content.fields) {
    if (!field.enabled) continue;
    responses.push({ key: field.key, label: field.label, value: value(`field_${field.key}`) });
  }
  for (const question of context.content.customQuestions) {
    responses.push({
      key: question.key,
      label: question.label,
      value: value(`field_${question.key}`),
    });
  }
  for (const initial of context.content.initials) {
    responses.push({
      key: initial.key,
      label: initial.label,
      value: value(`field_${initial.key}`),
    });
  }

  const acknowledgements = context.content.acknowledgements.map((ack) => ({
    key: ack.key,
    label: ack.label,
    checked: formData.get(`ack_${ack.key}`) === "on",
  }));

  const drawn = String(formData.get("drawnSignature") ?? "");
  const drawnSignature =
    drawn.startsWith("data:image/png;base64,") && drawn.length < 400_000 ? drawn : null;

  const result = await recordSignature({
    token,
    signerName: value("signerName"),
    signerRelationship:
      context.signerRole === "SELF" ? "Self" : value("signerRelationship"),
    signerEmail: value("signerEmail") || null,
    signerPhone: value("signerPhone") || null,
    typedSignature: value("typedSignature"),
    drawnSignature,
    consentToElectronicRecords: formData.get("consent") === "on",
    acknowledgements,
    responses,
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: await userAgent(),
  });

  if (!result.ok) return { error: result.error };

  return {
    success: {
      signedWaiverId: result.signedWaiverId,
      attendeeName: result.attendeeName,
      tripName: result.tripName,
      siblings: result.siblings,
    },
  };
}
