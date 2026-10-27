import {createClient} from '@supabase/supabase-js';

// Public publishable client key, protected by ownership RLS on every p3d_ table.
// Never use a Supabase service_role or secret key in browser code.
const db = createClient('https://rlzjtkgdewmysmnokvhu.supabase.co', 'sb_publishable_GMehc8UbdgdGPUs5H_p30g_K6AnJF2r', {
  auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
});

const $ = id => document.getElementById(id);
const qsa = selector => [...document.querySelectorAll(selector)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cleanUrl = v => /^https:\/\//i.test(String(v||'')) ? esc(String(v)) : '#';
const stageLabel = x => ({IDEIA:'Ideia',EM_DESENVOLVIMENTO:'Em desenvolvimento',EM_TESTES:'Em testes',APROVADO:'Aprovado',ARQUIVADO:'Arquivado'}[x]||x||'Desenvolvendo');
const colors = [ ['#d4e4ff','#9fc1ff'],['#ffe2d8','#ffc3ac'],['#e6e4ff','#c6bbff'],['#d1f8f3','#99e9dc'] ];
const icons = {BRINQUEDO:'🏎️',DECORATIVO:'🏛️',MINIATURA:'🦕',LEMBRANCINHA:'🏷️',OUTROS:'⬡'};
const demoProjects = [
 {id:'demo-pista',code:'EXEMPLO-PISTA',name:'Pista modular · Exemplo',category:'BRINQUEDO',status:'EM_TESTES',description:'Pista segmentada, com rampa, curvas e encaixes.',drive_url:null,revCount:3},
 {id:'demo-torre',code:'EXEMPLO-TORRE',name:'Torre decorativa · Exemplo',category:'DECORATIVO',status:'EM_TESTES',description:'Torre modular em peças separadas por cores.',drive_url:null,revCount:1},
 {id:'demo-marshall',code:'EXEMPLO-MINIATURA',name:'Miniatura articulada · Exemplo',category:'MINIATURA',status:'EM_TESTES',description:'Miniatura com cores e encaixes móveis.',drive_url:null,revCount:2},
 {id:'demo-plaquinhas',code:'EXEMPLO-PLAQUINHA',name:'Plaquinha · Exemplo',category:'LEMBRANCINHA',status:'EM_DESENVOLVIMENTO',description:'Plaquinhas em relevo, cores por camadas.',drive_url:null,revCount:1}
];
let state={user:null,projects:demoProjects,revisions:[],parts:[],files:[],validations:[],page:'dashboard',demo:true};
let liveRenderer=null, modelRenderer=null, meshToExport=null, threeAPI=null, toastTimer=null;
const toast=(s,err=false)=>{const e=$('toast');e.textContent=s;e.style.background=err?'#953e47':'#23375d';e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),4500)};
const plural=(n,s)=>n===1?s:s+'s';

