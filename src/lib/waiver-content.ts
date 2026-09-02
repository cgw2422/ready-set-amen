import { z } from "zod";

/**
 * The shape stored in WaiverTemplateVersion.content and copied verbatim into
 * SignedWaiver.documentSnapshot. Because a signed waiver is rendered from the
 * snapshot, this shape is effectively a file format: add fields, never
 * repurpose or remove them.
 */

export const SECTION_KEYS = [
  "intro",
  "release",
  "assumptionOfRisk",
  "medicalAuthorization",
  "photoRelease",
  "emergencyTreatment",
  "customTerms",
  "footer",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  intro: "Introduction",
  release: "Waiver / Release",
  assumptionOfRisk: "Assumption of Risk",
  medicalAuthorization: "Medical Authorization",
  photoRelease: "Photo / Media Release",
  emergencyTreatment: "Emergency Treatment Authorization",
  customTerms: "Custom Terms",
  footer: "Footer / Additional Information",
};

export const SECTION_HELP: Record<SectionKey, string> = {
  intro: "A short opening paragraph naming the event and who is signing.",
  release: "Your organization's release language. Enter the wording your church has approved.",
  assumptionOfRisk: "Describes the risks a participant accepts by taking part.",
  medicalAuthorization: "Permission to seek and consent to medical care during the trip.",
  photoRelease: "Permission to use photos and video from the trip.",
  emergencyTreatment: "Authorization for emergency treatment when a guardian cannot be reached.",
  customTerms: "Anything else specific to this trip or organization.",
  footer: "Contact information, church address, or closing notes.",
};

const sectionSchema = z.object({
  enabled: z.boolean(),
  heading: z.string().max(200),
  body: z.string().max(20000),
});

/** Fields the signer can be asked to complete. */
export const SIGNER_FIELDS = [
  { key: "participantName", label: "Participant Name", type: "text", alwaysOn: true },
  { key: "participantDob", label: "Participant Date of Birth", type: "date" },
  { key: "guardianName", label: "Parent / Guardian Name", type: "text" },
  { key: "guardianEmail", label: "Parent / Guardian Email", type: "email" },
  { key: "guardianPhone", label: "Parent / Guardian Phone", type: "tel" },
  { key: "emergencyContactName", label: "Emergency Contact Name", type: "text" },
  { key: "emergencyContactPhone", label: "Emergency Contact Phone", type: "tel" },
  { key: "emergencyContactRelation", label: "Relationship to Emergency Contact", type: "text" },
  { key: "allergies", label: "Allergies", type: "textarea" },
  { key: "medicalConditions", label: "Medical Conditions", type: "textarea" },
  { key: "medications", label: "Medications", type: "textarea" },
  { key: "dietaryRestrictions", label: "Dietary Restrictions", type: "textarea" },
  { key: "insuranceProvider", label: "Insurance Provider", type: "text" },
  { key: "insurancePolicyNumber", label: "Insurance Policy Number", type: "text" },
  { key: "doctorName", label: "Doctor Name", type: "text" },
  { key: "doctorPhone", label: "Doctor Phone", type: "tel" },
  { key: "shirtSize", label: "Shirt Size", type: "text" },
] as const;

export type SignerFieldKey = (typeof SIGNER_FIELDS)[number]["key"];

/** Fields that carry medical information — never printed unless asked for. */
export const MEDICAL_FIELD_KEYS: readonly string[] = [
  "allergies",
  "medicalConditions",
  "medications",
  "dietaryRestrictions",
  "insuranceProvider",
  "insurancePolicyNumber",
  "doctorName",
  "doctorPhone",
];

const fieldConfigSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "textarea", "email", "tel", "date"]),
  enabled: z.boolean(),
  required: z.boolean(),
});

const customQuestionSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(300),
  type: z.enum(["text", "textarea"]),
  required: z.boolean(),
});

const acknowledgementSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(1000),
  required: z.boolean(),
});

const initialsSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(1000),
});

export const waiverContentSchema = z.object({
  formatVersion: z.literal(1),
  waiverTitle: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(200),
  // Every section key is always present so downstream code never has to guard
  // for a missing one; `enabled` is what turns a section off.
  sections: z.object({
    intro: sectionSchema,
    release: sectionSchema,
    assumptionOfRisk: sectionSchema,
    medicalAuthorization: sectionSchema,
    photoRelease: sectionSchema,
    emergencyTreatment: sectionSchema,
    customTerms: sectionSchema,
    footer: sectionSchema,
  }),
  fields: z.array(fieldConfigSchema),
  customQuestions: z.array(customQuestionSchema),
  initials: z.array(initialsSchema),
  acknowledgements: z.array(acknowledgementSchema),
  requireDrawnSignature: z.boolean(),
});

export type WaiverContent = z.infer<typeof waiverContentSchema>;
export type WaiverFieldConfig = z.infer<typeof fieldConfigSchema>;
export type WaiverAcknowledgement = z.infer<typeof acknowledgementSchema>;
export type WaiverCustomQuestion = z.infer<typeof customQuestionSchema>;

/**
 * The exact text a signer consents to. Stored on every SignedWaiver so the
 * record shows what the person agreed to, not what the app says today.
 */
export const ELECTRONIC_CONSENT_TEXT =
  "I agree to sign this document electronically. I understand that my electronic " +
  "signature is the legal equivalent of my handwritten signature, that this " +
  "record will be provided to me electronically, and that I may request a paper " +
  "copy from the organization at any time.";

export const LEGAL_DISCLAIMER =
  "Ready Set Amen provides electronic waiver collection tools. Organizations are " +
  "responsible for ensuring their waiver language and processes meet applicable " +
  "legal requirements. This is not legal advice.";

export function emptyContent(organizationName: string, waiverTitle: string): WaiverContent {
  return {
    formatVersion: 1,
    waiverTitle,
    organizationName,
    sections: Object.fromEntries(
      SECTION_KEYS.map((key) => [
        key,
        {
          enabled: key === "intro" || key === "release",
          heading: SECTION_LABELS[key],
          body: "",
        },
      ]),
    ) as WaiverContent["sections"],
    fields: SIGNER_FIELDS.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      enabled:
        f.key === "participantName" ||
        f.key === "participantDob" ||
        f.key === "emergencyContactName" ||
        f.key === "emergencyContactPhone" ||
        f.key === "allergies" ||
        f.key === "medicalConditions" ||
        f.key === "medications",
      required:
        f.key === "participantName" ||
        f.key === "emergencyContactName" ||
        f.key === "emergencyContactPhone",
    })),
    customQuestions: [],
    initials: [],
    acknowledgements: [
      {
        key: "readAndUnderstood",
        label: "I have read this document in full and I understand it.",
        required: true,
      },
    ],
    requireDrawnSignature: false,
  };
}

/** Fields the signer will actually be shown, in a stable order. */
export function activeFields(content: WaiverContent): WaiverFieldConfig[] {
  return content.fields.filter((f) => f.enabled);
}

export type EnabledSection = { key: SectionKey; heading: string; body: string };

export function enabledSections(content: WaiverContent): EnabledSection[] {
  const result: EnabledSection[] = [];
  for (const key of SECTION_KEYS) {
    const section = content.sections[key];
    if (!section.enabled) continue;
    if (section.body.trim().length === 0) continue;
    result.push({ key, heading: section.heading, body: section.body });
  }
  return result;
}
