# Vision

## Le problème

Les outils de vibe coding comme Claude Code produisent en quelques heures un site sur mesure,
bien plus soigné qu'un thème générique. Une fois le site livré, un problème demeure : le
propriétaire, qui n'est pas développeur, **ne peut rien modifier seul**. Chaque changement de texte, de
photo ou de page le renvoie vers l'agence ou vers l'IA.

Webflow et Framer résolvent ce problème, mais au prix d'un enfermement : le site vit sur leur plateforme,
avec leur modèle de données et leur facturation. Les CMS headless (Sanity, Storyblok, Contentful) sont des
services en ligne propriétaires. Les CMS open-source (Payload, Tina, Decap) ne s'appuient pas sur Firebase et
n'offrent pas d'édition visuelle simple.

## La proposition

**OpenFlow** est une solution open-source (licence MIT) qui :

1. laisse **Claude Code créer le site**, en Next.js, avec un design sur mesure ;
2. rend le site **modifiable par son propriétaire** depuis `/admin`, comme dans Webflow ou Framer : il
   clique sur un texte pour le modifier, remplace les images, ajoute ou réordonne des sections, puis publie ;
3. repose **uniquement sur Firebase**, dans le même projet que celui qui héberge le site (Hosting,
   Firestore, Auth, Storage, Functions) ;
4. publie un **site statique** : rapide, bien référencé, à coût quasi nul ;
5. **garantit par une norme vérifiable (OFS)** que le code produit par l'IA reste éditable, sûr et publiable.
   L'agent reçoit un retour automatique à chaque écart.

## Pour qui

| Acteur | Ce qu'il fait | Ce qu'OpenFlow lui apporte |
|---|---|---|
| Agence ou freelance, avec Claude Code | Crée, livre et fait évoluer les sites | Un template, des skills, des hooks et une norme : le site est éditable du premier coup |
| Propriétaire du site | Modifie ses contenus et publie | Un admin simple, en français, sans jargon et sans risque de casser le design |
| Visiteur | Consulte le site | Un site statique rapide et accessible |

## Principes

- **Séparer le code du contenu.** Le code (design, sections) appartient à l'agence ; le contenu
  appartient au propriétaire. Un redéploiement du code n'écrase jamais le contenu.
- **Permettre de modifier sans risque de casser le design.** Le propriétaire compose avec des sections
  conçues pour lui ; il ne peut pas casser le design.
- **Rester statique par défaut.** Aucun serveur à maintenir ; chaque publication est une version
  reproductible (code + snapshot), et le retour arrière est instantané.
- **Contrôler de façon déterministe.** Les contrôles de conformité sont faits par un outil, pas par
  l'IA : les résultats sont reproductibles et exploitables en CI.
- **S'appuyer sur l'existant.** OpenFlow ne réinvente pas l'éditeur visuel : il s'appuie sur
  [Puck](https://puckeditor.com) (MIT) et apporte tout ce qui manque autour.
