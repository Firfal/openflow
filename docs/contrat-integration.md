# Contrat d'intégration et kit pour les outils IA

## Comment votre IA crée un site OpenFlow

1. L'agence installe le plugin OpenFlow dans son outil IA (voir [Démarrer avec votre IA](../README.md#démarrer-avec-votre-ia)).
   Dans Claude Code :
   ```
   /plugin marketplace add Firfal/openflow
   /plugin install openflow@openflow
   ```
   Ouvert dans le dépôt OpenFlow ou dans un site, Claude Code propose lui-même le plugin
   (`extraKnownMarketplaces` et `enabledPlugins` de `.claude/settings.json`).
2. Elle demande, depuis n'importe quel dossier : « Crée le site de la boulangerie Dupont avec OpenFlow ».
3. Le skill `openflow-new-site` guide l'IA :
   - le script `scripts/openflow-init.sh` du skill prépare tout ce qui manque, et seulement cela : il vérifie
     git et Node.js 22, réutilise le dépôt OpenFlow du dossier courant ou le clone dans `./openflow` (ou la copie
     privée de l'agence, `--repo`), installe et compile les paquets (pnpm n'est pas obligatoire), puis crée
     `sites/<nom>` à partir du template : infrastructure, sécurité, admin, `AGENTS.md`, hooks ;
   - l'IA conçoit les sections (`openflow/components/`) et le contenu de départ (`openflow/seed/`), en suivant
     le skill `openflow-design` (plan de design, réflexes génériques à éviter, accessibilité, captures) ;
   - `openflow check --level build`, puis `openflow dev` pour prévisualiser le site et l'admin.
4. La livraison suit le skill `openflow-deploy` (déclenché par `/openflow:openflow-deploy`).

## Les mécanismes qui font respecter le contrat

| Mécanisme | Où | Rôle |
|---|---|---|
| **Template** (`openflow create`) | `templates/next-starter` | Les parties invariantes (Firebase, règles, admin, rendu) ne sont jamais générées par l'IA |
| **Bloc `AGENTS.md`** (+ `CLAUDE.md` = `@AGENTS.md`) | Racine du site, racine du dépôt | Contrat toujours chargé, lu par Claude Code, Codex, Cursor, Copilot et Gemini CLI, lié à la documentation installée avec le SDK (`node_modules/@openflow/core/docs`) |
| **Skills** | `plugins/openflow/skills` | Installation, création, design et livraison ; format Agent Skills, lu par tous ces outils |
| **Norme OFS et hooks** | `@openflow/check`, `.claude/settings.json`, `plugins/openflow/hooks` | Retour automatique à l'agent, qui se corrige seul ; sans hooks, l'agent lance `openflow check` lui-même |

## Boucle de retour

```
Session ouverte
   └─ hook SessionStart → dans un dépôt ou un site OpenFlow : ce qu'il manque pour que les contrôles
      tournent (paquets à installer ou à compiler, site à relier), sinon rien
Claude écrit un fichier
   └─ hook PostToolUse → openflow hook post-tool-use (niveau fast, < 1 s)
        ├─ erreur → code 2 : le message OF-xxx est renvoyé à Claude, qui corrige
        └─ avertissement → contexte ajouté pour Claude
Claude veut terminer
   └─ hook Stop → openflow hook stop (niveaux fast + render)
        ├─ erreur → {"decision":"block"} : Claude continue (3 tentatives au maximum par session)
        └─ conforme → .openflow/report.md (score d'éditabilité)
Livraison
   └─ openflow deploy → niveau build ; refus en cas d'erreur (sauf --force)
```

- Les hooks sont déclarés **dans le template** (`.claude/settings.json`) et **dans le plugin**. Sous Claude
  Code, le plugin se tait quand le projet les déclare déjà, pour ne pas envoyer deux fois le même retour.
- Les mêmes hooks servent à Codex (qui modifie par correctifs `apply_patch` : chaque fichier du correctif est
  vérifié) et à GitHub Copilot CLI. Cursor a les siens (`hooks/cursor-hooks.json`, générés) : même script,
  réponses au format Cursor (`additional_context`, `followup_message`). Gemini CLI et les autres outils
  reçoivent les skills seuls : l'IA lance `openflow check` elle-même.
- Le plugin trouve les sites du dossier ouvert, d'un sous-dossier, ou du dossier `sites/` d'un dépôt OpenFlow
  cloné dedans (`openflow/sites/<site>`).
- Hors d'un dépôt ou d'un site OpenFlow, les hooks du plugin ne font rien.

## Le plugin, une seule source

Le manifeste Claude Code (`plugins/openflow/.claude-plugin/plugin.json`) et les skills sont la source unique.
`pnpm gen:docs` écrit les manifestes des autres outils, et `pnpm check:docs` (en CI) vérifie qu'ils sont à jour,
que chaque skill respecte le format Agent Skills et que les scripts des hooks sont exécutables. La CI lance aussi
le validateur officiel (`claude plugin validate --strict`) et crée un site avec le script d'installation.
Pour publier une nouvelle version : augmenter `version` dans ce manifeste, puis `pnpm gen:docs`.

## Le contrat

Voir [`packages/core/docs/contrat.md`](../packages/core/docs/contrat.md) (installé avec le SDK) et la
[norme OFS](norme/README.md).
