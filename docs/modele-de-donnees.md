# Modèle de données

Toutes les collections sont préfixées par `cms_` pour ne jamais entrer en conflit avec les données
propres au site. Les noms internes (collections, fonctions, dossiers Storage, variables d'environnement)
sont neutres : ils ne contiennent pas le nom du produit, qui peut changer sans migrer les sites livrés.
Les types TypeScript se trouvent dans `packages/core/src/model.ts`.

## Firestore

| Document | Contenu | Écrit par | Lu par |
|---|---|---|---|
| `cms_site/settings` | `site` (nom, langue, url, description, ogImage, `gaMeasurementId` : identifiant Google Analytics `G-…`, `business` : fiche établissement, voir plus bas, `aiTraining` : `block` pour refuser les robots d'entraînement des IA dans robots.txt), `values` (réglages globaux déclarés dans `config.settings`), `theme` (jetons du thème, ex. `{ "color-ink": "#101820" }`), `updatedAt`, `updatedBy` | Admin, `openflow seed` | Admin, `cmsPublish` |
| `cms_pages/{pageId}` | Fiche de la page, sans son contenu : `slug`, `title`, `status` (`draft` ou `published`, c'est-à-dire incluse dans le site), `seo` (`title`, `description`, `ogImage`, `noindex`), `updatedAt` (bouge aussi quand le contenu change), `updatedBy`. Pour un élément de collection : `collection` (son nom) et `summary` (valeurs affichées dans les listes, voir plus bas) | Admin, `openflow seed`, `cmsMcp` | Admin (liste des pages et des collections, en direct), `cmsPublish` |
| `cms_page_content/{pageId}` | Contenu de la page (même identifiant) : `data` (données Puck du brouillon), `updatedAt`, `updatedBy` | Admin (enregistrement automatique, écrit avec la date de la fiche), `openflow seed`, `cmsMcp` | Admin (à l'ouverture de la page), `cmsPublish`, `cmsMcp` |
| `cms_releases/{releaseId}` | `status` (`queued`, `building`, `live`, `failed` ou `superseded`), `createdAt`, `createdBy`, `snapshotPath`, `sourcePath`, `builder`, `buildId`, `logUrl`, `hostingVersion`, `finishedAt`, `error`, `pageCount`, `restoredAt`, `contentAt` (mise à jour automatique : date du contenu reconstruit) | Cloud Functions et CLI uniquement | Admin |
| `cms_media/{mediaId}` | `path`, `url`, `name`, `contentType`, `size`, `width`, `height`, `alt`, `source` (`storage` : importé ; `static` : fichier de `public/`), `createdAt` ; `variants` (copies optimisées : `url`, `width`, `height`, `size`), `poster` (aperçu d'une vidéo), `optimization` (`status` : `pending`, `done`, `skipped` ou `failed`) | Admin, `openflow seed`, `cmsOptimizeMedia` (copies) | Admin (médiathèque), `cmsPublish` |
| `cms_system/source` | Dernière archive du code (`path`, `sha256`, `uploadedAt`) | `openflow deploy` | `cmsPublish` |
| `cms_system/integrations` | `recaptchaSiteKey` : clé reCAPTCHA Enterprise des formulaires ; `indexNowKey` : clé IndexNow (publique, servie à `/indexnow.txt`), créée à la première publication. Toutes deux sont publiées dans le snapshot | `openflow setup`, `cmsPublish` (clé IndexNow) | `cmsPublish` |
| `cms_system/schema` | Schéma sérialisable du site : sections, champs, réglages, thème, collections (`buildSiteSchema`) | `openflow seed` / `deploy` | `cmsMcp` |
| `cms_agent_tokens/{id}` | IA connectées et clés d'accès : `kind` (`key` ou `oauth`), `label`, `hash` (SHA-256 de la clé ou du jeton d'accès), `prefix`, `createdAt`, `createdBy`, `lastUsedAt` ; en OAuth, `clientId`, `expiresAt`, `refreshHash`, `refreshExpiresAt`, `redirect` | `cmsCreateAgentToken`, `cmsMcp` | Admin (liste, déconnexion) |
| `cms_agent_clients/{clientId}` | Clients OAuth enregistrés par les IA : `name`, `redirectUris`, `authMethod`, `secretHash`, `createdAt`, `lastUsedAt` | `cmsMcp` | `cmsMcp` |
| `cms_agent_requests/{id}` | Demandes d'autorisation en attente du propriétaire (10 min) | `cmsMcp` | `cmsAgentConsent` |
| `cms_agent_codes/{hash}` | Codes d'autorisation, à usage unique (5 min) | `cmsAgentConsent` | `cmsMcp` |
| `cms_messages/{id}` | Messages des formulaires : `formId`, `page`, `formTitle`, `fields` (`[{ label, value }]` dans l'ordre du formulaire), `email` (pour répondre), `createdAt`, `read`, `spam`, `score` (reCAPTCHA) | `cmsSubmitForm` ; le propriétaire ne change que `read` et `spam` | Admin (Messages) |
| `cms_rate_limits/{empreinte}` | Envois récents d'un visiteur (`start`, `count`, `expiresAt`, effacé par TTL) | `cmsSubmitForm` | `cmsSubmitForm` |
| `cms_stats/{jour}-{0..3}` | Compteurs d'audience d'une journée (heure de Paris), répartis sur 4 documents : `day`, `views`, `visits`, `pages` (adresse → vues, `(autre)` pour une adresse inconnue), `sources` (clé de source → visites : `chatgpt`, `google`, `direct`, `site`…), `devices` (`mobile`, `tablet`, `desktop`), `aiPages` (page d'arrivée des visites venues d'une IA), `expiresAt` (25 mois, TTL) | `cmsPageView` | Admin (Statistiques), outil `get_stats` |
| `cms_stats/{jour}-sites` | Sites qui ont envoyé des visites ce jour-là : `sites` (hôte → visites, 100 au plus, puis `autres`), `expiresAt` | `cmsPageView` | Admin (Statistiques), outil `get_stats` |

Taille : une page Puck pèse généralement quelques dizaines de Ko. L'admin avertit au-delà de 800 Ko et
refuse d'enregistrer au-delà d'environ 1 Mo (limite des documents Firestore). Le contenu est séparé de la
fiche pour que la liste des pages, suivie en direct par l'admin, reste légère quel que soit le nombre ou le
poids des pages : elle ne lit que les fiches, et le contenu d'une page n'est lu qu'à son ouverture.

### Collections (articles, réalisations, événements…)

Un élément de collection est une **page** comme les autres, avec deux propriétés de plus sur sa fiche :
tout ce qui existe pour les pages (éditeur, enregistrement automatique, référencement, liens internes,
publication, historique, outils de l'IA) vaut donc aussi pour les éléments.

- `collection` : le nom de sa collection dans `config.collections` (`"actualites"`). Son `slug` commence
  par le `path` de la collection (`actualites/portes-ouvertes`).
- Son contenu contient **une seule** section `component` de la collection (`Article`), qui porte les champs
  de l'élément. Le propriétaire peut ajouter d'autres sections autour.
- `summary` : copie des valeurs de cette section **sans ses textes enrichis ni ses zones imbriquées**, plus
  `_excerpt` (début du premier texte enrichi, 220 caractères) et `_words` (nombre de mots, pour le temps de
  lecture). Elle est réécrite à chaque enregistrement du contenu (admin, `cmsMcp`, `openflow seed`), dans
  la même écriture : l'admin liste les éléments et les montre dans l'éditeur sans lire leur contenu.
- `title` suit le champ titre de la section (`titleField`) : le propriétaire modifie le titre sur la page,
  la liste et l'onglet du navigateur suivent.

Aucune nouvelle collection Firestore ni règle de sécurité : les fiches restent dans `cms_pages`.

### Collections prévues

- `cms_pages/{id}/locales/{locale}` : surcharges de traduction (phase 3).

## Cloud Storage

| Chemin | Contenu | Accès |
|---|---|---|
| `cms/media/*` | Images et vidéos importées par le propriétaire | Lecture publique ; écriture réservée au propriétaire (PNG, JPEG, GIF, WebP, AVIF, PDF jusqu'à 15 Mo ; MP4, WebM, MOV jusqu'à 100 Mo ; SVG refusé) |
| `cms/media/optimized/*` | Copies optimisées (WebP, MP4 1080p et 720p, aperçus) | Lecture publique ; écriture par `cmsOptimizeMedia` seulement |
| `cms/source/*.tgz` | Archives du code du site | Aucun accès client |
| `cms/snapshots/{releaseId}.json` | Contenu figé de chaque publication | Aucun accès client |

## Snapshot

```jsonc
{
  "version": 1,
  "releaseId": "Ab12…",
  "createdAt": "2026-09-25T10:00:00.000Z",
  "site": { "name": "…", "lang": "fr", "url": "https://…" },
  "settings": { "navigation": [ … ], "footerText": "…" },
  "theme": { "color-ink": "#101820", "font-display": "var(--font-plex)" },
  "integrations": { "recaptchaSiteKey": "6Lc…" },
  "pages": [
    { "id": "accueil", "slug": "", "title": "Accueil", "seo": { … }, "data": { "root": { "props": {} }, "content": [ … ] } },
    { "id": "portes-ouvertes", "slug": "actualites/portes-ouvertes", "title": "…", "collection": "actualites", "seo": {}, "data": { … } }
  ]
}
```

- Seules les pages `published` y figurent.
- Les liens internes (`{ kind: "page", pageId }`) ont leur `href` recalculé à partir des slugs du moment.
- Chaque section a un `props.id` unique.
- Chaque page garde sa date de modification (`updatedAt`) : `lastmod` du sitemap, `dateModified` et
  `article:modified_time` des éléments de collection, et pages à annoncer à IndexNow.
- Les styles (`_style`) et le thème sont revalidés : les valeurs hors liste blanche sont retirées.
- La publication est refusée si deux pages ont la même adresse ou si un slug est invalide.
- Les éléments de collection gardent leur `collection`. Au rendu, `buildCollections` en tire, pour chaque
  collection, la liste triée de ses éléments (`id`, `href`, `title`, `date`, `description`, `image`,
  `readingTime`, `fields`), passée aux sections dans `puck.metadata.collections` (l'éditeur fait de même à
  partir des `summary`).

## Fiche établissement (`site.business`)

Écrite dans Réglages > Établissement (ou par l'outil IA `update_business`), publiée dans le snapshot
(`site.business`, seules les valeurs valides) :

```jsonc
{
  "type": "Bakery",                       // type schema.org parmi BUSINESS_TYPES
  "name": "…",                            // si différent du nom du site
  "phone": "01 23 45 67 89", "email": "bonjour@…",
  "street": "12 rue du Four", "postalCode": "75006", "city": "Paris", "country": "FR",
  "hours": { "mo": [], "tu": [{ "opens": "09:00", "closes": "12:30" }, { "opens": "14:00", "closes": "19:00" }] },
  "hoursNote": "Sur rendez-vous le lundi",
  "closures": [{ "from": "2026-08-10", "to": "2026-08-20", "label": "Congés d'été" }],
  "priceRange": "€€", "areaServed": "…", "links": ["https://maps.app.goo.gl/…"]
}
```

- Un jour sans plage est fermé ; `hours` absent signifie « horaires non indiqués ».
- Elle alimente le JSON-LD de l'accueil (`LocalBusiness` ou son type, avec
  `openingHoursSpecification` et, pour les fermetures à venir, `specialOpeningHoursSpecification`),
  la rubrique « Informations pratiques » de `llms.txt`, l'outil `get_site_overview`, et le cadre du site
  (`site.business` dans `LayoutProps`, par exemple le pied de page).

## Valeurs des champs OpenFlow

- Image : `{ src, alt, width?, height?, variants? }` ou `null`. `variants` est ajouté à la publication à
  partir de la médiathèque ; `imageProps` en fait un `srcset`.
- Vidéo : `{ src, poster?, description?, variants? }` ; `videoProps` en fait des `<source>` (720p sur mobile, 1080p
  ailleurs).
- Formulaire (`formFieldsField`) : `[{ label, type, required, options }]`, `type` parmi `text`, `email`,
  `tel`, `textarea`, `select`, `checkbox` ; `required` vaut `yes` ou `no` ; `options` liste les choix d'un
  `select`, un par ligne.
- Lien : `{ kind: "page", pageId, href, newTab? }`, `{ kind: "url", href, newTab? }`, ou `null`.
- Date (`dateField`) : `"AAAA-MM-JJ"` ou `""` ; `formatDate` l'affiche dans la langue du site.

## Style libre (`_style`)

Prop réservée de chaque section, écrite par le bloc « Style » du panneau de droite de l'admin :

```jsonc
{
  "section": { "base": { "paddingTop": "96px" }, "mobile": { "paddingTop": "48px" } },
  "fields": {
    "title": { "base": { "color": "var(--color-cobalt)", "fontSize": "56px" } },
    "items.answer": { "tablet": { "textAlign": "left" } }
  }
}
```

- Écrans : `base` (tous), `tablet` (jusqu'à 1023 px), `mobile` (jusqu'à 767 px). Un écran plus petit
  complète les réglages du plus grand.
- Les clés de `fields` sont les chemins des marqueurs `data-of` : une liste est stylée pour tous ses éléments.
- Propriétés en liste blanche (`styleValuesSchema`) : couleur, police, taille, graisse, interligne,
  espacement des lettres, alignement, casse, style, trait, fond (couleur, image, voile, taille, cadrage),
  marges, largeur maximale, hauteur minimale, bordure, arrondi, opacité, ombre, recadrage d'image, masquage.
- Formats : couleurs `#hex` ou `var(--color-…)`, longueurs en `px`, `rem`, `em`, `%`, `vw`, `vh`, images
  depuis Storage ou `public/`. Aucun CSS libre.
- Les noms de champs commençant par `_` sont réservés (OF-203).
