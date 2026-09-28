# Architecture

## Vue d'ensemble

```
Projet Firebase du client (plan Blaze)
├─ Firebase Hosting  → site statique (export Next.js) + /admin (page client-only)
├─ Firebase Auth     → propriétaire (claim personnalisé `cms_owner`)
├─ Firestore         → brouillons des pages, réglages, historique des publications, messages
├─ Cloud Storage     → médias (et leurs copies optimisées), archives du code source, snapshots publiés
├─ Cloud Functions   → cmsClaimOwner, cmsPublish, cmsOnBuildStatus, cmsRestoreRelease,
│                      cmsMcp, cmsAgentConsent, cmsOptimizeMedia, cmsSubmitForm, cmsPageView,
│                      cmsDailyRefresh, cmsScheduledPublish
├─ Cloud Build       → reconstruit le site à chaque « Publier »
└─ Surveillance      → sauvegarde quotidienne de Firestore, alertes (publication en échec, message reçu),
                       reCAPTCHA Enterprise (formulaires), Secret Manager (clé d'envoi d'e-mails)
```

`openflow setup` prépare tout cela sur un projet neuf (APIs, bases, compte de build et ses rôles,
connexion par e-mail, sauvegardes, alertes, clé reCAPTCHA) ; `openflow deploy` le relance à chaque
livraison, sans rien refaire de ce qui est déjà en place.

## Paquets du dépôt

| Paquet | Rôle |
|---|---|
| `@openflow/core` | `defineConfig`, collections, champs `imageField`, `linkField` et `dateField`, modèle Firestore, format du snapshot (zod), validation, règles de sécurité de référence, documentation pour les agents |
| `@openflow/check` | Norme OFS : registre des règles, analyse statique (Babel), rendu par sentinelles (Puck `Render` sous Node), contrôle du HTML, formats agent, JSON et SARIF, hooks Claude Code |
| `@openflow/next` | Intégration Next.js : `createOpenFlowPage` (generateStaticParams, generateMetadata, rendu), `getSettings` et `getSite`, sitemap, robots, `llms.txt` et flux RSS (`@openflow/next/data`), données structurées, `<OpenFlowAdmin />` (`@openflow/next/admin`), `<OpenFlowForm />` (`@openflow/next/forms`), mesure d'audience avec consentement |
| `@openflow/admin` | Application d'administration React : connexion, pages, médias, éditeur Puck avec sauvegarde automatique (barre unique, rail, panneau de droite en une colonne : contenu de l'élément, puis style), réglages, publication, historique, recherche rapide ⌘K ; interface en français, claire ou sombre (voir [interface-admin.md](interface-admin.md)) |
| `@openflow/functions` | Cloud Functions : publication (snapshot, requête Cloud Build, API REST Hosting), serveur MCP et OAuth, optimisation des médias (sharp, ffmpeg), formulaires |
| `openflow` (CLI) | `create`, `dev`, `check`, `validate`, `hook`, `seed`, `snapshot`, `build`, `setup`, `mail`, `deploy` |
| `templates/next-starter` | Site Next.js de départ, conforme à 100 % à la norme OFS |
| `plugins/openflow` | Plugin Claude Code : skills et hooks |

## Rendu

- Le site est un export statique Next.js (`output: "export"`, `trailingSlash: true`, `images.unoptimized`).
- `app/(site)/[[...slug]]/page.tsx` crée une page par entrée du **snapshot** (`generateStaticParams`,
  avec `dynamicParams = false`). Chaque page est rendue par `<Render config data>` de Puck, après
  application des `defaultProps`.
- Le cadre du site (`config.layout` : en-tête, pied de page) est rendu par chaque page, avec les réglages
  globaux de sa langue ; `app/(site)/layout.tsx` ajoute le thème, la mesure d'audience et Google Analytics.
