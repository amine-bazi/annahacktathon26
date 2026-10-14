import { neon } from '@neondatabase/serverless';

// Client HTTP Neon : une requête = un appel HTTPS, adapté aux Vercel Functions (pas de pool à gérer).
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant : branche une base Neon au projet Vercel.');
export const sql = neon(process.env.DATABASE_URL);
