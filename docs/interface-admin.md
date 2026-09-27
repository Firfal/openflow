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
  - **Pages**, puis une entrée par collection du site (« Actualités », « Réalisations »…), puis **Médias** ;
  - **Messages**, avec le nombre de messages non lus ;
  - **Assistant IA**, avec un point vert quand une IA est connectée ;
  - **Réglages**, qui se déplie en trois sous-pages : Contenu commun, Thème, Site et référencement
    (identité, langue, et **Mesure d'audience** : l'identifiant Google Analytics `G-…`) ;
  - **Historique** ;
  - en bas, le compte : apparence de l'admin (système, clair, sombre) et déconnexion.

  Sur mobile, elle devient une barre d'icônes.
- **En-tête de chaque vue** : le titre, les actions de la vue, « Voir le site » et **Publier**. Le bouton
  Publier affiche le nombre de modifications en attente.
- **Pages** :
  - un bandeau dit si le site en ligne est à jour ;
  - tant qu'aucune IA n'est connectée, une carte propose « Connecter Claude ou ChatGPT » (elle se masque) ;
  - chaque page affiche **un seul statut** : Masquée, Jamais publiée, Modifications non publiées ou En ligne ;
  - le bouton « Modifier » ouvre l'éditeur ;
  - le menu « ⋯ » propose Paramètres et référencement, Dupliquer, Voir en ligne et Supprimer ;
  - les paramètres d'une page montrent un **aperçu du résultat Google** et le nombre de caractères du titre et
    de la description.
- **Collections** (une vue par collection, par exemple « Actualités ») : ses éléments, du plus récent au
  plus ancien (ou par titre), avec leur image, leur date, leur adresse et **un seul statut**, comme les
  pages.
  - Filtres **Tous**, **Visibles**, **Masqués** (avec leur nombre) et recherche par titre.
  - « Nouvel article » (le libellé vient de la collection) demande le titre, l'adresse (sous celle de la
    collection, ex. `/actualites/…`), la date de publication et la visibilité, puis ouvre l'éditeur.
  - « Modifier » ouvre l'élément dans l'éditeur, comme une page ; le menu « ⋯ » propose Paramètres et
    référencement, Dupliquer (en élément masqué), Voir en ligne et Supprimer.
  - Les éléments n'apparaissent ni dans la liste des pages ni dans le panneau « Pages » de l'éditeur ; le
    choix de la page d'un lien les propose, groupés par collection.
- **Médias** : toute la médiathèque. On peut l'importer (plusieurs fichiers à la fois), la filtrer (fichiers
  importés ou fichiers du site) et chercher par nom. Chaque fichier a une fiche : dimensions, poids, origine et
  adresse à copier. Les images vont jusqu'à 15 Mo et les vidéos jusqu'à 100 Mo (MP4, WebM, MOV). À
  l'import, elles sont optimisées en arrière-plan ; la fiche affiche « Optimisation » :
  - image : des copies WebP de 480 à 2560 px de large (« 4 tailles · 310 Ko au plus »). Chaque visiteur
    reçoit la taille adaptée à son écran ;
  - vidéo : un MP4 1080p et un MP4 720p pour les mobiles, plus une image d'aperçu (« 1080p, 720p · 8,1 Mo
    au lieu de 31,5 Mo »).

  L'original est gardé et reste utilisé tant que l'optimisation n'est pas terminée ou si elle échoue.
- **Messages** : ce que les visiteurs envoient avec les formulaires du site, le plus récent en premier.
  - Deux dossiers : **Reçus** et **Indésirables** (messages que le filtre anti-spam juge suspects, sans
    notification).
  - Un message non lu porte « Nouveau ». L'ouvrir le marque comme lu.
  - La fenêtre d'un message affiche chaque champ, la page d'origine et la date, avec **Répondre** (ouvre la
    messagerie, adressée au visiteur), **Indésirable**, **Marquer comme non lu** et **Supprimer**.
  - Chaque nouveau message est aussi envoyé par e-mail au propriétaire (voir « Formulaires » dans
    [securite.md](securite.md)).
- **Historique** : la frise des publications. Une version remplacée se remet en ligne d'un clic.
- **Assistant IA** : brancher une IA qui modifie le site par la discussion
  ([assistant-ia.md](assistant-ia.md)). La page contient :
  - l'adresse du site pour l'IA, `https://<domaine>/mcp` ;
  - les étapes pour Claude, ChatGPT, Claude Code, Cursor, VS Code ou un autre client, avec un lien direct
    quand l'assistant en propose un ;
  - la liste des IA connectées, chacune avec « Déconnecter » ;
  - des idées de demandes à copier ;
  - en bas, repliée, la clé d'accès pour les outils qui ne savent pas se connecter.