function showPage(page){
  state.page=page;
  qsa('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  qsa('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('breadcrumb').textContent=({dashboard:'Visão geral',projetos:'Meus projetos',gerador:'Gerador 3D',visualizador:'Visualizador STL','imagem-stl':'Imagem para STL',biblioteca:'Arquivos e peças'}[page]||page);
  $('sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});
  if(page==='gerador') setTimeout(()=>initGenerator().catch(e=>toast('Prévia 3D indisponível: '+e.message,true)),60);
  if(page==='imagem-stl') import('./image-to-stl.js').then(m=>m.initImageToStl()).catch(e=>toast('Erro ao abrir Imagem → STL: '+e.message,true));
  if(page==='biblioteca') renderLibrary();
}

const statusChip = p=>`<span class="tag ${p.status==='EM_TESTES'?'testing':p.status==='APROVADO'?'approved':'draft'}">${esc(stageLabel(p.status))}</span>`;
function projectCard(p,i){const [a,b]=colors[i%colors.length];return `<div class="project-card" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Abrir ${esc(p.name)}"><div class="card-art" style="background:linear-gradient(135deg,${a},${b})"><span class="art-icon">${icons[p.category]||icons.OUTROS}</span></div><div class="card-body"><h4>${esc(p.name)}</h4><p>${esc(p.description)}</p><div class="card-meta">${statusChip(p)}<small>${p.revCount ?? 0} ${plural(p.revCount||0,'revisão')}</small></div></div></div>`}
function renderAll(){
  $('stat-projects').textContent=state.projects.length;
  $('stat-revisions').textContent=state.demo?7:state.revisions.length;
  $('stat-parts').textContent=state.demo?8:state.parts.length;
  $('stat-files').textContent=state.demo?13:state.files.length;
  $('sync-label').textContent=state.demo?'Modo demonstração':'Supabase conectado';
  $('sync-label').parentElement.classList.toggle('online',!state.demo);
  $('account-button').textContent=state.user?.email?.charAt(0)?.toUpperCase()||'H';
  $('dashboard-projects').innerHTML=state.projects.slice(0,4).map(projectCard).join('')||'<p class="empty-state">Nenhum projeto cadastrado</p>';
  renderFilteredProjects();
  renderLibrary();
}
function renderFilteredProjects(){const term=$('project-search').value.trim().toLowerCase(),cat=$('category-filter').value;const found=state.projects.filter(p=>(cat==='TODOS'||p.category===cat)&&[p.name,p.code,p.description].join(' ').toLowerCase().includes(term));$('all-projects').innerHTML=found.map(projectCard).join('')||'<p class="empty-state">Nenhum projeto corresponde à busca.</p>'}
function openModal(title,html){$('modal-title').textContent=title;$('modal-body').innerHTML=html;$('modal-overlay').classList.add('open');$('modal-overlay').setAttribute('aria-hidden','false')}
function closeModal(){$('modal-overlay').classList.remove('open');$('modal-overlay').setAttribute('aria-hidden','true')}
async function loadData(){
  if(!state.user){state={...state,projects:demoProjects,revisions:[],parts:[],files:[],validations:[],demo:true};renderAll();return}
  try{
    const [p,r,t,f,v]=await Promise.all([
      db.from('p3d_projects').select('*').order('updated_at',{ascending:false}),
      db.from('p3d_revisions').select('*'),
      db.from('p3d_parts').select('*'),
      db.from('p3d_files').select('*'),
      db.from('p3d_validations').select('*')
    ]);
    for(const x of [p,r,t,f,v]) if(x.error) throw x.error;
    const count=id=>r.data.filter(x=>x.project_id===id).length;
    state={...state,demo:false,projects:p.data.map(x=>({...x,revCount:count(x.id)})),revisions:r.data,parts:t.data,files:f.data,validations:v.data};renderAll();
  }catch(err){toast('Não foi possível ler o banco: '+(err.message||err),true);state.demo=true;state.projects=demoProjects;renderAll()}
}
function openAccount(){
 if(state.user){openModal('Sua conta',`<div class="detail-head"><b>${esc(state.user.email)}</b><p>Conectado ao banco existente TEMON_1700. Os dados do Projetos 3D são isolados por proprietário.</p></div><button class="btn ghost form-submit" id="logout-btn">Sair da conta</button>`);$('logout-btn').onclick=async()=>{await db.auth.signOut();state.user=null;closeModal();await loadData();toast('Sessão encerrada')};return}
 openModal('Entrar em Projetos 3D',`<p style="font-size:12px;line-height:1.7;color:#7a899e">Use sua conta Supabase já cadastrada. A biblioteca pode ser explorada sem login, mas para criar e editar projetos é necessário entrar.</p><form id="login-form"><label class="field-label">E-mail<input type="email" name="email" autocomplete="username" required placeholder="seu@email.com"></label><label class="field-label">Senha<input type="password" name="password" autocomplete="current-password" required placeholder="Senha da conta Supabase"></label><div id="login-error" class="form-message" role="alert"></div><button type="submit" class="btn primary form-submit">Entrar no banco</button></form><p class="help-caption">Não cadastramos senhas nesta aplicação: a autenticação é processada pelo Supabase Auth.</p>`);
 $('login-form').onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);const button=ev.currentTarget.querySelector('button');button.disabled=true;button.textContent='Entrando...';const {data,error}=await db.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});button.disabled=false;button.textContent='Entrar no banco';if(error){$('login-error').textContent=error.message;return}state.user=data.user;closeModal();await loadData();toast('Conectado ao Supabase')};
}
function newProject(){
 if(!state.user){openAccount();toast('Entre para cadastrar um projeto');return}
 openModal('Novo projeto 3D',`<form id="new-project-form"><label class="field-label">Nome do projeto<input name="name" required maxlength="100" placeholder="Ex.: Organizador de ferramentas"></label><label class="field-label">Código único<input name="code" required minlength="3" maxlength="80" placeholder="Ex.: ORGANIZADOR-FERRAMENTAS"></label><label class="field-label">Categoria<select name="category"><option>BRINQUEDO</option><option>DECORATIVO</option><option>MINIATURA</option><option>LEMBRANCINHA</option><option>OUTROS</option></select></label><label class="field-label">Descrição<input name="description" maxlength="300" placeholder="Finalidade, aparência e encaixes"></label><label class="field-label">Pasta no Google Drive (opcional)<input name="drive_url" type="url" placeholder="https://drive.google.com/..."></label><p id="project-error" class="form-message" role="alert"></p><button class="btn primary form-submit" type="submit">Criar no Supabase</button></form>`);
 $('new-project-form').onsubmit=async ev=>{ev.preventDefault();const data=new FormData(ev.currentTarget);const code=String(data.get('code')||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'-');const payload={name:String(data.get('name')).trim(),code,category:data.get('category'),description:String(data.get('description')||'').trim(),drive_url:String(data.get('drive_url')||'').trim()||null,owner_id:state.user.id};if(payload.drive_url&&!/^https:\/\//.test(payload.drive_url))return $('project-error').textContent='Insira um link HTTPS válido.';const {error}=await db.from('p3d_projects').insert(payload);if(error){$('project-error').textContent=error.message;return}closeModal();await loadData();showPage('projetos');toast('Projeto criado com sucesso')};
}
async function openProject(id){
 const p=state.projects.find(x=>String(x.id)===String(id));if(!p)return;
 if(state.demo){openModal(p.name,`<div class="detail-head"><b>${esc(p.code)}</b><p>${esc(p.description)}</p>${statusChip(p)}</div><p class="help-caption">Exibindo dados demonstrativos. Entre para consultar as revisões e peças diretamente no Supabase.</p>`);return}
 const rev=state.revisions.filter(x=>x.project_id===p.id).sort((a,b)=>b.revision.localeCompare(a.revision));
 let html=`<div class="detail-head"><b>${esc(p.code)}</b><p>${esc(p.description)}</p>${statusChip(p)}<p><b>Impressora:</b> ${esc(p.printer_model)}</p>${p.drive_url?`<a target="_blank" rel="noopener" class="link-inline" href="${cleanUrl(p.drive_url)}">Abrir pasta Drive ↗</a>`:''}</div><div class="detail-block"><h4>Revisões (${rev.length})</h4>${rev.length?rev.map(r=>{const parts=state.parts.filter(t=>t.revision_id===r.id),files=state.files.filter(f=>f.revision_id===r.id),checks=state.validations.filter(v=>v.revision_id===r.id);return `<div class="rev-item"><b>${esc(r.revision)} · ${esc(r.stage.replaceAll('_',' '))}</b> ${r.source_drive_url?`<a class="rev-link" href="${cleanUrl(r.source_drive_url)}" rel="noopener" target="_blank">Drive ↗</a>`:''}<small>${esc(r.description)}</small><small>${parts.length} peça(s) · ${files.length} arquivo(s) · ${checks.length} verificação(ões)</small>${files.length?`<details style="margin-top:9px"><summary style="font-size:10px;cursor:pointer;color:#5971dd">Ver arquivos vinculados</summary><div style="display:grid;gap:8px;margin-top:9px">${files.map(f=>`<a href="${cleanUrl(f.file_url)}" target="_blank" rel="noopener" class="link-inline" style="font-size:10px">${esc(f.file_name)} ↗</a>`).join('')}</div></details>`:''}</div>`}).join(''):'<p class="help-caption">Nenhuma revisão ainda.</p>'}</div><button class="btn primary form-submit" id="btn-new-revision">＋ Adicionar revisão</button>`;
 openModal(p.name,html);
 $('btn-new-revision').onclick=()=>openRevisionForm(p);
}
function openRevisionForm(p){openModal('Nova revisão · '+p.name,`<form id="revision-form"><label class="field-label">Código (R01, R02...)<input name="revision" required pattern="R[0-9]{2,3}" placeholder="R01"></label><label class="field-label">Estágio<select name="stage"><option value="PROPOSTA">Proposta</option><option value="MODELO_GERADO">Modelo gerado</option><option value="GEOMETRIA_VERIFICADA">Geometria verificada</option><option value="FATIAMENTO_CONFERIDO">Fatiamento conferido</option><option value="IMPRESSAO_TESTADA">Impressão testada</option></select></label><label class="field-label">Descrição<input name="description" maxlength="300" placeholder="Resumo das alterações"></label><label class="field-label">Link do Drive<input name="source_drive_url" type="url" placeholder="https://drive.google.com/..."></label><p id="revision-error" class="form-message"></p><button class="btn primary form-submit">Cadastrar revisão</button></form>`);
 $('revision-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.currentTarget);const entry={project_id:p.id,revision:String(data.get('revision')).toUpperCase().trim(),stage:data.get('stage'),description:data.get('description'),source_drive_url:data.get('source_drive_url')||null};const {error}=await db.from('p3d_revisions').insert(entry);if(error){$('revision-error').textContent=error.message;return}closeModal();await loadData();toast('Nova revisão registrada')};
}
function renderLibrary(){
 const c=$('library-content');if(!c)return;
 const projectSelect=$('library-project-filter'),revisionSelect=$('library-revision-filter');
 if(state.demo){
  projectSelect.innerHTML='<option value="all">Entre para selecionar projetos</option>';
  revisionSelect.innerHTML='<option value="all">Todas as revisões</option>';
  projectSelect.disabled=true;revisionSelect.disabled=true;
  c.innerHTML='<div class="detail-head"><b>Seus arquivos estão protegidos</b><p>Entre com a conta do Supabase Auth para visualizar os projetos e revisões cadastrados. Os STL continuam no Google Drive.</p></div><p class="empty-state">No modo demonstração, os dados particulares não são exibidos.</p>';
  return;
 }
 projectSelect.disabled=false;revisionSelect.disabled=false;
 const oldP=projectSelect.value||'all',oldR=revisionSelect.value||'all';
 const projects=[...state.projects].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 projectSelect.innerHTML='<option value="all">Todos os projetos</option>'+projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 projectSelect.value=projects.some(p=>p.id===oldP)?oldP:'all';
 const selectedProject=projectSelect.value;
 const eligible=state.revisions.filter(r=>selectedProject==='all'||r.project_id===selectedProject)
   .sort((a,b)=>b.revision.localeCompare(a.revision));
 revisionSelect.innerHTML='<option value="all">Todas as revisões</option>'+eligible.map(r=>{
  const name=projects.find(p=>p.id===r.project_id)?.name||'Projeto';
  return `<option value="${esc(r.id)}">${esc(selectedProject==='all'?name+' · '+r.revision:r.revision)}</option>`;
 }).join('');
 revisionSelect.value=eligible.some(r=>r.id===oldR)?oldR:'all';
 const selectedRev=revisionSelect.value;
 const revisions=eligible.filter(r=>selectedRev==='all'||r.id===selectedRev);
 const revMap=new Map(revisions.map(r=>[r.id,r]));
 const projectMap=new Map(projects.map(p=>[p.id,p]));
 const parts=state.parts.filter(t=>revMap.has(t.revision_id));
 const files=state.files.filter(f=>revMap.has(f.revision_id));
 const checks=state.validations.filter(v=>revMap.has(v.revision_id));
 const cellContext=(rid)=>{
  const r=revMap.get(rid),p=projectMap.get(r?.project_id);
  return {project:p?.name||'—',revision:r?.revision||'—'};
 };
 const tablePart=parts.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Projeto / revisão</th><th>Código</th><th>Peça</th><th>Qtde.</th><th>Dimensões (mm)</th><th>Material</th><th>Cor</th></tr></thead><tbody>${parts.map(t=>{const k=cellContext(t.revision_id);return `<tr><td><b>${esc(k.project)}</b><span class="row-sub">${esc(k.revision)}</span></td><td>${esc(t.code)}</td><td>${esc(t.name)}</td><td>${t.quantity}</td><td>${[t.size_x_mm,t.size_y_mm,t.size_z_mm].filter(n=>n!=null).map(n=>Number(n).toLocaleString('pt-BR')).join(' × ')||'—'}</td><td>${esc(t.material||'—')}</td><td>${esc(t.color||'—')}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="empty-state">Ainda não há peças cadastradas nas revisões selecionadas. Consulte as pastas de origem.</p>';
 const tableFiles=files.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Projeto / revisão</th><th>Arquivo</th><th>Tipo</th><th>Origem</th></tr></thead><tbody>${files.map(f=>{const k=cellContext(f.revision_id);return `<tr><td><b>${esc(k.project)}</b><span class="row-sub">${esc(k.revision)}</span></td><td>${esc(f.file_name)}</td><td>${esc(f.file_format)}</td><td><a href="${cleanUrl(f.file_url)}" target="_blank" rel="noopener noreferrer">Abrir arquivo ↗</a></td></tr>`}).join('')}</tbody></table></div>`:'<p class="empty-state">Ainda não há links individuais cadastrados. Use o link da pasta da revisão.</p>';
 const resultCounts={ok:checks.filter(v=>v.result==='APROVADO').length,pending:checks.filter(v=>v.result==='PENDENTE').length};
 c.innerHTML=`<div class="library-summary"><div><b>${revisions.length}</b><small>Revisões</small></div><div><b>${parts.length}</b><small>Peças</small></div><div><b>${files.length}</b><small>Arquivos</small></div><div><b>${resultCounts.ok}</b><small>Verificações aprovadas</small></div></div>
 <div class="detail-block"><div class="library-head"><h4>Revisões e pastas de origem</h4><span class="subtle">${resultCounts.pending} validações pendentes</span></div>
 ${revisions.length?`<div class="library-revisions">${revisions.map(r=>{const project=projectMap.get(r.project_id);const nFiles=files.filter(f=>f.revision_id===r.id).length;return `<div class="rev-item"><div class="lib-rev-top"><b>${esc(project?.name||'Projeto')} · ${esc(r.revision)}</b><span class="tag">${esc((r.stage||'PROPOSTA').replaceAll('_',' '))}</span></div><small>${esc(r.description||'Sem descrição')}</small><small>${nFiles} arquivos vinculados · ${parts.filter(t=>t.revision_id===r.id).length} peças</small>${r.source_drive_url?`<a href="${cleanUrl(r.source_drive_url)}" class="link-inline" target="_blank" rel="noopener noreferrer">Abrir pasta da revisão no Drive ↗</a>`:''}</div>`}).join('')}</div>`:'<p class="empty-state">Sem revisões cadastradas.</p>'}</div>
 <div class="detail-block"><h4>Peças e dimensões</h4>${tablePart}</div>
 <div class="detail-block"><h4>Arquivos vinculados ao Google Drive</h4>${tableFiles}</div>`;
}

// 3D local preview and STL exporter. These create simplified prototypes, NOT sliced Bambu Studio profiles.
async function getThree(){if(threeAPI)return threeAPI;const [THREE,ctrl,stl,exporter]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js'),import('three/addons/loaders/STLLoader.js'),import('three/addons/exporters/STLExporter.js')]);threeAPI={THREE,OrbitControls:ctrl.OrbitControls,STLLoader:stl.STLLoader,STLExporter:exporter.STLExporter};return threeAPI}
function disposeViewer(v){if(!v)return;v.resizeObserver?.disconnect();v.renderer.dispose();v.container.replaceChildren()}
async function createViewer(container,group,bg=0xeaf0f8){
 const {THREE,OrbitControls}=await getThree();let width=Math.max(container.clientWidth,300),height=Math.max(container.clientHeight,330);
 const scene=new THREE.Scene();scene.background=new THREE.Color(bg);
 const camera=new THREE.PerspectiveCamera(43,width/height,.1,4000);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setSize(width,height);renderer.outputColorSpace=THREE.SRGBColorSpace;
 container.replaceChildren(renderer.domElement);
 const lights=[new THREE.HemisphereLight(0xffffff,0x91a6d1,2.3),new THREE.DirectionalLight(0xffffff,2.4)];lights[1].position.set(130,200,150);scene.add(...lights);
 const grid=new THREE.GridHelper(350,22,0xb5bfd3,0xcbd3e1);grid.position.y=-5;scene.add(grid);
 scene.add(group);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.95;
 function fit(){const box=new THREE.Box3().setFromObject(group);if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());controls.target.copy(center);const diagonal=Math.max(size.length(),35);camera.position.set(center.x+diagonal*.8,center.y+diagonal*.65,center.z+diagonal*1.02);camera.near=.1;camera.far=Math.max(4000,diagonal*40);camera.updateProjectionMatrix();controls.update()}
 fit();let active=true;function tick(){if(!active)return;requestAnimationFrame(tick);controls.update();renderer.render(scene,camera)}tick();
 const resizeObserver=new ResizeObserver(()=>{if(!container.isConnected)return;const w=Math.max(container.clientWidth,200),h=Math.max(container.clientHeight,300);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()});resizeObserver.observe(container);
 return {scene,group,renderer,container,controls,fit,resizeObserver,stop(){active=false;resizeObserver.disconnect();controls.dispose();renderer.dispose()}};
}
function param(){const read=(id,a,b)=>{const n=Number($(id).value);return Math.max(a,Math.min(b,Number.isFinite(n)?n:a))};return {type:$('generator-type').value,L:read('param-length',20,235),W:read('param-width',15,235),B:read('param-thickness',1.6,30),H:read('param-wall-height',3,30),fit:read('param-clearance',.1,.6),text:$('param-text').value.slice(0,22),relief:read('param-relief',.6,5)}}
let rebuildSerial=0;
async function initGenerator(){const serial=++rebuildSerial;
 const p=param();$('track-fields').hidden=p.type!=='track';$('plaque-fields').hidden=p.type!=='plaque';
 $('generator-hint').textContent=p.type==='track'?(p.W===52?'A interface macho/fêmea segue nominalmente o perfil R01/R02; o encaixe depende de testes físicos.':'Atenção: largura diferente de 52 mm pode comprometer a compatibilidade com as pistas R01/R02.'):(p.type==='plaque'?'O relevo textual aparece na fonte SCAD. O STL rápido representa apenas a base; renderize o SCAD para gerar o STL com texto.':'A base é um sólido dimensional; valide o uso pretendido antes da impressão.');
 $('generator-dimensions').textContent=`${p.L} × ${p.W} × ${p.B+(p.type==='track'?p.H:p.type==='plaque'?p.relief:0)} mm`;
 const {THREE}=await getThree();if(serial!==rebuildSerial)return;
 if(modelRenderer){modelRenderer.stop();modelRenderer=null}
 const group=new THREE.Group(),mat1=new THREE.MeshStandardMaterial({color:p.type==='plaque'?0xef9a68:0x5374ed,roughness:.48,metalness:.08}),mat2=new THREE.MeshStandardMaterial({color:0x25c5d8,roughness:.52});
 const add=(sx,sy,sz,x,y,z,material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sz,sy),material);m.position.set(x,y,z);group.add(m)};
 add(p.L,p.W,p.B,0,p.B/2,0,mat1);
 if(p.type==='track')for(const yy of [-p.W/2+1.2,p.W/2-1.2])add(p.L,2.4,p.H,0,p.B+p.H/2,yy,mat2);
 if(p.type==='plaque')add(p.L*.72,p.W*.34,p.relief,0,p.B+p.relief/2,0,mat2);
 meshToExport=group;
 modelRenderer=await createViewer($('generator-canvas'),group);
}
function scadFor(p){
 let pre=`// PROJETOS 3D - TEMON | Fonte parametrica R01\\n// Todas as medidas em milimetros. Impressoes precisam ser validadas.\\n$fn=48;\\ncomprimento=${p.L};\\nlargura=${p.W};\\nbase=${p.B};\\n`;
 pre=pre.replaceAll('\\n','\n');
 if(p.type==='track')return pre+`parede=2.4;\\naltura=${p.H};\\nfolga_por_lado=${p.fit};\\n// Interface nominalmente preservada da Pista Modular R01/R02.\\nmodule macho_2d(){polygon(points=[[0,-4],[3.8,-4],[5,-6],[8.8,-6],[9.5,-5.3],[9.5,5.3],[8.8,6],[5,6],[3.8,4],[0,4]]); }\\nmodule machos(){for(y=[-12,12]) translate([0,y])macho_2d();}\\nmodule femeas(){for(y=[-12,12]) translate([0,y])offset(delta=folga_por_lado)macho_2d();}\\nmodule pista(){difference(){union(){translate([0,-largura/2,0])cube([comprimento,largura,base]);translate([comprimento,0,0])linear_extrude(height=base)machos();translate([0,-largura/2,base])cube([comprimento,parede,altura]);translate([0,largura/2-parede,base])cube([comprimento,parede,altura]);}translate([0,0,-0.15])linear_extrude(height=base+0.3)femeas();}}\\npista();\\n`.replaceAll('\\n','\n');
 if(p.type==='plaque')return (pre+`altura_texto=${p.relief};\\ntexto=\"${p.text.replaceAll('\\','').replaceAll('"','')}\";\\nmodule base_plaque(){linear_extrude(height=base)offset(r=4)offset(delta=-4)square([comprimento,largura],center=true);}\\nunion(){base_plaque();translate([0,0,base])linear_extrude(height=altura_texto)text(texto,size=min(largura*0.36,comprimento/max(3,len(texto))*1.35),halign=\"center\",valign=\"center\",font=\"Liberation Sans:style=Bold\");}\\n`).replaceAll('\\n','\n');
 return (pre+`translate([-comprimento/2,-largura/2,0])cube([comprimento,largura,base]);\\n`).replaceAll('\\n','\n');
}
function downloadBlob(name,data,mime){const b=new Blob([data],{type:mime});const url=URL.createObjectURL(b);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
async function downloadStl(){try{const {STLExporter}=await getThree();if(!meshToExport){await initGenerator()}const exporter=new STLExporter();const result=exporter.parse(meshToExport,{binary:true});downloadBlob('PROJETOS3D_PREVIA_R00.stl',result,'model/stl');toast('STL de prévia baixado — sem encaixes e sem relevo textual. Use o SCAD para modelo final.')}catch(e){toast('Falha ao gerar STL: '+e.message,true)}}
async function fileViewer(file){if(!file||!file.name.toLowerCase().endsWith('.stl')){toast('Selecione um STL válido.',true);return}if(file.size>60*1024*1024){toast('Arquivo acima de 60 MB: teste primeiro no Bambu Studio.',true);return}try{const {THREE,STLLoader}=await getThree();const buffer=await file.arrayBuffer();const geometry=new STLLoader().parse(buffer);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x5675e8,metalness:.08,roughness:.42,side:THREE.DoubleSide}));geometry.computeBoundingBox();const s=new THREE.Vector3();geometry.boundingBox.getSize(s);const group=new THREE.Group();group.add(mesh);if(liveRenderer){liveRenderer.stop();liveRenderer=null} $('stl-canvas').hidden=false;$('file-metrics').hidden=false;$('btn-change-file').hidden=false;$('dropzone').hidden=true;liveRenderer=await createViewer($('stl-canvas'),group);$('file-metrics').innerHTML=`<span>${esc(file.name)}</span><span>${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)} mm</span><span>${geometry.attributes.position.count/3|0} triângulos</span><span>${(file.size/1024/1024).toFixed(2)} MB</span>`;toast('STL carregado localmente.')}catch(e){toast('Não foi possível abrir o STL: '+e.message,true)}}

function attachEvents(){
 qsa('[data-page]').forEach(el=>el.addEventListener('click',()=>showPage(el.dataset.page)));
 $('menu-toggle').onclick=()=>$('sidebar').classList.toggle('open');
 $('account-button').onclick=openAccount;
 qsa('[data-action="new-project"]').forEach(el=>el.onclick=newProject);
 $('modal-close').onclick=closeModal;
 $('modal-overlay').addEventListener('click',ev=>{if(ev.target===$('modal-overlay'))closeModal()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if((e.key==='Enter'||e.key===' ')&&e.target.classList?.contains('project-card')){e.preventDefault();openProject(e.target.dataset.id)}});
 document.addEventListener('click',ev=>{const card=ev.target.closest('.project-card');if(card)openProject(card.dataset.id)});
 $('project-search').oninput=renderFilteredProjects;$('category-filter').onchange=renderFilteredProjects;
 $('library-project-filter').onchange=()=>{$('library-revision-filter').value='all';renderLibrary()};
 $('library-revision-filter').onchange=renderLibrary;
 for(const id of ['generator-type','param-length','param-width','param-thickness','param-wall-height','param-clearance','param-text','param-relief'])$(id).addEventListener('input',()=>{if(state.page==='gerador')initGenerator().catch(e=>toast(e.message,true))});
 $('btn-download-scad').onclick=()=>{const p=param();downloadBlob(`PROJETOS3D_${p.type.toUpperCase()}_FONTE_R01.scad`,scadFor(p),'text/plain');toast('Fonte SCAD parametrizada baixada')};
 $('btn-download-stl').onclick=downloadStl;
 $('dropzone').onclick=()=>$('local-stl').click();$('btn-change-file').onclick=()=>$('local-stl').click();$('local-stl').onchange=ev=>fileViewer(ev.target.files[0]);
 $('dropzone').ondragover=ev=>{ev.preventDefault();$('dropzone').classList.add('drag')};$('dropzone').ondragleave=()=>$('dropzone').classList.remove('drag');$('dropzone').ondrop=ev=>{ev.preventDefault();$('dropzone').classList.remove('drag');fileViewer(ev.dataTransfer.files[0])};
}
async function main(){attachEvents();renderAll();const {data,error}=await db.auth.getSession();if(error)toast('Acesso à sessão indisponível: '+error.message,true);state.user=data?.session?.user||null;await loadData();db.auth.onAuthStateChange((_event,session)=>{if(state.user?.id!==session?.user?.id){state.user=session?.user||null;setTimeout(loadData,0)}})}
main().catch(e=>toast('Falha na inicialização: '+e.message,true));
