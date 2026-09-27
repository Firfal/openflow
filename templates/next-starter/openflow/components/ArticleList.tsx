import { formatDate, getCollection, imageProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import type { ArticleProps } from "./Article";
import { Section, type Tone, toneField } from "./shared";

export interface ArticleListProps {
  title: string;
  intro: string;
  count: "3" | "6" | "12" | "all";
  readMoreLabel: string;
  emptyText: string;
  tone: Tone;
}

/** The latest news items (collection « actualites »), newest first, each linking to its page. */
export const ArticleList: ComponentConfig<ArticleListProps> = {
  label: "Liste d'actualités",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    count: {
      type: "select",
      label: "Nombre d'articles affichés",
      options: [
        { label: "Les 3 derniers", value: "3" },
        { label: "Les 6 derniers", value: "6" },
        { label: "Les 12 derniers", value: "12" },
        { label: "Tous", value: "all" },
      ],
    },
    readMoreLabel: { type: "text", label: "Lien vers l'article (texte)", contentEditable: true },
    emptyText: { type: "text", label: "Texte sans article", contentEditable: true },
    tone: toneField,
  },
  defaultProps: {
    title: "Actualités",
    intro: "Les dernières nouvelles de l'entreprise.",
    count: "3",
    readMoreLabel: "Lire l'article",
    emptyText: "Aucune actualité pour le moment : revenez bientôt.",
    tone: "light",
  },
  render: ({ title, intro, count, readMoreLabel, emptyText, tone, puck }) => {
    const all = getCollection<ArticleProps>(puck.metadata, "actualites");
    const items = count === "all" ? all : all.slice(0, Number(count) || 3);
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
          <ul className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const img = imageProps(item.image, {
                sizes: "(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw",
              });
              return (
                <li key={item.id} className="group relative flex min-w-0 flex-col">
                  {img && (
                    <img
                      {...img}
                      loading="lazy"
                      className="mb-5 aspect-[3/2] w-full rounded-2xl object-cover"
                    />
                  )}
                  {item.date && (
                    <time dateTime={item.date} className="text-sm opacity-70">
                      {formatDate(item.date)}
                    </time>
                  )}
                  <h3 className="mt-2 text-xl font-semibold break-words">
                    {/* The whole card is clickable (the link's area covers it). */}
                    <a href={item.href} className="after:absolute after:inset-0">
                      {item.title}
                    </a>
                  </h3>
                  {item.description && (
                    <p className="mt-3 leading-7 break-words opacity-80">{item.description}</p>
                  )}
                  <span
                    className={`mt-4 text-sm font-semibold group-hover:underline ${tone === "accent" || tone === "dark" ? "" : "text-accent"}`}
                    aria-hidden="true"
                  >
                    {readMoreLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    );
  },
};
