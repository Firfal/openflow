---
name: admin-ui
description: Design system and UI rules of the OpenFlow admin (packages/admin). Use before changing any admin screen, component, style or copy — dashboard, editor bar, rail panels, style panel, dialogs, menus — so new work matches the Webflow/Framer-inspired interface, stays accessible in light and dark, and keeps the e2e selectors stable.
---

# OpenFlow admin UI

The admin is used by non-technical site owners. It borrows the layout of Webflow and Framer (one top bar,
left rail, right panel, canvas in the middle) and leaves out what would overwhelm them (classes, many
breakpoints, absolute positioning, interactions, custom code). Rules below distil the Vercel Web Interface
Guidelines, interface-design, impeccable and Emil Kowalski's motion rules. Full description for owners and
contributors: `docs/interface-admin.md`.

## Where things live

| File | Role |
|---|---|
| `packages/admin/src/styles.css` | Tokens (`--of-*`, light + dark), Puck re-theming, every admin style |
| `packages/admin/src/icons.tsx` | `<Icon name>`: inlined Lucide paths (ISC). Add icons here, never a dependency |
| `packages/admin/src/ui.tsx` | `Button`, `IconButton`, `Menu`, `Dialog`, `FormField`, `StatusChip`, `EmptyState`, `timeAgo`, `MOD_KEY` |
| `packages/admin/src/shell.tsx` | Dashboard sidebar, `PageHead`, user menu, `openCommandPalette` |
| `packages/admin/src/editor-ui.tsx` | Editor bar (Puck `overrides.header`), screens, rail plugins, drawer search |
| `packages/admin/src/style-controls.tsx` | Style rows (set / inherited labels, scrub), box model, colour, length |
| `packages/admin/src/command.tsx` | ⌘K palette (`requestPublish`, `requestNewPage` events) |

## Tokens, never raw values

- Colours only through tokens: `--of-bg`, `--of-surface`, `--of-surface-2/3`, `--of-canvas`, `--of-border`,
  `--of-border-strong`, `--of-text`, `--of-text-2`, `--of-text-3`, `--of-accent` (+ `-hover`, `-press`,
  `-soft`, `-soft-2`, `-text`), `--of-on-accent`, `--of-success|warning|danger` (+ `-soft`), `--of-inverse`.
  Dark values are defined twice (media query and `html[data-of-theme="dark"]`): change both.
- One accent (OpenFlow cobalt) for primary actions, selection and state. Never on inactive elements.
- Depth: borders for resting surfaces; shadows (`--of-shadow-md/lg`) only for floating layers (menus,
  dialogs, toasts, palette).
- Radii: 6 px controls, 8 px menus and small cards, 12 px cards and dialogs (a child radius ≤ its parent's).
- Type: Inter (bundled), 13 px in panels, 14 px in dashboard content; hierarchy by weight and colour, not size.
  `font-variant-numeric: tabular-nums` for numbers. Sentence case, no uppercase tracked labels.
- Spacing on a 4/8 px grid; controls 32 px (28 px in the style panel, 40 px on touch).
- Icons take their colour from `--of-icon-color` set on the container (no `.x .of-icon { color }` rules).

## Components and patterns

- Use `Button` (`variant` primary | secondary | ghost | danger | danger-ghost, `size` sm | lg, `icon`, `busy`)
  and `IconButton` (always a `label`: it is the accessible name and the tooltip). Never `div onClick`.
- Destructive actions: in a `Menu`, `danger: true`, then a `Dialog` to confirm (or undo in Puck).
- Row actions: one visible primary action (« Modifier ») plus a « ⋯ » `Menu` for the rest.
- Status: one `StatusChip` per item (dot + text; colour never alone).
- Every empty state (`EmptyState`) says what to do next and offers the action.
- Loading labels end with « … »; async results go through `notify` (toasts are `aria-live`).
- Dashboard views start with `<PageHead title actions>`; editors get their bar from `EditorBar` through
  `EditorChromeContext` (`kind: "page" | "settings"`).
- Puck: theme it with its tokens first (`--puck-color-*`, `--puck-field-*`, `--puck-drawer-item-*`); layout
  tweaks only as `.of-root .of-editor [class*="_PuckLayout-…_"]` (Puck is pinned, class prefixes are stable).
  Overrides and plugins are module constants (a new identity remounts the canvas).

## Motion and accessibility

- Animate only `transform` and `opacity`, ≤ 200 ms, ease-out (`--of-ease`); nothing for keyboard-triggered,
  frequent actions (the palette). `prefers-reduced-motion` is honoured globally.
- `:focus-visible` rings stay; menus and the palette work with arrows, Enter, Escape, and give focus back.
- Text contrast AA in light and dark (check both); inputs keep a visible border.
- French copy, specific labels (« Créer une clé », not « Valider »), errors say how to fix.

## Keep tests and docs in sync

- E2E tests select by accessible names: « Pages », « Médias », « Réglages », « Thème », « Site et
  référencement », « Assistant IA », « Historique », « Modifier », « Retour aux pages », « Publier… »,
  « Mettre en ligne », « Enregistré », tab « Style », screens « Ordinateur » / « Mobile », « Fermer », and the
  classes `.of-drawer-item`, `.of-selected`, `.of-panel`, `.of-style__crumbs`, `.of-media-grid__item`,
  `.of-key-created`. Renaming one means updating `tests/e2e/*.test.ts` and `sites/landing/visuals/admin.mjs`.
- Check a change with screenshots in light and dark (emulators + Playwright, 1440×900 and 390×844), then
  `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @openflow/e2e test` (template and
  `OPENFLOW_E2E_SITE=$PWD/sites/landing`).
- Owner-facing behaviour changes go in `docs/interface-admin.md`.
