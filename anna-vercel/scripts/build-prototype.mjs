// Génère le prototype autonome en un seul fichier HTML, à partir du même code que la version Vercel :
// l'interface (public/), le contenu (lib/defaults.js) et le backend de démo (lib/demo-backend.js),
// qui remplace l'API et garde les données dans le navigateur.
// Usage : npm run build:prototype [-- --out chemin/anna.html]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');
const { values } = parseArgs({ options: { out: { type: 'string', default: 'dist/anna.html' } } });

// Modules ES mis bout à bout, dans l'ordre des dépendances : on retire import/export.
const strip = src => src
  .replace(/^import\s[^;]+;\s*$/gm, '')
  .replace(/^export\s+(?=(const|let|function|class|async)\b)/gm, '');
const modules = ['lib/content.js', 'lib/defaults.js', 'lib/demo-backend.js', 'public/head-tracking.js'];
const demoInit = `
globalThis.ANNA_DEMO = createDemoBackend({
  load: () => { try { return JSON.parse(localStorage.getItem('anna-demo-db')); } catch { return null; } },
  save: db => { try { localStorage.setItem('anna-demo-db', JSON.stringify(db)); } catch { /* stockage indisponible */ } },
});`;
const code = [...await Promise.all(modules.map(async m => `// ---- ${m}\n${strip(await read(m))}`)), demoInit, `// ---- public/app.js\n${strip(await read('public/app.js'))}`].join('\n');

const html = await read('public/index.html');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .split('\n').filter(l => /<title>|fonts\.(googleapis|gstatic)/.test(l)).map(l => l.trim()).join('\n');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/\s*<script type="module" src="\/app\.js"><\/script>\s*/, '\n');
const css = await read('public/styles.css');

// Pas de <html>/<head>/<body> : la page est publiée comme artifact, qui fournit lui-même cette enveloppe.
const out = `${head}
<style>
${css}</style>
${body.trim()}
<script type="module">
${code}
</script>
`;
const target = resolve(new URL('.', root).pathname, values.out);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, out);
console.log(`Prototype généré : ${target} (${Math.round(out.length / 1024)} Ko)`);
