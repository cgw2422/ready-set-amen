"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { saveWaiverVersionAction } from "@/lib/actions/waivers";
import type { FormState } from "@/lib/actions/auth";
import {
  LEGAL_DISCLAIMER,
  SECTION_HELP,
  SECTION_KEYS,
  SECTION_LABELS,
  type SectionKey,
  type WaiverContent,
} from "@/lib/waiver-content";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SaveError, SaveStatus } from "@/components/save-status";
import { WaiverText } from "@/components/waiver-text";

const initial: FormState = {};

/** Inserts a formatting marker around the current textarea selection. */
function wrapSelection(el: HTMLTextAreaElement, marker: string): string {
  const { selectionStart: start, selectionEnd: end, value } = el;
  if (start === end) return `${value.slice(0, start)}${marker}text${marker}${value.slice(end)}`;
  return `${value.slice(0, start)}${marker}${value.slice(start, end)}${marker}${value.slice(end)}`;
}

export function WaiverBuilder({
  templateId,
  templateName,
  initialContent,
  currentVersion,
  locked,
}: {
  templateId: string;
  templateName: string;
  initialContent: WaiverContent;
  currentVersion: number;
  locked: boolean;
}) {
  const [state, action] = useActionState(saveWaiverVersionAction.bind(null, templateId), initial);
  const [name, setName] = useState(templateName);
  const [content, setContent] = useState<WaiverContent>(initialContent);
  const [preview, setPreview] = useState(false);
  const bodyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const setSection = (key: SectionKey, patch: Partial<WaiverContent["sections"][SectionKey]>) =>
    setContent((c) => ({
      ...c,
      sections: { ...c.sections, [key]: { ...c.sections[key], ...patch } },
    }));

  const enabledSections = useMemo(
    () => SECTION_KEYS.filter((k) => content.sections[k]?.enabled && content.sections[k].body.trim()),
    [content],
  );

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      <input type="hidden" name="name" value={name} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-navy">Waiver builder</h1>
          <p className="text-sm text-navy-soft">
            Currently on version {currentVersion}. Saving changes creates version {currentVersion + 1}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? "Back to editing" : "Preview"}
          </Button>
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save version
          </SubmitButton>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <SaveStatus state={state} savedMessage="Saved. A new version has been recorded." />
        {locked ? (
          <Alert tone="info" title="This waiver already has signatures">
            Editing is safe — existing signatures keep the exact version they were signed against.
            Trips using this waiver stay on their current version until you choose to adopt the new
            one.
          </Alert>
        ) : null}
        <Alert tone="warning">{LEGAL_DISCLAIMER}</Alert>
      </div>

      {preview ? (
        <Card className="mt-5 p-5">
          <h2 className="font-display text-xl font-extrabold text-navy">{content.waiverTitle}</h2>
          <p className="text-sm text-navy-soft">{content.organizationName}</p>
          <div className="mt-4 space-y-5">
            {enabledSections.map((key) => (
              <section key={key}>
                <h3 className="font-display text-base font-bold text-navy">
                  {content.sections[key].heading}
                </h3>
                <WaiverText body={content.sections[key].body} className="mt-1 text-sm text-navy" />
              </section>
            ))}
            {enabledSections.length === 0 ? (
              <p className="text-sm text-navy-faint">
                Nothing to preview yet — add your waiver language below.
              </p>
            ) : null}
          </div>

          {/* What signing actually asks for, so the drawn-signature setting is
              visible somewhere other than the checkbox that set it. */}
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="font-display text-base font-bold text-navy">The signer provides</h3>
            <ul className="mt-1 space-y-1 text-sm text-navy">
              <li>Their typed legal name</li>
              <li>Agreement to sign electronically</li>
              {content.requireDrawnSignature ? (
                <li data-preview="drawn-signature">A drawn signature</li>
              ) : (
                <li className="text-navy-faint">A drawn signature (optional)</li>
              )}
            </ul>
          </div>
        </Card>
      ) : (
        <div className="mt-5 space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Waiver name" hint="Internal name for your team." required>
                <Input value={name} onChange={(e) => setName(e.currentTarget.value)} required />
              </Field>
              <Field label="Title shown to signers" required>
                <Input
                  value={content.waiverTitle}
                  onChange={(e) => {
                    // Read the value here, not inside the updater: React clears
                    // currentTarget once the handler returns, and an updater runs
                    // later.
                    const waiverTitle = e.currentTarget.value;
                    setContent((c) => ({ ...c, waiverTitle }));
                  }}
                  required
                />
              </Field>
              <Field label="Organization name" className="sm:col-span-2" required>
                <Input
                  value={content.organizationName}
                  onChange={(e) => {
                    const organizationName = e.currentTarget.value;
                    setContent((c) => ({ ...c, organizationName }));
                  }}
                  required
                />
              </Field>
            </div>
          </Card>

          {/* Sections -------------------------------------------------------- */}
          <section>
            <h2 className="mb-1 font-display text-lg font-bold text-navy">Waiver language</h2>
            <p className="mb-3 text-sm text-navy-soft">
              Enter your organization&rsquo;s own approved wording. Ready Set Amen never generates
              legal language for you.
            </p>

            <div className="space-y-3">
              {SECTION_KEYS.map((key) => {
                const section = content.sections[key];
                return (
                  <Card key={key} className="p-4">
                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={section.enabled}
                        onChange={(e) => setSection(key, { enabled: e.currentTarget.checked })}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-navy">{SECTION_LABELS[key]}</span>
                        <span className="block text-xs text-navy-faint">{SECTION_HELP[key]}</span>
                      </span>
                    </label>

                    {section.enabled ? (
                      <div className="mt-3 space-y-2">
                        <Input
                          value={section.heading}
                          aria-label={`${SECTION_LABELS[key]} heading`}
                          onChange={(e) => setSection(key, { heading: e.currentTarget.value })}
                          placeholder="Heading shown to the signer"
                        />
                        <div className="flex gap-1.5">
                          {[
                            { label: "Bold", marker: "**" },
                            { label: "Italic", marker: "*" },
                          ].map((tool) => (
                            <Button
                              key={tool.label}
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const el = bodyRefs.current[key];
                                if (!el) return;
                                setSection(key, { body: wrapSelection(el, tool.marker) });
                              }}
                            >
                              {tool.label}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setSection(key, {
                                body: `${section.body}${section.body.endsWith("\n") || !section.body ? "" : "\n"}- `,
                              })
                            }
                          >
                            Bullet
                          </Button>
                        </div>
                        <Textarea
                          ref={(el) => {
                            bodyRefs.current[key] = el;
                          }}
                          rows={6}
                          value={section.body}
                          aria-label={`${SECTION_LABELS[key]} text`}
                          onChange={(e) => setSection(key, { body: e.currentTarget.value })}
                          placeholder="Paste your approved wording here."
                        />
                        <p className="text-xs text-navy-faint">
                          Blank line for a new paragraph. <code>**bold**</code>, <code>*italic*</code>,
                          and lines starting with <code>-</code> for bullets.
                        </p>
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Fields ---------------------------------------------------------- */}
          <section>
            <h2 className="mb-1 font-display text-lg font-bold text-navy">
              What the signer must give you
            </h2>
            <p className="mb-3 text-sm text-navy-soft">
              Keep this short. Every extra field is another thing a parent has to type on a phone.
            </p>
            <Card className="divide-y divide-line p-0">
              {content.fields.map((field, index) => (
                <div key={field.key} className="flex flex-wrap items-center gap-3 p-3">
                  <label className="flex flex-1 items-center gap-3">
                    <Checkbox
                      checked={field.enabled}
                      onChange={(e) => {
                        const enabled = e.currentTarget.checked;
                        setContent((c) => {
                          const fields = [...c.fields];
                          fields[index] = { ...field, enabled, required: enabled && field.required };
                          return { ...c, fields };
                        });
                      }}
                    />
                    <span className="font-semibold text-navy">{field.label}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-navy-soft">
                    <Checkbox
                      checked={field.required}
                      disabled={!field.enabled}
                      onChange={(e) => {
                        const required = e.currentTarget.checked;
                        setContent((c) => {
                          const fields = [...c.fields];
                          fields[index] = { ...field, required };
                          return { ...c, fields };
                        });
                      }}
                    />
                    Required
                  </label>
                </div>
              ))}
            </Card>
          </section>

          {/* Custom questions ------------------------------------------------ */}
          <ListEditor
            title="Custom questions"
            description="Anything else you need from this specific group."
            addLabel="Add question"
            items={content.customQuestions.map((q) => ({ key: q.key, label: q.label, required: q.required }))}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                customQuestions: [
                  ...c.customQuestions,
                  { key: `custom_${Date.now()}`, label: "", type: "text", required: false },
                ],
              }))
            }
            onChange={(index, patch) =>
              setContent((c) => {
                const customQuestions = [...c.customQuestions];
                customQuestions[index] = { ...customQuestions[index], ...patch };
                return { ...c, customQuestions };
              })
            }
            onRemove={(index) =>
              setContent((c) => ({
                ...c,
                customQuestions: c.customQuestions.filter((_, i) => i !== index),
              }))
            }
          />

          {/* Initials -------------------------------------------------------- */}
          <ListEditor
            title="Initial here"
            description="Clauses the signer initials separately."
            addLabel="Add initials line"
            hideRequired
            items={content.initials.map((i) => ({ key: i.key, label: i.label, required: true }))}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                initials: [...c.initials, { key: `initial_${Date.now()}`, label: "" }],
              }))
            }
            onChange={(index, patch) =>
              setContent((c) => {
                const initials = [...c.initials];
                if (patch.label !== undefined) initials[index] = { ...initials[index], label: patch.label };
                return { ...c, initials };
              })
            }
            onRemove={(index) =>
              setContent((c) => ({ ...c, initials: c.initials.filter((_, i) => i !== index) }))
            }
          />

          {/* Acknowledgements ------------------------------------------------ */}
          <ListEditor
            title="Acknowledgement checkboxes"
            description="Each one is recorded on the signature, exactly as worded here."
            addLabel="Add acknowledgement"
            items={content.acknowledgements}
            onAdd={() =>
              setContent((c) => ({
                ...c,
                acknowledgements: [
                  ...c.acknowledgements,
                  { key: `ack_${Date.now()}`, label: "", required: true },
                ],
              }))
            }
            onChange={(index, patch) =>
              setContent((c) => {
                const acknowledgements = [...c.acknowledgements];
                acknowledgements[index] = { ...acknowledgements[index], ...patch };
                return { ...c, acknowledgements };
              })
            }
            onRemove={(index) =>
              setContent((c) => ({
                ...c,
                acknowledgements: c.acknowledgements.filter((_, i) => i !== index),
              }))
            }
          />

          <Card className="p-4">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={content.requireDrawnSignature}
                onChange={(e) => {
                  const requireDrawnSignature = e.currentTarget.checked;
                  setContent((c) => ({ ...c, requireDrawnSignature }));
                }}
              />
              <span>
                <span className="block font-semibold text-navy">Require a drawn signature</span>
                <span className="block text-xs text-navy-faint">
                  A typed legal name is always required. Turn this on to also ask for a finger-drawn
                  signature.
                </span>
              </span>
            </label>
          </Card>
        </div>
      )}

      <div className="sticky bottom-4 mt-6">
        <SubmitButton size="lg" className="w-full shadow-lg" pendingLabel="Saving…">
          Save version {currentVersion + 1}
        </SubmitButton>
        <SaveError state={state} />
      </div>
    </form>
  );
}

function ListEditor({
  title,
  description,
  addLabel,
  items,
  onAdd,
  onChange,
  onRemove,
  hideRequired,
}: {
  title: string;
  description: string;
  addLabel: string;
  items: { key: string; label: string; required: boolean }[];
  onAdd: () => void;
  onChange: (index: number, patch: { label?: string; required?: boolean }) => void;
  onRemove: (index: number) => void;
  hideRequired?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
          <p className="text-sm text-navy-soft">{description}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
          {addLabel}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-navy-faint">
          None yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <Card as="li" key={item.key} className="p-3">
              <Textarea
                rows={2}
                value={item.label}
                aria-label={`${title} text`}
                placeholder="Wording shown to the signer"
                onChange={(e) => onChange(index, { label: e.currentTarget.value })}
              />
              <div className="mt-2 flex items-center justify-between">
                {hideRequired ? (
                  <Badge tone="muted">Always required</Badge>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-navy-soft">
                    <Checkbox
                      checked={item.required}
                      onChange={(e) => onChange(index, { required: e.currentTarget.checked })}
                    />
                    Required
                  </label>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}
