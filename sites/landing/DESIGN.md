# Landing OpenFlow : plan de design

Méthode : skill `frontend-design` d'Anthropic (plan, relecture critique, construction, critique sur
captures d'écran), checklist qualité de *UI/UX Pro Max*, règles d'animation du skill `animate`
(Emil Kowalski) et audit final avec les *Web Interface Guidelines* de Vercel.

## Sujet, public, rôle de la page

- **Sujet** : OpenFlow, un CMS visuel open-source pour les sites Next.js créés avec Claude Code, sur Firebase.
- **Public** : agences, freelances et développeurs qui livrent des sites à des clients non techniques.
- **Rôle** : faire comprendre la boucle *Claude Code construit, le client modifie, OpenFlow publie*, puis
  envoyer vers GitHub.

## Direction : « l'atelier d'édition »

Le vocabulaire visuel vient du produit lui-même : **le contour de sélection d'un éditeur visuel**, avec
ses poignées carrées et l'étiquette du champ sélectionné. C'est la signature unique de la page. Tout le
reste reste sobre.

### Couleurs

| Nom | Hex | Rôle |
|---|---|---|
| Encre | `#0F1E33` | Chrome de l'éditeur (hero, terminal), texte principal |
| Encre claire | `#1A2D4A` | Surfaces sur fond encre |
| Calque | `#EEF1F6` | Fond de page (papier calque, grille de points) |
| Cobalt | `#2F5BFF` | Sélection, focus, liens : ce qui est *éditable* |
| Flamme | `#FF7A1A` | Publication et état « en ligne » uniquement (clin d'œil à Firebase) |
| Graphite | `#4A5568` | Texte secondaire |

Deux accents, chacun avec un sens : le cobalt pour l'édition, la flamme pour la mise en ligne.

### Typographie

- **Bricolage Grotesque** (variable) pour les titres : une grotesque expressive, avec un réglage de largeur, dont l'espacement est resserré.
- **IBM Plex Sans** pour le texte courant : 17 px, interligne 1,6, lignes de moins de 72 caractères.
- **JetBrains Mono** uniquement pour le code et le terminal.

### Mise en page

Grille éditoriale alignée à gauche (1280 px maximum). Le hero est en deux colonnes, la démo de l'éditeur
légèrement plus large que le texte. Les sections alternent le calque et l'encre seulement quand le contenu
est un outil : le terminal et le code sont sur l'encre.

```
[◆ OpenFlow]      Fonctionnement  Norme  Firebase  Démarrer      [GitHub]
┌─────────────────────────── hero (encre) ─────────────────────────────┐
│ Titre (Bricolage 64–80)        ┌─ fenêtre admin animée ───────────────┐
│ Sous-titre                     │ url   Pages Réglages  [Enregistré][Publier]
│ [GitHub] [Documentation]       │ ┌ page ────────────┐ ┌ champs ───┐ │
│ $ npx openflow create mon-site │ │ ┌┄┄sélection┄┄┐  │ │ Titre …   │ │
│                                │ │   texte ▌       │ │           │ │
└────────────────────────────────└─────────────────────────────────────┘
 1 ─────────── 2 ─────────── 3        (vraie séquence : numérotation justifiée)
 [Capture réelle de l'admin, grande] + 3 repères + 3 vignettes
 Norme OFS : texte | terminal (encre)
 Firebase : titre | liste des services, puis schéma pleine largeur
 Comparatif : la colonne OpenFlow porte le contour de sélection
 Démarrer : bloc de code copiable
 FAQ, puis « Cette page est éditée avec OpenFlow »
```

### Principes

1. **Montrer, pas affirmer** : chaque section montre l'interface réelle ou du vrai code.
2. **Une seule chorégraphie** : dans le hero, la démo clique, réécrit le titre, enregistre puis publie.
   Ailleurs, seulement des micro-interactions en réponse à l'utilisateur (copier, survol, ouverture de FAQ).
   La boucle dure 12 s : un bouton permet de la mettre en pause (WCAG 2.2.2).
3. **La page se prouve elle-même** : 100 % de son contenu est éditable dans l'admin OpenFlow (norme OFS).
4. **Qualité de base** : responsive dès 375 px, focus visible, `prefers-reduced-motion` respecté (état
   final statique), contraste AA, pas d'emoji comme icône.

## Relecture du plan (avant construction)

- *Hero sombre avec un seul accent vif* : c'est le cliché n° 2 du skill. **Changé** : deux accents avec une
  sémantique (édition et publication), le hero sombre représente le chrome de l'éditeur, et le reste de la page est clair.
- *Surtitres en capitales au-dessus de chaque titre* : **supprimés**. Les titres se suffisent à eux-mêmes.
- *Grille de cartes identiques pour les fonctionnalités* : **remplacée** par une capture réelle, des repères et
  des vignettes de tailles différentes.
- *Flèche « → » dans les boutons et chaînes « A · B · C »* : **bannies**.
- *Apparitions en fondu à chaque section* : **bannies**. Il n'y a qu'un moment animé.

## Visuels

Aucune maquette dessinée à la main : les visuels sont produits à partir de sources versionnées.

- `visuals/architecture.html` et `visuals/og.html` : schéma Firebase et carte de partage, rendus avec les
  polices du site par `pnpm visuals` (Playwright, puis WebP ou PNG avec sharp).
- `visuals/admin.mjs` (`pnpm visuals:admin`) : lance l'admin OpenFlow sur les émulateurs Firebase, se
  connecte en propriétaire, édite cette page, publie avec le builder local, puis capture l'éditeur, la
  confirmation de publication, les paramètres de page et les réglages communs. Le script sert aussi de
  test de bout en bout du produit sur la landing.

## Critique sur captures (après construction)

- Contours de sélection groupés dans un coin et boutons sans marge : les classes maison n'étaient pas dans
  une couche CSS et écrasaient les utilitaires Tailwind. Elles sont passées dans `@layer components`.
- Démo du hero coupée à droite (le bouton Publier était masqué) : le débordement est supprimé.
- Titre du hero sur six lignes : les axes de largeur et de taille optique de Bricolage sont chargés, le titre est resserré.
- Défilement horizontal sur mobile (484 px pour un écran de 390 px) : `min-w-0` sur les enfants de grille.
- Schéma d'architecture illisible à 60 % de sa taille : il passe en pleine largeur, et défile dans son cadre sur mobile.
