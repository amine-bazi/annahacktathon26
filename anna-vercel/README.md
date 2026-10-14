# Parler avec Anna

Communication **oui / non / je veux parler** au toucher ou par **mouvements de tête** (MediaPipe), avec une banque de questions éditable, un historique et un moteur de recommandation. Hébergé sur Vercel avec une base Neon Postgres.

Architecture détaillée : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Prototype autonome

`npm run build:prototype` génère `dist/anna.html` : toute l'application en un seul fichier, avec des données d'exemple gardées dans le navigateur (aucun serveur). C'est ce fichier qui est publié comme prototype.

## Essayer en local, sans base

```bash
npm run dev:mock
```

Puis ouvrir http://localhost:3000/?cle=demo. Les données sont en mémoire et repartent de zéro à chaque redémarrage. La caméra fonctionne sur `localhost`.

## Déployer sur Vercel

1. **Importer le dépôt** dans Vercel (Add New → Project). Framework preset : *Other*. Si le dépôt contient d'autres dossiers, régler **Root Directory** sur `anna-vercel`. Rien d'autre à régler : `vercel.json` sert `public/` et les fonctions de `api/`.
2. **Ajouter la base** : onglet *Storage* du projet → *Marketplace* → **Neon** → connecter au projet. La variable `DATABASE_URL` est ajoutée automatiquement.
3. **Ajouter les variables** (Settings → Environment Variables) :
   - `SESSION_SECRET` : 32 caractères aléatoires minimum
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
     ```
   - `APP_URL` : l'adresse de production, par exemple `https://anna.vercel.app`
4. **Créer le schéma et la première personne**, depuis votre poste :
   ```bash
   npm install
   ```
   ```bash
   npx vercel link
   ```
   ```bash
   npx vercel env pull .env.local
   ```
   ```bash
   npm run db:migrate
   ```
   ```bash
   npm run db:seed -- --name "Anna" --demo
   ```
   Le seed affiche le **lien d'installation** (`https://…/?cle=…`). `--demo` ajoute des personnes d'exemple à remplacer.
5. **Redéployer** pour que les fonctions prennent les variables, puis ouvrir le lien d'installation sur la tablette d'Anna. Le code admin se crée au premier accès à l'espace admin (bouton « Admin »).

## Utilisation

- L'application s'ouvre sur **« Ça va ? »** (Oui / Non) : la réponse met en tête les thèmes utiles (douleur et confort si ça ne va pas, échanges et activités si ça va).
- Pendant les questions, Anna répond avec **Non · Parler · Oui** en bas de l'écran, au clavier (O / N / P), ou avec la tête après un appui sur **Caméra** :
  - **tête tournée vers sa gauche = oui**
  - **tête tournée vers sa droite = non**
  - pencher la tête et tenir 1 s = je veux parler
  Caméra arrière par défaut (téléphone tenu face à Anna) ; caméra avant pour une tablette posée face à elle : Admin → Réglages. Si l'image est inversée : « Inverser gauche et droite ».
- Le lien d'installation est un secret : quiconque l'a peut lire les échanges. En cas d'appareil perdu : Admin → Réglages → **Générer un nouveau lien**.

## Données de santé

Les besoins exprimés sont des données de santé. Vercel et Neon ne sont pas, à notre connaissance, certifiés **HDS** : utilisez des données fictives tant que l'hébergement n'est pas certifié. Voir la section 7 de l'architecture.
