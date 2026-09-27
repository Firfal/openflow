# OpenFlow (monorepo) : instructions pour Claude Code

Spécification : `docs/`. Documentation en français, identifiants et commentaires de code en anglais.

## Commandes

- `pnpm build` : compile tous les paquets (à relancer après une modification de `packages/*`, car le template et les tests consomment `dist/`).
- `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- `pnpm gen:docs` : régénère `docs/norme/`, `packages/core/docs/rules/` et les références du plugin depuis
  `packages/check/src/rules.ts` (source unique). `pnpm check:docs` échoue si ces fichiers sont obsolètes.
- `cd templates/next-starter && npx openflow check --level build --build` : le template doit rester conforme à 100 %
  (`--build` reconstruit `out/` ; sans lui, le contrôle relit le dernier export, parfois périmé).
- `pnpm --filter @openflow/e2e test` : émulateurs Firebase (Java requis) et Playwright.

## Conventions

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
