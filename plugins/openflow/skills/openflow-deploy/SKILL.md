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
- Un projet Firebase **en plan Blaze** (obligatoire pour les Cloud Functions, Cloud Build et Storage),
  dans lequel ces services sont activés dans la console :
  - **Firestore** (mode production) ;
  - **Storage** ;
  - **Authentication**, avec les méthodes « Adresse e-mail / lien de connexion » et « Google ».
- Des identifiants locaux :
  - `npx firebase login` ;
  - `gcloud auth application-default login` (la CLI OpenFlow envoie le code source et lance le build avec ces identifiants) ;
  - `gcloud auth application-default set-quota-project <id>`.

## 2. Droits du build (une seule fois par projet)

Cloud Build reconstruit le site à chaque « Publier ». Crée un compte de service dédié et donne-lui les
droits nécessaires :

```bash
PROJECT=<id>
gcloud iam service-accounts create openflow-builder --project $PROJECT
SA=openflow-builder@$PROJECT.iam.gserviceaccount.com
for ROLE in roles/firebasehosting.admin roles/firebase.viewer roles/serviceusage.serviceUsageConsumer roles/storage.objectViewer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT --member serviceAccount:$SA --role $ROLE
done
```

Ensuite, dans `functions/.env.<id>`, ajoute `OPENFLOW_BUILD_SERVICE_ACCOUNT=openflow-builder@<id>.iam.gserviceaccount.com`.

Le compte de service des Cloud Functions (compte Compute par défaut) doit pouvoir lancer ce build :
`roles/cloudbuild.builds.editor`, plus `roles/iam.serviceAccountUser` sur `openflow-builder`, plus
`roles/firebasehosting.admin` pour la restauration de versions.

## 3. Déployer

```bash
npx openflow deploy --project <id> --owner <email-du-proprietaire>
```

Cette commande :
- refait le contrôle de conformité ;
- déploie les règles de sécurité et les Cloud Functions ;
- envoie le code source dans Storage ;
- importe le contenu de départ sans jamais écraser un contenu existant ;
- lance la première publication.

Si les paquets `@openflow/*` ne viennent pas de npm (site placé dans le dépôt OpenFlow ou dans un fork,
dépendances `workspace:`), la commande prépare une copie autonome du site : elle empaquette ces paquets
dans `vendor/` avec `pnpm pack`, y fait pointer les `package.json` et génère un `package-lock.json`.
Cloud Build et Cloud Functions installent alors exactement les versions du dépôt. Lance d'abord `pnpm build`
à la racine du dépôt.

Suis le lien Cloud Build affiché : le site doit être en ligne 2 à 4 minutes plus tard.

## 4. Domaine

Console Firebase > Hosting > « Ajouter un domaine personnalisé ». Mets ensuite à jour l'adresse du
site dans l'admin (Réglages > Site et référencement) et publie.

## 5. Passation au propriétaire

Rédige une fiche courte, en français et sans jargon :
- l'adresse de l'admin : `https://<domaine>/admin/` ;
- la connexion : il saisit son e-mail (`<email>`) et clique sur le lien reçu, ou utilise Google ;
- modifier une page : Pages > Modifier, puis il clique sur un texte pour l'éditer ; tout est enregistré automatiquement ;
- mettre en ligne : bouton « Publier » (2 à 4 minutes) ;
- revenir en arrière : Historique > « Remettre en ligne » ;
- les réglages communs (menu, coordonnées, couleur) : onglet Réglages.

## Évolutions ultérieures du code

Après toute modification du code, relance `npx openflow deploy --project <id>`. Le contenu du
propriétaire est conservé ; ne renomme ni ne supprime jamais un champ déjà utilisé (norme OFS, OF-202).
