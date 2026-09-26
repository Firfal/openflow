import { type ImageValue, imageField, imageProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { anchorField, Heading, Section, SelectionFrame, type Surface, surfaceField } from "./ui";

export interface ShowcaseProps {
  anchor: string;
  title: string;
  intro: string;
  image: ImageValue | null;
  imageTag: string;
  callouts: Array<{ title: string; text: string }>;
  gallery: Array<{ image: ImageValue | null; caption: string }>;
  surface: Surface;
}

/** Real screenshots of the admin: the main one wears the selection frame (page signature). */
export const Showcase: ComponentConfig<ShowcaseProps> = {
  label: "Captures de l'interface",
  fields: {
    anchor: anchorField,
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    image: imageField({ label: "Capture principale" }),
    imageTag: { type: "text", label: "Étiquette de la capture", contentEditable: true },
    callouts: {
      type: "array",
      label: "Points clés",
      arrayFields: {
        title: { type: "text", label: "Titre", contentEditable: true },
        text: { type: "textarea", label: "Texte", contentEditable: true },
      },
      defaultItemProps: { title: "Point clé", text: "Une phrase d'explication." },
      getItemSummary: (item) => item.title || "Point clé",
      max: 4,
    },
    gallery: {
      type: "array",
      label: "Autres captures",
      arrayFields: {
        image: imageField({ label: "Capture" }),
        caption: { type: "text", label: "Légende", contentEditable: true },
      },
      defaultItemProps: { image: null, caption: "Légende de la capture" },
      getItemSummary: (item) => item.caption || "Capture",
      max: 3,
    },
    surface: surfaceField,
  },
  defaultProps: {
    anchor: "interface",
    title: "L'éditeur, tel que le voit votre client",
    intro:
      "Pas de maquette : ce sont des captures de l'admin OpenFlow en train d'éditer cette page.",
    image: null,
    imageTag: "Section sélectionnée",
    callouts: [
      {
        title: "Édition sur la page",
        text: "Titres et paragraphes se modifient là où ils s'affichent, sans formulaire.",
      },
      {
        title: "Des sections prêtes à l'emploi",
        text: "Le client ajoute ou réordonne les sections conçues pour lui, sans pouvoir casser le design.",
      },
      {
        title: "Sauvegarde automatique",
        text: "Chaque modification est enregistrée dans Firestore moins d'une seconde après la dernière frappe.",
      },
    ],
    gallery: [],
    surface: "calque",
  },
  render: ({ anchor, title, intro, image, imageTag, callouts, gallery, surface }) => {
    const main = imageProps(image);
    return (
      <Section anchor={anchor} surface={surface}>
        <Heading title={title} intro={intro} surface={surface} />
        {main && (
          <SelectionFrame tag={imageTag} className="mt-20 rounded-xl">
            <img
              {...main}
              loading="lazy"
              decoding="async"
              className="w-full rounded-xl shadow-[0_40px_90px_-40px_rgb(15_30_51/0.55)] ring-1 ring-ink/10"
            />
          </SelectionFrame>
        )}
        <div className="mt-16 grid gap-10 md:grid-cols-3">
          {callouts?.map((callout, index) => (
            <div key={index} className="border-l-2 border-cobalt pl-5">
              {callout.title && <h3 className="text-xl font-bold">{callout.title}</h3>}
              {callout.text && <p className="mt-2 leading-7 text-muted">{callout.text}</p>}
            </div>
          ))}
        </div>
        {gallery && gallery.length > 0 && (
          <div className="mt-20 grid gap-6 md:grid-cols-3">
            {gallery.map((item, index) => {
              const img = imageProps(item.image);
              return (
                <figure key={index}>
                  {/* Thumbnails open the full-size capture. */}
                  {img && (
                    <a
                      href={img.src}
                      className="group block overflow-hidden rounded-lg ring-1 ring-ink/10"
                    >
                      <img
                        {...img}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[16/10] w-full object-cover object-left-top transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                      />
                    </a>
                  )}
                  {item.caption && (
                    <figcaption className="mt-3 text-[15px] text-muted">{item.caption}</figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        )}
      </Section>
    );
  },
};
