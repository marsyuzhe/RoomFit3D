import type {FloorPlan,RoomScene} from './scene';
import {uid} from './scene';
/** Conservative light-gap hypotheses along user-reviewed walls. Never auto-accepted. */
export function openingCandidates(p:FloorPlan,s:RoomScene,data:Uint8ClampedArray){
 const found:{id:string;wallId:string;offset:number;width:number;kind:'door'|'window';accepted:boolean;confidence:number}[]=[];
 for(const wall of s.walls){const dx=wall.end.x-wall.start.x,dz=wall.end.z-wall.start.z,length=Math.hypot(dx,dz),step=Math.max(p.mmPerPixel*2,10);let start=-1,darkness=0,count=0;
  const finish=(at:number)=>{if(start>=0){const width=at-start;if(width>=500&&width<=1900&&start>150&&at<length-150)found.push({id:uid(),wallId:wall.id,offset:(at+start)/2,width:Math.round(width),kind:darkness/Math.max(1,count)>.04?'window':'door',accepted:false,confidence:.35});}start=-1;darkness=0;count=0;};
  for(let t=0;t<=length;t+=step){let dark=0,total=0;for(let j=-2;j<=2;j++){const a=j*wall.thickness/5,x=Math.round((wall.start.x+dx*t/length-dz*a/length-p.position.x)/p.mmPerPixel),y=Math.round((wall.start.z+dz*t/length+dx*a/length-p.position.z)/p.mmPerPixel);if(x<0||x>=p.width||y<0||y>=p.height)continue;const i=(y*p.width+x)*4;dark+=(data[i]+data[i+1]+data[i+2])/3<130?1:0;total++;}const fraction=total?dark/total:1;if(fraction<.4){if(start<0)start=t;darkness+=fraction;count++;}else finish(t);}finish(length);
 }
 return found.slice(0,60);
}
