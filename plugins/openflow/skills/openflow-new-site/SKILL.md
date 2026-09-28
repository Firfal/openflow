---
name: openflow-new-site
description: Workflow pour créer un nouveau site OpenFlow (Next.js + Firebase) éditable par son propriétaire, y compris depuis un dossier vide (installe OpenFlow au besoin). À utiliser quand l'utilisateur demande de créer un site « avec OpenFlow », ou un site vitrine que son client pourra modifier lui-même.
argument-hint: "[nom du site]"
---

# Créer un site OpenFlow

Objectif : livrer un site sur mesure, soigné, dont **chaque texte, image et lien** est modifiable par
le propriétaire depuis `/admin`.

## 1. Comprendre le besoin (5 minutes maximum)

Récupère ou déduis ces informations : activité, cible, ton, couleurs, pages voulues (accueil, à
propos, services, contact…) et contenus disponibles. S'il manque une information, pose une seule
question groupée, puis avance avec des hypothèses raisonnables.

## 2. Préparer OpenFlow et créer le site (une commande)

Les paquets OpenFlow ne sont pas publiés sur npm : un site vit dans le dossier `sites/` du dépôt OpenFlow
(https://github.com/Firfal/openflow, ou la copie privée de l'agence). Le script `scripts/openflow-init.sh`
de ce skill fait tout ce qui manque, et seulement cela : il vérifie les prérequis (git, Node.js 22 ou plus ;
pnpm n'est pas obligatoire), réutilise le dépôt du dossier courant ou le clone dans `./openflow`, installe
et compile les paquets, puis crée le site.

```bash
sh "${CLAUDE_SKILL_DIR}/scripts/openflow-init.sh" --site <dossier> --name "<Nom du site>"
```

- `${CLAUDE_SKILL_DIR}` est le dossier de ce skill (dans un autre outil que Claude Code : le dossier qui
  contient ce `SKILL.md`).
- Copie privée de l'agence : ajoute `--repo <url git>` (ou la variable `OPENFLOW_REPO`).
- Si le script échoue sur un prérequis, donne à l'utilisateur la commande d'installation affichée, puis
  relance le script.
- Sans le script, les mêmes étapes à la main, depuis le dossier de travail :
  ```bash
  git clone --branch main https://github.com/Firfal/openflow && cd openflow
  pnpm install && pnpm build
  pnpm openflow create sites/<dossier> --name "<Nom du site>"
  pnpm install                        # relie le site aux paquets du dépôt
  ```

Travaille ensuite dans `sites/<dossier>` (chemin affiché à la fin du script).

Le modèle contient déjà les parties invariantes : `firebase.json`, les règles de sécurité, les Cloud Functions,
la route `/admin`, le rendu statique, `AGENTS.md` et les hooks. **Ne modifie pas ces fichiers**, sauf pour
ajouter des éléments en dehors des blocs `// BEGIN cms` … `// END cms`.

## 3. Concevoir les sections

Commence par le plan de design du skill `openflow-design` (couleurs, typographies, mise en page, élément
mémorable), et suis ses règles pour chaque section.

- Adapte, renomme ou remplace les sections d'exemple de `openflow/components/`. Tant que le site n'est
  pas livré, les renommer est permis.
- Crée les sections spécifiques au projet : menu, tarifs, équipe, galerie, horaires, carte…
- Chaque section : `fields` (libellés en français, clairs pour un non-technicien), `defaultProps`
  réalistes, `render` en Tailwind, responsive et accessible.
- Enregistre chaque section dans `components` et dans une catégorie de `openflow.config.tsx`.
- En-tête et pied de page : `openflow/layout/SiteLayout.tsx`, déclaré dans `layout` de `defineConfig` et alimenté par
  `settings` (menu, coordonnées, réseaux sociaux). L'admin affiche ce cadre autour de la page éditée.
- Couleurs : ajuste les thèmes dans `app/globals.css` (`--site-accent`) et les options du réglage `theme`.
- Contenus qui reviennent (actualités, réalisations, événements, recettes, équipe) : une **collection**,
  pas des pages copiées. Le modèle en montre une (« Actualités » : section `Article`, section de liste
  `ArticleList`, route `app/rss.xml/`) ; adapte-la, ou retire-la si le site n'en a pas l'usage (config,
  sections, contenu de départ, lien du menu et route du flux). Voir « Collections » dans `contrat.md`.

Après chaque fichier écrit, les hooks OpenFlow t'envoient les erreurs `OF-xxx` : corrige-les tout de suite.
Dans un outil sans ces hooks, lance `npx openflow check` dans le dossier du site après chaque série de
modifications.

## 4. Écrire le contenu de départ

- `openflow/seed/settings.json` : nom du site, langue, description, menu et coordonnées.
- `openflow/seed/pages/<id>.json` : une page par fichier. L'accueil a le slug `""`. Un élément de
  collection porte `"collection": "<nom>"` et une adresse sous celle de la collection ; prévois deux ou
  trois éléments réalistes pour que les listes aient de l'allure dès la livraison.
- Liens internes : `{ "kind": "page", "pageId": "<id>", "href": "/<slug>/" }`. Liens externes :
  `{ "kind": "url", "href": "https://…" }`.
- Renseigne `seo.title` et `seo.description` pour chaque page.
- Textes réalistes et spécifiques au client. N'utilise jamais de « Lorem ipsum ».

## 5. Vérifier et prévisualiser

```bash
npx openflow check --level build   # doit afficher « conforme à la norme OFS ✓ »
npx openflow dev                   # http://localhost:3000 (site) et /admin (éditeur), Java 21 requis
```

Ouvre `/admin`, connecte-toi avec la connexion rapide de l'émulateur et vérifie que chaque section
s'édite directement sur la page. Relis le site en captures d'écran, sur ordinateur et sur mobile
(skill `openflow-design`, étape 10).

## 6. Rendre la main

Résume ce qui a été créé (pages, sections, réglages) et indique comment livrer :
`/openflow:openflow-deploy`, ou `npx openflow deploy --project <id> --owner <email>`.
