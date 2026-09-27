# Les sites de demain : enjeux et priorités d'OpenFlow

Veille de septembre 2026, faite pour choisir la suite d'OpenFlow. Les sources officielles (Google, Chrome,
W3C, Commission européenne, CNIL, Anthropic, OpenAI) ont été lues dans leur texte d'origine ; les chiffres
d'études privées sont donnés avec leur source et doivent être pris avec prudence.

## Ce qui change

### 1. La recherche répond à la place du clic

- AI Overviews et AI Mode sont ouverts en France depuis le 22 juillet 2026
  ([Abondance](https://www.abondance.com/20260722-2640402-lancement-officielle-ai-overviews-france.html)).
  Selon Ahrefs, le premier résultat perd 58 % de ses clics quand un résumé IA s'affiche
  ([Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update)).
- Le site d'une petite entreprise se lit donc de plus en plus **à travers une IA** : il doit être cité,
  exact et à jour, même sans visite.

### 2. Être cité par une IA, c'est d'abord du bon référencement

- Le guide de Google (mis à jour le 10 juillet 2026) le dit sans détour : pas besoin de `llms.txt`, de
  découpage du contenu ni de balisage particulier. Une page doit être indexée et éligible à un extrait ;
  le reste tient à un contenu utile et original. Pour les entreprises, Google renvoie à la **fiche Google
  Business Profile** et à Merchant Center
  ([guide Google](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)).
- Les autres moteurs ont leurs propres signaux : un site qui bloque OAI-SearchBot disparaît de la recherche
  ChatGPT ([OpenAI](https://developers.openai.com/api/docs/bots)) ; Bing dit que le balisage schema.org
  aide ses modèles et recommande IndexNow
  ([Search Engine Land](https://searchengineland.com/microsoft-bing-copilot-use-schema-for-its-llms-453455)).
- La **fraîcheur** compte : les assistants citent des pages plus récentes que les résultats classiques
  ([Ahrefs](https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content)).
- Mesurer devient possible : Search Console a un rapport « IA générative » (impressions seulement pour
  l'instant) ([Google](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports)).

### 3. Les données structurées se resserrent

- Les résultats enrichis FAQ ont disparu (avis le 8 mai 2026, documentation retirée le 15 juin :
  [Google](https://developers.google.com/search/updates)).
- Restent utiles pour une petite entreprise : `LocalBusiness` / `Organization` (horaires, adresse,
  fermetures exceptionnelles), `Event`, `Product` et `Offer`, `Article`, fil d'Ariane
  ([galerie Google](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)).

### 4. Les agents naviguent déjà

- Claude in Chrome est ouvert à tous les forfaits payants depuis le 26 août 2026
  ([Anthropic](https://claude.com/blog/claude-in-chrome-generally-available)) ; Gemini navigue pour
  l'utilisateur aux États-Unis ; ChatGPT intègre la navigation par agent.
- Un site « prêt pour les agents » est d'abord un site **accessible** : HTML sémantique, libellés de
  formulaires, boutons natifs, mise en page stable ([web.dev](https://web.dev/articles/ai-agent-site-ux)).
- **WebMCP** : l'API est désormais sur `document.modelContext` (brouillon du groupe communautaire W3C du
  26 septembre 2026, [spécification](https://webmachinelearning.github.io/webmcp/)). Chrome la teste en
  origin trial, avec une **API déclarative** pour les formulaires : attributs `toolname`,
  `tooldescription`, `toolparamdescription`, et `SubmitEvent.agentInvoked`
  ([Chrome](https://developer.chrome.com/docs/ai/webmcp/declarative-api)).
- Réserver et payer via un agent passe par des plateformes (OpenTable, UCP limité à l'Amérique du Nord et
  à l'Australie) : pour un site vitrine, l'essentiel est d'afficher des **prix publics** et un **moyen
  de contact ou de réservation standard**.

### 5. Europe : ce qui oblige

- **Accessibilité** (European Accessibility Act, en vigueur depuis le 28 juin 2025) : elle vise les
  services de commerce électronique ; les microentreprises de services en sont exemptées
  ([directive](https://eur-lex.europa.eu/eli/dir/2019/882/oj)). Un site vitrine sans vente en ligne est
  probablement hors champ, à confirmer au cas par cas.
- **AI Act, article 50** (applicable depuis le 2 août 2026) : dire qu'on parle à une IA, étiqueter les
  contenus synthétiques trompeurs
  ([Commission](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations)).
- **Cookies** : la mesure d'audience exemptée de consentement reste la seule voie sans bandeau
  ([CNIL](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience)).

### 6. Le marché

- Webflow : AEO réservé à l'offre Enterprise (mesure de la présence dans ChatGPT, correctifs par agent),
  MCP 2.1 et agents de rédaction
  ([CMSWire](https://www.cmswire.com/digital-experience/webflow-launches-aeo-for-enterprise/)).
- Framer 3.0 : des agents dans le canevas et un MCP ouvert à tous ([Framer](https://www.framer.com/blog/framer-3/)).
- OpenFlow est au niveau sur la connexion des IA (MCP avec OAuth, WebMCP). La différence à creuser :
  **une visibilité dans les IA mesurable et conforme au droit européen, pour les petites entreprises,
  sans tarif Enterprise**.

## Ce qu'OpenFlow fait déjà

Avant cette veille : site statique rapide, `llms.txt` et `llms-full.txt`, sitemap, JSON-LD `WebSite`,
`Article` et fil d'Ariane, flux RSS des collections, collections avec dates, MCP avec OAuth et WebMCP,
formulaires avec anti-spam, Google Analytics avec consentement, images optimisées.

## Priorités retenues

Réalisés en septembre 2026 : la fiche établissement (1), la fraîcheur et IndexNow (2), les robots des IA
(3), WebMCP à jour et les formulaires déclarés (4), la mesure d'audience sans cookie (5), la norme « prêt
pour les agents » (6), l'audit du site par l'IA (8).


| # | Chantier | Effort | Pourquoi |
|---|---|---|---|
| 1 | **Fiche établissement** : une seule source (type d'activité, adresse, téléphone, horaires, fermetures exceptionnelles, liens vers la fiche Google et les réseaux) qui alimente le JSON-LD `LocalBusiness`, le pied de page, `llms.txt` et l'IA (« nous sommes fermés du 10 au 20 août ») | M | Les IA et Google répondent « est-ce ouvert dimanche ? » à partir de ces données |
| 2 | **Fraîcheur** : date de modification réelle dans le sitemap et le JSON-LD, envoi IndexNow à chaque publication | S | Bing et Copilot, fraîcheur des citations |
| 3 | **Robots des IA** : réglage « entraînement des IA » (refuser GPTBot, ClaudeBot, Google-Extended…) sans quitter la recherche IA (OAI-SearchBot, Claude-SearchBot, PerplexityBot) | S | Le propriétaire choisit, sans perdre sa visibilité |
| 4 | **WebMCP à jour et formulaires déclaratifs** : `document.modelContext`, formulaires du site annotés pour les agents, messages envoyés par un agent signalés dans « Messages » | S | L'agent du visiteur remplit le formulaire de contact proprement |
| 5 | **Mesure d'audience sans cookie** (exemptée CNIL), avec les visites venant de ChatGPT, Perplexity, Gemini, Claude et Copilot | M-L | Plus de bandeau, et la « visibilité IA » enfin mesurée |
| 6 | **Audit « accessible = prêt pour les agents »** dans la norme (libellés, boutons, cibles, stabilité) | M | Accessibilité et agents, même combat |
| 7 | **Collections typées** : événements (`Event`), prestations et offres (`Offer`), avec leurs données structurées | M | Réponses riches dans Google et les IA |
| 8 | **Outils d'audit dans le MCP** : l'IA du propriétaire repère ce qui manque (description, alt, dates) et propose des brouillons | M | Le propriétaire améliore son site en discutant |

## À ne pas faire pour l'instant

- **Paiement par agent** (ACP, AP2, UCP) : non disponible en Europe, hors sujet pour un site vitrine.
- **Point d'accès NLWeb `/ask`** ou **MCP public pour les agents des visiteurs** : pas d'adoption
  démontrée, découverte non standardisée.
- **Investir davantage dans `llms.txt`** ou dans un Markdown par page : Google les ignore ; on garde
  l'existant, qui ne coûte rien.
- **Balisage FAQPage** pour des résultats enrichis : supprimés par Google.
- **Chatbot IA sur le site** : coûteux, soumis à l'article 50, valeur non démontrée pour une petite
  entreprise.
