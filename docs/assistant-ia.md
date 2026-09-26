# Assistant IA : modifier le site en discutant

Le propriétaire peut brancher une IA (Claude, ChatGPT ou tout client compatible MCP) sur son site et lui
demander des modifications en langage courant : « change le titre de l'accueil », « ajoute une question à
la FAQ », « mets les titres en bleu sur mobile », « crée une page Tarifs », « publie ».

Deux portes d'entrée utilisent **les mêmes outils** (définis une seule fois dans `@openflow/core`) :

| | Serveur MCP | WebMCP |
|---|---|---|
| Pour | Claude (application, claude.ai, Claude Code), ChatGPT, tout client MCP | L'assistant IA intégré au navigateur |
| Où | Cloud Function `openflowMcp` : `https://<région>-<projet>.cloudfunctions.net/openflowMcp` | L'admin (`/admin`), tant qu'elle est ouverte |
| Accès | Clé créée par le propriétaire dans Réglages > Assistant IA | La session du propriétaire |
| Page ouverte dans l'éditeur | Mise à jour en direct (notification) | Modifiée à travers Puck (annulable) |

## Brancher une IA (propriétaire)

1. Dans `/admin`, ouvrez **Réglages > Assistant IA** et créez une clé (« Claude sur mon ordinateur »).
   Elle n'est affichée qu'une fois : l'admin donne aussitôt les réglages prêts à copier.
2. Selon l'assistant :
   - **Claude (application ou claude.ai)** : Paramètres > Connecteurs > *Ajouter un connecteur
     personnalisé*, avec l'adresse donnée par l'admin, qui se termine par `?key=ofk_…` : elle contient la clé,
     gardez-la pour vous.
   - **Claude Code** :
     `claude mcp add --transport http mon-site <adresse> --header "Authorization: Bearer ofk_…"`.
   - **Autres clients** : `{ "mcpServers": { "mon-site": { "url": "<adresse>", "headers": { "Authorization": "Bearer ofk_…" } } } }`.
3. Discutez. Les modifications sont des **brouillons** : elles apparaissent dans l'éditeur, et rien n'est en
   ligne avant la publication (que l'assistant ne lance qu'avec votre accord).
4. Une clé perdue ou inutile se **révoque** d'un clic ; la liste indique la dernière utilisation de chaque clé.

## Outils

| Outil | Rôle |
|---|---|
| `get_site_overview` | Pages, types de sections, réglages communs, thème, dernière publication (à appeler en premier) |
| `list_section_types` | Champs de chaque type de section, format attendu des valeurs, valeurs par défaut |
| `get_page` | Sections d'une page (par identifiant ou adresse), avec leurs valeurs et leur style |
| `update_section` | Modifie des champs par chemin : `title`, `items[1].answer`, `image`… |
| `add_section`, `duplicate_section`, `move_section`, `remove_section` | Composition de la page |
| `set_style` | Style libre d'une section ou d'un élément, pour tous les écrans, la tablette ou le mobile |
| `create_page`, `update_page`, `delete_page` | Pages : titre, adresse, statut, référencement |
| `get_settings`, `update_settings` | Contenu commun (menu, pied de page…) |
| `set_theme` | Couleurs et polices du thème (`config.theme`) |
| `list_media`, `import_media` | Médiathèque ; import d'une image ou d'une vidéo depuis une adresse https |
| `publish`, `get_publication_status` | Mise en ligne et suivi |

Chaque outil valide ce qu'il reçoit avec les mêmes règles que l'admin (`validatePageData`, liste blanche du
style, options des champs) et renvoie à l'IA des messages d'erreur explicites, en français, qui listent les
valeurs possibles.

## Fonctionnement

- **Protocole** : MCP, transport *Streamable HTTP* en mode sans état (réponses JSON, pas de flux SSE ni de
  session). Implémentation minimale et testée dans `packages/core/src/agent/mcp.ts` (`initialize`,
  `ping`, `tools/list`, `tools/call`), sans dépendance.
- **Schéma du site** : la Cloud Function n'exécute pas le code React du site. `openflow seed` (lancé par
  `openflow deploy`) écrit dans `of_system/schema` une description sérialisable des sections, champs,
  réglages et du thème (`buildSiteSchema`) ; la fonction en reconstruit une config de validation
  (`configFromSchema`).
- **Édition en direct** : l'éditeur écoute la page ouverte. Une modification signée `Assistant IA`
  (`updatedBy`) est appliquée dans Puck, avec une notification. Avec WebMCP, l'outil modifie directement
  l'état de Puck : la sauvegarde automatique reste le seul écrivain de la page ouverte.
- **Hébergement** : la fonction HTTPS publique `openflowMcp` (région `europe-west1`, ou `OPENFLOW_REGION`),
  déployée avec les autres fonctions par `openflow deploy`. L'admin affiche son adresse. Aucune réécriture
  Hosting n'est nécessaire, ce qui évite de donner au compte de build des droits sur Cloud Functions.

## Sécurité

- **Clés** : 256 bits aléatoires, préfixe `ofk_`. Seule leur empreinte SHA-256 est stockée
  (`of_agent_tokens`), créée par la fonction `openflowCreateAgentToken` réservée au propriétaire. Les règles
  Firestore permettent au propriétaire de lister et de révoquer les clés, jamais d'en écrire.
- **Portée** : une clé donne accès à ce site uniquement, avec les droits de l'admin (contenu, style,
  publication), jamais au code, aux comptes ni aux autres données du projet Firebase.
- **Brouillons** : rien n'est visible des visiteurs avant `publish`, et chaque publication reste
  restaurable depuis l'historique.
- **Injection** : une IA peut être manipulée par un contenu qu'elle lit (page web, document). Les valeurs
  écrites sont donc assainies : texte riche en liste blanche de balises (ni script, ni style, ni attribut
  d'événement), liens limités à `https:`, `mailto:`, `tel:` et aux chemins du site (`linkProps` neutralise
  aussi les autres au rendu), images en `https:` ou `/…`, style en liste blanche sans CSS libre.
- **Import de médias** : https uniquement, adresses privées refusées (réseau local, métadonnées du cloud),
  types PNG, JPEG, GIF, WebP, AVIF, MP4 et WebM, 15 Mo au plus, sans suivre de redirection.
- **WebMCP** : l'outil agit avec la session du propriétaire, et le propriétaire confirme lui-même la
  publication et les suppressions (boîte de dialogue du navigateur).
- **Journal** : chaque appel d'outil est journalisé (nom, succès, identifiant de la clé), sans les données.
