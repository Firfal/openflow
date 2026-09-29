---
name: admin-ui
description: Design system and UI rules of the OpenFlow admin (packages/admin). Use before changing any admin screen, component, style or copy — dashboard, editor bar, rail panels, style panel, dialogs, menus — so new work matches the Webflow/Framer-inspired interface, stays accessible in light and dark, and keeps the e2e selectors stable.
metadata:
  internal: true
---

# OpenFlow admin UI

The admin is used by non-technical site owners. It borrows the layout of Webflow and Framer (one top bar,
left rail, right panel, canvas in the middle) and leaves out what would overwhelm them (classes, many
breakpoints, absolute positioning, interactions, custom code). Rules below distil the Vercel Web Interface
Guidelines, interface-design, impeccable (critique and audit), OneRedOak's design review, Krug and Nielsen's
heuristics (wondelai/ux-heuristics), szilu's ux-designer skill (navigation, onboarding) and Emil Kowalski's
motion rules. Full description for owners and contributors: `docs/interface-admin.md`.

## Where things live

| File | Role |
|---|---|
| `packages/admin/src/styles.css` | Tokens (`--of-*`, light + dark), Puck re-theming, every admin style |
| `packages/admin/src/icons.tsx` | `<Icon name>`: inlined Lucide paths (ISC). Add icons here, never a dependency |
| `packages/admin/src/ui.tsx` | `Button`, `IconButton`, `Menu`, `Dialog`, `FormField`, `StatusChip`, `EmptyState`, `timeAgo`, `MOD_KEY` |
| `packages/admin/src/shell.tsx` | Dashboard sidebar, `PageHead`, user menu, `openCommandPalette` |
| `packages/admin/src/editor-ui.tsx` | Editor bar (Puck `overrides.header`), screens, rail plugins, drawer search |
| `packages/admin/src/style-controls.tsx` | Style rows (set / inherited labels, scrub), box model, colour, length |
| `packages/admin/src/command.tsx` | ⌘K palette (`requestPublish`, `requestNewPage`, `requestNewItem` events) |
| `packages/admin/src/collection.tsx` | A collection's items (`?view=collection&c=…`): filters, search, thumbnails; items open in the page editor |
| `packages/admin/src/assistant.tsx` | « Assistant IA » view (MCP address, per-assistant steps, connected AIs, keys), Pages card |
| `packages/admin/src/connect.tsx` | OAuth consent screen of an AI assistant (`?view=connect&request=…`, full screen) |

## Loading stages (keep the admin light)

The admin loads in three stages: `app.tsx` (login: Firebase Auth only), `owner.tsx` (dashboard: Firestore via
`services.ts`), then `editor.tsx` / `settings-editors.tsx` (Puck, rich text, drag and drop) through `import()`.
A dashboard module never imports the editor (`canvas`, `panel`, `style-*`, `fields`, `editor-ui`), zod-based
checks (`publish-checks.ts`) or `agent.ts` statically; Cloud Functions and Storage are imported on first use
(`call`, `storageOf`). The login screen has a budget checked in CI:
`pnpm --filter @openflow/e2e weight <site>/out --budget`.

## Tokens, never raw values

- Colours only through tokens: `--of-bg`, `--of-surface`, `--of-surface-2/3`, `--of-canvas`, `--of-border`,
  `--of-border-strong`, `--of-text`, `--of-text-2`, `--of-text-3`, `--of-accent` (+ `-hover`, `-press`,
  `-soft`, `-soft-2`, `-text`), `--of-on-accent`, `--of-success|warning|danger` (+ `-soft`), `--of-inverse`.
  Dark values are defined twice (media query and `html[data-of-theme="dark"]`): change both.
- One accent (OpenFlow cobalt) for primary actions, selection and state. Never on inactive elements.
- Depth: borders for resting surfaces; shadows (`--of-shadow-md/lg`) only for floating layers (menus,
  dialogs, toasts, palette); `--of-shadow-sm` for the selected segment of a segmented control. No raw
  `rgb(0 0 0 / …)` shadow: it vanishes in dark mode.
