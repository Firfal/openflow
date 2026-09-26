# Interface de l'admin

L'admin (`/admin`) s'adresse au propriétaire du site, qui n'est ni designer ni développeur. Elle reprend
l'organisation des éditeurs de référence, Webflow et Framer : une barre en haut, des panneaux à gauche, les
réglages à droite et la page au centre. Elle en retire ce qui dérouterait un non-spécialiste : classes CSS,
sept points de rupture, positionnement libre, interactions et code personnalisé.

Les règles visuelles viennent de skills de design reconnus pour les agents de code :
- [web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (Vercel) ;
- [interface-design](https://github.com/Dammyjay93/interface-design) ;
- [impeccable](https://github.com/pbakaus/impeccable) ;
- [les règles d'animation d'Emil Kowalski](https://github.com/emilkowalski/skills).

Elles sont résumées dans le skill du dépôt `.claude/skills/admin-ui/SKILL.md`.

## Tableau de bord

- **Barre latérale** :
  - le site et son adresse ;
  - **Rechercher** (<kbd>⌘</kbd> <kbd>K</kbd>) ;
  - **Pages**, **Médias**, **Réglages**, qui se déplie en quatre sous-pages : Contenu commun, Thème, Site et
    référencement, Assistant IA ;
  - **Historique** ;
  - en bas, le compte : apparence de l'admin (système, clair, sombre) et déconnexion.

  Sur mobile, elle devient une barre d'icônes.
- **En-tête de chaque vue** : le titre, les actions de la vue, « Voir le site » et **Publier**. Le bouton
  Publier affiche le nombre de modifications en attente.
- **Pages** :
  - un bandeau dit si le site en ligne est à jour ;
  - chaque page affiche **un seul statut** : Masquée, Jamais publiée, Modifications non publiées ou En ligne ;
  - le bouton « Modifier » ouvre l'éditeur ;
  - le menu « ⋯ » propose Paramètres et référencement, Dupliquer, Voir en ligne et Supprimer ;
  - les paramètres d'une page montrent un **aperçu du résultat Google** et le nombre de caractères du titre et
    de la description.
- **Médias** : toute la médiathèque. On peut l'importer (plusieurs fichiers à la fois), la filtrer (fichiers
  importés ou fichiers du site) et chercher par nom. Chaque fichier a une fiche : dimensions, poids, origine et
  adresse à copier.
- **Historique** : la frise des publications. Une version remplacée se remet en ligne d'un clic.
- **Recherche rapide** (<kbd>⌘</kbd> <kbd>K</kbd> ou <kbd>Ctrl</kbd> <kbd>K</kbd>, comme Quick Find dans Webflow
  et la palette de commandes de Framer) : ouvrir une page ou un réglage, créer une page, publier, voir le
  site, changer d'apparence.

## Éditeur de page

L'éditeur occupe tout l'écran et n'a qu'**une seule barre** :

| Zone | Contenu |
|---|---|
| Gauche | Retour aux pages, sélecteur de page (ouvre une autre page sans repasser par la liste) |
| Centre | Écrans **Ordinateur** (1280 px), **Tablette** (768 px), **Mobile** (390 px) |
| Droite | État de l'enregistrement, annuler et rétablir, recherche, **Publier** |

- **Rail de gauche**, dont chaque icône ouvre un panneau :
  - **Ajouter** : les sections du site, avec une recherche. Un clic ajoute une section sous la section
    sélectionnée ; on peut aussi la glisser sur la page.
  - **Structure** : l'ordre des sections, par glisser-déposer.
  - **Pages** : les pages du site.
  - **Aide** : le mode d'emploi et les raccourcis clavier.
- **Page au centre** :
  - un texte cliqué est entouré, et son nom s'affiche au-dessus, comme dans Webflow ;
  - le texte s'écrit directement sur la page ;
  - une image ou une vidéo se remplace d'un clic ;
  - la barre de la section propose monter, descendre, dupliquer et supprimer.
- **Panneau de droite** : il indique quoi faire tant que rien n'est sélectionné. Il a deux onglets :
  - **Contenu** : l'élément cliqué en premier, puis tous les champs de la section.
  - **Style** : le style libre de la section ou de l'élément, sur l'écran affiché.

### Onglet Style

- Les réglages sont rangés en groupes repliables : Typographie, Couleurs, Espacements, Dimensions, Bordure et
  effets, Visibilité. Un point bleu marque les groupes qui ont des réglages sur l'écran affiché.
- La couleur d'un libellé indique d'où vient sa valeur, comme dans Webflow (sans le rose) :
  - **bleu** : la valeur est réglée sur cet écran, et la flèche circulaire la réinitialise ;
  - **orange** : la valeur est reprise d'un écran plus grand ; l'infobulle dit lequel.
- Les **espacements** se règlent sur un schéma de la boîte : l'espace autour de l'élément, puis ses marges
  intérieures. Chaque côté accepte `24` (pixels), `2rem` ou `0`. Les flèches <kbd>↑</kbd> <kbd>↓</kbd>
  ajustent la valeur, et <kbd>⇧</kbd> la change par pas de 10.
- On peut aussi faire **glisser horizontalement un libellé** (taille, interligne, lettres, dimensions) pour
  changer sa valeur, comme dans Webflow et Framer. <kbd>⇧</kbd> multiplie le pas par 10.

## Publication

La fenêtre de publication :
- liste ce qui a changé depuis la dernière mise en ligne (pages et réglages, avec la date et l'auteur) ;
- bloque la publication tant qu'une page contient une erreur, et propose « Corriger », qui ouvre la page en
  cause.

Pendant la mise en ligne, le bouton affiche le temps écoulé.

## Apparence et accessibilité

- Thème **clair** ou **sombre**, en suivant le système par défaut. Le choix est gardé par le navigateur.
- Une seule police d'interface, **Inter**, livrée avec le site, sans appel à Google Fonts. Le texte des
  panneaux fait 13 px, les chiffres ont une largeur fixe.
- Contraste AA sur tout le texte, en clair comme en sombre.
- Focus visible au clavier.
- Menus et recherche rapide utilisables au clavier : flèches, <kbd>Entrée</kbd>, <kbd>Échap</kbd>.
- Cibles de 40 px sur écran tactile.
- Animations courtes, sur `transform` et `opacity` uniquement, supprimées si le système demande de réduire
  les animations. La recherche rapide, ouverte au clavier et souvent, ne s'anime pas.

## Raccourcis

| Raccourci | Action |
|---|---|
| <kbd>⌘</kbd> <kbd>K</kbd> | Recherche rapide |
| <kbd>⌘</kbd> <kbd>S</kbd> | Enregistrer maintenant (l'enregistrement est de toute façon automatique) |
| <kbd>⌘</kbd> <kbd>Z</kbd> / <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>Z</kbd> | Annuler, rétablir |
| <kbd>Suppr</kbd> | Supprimer la section sélectionnée |

Sur Windows et Linux, <kbd>Ctrl</kbd> remplace <kbd>⌘</kbd>.

## Pour les contributeurs

- `packages/admin/src/styles.css` contient :
  - les **jetons** (`--of-*`) pour le clair et le sombre ;
  - la mise aux couleurs de Puck par ses propres jetons (`--puck-color-*`, `--puck-field-*`) ;
  - de rares réglages de mise en page ciblés sur `[class*="_PuckLayout-…_"]`, sous `.of-root .of-editor`.
- `packages/admin/src/icons.tsx` contient les icônes (tracés Lucide, licence ISC, intégrés pour ne dépendre
  d'aucune bibliothèque).
- `packages/admin/src/ui.tsx` contient les composants de base : boutons, menu, fenêtre, statuts, états vides.
- `packages/admin/src/shell.tsx` contient le tableau de bord, et `editor-ui.tsx` la barre, le rail et les
  panneaux de l'éditeur.
- Toute évolution de l'interface suit `.claude/skills/admin-ui/SKILL.md`. On la vérifie par des captures en
  clair et en sombre, puis par les tests de bout en bout (`pnpm --filter @openflow/e2e test`).
