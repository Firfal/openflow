# Modèle de données

Toutes les collections sont préfixées par `of_` pour ne jamais entrer en conflit avec les données
propres au site. Les types TypeScript se trouvent dans `packages/core/src/model.ts`.

## Firestore

| Document | Contenu | Écrit par | Lu par |
|---|---|---|---|
| `of_site/settings` | `site` (nom, langue, url, description, ogImage), `values` (réglages globaux déclarés dans `config.settings`), `updatedAt`, `updatedBy` | Admin, `openflow seed` | Admin, `openflowPublish` |
| `of_pages/{pageId}` | `slug`, `title`, `status` (`draft` ou `published`, c'est-à-dire incluse dans le site), `seo` (`title`, `description`, `ogImage`, `noindex`), `data` (données Puck du brouillon), `updatedAt`, `updatedBy` | Admin, `openflow seed` | Admin, `openflowPublish` |
| `of_releases/{releaseId}` | `status` (`queued`, `building`, `live`, `failed` ou `superseded`), `createdAt`, `createdBy`, `snapshotPath`, `sourcePath`, `builder`, `buildId`, `logUrl`, `hostingVersion`, `finishedAt`, `error`, `pageCount`, `restoredAt` | Cloud Functions et CLI uniquement | Admin |
| `of_media/{mediaId}` | `path`, `url`, `name`, `contentType`, `size`, `width`, `height`, `alt`, `createdAt` | Admin | Admin (médiathèque) |
| `of_system/source` | Dernière archive du code (`path`, `sha256`, `uploadedAt`) | `openflow deploy` | `openflowPublish` |

Taille : une page Puck pèse généralement quelques dizaines de Ko. L'admin avertit au-delà de 800 Ko et
refuse d'enregistrer au-delà d'environ 1 Mo (limite des documents Firestore).

### Collections prévues

- `of_collections/{collection}/items/{itemId}` : contenus structurés (phase 2).
- `of_forms/{formId}/submissions/{id}` : réponses aux formulaires (phase 3).
- `of_pages/{id}/locales/{locale}` : surcharges de traduction (phase 3).

## Cloud Storage

| Chemin | Contenu | Accès |
|---|---|---|
| `openflow/media/*` | Images importées par le propriétaire | Lecture publique ; écriture réservée au propriétaire (PNG, JPEG, GIF, WebP, AVIF, MP4, WebM, PDF ; 15 Mo maximum ; SVG refusé) |
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
  "pages": [
    { "id": "accueil", "slug": "", "title": "Accueil", "seo": { … }, "data": { "root": { "props": {} }, "content": [ … ] } }
  ]
}
```

- Seules les pages `published` y figurent.
- Les liens internes (`{ kind: "page", pageId }`) ont leur `href` recalculé à partir des slugs du moment.
- Chaque section a un `props.id` unique.
- La publication est refusée si deux pages ont la même adresse ou si un slug est invalide.

## Valeurs des champs OpenFlow

- Image : `{ src, alt, width?, height? }` ou `null`.
- Lien : `{ kind: "page", pageId, href, newTab? }`, `{ kind: "url", href, newTab? }`, ou `null`.
