---
name: openflow-design
description: Direction artistique et qualité UI/UX des sites OpenFlow (sections, en-tête, pied de page, formulaires, pages d'accueil). À utiliser avant de concevoir ou de retoucher l'apparence d'un site, pour choisir couleurs, typographies, mise en page, animations et textes, et garantir accessibilité et performance.
---

# Concevoir un site OpenFlow soigné

Ces règles condensent des skills de design reconnus (sources en bas de page). Elles s'appliquent à tout ce
que voit un visiteur : sections de `openflow/components/`, `openflow/layout/`, formulaires, pages d'accueil.
L'admin a ses propres règles (skill `admin-ui` du dépôt OpenFlow).

## 1. Partir du sujet, pas d'un gabarit

- Identifie l'activité, le public et la mission principale de chaque page. Les choix visuels viennent du
  métier : ses matières, son vocabulaire, ses images.
- Le haut de l'accueil montre ce qu'il y a de plus caractéristique : une photo du lieu, le produit, une
  démonstration, un chiffre fort. Le « gros titre + deux boutons + dégradé » n'est qu'une option parmi
  d'autres, à choisir seulement s'il est vraiment le meilleur.

## 2. Un plan de design avant le code

1. **Couleurs** : 4 à 6 valeurs nommées. Elles deviennent les jetons `@theme` de `app/globals.css`, et ceux
   de `config.theme` si le propriétaire peut les changer.
2. **Typographie** : une ou deux familles, clairement distinctes, choisies pour ce client (pas la police par
   défaut de tous les projets), chargées avec `next/font`. Échelle de tailles régulière, graisses choisies,
   lignes de moins de 80 caractères, un peu plus d'interligne pour un texte à empattements.
3. **Mise en page** : une phrase et un croquis ASCII par section clé. Alignement décidé : à gauche par défaut
   pour les textes longs.
4. **Principe** : l'élément mémorable du site. Un seul ; tout le reste est calme et discipliné.

Relis ce plan avant d'écrire du code : tout ce qui ressemble au site qu'on ferait pour n'importe quel client
est à revoir. Note ce que tu as changé et pourquoi.

## 3. Les réflexes génériques à éviter

Ils trahissent une page générée. Ce sont de vrais choix quand le brief les demande, jamais des défauts :
- fond crème, titre à empattements et accent terracotta ; fond presque noir et accent vert acide ;
- contenu découpé en cartes identiques, même arrondi et même ombre grise partout, dégradés décoratifs ;
- sur-titre en capitales espacées au-dessus de chaque titre, un seul mot du titre en couleur ou en italique ;
- numéros 01 / 02 / 03 alors que le contenu n'est pas une suite, flèche « → » ajoutée aux boutons,
  métadonnées « A · B · C » ;
- apparition animée de chaque section au défilement, survol animé sur toutes les cartes.

## 4. Textes et typographie française

- Espace insécable avant « : ; ! ? » et dans les guillemets « », apostrophe ’, points de suspension « … »,
  `text-wrap: balance` sur les titres. Applique-les dans `defaultProps` et le contenu de départ.
- Casse de phrase partout ; pas de libellés en capitales.
- Un bouton dit ce qui se passe : « Demander un devis », « Réserver une table », jamais « Envoyer » seul ni
  « Valider ». Le même mot suit toute l'action (« Réserver » → « Réservation envoyée »).
- Un message d'erreur dit comment corriger ; un état vide propose l'action suivante.
- Textes réalistes et propres au client ; aucune promesse creuse ni « Lorem ipsum ».

## 5. Mouvement

- Un seul moment orchestré (le chargement de l'accueil, ou une révélation) plutôt que des effets partout.
- Uniquement `transform` et `opacity`. Entrée en ease-out de 200 à 300 ms, sortie de 150 à 200 ms, survol
  vers 150 ms. Jamais `transition: all`.
- Respecte `prefers-reduced-motion`. Les vidéos en boucle gardent leur bouton pause (`videoProps` le fournit).

## 6. Accessibilité : un plancher, sans l'annoncer

- Contraste AA : 4,5:1 pour le texte, 3:1 pour les grands titres et les contrôles. Focus visible
  (`focus-visible:ring-*`), jamais `outline-none` seul. Cibles d'au moins 44 px sur mobile.
- Un seul `h1` (la section Hero), puis `h2` et `h3`. `<button>` pour agir, `<a>` pour naviguer.
- Images : texte alternatif du propriétaire ; `alt=""` si l'image est décorative.
- Menu mobile : bouton avec un nom accessible et `aria-expanded`, fermeture avec Échap.
- Marques et termes techniques : `translate="no"`.

## 7. Formulaires

- Utilise `<OpenFlowForm>` (`@openflow/next/forms`). Il fournit déjà les libellés cliquables, l'`autocomplete`,
  les erreurs à côté des champs, le focus sur la première erreur et l'annonce du résultat.
- Habille-le avec `classNames` : états `aria-[invalid=true]:` pour les champs, `data-[status=sent]:` et
  `data-[status=error]:` pour le message. Une seule colonne sur mobile.

## 8. Images, vidéos, performance

- `imageProps(image, { sizes })`, avec la largeur réellement affichée (« (min-width: 1024px) 50vw, 100vw ») :
  le navigateur choisit alors la bonne copie optimisée.
- Ajoute `loading="lazy"` sous la ligne de flottaison et `fetchPriority="high"` à l'image du Hero.
- Au plus deux graisses par famille de polices. Pas de bibliothèque d'animation pour un effet faisable en CSS.

## 9. Compatibilité OpenFlow (vérifiée par la norme)

- Aucun texte, image ni lien écrit en dur : tout passe par des champs.
- Une seule racine par section et pas de `!important`, pour que le bloc « Style » du propriétaire s'applique.
  Les couleurs passent par les jetons.
- Rendu robuste avec des champs vides ou très longs (`break-words`, `min-w-0`).
- Peu de réglages de style exposés au propriétaire, avec des noms simples (« Clair », « Sombre », « Accent »).

## 10. Vérifier en images

- Fais des captures à 1440×900 et 390×844 (et en thème sombre si le site en a un), avec `npx openflow dev`
  puis Playwright ou le navigateur.
- Relis chaque capture : hiérarchie, alignements, rythme vertical, contraste, textes coupés. Avant de livrer,
  retire un accessoire (le conseil de Chanel).
- `npx openflow check --level build` doit rester conforme.

## 11. Quand un besoin n'est pas couvert

Pour des tableaux de données, des graphiques, une boutique, une carte, une prise de rendez-vous, cherche
d'abord sur GitHub un skill reconnu : les dépôts ci-dessous, ou la recherche « <besoin> SKILL.md ». Lis-le,
applique ses règles, puis ajoute ici les principes utiles avec leur source, sans copier de longs textes.

## Sources

- [frontend-design](https://github.com/anthropics/skills) (Anthropic) : direction artistique, réflexes
  génériques, écriture.
- [web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (Vercel) :
  accessibilité, formulaires, performance.
- [impeccable](https://github.com/pbakaus/impeccable) et
  [interface-design](https://github.com/Dammyjay93/interface-design) : finition et hiérarchie.
- [Les règles d'animation d'Emil Kowalski](https://github.com/emilkowalski/skills) : durées et courbes.
- [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) : palettes et associations de polices
  par secteur d'activité.
