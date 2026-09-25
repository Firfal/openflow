# Sécurité

Objectif : **seul le propriétaire du site peut le modifier**. Les visiteurs voient uniquement le HTML
statique publié.

## Désignation du propriétaire

1. L'e-mail du propriétaire est un paramètre des Cloud Functions (`OPENFLOW_OWNER_EMAIL`, dans
   `functions/.env.<projet>`). Il est fixé par `openflow deploy --owner`. Plusieurs adresses sont
   possibles, séparées par des virgules.
2. Après sa connexion (lien magique par e-mail ou Google), l'admin appelle `openflowClaimOwner`. La
   fonction pose le claim personnalisé `of_owner: true` **uniquement si l'e-mail correspond et est vérifié**.
   Dans l'émulateur local, un e-mail non vérifié est accepté pour permettre la connexion rapide.
3. Les fonctions sensibles (`openflowPublish`, `openflowRestoreRelease`) vérifient **le claim et l'e-mail**.
   Retirer un e-mail du paramètre révoque donc l'accès aux fonctions, même si le claim subsiste.

Il n'y a pas de clé de compte de service à manipuler, et le premier inscrit ne peut pas s'approprier
le site.

## Règles Firestore et Storage

Elles se trouvent dans des blocs `// BEGIN openflow` … `// END openflow`, dont le contenu de référence
est défini dans `packages/core/src/firebase-rules.ts`. La règle OF-303 vérifie qu'ils ne sont pas modifiés.

- `of_site`, `of_pages`, `of_media` : lecture et écriture réservées au propriétaire. Les pages sont
  validées (champs obligatoires, statut).
- `of_releases` : lecture pour le propriétaire, **aucune écriture client** (fonctions uniquement).
- `of_system` : aucun accès client.
- Storage `openflow/media` : lecture publique (images du site). Écriture réservée au propriétaire, limitée
  en type et en taille ; les SVG sont refusés pour éviter l'injection de scripts.
- Storage `openflow/source` et `openflow/snapshots` : aucun accès client.

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

## Recommandations au propriétaire

- Activer la **double authentification** (TOTP), qui demande de passer Firebase Auth à Identity Platform.
- Activer **App Check** (reCAPTCHA Enterprise) : les fonctions l'exigent quand `OPENFLOW_ENFORCE_APP_CHECK=true`.
- Utiliser une adresse e-mail dédiée et sécurisée.
