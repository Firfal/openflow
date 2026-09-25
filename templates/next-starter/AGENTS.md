<!-- BEGIN:openflow-agent-rules -->
# Site OpenFlow : règles pour les agents IA

Ce site est **modifié par son propriétaire, qui n'est pas développeur**, depuis `/admin` (éditeur
visuel OpenFlow basé sur Puck, données dans Firebase). Ton code doit garder **tout le contenu éditable**.
La norme OpenFlow (OFS) est vérifiée automatiquement : lis les retours `OF-xxx` et corrige-les.

## Architecture (à ne pas changer)

- `openflow.config.tsx` : `defineConfig({ site, components, categories, settings })`. Il est partagé
  par le site public et par l'admin.
- `openflow/components/*.tsx` : les **sections**, c'est-à-dire des composants Puck (`ComponentConfig`)
  avec `fields`, `defaultProps` et `render`.
- `openflow/layout/*` : en-tête et pied de page, alimentés par les réglages globaux (`settings`).
- `openflow/seed/` : le contenu de départ (`settings.json`, `pages/<id>.json`), importé dans Firestore
  à la livraison. Il n'écrase jamais le contenu du propriétaire.
- `app/(site)/[[...slug]]/page.tsx` : toutes les pages viennent du snapshot publié. `app/admin/` : l'admin.
- Export statique (`output: "export"`) sur Firebase Hosting. Il n'y a **pas de serveur Next.js**.

## Contrat des sections (obligatoire)

1. **Aucun texte visible en dur** : chaque texte passe par un champ. Titres, boutons et textes courts :
   `{ type: "text", contentEditable: true }`. Paragraphes : `"textarea"` (contentEditable) ou `"richtext"`.
2. **Images** : `imageField()` de `@openflow/core`, affichée avec `imageProps(image)`. N'importe jamais
   d'image et n'écris jamais de `src` fixe.
3. **Liens** : `linkField()`, affiché avec `<a {...linkProps(link)}>`. N'écris jamais de `href` fixe (seuls `#ancre` et `/` sont admis).
4. **`defaultProps` complets et réalistes** pour chaque champ, plus `defaultItemProps` pour chaque liste.
5. **Rendu robuste** : `image?.src`, `items?.map(...)`, des champs vides ou très longs, et aucun accès à `window` ou `document` pendant le rendu.
6. Un champ `contentEditable` s'affiche **uniquement comme contenu d'un élément** (`<h2>{title}</h2>`), jamais
   dans un attribut (`alt`, `title`, `aria-label`) ni dans une chaîne concaténée.
7. Seule la section d'en-tête de page (Hero) utilise `h1`. Les autres sections utilisent `h2` puis `h3`.
8. **Ne renomme ni ne supprime** une section ou un champ déjà livré : le contenu du propriétaire en dépend.
   Ajoute plutôt un nouveau champ avec une valeur par défaut.
9. Styles : classes Tailwind et jetons du thème déclarés dans `app/globals.css` (`@theme`). N'écris pas de couleur
   en dur quand un jeton existe. Dans le modèle de départ, la couleur principale se règle dans Réglages (`bg-accent`, `text-accent`).
10. Aucun accès à Firebase ou Firestore dans `openflow/` ni dans `app/(site)` : le contenu arrive par les props et par `getSettings()`.

Pour une nouvelle section : crée `openflow/components/MaSection.tsx`, ajoute-la à `components` et à une
`categories` dans `openflow.config.tsx`, puis utilise-la dans le contenu de départ si besoin.

## Commandes

- `npx openflow check` : conformité à la norme OFS (le niveau `render` affiche chaque section avec des sentinelles).
- `npx openflow check --level build` : ajoute l'export statique et le contrôle du HTML (alt, h1, liens, SEO).
- `npx openflow dev` : site, admin et émulateurs Firebase en local.
- `npx openflow deploy --project <id> --owner <email>` : livraison (voir le skill `openflow-deploy`).

## Documentation détaillée

- Contrat complet : `node_modules/@openflow/core/docs/contrat.md`
- Types de champs : `node_modules/@openflow/core/docs/champs.md`
- Règles de la norme : `node_modules/@openflow/core/docs/rules/OF-xxx.md` (une page par règle)
<!-- END:openflow-agent-rules -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
