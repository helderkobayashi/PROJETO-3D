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
