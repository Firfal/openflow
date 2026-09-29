import {
  BOOKING_LABEL_DEFAULTS,
  BOOKING_RULE_DEFAULTS,
  type BookingLabels,
  type BookingService,
  type BusinessInfo,
  bookingLabelsField,
  bookingRuleFields,
  bookingRulesOf,
  bookingServicesField,
  pageLang,
} from "@openflow/core";
import { OpenFlowBooking } from "@openflow/next/booking";
import type { ComponentConfig } from "@puckeditor/core";
import { Section, type Tone, toneField } from "./shared";

export interface BookingProps {
  title: string;
  intro: string;
  bookingServices: BookingService[];
  bookingStep: string;
  bookingNotice: string;
  bookingHorizon: string;
  bookingBuffer: string;
  bookingLabels: BookingLabels;
  submitLabel: string;
  successMessage: string;
  note: string;
  tone: Tone;
}

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 aria-[invalid=true]:border-red-600";
const choice =
  "rounded-lg ring-1 ring-stone-300 transition-colors hover:enabled:not-aria-pressed:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:bg-accent aria-pressed:text-white aria-pressed:ring-accent disabled:cursor-not-allowed disabled:opacity-35";

/**
 * Appointments: the owner lists the services and their duration; the free times follow the
 * opening hours of « Établissement ». Visitors book in three steps; the owner sees the
 * appointments in the admin (« Rendez-vous ») and by e-mail.
 */
export const Booking: ComponentConfig<BookingProps> = {
  label: "Prise de rendez-vous",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    bookingServices: bookingServicesField(),
    ...bookingRuleFields(),
    submitLabel: {
      type: "text",
      label: "Bouton de réservation",
      metadata: { openflowInline: false },
    },
    successMessage: {
      type: "textarea",
      label: "Message après la réservation",
      metadata: { openflowInline: false },
    },
    note: {
      type: "textarea",
      label: "Mention sous le formulaire (données personnelles)",
      metadata: { openflowInline: false },
    },
    bookingLabels: bookingLabelsField(),
    tone: toneField,
  },
  defaultProps: {
    title: "Prendre rendez-vous",
    intro: "Choisissez une prestation, puis le jour et l'heure qui vous conviennent.",
    bookingServices: [
      {
        name: "Premier rendez-vous",
        duration: "30",
        price: "",
        description: "Un échange pour faire connaissance et comprendre votre besoin.",
      },
    ],
    ...BOOKING_RULE_DEFAULTS,
    submitLabel: "Réserver ce créneau",
    successMessage:
      "C'est réservé ! Nous avons bien noté votre rendez-vous. Pour le modifier ou l'annuler, contactez-nous.",
    note: "Vos coordonnées servent uniquement à gérer ce rendez-vous. Elles sont effacées un an après.",
    bookingLabels: BOOKING_LABEL_DEFAULTS,
    tone: "muted",
  },
  render: ({
    id,
    title,
    intro,
    submitLabel,
    successMessage,
    note,
    bookingLabels,
    tone,
    puck,
    ...props
  }) => {
    const rules = bookingRulesOf(props as unknown as Record<string, unknown>);
    const business = (puck?.metadata?.site as { business?: BusinessInfo } | undefined)?.business;
    return (
      <Section tone={tone}>
        <div className="grid gap-12 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-2">
            {title && (
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {title}
              </h2>
            )}
            {intro && <p className="mt-4 text-lg leading-8 opacity-80">{intro}</p>}
            {rules.services.length > 0 && (
              <ul className="mt-8 grid gap-4">
                {rules.services.map((service, index) => (
                  <li key={`${service.name}-${index}`} className="break-words">
                    <p className="font-semibold">{service.name}</p>
                    {service.description && (
                      <p className="mt-1 text-sm leading-6 opacity-75">{service.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0 rounded-2xl bg-white p-5 text-stone-900 shadow-sm ring-1 ring-black/5 sm:p-8 lg:col-span-3">
            <OpenFlowBooking
              sectionId={id}
              rules={rules}
              business={business}
              submitLabel={submitLabel}
              successMessage={successMessage}
              note={note}
              labels={bookingLabels}
              lang={pageLang(puck?.metadata)}
              editing={puck?.isEditing}
              classNames={{
                root: "grid gap-6",
                placeholder:
                  "h-56 animate-pulse rounded-xl bg-stone-100 motion-reduce:animate-none",
                step: "m-0 grid min-w-0 gap-3 border-0 p-0",
                legend: "mb-3 text-sm font-semibold first-letter:uppercase",
                services: "grid gap-2 sm:grid-cols-2",
                service:
                  "flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 ring-1 ring-stone-300 has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent [&>input]:sr-only",
                serviceName: "font-semibold break-words",
                serviceMeta: "text-sm text-stone-600",
                nav: "flex items-center gap-2",
                navButton: `grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl ${choice}`,
                days: "grid min-w-0 flex-1 grid-cols-7 gap-1.5",
                day: `flex min-h-16 flex-col items-center justify-center px-0.5 py-2 text-xs leading-tight ${choice} [&>span:nth-child(2)]:text-base [&>span:nth-child(2)]:font-semibold`,
                times: "grid grid-cols-3 gap-2 sm:grid-cols-4",
                time: `min-h-11 text-sm font-medium tabular-nums ${choice}`,
                empty: "rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700",
                form: "grid gap-4 border-t border-stone-200 pt-6",
                summary: "text-sm leading-6 first-letter:uppercase",
                field: "grid gap-1.5",
                label: "text-sm font-semibold",
                input: field,
                error: "text-sm text-red-700",
                button:
                  "justify-self-start rounded-full bg-accent px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-60",
                secondary:
                  "rounded-full px-6 py-3 font-semibold ring-1 ring-stone-300 transition hover:bg-stone-50",
                status:
                  "rounded-lg bg-stone-100 px-4 py-3 text-sm font-medium outline-none data-[status=error]:bg-red-50 data-[status=error]:text-red-800 data-[status=sent]:bg-green-50 data-[status=sent]:text-green-800",
                note: "text-xs leading-5 text-stone-500",
              }}
            />
          </div>
        </div>
      </Section>
    );
  },
};
