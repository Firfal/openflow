# Modèle de données

Toutes les collections sont préfixées par `of_` pour ne jamais entrer en conflit avec les données
propres au site. Les types TypeScript se trouvent dans `packages/core/src/model.ts`.

## Firestore

| Document | Contenu | Écrit par | Lu par |
|---|---|---|---|
| `of_site/settings` | `site` (nom, langue, url, description, ogImage, `gaMeasurementId` : identifiant Google Analytics `G-…`), `values` (réglages globaux déclarés dans `config.settings`), `theme` (jetons du thème, ex. `{ "color-ink": "#101820" }`), `updatedAt`, `updatedBy` | Admin, `openflow seed` | Admin, `openflowPublish` |
| `of_pages/{pageId}` | `slug`, `title`, `status` (`draft` ou `published`, c'est-à-dire incluse dans le site), `seo` (`title`, `description`, `ogImage`, `noindex`), `data` (données Puck du brouillon), `updatedAt`, `updatedBy` | Admin, `openflow seed` | Admin, `openflowPublish` |
| `of_releases/{releaseId}` | `status` (`queued`, `building`, `live`, `failed` ou `superseded`), `createdAt`, `createdBy`, `snapshotPath`, `sourcePath`, `builder`, `buildId`, `logUrl`, `hostingVersion`, `finishedAt`, `error`, `pageCount`, `restoredAt` | Cloud Functions et CLI uniquement | Admin |
| `of_media/{mediaId}` | `path`, `url`, `name`, `contentType`, `size`, `width`, `height`, `alt`, `source` (`storage` : importé ; `static` : fichier de `public/`), `createdAt` ; `variants` (copies optimisées : `url`, `width`, `height`, `size`), `poster` (aperçu d'une vidéo), `optimization` (`status` : `pending`, `done`, `skipped` ou `failed`) | Admin, `openflow seed`, `openflowOptimizeMedia` (copies) | Admin (médiathèque), `openflowPublish` |
| `of_system/source` | Dernière archive du code (`path`, `sha256`, `uploadedAt`) | `openflow deploy` | `openflowPublish` |
| `of_system/integrations` | `recaptchaSiteKey` : clé reCAPTCHA Enterprise des formulaires, publiée dans le snapshot | `openflow setup` | `openflowPublish` |
| `of_system/schema` | Schéma sérialisable du site : sections, champs, réglages, thème (`buildSiteSchema`) | `openflow seed` / `deploy` | `openflowMcp` |
| `of_agent_tokens/{id}` | IA connectées et clés d'accès : `kind` (`key` ou `oauth`), `label`, `hash` (SHA-256 de la clé ou du jeton d'accès), `prefix`, `createdAt`, `createdBy`, `lastUsedAt` ; en OAuth, `clientId`, `expiresAt`, `refreshHash`, `refreshExpiresAt`, `redirect` | `openflowCreateAgentToken`, `openflowMcp` | Admin (liste, déconnexion) |
| `of_agent_clients/{clientId}` | Clients OAuth enregistrés par les IA : `name`, `redirectUris`, `authMethod`, `secretHash`, `createdAt`, `lastUsedAt` | `openflowMcp` | `openflowMcp` |
| `of_agent_requests/{id}` | Demandes d'autorisation en attente du propriétaire (10 min) | `openflowMcp` | `openflowAgentConsent` |
| `of_agent_codes/{hash}` | Codes d'autorisation, à usage unique (5 min) | `openflowAgentConsent` | `openflowMcp` |
| `of_messages/{id}` | Messages des formulaires : `formId`, `page`, `formTitle`, `fields` (`[{ label, value }]` dans l'ordre du formulaire), `email` (pour répondre), `createdAt`, `read`, `spam`, `score` (reCAPTCHA) | `openflowSubmitForm` ; le propriétaire ne change que `read` et `spam` | Admin (Messages) |
| `of_rate_limits/{empreinte}` | Envois récents d'un visiteur (`start`, `count`, `expiresAt`, effacé par TTL) | `openflowSubmitForm` | `openflowSubmitForm` |

Taille : une page Puck pèse généralement quelques dizaines de Ko. L'admin avertit au-delà de 800 Ko et
refuse d'enregistrer au-delà d'environ 1 Mo (limite des documents Firestore).

### Collections prévues

- `of_collections/{collection}/items/{itemId}` : contenus structurés (phase 2).
- `of_pages/{id}/locales/{locale}` : surcharges de traduction (phase 3).

## Cloud Storage

| Chemin | Contenu | Accès |
|---|---|---|
| `openflow/media/*` | Images et vidéos importées par le propriétaire | Lecture publique ; écriture réservée au propriétaire (PNG, JPEG, GIF, WebP, AVIF, PDF jusqu'à 15 Mo ; MP4, WebM, MOV jusqu'à 100 Mo ; SVG refusé) |
| `openflow/media/optimized/*` | Copies optimisées (WebP, MP4 1080p et 720p, aperçus) | Lecture publique ; écriture par `openflowOptimizeMedia` seulement |
| `openflow/source/*.tgz` | Archives du code du site | Aucun accès client |
| `openflow/snapshots/{releaseId}.json` | Contenu figé de chaque publication | Aucun accès client |

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
    { "id": "accueil", "slug": "", "title": "Accueil", "seo": { … }, "data": { "root": { "props": {} }, "content": [ … ] } }
  ]
}
```

- Seules les pages `published` y figurent.
- Les liens internes (`{ kind: "page", pageId }`) ont leur `href` recalculé à partir des slugs du moment.
- Chaque section a un `props.id` unique.
- Les styles (`_style`) et le thème sont revalidés : les valeurs hors liste blanche sont retirées.
- La publication est refusée si deux pages ont la même adresse ou si un slug est invalide.

## Valeurs des champs OpenFlow

- Image : `{ src, alt, width?, height?, variants? }` ou `null`. `variants` est ajouté à la publication à
  partir de la médiathèque ; `imageProps` en fait un `srcset`.
- Vidéo : `{ src, poster?, description?, variants? }` ; `videoProps` en fait des `<source>` (720p sur mobile, 1080p
  ailleurs).
- Formulaire (`formFieldsField`) : `[{ label, type, required, options }]`, `type` parmi `text`, `email`,
  `tel`, `textarea`, `select`, `checkbox` ; `required` vaut `yes` ou `no` ; `options` liste les choix d'un
  `select`, un par ligne.
- Lien : `{ kind: "page", pageId, href, newTab? }`, `{ kind: "url", href, newTab? }`, ou `null`.

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
