# OpenFlow (monorepo) : instructions pour les agents IA

Ce fichier est lu par Claude Code (via `CLAUDE.md`), Codex, Cursor, GitHub Copilot, Gemini CLI et les autres
outils qui suivent la convention `AGENTS.md`.

## Créer ou modifier un site OpenFlow

Les sites vivent dans `sites/<dossier>` (les paquets ne sont pas publiés sur npm). Les workflows sont des
skills au format Agent Skills, dans `plugins/openflow/skills/` : lis le `SKILL.md` qui correspond à la demande
si ton outil ne les a pas chargés.

- Créer un site : `plugins/openflow/skills/openflow-new-site/SKILL.md`. Le script
  `plugins/openflow/skills/openflow-new-site/scripts/openflow-init.sh --site <dossier> --name "<Nom>"` installe,
  compile et crée le site.
- Design : `plugins/openflow/skills/openflow-design/SKILL.md`. Livraison : `plugins/openflow/skills/openflow-deploy/SKILL.md`.
- Modifier un site existant : son `AGENTS.md` (contrat des sections), puis `npx openflow check` dans son dossier
  après chaque série de modifications. Un site n'est terminé que lorsque `npx openflow check --level build`
  affiche « conforme à la norme OFS ✓ ».

## Contribuer au monorepo

Spécification : `docs/`. Documentation en français, identifiants et commentaires de code en anglais.

### Commandes

- `pnpm build` : compile tous les paquets (à relancer après une modification de `packages/*`, car le template et les tests consomment `dist/`).
- `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- `pnpm gen:docs` : régénère `docs/norme/`, `packages/core/docs/rules/` et les références du plugin depuis
  `packages/check/src/rules.ts` (source unique), puis les manifestes du plugin pour les autres outils IA depuis
  `plugins/openflow/.claude-plugin/plugin.json` (`scripts/gen-plugins.mjs`). `pnpm check:docs` échoue si ces
  fichiers sont obsolètes.
- `cd templates/next-starter && npx openflow check --level build --build` : le template doit rester conforme à 100 %
  (`--build` reconstruit `out/` ; sans lui, le contrôle relit le dernier export, parfois périmé).
- `pnpm --filter @openflow/e2e test` : émulateurs Firebase (Java 21 requis) et Playwright.
- `pnpm --filter @openflow/e2e weight ../../templates/next-starter/out --budget` : poids de l'écran de connexion de
  l'admin (après un export), avec le budget vérifié en CI.

### Conventions

- Les noms qui finissent dans l'infrastructure et les données des sites livrés restent neutres, sans le nom du
  produit (qui peut changer) : collections `cms_*`, claim `cms_owner`, fonctions `cms*`, dossiers Storage `cms/`,
  variables `CMS_*`, blocs de règles `// BEGIN cms`, préfixes de jetons `cms…_`. Ils sont centralisés dans
  `packages/core/src/model.ts`. Les paquets ne sont pas publiés sur npm : les sites vivent dans `sites/`.
- Les règles de sécurité de référence vivent dans `packages/core/src/firebase-rules.ts`. Toute modification doit être
  reportée dans `templates/next-starter/*.rules` (le test OF-303 du template le vérifie).
- Toute nouvelle règle de la norme va dans `RULES` (`packages/check/src/rules.ts`), avec un test de fixture
  dans `packages/check/test/`, puis `pnpm gen:docs`.
- Le template ne doit contenir aucun texte, aucune image ni aucun lien écrits en dur dans `openflow/components` et `openflow/layout`.
- Design et UI/UX, toujours : les sites publics (template, landing, composants de `packages/next`) suivent le skill
  `plugins/openflow/skills/openflow-design`, et l'admin le skill `.claude/skills/admin-ui`. Chaque changement visible
  se vérifie en captures (ordinateur et mobile, clair et sombre). Pour un besoin qu'ils ne couvrent pas, cherche
  d'abord un skill reconnu sur GitHub, puis reporte ses principes utiles dans le skill concerné.
- L'interface de l'admin (`packages/admin`) suit le skill `.claude/skills/admin-ui` : jetons `--of-*` (clair et
  sombre), composants de `ui.tsx`, icônes de `icons.tsx`, noms accessibles utilisés par les tests E2E. Ce que
  voit le propriétaire est décrit dans `docs/interface-admin.md`.
- Les outils de l'assistant IA (serveur MCP `cmsMcp` et WebMCP de l'admin) sont définis une seule fois dans
  `packages/core/src/agent/` : tout nouvel outil y va, avec un test dans `packages/core/test/agent.test.ts`, et
  sa ligne dans `docs/assistant-ia.md`. La connexion OAuth du serveur MCP (`https://<site>/mcp`) vit dans
  `packages/functions/src/oauth.ts` (tests `packages/functions/test/oauth.test.ts` et `tests/e2e/assistant.test.ts`).