- **Langues** : `siteVersions` (`packages/core/src/i18n-site.ts`) produit, à partir du snapshot, une
  version par langue du site. Les pages traduites y vivent à `/<langue>/<adresse>/`, avec leurs textes, le
  contenu commun traduit, et des liens internes qui mènent aux pages traduites (ou à la langue principale
  quand une page n'est pas traduite). Chaque page annonce ses équivalents (`hreflang`, plan du site) et
  donne au cadre la liste des langues (`languages`) pour un sélecteur. Une page d'une autre langue porte
  `lang` sur son contenu et corrige `<html lang>` au chargement.
- **Collections** : les éléments (articles…) sont des pages du snapshot qui portent `collection`. Chaque
  section reçoit dans `puck.metadata` la page courante et, pour chaque collection, ses éléments visibles
  triés (`buildCollections`, calculé une fois par export) ; l'éditeur passe les mêmes données, tirées des
  fiches (`summary`). Chaque page porte ses données structurées (JSON-LD : `WebSite` pour l'accueil,
  `Article` pour un élément, fil d'Ariane), et `app/rss.xml/` publie le flux des collections.
- Chaque section est entourée d'un `<div data-of-s="id" style="display:contents">`, et chaque texte, image
  ou vidéo éditable porte `data-of="chemin"` (`prepareRenderConfig`). L'éditeur utilise les mêmes marqueurs,
  plus `data-of-l="chemin"` sur les liens (posé par `linkProps`, dans l'éditeur seulement), pour qu'un clic sur
  un bouton en montre le texte et le lien.
- **Style libre** : la prop réservée `_style` de chaque section est transformée en CSS par `buildPageCss`
  (`packages/core/src/style.ts`), une fonction pure qui n'accepte que des valeurs en liste blanche. La feuille
  est placée dans le `<head>` (balise `<style precedence>` de React 19). Hors couche CSS, elle l'emporte sur
  les classes Tailwind sans `!important`. Écrans : tablette jusqu'à 1023 px, mobile jusqu'à 767 px.
- **Thème** : les jetons choisis par le propriétaire (`config.theme`) sont émis dans `:root` par
  `createOpenFlowLayout` (`buildThemeCss`) et remplacent les variables `--color-*` et `--font-*` du site.
- **Médias optimisés** : à l'import, `cmsOptimizeMedia` (déclencheur Storage) crée des copies WebP de
  480 à 2560 px pour les images (qualité 82) et des MP4 H.264 1080p (CRF 22) et 720p (CRF 23) pour les vidéos,
  avec une image d'aperçu. Ces réglages ont été mesurés sur une vraie vidéo 1080p : 31,5 Mo deviennent 8 Mo
  pour un score VMAF de 93,6, le seuil où la copie ne se distingue plus de l'original. À la publication, le
  snapshot ajoute ces copies aux valeurs d'image et de vidéo : `imageProps` produit un `srcset` et
  `videoProps` des `<source>` (720p sur mobile). L'original reste la solution de repli.
- **Formulaires** : `<OpenFlowForm>` envoie à `/forms/submit` (réécriture vers `cmsSubmitForm`), qui
  vérifie l'envoi contre la page publiée (voir [securite.md](securite.md#formulaires)).
- **Mesure d'audience sans cookie** : `createOpenFlowLayout` ajoute `<OpenFlowStats>` (sauf si le
  propriétaire l'a désactivée). À chaque page affichée, il envoie avec `sendBeacon` quelques octets à
  `/cms/view` (réécriture vers `cmsPageView`) : l'adresse de la page, la largeur de la fenêtre et, pour la
  première page d'une visite, la page d'origine et `utm_source`. Quand le visiteur quitte la première page
  chargée, une seconde balise donne sa vitesse (LCP, INP, CLS, observés avec `PerformanceObserver`). La fonction ajoute la vue aux compteurs du
  jour (`cms_stats`) ; l'admin les lit dans « Statistiques » (voir
  [securite.md](securite.md#mesure-daudience-sans-cookie)).
- **Google Analytics** (facultatif) : si le propriétaire a saisi un identifiant, `createOpenFlowLayout`
  ajoute `<OpenFlowAnalytics>`, qui ne charge rien avant l'accord du visiteur.
- **Mise à jour automatique** : un site statique affiche le jour de son build. Chaque matin (4 h 20, heure
  de Paris), `cmsDailyRefresh` regarde si un événement de l'agenda ou une fermeture exceptionnelle est
  passé depuis ; si oui, il reconstruit la version en ligne telle quelle (son snapshot redaté, jamais les
  brouillons), pour que l'agenda et les données structurées restent justes. La publication garde la date
  de son contenu (`contentAt`) : les modifications du propriétaire restent « non publiées ».
- **Publication programmée** : une page (ou un élément de collection) peut porter une heure de mise en
  ligne (`publishAt`) ; elle reste masquée jusque-là. Tous les quarts d'heure, `cmsScheduledPublish`
  prend les pages dont l'heure est venue et les ajoute au snapshot en ligne telles qu'elles sont
  (`addPagesToSnapshot` : leurs liens, les listes des collections et le plan du site les incluent), puis
  lance le build. Rien d'autre ne change : les autres brouillons du propriétaire restent des brouillons.
  La publication porte la date du contenu des autres pages (`contentAt`) et la liste des pages ajoutées
  (`scheduledPages`), d'où l'admin tire le statut de chaque page. Si une publication est en cours, la
  page attend le quart d'heure suivant ; si le build ne peut pas démarrer, elle devient visible et partira
  avec la prochaine publication (une alerte signale l'échec).
- **Le build ne lit jamais Firestore** : il lit le fichier désigné par `CMS_SNAPSHOT`. En local, il
  utilise `openflow/.snapshot.json` ou, à défaut, le contenu de départ.

## Édition

- `/admin` est une page client de l'export. Elle charge `@openflow/admin` après montage, ce qui n'alourdit pas
  les pages publiques.
- L'admin se charge **par étapes**, pour rester léger :
  1. l'écran de connexion : Firebase Auth et le formulaire (environ 160 Ko compressés, dont 110 Ko pour React et
     Next.js, communs à toute page Next.js) ;
  2. une fois le propriétaire connecté, le tableau de bord et Firestore ;
  3. l'éditeur visuel (Puck, texte riche, glisser-déposer), téléchargé en arrière-plan pendant que le
     propriétaire est sur le tableau de bord, puis à l'ouverture d'une page. Il vient avec les réglages « Thème »
     et « Contenu commun », qui l'utilisent.

  Les fonctions Firebase et Storage s'importent au premier usage ; la validation (zod) à la publication ; les
  outils WebMCP seulement si le navigateur les prend en charge. Un budget vérifie l'écran de connexion à chaque
  CI (`tests/e2e/admin-weight.mjs`).
- La configuration Firebase est lue depuis `/__/firebase/init.json` (servi par Hosting). En local, l'admin se
  connecte aux émulateurs.
- L'éditeur est Puck, configuré avec **les mêmes sections** que le site public : ce qu'on voit est
  exactement ce qui sera publié. Les styles du site sont synchronisés dans l'iframe de l'éditeur.
- Le propriétaire clique sur un texte, une image ou une vidéo de la page : le champ correspondant s'ouvre
  en tête du panneau de droite (une image ou une vidéo ouvre directement la médiathèque). Le bloc « Style »,
  en dessous, modifie le style de la section ou de l'élément pour l'écran affiché (Ordinateur, Tablette, Mobile).
  La feuille de style est recalculée à chaque modification et injectée dans l'iframe de l'éditeur.
- Un **assistant IA** peut modifier le site par la discussion, avec les mêmes outils
  (`packages/core/src/agent/`) :
  - un serveur MCP à l'adresse `https://<domaine>/mcp` (réécriture Hosting vers la fonction `cmsMcp`),
    avec connexion OAuth et écran d'autorisation dans l'admin ;
  - WebMCP dans l'admin.

  Le site publié expose aussi `llms.txt` et `llms-full.txt` aux IA qui le lisent. Voir
  [assistant-ia.md](assistant-ia.md).
- Chaque modification est sauvegardée automatiquement dans `cms_page_content/{id}` (debounce de 800 ms), avec la
  date de la fiche `cms_pages/{id}` dans la même écriture. Toutes les
  sauvegardes en attente sont forcées avant une publication.

## Publication

1. L'admin valide les brouillons (sections connues, types des champs).
2. La fonction appelable `cmsPublish` vérifie que l'appelant est le propriétaire, refuse une seconde
   publication concurrente, fige le contenu dans un **snapshot** (pages visibles, liens internes recalculés à
   partir des slugs, identifiants garantis), l'écrit dans `cms/snapshots/{releaseId}.json`, crée
   `cms_releases/{releaseId}`, puis lance le build.
3. **Cloud Build**, à partir de l'archive du code envoyée par `openflow deploy`, sans dépendance à GitHub :
   - `gcloud storage cp` du snapshot ;
   - installation des dépendances (npm, pnpm ou yarn selon le fichier de verrouillage) ;
   - `next build` avec `CMS_SNAPSHOT` ;
   - `firebase deploy --only hosting`.
4. Cloud Build publie son statut sur le sujet Pub/Sub `cloud-builds`. `cmsOnBuildStatus` met à jour la
   publication (`building`, puis `live` ou `failed`) et mémorise la version Hosting. Une fois en ligne,
   les pages modifiées depuis la publication précédente sont annoncées à **IndexNow** (Bing, Copilot,
   Yandex, Seznam…), si le site sert sa clé à `/indexnow.txt` et connaît son adresse.
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
