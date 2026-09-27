# Feuille de route

| Phase | Contenu | Statut |
|---|---|---|
| **1 : Fondations** | Monorepo ; `@openflow/core` ; éditeur Puck avec persistance Firestore et sauvegarde automatique ; admin réservé au propriétaire (claim, règles) ; réglages globaux ; SEO par page ; import d'images ; publication statique (Cloud Build et builder local) ; historique et restauration ; CLI ; template Next.js ; kit Claude Code (AGENTS.md, skills, hooks) ; **norme OFS** et `openflow check` (fast, render, build) ; tests unitaires, tests des règles et scénario E2E sur émulateurs | **Réalisée** |
| 2 : Contenu | Médiathèque optimisée (copies WebP en `srcset` par `sharp`, vidéos MP4 1080p et 720p par ffmpeg) : **réalisée**. **Collections** (articles, réalisations… : `collections` dans la config, un élément = une page autour de la section de la collection, vue dédiée dans l'admin, sections de liste via `getCollection`, champ date, outils IA `list_items` et `create_item`, données structurées `Article`, fil d'Ariane, flux RSS) : **réalisées**. Reste : ordre manuel et filtres (catégories) des éléments ; texte alternatif proposé par défaut ; aperçu par preview channel Hosting ; historique par page (points de sauvegarde) ; contrôles qualité dans un navigateur (axe, Lighthouse, captures responsive relues par Claude) | En partie réalisée |
| 3 : Interactions | **Formulaires** (section de contact aux champs choisis par le propriétaire, fonction `cmsSubmitForm` avec champ piège, temps de saisie, limite par visiteur et reCAPTCHA Enterprise, boîte de réception « Messages » dans l'admin, e-mail via Resend) : **réalisés**. Mesure d'audience Google Analytics avec consentement, sauvegardes quotidiennes et alertes (`openflow setup`) : **réalisées**. Reste : **multilingue** (structure partagée et surcharges par langue, verrouillage de la structure via `permissions` de Puck, URL `/en/…`, hreflang, bouton « traduire avec l'IA ») | En partie réalisée |
| 4 : IA et outillage | **Serveur MCP OpenFlow** et **WebMCP** (18 outils : pages, sections, style, thème, médias, publication ; brouillons uniquement) : **réalisés**, voir [assistant-ia.md](assistant-ia.md). Connexion OAuth des connecteurs MCP à `https://<domaine>/mcp`, avec écran d'autorisation dans l'admin, et `llms.txt` : **réalisés**. Reste : assistant intégré à l'admin (API Claude dans une Cloud Function, affichage des différences), `openflow check --against-live` (OF-202) et migrations de schéma, demandes de modification transmises à Claude Code | En partie réalisée |
| 5 : Multi-framework | Adaptateurs Vite SPA (prérendu), Astro, HTML pur (`data-of` et runtime DOM) | Spécifiée |

## Priorités issues de la veille (septembre 2026)

Détail et sources : [sites-de-demain.md](sites-de-demain.md).

1. Fiche établissement (données `LocalBusiness`, horaires et fermetures, utilisées par le site, les IA et
   Google) : **réalisée**.
2. Fraîcheur : dates de modification réelles (sitemap, JSON-LD) et IndexNow à chaque publication :
   **réalisée**.
3. Robots des IA : refuser l'entraînement sans quitter la recherche IA : **réalisé**.
4. WebMCP à jour (`document.modelContext`) et formulaires déclarés pour les agents des visiteurs :
   **réalisé**.
5. Mesure d'audience sans cookie, avec les visites venant des assistants IA (« Statistiques », outil
   `get_stats`) : **réalisée**.
6. Audit d'accessibilité « prêt pour les agents » dans la norme.
7. Collections typées : événements et offres, avec leurs données structurées.
8. Outils d'audit dans le MCP.

## Détails de conception des phases suivantes

### Collections (phase 2, réalisées)
- Un élément est une page `cms_pages` avec `collection` et `summary` (voir
  [modele-de-donnees.md](modele-de-donnees.md)) : l'éditeur, le référencement, les liens, la publication,
  l'historique et les outils IA des pages valent pour les éléments.
- Suite possible : ordre manuel (glisser dans la liste), filtres par catégorie dans les sections de liste,
  pagination des listes longues, modèles de sections ajoutés à chaque nouvel élément.

### Multilingue (phase 3)
- La langue par défaut porte la structure. Les autres langues stockent des **surcharges** de props
  (`componentId.propPath → valeur`).
- L'éditeur d'une langue secondaire ouvre la même page avec `permissions: { drag, insert, delete, duplicate: false }`.
- Un texte non traduit reprend la valeur de la langue par défaut. Le bouton « Traduire avec l'IA »
  écrit des brouillons.

### Assistant IA (phase 4)
- Une fonction appelable `cmsAssistant` (clé API via `defineSecret`), qui utilise la Messages API avec des
  outils : `read_page`, `update_draft_props`, `translate_page`, `generate_seo`, `alt_text`.
- Les outils écrivent uniquement des brouillons : le propriétaire voit les différences puis publie.
- Ces mêmes outils sont exposés par le serveur MCP OpenFlow (réalisé : `cmsMcp`, voir
  [assistant-ia.md](assistant-ia.md)).
