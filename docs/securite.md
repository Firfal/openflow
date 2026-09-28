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
- `cms_system` : aucun accès client, sauf `cms_system/integrations` (faits publics : région, e-mails,
  clés publiques), en lecture pour le propriétaire.
- `cms_page_translations` (textes des autres langues) : lecture et écriture par le propriétaire.
- `cms_agent_tokens` (IA connectées et clés d'accès) : lecture et suppression (déconnexion) par le
  propriétaire ; création uniquement par les fonctions ; seules les empreintes SHA-256 sont stockées.
- `cms_agent_clients`, `cms_agent_requests`, `cms_agent_codes` (connexion OAuth des IA) : aucun accès client.
- `cms_messages` (messages des formulaires) : lecture et suppression par le propriétaire, qui ne peut
  modifier que `read` et `spam` ; création uniquement par la fonction `cmsSubmitForm`.
- `cms_bookings` (rendez-vous) : lecture et suppression par le propriétaire, qui ne peut modifier que
  `status` (`confirmed` ou `cancelled`) et `cancelledAt` ; création uniquement par la fonction
  `cmsBooking`. `cms_booking_days` (créneaux pris de chaque jour) : lecture par le propriétaire, qui ne
  peut modifier que `busy` (annulation) ; ni création ni suppression côté client.
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

Chaque message porte une date d'effacement (`expiresAt`, **3 ans** après sa réception) : la politique TTL
de Firestore installée par `openflow setup` le supprime alors, comme l'annonce la politique de
confidentialité. Le propriétaire peut l'effacer plus tôt depuis « Messages ».

reCAPTCHA Enterprise agit depuis le 2 avril 2026 comme **sous-traitant** de Google Cloud : le propriétaire
du site est seul responsable du traitement, et les pages ne renvoient plus aux conditions de Google. La
CNIL a sanctionné l'usage de reCAPTCHA sans consentement quand Google s'en servait aussi pour lui-même ;
en sous-traitance, pour la seule sécurité des formulaires, l'intérêt légitime est défendable mais pas
tranché. Un site peu exposé au spam peut s'en passer : le champ piège, le temps de saisie et la limite par
visiteur restent actifs.

## Prise de rendez-vous

- `GET /cms/booking` (réécriture vers `cmsBooking`) ne donne que les créneaux pris (début et fin), sur 92
  jours au plus, sans nom ni coordonnées.
- `POST /cms/booking` passe les mêmes défenses que les formulaires : champ piège, temps de saisie minimal,
  limite par visiteur (adresse IP hachée, compteur effacé après 10 minutes) et score reCAPTCHA. Une demande
  douteuse est refusée plutôt que mise de côté : elle bloquerait un créneau.
- La demande n'est acceptée que pour une prestation de la section **publiée**, à un créneau encore libre
  selon ses règles, les horaires et les fermetures publiés : la fonction recalcule les créneaux dans une
  transaction sur le document du jour, ce qui empêche deux réservations du même créneau.
- Coordonnées vérifiées (nom, e-mail valide ; téléphone et message limités en longueur). Le propriétaire
  est prévenu par e-mail (Resend) ou, sans service d'e-mail, par l'alerte des messages reçus.
- Chaque rendez-vous est effacé 12 mois après sa date (TTL posé par `openflow setup`), comme l'annonce la
  politique de confidentialité, qui décrit la prise de rendez-vous dès qu'une page publiée en propose.

## Google Search Console

- Les balises de validation (Google, Bing) ne sont publiées qu'une fois réduites à leur code (lettres,
  chiffres, `-` et `_`) : rien d'autre ne peut entrer dans le `<head>` du site.
- `cmsSearchStats` est réservée au propriétaire (claim et App Check). Elle lit Search Console en lecture
  seule (portée `webmasters.readonly`) avec le compte de service des fonctions, qui n'a accès qu'aux
  propriétés où le propriétaire l'a ajouté lui-même, avec l'autorisation « Restreint ». Rien n'est
  enregistré dans Firestore.

## Mesure d'audience sans cookie

Les statistiques suivent les conditions de la CNIL pour une mesure d'audience **exemptée de consentement**
([CNIL](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience)) :

