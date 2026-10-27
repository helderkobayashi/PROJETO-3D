/**
 * Imagem -> STL: extrusão de silhueta 2D feita 100% no navegador.
 * Não usa IA, não reconstrói superfícies ocultas e não faz upload de imagens.
 * As rotinas puras abaixo são testáveis via Node.js.
 */
const mm = (v) => Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 2});
const byId = id => document.getElementById(id);

/** Se houver fundo transparente usa alfa; caso contrário, limiar de brilho. */
export function createBinaryMask(imageData, options = {}) {
  const {width, height, data} = imageData;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || data.length !== width * height * 4) {
    throw new Error('Dados de imagem inválidos.');
  }
  const threshold = Number(options.threshold ?? 150);
  if (!(threshold >= 10 && threshold <= 245)) throw new Error('Limiar fora do intervalo 10–245.');
  let transparent = 0;
  for (let i=3; i<data.length; i+=4) if (data[i] < 220) transparent++;
  const useAlpha = transparent / (width*height) > 0.002;
  const mask = new Uint8Array(width * height);
  for (let i=0;i<mask.length;i++) {
    const a=data[i*4+3];
    const lum = 0.2126*data[i*4]+0.7152*data[i*4+1]+0.0722*data[i*4+2];
    mask[i] = useAlpha ? (a>=128?1:0) : ((options.invert ? lum>threshold : lum<threshold)?1:0);
  }
  return {mask,width,height,useAlpha};
}

/** Fecha apenas encontros diagonais, que seriam vértices não-manifold no STL. */
export function bridgeDiagonalPixels(mask,width,height){
  const original=mask.slice();
  let bridges=0;
  for (let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){
    const a=y*width+x,b=a+1,c=a+width,d=c+1;
    if(original[a]&&!original[b]&&!original[c]&&original[d]) {if(!mask[b]) {mask[b]=1;bridges++;}}
    else if(!original[a]&&original[b]&&original[c]&&!original[d]) {if(!mask[a]) {mask[a]=1;bridges++;}}
  }
  return bridges;
}

export function removeSmallIslands(mask,width,height,minPixels=8){
  const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),removed={pixels:0,islands:0};
  for(let i=0;i<mask.length;i++){
    if(!mask[i]||seen[i])continue;
    let head=0,tail=0; queue[tail++]=i;seen[i]=1;
    while(head<tail){
      const n=queue[head++],x=n%width,y=Math.floor(n/width);
      const neighbors=[x>0?n-1:-1,x<width-1?n+1:-1,y>0?n-width:-1,y<height-1?n+width:-1];
      for(const j of neighbors){if(j>=0 && mask[j] && !seen[j]){seen[j]=1;queue[tail++]=j;}}
    }
    if(tail<minPixels){removed.islands++;removed.pixels+=tail;for(let k=0;k<tail;k++)mask[queue[k]]=0;}
  }
  return removed;
}

function polygonArea(vertices){let a=0;for(let i=0;i<vertices.length;i++){
  const p=vertices[i],q=vertices[(i+1)%vertices.length];a+=p[0]*q[1]-q[0]*p[1];
}return a/2;}
function trimCollinear(points){
  const result=[];
  for(let i=0;i<points.length;i++){
    const prev=points[(i+points.length-1)%points.length], cur=points[i],next=points[(i+1)%points.length];
    const cross=(cur[0]-prev[0])*(next[1]-cur[1])-(cur[1]-prev[1])*(next[0]-cur[0]);
    if(cross!==0)result.push(cur);
  }
  return result;
}
/**
 * Contornos orientados no sentido horário na coordenada de imagem Y-para-baixo.
 * Cada borda pertence a um pixel opaco; caminhos externos tornam-se anti-horários no XY 3D.
 */
