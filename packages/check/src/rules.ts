import type { Severity } from "@openflow/core";

/**
 * Check levels:
 * - `fast`: static analysis of source files (every edit, < 1 s)
 * - `render`: loads `openflow.config.tsx` and renders each section with sentinels (end of task)
 * - `build`: analyses the HTML produced by `next build` (before delivery)
 */
export type CheckLevel = "fast" | "render" | "build";

export interface RuleDefinition {
  id: string;
  title: string;
  severity: Severity;
  level: CheckLevel;
  /** `planned` rules are documented but not enforced yet. */
  status: "active" | "planned";
  why: string;
  /** Fix instructions, written for an AI coding agent. */
  fix: string;
  bad?: string;
  good?: string;
}

/**
 * The OpenFlow Standard (OFS). Single source of truth for the checker, the agent-facing
 * documentation (`@openflow/core/docs/rules`) and the human documentation (`docs/norme`).
 */
export const RULES: RuleDefinition[] = [
  {
    id: "OF-101",
    title: "Texte visible écrit en dur dans une section",
    severity: "error",
    level: "fast",
    status: "active",
    why: "Le propriétaire du site ne peut modifier que ce qui passe par un champ. Un texte écrit en dur dans le JSX est invisible dans l'admin : il faudra rappeler un développeur pour le changer.",
    fix: 'Créez un champ (`type: "text"`, `contentEditable: true` pour un titre ou un bouton ; `"textarea"` ou `"richtext"` pour un paragraphe), mettez le texte actuel dans `defaultProps`, puis affichez `{nomDuChamp}` à la place du texte.',
    bad: `render: () => <h2>Nos services</h2>`,
    good: `fields: { title: { type: "text", contentEditable: true } },
defaultProps: { title: "Nos services" },
render: ({ title }) => <h2>{title}</h2>`,
  },
  {
    id: "OF-102",
    title: "Image écrite en dur au lieu d'un champ image",
    severity: "error",
    level: "fast",
    status: "active",
    why: "Une image importée ou référencée par une URL fixe ne peut pas être remplacée depuis la médiathèque OpenFlow.",
    fix: 'Déclarez `image: imageField({ label: "Image" })` (import depuis `@openflow/core`), mettez `image: null` ou une image d\'exemple dans `defaultProps`, puis affichez-la avec `imageProps(image)` : `{image?.src && <img {...imageProps(image)!} />}`.',
    bad: `import hero from "./hero.jpg";
render: () => <img src={hero.src} alt="Boulangerie" />`,
    good: `fields: { image: imageField({ label: "Photo" }) },
defaultProps: { image: null },
render: ({ image }) => {
  const img = imageProps(image);
  return img ? <img {...img} /> : null;
}`,
  },
  {
    id: "OF-103",
    title: "Lien écrit en dur au lieu d'un champ lien",
    severity: "error",
    level: "fast",
    status: "active",
    why: "Les destinations de liens (pages, e-mail, téléphone, réseaux sociaux) changent. Un `href` fixe ne peut pas être modifié par le propriétaire et casse quand une page est renommée.",
    fix: 'Déclarez `link: linkField({ label: "Lien" })` et affichez `<a {...linkProps(link)}>{label}</a>`. Les ancres internes (`href="#contact"`) et le lien vers l\'accueil (`href="/"`) restent autorisés.',
    bad: `<a href="/contact">Nous écrire</a>`,
    good: `fields: { cta: linkField(), ctaLabel: { type: "text", contentEditable: true } },
render: ({ cta, ctaLabel }) => <a {...linkProps(cta)}>{ctaLabel}</a>`,
  },
  {
    id: "OF-104",
    title: "Champ déclaré mais jamais affiché",
    severity: "error",
    level: "render",
    status: "active",
    why: "Un champ que le rendu n'utilise pas trompe le propriétaire : il modifie une valeur et rien ne change sur le site.",
    fix: "Affichez le champ dans `render` ou supprimez-le de `fields` et de `defaultProps`.",
  },
  {
    id: "OF-105",
    title: "Champ sans valeur par défaut",
    severity: "error",
    level: "render",
    status: "active",
    why: "Quand le propriétaire ajoute une section, Puck utilise `defaultProps`. Sans valeur par défaut, la section apparaît vide ou plante.",
    fix: "Ajoutez chaque champ dans `defaultProps` avec un contenu d'exemple réaliste. Pour une liste, ajoutez aussi `defaultItemProps`. Une image ou un lien peuvent valoir `null`.",
  },
  {
    id: "OF-106",
    title: "Texte affiché mais non éditable directement sur la page",
    severity: "warning",
    level: "render",
    status: "active",
    why: "Un non-technicien s'attend à cliquer sur un texte pour le modifier (comme dans Webflow ou Framer). Sans `contentEditable`, il doit passer par le panneau latéral.",
    fix: "Ajoutez `contentEditable: true` aux champs `text` et `textarea` affichés comme contenu d'un élément. Si le champ doit rester une chaîne (utilisé dans un attribut, copié, concaténé), déclarez `metadata: { openflowInline: false }` sur le champ pour assumer ce choix (voir OF-108).",
  },
  {
    id: "OF-107",
    title: "Section qui plante avec des valeurs limites",
    severity: "error",
    level: "render",
    status: "active",
    why: "Le propriétaire videra des champs, collera de longs textes et supprimera des images. Une section qui plante casse la page entière dans l'éditeur et à la publication.",
    fix: "Protégez le rendu : `image?.src`, `items?.map(...)`, pas d'accès à une propriété d'une valeur potentiellement `null`, pas de dépendance au navigateur (`window`, `document`) pendant le rendu.",
    bad: `render: ({ image, items }) => <><img src={image.src} />{items.map(...)}</>`,
    good: `render: ({ image, items }) => <>{image?.src && <img {...imageProps(image)!} />}{items?.map(...)}</>`,
  },
  {
    id: "OF-108",
    title: "Champ `contentEditable` utilisé dans un attribut ou une chaîne",
    severity: "error",
    level: "render",
    status: "active",
    why: "Dans l'éditeur, un champ `contentEditable` est transformé en élément React éditable. Utilisé dans un attribut (`alt`, `title`, `aria-label`) ou concaténé, il devient « [object Object] ».",
    fix: "Retirez `contentEditable` de ce champ, ou utilisez un second champ non éditable en ligne pour l'attribut.",
    bad: `title: { type: "text", contentEditable: true }
render: ({ title }) => <img alt={title} ... />`,
    good: `title: { type: "text" }
render: ({ title }) => <img alt={title} ... />`,
  },
  {
    id: "OF-201",
    title: "Contenu non conforme au schéma",
    severity: "error",
    level: "render",
    status: "active",
    why: "Le contenu de départ (`openflow/seed`) est importé dans Firestore à la livraison. S'il ne correspond pas aux champs déclarés, l'éditeur affichera des valeurs vides ou fausses.",
    fix: "Corrigez le fichier JSON indiqué : sections existantes uniquement, une propriété par champ déclaré, types respectés (texte, nombre, `{ src, alt }` pour une image, `{ kind, href }` pour un lien).",
  },
  {
    id: "OF-202",
    title: "Section ou champ renommé alors qu'il est utilisé en production",
    severity: "error",
    level: "render",
    status: "planned",
    why: "Renommer ou supprimer un champ utilisé par le contenu en ligne fait disparaître le travail du propriétaire.",
    fix: "Gardez les noms existants, ou ajoutez une migration. Vérifiez avec `openflow check --against-live` (phase 4).",
  },
  {
    id: "OF-203",
    title: "Configuration OpenFlow invalide",
    severity: "error",
    level: "render",
    status: "active",
    why: "`openflow.config.tsx` est partagé par le site public et l'admin ; une erreur empêche l'un ou l'autre de fonctionner.",
    fix: "Utilisez `defineConfig({ site: { name, lang }, components, settings })`, des noms de sections en PascalCase, et des catégories qui référencent des sections existantes.",
  },
  {
    id: "OF-301",
    title: "API incompatible avec l'export statique",
    severity: "error",
    level: "fast",
    status: "active",
    why: 'Le site est publié en HTML statique sur Firebase Hosting (`output: "export"`) : il n\'y a pas de serveur Next.js en production.',
    fix: 'Supprimez l\'usage de `next/headers` (`cookies()`, `headers()`), des Server Actions (`"use server"`), du middleware ou proxy, de `dynamic = "force-dynamic"`, de `revalidate` et de `dynamicParams = true`. Gardez `output: "export"` et `images.unoptimized: true` dans `next.config.ts`. Les redirections vont dans `firebase.json`.',
  },
  {
    id: "OF-302",
    title: "Lecture de Firebase depuis le rendu public",
    severity: "error",
    level: "fast",
    status: "active",
    why: "Le contenu publié vient du snapshot figé au moment de « Publier ». Lire Firestore depuis une page publique montrerait les brouillons, exposerait les données, et les règles de sécurité le bloquent de toute façon.",
    fix: "Lisez le contenu via les props des sections, et les réglages via `getSettings()` de `@openflow/next`. Seul `app/admin` utilise Firebase (via `@openflow/admin`).",
  },
  {
    id: "OF-303",
    title: "Configuration Firebase OpenFlow modifiée ou incomplète",
    severity: "error",
    level: "fast",
    status: "active",
    why: "`firebase.json`, `firestore.rules` et `storage.rules` garantissent que seul le propriétaire modifie le site et que l'admin est servi correctement.",
    fix: 'Ne modifiez pas les blocs `// BEGIN openflow` … `// END openflow` des règles. Gardez `hosting.public: "out"` et la réécriture `/admin/**` vers `/admin/index.html` dans `firebase.json`. Vous pouvez ajouter vos propres règles en dehors des blocs.',
  },
  {
    id: "OF-304",
    title: "Secret écrit dans le code",
    severity: "error",
    level: "fast",
    status: "active",
    why: "Le code du site est archivé et déployé ; un secret dans le code finit sur Cloud Storage et parfois dans le navigateur.",
    fix: "Supprimez le secret, révoquez-le, et utilisez un secret Cloud Functions (`defineSecret`) côté serveur. La clé d'API web Firebase n'est pas un secret et reste autorisée.",
  },
  {
    id: "OF-401",
    title: "Image sans attribut alt",
    severity: "error",
    level: "build",
    status: "active",
    why: "Accessibilité (lecteurs d'écran) et référencement.",
    fix: 'Affichez l\'image avec `imageProps(image)`, qui fournit toujours `alt`. Pour une image décorative codée en dur, utilisez `alt=""`.',
  },
  {
    id: "OF-402",
    title: "Hiérarchie de titres incorrecte",
    severity: "warning",
    level: "build",
    status: "active",
    why: "Une page doit avoir un seul `h1`, et les niveaux ne doivent pas sauter (h2 → h4). C'est important pour le référencement et l'accessibilité.",
    fix: "Réservez `h1` à la section d'en-tête de page (par exemple le Hero), et utilisez `h2` puis `h3` dans les autres sections.",
  },
  {
    id: "OF-403",
    title: "Titre ou description de page manquant",
    severity: "error",
    level: "build",
    status: "active",
    why: "`<title>` et la meta description sont affichés par les moteurs de recherche.",
    fix: "Utilisez `generateMetadata` de `createOpenFlowPage()` et remplissez `seo.title` et `seo.description` dans le contenu de départ de chaque page.",
  },
  {
    id: "OF-404",
    title: "Lien interne cassé",
    severity: "error",
    level: "build",
    status: "active",
    why: "Un lien vers une page inexistante produit une erreur 404.",
    fix: 'Utilisez un champ lien de type page (`{ "kind": "page", "pageId": "…" }`), qui est recalculé à chaque publication.',
  },
  {
    id: "OF-405",
    title: "Langue de la page non déclarée",
    severity: "error",
    level: "build",
    status: "active",
    why: "`<html lang>` est nécessaire aux lecteurs d'écran et aux moteurs de recherche.",
    fix: "Dans `app/layout.tsx`, utilisez `<html lang={getSite().lang}>`.",
  },
];

export const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

export function getRule(id: string): RuleDefinition {
  const rule = RULES_BY_ID.get(id);
  if (!rule) throw new Error(`Unknown OpenFlow rule ${id}`);
  return rule;
}

/** Path of the agent-facing documentation of a rule, relative to the site root. */
export function ruleDocPath(id: string): string {
  return `node_modules/@openflow/core/docs/rules/${id}.md`;
}
