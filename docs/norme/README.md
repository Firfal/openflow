# Norme OpenFlow (OFS)

La norme OpenFlow garantit qu'un site créé par un agent IA (ou un développeur) reste **entièrement
modifiable par son propriétaire**, sûr et publiable en statique sur Firebase Hosting.

Elle est vérifiée par `openflow check` à trois niveaux :

| Niveau | Quand | Ce qui est vérifié |
|---|---|---|
| `fast` | À chaque fichier modifié (hook PostToolUse) | Analyse statique : textes, images et liens en dur, API interdites, secrets, config Firebase |
| `render` | En fin de tâche (hook Stop) | Chaque section est affichée avec des **sentinelles** : champs morts, textes cachés en dur, édition sur la page, robustesse aux valeurs limites ; config et contenu de départ |
| `build` | Avant livraison (`openflow deploy`) | `next build` en export statique, puis contrôle du HTML (alt, h1, titre, liens, langue) |

Les retours sont formatés pour un agent : fichier, ligne, règle, puis correctif. Avec Claude Code, les
hooks renvoient automatiquement les erreurs à l'agent, qui les corrige avant de rendre la main.

## Règles

| Règle | Titre | Gravité | Niveau | Statut |
|---|---|---|---|---|
| [OF-101](OF-101.md) | Texte visible écrit en dur dans une section | erreur | fast | appliquée |
| [OF-102](OF-102.md) | Image écrite en dur au lieu d'un champ image | erreur | fast | appliquée |
| [OF-103](OF-103.md) | Lien écrit en dur au lieu d'un champ lien | erreur | fast | appliquée |
| [OF-104](OF-104.md) | Champ déclaré mais jamais affiché | erreur | render | appliquée |
| [OF-105](OF-105.md) | Champ sans valeur par défaut | erreur | render | appliquée |
| [OF-106](OF-106.md) | Texte affiché mais non éditable directement sur la page | avertissement | render | appliquée |
| [OF-107](OF-107.md) | Section qui plante avec des valeurs limites | erreur | render | appliquée |
| [OF-108](OF-108.md) | Champ `contentEditable` utilisé dans un attribut ou une chaîne | erreur | render | appliquée |
| [OF-109](OF-109.md) | Champ éditable invisible dans l'éditeur | avertissement | render | appliquée |
| [OF-201](OF-201.md) | Contenu non conforme au schéma | erreur | render | appliquée |
| [OF-202](OF-202.md) | Section ou champ renommé alors qu'il est utilisé en production | erreur | render | prévue |
| [OF-203](OF-203.md) | Configuration OpenFlow invalide | erreur | render | appliquée |
| [OF-301](OF-301.md) | API incompatible avec l'export statique | erreur | fast | appliquée |
| [OF-302](OF-302.md) | Lecture de Firebase depuis le rendu public | erreur | fast | appliquée |
| [OF-303](OF-303.md) | Configuration Firebase OpenFlow modifiée ou incomplète | erreur | fast | appliquée |
| [OF-304](OF-304.md) | Secret écrit dans le code | erreur | fast | appliquée |
| [OF-401](OF-401.md) | Image sans attribut alt | erreur | build | appliquée |
| [OF-402](OF-402.md) | Hiérarchie de titres incorrecte | avertissement | build | appliquée |
| [OF-403](OF-403.md) | Titre ou description de page manquant | erreur | build | appliquée |
| [OF-404](OF-404.md) | Lien interne cassé | erreur | build | appliquée |
| [OF-405](OF-405.md) | Langue de la page non déclarée | erreur | build | appliquée |

## Format des retours

```text
OpenFlow check : 1 erreur(s), 0 avertissement(s) — norme OFS
✖ OF-101 openflow/components/Hero.tsx:14 — Texte en dur « Bienvenue ».
  → Créez un champ (…) puis affichez `{nomDuChamp}` à la place du texte. (doc : node_modules/@openflow/core/docs/rules/OF-101.md)
```

Formats disponibles : `--format agent` (défaut), `--format json`, `--format sarif` (GitHub code scanning).
