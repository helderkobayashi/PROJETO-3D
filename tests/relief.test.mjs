import test from 'node:test';
import assert from 'node:assert/strict';
import {createBinaryMask,traceContours,rasterToRelief,classifyContours,bridgeDiagonalPixels} from '../image-to-stl.js';
function drawing(w,h,predicate,{transparent=false}={}){
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const on=predicate(x,y),k=4*(y*w+x);
    data[k]=data[k+1]=data[k+2]=on?10:255;
    data[k+3]=transparent?(on?255:0):255;
  }
  return {width:w,height:h,data};
}
test('retângulo sólido 100 × 100 × 3 mm',()=>{
 const img=drawing(22,22,(x,y)=>x>=2&&x<20&&y>=2&&y<20);
 const result=rasterToRelief(img,{widthMm:100,depthMm:3});
 assert.equal(result.params.shapeCount,1);
 assert.equal(result.params.holeCount,0);
 assert.equal(result.params.widthMm,100);
 assert.equal(result.params.heightMm,100);
 assert.ok(result.params.vertexCount>=4);
});
test('furo quadrado preservado no relevo',()=>{
 const img=drawing(32,32,(x,y)=>x>=3&&x<29&&y>=3&&y<29&&!(x>=12&&x<20&&y>=12&&y<20));
 const result=rasterToRelief(img,{widthMm:100,depthMm:3});
 assert.equal(result.params.shapeCount,1);
 assert.equal(result.params.holeCount,1);
 assert.equal(result.contours[0].holes.length,1);
});
test('duas ilhas são dois sólidos fechados independentes',()=>{
 const img=drawing(42,30,(x,y)=>(x>=3&&x<13&&y>=3&&y<13)||(x>=24&&x<35&&y>=13&&y<26));
 const result=rasterToRelief(img,{widthMm:100,depthMm:3});
 assert.equal(result.params.shapeCount,2);
});
test('não aceita máscaras sem sólido ou inteiramente preenchidas',()=>{
 assert.throws(()=>rasterToRelief(drawing(32,32,()=>false)),/Nenhuma silhueta/);
 assert.throws(()=>rasterToRelief(drawing(32,32,()=>true)),/inteira/);
});
test('correção de conexão apenas diagonal',()=>{
 const mask=new Uint8Array([1,0,0,1]);
 const n=bridgeDiagonalPixels(mask,2,2);
 assert.equal(n,1);
 assert.equal(mask.reduce((a,b)=>a+b,0),3);
});
test('transparência determina silhueta, independentemente da luminância',()=>{
 const img=drawing(32,32,(x,y)=>x>=5&&x<27&&y>=5&&y<27,{transparent:true});
 const bin=createBinaryMask(img,{invert:true});
 assert.equal(bin.useAlpha,true);
 assert.equal(bin.mask.reduce((a,b)=>a+b,0),22*22);
});
test('inversão da seleção em imagem com fundo opaco',()=>{
 const img=drawing(32,32,(x,y)=>x>=5&&x<27&&y>=5&&y<27);
 const a=createBinaryMask(img,{threshold:120}),b=createBinaryMask(img,{threshold:120,invert:true});
 assert.equal(a.mask.reduce((v,x)=>v+x,0)+b.mask.reduce((v,x)=>v+x,0),32*32);
});
test('rejeita relevo maior que área útil com margem',()=>{
 const img=drawing(40,80,(x,y)=>x>=4&&x<36&&y>=4&&y<76);
 assert.throws(()=>rasterToRelief(img,{widthMm:200,depthMm:3}),/ultrapassará/);
});
test('a escala é feita sobre o objeto recortado, não sobre o fundo branco',()=>{
 const img=drawing(100,100,(x,y)=>x>=30&&x<70&&y>=40&&y<60);
 const r=rasterToRelief(img,{widthMm:100,depthMm:3});
 assert.equal(r.params.widthMm,100);assert.equal(r.params.heightMm,50);
});

// R05: regressões de personagens coloridos e da construção topológica robusta.
import {rasterToIndexedMesh,inspectIndexedMesh} from '../image-to-stl.js';
function signedVolume({positions,indices}){
 let v=0;
 for(let t=0;t<indices.length;t+=3){
  const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3;
  const ax=positions[a],ay=positions[a+1],az=positions[a+2];
  const bx=positions[b],by=positions[b+1],bz=positions[b+2];
  const cx=positions[c],cy=positions[c+1],cz=positions[c+2];
  v+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
 }
 return v;
}

test('R05: sólido com furo tem malha fechada e volume positivo',()=>{
 const img=drawing(40,38,(x,y)=>x>=2&&x<=37&&y>=2&&y<=35&&!(x>14&&x<23&&y>12&&y<27));
 const relief=rasterToRelief(img,{widthMm:100,depthMm:3});
 const indexed=rasterToIndexedMesh(relief);
 const audit=inspectIndexedMesh(indexed);
 assert.deepEqual([audit.nonManifold,audit.degenerate,audit.watertight],[0,0,true]);
 assert.ok(signedVolume(indexed)>0);
 assert.ok(Math.abs(Math.max(...Array.from(indexed.positions).filter((_,i)=>i%3===2))-3)<0.001);
});

test('R05: silhueta de personagem colorido mantém áreas internas brancas',()=>{
 const width=45,height=48,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const k=(y*width+x)*4,body=(x>=9&&x<=34&&y>=8&&y<=39);
  const whiteFace=(x>=16&&x<=28&&y>=17&&y<=25);
  const redHat=(y<15),value=body?(whiteFace?[255,255,255]:redHat?[204,30,30]:[220,90,50]):[255,255,255];
  data[k]=value[0];data[k+1]=value[1];data[k+2]=value[2];data[k+3]=255;
 }
 const image={width,height,data};
 const seg=createBinaryMask(image,{mode:'background',threshold:225});
 assert.equal(seg.mask[20*width+20],1,'parte branca interna deve integrar a silhueta');
 assert.equal(seg.mask[0],0,'fundo externo claro removido');
 const relief=rasterToRelief(image,{mode:'background',threshold:225,widthMm:100,depthMm:3});
 assert.equal(relief.params.holeCount,0);
 assert.equal(inspectIndexedMesh(rasterToIndexedMesh(relief)).watertight,true);
});

test('R05: detalhes em checkerboard são reparados sem arestas abertas',()=>{
 const img=drawing(80,80,(x,y)=>(x>=4&&x<76&&y>=4&&y<76)&&((x+y)%3!==0));
 const relief=rasterToRelief(img,{widthMm:100,depthMm:3,clean:false});
 const audit=inspectIndexedMesh(rasterToIndexedMesh(relief));
 assert.equal(audit.watertight,true);
});

test('R05: preto e branco preserva furos, mas modo fundo claro preenche o interior branco isolado',()=>{
 const img=drawing(30,30,(x,y)=>x>=4&&x<26&&y>=4&&y<26&&!(x>11&&x<19&&y>11&&y<19));
 const dark=rasterToRelief(img,{mode:'dark',widthMm:100,depthMm:3});
 assert.equal(dark.params.holeCount,1);
 const background=rasterToRelief(img,{mode:'background',threshold:225,widthMm:100,depthMm:3});
 assert.equal(background.params.holeCount,0);
});