- **Écran d'autorisation** : quand une IA demande l'accès, l'admin s'ouvre en plein écran, avec le nom de
  l'assistant, ce qu'il pourra faire et l'adresse où le navigateur sera renvoyé. Un site inconnu est
  signalé. Deux boutons : « Autoriser » et « Refuser ».
- **Recherche rapide** (<kbd>⌘</kbd> <kbd>K</kbd> ou <kbd>Ctrl</kbd> <kbd>K</kbd>, comme Quick Find dans Webflow
  et la palette de commandes de Framer) : ouvrir une page, un élément de collection ou un réglage, créer une
  page ou un élément, publier, voir le site, connecter une IA, changer d'apparence.

## Éditeur de page

L'éditeur occupe tout l'écran et n'a qu'**une seule barre** :

| Zone | Contenu |
|---|---|
| Gauche | Retour aux pages, sélecteur de page (ouvre une autre page sans repasser par la liste) |
| Centre | Écrans **Ordinateur** (1280 px), **Tablette** (768 px), **Mobile** (390 px) |
| Droite | État de l'enregistrement, annuler et rétablir, recherche, **Connecter une IA** (✦, point vert si une IA est connectée), **Publier** |

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
- **Panneau de droite** : il indique quoi faire tant que rien n'est sélectionné. Ensuite, il tient **en une
  seule colonne**, comme dans Framer et Figma, de haut en bas :
  1. **Le contenu de l'élément cliqué**, toujours ouvert, et **uniquement ses réglages**, comme dans Webflow :
     - un bouton : son texte et son lien ;
     - un élément de liste (une carte, une question de FAQ…) : les champs de cet élément ;
     - un texte, une image ou une vidéo : ce seul champ.
  2. **Style**, replié par défaut, car on change le contenu bien plus souvent que le style. Son en-tête
     résume ce qui est réglé sur l'écran affiché, par exemple « Mobile · 2 réglages ». Le navigateur retient
     s'il est ouvert ou fermé.
  3. **Tous les champs de la section**, repliés.

  Un clic à côté des éléments, ou la croix de l'élément, affiche toute la section : ses champs, puis son
  style, replié de la même façon.
- **Élément d'une collection** (un article…) : il s'ouvre dans le même éditeur. Sa section principale (titre,
  date, résumé, image, texte) se modifie sur la page ; la date se choisit dans le panneau de droite. Cette
  section ne peut être ni supprimée ni dupliquée, et elle n'est pas proposée dans « Ajouter » ; on peut
  ajouter d'autres sections autour. Le titre tapé sur la page devient celui de l'élément dans les listes et
  l'onglet du navigateur. Le bouton de retour ramène à la collection (« Retour à « Actualités » »), et le
  sélecteur de page propose aussi les autres éléments de la collection.
- **Sections qui listent une collection** (« Liste d'actualités ») : l'éditeur montre les éléments visibles
  tels qu'ils étaient à l'ouverture de la page, comme ils apparaîtront sur le site.

### Bloc Style

- Le fil en tête du bloc dit ce qui est stylé : la section, ou la section puis l'élément (« Hero ›
  Bouton principal »). Un clic sur la section passe au style de toute la section.
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
- `packages/admin/src/assistant.tsx` contient la page Assistant IA et la carte du tableau de bord, et
  `connect.tsx` l'écran d'autorisation d'une IA.
- `packages/admin/src/messages.tsx` contient la boîte de réception des formulaires.
- L'admin se charge par étapes : `app.tsx` (connexion, Firebase Auth seulement), `owner.tsx` (tableau de bord,
  Firestore via `services.ts`), puis `editor.tsx` et `settings-editors.tsx` (Puck), importés à la demande. Un
  module du tableau de bord n'importe jamais l'éditeur (Puck, `canvas`, `panel`, `style-*`, `fields`) ni
  `agent.ts` (outils WebMCP) autrement que par `import()`. Mesure et budget :
  `pnpm --filter @openflow/e2e weight ../../templates/next-starter/out --budget` (après un export).
- Toute évolution de l'interface suit `.claude/skills/admin-ui/SKILL.md`. On la vérifie par des captures en
  clair et en sombre, puis par les tests de bout en bout (`pnpm --filter @openflow/e2e test`).
