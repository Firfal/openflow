import { type FormFieldDef, formFieldsField } from "@openflow/core";
import { OpenFlowForm } from "@openflow/next/forms";
import type { ComponentConfig } from "@puckeditor/core";
import { Section, type Tone, toneField } from "./shared";

export interface ContactFormProps {
  title: string;
  intro: string;
  formFields: FormFieldDef[];
  submitLabel: string;
  successMessage: string;
  note: string;
  tone: Tone;
}

/**
 * Contact form: the owner chooses its fields; messages arrive in the admin (« Messages ») and by
 * e-mail. Spam is filtered server side (hidden field, filling time, limit per visitor, reCAPTCHA).
 */
export const ContactForm: ComponentConfig<ContactFormProps> = {
  label: "Formulaire de contact",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    formFields: formFieldsField(),
    submitLabel: {
      type: "text",
      label: "Bouton d'envoi",
      metadata: { openflowInline: false },
    },
    successMessage: {
      type: "textarea",
      label: "Message après l'envoi",
      metadata: { openflowInline: false },
    },
    note: {
      type: "textarea",
      label: "Mention sous le formulaire (données personnelles)",
      metadata: { openflowInline: false },
    },
    tone: toneField,
  },
  defaultProps: {
    title: "Contactez-nous",
    intro: "Une question, un projet ? Écrivez-nous : nous répondons sous 48 heures.",
    formFields: [
      { label: "Nom", type: "text", required: "yes", options: "" },
      { label: "E-mail", type: "email", required: "yes", options: "" },
      { label: "Téléphone", type: "tel", required: "no", options: "" },
      { label: "Message", type: "textarea", required: "yes", options: "" },
    ],
    submitLabel: "Envoyer le message",
    successMessage: "Merci ! Votre message est bien parti, nous vous répondons rapidement.",
    note: "Vos coordonnées servent uniquement à vous répondre. Elles ne sont ni cédées ni utilisées à d'autres fins.",
    tone: "muted",
  },
  render: ({ id, title, intro, formFields, submitLabel, successMessage, note, tone, puck }) => (
    <Section tone={tone}>
      <div className="grid gap-12 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {title && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>}
          {intro && <p className="mt-4 text-lg leading-8 opacity-80">{intro}</p>}
        </div>
        <div className="rounded-2xl bg-white p-6 text-stone-900 shadow-sm ring-1 ring-black/5 sm:p-8 lg:col-span-3">
          <OpenFlowForm
            formId={id}
            fields={formFields ?? []}
            submitLabel={submitLabel}
            successMessage={successMessage}
            note={note}
            editing={puck?.isEditing}
            classNames={{
              form: "grid gap-5",
              field: "grid gap-1.5",
              label: "text-sm font-semibold",
              input:
                "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 aria-[invalid=true]:border-red-600",
              checkbox: "mr-2 h-4 w-4 accent-accent align-middle",
              error: "text-sm text-red-700",
              button:
                "justify-self-start rounded-full bg-accent px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-60",
              status:
                "rounded-lg bg-stone-100 px-4 py-3 text-sm font-medium outline-none data-[status=error]:bg-red-50 data-[status=error]:text-red-800 data-[status=sent]:bg-green-50 data-[status=sent]:text-green-800",
              note: "text-xs leading-5 text-stone-500",
            }}
          />
        </div>
      </div>
    </Section>
  ),
};
