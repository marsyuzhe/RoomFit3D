import { catalog } from './catalog';
import { addItem, type RoomScene, type Furniture } from './scene';
/** UI color-temperature reference palette, not spectral or calibrated luminaire simulation. */
export function temperatureColor(k:number){
  if(!Number.isFinite(k)||k<1000||k>12000)throw new Error('色温范围为 1000–12000 K / Temperature must be 1000–12000 K');
  const stops:[number,string][]=[[1000,'#ff6a1c'],[2700,'#ffbd80'],[4000,'#ffdfbd'],[6500,'#fff9f2'],[9000,'#d4e4ff'],[12000,'#bfd7ff']];
  const hi=stops.findIndex(s=>s[0]>=k),a=stops[Math.max(0,hi-1)],b=stops[hi],t=a[0]===b[0]?0:(k-a[0])/(b[0]-a[0]);
  return '#'+[1,3,5].map(i=>Math.round(parseInt(a[1].slice(i,i+2),16)*(1-t)+parseInt(b[1].slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
}
export function lengthMm(text:string,unit:'mm'|'cm'|'m'='mm') {
  const m=text.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|m|毫米|厘米|米)?$/i);
  if(!m)throw new Error('请输入数字与单位，例如 120cm / Enter a length such as 120cm');
  const u=m[2]?.toLowerCase()||unit, n=Number(m[1])*({mm:1,cm:10,m:1000,'毫米':1,'厘米':10,'米':1000}[u]??1);
  if(!Number.isFinite(n)||Math.abs(n)>100000)throw new Error('尺寸超出范围 / Length out of range');
  return n;
}
export function validateDimension(f:Furniture,key:string,n:number){
  if(!['width','depth','height'].includes(key))return;
  if(n<=0)throw new Error('尺寸必须为正数 / Length must be positive');
  const c=catalog.find(c=>c.id===f.catalogId);if(!c)return;
  const base=key==='width'?c.w:key==='depth'?c.d:c.h;
  if(n>base*3||n<base*.15)throw new Error('尺寸异常，请核对单位 / Unusual size: check units');
  if((c.family==='desk'||c.family==='table')&&key==='height'&&n>1800)throw new Error('桌高异常，请核对单位 / Unusual desk height');
}
export function attach(s:RoomScene,child:Furniture,parent:Furniture){
  if(child.id===parent.id)throw new Error('Cannot attach to self');
  let p: Furniture|undefined=parent;while(p){if(p.id===child.id)throw new Error('Cyclic support');p=s.furniture.find(q=>q.id===p?.support?.parentId);}
  const a=parent.rotation*Math.PI/180,dx=child.x-parent.x,dz=child.z-parent.z;
  child.support={parentId:parent.id,x:dx*Math.cos(a)-dz*Math.sin(a),z:dx*Math.sin(a)+dz*Math.cos(a),rotation:child.rotation-parent.rotation,offsetY:0};
  syncSupports(s);
}
export function syncSupports(s:RoomScene){
  const visited=new Set<string>();
  function sync(f:Furniture){if(visited.has(f.id))return;visited.add(f.id);if(!f.support)return;const p=s.furniture.find(p=>p.id===f.support!.parentId);if(!p){delete f.support;return;}sync(p);const a=p.rotation*Math.PI/180;f.x=p.x+f.support.x*Math.cos(a)+f.support.z*Math.sin(a);f.z=p.z-f.support.x*Math.sin(a)+f.support.z*Math.cos(a);f.y=p.y+p.height+f.support.offsetY;f.rotation=p.rotation+f.support.rotation;}
  s.furniture.forEach(sync);
}
export function replaceItem(s:RoomScene,item:Furniture,catalogId:string){
  if(item.locked)throw new Error('家具已锁定 / Item is locked');
  const next=addItem(s,catalogId,item.x,item.z);s.furniture.pop();
  Object.assign(item,{catalogId,name:next.name,width:next.width,depth:next.depth,height:next.height,light:next.light?{...next.light,...item.light}:undefined,confidence:'estimated',brand:'',model:'',sourceUrl:''});
  delete item.modules;delete item.assetId;syncSupports(s);
}
