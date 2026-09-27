# Assistant IA : modifier le site en discutant

Le propriétaire peut brancher une IA (Claude, ChatGPT ou tout client compatible MCP) sur son site et lui
demander des modifications en langage courant : « change le titre de l'accueil », « ajoute une question à
la FAQ », « mets les titres en bleu sur mobile », « crée une page Tarifs », « publie ».

Deux portes d'entrée utilisent **les mêmes outils** (définis une seule fois dans `@openflow/core`) :

| | Serveur MCP | WebMCP |
|---|---|---|
| Pour | Claude (claude.ai, application, Claude Code), ChatGPT, Cursor, VS Code, tout client MCP | L'assistant IA intégré au navigateur |
| Où | `https://<domaine du site>/mcp` (réécriture Hosting vers la fonction `cmsMcp`) | L'admin (`/admin`), tant qu'elle est ouverte |
| Accès | Connexion OAuth (« Se connecter », puis « Autoriser » dans l'admin), ou clé créée dans l'admin | La session du propriétaire |
| Page ouverte dans l'éditeur | Mise à jour en direct (notification) | Modifiée à travers Puck (annulable) |

## Brancher une IA (propriétaire)

L'admin montre le chemin partout : l'entrée **Assistant IA** de la barre latérale, une carte sur la page
Pages tant qu'aucune IA n'est connectée, le bouton ✦ de la barre de l'éditeur et la recherche rapide
(« Connecter une IA »). La page Assistant IA donne l'adresse du site pour l'IA, `https://<domaine>/mcp`, et
les étapes propres à chaque assistant :

| Assistant | Étapes |
|---|---|
| **Claude** (claude.ai, application) | Paramètres > Connecteurs > *Ajouter un connecteur personnalisé*, coller l'adresse, *Se connecter* |
| **ChatGPT** | Paramètres > Applications et connecteurs > Paramètres avancés : *mode développeur* (offres payantes), puis *Créer*, coller l'adresse, authentification OAuth |
| **Claude Code** | `claude mcp add --transport http <nom> https://<domaine>/mcp`, puis `/mcp` > *Authenticate* |
| **Cursor**, **VS Code** | Bouton « Ajouter à Cursor » ou « Ajouter à VS Code » (lien d'installation), puis *Connect* |
| **Autre client MCP** | `{ "mcpServers": { "<nom>": { "url": "https://<domaine>/mcp" } } }` |

Dans tous les cas, l'assistant ouvre ensuite l'admin sur un **écran d'autorisation** : le propriétaire se
connecte s'il ne l'est pas, vérifie le nom de l'assistant et l'adresse de retour, puis clique sur
**Autoriser**. Il n'y a rien à copier ni à garder secret.

- Les modifications sont des **brouillons** : elles apparaissent dans l'éditeur, et rien n'est en ligne
  avant la publication (que l'assistant ne lance qu'avec l'accord du propriétaire).
- La liste **IA connectées** montre chaque assistant et sa dernière utilisation ; « Déconnecter » lui retire
  l'accès aussitôt.
- Pour un outil qui ne sait pas se connecter (script, ancien client), une **clé d'accès** reste possible,
  repliée en bas de la page : en-tête `Authorization: Bearer cmsk_…`, ou `?key=cmsk_…` pour les outils sans
  en-têtes. Elle n'est affichée qu'une fois et se révoque d'un clic.

## Outils

| Outil | Rôle |
|---|---|
| `get_site_overview` | Pages, collections (avec leurs derniers éléments), types de sections, réglages communs, thème, dernière publication (à appeler en premier) |
| `list_section_types` | Champs de chaque type de section, format attendu des valeurs, valeurs par défaut |
| `get_page` | Sections d'une page (par identifiant ou adresse), avec leurs valeurs et leur style |
| `update_section` | Modifie des champs par chemin : `title`, `items[1].answer`, `image`… |
| `add_section`, `duplicate_section`, `move_section`, `remove_section` | Composition de la page |
| `set_style` | Style libre d'une section ou d'un élément, pour tous les écrans, la tablette ou le mobile |
| `create_page`, `update_page`, `delete_page` | Pages : titre, adresse, statut, référencement. Un élément de collection se modifie ou se supprime avec ces outils ; son titre et son adresse restent liés à sa collection |
| `list_items`, `create_item` | Collections (articles, réalisations…) : lister les éléments dans l'ordre du site, en ajouter un avec les valeurs de sa section (brouillon masqué par défaut) |
| `get_settings`, `update_settings` | Contenu commun (menu, pied de page…) et fiche établissement (lecture) |
| `update_business` | Fiche établissement : coordonnées, horaires, fermetures exceptionnelles (« nous sommes fermés du 10 au 20 août ») |
| `set_theme` | Couleurs et polices du thème (`config.theme`) |
| `list_media`, `import_media` | Médiathèque ; import d'une image ou d'une vidéo depuis une adresse https |
| `get_stats` | Statistiques des 7, 30 ou 90 derniers jours : visites, pages vues, pages les plus lues, sources (dont les assistants IA), pages où arrivent les visiteurs envoyés par une IA, appareils |
| `publish`, `get_publication_status` | Mise en ligne et suivi |

Chaque outil valide ce qu'il reçoit avec les mêmes règles que l'admin (`validatePageData`, liste blanche du
style, options des champs) et renvoie à l'IA des messages d'erreur explicites, en français, qui listent les
valeurs possibles.

## Fonctionnement

- **Protocole** : MCP, transport *Streamable HTTP* en mode sans état (réponses JSON, pas de flux SSE ni de
  session). Implémentation minimale et testée dans `packages/core/src/agent/mcp.ts` (`initialize`,
  `ping`, `tools/list`, `tools/call`), sans dépendance.
- **Adresse** : `firebase.json` réécrit `/mcp`, `/mcp/**` et les adresses de découverte OAuth
  (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`) vers le service
  Cloud Run de la fonction (`"run": { "serviceId": "cmsmcp", "region": … }`). Ce type de réécriture ne
  demande aucun droit sur Cloud Functions au compte de build. La norme le vérifie (OF-305), avec la
  région des fonctions. Les adresses propres de la fonction (`cloudfunctions.net`, `run.app`) restent
  valables.
- **Autorisation** (`packages/functions/src/oauth.ts`), conforme à la spécification d'autorisation de MCP
  (2025-06-18 et 2025-11-25) :

  | Adresse | Rôle |
  |---|---|
  | `401` de `/mcp` | `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"` |
  | `/.well-known/oauth-protected-resource[/mcp]` | Métadonnées de la ressource (RFC 9728) |
  | `/.well-known/oauth-authorization-server` | Métadonnées du serveur (RFC 8414) |
  | `/mcp/oauth/register` | Enregistrement dynamique du client (RFC 7591) |
  | `/mcp/oauth/authorize` | Vérifie le client, l'adresse de retour et PKCE, puis envoie vers `/admin/?view=connect&request=…` |
  | `/mcp/oauth/token` | Code d'autorisation avec PKCE S256 ; jeton de rafraîchissement renouvelé à chaque usage |
  | `/mcp/oauth/revoke` | Révocation (RFC 7009) |

  L'écran d'autorisation appelle `cmsAgentConsent` (réservée au propriétaire), qui délivre un code à
  usage unique. Le jeton d'accès (`cmsa_…`) vaut une heure, le jeton de rafraîchissement (`cmsr_…`) 90 jours
  glissants.
- **Schéma du site** : la Cloud Function n'exécute pas le code React du site. `openflow seed` (lancé par
  `openflow deploy`) écrit dans `cms_system/schema` une description sérialisable des sections, champs,
  réglages et du thème (`buildSiteSchema`) ; la fonction en reconstruit une config de validation
  (`configFromSchema`).
- **Édition en direct** : l'éditeur écoute le contenu de la page ouverte (`cms_page_content/{id}`). Une
  modification signée `Assistant IA` (`updatedBy`) est appliquée dans Puck, avec une notification. Avec WebMCP,
  l'outil modifie directement l'état de Puck : la sauvegarde automatique reste le seul écrivain de la page
  ouverte. Les outils WebMCP (et leurs schémas) ne sont téléchargés que si le navigateur expose
  `document.modelContext` (spécification du groupe communautaire W3C, septembre 2026) ou, dans les
  versions plus anciennes de Chrome, `navigator.modelContext`.
- **Formulaires du site pour les agents des visiteurs** : `<OpenFlowForm>` déclare chaque formulaire à
  l'assistant IA du navigateur du visiteur (API déclarative de WebMCP : `toolname`, `tooldescription`
  sur le formulaire, `toolparamdescription` sur chaque champ). L'assistant remplit le formulaire, le
  visiteur relit et confirme l'envoi ; si l'envoi vient de l'assistant (`SubmitEvent.agentInvoked`), il
  reçoit le résultat (`respondWith`) et le message porte la mention « Rempli par l'assistant IA du
  visiteur » dans « Messages ». Les règles anti-spam restent les mêmes.
- **Site lisible par les IA** : chaque publication produit `llms.txt` (le site, sa description et ses pages,
  au format [llmstxt.org](https://llmstxt.org)) et `llms-full.txt` (le texte de toutes les pages en
  Markdown), à partir du snapshot publié. Les pages `noindex` en sont exclues, comme du sitemap.

## Sécurité

- **Connexion OAuth** :
  - PKCE S256 obligatoire ;
  - adresses de retour enregistrées et comparées exactement. Seules exceptions : le port d'une adresse
    locale (`http://127.0.0.1`, `localhost`) et les schémas d'application (`cursor://`, `vscode://`…) ;
  - `javascript:`, `data:`, `file:` et le `http` hors de l'ordinateur sont refusés ;
  - une demande invalide ne redirige jamais vers une adresse non vérifiée.
- **Écran d'autorisation** : il affiche où l'assistant renvoie le navigateur. Il confirme les assistants
  connus (claude.ai, chatgpt.com) et avertit pour tout autre site web. La page de l'admin ne peut pas être
  intégrée dans un autre site (`X-Frame-Options`).
- **Secrets** : clés `cmsk_` et jetons `cmsa_` / `cmsr_` de 256 bits aléatoires, codes à usage unique
  (5 minutes). Seules leurs empreintes SHA-256 sont stockées.
  - `cms_agent_tokens` : le propriétaire peut lister et supprimer, jamais écrire.
  - `cms_agent_clients`, `cms_agent_requests`, `cms_agent_codes` : réservées aux fonctions.
- **Purge** : les demandes et codes expirés, et les clients jamais utilisés depuis 30 jours, sont purgés
  à chaque nouvel enregistrement.
- **Charge** : la fonction est limitée à 10 instances.
- **Portée** : un accès vaut pour ce site uniquement, avec les droits de l'admin (contenu, style,
  publication), jamais au code, aux comptes ni aux autres données du projet Firebase.
- **Brouillons** : rien n'est visible des visiteurs avant `publish`, et chaque publication reste
  restaurable depuis l'historique.
- **Injection** : une IA peut être manipulée par un contenu qu'elle lit (page web, document). Les valeurs
  écrites sont donc assainies :
  - texte riche en liste blanche de balises (ni script, ni style, ni attribut d'événement) ;
  - liens limités à `https:`, `mailto:`, `tel:` et aux chemins du site (`linkProps` neutralise aussi les
    autres au rendu) ;
  - images en `https:` ou `/…` ;
  - style en liste blanche, sans CSS libre.
- **Import de médias** :
  - https uniquement ;
  - adresses privées refusées (réseau local, métadonnées du cloud) ;
  - types PNG, JPEG, GIF, WebP, AVIF, MP4 et WebM, 15 Mo au plus ;
  - aucune redirection suivie.
- **WebMCP** : l'outil agit avec la session du propriétaire, et le propriétaire confirme lui-même la
  publication et les suppressions (boîte de dialogue du navigateur).
- **Journal** : chaque appel d'outil est journalisé (nom, succès, identifiant de l'accès), sans les données.
  Chaque décision d'autorisation l'est aussi.
