# Landing OpenFlow

La page de présentation du projet (projet Firebase `open-flow`). Elle a été créée avec
`openflow create`, et c'est un site OpenFlow comme les autres : tout son contenu se modifie depuis `/admin`,
et elle est conforme à 100 % à la norme OFS. Direction artistique et méthode : [DESIGN.md](DESIGN.md).

Dans ce dépôt, les paquets `@openflow/*` viennent de l'espace de travail pnpm : lancez `pnpm install`
et `pnpm build` à la racine plutôt que `npm install`.

## Visuels

```bash
pnpm visuals         # schéma d'architecture et carte de partage (visuals/*.html)
pnpm visuals:admin   # captures réelles de l'admin, sur les émulateurs Firebase (Java requis)
```

## Développement

```bash
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
npx openflow deploy --project open-flow --owner <e-mail du propriétaire>
```

Ensuite, dans la console Firebase > Authentication, activez la connexion par lien e-mail et par Google.
Le propriétaire se connecte sur `https://open-flow.web.app/admin/`. Comme les paquets `@openflow/*` ne
sont pas encore publiés sur npm, `openflow deploy` les embarque dans `vendor/` d'une copie autonome du site.

## Structure

| Chemin | Rôle |
|---|---|
| `openflow.config.tsx` | Sections disponibles et réglages globaux |
| `openflow/components/` | Sections (composants Puck avec champs éditables) |
| `openflow/layout/` | En-tête, pied de page et champs des réglages |
| `openflow/seed/` | Contenu de départ, importé à la livraison |
| `app/` | Routes Next.js (pages publiques et `/admin`) |
| `functions/` | Cloud Functions OpenFlow |
