# Architecture

## Vue d'ensemble

```
Projet Firebase du client (plan Blaze)
├─ Firebase Hosting  → site statique (export Next.js) + /admin (page client-only)
├─ Firebase Auth     → propriétaire (claim personnalisé `of_owner`)
├─ Firestore         → brouillons des pages, réglages, historique des publications
├─ Cloud Storage     → médias, archives du code source, snapshots publiés
├─ Cloud Functions   → openflowClaimOwner, openflowPublish, openflowOnBuildStatus, openflowRestoreRelease
└─ Cloud Build       → reconstruit le site à chaque « Publier »
```

## Paquets du dépôt

| Paquet | Rôle |
|---|---|
| `@openflow/core` | `defineConfig`, champs `imageField` et `linkField`, modèle Firestore, format du snapshot (zod), validation, règles de sécurité de référence, documentation pour les agents |
| `@openflow/check` | Norme OFS : registre des règles, analyse statique (Babel), rendu par sentinelles (Puck `Render` sous Node), contrôle du HTML, formats agent, JSON et SARIF, hooks Claude Code |
| `@openflow/next` | Intégration Next.js : `createOpenFlowPage` (generateStaticParams, generateMetadata, rendu), `getSettings` et `getSite`, sitemap et robots (`@openflow/next/data`), `<OpenFlowAdmin />` (`@openflow/next/admin`) |
| `@openflow/admin` | Application d'administration React : connexion, pages, éditeur Puck avec sauvegarde automatique, champs image et lien, réglages, publication, historique ; interface en français |
| `@openflow/functions` | Cloud Functions et logique de publication (snapshot, requête Cloud Build, API REST Hosting) |
| `openflow` (CLI) | `create`, `dev`, `check`, `validate`, `hook`, `seed`, `snapshot`, `build`, `deploy` |
| `templates/next-starter` | Site Next.js de départ, conforme à 100 % à la norme OFS |
| `plugins/openflow` | Plugin Claude Code : skills et hooks |

## Rendu

- Le site est un export statique Next.js (`output: "export"`, `trailingSlash: true`, `images.unoptimized`).
- `app/(site)/[[...slug]]/page.tsx` crée une page par entrée du **snapshot** (`generateStaticParams`,
  avec `dynamicParams = false`). Chaque page est rendue par `<Render config data>` de Puck, après
  application des `defaultProps`.
- Les réglages globaux alimentent `app/(site)/layout.tsx` (en-tête, pied de page, thème).
- Chaque section est entourée d'un `<div data-of-s="id" style="display:contents">`, et chaque texte, image
  ou vidéo éditable porte `data-of="chemin"` (`prepareRenderConfig`). L'éditeur utilise les mêmes marqueurs.
- **Style libre** : la prop réservée `_style` de chaque section est transformée en CSS par `buildPageCss`
  (`packages/core/src/style.ts`), une fonction pure qui n'accepte que des valeurs en liste blanche. La feuille
  est placée dans le `<head>` (balise `<style precedence>` de React 19). Hors couche CSS, elle l'emporte sur
  les classes Tailwind sans `!important`. Écrans : tablette jusqu'à 1023 px, mobile jusqu'à 767 px.
- **Thème** : les jetons choisis par le propriétaire (`config.theme`) sont émis dans `:root` par
  `createOpenFlowLayout` (`buildThemeCss`) et remplacent les variables `--color-*` et `--font-*` du site.
- **Le build ne lit jamais Firestore** : il lit le fichier désigné par `OPENFLOW_SNAPSHOT`. En local, il
  utilise `openflow/.snapshot.json` ou, à défaut, le contenu de départ.

## Édition

- `/admin` est une page client de l'export. Elle charge `@openflow/admin` après montage, ce qui n'alourdit pas
  les pages publiques.
- La configuration Firebase est lue depuis `/__/firebase/init.json` (servi par Hosting). En local, l'admin se
  connecte aux émulateurs.
- L'éditeur est Puck, configuré avec **les mêmes sections** que le site public : ce qu'on voit est
  exactement ce qui sera publié. Les styles du site sont synchronisés dans l'iframe de l'éditeur.
- Le propriétaire clique sur un texte, une image ou une vidéo de la page : le champ correspondant s'ouvre
  en tête du panneau de droite (une image ou une vidéo ouvre directement la médiathèque). L'onglet « Style »
  modifie le style de la section ou de l'élément pour l'écran affiché (Ordinateur, Tablette, Mobile).
  La feuille de style est recalculée à chaque modification et injectée dans l'iframe de l'éditeur.
- Chaque modification est sauvegardée automatiquement dans `of_pages/{id}.data` (debounce de 800 ms). Toutes les
  sauvegardes en attente sont forcées avant une publication.

## Publication

1. L'admin valide les brouillons (sections connues, types des champs).
2. La fonction appelable `openflowPublish` vérifie que l'appelant est le propriétaire, refuse une seconde
   publication concurrente, fige le contenu dans un **snapshot** (pages visibles, liens internes recalculés à
   partir des slugs, identifiants garantis), l'écrit dans `openflow/snapshots/{releaseId}.json`, crée
   `of_releases/{releaseId}`, puis lance le build.
3. **Cloud Build**, à partir de l'archive du code envoyée par `openflow deploy`, sans dépendance à GitHub :
   - `gcloud storage cp` du snapshot ;
   - installation des dépendances (npm, pnpm ou yarn selon le fichier de verrouillage) ;
   - `next build` avec `OPENFLOW_SNAPSHOT` ;
   - `firebase deploy --only hosting`.
4. Cloud Build publie son statut sur le sujet Pub/Sub `cloud-builds`. `openflowOnBuildStatus` met à jour la
   publication (`building`, puis `live` ou `failed`) et mémorise la version Hosting.
5. **Restaurer** appelle `releases.create` de l'API REST Hosting sur la version précédente. C'est instantané.

En local, avec les émulateurs, le builder `local` lance `openflow build --report` en tâche de fond : même
snapshot, même `next build`, et la publication est marquée `live` à la fin.

### Alternatives écartées

- **App Hosting avec revalidation** : ce n'est plus du statique, et la cohérence du cache entre instances
  n'est pas documentée.
- **Rendu HTML par une Cloud Function** : duplique les templates en dehors de Next.js. On le garde comme
  voie rapide possible plus tard, pour des pages de collections.

## Séparation code / contenu

| | Source de vérité | Modifié par | Livré par |
|---|---|---|---|
| Code (design, sections) | Dépôt du site | Agence, avec Claude Code | `openflow deploy`, qui envoie l'archive du code |
| Contenu (pages, réglages, médias) | Firestore et Storage | Propriétaire | « Publier », qui produit un snapshot |

Une publication combine toujours **la dernière archive du code et le snapshot du contenu**. Un
redéploiement du code relance une publication avec le contenu en cours : le travail du propriétaire
n'est jamais écrasé.