- Radii through tokens only: `--of-radius-sm` (4 px, badges), `--of-radius` (6 px, controls),
  `--of-radius-md` (8 px, menus, toasts, small cards), `--of-radius-lg` (12 px, cards and dialogs); a child
  radius ≤ its parent's. `50%` and `999px` for dots and pills.
- Type: Inter (bundled), six sizes only, as tokens: `--of-text-xs` 12, `--of-text-sm` 13 (panels),
  `--of-text-md` 14 (dashboard content), `--of-text-lg` 16 (dialog and card titles), `--of-text-xl` 20
  (view titles), `--of-text-2xl` 28 (figures). Weights 400, 500, 600. Hierarchy by weight and colour, not
  size. No inline `fontSize`: `.of-small` (13) and `.of-tiny` (12). `font-variant-numeric: tabular-nums`
  for numbers. Sentence case, no uppercase tracked labels.
- Spacing on the 4 px grid (4, 8, 12, 16, 20, 24, 32…; 1–2 px only for hairline nudges); controls 32 px
  (28 px in the style panel, 40 px on touch). Every view header (`PageHead`) is 60 px high.
- Icons take their colour from `--of-icon-color` set on the container (no `.x .of-icon { color }` rules).

## Components and patterns

- Use `Button` (`variant` primary | secondary | ghost | danger | danger-ghost, `size` sm | lg, `icon`, `busy`)
  and `IconButton` (always a `label`: it is the accessible name and the tooltip). Never `div onClick`.
- Destructive actions: in a `Menu`, `danger: true`, then a confirmation (`useConfirm()` from
  `confirm.tsx`, never `window.confirm`) or an undo (`notify(kind, text, { action: { label: "Annuler",
  run } })`).
- Row actions: one visible primary action (« Modifier ») plus a « ⋯ » `Menu` for the rest.
- Status: one `StatusChip` per item (dot + text; colour never alone).
- Every empty state (`EmptyState`) says what to do next and offers the action.
- Loading labels end with « … »: `<Spinner>` for a whole screen, `<Spinner inline>` inside a card.
- Async results go through `notify(kind, text, options?)`: toasts are `aria-live`, pause while hovered or
  focused, can carry one action (`action: { label, run }`) and stay until closed when `sticky`. In the
  editor they sit bottom left, away from the right panel.
- Dashboard views start with `<PageHead title actions>`; editors get their bar from `EditorBar` through
  `EditorChromeContext` (`kind: "page" | "settings"`).
- Puck: theme it with its tokens first (`--puck-color-*`, `--puck-field-*`, `--puck-drawer-item-*`); layout
  tweaks only as `.of-root .of-editor [class*="_PuckLayout-…_"]` (Puck is pinned, class prefixes are stable).
  Overrides and plugins are module constants (a new identity remounts the canvas).
- AI entry points (sidebar « Assistant IA » with a green dot, Pages card, editor ✦ button, ⌘K entry) all lead
  to the same view. New button names must not contain « Assistant IA » or « Modifier » (substring
  selectors in the e2e tests), nor repeat a sidebar label outside the sidebar.
- A new place of the dashboard is one entry of `navEntries()` (`nav.ts`): label, icon, group, route,
  keywords. The sidebar, the phone's tab bar and the ⌘K palette all read it.
- Site-wide look settings (a palette in `config.settings`) are listed in `settings.appearance`: they show
  in « Couleurs et polices », not in « Menu et pied de page ».
- Charts follow the `dataviz` method: one series in `--of-accent` (validated ≥ 3:1 on both surfaces),
  columns ≤ 24 px with a 4 px rounded data end and 2 px between them, hairline grid, text in text tokens,
  a tooltip on hover and keyboard (the plot is a `role="slider"` over the columns), and a table view.
  Ranked lists (`.of-rank`) use the same hue for every bar; figures are `.of-stat` tiles.
