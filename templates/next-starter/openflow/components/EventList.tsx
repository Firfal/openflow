import { formatDate, getCollection, today } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import type { EventProps } from "./Event";
import { Section, type Tone, toneField } from "./shared";

export interface EventListProps {
  title: string;
  intro: string;
  count: "3" | "6" | "all";
  emptyText: string;
  tone: Tone;
}

/**
 * The agenda: coming events of the collection « evenements », the soonest first. Events already
 * over leave the list at the next publication; their page stays online.
 */
export const EventList: ComponentConfig<EventListProps> = {
  label: "Agenda des événements",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    count: {
      type: "select",
      label: "Nombre d'événements affichés",
      options: [
        { label: "Les 3 prochains", value: "3" },
        { label: "Les 6 prochains", value: "6" },
        { label: "Tous ceux à venir", value: "all" },
      ],
    },
    emptyText: { type: "text", label: "Texte sans événement à venir", contentEditable: true },
    tone: toneField,
  },
  defaultProps: {
    title: "Prochains rendez-vous",
    intro: "Ateliers, portes ouvertes et dégustations : venez nous rencontrer.",
    count: "3",
    emptyText: "Pas d’événement prévu pour le moment : revenez bientôt.",
    tone: "light",
  },
  render: ({ title, intro, count, emptyText, tone, puck }) => {
    const now = today();
    const coming = getCollection<EventProps>(puck.metadata, "evenements").filter(
      (event) => !event.date || (event.endDate ?? event.date) >= now,
    );
    const items = count === "all" ? coming : coming.slice(0, Number(count) || 3);
    const subtle = tone === "accent" || tone === "dark" ? "opacity-80" : "text-stone-600";
    return (
      <Section tone={tone}>
        <div className="max-w-2xl">
          {title && (
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
          )}
          {intro && <p className="mt-4 text-lg opacity-80">{intro}</p>}
        </div>
        {items.length === 0 ? (
          <p className="mt-10 opacity-70">{emptyText}</p>
        ) : (
          <ol className="mt-12 divide-y divide-current/15 border-y border-current/15">
            {items.map((event) => (
              <li
                key={event.id}
                className="relative grid grid-cols-[4rem_minmax(0,1fr)] gap-x-5 py-6 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-x-8"
              >
                {/* The day, like a page of a calendar. */}
                <time
                  dateTime={event.date}
                  className="row-span-2 flex flex-col items-center leading-none"
                >
                  <span className="text-3xl font-bold tabular-nums">
                    {formatDate(event.date, "fr", { day: "numeric" })}
                  </span>
                  <span className={`mt-1 text-sm ${subtle}`}>
                    {formatDate(event.date, "fr", { month: "short" })}
                  </span>
                </time>
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold break-words">
                    {/* The whole row is clickable (the link's area covers it). */}
                    <a
                      href={event.href}
                      className="after:absolute after:inset-0 hover:underline focus-visible:underline"
                    >
                      {event.title}
                    </a>
                  </h3>
                  {(event.time || event.location) && (
                    <p className={`mt-1 break-words ${subtle}`}>
                      {[event.time, event.location].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {event.description && (
                    <p className="mt-2 leading-7 break-words opacity-90">{event.description}</p>
                  )}
                </div>
                {event.price && (
                  <p className="col-start-2 mt-3 font-semibold sm:col-start-3 sm:row-start-1 sm:mt-0 sm:pt-1 sm:whitespace-nowrap">
                    {event.price}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>
    );
  },
};
