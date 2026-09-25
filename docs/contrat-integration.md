# Contrat d'intégration et kit Claude Code

## Comment Claude Code crée un site OpenFlow

1. L'agence installe le plugin :
   ```
   /plugin marketplace add Firfal/openflow
   /plugin install openflow@openflow
   ```
2. Elle demande : « Crée le site de la boulangerie Dupont avec OpenFlow ».
3. Le skill `openflow-new-site` guide Claude :
   - `npx openflow create` copie le template : infrastructure, sécurité, admin, `AGENTS.md`, hooks ;
   - Claude conçoit les sections (`openflow/components/`) et le contenu de départ (`openflow/seed/`) ;
   - `openflow check --level build`, puis `openflow dev` pour prévisualiser le site et l'admin.
4. La livraison suit le skill `openflow-deploy` (déclenché par `/openflow:openflow-deploy`).

## Les quatre mécanismes qui font respecter le contrat

| Mécanisme | Où | Rôle |
|---|---|---|
| **Template** (`openflow create`) | `templates/next-starter` | Les parties invariantes (Firebase, règles, admin, rendu) ne sont jamais générées par l'IA |
| **Bloc `AGENTS.md`** (+ `CLAUDE.md` = `@AGENTS.md`) | Racine du site | Contrat toujours chargé, lié à la documentation installée avec le SDK (`node_modules/@openflow/core/docs`) |
| **Skills** | `plugins/openflow/skills` | Workflows de création et de livraison ; format Agent Skills portable |
| **Norme OFS et hooks** | `@openflow/check`, `.claude/settings.json`, `plugins/openflow/hooks` | Retour automatique à l'agent, qui se corrige seul |

## Boucle de retour

```
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

- Les hooks sont déclarés **dans le template** (`.claude/settings.json`) et **dans le plugin**. Le plugin se
  tait quand le projet les déclare déjà, pour ne pas envoyer deux fois le même retour.
- Hors d'un site OpenFlow, les hooks du plugin ne font rien.

## Le contrat

Voir [`packages/core/docs/contrat.md`](../packages/core/docs/contrat.md) (installé avec le SDK) et la
[norme OFS](norme/README.md).
