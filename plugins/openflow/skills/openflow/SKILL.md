---
name: openflow
description: Contrat OpenFlow pour créer ou modifier un site Next.js dont le propriétaire (non développeur) édite lui-même le contenu depuis /admin (éditeur visuel Puck, backend 100 % Firebase). À utiliser dès qu'on parle d'OpenFlow, de créer un site « modifiable par le client », ou quand le projet contient openflow.config.tsx.
---

# OpenFlow : contrat d'intégration

OpenFlow rend un site Next.js **éditable par son propriétaire** : il clique sur un texte pour le
modifier, change les images, ajoute ou réordonne des sections, puis clique sur « Publier ». Le site
est ensuite régénéré en HTML statique sur Firebase Hosting.

Ton rôle : produire un site **beau et 100 % éditable**, conforme à la norme OFS. Les hooks du plugin
vérifient la conformité à chaque modification. Quand un message `OF-xxx` apparaît, corrige
immédiatement le problème signalé.

## Choisir le bon workflow

- Créer un site : suis le skill **openflow-new-site**.
- Livrer ou déployer : le skill **openflow-deploy**, déclenché par l'utilisateur avec `/openflow:openflow-deploy`.
- Modifier un site existant : lis `AGENTS.md` à la racine du site, puis respecte le contrat ci-dessous.

## Le contrat en bref

1. Le site est composé de **sections** : `openflow/components/*.tsx`, chacune un `ComponentConfig` Puck
   avec `fields`, `defaultProps` et `render`, déclaré dans `openflow.config.tsx`.
2. **Aucun texte visible, aucune image, aucun lien écrit en dur** : tout passe par des champs.
   - Texte court : `{ type: "text", contentEditable: true }`.
   - Paragraphe : `"textarea"` (contentEditable) ou `"richtext"`.
   - Image : `imageField()`, affichée avec `imageProps(image)`.
   - Lien : `linkField()`, affiché avec `<a {...linkProps(link)}>`.
3. Des `defaultProps` réalistes pour chaque champ, plus `defaultItemProps` pour chaque liste.
4. Rendu robuste : valeurs vides, textes très longs, images absentes (`image?.src`, `items?.map`).
5. Un champ `contentEditable` s'affiche comme contenu d'un élément, jamais dans un attribut.
6. Un seul `h1` par page (section d'en-tête), puis `h2` et `h3`.
7. Export statique : pas de `cookies()`, pas de Server Actions, pas de middleware, pas d'ISR.
8. Aucun accès à Firebase dans le rendu public : le contenu arrive par les props.
9. Ne renomme ni ne supprime jamais un champ déjà livré. Ajoute plutôt un nouveau champ.

Détails : [references/contrat.md](references/contrat.md) · champs : [references/champs.md](references/champs.md) ·
règles : [references/norme.md](references/norme.md).

## Vérifier

```bash
npx openflow check                 # norme OFS (sections affichées avec des sentinelles)
npx openflow check --level build   # + export statique et contrôle du HTML
```

Un site n'est terminé que lorsque `openflow check --level build` affiche « conforme à la norme OFS ✓ ».