- **Rien n'est stocké chez le visiteur** : ni cookie, ni identifiant, ni empreinte. Le site envoie une
  balise par page vue (adresse de la page, largeur de la fenêtre, et pour la première page d'une visite la
  page d'origine et `utm_source`).
- **Aucune donnée personnelle conservée** : la fonction `cmsPageView` n'enregistre que des totaux par jour
  (pages, sources, type d'appareil, et le nombre de chargements rapides, moyens ou lents pour les Core Web
  Vitals : jamais la mesure elle-même). L'adresse IP ne sert qu'à une limite anti-abus en mémoire (60 vues
  par minute), jamais écrite.
- **Usage réservé au propriétaire**, sans croisement ni transmission à un tiers ; les compteurs sont effacés
  après **25 mois** (politique TTL Firestore installée par `openflow setup`).
- **Refus respecté** : rien n'est envoyé quand le navigateur demande de ne pas suivre (« Do Not Track »,
  Global Privacy Control), ni par les navigateurs automatisés, ni sur les appareils où le propriétaire a
  coché « Ne pas compter mes visites ». Les robots (Googlebot, GPTBot, aperçus de liens…) sont écartés par
  leur agent.
- **Robuste** : une adresse qui n'est pas une page publiée compte comme « autre », la liste des sites
  d'origine est limitée à 100 par jour, une balise pèse au plus 2 Ko, et la fonction répond toujours 204.

La politique de confidentialité, écrite par OpenFlow (voir plus bas), décrit cette mesure et contient le
bouton « Ne plus compter mes visites », qui arrête le comptage sur l'appareil du visiteur (droit
d'opposition).

## Pages légales (politique de confidentialité, mentions légales)

Leur texte est **écrit par OpenFlow d'après ce que fait réellement le site** (`legalDocuments` de
`@openflow/core`), à chaque publication : un site qui active Google Analytics ou ajoute un formulaire voit
sa politique changer d'elle-même. La section « Page légale » (`legalDocument` : `privacy` ou `notice`) le
met en page ; le propriétaire peut y ajouter ses propres paragraphes.

- **Politique de confidentialité** (RGPD, art. 13) : responsable du traitement ; consultation du site
  (journal d'accès de Firebase Hosting, 60 jours) ; mesure d'audience sans cookie (25 mois, opposition) ;
  Google Analytics s'il est actif (consentement, cookies 13 mois, choix gardé 6 mois, bouton pour rouvrir
  le bandeau) ; formulaires s'il y en a sur une page publiée (3 ans, limite anti-abus, reCAPTCHA, e-mail via
  Resend) ; destinataires et transferts hors de l'Union (clauses contractuelles types, Data Privacy
  Framework) ; cookies ; droits et autorité de contrôle (CNIL, ou celle du pays de l'établissement).
- **Mentions légales** (LCEN, art. 6) : éditeur (raison sociale, forme et capital, adresse, immatriculation,
  TVA, téléphone, e-mail, directeur de la publication), hébergeur, médiateur de la consommation s'il est
  renseigné, propriété intellectuelle.
- **Hébergeur** : l'entité de Google qui facture le client, selon le pays de l'établissement
  ([Google Cloud](https://cloud.google.com/terms/google-entity)) : Google Cloud France SARL (8 rue de
  Londres, 75009 Paris) pour la France, Google Cloud EMEA Limited (Dublin) pour le reste de l'Europe, du
  Moyen-Orient et de l'Afrique.
- **Faits utilisés** : réglages du site (`site.legal`, `site.business`, `stats`, `gaMeasurementId`), pages
  publiées (formulaires, pages légales), et `cms_system/integrations` (`recaptchaSiteKey`, `mail`,
  `region`), que `cmsPublish` tient à jour à chaque publication.
- **Contrôles** : l'audit du site (`audit_site`, conseils de publication) signale une page légale absente,
  non liée depuis le menu ou le bas de page, ou des informations d'éditeur incomplètes.

OpenFlow n'est pas un conseil juridique : le propriétaire relit ses pages, et complète les cas qu'OpenFlow
ne connaît pas (newsletter, prise de rendez-vous, paiement…) dans le champ « Informations complémentaires ».

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
pour ne jamais autoriser la publicité, et les cookies durent **13 mois** au plus (`cookie_expires`, au lieu
des 2 ans par défaut de Google), comme le recommande la CNIL.

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
