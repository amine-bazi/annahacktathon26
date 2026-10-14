# Architecture technique — Parler avec Anna

Application de communication alternative pour une personne qui répond par **oui**, **non** ou **je veux parler**, au toucher ou par **mouvements de tête** détectés par la caméra. Hébergement Vercel, base Postgres Neon.

---

## 1. Vue d'ensemble

```mermaid
flowchart LR
  subgraph Tablette["Tablette d'Anna (navigateur)"]
    UI["Interface<br/>public/app.js"]
    MP["Suivi de tête<br/>MediaPipe Face Landmarker<br/>(WebAssembly / GPU)"]
    Q["File d'attente hors ligne<br/>localStorage"]
    CAM(("Caméra"))
    CAM -- images --> MP
    MP -- "oui / non / parler" --> UI
    UI -- écritures --> Q
  end
  subgraph Soignant["Téléphone soignant"]
    UI2["Même application<br/>+ espace admin (code)"]
  end
  subgraph Vercel
    CDN["CDN statique<br/>public/"]
    F1["/api/data"]
    F2["/api/auth"]
    F3["/api/admin"]
  end
  DB[("Neon Postgres<br/>(Marketplace Vercel)")]
  JSD["cdn.jsdelivr.net<br/>storage.googleapis.com<br/>(modèle MediaPipe)"]

  UI -- "GET bootstrap" --> F1
  Q -- "POST events / conversation / note" --> F1
  UI2 -- "code admin" --> F2
  UI2 -- "édition banque" --> F3
  F1 & F2 & F3 --> DB
  Tablette -. charge .-> CDN
  MP -. "télécharge une fois" .-> JSD
```

**Principe clé : les images de la caméra ne quittent jamais la tablette.** MediaPipe tourne dans le navigateur ; seul le geste reconnu (« oui », « non », « parler ») devient une réponse, comme un appui sur un bouton.

---

## 2. Choix techniques

| Besoin | Choix | Pourquoi |
|---|---|---|
| Hébergement | Vercel, sans framework (fichiers statiques + Vercel Functions Node 20) | Déploiement en un `git push`, HTTPS fourni (obligatoire pour la caméra), aucune étape de build à maintenir |
| Base de données | **Neon Postgres** via le Marketplace Vercel | Postgres standard (portable vers un hébergeur HDS), branchement en un clic, pilote HTTP adapté aux fonctions serverless, branches de base pour les previews |
| Reconnaissance des gestes | **MediaPipe Tasks Vision — Face Landmarker** (`@mediapipe/tasks-vision@0.10.14`) | 478 points du visage en temps réel sur tablette, GPU avec repli CPU, 100 % local |
| Front | HTML + JavaScript (modules ES), sans framework | Le prototype validé est repris tel quel ; poids minimal sur tablette ancienne |
| Hors ligne | File d'attente locale, rejouée dans l'ordre | Le wifi d'un centre de soins coupe : aucune réponse d'Anna ne doit être perdue |
| Synthèse vocale | `speechSynthesis` du navigateur (fr-FR) | Gratuit, hors ligne, rien n'est envoyé à un service tiers |

---

## 3. Application

### 3.1 Organisation du code

```
anna-vercel/
├── public/                 → servi par le CDN Vercel
│   ├── index.html          coquille + pictogrammes SVG
│   ├── styles.css          thème clair/sombre, grille mobile
│   ├── app.js              écrans, déroulé des questions, moteur de reco, espace admin, file d'attente
│   └── head-tracking.js    MediaPipe → gestes oui / non / parler
├── api/                    → 3 Vercel Functions
│   ├── data.js             lecture de la banque, enregistrement des réponses
│   ├── auth.js             code admin (création, connexion, déconnexion)
│   └── admin.js            édition (questions, thèmes, types, personnes, réglages, clé d'appareil)
├── lib/                    code partagé côté serveur
│   ├── db.js               client Neon
│   ├── auth.js             clé d'appareil, hash du code (scrypt), session signée (HMAC)
│   ├── repo.js             requêtes de lecture
│   ├── content.js          conversions lignes SQL ⇄ arbre de questions (pur, testable)
│   └── defaults.js         banque de questions initiale
├── db/schema.sql           schéma Postgres (idempotent)
├── scripts/                migrate, seed, serveur de démo sans base
└── vercel.json             en-têtes de sécurité, autorisation caméra
```

