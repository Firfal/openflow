import {
  adjacentEntries,
  dateField,
  formatDate,
  type ImageValue,
  imageField,
  imageProps,
} from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";

export interface ArticleProps {
  title: string;
  date: string;
  excerpt: string;
  cover: ImageValue | null;
  body: string;
  previousLabel: string;
  nextLabel: string;
}

/**
 * One news item (collection « actualites »): the main block of its page. The owner writes it in
 * place; the list sections show its title, date, summary and image.
 */
export const Article: ComponentConfig<ArticleProps> = {
  label: "Article",
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    date: dateField({ label: "Date de publication" }),
    excerpt: { type: "textarea", label: "Résumé", contentEditable: true },
    cover: imageField({ label: "Image principale" }),
    body: { type: "richtext", label: "Texte de l'article" },
    previousLabel: { type: "text", label: "Lien vers l'article précédent", contentEditable: true },
    nextLabel: { type: "text", label: "Lien vers l'article suivant", contentEditable: true },
  },
  defaultProps: {
    title: "Titre de l'article",
    date: "2026-01-15",
    excerpt: "Résumez l'article en une ou deux phrases : elles apparaissent dans les listes.",
    cover: null,
    body: "<p>Écrivez ici votre article. Un paragraphe court par idée se lit mieux sur mobile.</p>",
    previousLabel: "Plus récent",
    nextLabel: "Plus ancien",
  },
  render: ({ title, date, excerpt, cover, body, previousLabel, nextLabel, puck }) => {
    const img = imageProps(cover, { sizes: "(min-width: 768px) 768px, 100vw" });
    // The items are listed newest first: the previous one is more recent.
    const { previous, next } = adjacentEntries(puck.metadata);
    return (
      <article className="bg-white px-6 pt-16 pb-20 text-stone-900 sm:pt-20">
        <header className="mx-auto max-w-3xl">
          {date && (
            <time dateTime={date} className="text-sm font-medium text-accent">
              {formatDate(date)}
            </time>
          )}
          {title && (
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance break-words sm:text-5xl">
              {title}
            </h1>
          )}
          {excerpt && (
            <p className="mt-5 text-xl leading-8 text-pretty break-words opacity-80">{excerpt}</p>
          )}
        </header>
        {img && (
          <img
            {...img}
            fetchPriority="high"
            className="mx-auto mt-10 aspect-[16/9] w-full max-w-4xl rounded-3xl object-cover shadow-sm"
          />
        )}
        {/* Rich text (`.rich-text`): spacing between blocks, headings, lists and links. */}
        <div className="mx-auto mt-10 max-w-3xl text-lg leading-8 break-words [&_.rich-text>*+*]:mt-5 [&_.rich-text>*+h2]:mt-10 [&_.rich-text>*+h3]:mt-8 [&_a]:text-accent [&_a]:underline [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_h3]:font-semibold [&_li+li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
          {body}
        </div>
        {(previous || next) && (
          <nav
            aria-label="Autres articles"
            className="mx-auto mt-16 grid max-w-3xl gap-4 border-t border-stone-200 pt-8 sm:grid-cols-2"
          >
            {previous && (
              <a
                href={previous.href}
                className="group rounded-2xl p-4 ring-1 ring-stone-200 transition-colors hover:bg-stone-50"
              >
                <span className="text-sm text-stone-500">{previousLabel}</span>
                <span className="mt-1 block font-semibold group-hover:text-accent">
                  {previous.title}
                </span>
              </a>
            )}
            {next && (
              <a
                href={next.href}
                className="group rounded-2xl p-4 text-right ring-1 ring-stone-200 transition-colors hover:bg-stone-50 sm:col-start-2"
              >
                <span className="text-sm text-stone-500">{nextLabel}</span>
                <span className="mt-1 block font-semibold group-hover:text-accent">
                  {next.title}
                </span>
              </a>
            )}
          </nav>
        )}
      </article>
    );
  },
};
