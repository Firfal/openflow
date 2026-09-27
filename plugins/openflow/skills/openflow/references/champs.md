# Types de champs OpenFlow

OpenFlow utilise les champs de [Puck](https://puckeditor.com/docs/api-reference/fields), plus cinq
champs propres à OpenFlow (image, vidéo, lien, date et formulaire), branchés sur Firebase dans l'admin.

| Besoin | Déclaration | Affichage dans `render` |
|---|---|---|
| Titre, bouton, texte court | `{ type: "text", label, contentEditable: true }` | `<h2>{title}</h2>` |
| Paragraphe | `{ type: "textarea", label, contentEditable: true }` | `<p>{text}</p>` |
| Texte mis en forme (gras, listes, liens) | `{ type: "richtext", label }` | `<div>{body}</div>` |
| Nombre | `{ type: "number", label, min, max }` | `{count}` |
| Choix (style, disposition) | `{ type: "select" \| "radio", label, options: [{ label, value }] }` | une classe CSS selon la valeur |
| Liste répétable | `{ type: "array", label, arrayFields, defaultItemProps, getItemSummary }` | `items?.map(...)` |
| Groupe | `{ type: "object", label, objectFields }` | `group.x` |
| Image | `imageField({ label })` | `const img = imageProps(image); img && <img {...img} />` |
| Vidéo muette en boucle | `videoField({ label })` | `const v = videoProps(video); v && <video {...v} muted loop playsInline />` |
| Lien | `linkField({ label })` | `<a {...linkProps(link)}>{label}</a>` |
| Date (publication, événement) | `dateField({ label })` | `<time dateTime={date}>{formatDate(date)}</time>` |
| Formulaire (contact, devis…) | `formFields: formFieldsField()` | `<OpenFlowForm formId={id} fields={formFields} toolDescription="Demander un devis…" … />` (`@openflow/next/forms`) ; `toolDescription` dit à l'assistant IA du visiteur à quoi sert le formulaire (WebMCP) |
| Zone de sections imbriquées | `{ type: "slot" }` | `<Content />` (voir la doc Puck) |

## Valeurs stockées

- `imageField` : `{ "src": "https://…", "alt": "…", "width": 1200, "height": 800 }` ou `null`. À la
  publication, les copies optimisées de la médiathèque sont ajoutées (`variants`).
- `videoField` : `{ "src": "https://….mp4", "poster": "https://….jpg", "description": "…" }` ou `null`
  (MP4, WebM ou MOV, 100 Mo au plus, sans piste son utile : la vidéo est lue muette). Les copies 1080p et
  720p sont ajoutées à la publication (`variants`).
- `formFieldsField` : `[{ "label": "E-mail", "type": "email", "required": "yes", "options": "" }]`.
- `linkField` : `{ "kind": "page", "pageId": "a-propos", "href": "/a-propos/", "newTab": false }`,
  `{ "kind": "url", "href": "https://…" }` (ou `mailto:`, `tel:`), ou `null`.
- `dateField` : `"2026-03-12"` (AAAA-MM-JJ) ou `""`. `formatDate(date, "fr")` donne « 12 mars 2026 » ; une
  valeur invalide est affichée telle quelle, sans erreur.
- `text`, `textarea` : une chaîne. `richtext` : du HTML (`<p>…</p>`), rendu par Puck dans un `div.rich-text`
  (espace ses blocs avec `[&_.rich-text>*+*]:mt-4`, pas avec `space-y-*`).

## Bonnes pratiques

- Les **libellés** (`label`) s'affichent au propriétaire : ils sont en français, courts et concrets
  (« Bouton principal (texte) » plutôt que « cta1 »).
- Un **bouton**, c'est un texte (`contentEditable`) placé **à l'intérieur** de `<a {...linkProps(link)}>`.
  Dans l'éditeur, `linkProps` ajoute au lien le marqueur `data-of-l`, même quand le lien est vide. Ainsi, un
  clic sur le bouton affiche au propriétaire son texte et son lien, et rien d'autre. Le site publié ne porte
  pas ce marqueur.
- Les options de style sont limitées et nommées pour un non-technicien (« Clair », « Sombre », « Couleur »).
  Ne propose jamais de champ de saisie de CSS.
- Pour les listes, `getItemSummary` affiche un résumé lisible de chaque élément.
- Un texte utilisé dans un attribut (`alt`, `aria-label`, `title`) doit être un champ **sans** `contentEditable`.
- Un texte affiché mais qui doit rester une chaîne (commande à copier, valeur passée à un composant client,
  texte concaténé) se déclare avec `metadata: { openflowInline: false }`. Le propriétaire le modifie alors
  dans le panneau de droite, et la norme n'émet plus OF-106 pour ce champ :

  ```tsx
  code: { type: "text", label: "Commande", metadata: { openflowInline: false } },
  ```

## Images et vidéos

- Affiche toujours une image avec `imageProps` et une vidéo avec `videoProps` (règle OF-111) : ces
  fonctions ajoutent le marqueur `data-of` qui permet au propriétaire de **cliquer sur l'image dans la
  page** pour la remplacer depuis la médiathèque.
- Les images importées sont optimisées automatiquement (WebP de 480 à 2560 px). `imageProps` en fait un
  `srcset` : indique la largeur affichée avec `sizes` pour que le navigateur choisisse la bonne copie.
  Sans `sizes`, il suppose que l'image occupe toute la largeur de l'écran.

  ```tsx
  const img = imageProps(image, { sizes: "(min-width: 1024px) 50vw, 100vw" });
  ```

- Les vidéos importées sont réencodées en MP4 1080p et 720p. `videoProps` renvoie des `<source>` dans
  `children` (720p sur mobile) : garde `{...v}` sur la balise `<video>` et n'y ajoute pas d'enfants.
- Dans l'éditeur, une image ou une vidéo vide affiche un emplacement cliquable « Ajouter une image »
  (ou « Ajouter une vidéo »). Si l'absence du média change la mise en page (un en-tête centré sans image,
  par exemple), désactive-le pour que l'éditeur reste fidèle au site publié :

  ```tsx
  image: imageField({ label: "Image", placeholder: false }),
  ```

