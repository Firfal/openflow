# Feuille de route

| Phase | Contenu | Statut |
|---|---|---|
| **1 : Fondations** | Monorepo ; `@openflow/core` ; éditeur Puck avec persistance Firestore et sauvegarde automatique ; admin réservé au propriétaire (claim, règles) ; réglages globaux ; SEO par page ; import d'images ; publication statique (Cloud Build et builder local) ; historique et restauration ; CLI ; template Next.js ; kit Claude Code (AGENTS.md, skills, hooks) ; **norme OFS** et `openflow check` (fast, render, build) ; tests unitaires, tests des règles et scénario E2E sur émulateurs | **Réalisée** |
| 2 : Contenu | Médiathèque complète (redimensionnement par une fonction `sharp`, texte alternatif par défaut) ; **collections CMS** (schéma dans la config, pages modèles, bloc « liste de collection », `generateStaticParams`) ; aperçu par preview channel Hosting ; historique par page (points de sauvegarde) ; contrôles qualité dans un navigateur (axe, Lighthouse, captures responsive relues par Claude) | Spécifiée |
| 3 : Interactions | **Formulaires** (bloc Form, fonction `submitForm` avec App Check, honeypot et limitation de débit, boîte de réception dans l'admin, e-mail via SMTP ou Resend) ; **multilingue** (structure partagée et surcharges par langue, verrouillage de la structure via `permissions` de Puck, URL `/en/…`, hreflang, bouton « traduire avec l'IA ») | Spécifiée |
| 4 : IA et outillage | Assistant IA dans l'admin (API Claude dans une Cloud Function, outils qui n'écrivent **que des brouillons**, affichage des différences) ; **serveur MCP OpenFlow** (`list_pages`, `read_content`, `update_draft`, `publish`) ; `openflow check --against-live` (OF-202) et migrations de schéma ; demandes de modification du propriétaire transmises à Claude Code | Spécifiée |
| 5 : Multi-framework | Adaptateurs Vite SPA (prérendu), Astro, HTML pur (`data-of` et runtime DOM) | Spécifiée |

## Détails de conception des phases suivantes

### Collections (phase 2)
- `defineConfig({ collections: { blog: { fields, slugField, template: Component, listComponent } } })`.
- Stockage : `of_collections/{col}/items/{id}` (`slug`, `status`, `data`, `seo`).
- Snapshot : `collections: { blog: [items publiés] }`. Pages générées : `/{collection}/{slug}/`.
- Admin : liste filtrable, édition des éléments avec les mêmes champs Puck.

### Multilingue (phase 3)
- La langue par défaut porte la structure. Les autres langues stockent des **surcharges** de props
  (`componentId.propPath → valeur`).
- L'éditeur d'une langue secondaire ouvre la même page avec `permissions: { drag, insert, delete, duplicate: false }`.
- Un texte non traduit reprend la valeur de la langue par défaut. Le bouton « Traduire avec l'IA »
  écrit des brouillons.

### Formulaires (phase 3)
- Section `Form` (champs déclarés par le propriétaire parmi des types sûrs).
- `submitForm` : une fonction HTTPS avec App Check, un honeypot et une limitation par IP.
  Stockage dans `of_forms/{formId}/submissions`, notification par e-mail.

### Assistant IA (phase 4)
- Une fonction appelable `openflowAssistant` (clé API via `defineSecret`), qui utilise la Messages API avec des
  outils : `read_page`, `update_draft_props`, `translate_page`, `generate_seo`, `alt_text`.
- Les outils écrivent uniquement des brouillons : le propriétaire voit les différences puis publie.
- Ces mêmes outils sont exposés par le serveur MCP OpenFlow.
