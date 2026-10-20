import * as T from 'three';
import {furnitureModel} from './models';
import type {Furniture,RoomScene} from './scene';
type Part={x:number;y:number;z:number;width:number;depth:number;height:number};
const cache=new Map<string,Part[]>();
export function collisionParts(f:Furniture,assets:RoomScene['assets']){
 const key=JSON.stringify([f.catalogId,f.width,f.depth,f.height,f.modules]);let parts=!f.assetId?cache.get(key):undefined;
 if(!parts){const root=furnitureModel({...f,x:0,y:0,z:0,rotation:0},assets),materials=new Set<T.Material>();root.updateMatrixWorld(true);parts=[];root.traverse(o=>{if(o instanceof T.Mesh){const box=new T.Box3().setFromObject(o),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3());parts!.push({x:c.x*1000,y:box.min.y*1000,z:c.z*1000,width:size.x*1000,depth:size.z*1000,height:size.y*1000});o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});materials.forEach(m=>m.dispose());if(!f.assetId){cache.set(key,parts);if(cache.size>300)cache.delete(cache.keys().next().value!);}}
 const a=f.rotation*Math.PI/180;return parts.map(p=>({...p,x:f.x+p.x*Math.cos(a)+p.z*Math.sin(a),y:f.y+p.y,z:f.z-p.x*Math.sin(a)+p.z*Math.cos(a),rotation:f.rotation}));
}