### 3.2 Écrans

| Écran | Rôle |
|---|---|
| **Ouverture « Coucou »** | Tout premier écran : « Coucou, est-ce que tu veux parler ? » Oui / Non. Non → écran calme « D’accord, pas maintenant » avec « Reprendre » (ou oui de la tête). Oui → « Ça va ? ». Réponse enregistrée |
| **Ouverture « Ça va ? »** | Deuxième écran : « Ça va ? » en deux grands boutons Oui / Non (ou gestes de tête). La réponse est enregistrée et met en tête les thèmes utiles : **ça ne va pas** → Douleur, Émotions, Position, Chaud / froid, Boire / manger, Toilette ; **ça va** → Poser une question, Dire quelque chose, Proches, Loisirs, Ma journée, Autre sujet. Le Top 3 prend alors le pictogramme principal de chacun des 3 premiers thèmes. Le bouton « Ça va ? » de la barre du haut repose la question |
| **Accueil** | Pensé pour le téléphone que tient la personne en face d'Anna : texte et pictogrammes en grand, sans défilement. Une ligne par thème = le thème, ses **3 pictogrammes les plus importants** (moteur de recommandation) et « + » pour le reste. Le nombre de lignes s'adapte à l'écran ; **Page suivante / Précédente** pour les autres thèmes. Page 1 : **Top 3** puis les besoins essentiels (Boire / manger, Douleur, Position, Toilette) |
| **Voix** | « Oui » / « Non » toujours dits à voix haute (voix française choisie explicitement, débloquée au premier toucher sur iPhone) ; lecture des questions avec le bouton Voix |
| **Oui · Non · Parler** | Absents de l'accueil : la barre de réponse et les gestes de tête (caméra) ne sont actifs que pendant les questions |
| **Page d'un thème** | Tous les pictogrammes du thème en grand, en pages si besoin ; « Oui / non » parcourt le thème question par question |
| **Question** | Une question en très grand ; réponse par Oui / Non / Parler (boutons, clavier O/N/P, ou tête) |
| **Résultat** | Résumé du besoin (« Douleur › Dos › Forte »), alerte si prioritaire, questions « Pour aller plus loin » pour l'entourage |
| **Échanger** | Anna pose une question ou dit une phrase : affichée en grand et lue à voix haute |
| **Épeler** | Balayage par groupes de lettres puis lettre par lettre |
| **Espace admin** | Protégé par code. Résumé (historique) · Ajouter (ajout de questions, ajout d’un contact avec **photo** prise à l’appareil) · Réglages (programme, gestes de tête, options) |

### 3.3 Reconnaissance des mouvements de tête

```mermaid
sequenceDiagram
  participant C as Caméra
  participant M as Face Landmarker
  participant H as head-tracking.js
  participant A as app.js
  C->>M: image vidéo (≈30/s)
  M->>H: 478 points du visage
  H->>H: nez + coins des yeux → lacet, tangage, roulis<br/>(normalisés par l'écart des yeux)
  Note over H: 25 premières images = position de repos (calibration)
  H->>H: rotation > seuil puis retour au repos en < 1,6 s
  alt tête tournée vers sa gauche
    H->>A: oui
  else tête tournée vers sa droite
    H->>A: non
  else tête penchée tenue 1 s
    H->>A: parler
  end
  A->>A: même traitement qu'un appui sur le bouton
```

