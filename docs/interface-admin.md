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
  - **Rendez-vous**, quand le site a une section de prise de rendez-vous ;
  - **Statistiques** ;
  - **Assistant IA**, avec un point vert quand une IA est connectée ;
  - **Réglages**, qui se déplie en cinq sous-pages : Contenu commun, Thème, Site et référencement
    (identité, langue principale et **autres langues du site**, **Mesure d'audience** : les statistiques sans cookie, activées par défaut, et
    l'identifiant Google Analytics `G-…`, facultatif, les balises de validation **Google Search Console**
    et **Bing Webmaster Tools** (la balise collée entière ou son code), et **Robots des IA** :
    autoriser ou refuser l'entraînement des IA, les recherches IA restant autorisées), et
    **Établissement** et **Informations légales** (voir plus bas) ;
  - **Historique** ;
  - en bas, le compte : apparence de l'admin (système, clair, sombre) et déconnexion.

  Sur mobile, elle devient une barre d'icônes.
- **En-tête de chaque vue** : le titre, les actions de la vue, « Voir le site » et **Publier**. Le bouton
  Publier affiche le nombre de modifications en attente.
- **Pages** :
  - un bandeau dit si le site en ligne est à jour ;
  - tant qu'aucune IA n'est connectée, une carte propose « Connecter Claude ou ChatGPT » (elle se masque) ;
  - chaque page affiche **un seul statut** : Masquée, Programmée le …, Mise en ligne…, Jamais publiée,
    Modifications non publiées ou En ligne ;
  - le bouton « Modifier » ouvre l'éditeur ;
  - le menu « ⋯ » propose Paramètres et référencement, Dupliquer, Voir en ligne et Supprimer ;
  - les paramètres d'une page montrent un **aperçu du résultat Google** et le nombre de caractères du titre et
    de la description ;
  - la **visibilité** d'une page se choisit dans ses paramètres : « Visible sur le site » (à la prochaine
    publication), « Masquée », ou « Mise en ligne programmée » avec une date et une heure (au quart
    d'heure). Une page programmée reste masquée, puis se met en ligne toute seule dans le quart d'heure,
    sans publier les autres modifications. Elle ne compte pas dans les modifications à publier ; la
    fenêtre « Publier le site » la rappelle, avec sa date.
- **Collections** (une vue par collection, par exemple « Actualités ») : ses éléments, du plus récent au
  plus ancien (ou par titre), avec leur image, leur date, leur adresse et **un seul statut**, comme les
  pages.
  - Filtres **Tous**, **Visibles**, **Masqués** (avec leur nombre) et recherche par titre.
  - Une collection d'événements affiche le jour (et l'heure, le dernier jour), « Passé » pour un événement
    terminé et le tarif ; les prochains viennent en premier. Sa fenêtre de création demande la « Date de
    l'événement ».
  - « Nouvel article » (le libellé vient de la collection) demande le titre, l'adresse (sous celle de la
    collection, ex. `/actualites/…`), la date de publication et la visibilité (dont la mise en ligne
    programmée), puis ouvre l'éditeur.
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
- **Rendez-vous** : les rendez-vous pris sur le site, groupés par jour (« Aujourd'hui », « Demain »,
  « Mardi 6 octobre »…).
  - Trois filtres : **À venir** (avec leur nombre), **Passés** et **Annulés**.
  - Chaque rendez-vous montre l'heure de début et de fin, le nom du visiteur, la prestation, son e-mail et
    son téléphone (cliquables), le prix, son message, et s'il a été préparé par l'assistant IA du visiteur.
  - Le menu « ⋯ » propose **Écrire à …** et **Annuler le rendez-vous** : après confirmation, le créneau
    redevient libre sur le site (le visiteur n'est pas prévenu automatiquement : la fenêtre rappelle ses
    coordonnées). Un rendez-vous passé ou annulé peut être **effacé** (demande du visiteur).
  - Le bouton **Horaires d'ouverture** mène à Réglages > Établissement, dont dépendent les créneaux.
  - Les prestations, leurs durées et prix, l'intervalle entre deux créneaux, le délai minimum, l'horizon de
    réservation et la pause entre deux rendez-vous se règlent dans la section « Prise de rendez-vous »
    de la page, comme n'importe quel champ. Chaque rendez-vous est effacé automatiquement 12 mois après
    sa date.
- **Messages** : ce que les visiteurs envoient avec les formulaires du site, le plus récent en premier.
  - Deux dossiers : **Reçus** et **Indésirables** (messages que le filtre anti-spam juge suspects, sans
    notification).
  - Un message non lu porte « Nouveau ». L'ouvrir le marque comme lu. Un message rempli par l'assistant IA
    du navigateur du visiteur le signale.
  - La fenêtre d'un message affiche chaque champ, la page d'origine et la date, avec **Répondre** (ouvre la
    messagerie, adressée au visiteur), **Indésirable**, **Marquer comme non lu** et **Supprimer**.
  - Chaque nouveau message est aussi envoyé par e-mail au propriétaire (voir « Formulaires » dans
    [securite.md](securite.md)).
