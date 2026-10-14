-- Schéma Postgres (Neon) de l'application Anna.
-- Idempotent : peut être rejoué sans perte (CREATE ... IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Une ligne par personne accompagnée. La tablette est reliée par une clé d'appareil (seul son hash est stocké).
CREATE TABLE IF NOT EXISTS patients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name     text NOT NULL,
  device_key_hash  text NOT NULL UNIQUE,
  admin_pin_hash   text,
  daily_plan       text NOT NULL DEFAULT '',
  settings         jsonb NOT NULL DEFAULT '{"reco": true, "sens": 1}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Catégories de la colonne de gauche (Besoins, Émotions, Échanger…).
CREATE TABLE IF NOT EXISTS question_types (
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  id           text NOT NULL,
  name         text NOT NULL,
  short_label  text NOT NULL,
  icon         text NOT NULL DEFAULT 'autre',
  hue          int  NOT NULL DEFAULT 220,
  position     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (patient_id, id)
);

-- Thèmes (cases de la grille). people_kinds non nul = thème qui liste aussi des personnes.
CREATE TABLE IF NOT EXISTS themes (
  patient_id    uuid NOT NULL,
  id            text NOT NULL,
  type_id       text NOT NULL,
  label         text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  icon          text NOT NULL DEFAULT 'autre',
  is_private    boolean NOT NULL DEFAULT false,
  people_kinds  text[],
  position      int NOT NULL DEFAULT 0,
  PRIMARY KEY (patient_id, id),
  FOREIGN KEY (patient_id, type_id) REFERENCES question_types(patient_id, id) ON DELETE RESTRICT
);

-- Banque de questions, en arbre (parent_id). kind: question posée à Anna, ou phrase qu'Anna demande/dit.
CREATE TABLE IF NOT EXISTS questions (
  patient_id     uuid NOT NULL,
  id             text NOT NULL,
  theme_id       text NOT NULL,
  parent_id      text,
  label          text NOT NULL,
  text           text NOT NULL,
  kind           text NOT NULL DEFAULT 'question' CHECK (kind IN ('question', 'ask', 'say')),
  ask_text       text,
  action         text CHECK (action IN ('spell', 'planning', 'heure')),
  is_urgent      boolean NOT NULL DEFAULT false,
  is_private     boolean NOT NULL DEFAULT false,
  has_intensity  boolean NOT NULL DEFAULT false,
  position       int NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, id),
  FOREIGN KEY (patient_id, theme_id)  REFERENCES themes(patient_id, id)    ON DELETE CASCADE,
  FOREIGN KEY (patient_id, parent_id) REFERENCES questions(patient_id, id) ON DELETE CASCADE
);

-- Questions « pour aller plus loin » proposées à l'entourage après un besoin exprimé.
CREATE TABLE IF NOT EXISTS followups (
  id          bigserial PRIMARY KEY,
  patient_id  uuid NOT NULL,
  theme_id    text NOT NULL,
  text        text NOT NULL,
  position    int NOT NULL DEFAULT 0,
  FOREIGN KEY (patient_id, theme_id) REFERENCES themes(patient_id, id) ON DELETE CASCADE
);

-- Personnes connues ou croisées (avatars des thèmes Proches / Personnes).
CREATE TABLE IF NOT EXISTS people (
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  id          text NOT NULL,
  name        text NOT NULL,
  role        text NOT NULL DEFAULT '',
  kind        text NOT NULL CHECK (kind IN ('Proches', 'Équipe', 'Rencontres')),
  position    int NOT NULL DEFAULT 0,
  PRIMARY KEY (patient_id, id)
);

-- Un échange abouti (besoin compris, message épelé, demande de parole…). Jamais pour un thème privé.
CREATE TABLE IF NOT EXISTS conversations (
  id               uuid PRIMARY KEY,
  patient_id       uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  theme_id         text NOT NULL,
  path             text[] NOT NULL,
  result           text NOT NULL CHECK (result IN ('resolu', 'non-trouve', 'message', 'parole')),
  questions_count  int NOT NULL DEFAULT 0,
  duration_ms      int NOT NULL DEFAULT 0,
  is_urgent        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_patient_time ON conversations (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_notes (
  id               bigserial PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  question         text NOT NULL,
  answer           text NOT NULL CHECK (answer IN ('oui', 'non')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Chaque réponse d'Anna à une question : la matière première du moteur de recommandation.
CREATE TABLE IF NOT EXISTS answer_events (
  id            bigserial PRIMARY KEY,
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  question_key  text NOT NULL,
  theme_id      text NOT NULL,
  answer        text NOT NULL CHECK (answer IN ('oui', 'non', 'parler')),
  response_ms   int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS answer_events_patient_key ON answer_events (patient_id, question_key);

-- Statistiques par question sur 180 jours glissants (lues par le moteur de recommandation).
CREATE OR REPLACE VIEW question_stats AS
SELECT patient_id,
       question_key,
       count(*) FILTER (WHERE answer IN ('oui', 'non'))                      AS asked,
       count(*) FILTER (WHERE answer = 'oui')                                AS yes,
       count(*) FILTER (WHERE answer = 'non')                                AS no,
       count(*) FILTER (WHERE answer = 'parler')                             AS talk,
       coalesce(sum(response_ms) FILTER (WHERE answer IN ('oui', 'non')), 0) AS rt_sum
FROM answer_events
WHERE created_at > now() - interval '180 days'
GROUP BY patient_id, question_key;

-- Tentatives de connexion à l'espace soignant (limitation des essais).
CREATE TABLE IF NOT EXISTS auth_attempts (
  id          bigserial PRIMARY KEY,
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ip          text NOT NULL,
  ok          boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_recent ON auth_attempts (patient_id, ip, created_at DESC);