- **Gestes** : tête tournée vers **sa gauche = oui**, vers **sa droite = non**, tête penchée tenue 1 s = je veux parler. Hocher ou baisser la tête n'est pas un geste.
- **Caméra** : arrière par défaut (téléphone tenu par la personne en face d'Anna, écran vers le lecteur) ; caméra avant si la tablette est posée face à Anna. Réglage dans Admin → Réglages.
- **Sens gauche / droite** : calculé dans l'image brute de la caméra ; si un appareil renvoie une image miroir, l'option « Inverser gauche et droite » (Admin → Réglages) corrige, enregistrée par personne.
- **Seuils réglables** dans l'espace admin (« amplitude du mouvement », de 50 % à 160 %), enregistrés par personne.
- **Anti-rebond** : 1,2 s de pause après un oui/non, 2 s après « parler ».
- **Dérive lente** : la position de repos suit doucement Anna quand elle est immobile ; recalibrage automatique si la tête reste décalée plus de 4 s, ou manuel (bouton « Recalibrer »).
- **Chargement** : le moteur WebAssembly et le modèle (~3,6 Mo) sont téléchargés au premier clic sur « Caméra », puis mis en cache par le navigateur.

### 3.4 Écritures et hors ligne

```mermaid
sequenceDiagram
  participant A as app.js
  participant L as localStorage (file)
  participant API as /api/data
  participant DB as Neon
  A->>A: réponse d'Anna (mise à jour locale immédiate)
  A->>L: ajoute {events | conversation | note}
  loop toutes les 15 s, au retour du réseau, après chaque ajout
    L->>API: envoie le premier élément
    API->>DB: INSERT
    alt succès ou donnée refusée (4xx)
      API-->>L: retire l'élément
    else réseau / serveur indisponible
      API-->>L: garde l'élément, réessaie plus tard
    end
  end
```

L'identifiant de chaque échange (UUID) est créé sur la tablette : un renvoi n'enregistre jamais de doublon (`ON CONFLICT DO NOTHING`). Le nombre d'éléments en attente s'affiche dans la barre du haut.

---

## 4. API

Toutes les requêtes portent l'en-tête `x-device-key` (clé d'appareil). L'espace admin ajoute un cookie de session.

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| GET | `/api/data?action=bootstrap` | appareil | Banque, personnes, programme, réglages, statistiques, historique 60 jours |
| POST | `/api/data?action=events` | appareil | Réponses oui / non / parler (statistiques du moteur) |
| POST | `/api/data?action=conversation` | appareil | Un échange abouti |
| POST | `/api/data?action=note` | appareil | Réponse à une question « pour aller plus loin » |
| GET | `/api/auth?action=status` | appareil | Code existant ? Session active ? |
| POST | `/api/auth?action=setup` | appareil | Créer le code admin (si aucun) |
| POST | `/api/auth?action=login` | appareil | Ouvrir une session admin (8 h) |
| POST | `/api/auth?action=logout` | appareil | Fermer la session |
| POST | `/api/admin?action=…` | appareil + admin | `add-question`, `delete-question`, `add-theme`, `add-type`, `delete-type`, `add-followup`, `delete-followup`, `add-person`, `delete-person`, `set-person-photo`, `save-plan`, `save-settings`, `change-pin`, `rotate-device-key` |

Trois fonctions seulement (routage par `?action=`) : on reste loin des limites du plan Hobby et les démarrages à froid sont mutualisés.

---

## 5. Base de données

### 5.1 Modèle

```mermaid
erDiagram
  patients ||--o{ question_types : "a"
  patients ||--o{ people : "connaît"
  patients ||--o{ conversations : "a eu"
  patients ||--o{ answer_events : "a répondu"
  patients ||--o{ auth_attempts : ""
  question_types ||--o{ themes : "regroupe"
  themes ||--o{ questions : "contient"
  themes ||--o{ followups : "propose"
  questions ||--o{ questions : "sous-questions"
  conversations ||--o{ conversation_notes : "détaille"

  patients {
    uuid id PK
    text display_name
    text device_key_hash "SHA-256 de la clé d'appareil"
    text admin_pin_hash "scrypt + sel"
    text daily_plan
    jsonb settings "reco, sens"
  }
  question_types {
    text id PK
    text name
    text short_label
    text icon
    int hue
    int position
  }
  themes {
    text id PK
    text type_id FK
    text label
    bool is_private "jamais enregistré"
    text_array people_kinds "non nul = liste aussi des personnes"
    int position
  }
  questions {
    text id PK "ex. douleur.dos"
    text theme_id FK
    text parent_id FK
    text label "mot-clé du résumé"
    text text "question affichée"
    text kind "question, ask, say"
    text action "spell, planning, heure"
    bool is_urgent
    bool is_private
    bool has_intensity
    bool is_active
  }
  followups {
    bigint id PK
    text theme_id FK
    text text
  }
  people {
    text id PK
    text name
    text role
    text kind "Proches, Équipe, Rencontres"
    text photo "JPEG recadré 192 px (data URL)"
  }
  conversations {
    uuid id PK "créé par la tablette"
    text theme_id
    text_array path
    text result "resolu, non-trouve, message, parole"
    int questions_count
    int duration_ms
    bool is_urgent
    timestamptz created_at
  }
  conversation_notes {
    bigint id PK
    uuid conversation_id FK
    text question
    text answer
  }
  answer_events {
    bigint id PK
    text question_key
    text theme_id
    text answer "oui, non, parler"
    int response_ms
    timestamptz created_at
  }
```

