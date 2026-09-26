# Types de champs OpenFlow

OpenFlow utilise les champs de [Puck](https://puckeditor.com/docs/api-reference/fields), plus trois
champs propres à OpenFlow (image, vidéo et lien), branchés sur Firebase dans l'admin.

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
| Zone de sections imbriquées | `{ type: "slot" }` | `<Content />` (voir la doc Puck) |

## Valeurs stockées

- `imageField` : `{ "src": "https://…", "alt": "…", "width": 1200, "height": 800 }` ou `null`.
- `videoField` : `{ "src": "https://….mp4", "poster": "https://….jpg", "description": "…" }` ou `null`
  (MP4 ou WebM, 15 Mo au plus, sans piste son utile : la vidéo est lue muette).
- `linkField` : `{ "kind": "page", "pageId": "a-propos", "href": "/a-propos/", "newTab": false }`,
  `{ "kind": "url", "href": "https://…" }` (ou `mailto:`, `tel:`), ou `null`.
- `text`, `textarea` : une chaîne. `richtext` : du HTML (`<p>…</p>`).

## Bonnes pratiques

- Les **libellés** (`label`) s'affichent au propriétaire : ils sont en français, courts et concrets
  (« Bouton principal (texte) » plutôt que « cta1 »).
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
- Un choix de visuel (démo, image ou vidéo) se déclare avec un champ `radio` et `resolveFields` pour
  masquer dans le panneau les champs qui ne servent pas. Laisse tous les champs dans `fields` et
  `defaultProps` : la norme les contrôle tous.