- **Statistiques** : les visites du site publié, mesurées sans cookie ni bandeau (voir
  [securite.md](securite.md#mesure-daudience-sans-cookie)).
  - Période : **7 jours**, **30 jours** (par défaut) ou **90 jours**.
  - Trois chiffres : **Visites**, **Pages vues** et **Depuis un assistant IA** (avec leur part des visites).
  - Un graphique des visites par jour (par semaine sur 90 jours). Au survol, au doigt ou au clavier
    (flèches, Début, Fin), il affiche les visites, celles venues d'une IA et les pages vues du jour ; « Voir
    le tableau » donne toutes les valeurs.
  - **Pages les plus vues** ; **D'où viennent les visites**, groupées : Assistants IA (ChatGPT, Perplexity,
    Claude, Gemini, Copilot, Le Chat…), Moteurs de recherche, Réseaux sociaux, Autres sites (et campagnes
    `utm_source`), Accès direct ; **Pages où arrivent les assistants IA** ; **Appareils**.
  - **Vitesse ressentie par les visiteurs** (Core Web Vitals, mesurés chez les vrais visiteurs) :
    Affichage, Réactivité et Stabilité, chacun avec le verdict de Google (« Bon », « À améliorer »,
    « Lent » ou « Instable », au 75e centile) et la part des chargements rapides.
  - **Recherche Google** (Google Search Console) : clics, affichages, taux de clic et position moyenne
    sur la période (7, 28 ou 90 jours, avec les deux jours de retard de Google), les recherches qui
    amènent des visiteurs et les pages trouvées. Tant que le site n'est pas relié, la carte donne les trois
    étapes : ajouter le site dans Search Console et coller sa balise de validation dans Réglages > Site
    et référencement, puis ajouter comme utilisateur « Restreint » le compte du site (adresse à copier).
  - En bas, « Ne pas compter mes visites sur cet appareil », pour que le propriétaire ne gonfle pas ses
    chiffres.
- **Établissement** (Réglages) : la fiche que lisent Google, les assistants IA et le site.
  - Activité (boulangerie, restaurant, artisan…), nom, téléphone, e-mail, adresse, zone desservie, gamme
    de prix.
  - Horaires : une ligne par jour (case « Ouvert », une à trois plages, bouton pour recopier une journée
    sur les autres jours ouverts), et une précision libre (« Sur rendez-vous le lundi »).
  - Fermetures exceptionnelles (du, au, motif) : elles disparaissent d'elles-mêmes une fois passées.
  - Présence en ligne : la fiche Google et les réseaux sociaux, un lien par ligne.
  - En bas, « Ce que liront Google et les assistants IA » montre le résultat, et **Enregistrer la fiche**
    l'enregistre (en ligne à la prochaine publication).
- **Informations légales** (Réglages) : les pages que la loi demande, écrites par OpenFlow.
  - « Vos pages légales » : les mentions légales et la politique de confidentialité, avec leur adresse et
    leur statut (« Visible », « Masquée »), ou « Créer la page » quand elle manque. Leur texte s'écrit d'après
    le site et se met à jour à chaque publication.
  - « Éditeur du site » : raison sociale, forme juridique et capital, immatriculation, TVA, directeur de la
    publication, adresse du siège (si elle diffère de celle de l'établissement).
  - « Données personnelles et litiges » : l'e-mail où écrire pour ses données (celui de l'établissement par
    défaut), le médiateur de la consommation.
  - Ce qui manque encore est listé à côté de **Enregistrer**.
  - « Ce que dit votre politique de confidentialité » : mesure d'audience, Google Analytics, formulaires,
    reCAPTCHA, envoi des messages par e-mail, oui ou non, d'après le site lui-même.
  - Dans l'éditeur, la section « Page légale » affiche le texte tel qu'il sera publié ; le panneau propose le
    choix du document et un champ « Informations complémentaires » pour ce qu'OpenFlow ne connaît pas
    (newsletter, prise de rendez-vous…).
- **Langues** (sites multilingues) : chaque page et chaque élément de collection montre un bouton par autre
  langue (« EN », en couleur quand la page est traduite, en pointillés sinon) qui ouvre sa traduction.
  - L'éditeur a un menu des langues en haut, à côté du nom de la page. Dans une autre langue, la page
    s'ouvre avec les mêmes sections, verrouillées : on ne change que les textes, sur la page ou dans le
    panneau de droite, qui montre chaque texte d'origine au-dessus de sa traduction (« À traduire »,
    « À revoir » quand le texte d'origine a changé depuis), et le titre, l'adresse et la description de la
    page dans cette langue.
  - « Contenu commun » a le même menu : dans une autre langue, un formulaire traduit le nom du site, sa
    description, le menu et le pied de page.
  - Une page n'existe dans une langue qu'une fois traduite ; ce qui n'est pas traduit reste dans la langue
    principale. L'IA du propriétaire peut tout traduire (« Traduis le site en anglais »).
- **Messages** : l'en-tête rappelle que chaque message est effacé automatiquement 3 ans après sa réception.
- **Historique** : la frise des publications. Une version remplacée se remet en ligne d'un clic. Une
  « Mise à jour automatique » y apparaît quand le site s'est reconstruit seul (voir plus bas) ; elle ne
  publie aucun brouillon. Une « Publication programmée » y apparaît quand une page s'est mise en ligne
  à son heure.
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
  page ou un élément, publier, voir le site, voir les statistiques, connecter une IA, changer d'apparence.

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
  tels qu'ils étaient à l'ouverture de la page, comme ils apparaîtront sur le site. Un clic sur la carte
  d'un élément affiche en tête du panneau de droite « … est un élément de « Actualités » », avec le bouton
  **Modifier cet élément**, qui enregistre la page et ouvre l'élément (comme « Edit collection item » dans
  Webflow).

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
  cause ;
- donne, repliés et sans bloquer, les **conseils pour être mieux trouvé par Google et les assistants IA**
  (audit du site : adresse du site, fiche établissement, descriptions, textes des images, liens vers une
  page masquée…), chacun avec « Voir », qui ouvre la page ou le réglage concerné.

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
