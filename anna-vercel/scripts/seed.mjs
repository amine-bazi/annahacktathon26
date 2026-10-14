// Crée une personne accompagnée avec la banque de questions par défaut et affiche son lien d'installation.
// Usage : npm run db:seed -- --name "Anna" [--demo] [--url https://anna.vercel.app]
//   --demo : ajoute des personnes d'exemple (à remplacer dans l'espace soignant)
import { parseArgs } from 'node:util';
import { sql } from '../lib/db.js';
import { newDeviceKey, hashDeviceKey } from '../lib/auth.js';
import { flattenDefaults, slug } from '../lib/content.js';
import { TYPES, THEMES, DEMO_PEOPLE, DEFAULT_PLAN } from '../lib/defaults.js';

const { values } = parseArgs({ options: {
  name: { type: 'string', default: 'Anna' },
  demo: { type: 'boolean', default: false },
  url: { type: 'string', default: process.env.APP_URL || 'http://localhost:3000' },
} });

const key = newDeviceKey();
const [patient] = await sql`INSERT INTO patients (display_name, device_key_hash, daily_plan)
                            VALUES (${values.name}, ${hashDeviceKey(key)}, ${DEFAULT_PLAN}) RETURNING id`;
const pid = patient.id;
const rows = flattenDefaults(TYPES, THEMES);

// Une seule transaction : parents avant enfants (ordre du parcours), tout ou rien.
const queries = [
  ...rows.types.map(t => sql`INSERT INTO question_types (patient_id, id, name, short_label, icon, hue, position)
    VALUES (${pid}, ${t.id}, ${t.name}, ${t.short_label}, ${t.icon}, ${t.hue}, ${t.position})`),
  ...rows.themes.map(t => sql`INSERT INTO themes (patient_id, id, type_id, label, subtitle, icon, is_private, people_kinds, position)
    VALUES (${pid}, ${t.id}, ${t.type_id}, ${t.label}, ${t.subtitle}, ${t.icon}, ${t.is_private}, ${t.people_kinds}, ${t.position})`),
  ...rows.questions.map(q => sql`INSERT INTO questions (patient_id, id, theme_id, parent_id, label, text, kind, ask_text, action, is_urgent, is_private, has_intensity, position)
    VALUES (${pid}, ${q.id}, ${q.theme_id}, ${q.parent_id}, ${q.label}, ${q.text}, ${q.kind}, ${q.ask_text}, ${q.action}, ${q.is_urgent}, ${q.is_private}, ${q.has_intensity}, ${q.position})`),
  ...rows.followups.map(f => sql`INSERT INTO followups (patient_id, theme_id, text, position)
    VALUES (${pid}, ${f.theme_id}, ${f.text}, ${f.position})`),
  ...(values.demo ? DEMO_PEOPLE : []).map((p, i) => sql`INSERT INTO people (patient_id, id, name, role, kind, position)
    VALUES (${pid}, ${slug(p.name)}, ${p.name}, ${p.role}, ${p.kind}, ${i})`),
];
await sql.transaction(queries);

console.log(`\n${values.name} créée (${rows.questions.length} questions, ${rows.themes.length} thèmes).`);
console.log('\nLien d’installation de la tablette (à ouvrir une fois, puis à garder secret) :');
console.log(`  ${values.url.replace(/\/$/, '')}/?cle=${key}\n`);
console.log('Le code soignant sera créé au premier accès à l’espace soignant.');
