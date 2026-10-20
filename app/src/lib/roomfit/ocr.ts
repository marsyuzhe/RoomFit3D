import type {Raster} from './floorplanImage';
import {rasterCanvas} from './floorplanImage';
export interface DimensionCandidate {id:string;raw:string;value:number;unit:'mm'|'cm'|'m'|'unknown';mm:number|null;confidence:number;box:{x0:number;y0:number;x1:number;y1:number};}
export function dimensionCandidate(raw:string,confidence:number,box:DimensionCandidate['box']):DimensionCandidate|null{
 const m=raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?$/i);if(!m)return null;
 const value=Number(m[1].replace(',','.')),unit=(m[2]?.toLowerCase()||'unknown') as DimensionCandidate['unit'];
 if(value<=0||value>100000||unit==='unknown'&&value<50)return null;
 const mm=unit==='unknown'?null:value*({mm:1,cm:10,m:1000}[unit]);if(mm!==null&&(mm<50||mm>100000))return null;
 return {id:crypto.randomUUID(),raw,value,unit,mm,confidence,box};
}
export async function recognizeDimensions(source:Raster,progress:(p:number)=>void,signal?:AbortSignal){
 const {createWorker,PSM}=await import('tesseract.js');
 const base=new URL('/vendor/ocr/',location.href).href;
 const worker=await createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,gzip:false,workerBlobURL:false,logger:m=>progress(Math.round(m.progress*100))});
 const cancel=()=>void worker.terminate();signal?.addEventListener('abort',cancel,{once:true});
 try{
  if(signal?.aborted)throw new Error('OCR cancelled');
  await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,tessedit_char_whitelist:'0123456789.,mMcC ',preserve_interword_spaces:'1'});
  const canvas=await rasterCanvas(source);
  const {data}=await worker.recognize(canvas,{}, {blocks:true,text:true});
  const candidates:DimensionCandidate[]=[];
  for(const block of data.blocks||[])for(const para of block.paragraphs)for(const line of para.lines){
   const full=dimensionCandidate(line.text,line.confidence,line.bbox);if(full){candidates.push(full);continue;}
   for(const word of line.words){const c=dimensionCandidate(word.text,word.confidence,word.bbox);if(c)candidates.push(c);}
  }
  return {text:data.text,candidates:candidates.slice(0,100),engine:'Tesseract.js 7 / tessdata_fast eng (local WASM)',confidence:data.confidence};
 }finally{signal?.removeEventListener('abort',cancel);await worker.terminate().catch(()=>{});}
}
export async function blurScore(source:Raster){const canvas=await rasterCanvas(source),ctx=canvas.getContext('2d')!,p=ctx.getImageData(0,0,canvas.width,canvas.height).data;let n=0,sum=0,sum2=0;const gray=(i:number)=>(p[i*4]+p[i*4+1]+p[i*4+2])/3;for(let y=1;y<canvas.height-1;y+=2)for(let x=1;x<canvas.width-1;x+=2){const i=y*canvas.width+x,v=gray(i-1)+gray(i+1)+gray(i-canvas.width)+gray(i+canvas.width)-4*gray(i);n++;sum+=v;sum2+=v*v;}return n?sum2/n-(sum/n)**2:0;}
