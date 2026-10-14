// Applique db/schema.sql sur la base pointée par DATABASE_URL (idempotent).
// Usage : npm run db:migrate
import { readFile } from 'node:fs/promises';
import { sql } from '../lib/db.js';

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const statements = schema
  .split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  .split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);

for (const s of statements) {
  await sql.query(s);
  console.log('✓', s.split('\n')[0].slice(0, 70));
}
console.log(`\nSchéma appliqué (${statements.length} instructions).`);
