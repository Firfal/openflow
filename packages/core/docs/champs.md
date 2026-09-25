# Types de champs OpenFlow

OpenFlow utilise les champs de [Puck](https://puckeditor.com/docs/api-reference/fields), plus deux
champs propres à OpenFlow (image et lien), branchés sur Firebase dans l'admin.

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
| Lien | `linkField({ label })` | `<a {...linkProps(link)}>{label}</a>` |
| Zone de sections imbriquées | `{ type: "slot" }` | `<Content />` (voir la doc Puck) |

## Valeurs stockées

- `imageField` : `{ "src": "https://…", "alt": "…", "width": 1200, "height": 800 }` ou `null`.
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
