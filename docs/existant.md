# Solutions existantes et positionnement

Étude réalisée en septembre 2026. Aucun projet mature ne combine **édition visuelle d'un site Next.js
écrit en code** et **backend Firebase**. Les seules tentatives trouvées sont des démos isolées
(`next-firebase-puck`, `payload-firestore-adapter` expérimental, etc.).

| Solution | Licence | Atouts | Limites pour notre besoin | Décision |
|---|---|---|---|---|
| **Puck** (`@puckeditor/core` 0.23) | MIT (Puck AI et Cloud payants) | Éditeur visuel React : glisser-déposer de sections, édition de texte directement sur la page (`contentEditable`, Tiptap), slots, plugins, stockage libre, rendu `<Render>` compatible avec l'export statique | Pas de brouillon ni d'historique, pas de contenu multilingue, pas de médiathèque, pas de formulaires, pas d'auth, pas de publication | **Base de l'éditeur** |
| **FireCMS** v3 | Cœur MIT, PRO sous BSL | Admin natif Firestore, Storage et Auth | Historique, rôles et IA réservés à la version PRO ; pas d'édition visuelle ; seconde interface | Écarté en v1, à réévaluer pour une vue « tableur » des collections |
| **Payload 3** (racheté par Figma) | MIT (éditeur visuel en Enterprise) | Le plus complet : versions, i18n, formulaires, SEO | Pas de Firestore officiel, serveur Node requis, incompatible avec l'export statique | Écarté |
| **TinaCMS** | Apache-2.0 | Bon clic-pour-éditer (`data-tina-field`) | Git comme source de vérité, base MongoDB ou KV | Écarté (inspiration pour le balisage) |
| Sanity, Storyblok, Builder.io, Makeswift, Plasmic | SaaS propriétaires, SDK ouverts | Références d'expérience (surimpressions cliquables, bridges) | Non auto-hébergeables | Inspiration uniquement |
| CloudCannon | Propriétaire | Édition directement sur la page via des attributs `data-editable` | Plateforme SaaS | Inspiration pour le futur mode HTML |
| Onlook | Apache-2.0 | Édition visuelle du code JSX avec l'IA | Outil de designer ou développeur, pas de CMS | Écarté |
| Decap, Keystatic, Outstatic, Pages CMS | MIT | CMS basés sur Git | Pas d'édition visuelle, stockage Git | Écartés |
| Webstudio, GrapesJS, Craft.js | AGPL, BSD, MIT | Constructeurs de sites | Pas adaptés à un site écrit en code | GrapesJS possible plus tard pour le HTML pur |

## Ce qu'OpenFlow ajoute à Puck

1. Persistance Firestore, sauvegarde automatique, brouillon séparé de la version en ligne.
2. Publication statique : snapshot figé, puis Cloud Build, puis Firebase Hosting ; historique et restauration instantanée.
3. Espace admin réservé au propriétaire (claim personnalisé, règles Firestore et Storage).
4. Champs image (médiathèque Cloud Storage) et lien (pages internes recalculées à chaque publication).
5. Réglages globaux (menu, pied de page, thème), SEO par page, sitemap et robots.
6. **Kit Claude Code** : template, `AGENTS.md`, skills, hooks et norme OFS vérifiée automatiquement.

## Intégration avec l'IA : état de l'art retenu

- **Contrat toujours chargé dans le dépôt** : un bloc `AGENTS.md`, importé par `CLAUDE.md`. Les évaluations
  publiées (Vercel, Firebase) montrent qu'il est bien plus fiable qu'un skill seul.
- **Skills réservés aux workflows** : création et livraison. Le format Agent Skills est portable
  (Claude Code, Cursor, Codex…).
- **Validateur déterministe** (`openflow check`) branché sur les hooks : l'agent se corrige seul.
- **Template** pour tout ce qui est invariant : l'IA ne génère que le design et le contenu.
- **Serveur MCP** (phase 4) pour les opérations sur le contenu après livraison.
