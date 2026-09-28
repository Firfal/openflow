# OpenFlow

**Des sites Next.js créés avec Claude Code, que leur propriétaire modifie lui-même, comme dans Webflow
ou Framer, avec un backend 100 % Firebase.**

- Le propriétaire clique sur un texte pour le modifier, remplace les images, ajoute ou réordonne des
  sections, change le style écran par écran, puis clique sur « Publier ». Tout se fait depuis
  `https://son-site/admin`.
- Il publie ses **actualités, réalisations ou événements** dans des collections : chaque élément a sa page,
  les listes du site se mettent à jour seules, avec données structurées pour Google et flux RSS.
- Il peut aussi **brancher son IA** (Claude, ChatGPT, Cursor…) sur son site et le modifier en discutant avec
  elle : il colle `https://son-site/mcp` dans son assistant, se connecte et clique sur « Autoriser »
  ([docs/assistant-ia.md](docs/assistant-ia.md)). Son IA peut aussi auditer le site et lire ses statistiques.
- Le site est fait pour être **trouvé et cité par Google et les assistants IA** : fiche établissement
  (horaires, fermetures), données structurées (`LocalBusiness`, `Article`, `Event`, `Service`, `Product`),
  `llms.txt`, IndexNow à chaque publication, choix des robots d'entraînement, formulaires déclarés aux
  agents (WebMCP), mise à jour automatique quand un événement est passé
  ([docs/sites-de-demain.md](docs/sites-de-demain.md)).
- **Statistiques sans cookie ni bandeau** (conformes CNIL), avec les visites envoyées par ChatGPT, Perplexity,
  Claude, Gemini ou Copilot.
- Le site est publié en **HTML statique** sur Firebase Hosting : rapide, bien référencé, à coût quasi nul.
- Tout vit **dans le projet Firebase du site** : Hosting, Firestore, Auth, Storage, Functions et Cloud Build.
- Le code produit par l'IA est contrôlé par une **norme vérifiable (OFS)**. Claude Code reçoit un retour
  automatique à chaque écart et se corrige seul.
- Open-source (MIT). L'éditeur visuel est [Puck](https://puckeditor.com) ; OpenFlow apporte tout le reste.

> Statut : **phases 1 à 4 en partie réalisées** (voir la feuille de route). OpenFlow s'utilise depuis ce dépôt GitHub : les paquets ne sont pas
> publiés sur npm, chaque site vit dans le dossier `sites/`. Feuille de route : [docs/roadmap.md](docs/roadmap.md).

## Créer un site

Les sites se créent dans le dossier `sites/` de ce dépôt, où ils utilisent directement les paquets
OpenFlow. Pour des sites clients qui ne doivent pas être publics, travaillez dans une copie privée du dépôt
(un dépôt privé qui suit celui-ci pour recevoir les mises à jour).

```bash
git clone https://github.com/Firfal/openflow && cd openflow
pnpm install && pnpm build
pnpm openflow create sites/boulangerie --name "Boulangerie Dupont"
pnpm install                       # relie le nouveau site aux paquets
cd sites/boulangerie
npx openflow dev                   # site + /admin sur les émulateurs Firebase
npx openflow check --level build   # conformité à la norme OFS
npx openflow deploy --project mon-projet --owner client@exemple.fr
```

Avec Claude Code, ouvert dans le dépôt :

```text
/plugin marketplace add Firfal/openflow
/plugin install openflow@openflow

> Crée le site de la boulangerie Dupont avec OpenFlow
```

Le plugin fournit :
- les skills `openflow`, `openflow-new-site`, `openflow-design` et `openflow-deploy` ;
- des hooks qui lancent `openflow check` après chaque modification et avant la fin de chaque tâche.

`openflow deploy` embarque les paquets du dépôt dans la livraison (`vendor/`) : Cloud Build et Cloud
Functions n'ont pas besoin de npm pour les installer.

## Documentation

| Document | Contenu |
|---|---|
| [Vision](docs/vision.md) | Problème, proposition, principes |
| [Solutions existantes](docs/existant.md) | Comparatif (Puck, Payload, Tina, FireCMS…) et positionnement |
| [Architecture](docs/architecture.md) | Paquets, rendu, édition, publication |
| [Modèle de données](docs/modele-de-donnees.md) | Firestore, Storage, snapshot |
| [Sécurité](docs/securite.md) | Propriétaire unique, règles, build |
| [Interface de l'admin](docs/interface-admin.md) | Tableau de bord, éditeur, panneau de droite et style, raccourcis, clair et sombre |
| [Assistant IA](docs/assistant-ia.md) | Brancher Claude, ChatGPT ou Cursor sur `https://<site>/mcp` (connexion OAuth), WebMCP, `llms.txt` |
| [Contrat d'intégration](docs/contrat-integration.md) | Kit Claude Code, boucle de retour |
| [Norme OFS](docs/norme/README.md) | Les règles OF-xxx vérifiées par `openflow check` |
| [Feuille de route](docs/roadmap.md) | Phases 2 à 5 |
| [Les sites de demain](docs/sites-de-demain.md) | Recherche par IA, agents, droit européen : les enjeux et les priorités qui en découlent |

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
sites/                              les sites (landing du projet, sites clients)
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
