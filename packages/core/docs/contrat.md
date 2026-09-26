# Contrat d'intégration OpenFlow

Ce document est destiné aux agents IA (Claude Code, Cursor…) et aux développeurs qui créent ou
modifient un site OpenFlow. Il est installé avec `@openflow/core` : sa version correspond toujours au SDK utilisé.

## Principe

Le propriétaire du site **n'est pas développeur**. Il modifie son site depuis `/admin` :
- il clique sur un texte de la page pour le réécrire ;
- il clique sur une image ou une vidéo de la page pour la remplacer depuis la médiathèque ;
- il ajoute, déplace, duplique ou supprime des **sections** ;
- il change le style d'une section ou d'un élément, écran par écran (onglet « Style ») ;
- il édite les réglages communs (menu, pied de page) et le thème (couleurs et polices) ;
- il clique sur « Publier » : le site est reconstruit en HTML statique sur Firebase Hosting.

Le développeur (ou l'agent) écrit **le design et les sections**. Le propriétaire gère **le contenu**. La
frontière entre les deux est constituée des **champs** déclarés par chaque section.

## Fichiers

| Fichier | Rôle | Qui le modifie |
|---|---|---|
| `openflow.config.tsx` | `defineConfig({ site, components, categories, settings, layout })` | Agent |
| `openflow/components/*.tsx` | Sections (`ComponentConfig` Puck) | Agent |
| `openflow/layout/*` | `SiteLayout` (en-tête, pied de page, thème) et champs des réglages (`settings`) | Agent |
| `app/(site)/layout.tsx` | `createOpenFlowLayout(config)` : rend `layout` autour des pages | Ne pas modifier |
| `openflow/seed/settings.json` | Réglages de départ (`site` et `values`) | Agent, avant livraison |
| `openflow/seed/pages/<id>.json` | Pages de départ | Agent, avant livraison |
| `app/(site)/[[...slug]]/page.tsx` | Rendu des pages à partir du snapshot | Ne pas modifier |
| `app/admin/*` | Admin OpenFlow | Ne pas modifier |
| `firebase.json`, `*.rules`, `functions/` | Infrastructure et sécurité | Seulement hors des blocs `openflow` |

## Anatomie d'une section

```tsx
import { type ImageValue, imageField, imageProps, type LinkValue, linkField, linkProps } from "@openflow/core";
import type { ComponentConfig } from "@puckeditor/core";

export interface OffreProps {
  title: string;
  text: string;
  image: ImageValue | null;
  ctaLabel: string;
  cta: LinkValue | null;
  items: Array<{ label: string }>;
}

export const Offre: ComponentConfig<OffreProps> = {
  label: "Offre",                                   // nom affiché au propriétaire
  fields: {
    title: { type: "text", label: "Titre", contentEditable: true },
    text: { type: "textarea", label: "Texte", contentEditable: true },
    image: imageField({ label: "Image" }),
    ctaLabel: { type: "text", label: "Bouton (texte)", contentEditable: true },
    cta: linkField({ label: "Bouton (lien)" }),
    items: {
      type: "array",
      label: "Avantages",
      arrayFields: { label: { type: "text", label: "Avantage", contentEditable: true } },
      defaultItemProps: { label: "Nouvel avantage" },
      getItemSummary: (item) => item.label || "Avantage",
    },
  },
  defaultProps: {
    title: "Notre offre découverte",
    text: "Profitez d'une première séance offerte.",
    image: null,
    ctaLabel: "Réserver",
    cta: null,
    items: [{ label: "Sans engagement" }],
  },
  render: ({ title, text, image, ctaLabel, cta, items }) => {
    const img = imageProps(image);
    return (
      <section className="px-6 py-20">
        <h2 className="text-3xl font-bold">{title}</h2>
        {text && <p className="mt-4">{text}</p>}
        {img && <img {...img} className="mt-8 rounded-2xl" />}
        <ul>{items?.map((item, i) => <li key={i}>{item.label}</li>)}</ul>
        {ctaLabel && <a {...linkProps(cta)} className="btn">{ctaLabel}</a>}
      </section>
    );
  },
};
```

Puis, dans `openflow.config.tsx` : `components: { …, Offre }` et `categories.content.components: [..., "Offre"]`.

## Règles (norme OFS)

- **OF-101** : aucun texte visible écrit en dur. Cela vaut aussi pour les valeurs de secours (`{title || "Titre"}`)
  et pour les constantes (`const LABEL = "..."`).
- **OF-102** : aucune image importée ni aucun `src` fixe. Utilise `imageField()` et `imageProps()`.
- **OF-103** : aucun `href` fixe, sauf `#ancre` et `/`. Utilise `linkField()` et `linkProps()`.
- **OF-104** : chaque champ déclaré est affiché.
- **OF-105** : chaque champ a une valeur dans `defaultProps`, et chaque liste a des `defaultItemProps`.
- **OF-106** : les textes affichés comme contenu sont `contentEditable` (le propriétaire clique dessus pour les modifier).
- **OF-107** : le rendu résiste aux champs vides, aux textes très longs et aux images ou listes absentes.
- **OF-108** : un champ `contentEditable` n'apparaît jamais dans un attribut ni dans une chaîne.
- **OF-109** : un champ éditable reste visible dans l'éditeur (`puck?.isEditing`), même s'il n'apparaît sur le
  site que dans un état caché (animation, `opacity-0`, très grand écran).
- **OF-110** : une section a un seul élément racine (une `<section>`, un `<div>`…), pas un fragment de frères.
- **OF-111** : une image est affichée avec `imageProps()` et une vidéo avec `videoProps()`, pour que le propriétaire
  puisse cliquer dessus dans la page.
- **OF-201** : le contenu de départ respecte les champs déclarés.
- **OF-202** : on ne renomme ni ne supprime un champ ou une section déjà livrés.
- **OF-203** : la config est valide (sections en PascalCase, `site.name`).
- **OF-301** : export statique uniquement (pas de `next/headers`, pas de Server Actions, pas de middleware, pas d'ISR).
- **OF-302** : aucun accès à Firebase dans le rendu public.
- **OF-303** : les blocs `openflow` de `firebase.json` et des règles de sécurité ne sont pas modifiés.
- **OF-304** : aucun secret dans le code.
- **OF-401 à OF-405** : HTML accessible et référençable (`alt`, un seul `h1`, `<title>` et description, liens valides, `lang`).

Le détail de chaque règle se trouve dans `docs/rules/OF-xxx.md`.

## Pièges fréquents

- **`contentEditable` dans l'éditeur.** Dans l'éditeur, un champ `contentEditable` est remplacé par un élément React
  éditable. Affiche-le toujours sous la forme `{title}`, jamais dans `title.toUpperCase()`, `alt={title}` ou `` `${title} !` ``.
- **Texte enrichi.** La valeur d'un champ `richtext` est déjà rendue par Puck : affiche `{body}` dans un `div`.
- **Composants client.** Les composants interactifs (`useState`, carrousel…) vont dans un fichier `"use client"`.
  Rien ne doit accéder au navigateur pendant le rendu initial.
- **En-tête, pied de page, thème : `layout`.** Déclare `layout: SiteLayout` dans `defineConfig`. `SiteLayout` reçoit
  `{ settings, site, children, editing }` et entoure les sections. Le site publié l'utilise via
  `createOpenFlowLayout(config)`, et l'admin l'affiche autour de la page éditée : le propriétaire voit sa page
  dans son vrai cadre, avec la couleur du thème. Pas de `useState` ni d'accès au navigateur dans `SiteLayout`.
- **Réglages globaux.** Ils arrivent dans `SiteLayout` par la prop `settings`. Ailleurs côté serveur :
  `getSettings(config)` de `@openflow/next`.
- **États cachés.** Un texte visible seulement pendant une animation, au survol ou sur très grand écran doit aussi
  s'afficher quand `puck?.isEditing` est vrai (OF-109). Les `<details>` sont ouverts automatiquement dans l'éditeur.
- **Images du contenu de départ.** Elles peuvent pointer vers `public/` (`"/images/x.jpg"`). `openflow seed` les
  ajoute à la médiathèque (« Fichiers du site ») : le propriétaire peut les remplacer, puis y revenir.
- **Vidéo.** `videoField()` et `videoProps()` : vidéo muette, en boucle, avec un bouton pause, et sans lecture
  automatique si le visiteur préfère réduire les animations. Voir `champs.md`.

## Style libre et thème

Le propriétaire peut modifier le style de chaque section et de chaque élément (onglet « Style » de
l'éditeur). OpenFlow stocke ces réglages dans la prop réservée `_style` et génère le CSS lui-même : tu
n'as rien à coder, mais la section doit s'y prêter.

- **Une seule racine par section** (OF-110) : le style « Section » s'applique à cet élément.
- **Un texte seul dans son élément** : `<h2>{title}</h2>` plutôt que `<h2>{title} {suffix}</h2>`. Le style
  d'un texte (alignement, marges, fond) s'applique à l'élément qui le contient.
- **Pas de `!important`** dans les classes des sections : il empêcherait le propriétaire de changer le style.
- **Aucun champ dont le nom commence par `_`** (OF-203) : ces noms sont réservés à OpenFlow.
- Pour un site où seul le contenu doit changer : `editor: { styles: "off" }` dans `defineConfig`.

Le propriétaire peut aussi confier ces modifications à une IA (serveur MCP et WebMCP) : écris des libellés de
champs clairs, car l'IA s'en sert pour comprendre les sections.

Le **thème** expose au propriétaire les variables de `app/globals.css` (Réglages > Thème) :

```tsx
theme: {
  colors: [{ token: "ink", label: "Encre (fonds sombres, texte)", value: "#0f1e33" }], // --color-ink
  fonts: [{ token: "display", label: "Police des titres", value: "var(--font-bricolage)" }], // --font-display
  fontOptions: [{ label: "Bricolage Grotesque", value: "var(--font-bricolage)" }],
},
```

- Chaque jeton correspond à une variable déclarée dans `@theme` (pas `@theme inline`, dont les valeurs sont
  recopiées dans les classes et ne peuvent plus changer), et `value` reprend sa valeur actuelle.
- Les polices proposées (`fontOptions`) sont des variables des polices déjà chargées par le site. Un jeton de
  police ne doit pas pointer vers lui-même : déclare les polices sous leur nom
  (`--font-bricolage: "Bricolage Grotesque", …`) et les rôles à part (`--font-display: var(--font-bricolage)`).

## Contenu de départ (seed)

```json
{
  "slug": "",
  "title": "Accueil",
  "status": "published",
  "seo": { "title": "…", "description": "…" },
  "data": {
    "root": { "props": {} },
    "content": [{ "type": "Offre", "props": { "id": "offre-1", "title": "…" } }]
  }
}
```

- Le nom du fichier est l'identifiant de la page (`accueil.json` → `accueil`).
- Le slug de l'accueil est `""`. Les autres slugs sont en minuscules, avec des tirets, séparés par `/`.
- Lien interne : `{ "kind": "page", "pageId": "a-propos", "href": "/a-propos/" }`. Le `href` est recalculé à chaque publication.
- À la livraison, `openflow deploy` importe le contenu de départ **sans écraser** ce qui existe déjà dans Firestore.