- Right panel: one column, no tabs. The clicked element's content first (only its fields), then « Style »
  closed by default with a summary in its header (« Mobile · 2 réglages »), then the section's other fields.
  Open/closed states the owner chooses are remembered in `localStorage` (inside `try`/`catch`).

## Navigation and information architecture

- The sidebar holds 5 to 7 destinations per group, grouped by task (« Contenu », « Activité », « Réglages »),
  labels of 1 to 3 words, always visible (no sub-menu that appears only once inside). One source for the
  sidebar and the ⌘K palette (`nav.ts`): same words everywhere.
- Trunk test on every screen: the owner can tell which site, which view (the `PageHead` title matches the
  sidebar label and `document.title`), where they are (`aria-current`), where search is (⌘K).
- One thing, one place, one name. If a thing shows in two places (a collection's list page, the legal pages),
  the second place says so and links to the first. The glossary below is the vocabulary.
- The URL holds the view and its tab (`?view=…&tab=…`); Back returns to the previous view.
- Home is « Tableau de bord »: what is live, what to do next (a checklist that can be dismissed), today's
  activity. Never « Accueil » (a page name).

## Editing (progressive disclosure)

- Edit where you click: the canvas element, its fields on the right, its actions next to it (list items:
  add after, duplicate, move, delete). No action only reachable in a collapsed block.
- At most 4 visible choices at a decision point; advanced settings behind « Plus de réglages ». Presets
  (Petit / Moyen / Grand, Serré / Normal / Aéré) before raw values; units only in the advanced mode.
- Modal for 1 to 3 fields, the right panel to edit while keeping the page in view, a full view for complex
  objects. Try inline first.
- The canvas stays readable: panels close after use, the desktop screen fills the room it has (≥ 1024 px),
  labels drawn over the canvas never shrink with it nor hide the text they label.
- Every destructive action can be undone (toast « … · Annuler ») or is confirmed in a `Dialog` (never
  `window.confirm`). Drag and drop always has a click alternative (WCAG 2.5.7).
- Saving: the canvas editors save on their own (« Enregistré »); forms have « Enregistrer », a sticky
  « Modifications non enregistrées » bar and a warning before leaving. Never lose typed text silently.
- Draft or live is always visible: the page's status in the editor bar, and the publish dialog says what goes
  online and what stays hidden.

## Motion and accessibility

- Animate only `transform` and `opacity`, ≤ 200 ms, ease-out (`--of-ease`); nothing for keyboard-triggered,
  frequent actions (the palette). No `transition` on colours, borders or shadows (hover states switch
  at once, and a theme change never flashes). `prefers-reduced-motion` is honoured globally.
- `:focus-visible` rings stay; menus and the palette work with arrows, Enter, Escape, and give focus back.
- Text contrast AA in light and dark (check both); inputs keep a visible border.
- French copy, specific labels (« Créer une clé », not « Valider »), errors say how to fix.

## Glossary (owner-facing words)

| Say | Not |
|---|---|
| page, section, élément | composant, bloc, node |
| publier / mettre en ligne (le bouton dit « Publier ») | déployer, release, snapshot, build |
| brouillon, en ligne, masquée | draft, live, unpublished |
| Tous les écrans / Tablette / Mobile | base, breakpoint, desktop |
| adresse (de la page) | slug, URL, path |
| Menu et pied de page | contenu commun, layout, settings |
| Couleurs et polices | thème, tokens |
| Assistant IA (l'IA du propriétaire), IA des visiteurs, moteurs IA | MCP, OAuth, agent, WebMCP (sauf « Pour les développeurs ») |
| code de validation | balise meta |
| comme sur ordinateur / par défaut | hérité |

## Auditing (before and after every visible change)

1. Captures and measures: `CMS_AUDIT_TAG=<tag> pnpm --filter @openflow/e2e ux-audit` (every view, dialog and
   editor state at 1440, 1366, 1280 and 390 px, light and dark; `metrics.json`: canvas scale, type sizes,
   off-grid spacing, targets < 24 px, header height, axe serious/critical violations, console errors), then
   `node tests/e2e/audit-compare.mjs <before> <after>`.
2. Look at the captures as a first-time owner (« Jordan »): squint test (hierarchy still reads), one focal
   point and one primary action per view, trunk test, at most 4 competing choices.
3. Score Nielsen's 10 heuristics 0 to 4 (total /40) and list findings as `[P0|P1|P2|P3] Where / Why it hurts
   the owner / Fix / Ref`. P0 blocks or confuses, P1 major friction, P2 polish, P3 nit.
4. Walk the owner tasks and count clicks: change a title, replace an image, add a FAQ question, add a section
   after another, change the menu, change the main colour, change a colour on mobile only, write a page
   description, publish.

Targets: canvas scale ≥ 0.85 at 1280 px, at most 6 type sizes, no target under 24 px, one header height, no
serious axe violation, trunk test passed on every view.

## Keep tests and docs in sync

- E2E tests select by accessible names: sidebar entries through `nav(name)` (scoped to the
  « Navigation » landmark): « Pages », « Médias », « Couleurs et polices », « Menu et pied de page »,
  « Site et référencement », « Langues », « Établissement », « Informations légales », « Assistant IA »
  (exact); the mobile tab bar is the landmark « Onglets », « Connecter Claude ou ChatGPT », « Clé d'accès »,
  « Autoriser », « Refuser », « Déconnecter », « Messages » (sidebar, prefix: the unread count follows),
  lists « Messages reçus » / « Messages indésirables », dialog « Message de … », « Répondre »,
  « Identifiant Google Analytics », « Historique », « Modifier », « Retour aux pages », « Publier… »,
  collections (template): sidebar « Actualités » (exact), list « Actualités », « Nouvel article », dialog
  labels « Titre » (exact) / « Adresse » / « Date de publication », « Créer et modifier »,
  « Retour à « Actualités » », business profile: « Établissement », checkbox « Lundi », « Lundi,
  ouverture », « Ajouter une fermeture », list « Fermetures exceptionnelles », « Du » (exact),
  « Enregistrer la fiche », statistics: « Statistiques » (sidebar, exact), lists « Sources des visites » /
  « Pages où arrivent les assistants IA » / « Vitesse ressentie », slider « Visites par jour », class `.of-stat`,
  legal: « Informations légales » (sidebar), « Éditeur du site », labels « Nom ou raison sociale » /
  « Immatriculation » / « Directeur de la publication », « Enregistrer » (exact), classes `.of-legal-pages`
  and `.of-facts`, languages: checkbox « English », combobox « Langue », buttons « Traduire en anglais : … » /
  « Version en anglais : … », « Titre de la page », « Enregistrer la traduction », classes `.of-translate`
  and `.of-editor.is-translating` (Puck renders the panel twice: select the `:visible` one),
  « Mettre en ligne », « Enregistré », « Rendez-vous », « Annuler le rendez-vous », button « Style »
  (`aria-expanded`), « Tous les champs de la
  section », screens « Ordinateur » / « Mobile » (editor bar) and « Tous les écrans » / « Mobile » (style
  panel), « Fermer », rail button « Ajouter » (the library is closed when the editor opens: open it
  before using `.of-drawer-item`), and the classes `.of-drawer-item`,
  `.of-selected`, `.of-panel`, `.of-style__crumbs`, `.of-media-grid__item`, `.of-key-created`. Renaming one
  means updating `tests/e2e/*.test.ts` and `sites/landing/visuals/admin.mjs`.
- Check a change with screenshots in light and dark (emulators + Playwright, 1440×900 and 390×844), then
  `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @openflow/e2e test` (template and
  `CMS_E2E_SITE=$PWD/sites/landing`).
- Owner-facing behaviour changes go in `docs/interface-admin.md`.
