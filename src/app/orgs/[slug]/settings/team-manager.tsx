"use client";

import { useActionState, useState, useTransition } from "react";
import {
  generateMemberResetLinkAction,
  inviteLeaderAction,
  regenerateInvitationAction,
  removeMemberAction,
  revokeInvitationAction,
  transferOwnershipAction,
  type InviteResult,
} from "@/lib/actions/members";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  joined: string;
  isSelf: boolean;
};

type Invitation = {
  id: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
};

const initial: InviteResult = {};

/**
 * Deliberately small: invite by email, see who's pending, revoke, remove.
 * Two roles, no permissions matrix (docs/ARCHITECTURE.md §10).
 */
export function TeamManager({
  slug,
  isOwner,
  members,
  invitations,
  emailConfigured,
}: {
  slug: string;
  isOwner: boolean;
  members: Member[];
  invitations: Invitation[];
  emailConfigured: boolean;
}) {
  const [state, action] = useActionState(inviteLeaderAction.bind(null, slug), initial);
  const [link, setLink] = useState<{ label: string; url: string } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const copy = async (url: string, label: string) => {
    setLink({ label, url });
    try {
      await navigator.clipboard.writeText(url);
      setMessage({ tone: "success", text: `${label} copied.` });
    } catch {
      setMessage({ tone: "error", text: "Your browser blocked the clipboard — copy it below." });
    }
  };

  const run = (fn: () => Promise<InviteResult>, successText: string, label?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      if (result.url && label) await copy(result.url, label);
      else setMessage({ tone: "success", text: successText });
    });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="font-display text-base font-bold text-navy">Your team</p>
        <p className="mt-1 text-sm text-navy-soft">
          Everyone here can see attendee and medical information for this organization&rsquo;s
          trips. The owner also manages the team and the organization itself.
        </p>

        <ul className="mt-3 divide-y divide-line">
          {members.map((member) => (
            <li key={member.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-navy">
                    {member.name}
                    {member.isSelf ? <span className="text-navy-faint"> (you)</span> : null}
                  </p>
                  <p className="break-words text-xs text-navy-faint">{member.email}</p>
                </div>
                <Badge tone={member.role === "OWNER" ? "green" : "muted"}>
                  {member.role === "OWNER" ? "Owner" : "Leader"}
                </Badge>
              </div>

              {isOwner && !member.isSelf ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => generateMemberResetLinkAction(slug, member.id),
                        "",
                        `Password reset link for ${member.name}`,
                      )
                    }
                  >
                    Reset link
                  </Button>
                  {confirming === `transfer:${member.id}` ? (
                    <>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          run(
                            () => transferOwnershipAction(slug, member.id),
                            `${member.name} is now the owner. You are a leader.`,
                          );
                        }}
                      >
                        Yes, make {member.name} owner
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setConfirming(`transfer:${member.id}`)}
                    >
                      Make owner
                    </Button>
                  )}
                  {confirming === `remove:${member.id}` ? (
                    <>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          run(
                            () => removeMemberAction(slug, member.id),
                            `${member.name} no longer has access.`,
                          );
                        }}
                      >
                        Yes, remove
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setConfirming(`remove:${member.id}`)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {message ? (
        <Alert tone={message.tone === "success" ? "success" : "error"}>{message.text}</Alert>
      ) : null}

      {link ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-navy">{link.label}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLink(null)}>
              Hide
            </Button>
          </div>
          <p className="mt-1 text-xs text-navy-faint">
            Send this to that person directly — anyone with the link can use it.
          </p>
          <input
            readOnly
            value={link.url}
            aria-label={link.label}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-xl border border-line bg-cream px-3 py-2 font-mono text-xs text-navy"
          />
        </Card>
      ) : null}

      {isOwner ? (
        <Card className="p-4">
          <p className="font-display text-base font-bold text-navy">Invite a leader</p>
          <p className="mt-1 text-sm text-navy-soft">
            {emailConfigured
              ? "We'll email them an invitation, and you can copy the link too."
              : "Email isn't configured, so copy the link and send it however you already talk."}
          </p>

          <form action={action} className="mt-3 space-y-3">
            {state.error ? <Alert tone="error">{state.error}</Alert> : null}
            {state.ok && state.url ? (
              <Alert tone="success">
                {state.emailed
                  ? "Invitation emailed. The link is below too."
                  : "Invitation created. Copy the link below and send it to them."}
                <input
                  readOnly
                  value={state.url}
                  aria-label="Invitation link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-xs text-navy"
                />
              </Alert>
            ) : null}

            <Field label="Their email" required>
              <Input name="email" type="email" inputMode="email" required placeholder="leader@church.org" />
            </Field>
            <SubmitButton pendingLabel="Inviting…">Send invitation</SubmitButton>
          </form>
        </Card>
      ) : null}

      {isOwner && invitations.length > 0 ? (
        <Card className="p-4">
          <p className="font-display text-base font-bold text-navy">
            Pending invitations ({invitations.length})
          </p>
          <ul className="mt-3 divide-y divide-line">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="py-3">
                <p className="break-words font-semibold text-navy">{invitation.email}</p>
                <p className="text-xs text-navy-faint">
                  Invited by {invitation.invitedBy} · expires{" "}
                  {formatDate(new Date(invitation.expiresAt))}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => regenerateInvitationAction(slug, invitation.id),
                        "",
                        `Invitation link for ${invitation.email}`,
                      )
                    }
                  >
                    Copy new link
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => revokeInvitationAction(slug, invitation.id),
                        `Invitation for ${invitation.email} withdrawn.`,
                      )
                    }
                  >
                    Withdraw
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
