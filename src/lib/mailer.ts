/**
 * Email is optional by design (docs/ARCHITECTURE.md §2). Without a provider key
 * the app logs the message and leaders use "Copy Link", which is the primary
 * V1 path. With RESEND_API_KEY set, the same interface sends for real.
 *
 * Subjects and bodies never include medical information or waiver answers.
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type MailResult = { sent: boolean; reason?: string };

export function mailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!mailEnabled()) {
    // Deliberately logs the subject and recipient only.
    console.info(`[mail:disabled] would send "${message.subject}" to ${message.to}`);
    return { sent: false, reason: "Email is not configured. Use Copy Link instead." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      return { sent: false, reason: `Email provider returned ${response.status}` };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: "Could not reach the email provider." };
  }
}

export function waiverInviteMessage(params: {
  to: string;
  participantName: string;
  isGuardian: boolean;
  tripName: string;
  organizationName: string;
  url: string;
}): MailMessage {
  const who = params.isGuardian
    ? `your student, ${params.participantName},`
    : `you`;
  return {
    to: params.to,
    subject: `Waiver needed for ${params.tripName}`,
    text: [
      `Hi,`,
      ``,
      `${params.organizationName} needs a signed waiver for ${who} before ${params.tripName}.`,
      ``,
      `It takes about two minutes on your phone and you do not need to create an account:`,
      params.url,
      ``,
      `This link is personal to this participant — please don't forward it.`,
      ``,
      `Thank you!`,
      `${params.organizationName}`,
    ].join("\n"),
  };
}
