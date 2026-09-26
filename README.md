# OpenFlow

**Des sites Next.js créés avec Claude Code, que leur propriétaire modifie lui-même, comme dans Webflow
ou Framer, avec un backend 100 % Firebase.**

- Le propriétaire clique sur un texte pour le modifier, remplace les images, ajoute ou réordonne des
  sections, change le style écran par écran, puis clique sur « Publier ». Tout se fait depuis
  `https://son-site/admin`.
- Il peut aussi **brancher son IA** (Claude, ChatGPT…) sur son site et le modifier en discutant avec elle :
  serveur MCP intégré et WebMCP ([docs/assistant-ia.md](docs/assistant-ia.md)).
- Le site est publié en **HTML statique** sur Firebase Hosting : rapide, bien référencé, à coût quasi nul.
- Tout vit **dans le projet Firebase du site** : Hosting, Firestore, Auth, Storage, Functions et Cloud Build.
- Le code produit par l'IA est contrôlé par une **norme vérifiable (OFS)**. Claude Code reçoit un retour
  automatique à chaque écart et se corrige seul.
- Open-source (MIT). L'éditeur visuel est [Puck](https://puckeditor.com) ; OpenFlow apporte tout le reste.

> Statut : **phase 1 (fondations)**. Les paquets ne sont pas encore publiés sur npm : utilisez le monorepo
> (voir « Contribuer »). Feuille de route : [docs/roadmap.md](docs/roadmap.md).

## Créer un site avec Claude Code

```text
/plugin marketplace add Firfal/openflow
/plugin install openflow@openflow

> Crée le site de la boulangerie Dupont avec OpenFlow
```

Le plugin fournit :
- les skills `openflow`, `openflow-new-site` et `openflow-deploy` ;
- des hooks qui lancent `openflow check` après chaque modification et avant la fin de chaque tâche.

Sans Claude Code :

```bash
npx openflow create mon-site --name "Boulangerie Dupont"
cd mon-site && npm install
npx openflow dev                   # site + /admin sur les émulateurs Firebase
npx openflow check --level build   # conformité à la norme OFS
npx openflow deploy --project mon-projet --owner client@exemple.fr
```

## Documentation

| Document | Contenu |
|---|---|
| [Vision](docs/vision.md) | Problème, proposition, principes |
| [Solutions existantes](docs/existant.md) | Comparatif (Puck, Payload, Tina, FireCMS…) et positionnement |
| [Architecture](docs/architecture.md) | Paquets, rendu, édition, publication |
| [Modèle de données](docs/modele-de-donnees.md) | Firestore, Storage, snapshot |
| [Sécurité](docs/securite.md) | Propriétaire unique, règles, build |
| [Assistant IA](docs/assistant-ia.md) | Serveur MCP et WebMCP : modifier le site par la discussion |
| [Contrat d'intégration](docs/contrat-integration.md) | Kit Claude Code, boucle de retour |
| [Norme OFS](docs/norme/README.md) | Les règles OF-xxx vérifiées par `openflow check` |
| [Feuille de route](docs/roadmap.md) | Phases 2 à 5 |

## Structure du dépôt

```
packages/
  core/        @openflow/core       config, champs, modèle, snapshot, validation, docs agents
  check/       @openflow/check      norme OFS : analyse statique, sentinelles, HTML, hooks
  next/        @openflow/next       intégration Next.js (pages, SEO, sitemap, route admin)
  admin/       @openflow/admin      admin React (Puck + Firebase)
  functions/   @openflow/functions  Cloud Functions (propriétaire, publication, historique)
  cli/         openflow             create, dev, check, hook, seed, build, deploy
templates/next-starter/             site de départ (conforme à 100 %)
sites/landing/                      landing du projet, créée et éditée avec OpenFlow
plugins/openflow/                   plugin Claude Code (skills, hooks)
tests/e2e/                          règles de sécurité et scénario admin sur les émulateurs
docs/                               spécification (FR)
```

## Contribuer

Prérequis : Node 22+, pnpm 10, Java 11+ (émulateurs Firebase).

```bash
pnpm install
pnpm build          # compile les paquets (ordre topologique)
pnpm test           # tests unitaires
pnpm lint           # Biome
pnpm typecheck
pnpm check:docs     # la doc de la norme est à jour (pnpm gen:docs pour la régénérer)

cd templates/next-starter && npx openflow check --level build
pnpm --filter @openflow/e2e test   # règles + scénario Playwright sur les émulateurs
```

## Licence

MIT
