import { sql } from './db.js';
import { buildBootstrap } from './content.js';

/** Tout ce dont la tablette a besoin au démarrage, en une seule réponse. */
export async function loadBootstrap(patient, isAdmin) {
  const pid = patient.id;
  const [types, themes, questions, followups, people, stats, history] = await Promise.all([
    sql`SELECT id, name, short_label, icon, hue FROM question_types WHERE patient_id = ${pid} ORDER BY position, name`,
    sql`SELECT id, type_id, label, subtitle, icon, is_private, people_kinds FROM themes WHERE patient_id = ${pid} ORDER BY position, label`,
    sql`SELECT id, theme_id, parent_id, label, text, kind, ask_text, action, is_urgent, is_private, has_intensity
        FROM questions WHERE patient_id = ${pid} AND is_active ORDER BY position, created_at`,
    sql`SELECT id, theme_id, text FROM followups WHERE patient_id = ${pid} ORDER BY position, id`,
    sql`SELECT id, name, role, kind, photo FROM people WHERE patient_id = ${pid} ORDER BY position, name`,
    sql`SELECT question_key, asked, yes, no, talk, rt_sum FROM question_stats WHERE patient_id = ${pid}`,
    sql`SELECT c.id, c.theme_id, c.path, c.result, c.questions_count, c.duration_ms, c.is_urgent, c.created_at,
               coalesce(json_agg(json_build_array(n.question, n.answer) ORDER BY n.id) FILTER (WHERE n.id IS NOT NULL), '[]') AS notes
        FROM conversations c LEFT JOIN conversation_notes n ON n.conversation_id = c.id
        WHERE c.patient_id = ${pid} AND c.created_at > now() - interval '60 days'
        GROUP BY c.id ORDER BY c.created_at DESC LIMIT 400`,
  ]);
  return buildBootstrap({ patient, types, themes, questions, followups, people, stats, history, isAdmin });
}

/** Thèmes et questions marqués privés : rien de ce qui les concerne ne doit être écrit. */
export async function privateScopes(patientId) {
  const [themes, questions] = await Promise.all([
    sql`SELECT id FROM themes WHERE patient_id = ${patientId} AND is_private`,
    sql`SELECT id FROM questions WHERE patient_id = ${patientId} AND is_private`,
  ]);
  const themeIds = new Set(themes.map(t => t.id));
  const questionIds = questions.map(q => q.id);
  return {
    theme: id => themeIds.has(id),
    question: key => questionIds.some(q => key === q || key.startsWith(q + '.')),
  };
}