Toutes les tables de contenu ont une clé composée `(patient_id, id)` : **plusieurs personnes accompagnées peuvent partager la même base**, chacune avec sa propre banque modifiable.

### 5.2 Règles portées par la base et l'API

- **Vie privée** : l'API refuse d'écrire tout événement ou échange d'un thème `is_private` ou d'une question `is_private` (et de ses sous-questions), même si la tablette l'envoyait par erreur.
- **Suppression d'une question** : ses sous-questions partent avec (cascade) ; les statistiques passées restent dans `answer_events`.
- **Suppression d'un type** : refusée tant qu'il contient des thèmes.
- **Identifiants de question stables** (`soif.boire.eau`) : ils relient la banque aux statistiques. Les questions générées pour chaque personne (`proches.lea.voir`) n'existent pas en base mais ont leurs statistiques.

### 5.3 Vue `question_stats`

Agrège `answer_events` sur **180 jours glissants** : nombre de fois posée, oui, non, demandes de parole, temps de réponse cumulé. C'est la seule entrée du moteur de recommandation.

---

## 6. Moteur de recommandation

```
score = 0,5 × taux de oui  +  0,3 × usage  +  0,2 × rapidité
        (oui+1)/(posée+2)     posée / max     1 − temps moyen / 8 s
```

- **Taux de oui** (lissé) : une question qui trouve souvent le besoin remonte.
- **Usage** : les questions fréquentes restent accessibles.
- **Rapidité** : une question comprise vite est une question claire.

Effets :
1. **Ordre des questions** dans chaque thème : les questions prioritaires d'abord, puis par score (désactivable dans Réglages).
2. **Accès rapide** : les 5 besoins les plus fréquents, pondérés ×2 s'ils sont habituels à cette heure (± 2 h) et atténués avec l'ancienneté (demi-vie ≈ 5 jours).
3. **Balayage « Tout parcourir »** : les thèmes les plus utilisés d'abord.

Le calcul se fait sur la tablette à partir des statistiques reçues au démarrage : l'ordre s'adapte immédiatement, même hors ligne.

---

## 7. Sécurité et confidentialité

