# Sécurité

Objectif : **seul le propriétaire du site peut le modifier**. Les visiteurs voient uniquement le HTML
statique publié.

## Désignation du propriétaire

1. L'e-mail du propriétaire est un paramètre des Cloud Functions (`CMS_OWNER_EMAIL`, dans
   `functions/.env.<projet>`). Il est fixé par `openflow deploy --owner`. Plusieurs adresses sont
   possibles, séparées par des virgules.
2. Après sa connexion (lien magique par e-mail ou Google), l'admin appelle `cmsClaimOwner`. La
   fonction pose le claim personnalisé `cms_owner: true` **uniquement si l'e-mail correspond et est vérifié**.
   Dans l'émulateur local, un e-mail non vérifié est accepté pour permettre la connexion rapide.
3. Les fonctions sensibles (`cmsPublish`, `cmsRestoreRelease`) vérifient **le claim et l'e-mail**.
   Retirer un e-mail du paramètre révoque donc l'accès aux fonctions, même si le claim subsiste.
4. Les règles Firestore et Storage ne vérifient que le claim. C'est pourquoi `openflow deploy` retire
   aussi le claim aux comptes qui ne figurent plus parmi les propriétaires et révoque leurs sessions.
   Leur jeton en cours expire dans l'heure.

Il n'y a pas de clé de compte de service à manipuler, et le premier inscrit ne peut pas s'approprier
le site.

## Règles Firestore et Storage

Elles se trouvent dans des blocs `// BEGIN cms` … `// END cms`, dont le contenu de référence
est défini dans `packages/core/src/firebase-rules.ts`. La règle OF-303 vérifie qu'ils ne sont pas modifiés.

- `cms_site`, `cms_pages`, `cms_page_content`, `cms_media` : lecture et écriture réservées au propriétaire. Les pages sont
  validées (champs obligatoires, statut).
