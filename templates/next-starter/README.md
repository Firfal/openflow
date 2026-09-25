# Site OpenFlow

Site Next.js modifiable par son propriétaire depuis `/admin`, hébergé à 100 % sur Firebase.

## Développement

```bash
npm install
npx openflow dev        # site + admin + émulateurs Firebase
```

- Site : http://localhost:3000/
- Admin : http://localhost:3000/admin/ (connexion rapide avec l'e-mail affiché par `openflow dev`)
- Émulateurs : http://localhost:4000/

## Conformité (norme OpenFlow)

```bash
npx openflow check                 # sections et contenu (niveau render)
npx openflow check --level build   # + export statique et HTML (alt, h1, liens, SEO)
```

Avec Claude Code, les hooks de `.claude/settings.json` lancent ces contrôles automatiquement et
renvoient les erreurs à l'agent pour qu'il les corrige.

## Livraison

Prérequis : un projet Firebase en plan **Blaze**, avec Firestore, Storage et Authentication activés.

```bash
gcloud auth application-default login
npx openflow deploy --project mon-projet --owner client@exemple.fr
```

Ensuite, dans la console Firebase > Authentication, activez la connexion par lien e-mail et par Google.
Le propriétaire se connecte sur `https://votre-domaine/admin/`.

## Structure

| Chemin | Rôle |
|---|---|
| `openflow.config.tsx` | Sections disponibles et réglages globaux |
| `openflow/components/` | Sections (composants Puck avec champs éditables) |
| `openflow/layout/` | En-tête, pied de page et champs des réglages |
| `openflow/seed/` | Contenu de départ, importé à la livraison |
| `app/` | Routes Next.js (pages publiques et `/admin`) |
| `functions/` | Cloud Functions OpenFlow |
