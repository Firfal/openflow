import {
  dateField,
  formatDate,
  type ImageValue,
  imageField,
  imageProps,
  type LinkValue,
  linkField,
  linkProps,
  pageLang,
} from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";

export interface EventProps {
  title: string;
  date: string;
  endDate: string;
  time: string;
  place: string;
  price: string;
  excerpt: string;
  cover: ImageValue | null;
  body: string;
  whenLabel: string;
  untilLabel: string;
  timeLabel: string;
  placeLabel: string;
  priceLabel: string;
  ctaLabel: string;
  ctaLink: LinkValue | null;
}

const LONG_DAY = { weekday: "long", day: "numeric", month: "long", year: "numeric" } as const;

/**
 * One event (collection « evenements »): the main block of its page. Its day, time, place and
 * price also feed the agenda sections and the event's structured data (schema.org `Event`), which
 * Google and AI assistants read.
 */
export const Event: ComponentConfig<EventProps> = {
  label: "Événement",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    date: dateField({ label: "Date (premier jour)" }),
    endDate: dateField({ label: "Dernier jour (sur plusieurs jours)" }),
    time: { type: "text", label: "Heure (« 10 h », « 14 h 30 »)", contentEditable: true },
    place: { type: "text", label: "Lieu", contentEditable: true },
    price: { type: "text", label: "Tarif (« 35 € », « Gratuit »)", contentEditable: true },
    excerpt: { type: "textarea", label: "Résumé", contentEditable: true },
    cover: imageField({ label: "Image principale" }),
    body: { type: "richtext", label: "Programme et détails" },
    whenLabel: { type: "text", label: "Intitulé « Date »", contentEditable: true },
    untilLabel: { type: "text", label: "Intitulé « Jusqu'au »", contentEditable: true },
    timeLabel: { type: "text", label: "Intitulé « Heure »", contentEditable: true },
    placeLabel: { type: "text", label: "Intitulé « Où »", contentEditable: true },
    priceLabel: { type: "text", label: "Intitulé « Tarif »", contentEditable: true },
    ctaLabel: { type: "text", label: "Bouton (texte)", contentEditable: true },
    ctaLink: linkField({ label: "Bouton (lien)" }),
  },
  defaultProps: {
    title: "Titre de l’événement",
    date: "2026-10-17",
    endDate: "",
    time: "10 h",
    place: "À l’atelier",
    price: "Gratuit",
    excerpt:
      "Dites en une phrase ce que les participants vont vivre : elle apparaît dans l’agenda.",
    cover: null,
    body: "<p>Programme, public, durée, ce qu’il faut apporter : tout ce qui aide à se décider.</p>",
    whenLabel: "Date",
    untilLabel: "Jusqu’au",
    timeLabel: "Heure",
    placeLabel: "Lieu",
    priceLabel: "Tarif",
    ctaLabel: "Réserver ma place",
    ctaLink: null,
  },
  render: ({
    title,
    date,
    endDate,
    time,
    place,
    price,
    excerpt,
    cover,
    body,
    whenLabel,
    untilLabel,
    timeLabel,
    placeLabel,
    priceLabel,
    ctaLabel,
    ctaLink,
    puck,
  }) => {
    const img = imageProps(cover, { sizes: "(min-width: 768px) 768px, 100vw" });
    const cta = linkProps(ctaLink);
    return (
      <article className="bg-white px-6 pt-16 pb-20 text-stone-900 sm:pt-20">
        <header className="mx-auto max-w-3xl">
          {title && (
            <h1 className="text-4xl font-bold tracking-tight text-balance break-words sm:text-5xl">
              {title}
            </h1>
          )}
          {excerpt && (
            <p className="mt-5 text-xl leading-8 text-pretty break-words opacity-80">{excerpt}</p>
          )}
          <dl className="mt-8 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 border-y border-stone-200 py-6 sm:gap-x-10">
            {date && (
              <>
                <dt className="font-semibold">{whenLabel}</dt>
                <dd className="break-words first-letter:uppercase">
                  {formatDate(date, pageLang(puck.metadata), LONG_DAY)}
                </dd>
              </>
            )}
            {endDate && endDate !== date && (
              <>
                <dt className="font-semibold">{untilLabel}</dt>
                <dd className="break-words first-letter:uppercase">
                  {formatDate(endDate, pageLang(puck.metadata), LONG_DAY)}
                </dd>
              </>
            )}
            {time && (
              <>
                <dt className="font-semibold">{timeLabel}</dt>
                <dd className="break-words">{time}</dd>
              </>
            )}
            {place && (
              <>
                <dt className="font-semibold">{placeLabel}</dt>
                <dd className="break-words">{place}</dd>
              </>
            )}
            {price && (
              <>
                <dt className="font-semibold">{priceLabel}</dt>
                <dd className="break-words">{price}</dd>
              </>
            )}
          </dl>
          {cta && ctaLabel && (
            <a
              {...cta}
              className="mt-8 inline-flex min-h-11 items-center rounded-full bg-accent px-6 py-3 font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {ctaLabel}
            </a>
          )}
        </header>
        {img && (
          <img
            {...img}
            fetchPriority="high"
            className="mx-auto mt-10 aspect-[16/9] w-full max-w-4xl rounded-3xl object-cover"
          />
        )}
        {/* Rich text (`.rich-text`): spacing between blocks, headings, lists and links. */}
        <div className="mx-auto mt-10 max-w-3xl text-lg leading-8 break-words [&_.rich-text>*+*]:mt-5 [&_.rich-text>*+h2]:mt-10 [&_.rich-text>*+h3]:mt-8 [&_a]:text-accent [&_a]:underline [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_h3]:font-semibold [&_li+li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
          {body}
        </div>
      </article>
    );
  },
};
