import { type ImageValue, imageField, imageProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";
import { anchorField, Heading, Section, type Surface, surfaceField } from "./ui";

export interface ArchitectureProps {
  anchor: string;
  title: string;
  intro: string;
  image: ImageValue | null;
  services: Array<{ name: string; role: string }>;
  surface: Surface;
}

export const Architecture: ComponentConfig<ArchitectureProps> = {
  label: "Architecture",
  fields: {
    anchor: anchorField,
    title: { type: "text", label: "Titre", contentEditable: true },
    intro: { type: "textarea", label: "Introduction", contentEditable: true },
    image: imageField({ label: "Schéma" }),
    services: {
      type: "array",
      label: "Services",
      arrayFields: {
        name: { type: "text", label: "Service", contentEditable: true },
        role: { type: "text", label: "Rôle", contentEditable: true },
      },
      defaultItemProps: { name: "Service", role: "Ce qu'il fait" },
      getItemSummary: (item) => item.name || "Service",
    },
    surface: surfaceField,
  },
  defaultProps: {
    anchor: "firebase",
    title: "Tout reste dans votre projet Firebase",
    intro:
      "Pas de plateforme intermédiaire ni d'abonnement : le site, l'admin et le contenu vivent dans le projet Firebase du client.",
    image: null,
    services: [
      { name: "Hosting", role: "Sert le site statique et /admin" },
      { name: "Firestore", role: "Brouillons, réglages et historique" },
      { name: "Authentication", role: "Le propriétaire, et lui seul" },
      { name: "Storage", role: "Médiathèque et versions publiées" },
      { name: "Functions", role: "Publication et restauration" },
      { name: "Cloud Build", role: "Reconstruit le site à chaque publication" },
    ],
    surface: "encre",
  },
  // The diagram gets the full container width so its labels stay readable; on phones it scrolls
  // sideways inside its own box instead of shrinking to an illegible size.
  render: ({ anchor, title, intro, image, services, surface }) => {
    const img = imageProps(image);
    const rule = surface === "encre" ? "border-white/10" : "border-line";
    return (
      <Section anchor={anchor} surface={surface}>
        <div className="grid items-end gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16 [&>*]:min-w-0">
          <Heading title={title} intro={intro} surface={surface} />
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {services?.map((service, index) => (
              <div key={index} className={`border-t py-3.5 ${rule}`}>
                <dt className="flex items-center gap-3 font-semibold">
                  <span className="h-2 w-2 shrink-0 bg-flame" aria-hidden="true" />
                  {service.name}
                </dt>
                <dd className="mt-1 pl-5 text-[15px] opacity-70">{service.role}</dd>
              </div>
            ))}
          </dl>
        </div>
        {img && (
          <div className="-mx-5 mt-16 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            {/* The link makes the scroll box keyboard reachable and opens the full-size diagram. */}
            <a href={img.src} className="block min-w-[720px]">
              <img {...img} loading="lazy" decoding="async" className="w-full" />
            </a>
          </div>
        )}
      </Section>
    );
  },
};