export function traceContours(mask,width,height){
  if(mask.length!==width*height)throw new Error('Máscara de dimensões inconsistentes.');
  const fromMap=new Map(),edges=[];
  const v=(x,y)=>y*(width+1)+x;
  const add=(x1,y1,x2,y2,dir)=>{
    const first=v(x1,y1),end=v(x2,y2),id=edges.length;
    edges.push({start:first,end,dir,used:false});
    if(!fromMap.has(first))fromMap.set(first,[]);
    fromMap.get(first).push(id);
    if(edges.length>180000)throw new Error('Contorno muito complexo. Reduza detalhes ou resolução da imagem.');
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(!mask[y*width+x])continue;
    if(y===0||!mask[(y-1)*width+x])add(x,y,x+1,y,0);
    if(x===width-1||!mask[y*width+x+1])add(x+1,y,x+1,y+1,1);
    if(y===height-1||!mask[(y+1)*width+x])add(x+1,y+1,x,y+1,2);
    if(x===0||!mask[y*width+x-1])add(x,y+1,x,y,3);
  }
  const outlines=[];
  for(const e of edges){
    if(e.used)continue;
    let cur=e,steps=0;
    const points=[];
    while(true){
      if(cur.used)throw new Error('Um contorno apresentou ramificação inválida.');
      cur.used=true;
      const a=cur.start;points.push([a%(width+1),Math.floor(a/(width+1))]);
      if(cur.end===e.start)break;
      const variants=(fromMap.get(cur.end)||[]).filter(i=>!edges[i].used);
      if(!variants.length)throw new Error('Contorno interrompido.');
      variants.sort((i,j)=>{
        const ri=(edges[i].dir-cur.dir+4)%4,rj=(edges[j].dir-cur.dir+4)%4;
        const priority=r=>r===1?0:r===0?1:r===3?2:3;
        return priority(ri)-priority(rj);
      });
      cur=edges[variants[0]];
      if(++steps>edges.length)throw new Error('Limite de contorno excedido.');
    }
    const simplified=trimCollinear(points);
    if(simplified.length>=4 && Math.abs(polygonArea(simplified))>=1)outlines.push(simplified);
    if(outlines.length>350)throw new Error('Muitas ilhas ou furos: simplifique a imagem.');
  }
  return outlines;
}

function pointInPolygon(pt,poly){let odd=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a[1]>pt[1])!==(b[1]>pt[1]) && pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])odd=!odd;
}return odd;}
export function classifyContours(outlines){
  const outers=[],holes=[];
  for(const points of outlines){const area=polygonArea(points);if(area>0)outers.push({points,area,holes:[]});else holes.push({points,area});}
  for(const hole of holes){
    const parent=outers.filter(outer=>pointInPolygon(hole.points[0],outer.points)).sort((a,b)=>a.area-b.area)[0];
    if(!parent)throw new Error('Furo sem perímetro externo válido. Ajuste o recorte.');
    parent.holes.push(hole.points);
  }
  if(!outers.length)throw new Error('Nenhum contorno externo foi encontrado.');
  return outers;
}
export function rasterToRelief(imageData,options={}) {
  const {mask,width,height,useAlpha}=createBinaryMask(imageData,options);
  const bridgeCount=bridgeDiagonalPixels(mask,width,height);
  const cleaned=options.clean===false?{pixels:0,islands:0}:removeSmallIslands(mask,width,height,8);
  if(mask.every(v=>v===0))throw new Error('Nenhuma silhueta encontrada. Ajuste o limiar ou inverta as cores.');
  if(mask.every(v=>v===1))throw new Error('A imagem inteira foi selecionada. Ajuste o limiar ou inverta as cores.');
  const contours=traceContours(mask,width,height);
  const outers=classifyContours(contours);
  const all=contours.flat();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of all){if(p[0]<minX)minX=p[0];if(p[0]>maxX)maxX=p[0];if(p[1]<minY)minY=p[1];if(p[1]>maxY)maxY=p[1];}
  const widthMm=Number(options.widthMm??100),depthMm=Number(options.depthMm??3);
  if(!(widthMm>=10&&widthMm<=245&&depthMm>=1.2&&depthMm<=30))throw new Error('Medidas fora dos intervalos permitidos.');
  const scale=widthMm/(maxX-minX),heightMm=(maxY-minY)*scale;
  if(heightMm>252)throw new Error(`O relevo terá ${mm(heightMm)} mm de altura e ultrapassará a área útil com margem. Reduza a largura.`);
  let vertexCount=0;
  const converted=outers.map(outer=>{
    const cv=poly=>{vertexCount+=poly.length;return poly.map(p=>[(p[0]-minX)*scale-widthMm/2,(maxY-p[1])*scale-heightMm/2]);};
    return {outer:cv(outer.points),holes:outer.holes.map(cv)};
  });
  if(vertexCount>40000)throw new Error('Detalhamento excessivo para conversão no navegador. Simplifique a imagem.');
  return {contours:converted,params:{widthMm,heightMm,depthMm,useAlpha,bridgeCount,cleaned,shapeCount:outers.length,holeCount:outers.reduce((n,o)=>n+o.holes.length,0),vertexCount},mask,maskWidth:width,maskHeight:height};
}