| Sujet | Mesure |
|---|---|
| Images de la caméra | Traitées uniquement dans le navigateur, jamais envoyées ni stockées |
| Accès aux données | Clé d'appareil de 192 bits dans le lien d'installation ; seul son hash SHA-256 est en base ; la clé est retirée de l'adresse dès l'ouverture |
| Appareil perdu | « Générer un nouveau lien » révoque tous les autres appareils |
| Espace admin | Code hashé (scrypt, sel aléatoire) ; session de 8 h dans un cookie `HttpOnly; Secure; SameSite=Strict` signé HMAC-SHA256 ; 8 essais ratés max par 15 min et par adresse IP |
| Vie privée d'Anna | Thèmes et questions « sans historique » : rien n'est écrit, vérifié côté serveur |
| Injection SQL | Requêtes paramétrées uniquement (gabarits du pilote Neon) |
| En-têtes | `Permissions-Policy: camera=(self)`, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff` |
| Secrets | `DATABASE_URL` et `SESSION_SECRET` dans les variables d'environnement Vercel, jamais dans le code |

> **Données de santé (France).** Les besoins exprimés par Anna sont des données de santé. Leur hébergement pour le compte d'un établissement relève de la certification **HDS**. À notre connaissance, Vercel et Neon ne sont pas certifiés HDS : à vérifier avant tout usage réel. Cette architecture convient au hackathon et à un pilote **avec des données fictives**. Pour la production, la base (Postgres standard) et les fonctions (Node standard) se transposent chez un hébergeur certifié HDS sans réécriture.

---

## 8. Gestion

### 8.1 Rôles

| Rôle | Accès | Peut |
|---|---|---|
| **Anna** (tablette reliée) | Clé d'appareil | Répondre, épeler, demander la parole, poser des questions |
| **Entourage** (à côté d'Anna) | Même écran | Toucher un thème, poser les questions « pour aller plus loin » |
| **Soignant référent** | Clé d'appareil + code admin | Lire le résumé et l'historique, éditer la banque, les personnes, le programme, les réglages, changer le code, renouveler le lien |
| **Équipe technique** | Comptes Vercel et Neon | Déployer, migrer le schéma, créer une nouvelle personne (`db:seed`), sauvegarder et restaurer |

Évolution prévue : un compte nominatif par soignant (journal « qui a modifié quoi »), en remplacement du code partagé.

### 8.2 Cycle de vie de la banque de questions

```mermaid
flowchart LR
  S["Seed initial<br/>lib/defaults.js"] --> B[("Banque en base<br/>par personne")]
  B --> U["Utilisation par Anna"]
  U --> E["answer_events"]
  E --> R["Score de recommandation"]
  R --> U
  R --> V["Revue hebdo soignant<br/>onglet Ajouter"]
  N["Besoins « non trouvés »<br/>onglet Résumé"] --> V
  V -- "ajoute / supprime / réordonne" --> B
```

Rituel conseillé : chaque semaine, le soignant référent regarde les besoins **non trouvés** (questions manquantes) et les questions au **score faible** (à reformuler ou supprimer).

### 8.3 Environnements et déploiement

| Environnement | Déclencheur | Base |
|---|---|---|
| Local | `npm run dev:mock` (sans base) ou `vercel dev` | aucune, ou branche Neon de dev |
| Preview | chaque pull request | branche Neon dédiée (option « Preview branching » de l'intégration Neon) |
| Production | fusion sur `main` | base Neon principale |

Migrations : `db/schema.sql` est idempotent ; `npm run db:migrate` avant le déploiement qui en dépend. Toute évolution de schéma passe d'abord sur une branche Neon de preview.

### 8.4 Exploitation

- **Sauvegardes** : restauration à un instant donné de Neon (fenêtre selon le plan) ; export `pg_dump` mensuel conseillé.
- **Supervision** : journaux des fonctions dans Vercel (les erreurs serveur sont journalisées) ; tableau de bord Neon pour la charge.
- **Conservation** : statistiques calculées sur 180 jours ; historique affiché sur 60 jours. À ajouter : purge automatique (Vercel Cron) des échanges au-delà de la durée décidée avec l'établissement.
- **Coût** : plans gratuits Vercel Hobby + Neon Free suffisants pour un pilote (quelques personnes, quelques milliers de réponses par mois).

---

## 9. Limites connues et suite

| Limite | Piste |
|---|---|
| Code admin partagé | Comptes nominatifs + journal des modifications |
| Pas de notification en cas de besoin prioritaire | Notification push ou SMS à l'équipe (Web Push, ou un service certifié santé) |
| Réordonner les questions à la main | Glisser-déposer dans l'onglet Ajouter |
| Modèle MediaPipe chargé depuis Google | L'héberger dans `public/models/` (fichier `.task` de ~3,6 Mo) pour ne dépendre d'aucun tiers |
| Gestes calibrés sur une seule personne | Profils de gestes (amplitude, délais) par personne, voire gestes alternatifs (clignement) |
| Hébergement non HDS | Migration vers un hébergeur certifié HDS avant usage réel |
