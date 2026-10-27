import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const html=read('index.html'), js=read('app.js'), css=read('styles.css');
assert.match(html,/<html lang="pt-BR"/);
assert.match(html,/<link rel="stylesheet" href="\/styles\.css\?v=R05\.1"\s*\/>/);
assert.match(html,/<script type="module" src="\/app\.js\?v=R05\.1"><\/script>/);
assert.match(html,/<script type="importmap">/);
assert.ok(!html.includes('<script type="module">'), 'JS deve ficar em app.js');
assert.ok(!html.includes('<style>'), 'CSS deve ficar em styles.css');
const ids=['toast','sidebar','breadcrumb','account-button','dashboard-projects','stat-projects',
  'all-projects','project-search','category-filter','generator-canvas','generator-type',
  'param-length','param-width','param-thickness','param-wall-height','param-clearance',
  'param-text','param-relief','btn-download-scad','btn-download-stl','dropzone',
  'local-stl','stl-canvas','relief-input','relief-mode','relief-view','relief-width','relief-depth','relief-generate','relief-export','library-project-filter','library-revision-filter','library-content'];
for(const id of ids)assert.ok(html.includes(`id="${id}"`),`Elemento ausente: ${id}`);
for(const tab of ['dashboard','projetos','gerador','visualizador','biblioteca','imagem-stl'])
  assert.ok(html.includes(`id="page-${tab}"`),`Página ausente: ${tab}`);
for(const table of ['p3d_projects','p3d_revisions','p3d_parts','p3d_files','p3d_validations'])
  assert.ok(js.includes(`'${table}'`),`Consulta de ${table} não encontrada`);
assert.ok(!/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]\s*['"`]/.test(js), 'Credencial confidencial no JavaScript público');
assert.match(css,/\.library-filters/);
assert.match(css,/\.relief-upload/);
assert.match(html,/<script type="module" src="\/app.js\?v=R05\.1"><\/script>/);
assert.match(js,/image-to-stl\.js\?v=R05\.1/);
assert.match(html,/CONVERSÃO NO DISPOSITIVO · R05\.1/);
assert.ok(existsSync(new URL('../image-to-stl.js',import.meta.url)));
for(const f of ['package.json','vercel.json','.github/workflows/check.yml'])
  assert.ok(existsSync(new URL('../'+f,import.meta.url)),`Arquivo ausente ${f}`);
JSON.parse(read('vercel.json'));
assert.equal(JSON.parse(read('vercel.json')).headers.some(r=>r.headers.some(h=>h.key==='Cache-Control' && h.value.includes('no-cache'))),true, 'Cache-Control deve forçar revalidação');
console.log('OK: arquivos estáticos, referências Supabase, páginas e segurança superficial.');