export async function buildReliefMesh(result) {
  const THREE=await import('three');
  const meshes=[];
  for(const item of result.contours){
    const shape=new THREE.Shape(item.outer.map(p=>new THREE.Vector2(...p)));
    for(const hole of item.holes)shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(...p))));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:result.params.depthMm,steps:1,bevelEnabled:false,curveSegments:2});
    geometry.computeVertexNormals();
    meshes.push(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x586cf1,roughness:0.65,metalness:0.04,side:THREE.DoubleSide})));
  }
  const group=new THREE.Group();for(const m of meshes)group.add(m);
  return {THREE,group,meshes};
}

// Valida arestas soldadas por posição; checagem topológica local, não substitui o Bambu Studio.
export function inspectReliefMesh(group,scale=1e5){
  const count=new Map();let degenerate=0,triangles=0;
  group.traverse(o=>{
    if(!o.isMesh)return;
    const g=o.geometry,pos=g.getAttribute('position'),idx=g.index;
    const getKey=i=>[0,1,2].map(c=>Math.round(pos.getComponent(i,c)*scale)).join(',');
    for(let t=0;t<(idx?idx.count:pos.count);t+=3){
      const keys=[0,1,2].map(j=>getKey(idx?idx.getX(t+j):t+j));
      if(new Set(keys).size!==3){degenerate++;continue;}
      triangles++;
      for(let i=0;i<3;i++){
        const pair=[keys[i],keys[(i+1)%3]].sort().join('|');
        count.set(pair,(count.get(pair)||0)+1);
      }
    }
  });
  let nonManifold=0;for(const hits of count.values())if(hits!==2)nonManifold++;
  return {triangles,degenerate,nonManifold,watertight:triangles>0&&degenerate===0&&nonManifold===0};
}

