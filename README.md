# Parler avec Anna — hackathon

Application de communication **oui / non / je veux parler**, au toucher ou par **mouvements de tête** (caméra + MediaPipe).

## Contenu

| Dossier | Quoi | Pour qui |
|---|---|---|
| `prototype/anna.html` | Prototype complet en un seul fichier, **généré** depuis `anna-vercel/` (`npm run build:prototype`). Données d'exemple, stockées dans le navigateur. | Démo immédiate : double-cliquer pour l'ouvrir dans Chrome |
| `anna-vercel/` | Version déployable sur Vercel avec base Neon Postgres, API et espace admin protégé | Équipe technique |
| `anna-vercel/docs/ARCHITECTURE.md` | Architecture technique : application, base de données, API, sécurité, gestion | Tout le monde |
| `anna-vercel/README.md` | Déploiement pas à pas (≈ 10 min) | Équipe technique |

## Essayer en 1 minute

- **Prototype** : ouvrir `prototype/anna.html` dans Chrome. Le bouton Caméra active le suivi de tête : **tête vers sa gauche = oui**, **tête vers sa droite = non**. « Je veux parler » reste un bouton.
- **Modifier l'application** : tout se fait dans `anna-vercel/`, puis `npm run build:prototype -- --out ../prototype/anna.html` régénère le prototype.
- **Version Vercel en local, sans base** : dans `anna-vercel/`, lancer `npm run dev:mock` puis ouvrir http://localhost:3000/?cle=demo (Node 20 ou plus).

## Important

Les besoins exprimés par Anna sont des données de santé. Vercel et Neon ne sont pas, à notre connaissance, certifiés HDS : utiliser uniquement des données fictives tant que l'hébergement n'est pas certifié (voir ARCHITECTURE.md, section 7).

## Déployer sur Vercel

Importer ce dépôt dans Vercel en choisissant **Root Directory : `anna-vercel`**, puis suivre [anna-vercel/README.md](anna-vercel/README.md).
