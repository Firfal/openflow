import type { ArrayField } from "@puckeditor/core";
import { slugify } from "./slug.js";

/**
 * Contact forms: the owner declares the fields of a form in a section (labels, types, required),
 * visitors send it, `cmsSubmitForm` checks each value against the definition of the
 * published page and records the message in `cms_messages`, read in the admin (« Messages »).
 */

export type FormFieldType = "text" | "email" | "tel" | "textarea" | "select" | "checkbox";

/** One field of a form, as the owner declares it. */
export interface FormFieldDef {
  label: string;
  type: FormFieldType;
  required?: "yes" | "no";
  /** Choices of a `select`, one per line. */
  options?: string;
}

/** Name of the section prop that holds the form definition (read by `cmsSubmitForm`). */
export const FORM_FIELDS_PROP = "formFields";

export const FORM_FIELD_TYPES: Array<{ label: string; value: FormFieldType }> = [
  { label: "Texte court", value: "text" },
  { label: "E-mail", value: "email" },
  { label: "Téléphone", value: "tel" },
  { label: "Message (plusieurs lignes)", value: "textarea" },
  { label: "Liste de choix", value: "select" },
  { label: "Case à cocher", value: "checkbox" },
];

/**
 * The fields of a form, editable by the owner (`formFields` prop of a section): label, type,
 * required, choices. Labels are passed to the form component, not written inline on the page.
 */
export function formFieldsField(options: { label?: string } = {}): ArrayField<FormFieldDef[]> {
  return {
    type: "array",
    label: options.label ?? "Champs du formulaire",
    arrayFields: {
      label: {
        type: "text",
        label: "Libellé",
        metadata: { openflowInline: false },
      },
      type: { type: "select", label: "Type", options: FORM_FIELD_TYPES },
      required: {
        type: "radio",
        label: "Obligatoire",
        options: [
          { label: "Oui", value: "yes" },
          { label: "Non", value: "no" },
        ],
      },
      options: {
        type: "textarea",
        label: "Choix (liste : un par ligne)",
        metadata: { openflowInline: false },
      },
    },
    defaultItemProps: { label: "Nouveau champ", type: "text", required: "no", options: "" },
    getItemSummary: (item) => item.label || "Champ",
  } as ArrayField<FormFieldDef[]>;
}

/** Stable name of a field in the submitted data (`message`, `e-mail`, or `champ-3`). */
export function formFieldName(field: FormFieldDef, index: number): string {
  return slugify(String(field?.label ?? "")) || `champ-${index + 1}`;
}

export function formFieldOptions(field: FormFieldDef): string[] {
  return String(field?.options ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export const FORM_LIMITS = { fields: 20, value: 5000, total: 20000 };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\d\s.-]{6,25}$/;

export interface ValidatedSubmission {
  fields: Array<{ label: string; value: string }>;
  /** The first e-mail given, to reply to. */
  email?: string;
}

/**
 * Checks a submission against the form definition: known fields only, required ones present,
 * e-mail and phone formats, choices among the options, lengths. Returns the values in the order
 * of the form, or the errors to show (per field name).
 */
export function validateSubmission(
  definition: FormFieldDef[],
  values: Record<string, unknown>,
): { ok: true; submission: ValidatedSubmission } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const fields: ValidatedSubmission["fields"] = [];
  let email: string | undefined;
  let total = 0;
  definition
    .filter((field) => field && typeof field === "object")
    .slice(0, FORM_LIMITS.fields)
    .forEach((field, index) => {
      const name = formFieldName(field, index);
      const raw = values[name];
      let value =
        field.type === "checkbox"
          ? raw === true || raw === "on" || raw === "true"
            ? "Oui"
            : ""
          : typeof raw === "string"
            ? raw.trim()
            : "";
      value = value.replace(/\r\n/g, "\n");
      total += value.length;
      if (!value) {
        if (field.required === "yes") errors[name] = "Ce champ est obligatoire.";
        return;
      }
      if (value.length > FORM_LIMITS.value) {
        errors[name] = `${FORM_LIMITS.value} caractères au plus.`;
      } else if (field.type === "email" && !EMAIL.test(value)) {
        errors[name] = "Adresse e-mail invalide.";
      } else if (field.type === "tel" && !PHONE.test(value)) {
        errors[name] = "Numéro de téléphone invalide.";
      } else if (field.type === "select" && !formFieldOptions(field).includes(value)) {
        errors[name] = "Choix invalide.";
      } else if (field.type !== "textarea" && value.includes("\n")) {
        errors[name] = "Une seule ligne.";
      }
      if (field.type === "email" && !email && !errors[name]) email = value;
      fields.push({ label: field.label || name, value });
    });
  if (total > FORM_LIMITS.total) errors._form = "Message trop long.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, submission: { fields, ...(email ? { email } : {}) } };
}

/** `cms_messages/{id}`: a message sent with a form of the site. */
export interface MessageDoc {
  formId: string;
  /** Address of the page of the form (`/contact/`). */
  page: string;
  /** Title of the form (or of its page), to recognise it in the inbox. */
  formTitle: string;
  fields: Array<{ label: string; value: string }>;
  email?: string;
  createdAt: string;
  read: boolean;
  /** Likely spam (reCAPTCHA score): kept apart, no notification. */
  spam?: boolean;
  score?: number;
  /** Sent by the AI assistant of the visitor's browser (WebMCP), as the browser reported it. */
  agent?: boolean;
}