let initialized=false;
export function initImageToStl(){
  if(initialized)return;
  initialized=true;
  const input=byId('relief-input'),zone=byId('relief-upload'),status=byId('relief-status');
  const preview=byId('relief-image'),ctx=preview.getContext('2d',{willReadFrequently:true});
  const generateBtn=byId('relief-generate'),exportBtn=byId('relief-export');
  let raster=null,fileBase='imagem',solid=null,threeRenderer=null,controls=null,frame=0,prepared=null,meshAudit=null;
  const showStatus=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error)};
  const invalidate=()=>{exportBtn.disabled=true;prepared=null;meshAudit=null;};
  function stopRenderer(){
    if(frame)cancelAnimationFrame(frame);frame=0;
    if(controls)controls.dispose();controls=null;
    if(threeRenderer){threeRenderer.dispose();threeRenderer.domElement.remove();threeRenderer=null;}
    if(solid){solid.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});solid=null;}
  }
  async function openFile(file){
    if(!file)return;
    const type=file.type;
    if(!['image/png','image/jpeg','image/webp'].includes(type)) {showStatus('Formato não aceito: envie PNG, JPG ou WebP.',true);return;}
    if(file.size>12*1024*1024){showStatus('A imagem excede o limite de 12 MB.',true);return;}
    invalidate();stopRenderer();generateBtn.disabled=true;
    const objectUrl=URL.createObjectURL(file),img=new Image();
    try{
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Imagem ilegível.'));img.src=objectUrl;});
      if(img.naturalWidth*img.naturalHeight>30e6)throw Error('Imagem muito grande para o processamento local (máximo 30 megapixels).');
      const maxSize=256,ratio=Math.min(1,maxSize/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.max(1,Math.round(img.naturalWidth*ratio)),h=Math.max(1,Math.round(img.naturalHeight*ratio));
      const work=document.createElement('canvas');work.width=w;work.height=h;
      const workCtx=work.getContext('2d',{willReadFrequently:true});
      workCtx.clearRect(0,0,w,h);workCtx.drawImage(img,0,0,w,h);
      raster=workCtx.getImageData(0,0,w,h);fileBase=file.name.replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,60)||'imagem';
      preview.width=w;preview.height=h;ctx.putImageData(raster,0,0);
      generateBtn.disabled=false;
      byId('relief-image-caption').textContent=`${file.name} · ${img.naturalWidth} × ${img.naturalHeight} px · processamento ${w} × ${h} px`;
      showStatus('Imagem carregada. Ajuste o limiar e clique em “Gerar relevo 3D”.');
    }catch(err){raster=null;showStatus(err.message,true);}
    finally{URL.revokeObjectURL(objectUrl);}
  }
  async function createModel(){
    if(!raster)return;
    generateBtn.disabled=true;invalidate();stopRenderer();
    try{
      const options={threshold:Number(byId('relief-threshold').value),invert:byId('relief-invert').checked,clean:byId('relief-clean').checked,
        widthMm:Number(byId('relief-width').value),depthMm:Number(byId('relief-depth').value)};
      if(!Number.isFinite(options.widthMm)||!Number.isFinite(options.depthMm))throw Error('Informe medidas numéricas válidas.');
      prepared=rasterToRelief(raster,options);
      solid=await buildReliefMesh(prepared);
      meshAudit=inspectReliefMesh(solid.group);
      if(!meshAudit.watertight)throw Error(`A malha ainda não está fechada (${meshAudit.nonManifold} arestas irregulares, ${meshAudit.degenerate} triângulos degenerados). Simplifique a imagem.`);
      await render3D(solid);
      const m=prepared.params;
      byId('relief-dimensions').textContent=`${mm(m.widthMm)} × ${mm(m.heightMm)} × ${mm(m.depthMm)} mm`;
      showStatus(`Sólido criado: ${m.shapeCount} região(ões), ${m.holeCount} vazado(s), ${meshAudit.triangles.toLocaleString('pt-BR')} triângulos. Malha topologicamente fechada. ${m.useAlpha?'Recorte por transparência.':'Recorte por brilho.'}`);
      exportBtn.disabled=false;
    }catch(e){invalidate();stopRenderer();showStatus(e.message||String(e),true);}
    finally{generateBtn.disabled=false;}
  }
  async function render3D({THREE,group}){
    const {OrbitControls}=await import('three/addons/controls/OrbitControls.js');
    const host=byId('relief-view');host.textContent='';
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(Math.max(host.clientWidth,100),Math.max(host.clientHeight,300));
    host.appendChild(renderer.domElement);threeRenderer=renderer;
    const scene=new THREE.Scene();scene.add(group);scene.add(new THREE.AmbientLight(0xffffff,2.1));
    const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(50,80,120);scene.add(light);
    const light2=new THREE.DirectionalLight(0xb3baff,1.2);light2.position.set(-70,-40,40);scene.add(light2);
    const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3());
    const largest=Math.max(size.x,size.y,size.z);
    const camera=new THREE.PerspectiveCamera(45,host.clientWidth/Math.max(host.clientHeight,300),0.1,Math.max(1500,largest*20));
    camera.position.set(largest*0.85,-largest*0.95,largest*1.15);camera.lookAt(0,0,size.z/2);
    controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,size.z/2);controls.enableDamping=true;controls.update();
    const draw=()=>{if(!threeRenderer)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(draw)};draw();
    const observer=new ResizeObserver(()=>{
      if(!threeRenderer||!host.isConnected)return;
      const w=Math.max(host.clientWidth,100),h=Math.max(host.clientHeight,300);
      camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);
    });observer.observe(host);
    const originalDispose=renderer.dispose.bind(renderer);
    renderer.dispose=()=>{observer.disconnect();originalDispose();};
  }
  async function exportStl(){
    if(!solid||!prepared||!meshAudit?.watertight)return;
    try{
      const {STLExporter}=await import('three/addons/exporters/STLExporter.js');
      const result=new STLExporter().parse(solid.group,{binary:true});
      const payload=result instanceof DataView ? result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) : result;
      const blob=new Blob([payload],{type:'model/stl'});
      const link=document.createElement('a'),url=URL.createObjectURL(blob);
      link.href=url;link.download=`${fileBase}_RELEVO_${Math.round(prepared.params.widthMm)}MM_R04.stl`;
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      showStatus('STL exportado. Abra no Bambu Studio, confira escala, fechamento e espessuras antes de imprimir.');
    }catch(e){showStatus('Erro ao exportar STL: '+e.message,true);}
  }
  zone.onclick=()=>input.click();
  zone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
  zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag');};
  zone.ondragleave=()=>zone.classList.remove('drag');
  zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');openFile(e.dataTransfer.files[0]);};
  input.onchange=e=>openFile(e.target.files[0]);
  generateBtn.onclick=createModel;exportBtn.onclick=exportStl;
  for(const id of ['relief-width','relief-depth','relief-threshold','relief-invert','relief-clean']){
    const el=byId(id);el.addEventListener('input',()=>{
      if(id==='relief-threshold')byId('relief-threshold-label').textContent=el.value;
      if(prepared){invalidate();showStatus('Parâmetros alterados. Clique em “Gerar relevo 3D” novamente.');}
    });
  }
}