- `cms_releases` : lecture pour le propriétaire, **aucune écriture client** (fonctions uniquement).
- `cms_system` : aucun accès client.
- `cms_agent_tokens` (IA connectées et clés d'accès) : lecture et suppression (déconnexion) par le
  propriétaire ; création uniquement par les fonctions ; seules les empreintes SHA-256 sont stockées.
- `cms_agent_clients`, `cms_agent_requests`, `cms_agent_codes` (connexion OAuth des IA) : aucun accès client.
- `cms_messages` (messages des formulaires) : lecture et suppression par le propriétaire, qui ne peut
  modifier que `read` et `spam` ; création uniquement par la fonction `cmsSubmitForm`.
- `cms_rate_limits` (compteurs d'envois par visiteur) : aucun accès client.
- `cms_stats` (compteurs d'audience) : lecture par le propriétaire ; écriture par la fonction
  `cmsPageView` uniquement.
- Storage `cms/media` : lecture publique (images du site). Écriture réservée au propriétaire, limitée
  en type et en taille (images 15 Mo, vidéos 100 Mo) ; les SVG sont refusés pour éviter l'injection de
  scripts. `cms/media/optimized` (copies optimisées) : lecture publique, écriture par les fonctions
  seulement.
- Storage `cms/source` et `cms/snapshots` : aucun accès client.

Ces règles sont testées sur les émulateurs (`tests/e2e/rules.test.ts`) : un visiteur anonyme et un
utilisateur connecté non propriétaire sont refusés partout ; le propriétaire est autorisé.

## Admin

- `/admin` est servi avec `X-Robots-Tag: noindex`, `X-Frame-Options: SAMEORIGIN` et `Cache-Control: no-cache`.
- Le code de l'admin est public, comme toute application web. Il ne contient aucun secret : la sécurité
  repose sur Firebase Auth et les règles.
- La feuille de style de Puck est chargée sans ressource tierce (`no-external.css`).

## Build et déploiement

- Cloud Build s'exécute avec un **compte de service dédié**, doté du strict nécessaire : Hosting Admin,
  lecture Storage, journaux. Depuis 2024, le compte de service par défaut n'a plus le rôle Éditeur ; la
  procédure est détaillée dans le skill `openflow-deploy`.
- Le build ne lit pas Firestore : il reçoit un snapshot figé.
- La règle OF-304 détecte les secrets dans le code (clés privées, jetons Anthropic, GitHub, AWS, Stripe,
  Slack). Les secrets serveur passent par `defineSecret` (Secret Manager).

## Assistant IA (MCP et WebMCP)

Le serveur MCP (`https://<domaine>/mcp`, fonction `cmsMcp`) accepte deux types d'accès :
- les IA que le propriétaire a autorisées lui-même sur l'écran d'autorisation de l'admin (OAuth 2.1 avec
  PKCE, adresses de retour vérifiées, jetons d'une heure renouvelés) ;
- les clés qu'il a créées.

Les deux se retirent d'un clic. Les outils n'écrivent que des brouillons et assainissent ce qu'ils écrivent
(texte riche, liens, images, style) contre l'injection. L'import de médias refuse les adresses privées. La
réécriture Hosting vers la fonction (`run`) ne demande aucun droit supplémentaire au compte de build.
Détails : [assistant-ia.md](assistant-ia.md#sécurité).

## Formulaires

La fonction `cmsSubmitForm` (`POST /forms/submit`) n'accepte un message que s'il correspond à un
formulaire **de la page publiée** : les champs inconnus sont refusés, les champs obligatoires, les formats
(e-mail, téléphone), les choix et les longueurs sont vérifiés côté serveur. Contre le spam, dans l'ordre :

1. **Champ piège** caché aux personnes et rempli par les robots, et **temps de saisie** minimal
   (2,5 secondes). Un robot reçoit une réponse « envoyé » et rien n'est enregistré.
2. **Limite par visiteur** : 5 envois par 10 minutes. L'adresse IP n'est pas stockée, seulement son
   empreinte salée ; les compteurs s'effacent seuls (TTL Firestore).
3. **reCAPTCHA Enterprise**, invisible, quand `openflow setup` a créé la clé du site : un score inférieur à
   0,5 range le message dans « Indésirables », sans notification. Si Google ne répond pas, le message est
   gardé.

Le propriétaire est prévenu de chaque message par e-mail, via Resend, dont la clé est dans Secret Manager
(`openflow mail`). Sans clé, c'est l'alerte Cloud Monitoring « Site : nouveau message » qui le prévient.

## Mesure d'audience sans cookie

Les statistiques suivent les conditions de la CNIL pour une mesure d'audience **exemptée de consentement**
([CNIL](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience)) :

- **Rien n'est stocké chez le visiteur** : ni cookie, ni identifiant, ni empreinte. Le site envoie une
  balise par page vue (adresse de la page, largeur de la fenêtre, et pour la première page d'une visite la
  page d'origine et `utm_source`).
- **Aucune donnée personnelle conservée** : la fonction `cmsPageView` n'enregistre que des totaux par jour
  (pages, sources, type d'appareil). L'adresse IP ne sert qu'à une limite anti-abus en mémoire (60 vues
  par minute), jamais écrite.
- **Usage réservé au propriétaire**, sans croisement ni transmission à un tiers ; les compteurs sont effacés
  après **25 mois** (politique TTL Firestore installée par `openflow setup`).
- **Refus respecté** : rien n'est envoyé quand le navigateur demande de ne pas suivre (« Do Not Track »,
  Global Privacy Control), ni par les navigateurs automatisés, ni sur les appareils où le propriétaire a
  coché « Ne pas compter mes visites ». Les robots (Googlebot, GPTBot, aperçus de liens…) sont écartés par
  leur agent.
- **Robuste** : une adresse qui n'est pas une page publiée compte comme « autre », la liste des sites
  d'origine est limitée à 100 par jour, une balise pèse au plus 2 Ko, et la fonction répond toujours 204.

La politique de confidentialité du site doit mentionner cette mesure (finalité, durée de conservation).

## Sauvegardes et alertes

`openflow setup` (lancé aussi par `openflow deploy`) programme :
- une **sauvegarde quotidienne** de Firestore, gardée 7 jours (restauration :
  `gcloud firestore databases restore`) ;
- une alerte par e-mail au propriétaire quand une **publication échoue** ;
- une alerte par e-mail à l'arrivée d'un **message** quand aucun e-mail n'est configuré.

## Mesure d'audience

Google Analytics 4 n'est chargé qu'après l'accord du visiteur, comme l'exige la CNIL. Aucun cookie n'est
posé avant. « Refuser » est aussi visible qu'« Accepter », le choix est gardé 6 mois et le bouton
« Cookies » permet d'en changer ; un refus efface les cookies `_ga`. Le mode Consent de Google est réglé
pour ne jamais autoriser la publicité.

## App Check

App Check n'est pas activé, volontairement. Il sert à prouver qu'un appel vient bien de l'application, ce
qui protège les ressources ouvertes à tous. Or :
- toutes les fonctions de l'admin exigent déjà le compte du propriétaire (claim et e-mail) ;
- la seule fonction ouverte au public, les formulaires, vérifie directement le jeton reCAPTCHA Enterprise
  de chaque envoi, ce qui revient au même contrôle sans ajouter de script à l'admin.

L'option `CMS_ENFORCE_APP_CHECK=true` existe pour un site qui initialiserait App Check lui-même ;
sans cela, elle bloquerait l'admin.

## Recommandations au propriétaire

- Activer la **double authentification** (TOTP), qui demande de passer Firebase Auth à Identity Platform.
- Utiliser une adresse e-mail dédiée et sécurisée.