- Une vidéo doit rester sobre : muette, en boucle, avec un bouton pause toujours visible, et sans lecture
  automatique quand le visiteur préfère réduire les animations (`prefers-reduced-motion`).
- Les images et vidéos de `public/` sont ajoutées à la médiathèque par `openflow seed` (lancé par
  `openflow deploy`), dans « Fichiers du site » : le propriétaire peut toujours y revenir.
## Formulaires

Le propriétaire choisit les champs d'un formulaire (libellé, type, obligatoire, choix) ; les messages
arrivent dans l'admin (« Messages ») et par e-mail. La fonction `cmsSubmitForm` vérifie chaque envoi
contre la page publiée et filtre le spam (champ piège, temps de saisie, limite par visiteur, reCAPTCHA).

```tsx
import { type FormFieldDef, formFieldsField } from "@openflow/core";
import { OpenFlowForm } from "@openflow/next/forms";

fields: {
  formFields: formFieldsField(),
  submitLabel: { type: "text", label: "Bouton d'envoi", metadata: { openflowInline: false } },
  successMessage: { type: "textarea", label: "Message après l'envoi", metadata: { openflowInline: false } },
},
render: ({ id, formFields, submitLabel, successMessage, puck }) => (
  <OpenFlowForm
    formId={id}
    fields={formFields ?? []}
    submitLabel={submitLabel}
    successMessage={successMessage}
    editing={puck?.isEditing}
    classNames={{ form: "grid gap-4", input: "rounded border px-3 py-2" }}
  />
),
```

- Le prop doit s'appeler `formFields`, et `formId` doit être l'`id` de la section : c'est ainsi que la
  fonction retrouve le formulaire dans la page publiée.
- Les textes passés au composant (`submitLabel`, `successMessage`, `note`) se déclarent avec
  `metadata: { openflowInline: false }`.
- `classNames` habille chaque partie (`form`, `field`, `label`, `input`, `checkbox`, `error`, `button`,
  `status`, `note`) ; `status` porte `data-status="sent"` ou `"error"`.
- Le modèle de départ fournit la section `ContactForm` et une page Contact.

## Choix de visuel

- Un choix de visuel (démo, image ou vidéo) se déclare avec un champ `radio` et `resolveFields` pour
  masquer dans le panneau les champs qui ne servent pas. Laisse tous les champs dans `fields` et
  `defaultProps` : la norme les contrôle tous.
