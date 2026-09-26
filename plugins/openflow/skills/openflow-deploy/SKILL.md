---
name: openflow-deploy
description: Livrer un site OpenFlow sur Firebase (projet Blaze, règles, Cloud Functions, code source, contenu initial, première publication) et préparer la passation au propriétaire.
disable-model-invocation: true
---

# Livrer un site OpenFlow

Suis ces étapes dans l'ordre et vérifie chacune avant de passer à la suivante. Les actions dans la
console Firebase ou Google Cloud reviennent à l'utilisateur : donne-lui les liens et les consignes exactes.

## 1. Prérequis

- Le site est conforme : `npx openflow check --level build` doit afficher « conforme ✓ ».
- Un projet Firebase **en plan Blaze** (obligatoire pour les Cloud Functions, Cloud Build et Storage). Le
  passage à Blaze se fait dans la console (moyen de paiement) : c'est la seule étape qu'aucune commande ne
  peut faire.
- Des identifiants locaux :
  - `npx firebase login` ;
  - `gcloud auth application-default login` (la CLI OpenFlow prépare le projet, envoie le code source et
    lance le build avec ces identifiants) ;
  - `gcloud auth application-default set-quota-project <id>`.

## 2. Préparer le projet (automatique)

```bash
npx openflow setup --project <id> [--alert-email <email>] [--domain www.exemple.fr]
```

`openflow deploy` la lance aussi à chaque livraison (sauf `--no-setup`). Elle ne refait jamais ce qui est
déjà en place et affiche ce qu'elle change (`--dry-run` pour seulement le voir) :
- vérifie le plan Blaze et active les API Google nécessaires ;
- crée Firestore (mode production) et le bucket Storage ;
- crée le compte de build `openflow-builder` (Hosting Admin, lecture Firebase et Storage, journaux) et
  l'écrit dans `functions/.env.<id>` (`OPENFLOW_BUILD_SERVICE_ACCOUNT`) ; donne au compte des fonctions le
  droit de lancer les builds, de restaurer une version et d'évaluer reCAPTCHA ;
- active la connexion par lien e-mail. **Google** demande un client OAuth : si le propriétaire veut ce
  bouton, active-le dans la console (Authentication > Méthode de connexion > Google) ;
- programme une sauvegarde quotidienne de Firestore (7 jours) ;
- crée les alertes e-mail « publication en échec » et « nouveau message » (au propriétaire, ou à
  `--alert-email`) ;
- crée la clé reCAPTCHA Enterprise des formulaires (domaines `web.app`, `firebaseapp.com` et ceux de
  `--domain`) et le TTL des compteurs anti-spam.

**E-mails des formulaires** (recommandé) : crée un compte gratuit sur [Resend](https://resend.com), puis
lance `npx openflow mail --project <id>` et colle la clé `re_…` quand elle est demandée (jamais dans une
discussion ni dans le code : elle va dans Secret Manager). Pour envoyer depuis le domaine du client,
vérifie-le dans Resend et ajoute `--from "Nom <contact@domaine.fr>"`. Sans clé, le propriétaire reçoit
l'alerte « nouveau message » de Cloud Monitoring, sans le contenu.

## 3. Déployer

```bash
npx openflow deploy --project <id> --owner <email-du-proprietaire>
```

Cette commande :
- refait le contrôle de conformité ;
- prépare le projet (`openflow setup`, étape 2) ;
- déploie les règles de sécurité et les Cloud Functions ;
- retire les droits de propriétaire aux comptes qui ne figurent plus dans `--owner` ;
- associe une application Web Firebase au site Hosting (elle la crée au besoin) : l'admin lit sa
  configuration dans `/__/firebase/init.json` ;
- envoie le code source dans Storage ;
- importe le contenu de départ sans jamais écraser un contenu existant, et met à jour le schéma des
  sections (`of_system/schema`) lu par le serveur MCP ;
- lance la première publication.

Le propriétaire peut ensuite brancher son IA (Claude, ChatGPT, Cursor…) sur `https://<domaine>/mcp` : il se
connecte et clique sur « Autoriser » dans l'admin (rubrique Assistant IA). Voir `docs/assistant-ia.md` du
dépôt OpenFlow. Garde les réécritures `/mcp` de `firebase.json` (règle OF-305).

Si les paquets `@openflow/*` ne viennent pas de npm (site placé dans le dépôt OpenFlow ou dans un fork,
dépendances `workspace:`), la commande prépare une copie autonome du site : elle empaquette ces paquets
dans `vendor/` avec `pnpm pack`, y fait pointer les `package.json` et génère un `package-lock.json`.
Cloud Build et Cloud Functions installent alors exactement les versions du dépôt. Lance d'abord `pnpm build`
à la racine du dépôt.

Suis le lien Cloud Build affiché : le site doit être en ligne 2 à 4 minutes plus tard.

## 4. Domaine

Console Firebase > Hosting > « Ajouter un domaine personnalisé ». Ensuite :
- relance `npx openflow setup --project <id> --domain <domaine>` pour autoriser le domaine dans la clé
  reCAPTCHA ;
- mets à jour l'adresse du site dans l'admin (Réglages > Site et référencement) et publie.

## Mesure d'audience (facultatif)

Le propriétaire crée une propriété **Google Analytics 4** (analytics.google.com > Administration > Créer >
Propriété, puis un flux de données Web avec l'adresse du site). Il colle l'« ID de mesure » `G-…` dans
Réglages > Site et référencement > « Identifiant Google Analytics », puis publie. Le site affiche alors une
demande de consentement : rien n'est mesuré sans l'accord du visiteur.

## 5. Passation au propriétaire

Rédige une fiche courte, en français et sans jargon :
- l'adresse de l'admin : `https://<domaine>/admin/` ;
- la connexion : il saisit son e-mail (`<email>`) et clique sur le lien reçu, ou utilise Google ;
- modifier une page : Pages > Modifier, puis il clique sur un texte pour l'éditer ; tout est enregistré automatiquement ;
- changer une image : un clic sur l'image dans la page ; le style (couleurs, tailles, espacements) : bloc
  « Style » à droite, sous le contenu, écran par écran (Ordinateur, Tablette, Mobile) ;
- s'y retrouver : le panneau « Aide » de l'éditeur, et la recherche rapide ⌘K (Ctrl K sous Windows) ;
- mettre en ligne : bouton « Publier » (2 à 4 minutes), qui indique le nombre de modifications en attente ;
- revenir en arrière : Historique > « Remettre en ligne » ;
- modifier le site en discutant avec son IA : dans Claude ou ChatGPT, « Ajouter un connecteur » avec
  l'adresse `https://<domaine>/mcp`, puis « Se connecter » et « Autoriser » (étapes détaillées dans l'admin,
  rubrique Assistant IA) ;
- les réglages communs (menu, coordonnées, couleur) : Réglages > Contenu commun, puis Thème ;
- les messages du formulaire de contact : rubrique Messages de l'admin, et par e-mail ;
- les images et vidéos sont optimisées automatiquement à l'import : il peut importer les originaux.

## Évolutions ultérieures du code

Après toute modification du code, relance `npx openflow deploy --project <id>`. Le contenu du
propriétaire est conservé ; ne renomme ni ne supprime jamais un champ déjà utilisé (norme OFS, OF-202).
