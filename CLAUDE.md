# OpenFlow (monorepo) : instructions pour Claude Code

Spécification : `docs/`. Documentation en français, identifiants et commentaires de code en anglais.

## Commandes

- `pnpm build` : compile tous les paquets (à relancer après une modification de `packages/*`, car le template et les tests consomment `dist/`).
- `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- `pnpm gen:docs` : régénère `docs/norme/`, `packages/core/docs/rules/` et les références du plugin depuis
  `packages/check/src/rules.ts` (source unique). `pnpm check:docs` échoue si ces fichiers sont obsolètes.
- `cd templates/next-starter && npx openflow check --level build` : le template doit rester conforme à 100 %.
- `pnpm --filter @openflow/e2e test` : émulateurs Firebase (Java requis) et Playwright.

## Conventions

- Les règles de sécurité de référence vivent dans `packages/core/src/firebase-rules.ts`. Toute modification doit être
  reportée dans `templates/next-starter/*.rules` (le test OF-303 du template le vérifie).
- Toute nouvelle règle de la norme va dans `RULES` (`packages/check/src/rules.ts`), avec un test de fixture
  dans `packages/check/test/`, puis `pnpm gen:docs`.
- Le template ne doit contenir aucun texte, aucune image ni aucun lien écrits en dur dans `openflow/components` et `openflow/layout`.
- Les outils de l'assistant IA (serveur MCP `openflowMcp` et WebMCP de l'admin) sont définis une seule fois dans
  `packages/core/src/agent/` : tout nouvel outil y va, avec un test dans `packages/core/test/agent.test.ts`, et
  sa ligne dans `docs/assistant-ia.md`.
