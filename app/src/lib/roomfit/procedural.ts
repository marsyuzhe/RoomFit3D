import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { catalog } from './catalog';
import type { Furniture } from './scene';

/** Component construction in metres. No whole-object nonuniform scaling. */
export function structuredModel(f: Furniture): T.Group {
  const def=catalog.find(c=>c.id===f.catalogId);
  if (!def) throw new Error(`Unknown structured model: ${f.catalogId}`);
  const g=new T.Group(), w=f.width/1000,d=f.depth/1000,h=f.height/1000;
  const features=new Set(def.features), has=(s:string)=>features.has(s);
  const mat=(color:string,kind='paint',metalness=0,roughness=.65)=>{
    const m=new T.MeshStandardMaterial({color,metalness,roughness});m.name=kind;return m;
  };
  const main=mat(f.color),wood=mat(f.color,'wood'),metal=mat('#3a4049','metal',.72,.32),cloth=mat(f.color,'fabric'),dark=mat('#151b24'),white=mat('#e1ded5');
  const glass=mat('#b7d5df','glass',0,.12);glass.transparent=true;glass.opacity=.28;
  const glow=mat(f.light?.color || '#7f52ff','light');
  glow.emissive.set(f.light?.color||'#7f52ff');glow.emissiveIntensity=f.light?.enabled===false?0:(f.light?.intensity??2);
  const mesh=(name:string,geo:T.BufferGeometry,p:number[],m:T.Material)=>{const o=new T.Mesh(geo,m);o.name=name;o.position.set(p[0],p[1],p[2]);o.castShadow=o.receiveShadow=true;g.add(o);return o;};
  const b=(name:string,s:number[],p:number[],m:T.Material=main)=>{const dims=s.map(n=>Math.max(.0005,n)),soft=m===cloth||m===white&&/mattress|pillow|cushion/.test(name);return mesh(name,soft?new RoundedBoxGeometry(dims[0],dims[1],dims[2],3,Math.min(...dims)*.22):new T.BoxGeometry(dims[0],dims[1],dims[2]),p,m);};
  const cyl=(name:string,r:number,height:number,p:number[],m:T.Material=metal,top=r,n=24)=>mesh(name,new T.CylinderGeometry(Math.max(.001,top),Math.max(.001,r),Math.max(.001,height),n),p,m);
  const ball=(name:string,r:number,p:number[],m:T.Material=main)=>mesh(name,new T.SphereGeometry(r,16,10),p,m);
  const rod=(name:string,a:number[],z:number[],r=.012,m:T.Material=metal)=>{const v=new T.Vector3(...a as [number,number,number]),q=new T.Vector3(...z as [number,number,number]),len=v.distanceTo(q);const o=cyl(name,r,len,v.clone().add(q).multiplyScalar(.5).toArray(),m);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.sub(v).normalize());return o;};
  const legs=(top=h,t=.04)=>{for(const x of [-1,1])for(const z of [-1,1])b('leg',[t,top,t],[x*(w/2-t/2),top/2,z*(d/2-t/2)],metal);};
  const panel=(name:string,yy:number,ww=w,dd=d,xx=0,zz=0,m:T.Material=wood)=>b(name,[ww,Math.min(.025,h*.08),dd],[xx,yy,zz],m);
  const drivers=(count:number,xx=0,zz=d/2-.006,yy=h*.55,rr=Math.min(w/count,h)*.23)=>{for(let i=0;i<count;i++){const o=cyl('speaker-driver',rr,.014,[xx+(i-(count-1)/2)*rr*2.5,yy,zz],dark);o.rotation.x=Math.PI/2;const cap=ball('driver-dome',rr*.48,[xx+(i-(count-1)/2)*rr*2.5,yy,zz+.004],metal);cap.scale.z=Math.min(.2,.004/(rr*.48));}};
  switch(def.family){
    case 'pc': {
      b('chassis-floor',[w,.025,d],[0,.0125,0],metal);b('chassis-roof',[w,.025,d],[0,h-.0125,0],metal);
      b('rear-io-panel',[w,h,.02],[0,h/2,-d/2+.01],metal);
      b('side-panel',[.008,h-.05,d-.02],[-w/2+.004,h/2,0],has('glass')?glass:metal);
      b('motherboard-tray',[.012,h*.82,d*.8],[w*.12,h*.5,0],dark);
      b('gpu',[w*.65,h*.12,d*.58],[0,h*.4,0],metal);
      b('power-supply',[w*.8,h*.18,d*.3],[0,h*.13,-d*.3],dark);
      const n=has('triplefan')?3:has('handle')?1:2;
      for(let i=0;i<n;i++){const radius=Math.min(w*.38,h/(n+1)*.42),yy=h*(i+1)/(n+1);const fan=cyl('front-fan',radius,.025,[0,yy,d/2-.025],dark);fan.rotation.x=Math.PI/2;for(let j=0;j<7;j++){const a=j*Math.PI*2/7;rod('fan-blade',[0,yy,d/2-.008],[Math.cos(a)*radius*.8,yy+Math.sin(a)*radius*.8,d/2-.008],radius*.09,has('glass')?glow:metal);}}
      if(has('mesh'))for(let i=0;i<12;i++)b('vent-slot',[w*.85,.005,.004],[0,h*(i+1)/13,d/2-.002],metal);
      if(has('dual'))b('second-chamber',[w*.25,h-.05,d*.9],[w*.36,h/2,0],metal);
      if(has('handle')){b('handle',[w*.65,.015,d*.14],[0,h-.008,0],metal);b('front-switch',[.025,.025,.01],[w*.25,h*.85,d/2-.005],glow);}
      break;
    }
    case 'monitor': {
      const tv=has('tv'), screenH=h*(tv?.91:.77),sy=h-screenH/2;
      b('stand-foot',[w*.5,.018,d],[0,.009,0],metal);b('stand-neck',[w*.065,h*.3,d*.12],[0,h*.16,-d*.18],metal);
      if(has('curved')){for(let i=0;i<18;i++){const x=((i+.5)/18-.5)*w,zz=Math.pow(x/w,2)*d*.48; b('curved-bezel',[w/18,screenH,.018],[x,sy,zz],dark);b('curved-display',[w/18-.001,screenH*.95,.003],[x,sy,zz+.011],glow);}}
      else {b('display-housing',[w,screenH,.035],[0,sy,0],dark);b('display-no-brand',[w*.965,screenH*.95,.003],[0,sy,.019],glow);}
      if(has('hood')){b('hood-roof',[w,.015,d*.6],[0,h-.008,d*.15],metal);for(const side of [-1,1])b('hood-side',[.012,screenH*.5,d*.6],[side*(w/2-.006),h-screenH*.25,d*.15],metal);}
      if(has('speakers'))for(const x of [-1,1])b('integrated-speaker',[w*.12,.025,.012],[x*w*.38,h*.2,.02],metal);
      if(has('vent'))for(let i=0;i<8;i++)b('rear-cooling-fin',[w*.035,screenH*.4,.012],[(i-3.5)*w*.08,sy,-.026],metal);
      if(has('portrait'))b('pivot-disc',[w*.24,w*.24,.018],[0,h*.6,-.025],metal);
      if(has('lift'))b('height-slider',[w*.09,h*.4,.02],[0,h*.3,-d*.22],dark);
      break;
    }
    case 'desk': case 'table': {
      const isDesk=def.family==='desk',round=has('round'),top=has('mirror')||has('hutch')?h*.56:h;
      if(round)cyl('round-tabletop',Math.min(w,d)/2,.03,[0,top-.015,0],wood);
      else {const o=panel('tabletop',top-.0125,w,has('L')?d*.43:d);if(has('L'))o.position.z=-d*.285;if(has('tilted')){o.rotation.x=-.12;o.position.y=top-d*.08-.015;}}
      if(has('L')){panel('return-top',top-.0125,w*.38,d*.57,-w*.31,d*.215);for(const x of [-1,1])b('return-leg',[.05,top-.025,.05],[x*w*.16-w*.31,(top-.025)/2,d*.46],metal);}
      if(has('pedestal')){cyl('pedestal',w*.1,top-.03,[0,(top-.03)/2,0]);cyl('pedestal-base',Math.min(w,d)*.34,.035,[0,.0175,0]);}
      else if(has('C')){b('cantilever-spine',[.04,top,d],[ -w/2+.02,top/2,0],metal);panel('floor-foot',.0125,w,d,0,0,metal);}
      else if(has('wall')){for(const side of [-1,1])rod('folding-brace',[side*w*.35,top-.03,-d*.45],[side*w*.35,top*.6,d*.25]);b('wall-rail',[w,.08,.025],[0,top-.06,-d/2+.0125],metal);}
      else if(has('standing')){for(const side of [-1,1]){b('lifting-column',[.08,top-.03,.08],[side*w*.36,(top-.03)/2,0],metal);b('T-foot',[.1,.045,d],[side*w*.36,.0225,0],metal);b('column-sleeve',[.09,top*.4,.09],[side*w*.36,top*.25,0],white);}}
      else if(has('tripod'))for(let i=0;i<3;i++){const a=i*2*Math.PI/3;rod('tripod-leg',[0,top-.03,0],[Math.cos(a)*w*.4,.045,Math.sin(a)*d*.4],.025,wood);}
      else {if(has('L')){for(const x of [-1,1])for(const z of [-d/2+.025,-d*.07-.025])b('back-desk-leg',[.045,top-.025,.045],[x*(w/2-.025),(top-.025)/2,z],metal);}else legs(top-.025,Math.min(.045,w*.06,d*.06));if(has('double'))b('central-support',[.06,top-.025,d*.75],[0,(top-.025)/2,0],metal);}
      if(has('trestle'))for(const side of [-1,1]){b('trestle-crossbar',[.06,.06,d],[side*w*.37,top*.25,0],wood);rod('trestle-brace',[side*w*.37,.05,-d*.4],[side*w*.37,top-.04,0],.02,wood);}
      if(has('tray'))b('under-top-cable-tray',[w*.68,.07,.14],[0,top-.09,-d*.27],metal);
      if(has('drawer')){b('drawer-carcass',[w*.28,top*.2,d*.8],[-w*.3,top*.77,0],wood);b('drawer-pull',[w*.1,.014,.018],[-w*.3,top*.77,d*.41],metal);}
      if(has('cubby')||has('shelf'))panel('under-shelf',top*.35,has('L')?w*.34:w*.87,has('L')?d*.5:d*.8,has('L')?-w*.31:0,has('L')?d*.2:0);
      if(has('apron'))for(const z of [-1,1])b('apron',[w-.08,.09,.02],[0,top-.075,z*(d/2-.035)],wood);
      if(has('extension')){panel('extension-leaf',top-.015,w*.2,d*.99);for(const x of [-1,1])b('leaf-seam',[.003,.003,d],[x*w*.1,top-.003,0],metal);}
      if(has('drop'))for(const side of [-1,1]){rod('drop-leaf-brace',[side*w*.3,top*.6,0],[side*w*.46,top-.03,0]);b('hinge',[.015,.005,d*.9],[side*w*.27,top-.003,0],metal);}
      if(has('cross')){rod('cross-brace',[-w*.4,.1,0],[w*.4,top-.1,0]);rod('cross-brace',[w*.4,.1,0],[-w*.4,top-.1,0]);}
      if(has('nest')){const o=cyl('lower-nesting-top',Math.min(w*.28,d*.36),.025,[w*.2,top*.55,0],wood);for(const side of [-1,1])b('nest-leg',[.025,top*.55,.025],[w*.2+side*w*.16,top*.275,0],metal);}
      if(has('lift')){b('storage-box',[w*.9,top*.4,d*.85],[0,top*.4,0],wood);for(const side of [-1,1])rod('lift-hinge',[side*w*.3,top*.5,-d*.2],[side*w*.3,top-.04,d*.1]);}
      if(has('mirror')){b('mirror-frame',[w*.65,h*.4,.04],[0,h*.8,-d*.4],wood);b('mirror-glass',[w*.6,h*.35,.005],[0,h*.8,-d*.375],metal);}
      if(has('hutch')){for(const side of [-1,1])b('hutch-side',[.025,h-top,d*.55],[side*(w/2-.0125),(h+top)/2,-d*.22],wood);panel('hutch-shelf',h-.0125,w,d*.55,0,-d*.22);}
      break;
    }
    case 'chair': {
      const bench=has('bench')||has('ottoman'),seatY=bench?h*.78:has('bar')?h*.72:has('rig')?h*.35:h*.43;
      if(has('casters')){cyl('gas-lift',w*.045,seatY*.78,[0,seatY*.43,0]);for(let i=0;i<5;i++){const a=i*2*Math.PI/5;rod('star-base',[0,.09,0],[Math.cos(a)*w*.4,.065,Math.sin(a)*d*.4],.025);const wheel=cyl('caster',.03,.025,[Math.cos(a)*w*.4,.03,Math.sin(a)*d*.4],dark);wheel.rotation.z=Math.PI/2;}}
      else if(has('cantilever'))for(const side of [-1,1]){rod('sled-base',[side*w*.42,.02,-d*.4],[side*w*.42,.02,d*.4]);rod('sled-upright',[side*w*.42,.02,d*.4],[side*w*.42,seatY,d*.25]);}
      else legs(seatY,.03);
      if(has('slats'))for(let i=0;i<7;i++)b('seat-slat',[w/7-.008,.045,d],[(i-3)*w/7,seatY,0],wood);
      else b(has('saddle')?'saddle-seat':'seat',[w*.9,Math.min(.09,h*.16),d*(has('rig')?.45:.78)],[0,seatY,has('rig')?d*.14:0],cloth);
      if(!bench&&!has('saddle')&&!has('kneeling')){
        if(has('mesh'))for(let i=0;i<14;i++)b('mesh-back-web',[w*.76,.012,.018],[0,seatY+(h-seatY)*(i+1)/15,-d*.28],cloth);
        else if(has('spindle')||has('wishbone')){for(let i=0;i<(has('wishbone')?2:6);i++)rod('back-spindle',[(i-(has('wishbone')?.5:2.5))*w*.1,seatY,-d*.32],[has('wishbone')?0:(i-2.5)*w*.1,h-.03,-d*.32],.014,wood);b('back-crest',[w,.04,.04],[0,h-.02,-d*.32],wood);}
        else b('backrest',[w*.82,(h-seatY)*.9,.06],[0,(h+seatY)/2,-d*.3],cloth);
        if(has('headrest'))b('headrest',[w*.45,h*.12,.09],[0,h*.93,-d*.3],cloth);
        if(has('wing'))for(const side of [-1,1])b('side-wing',[w*.12,h*.32,.12],[side*w*.42,h*.73,-d*.23],cloth);
      }
      if(has('arms'))for(const side of [-1,1]){rod('arm-support',[side*w*.43,seatY,0],[side*w*.43,seatY+h*.16,0]);b('arm-pad',[w*.1,.035,d*.48],[side*w*.43,seatY+h*.17,0],dark);}
      if(has('footrest')){b('footrest-pad',[w*.7,.07,d*.28],[0,seatY*.75,d*.34],cloth);for(const side of [-1,1])rod('footrest-rail',[side*w*.2,seatY*.7,-d*.1],[side*w*.2,seatY*.7,d*.35]);}
      if(has('rocker'))for(const side of [-1,1])for(let j=0;j<8;j++)rod('rocker-rail',[side*w*.4,.05+Math.pow((j-4)/4,2)*.04,(j/8-.5)*d*.95],[side*w*.4,.05+Math.pow((j-3)/4,2)*.04,((j+1)/8-.5)*d*.95],.02,wood);
      if(has('rig')){b('cockpit-floor',[w,.04,d],[0,.02,0],metal);b('pedal-plate',[w*.6,.06,d*.2],[0,.16,d*.38],metal);rod('wheel-post',[0,.08,d*.2],[0,h*.7,d*.2],.03);const wheel=cyl('steering-wheel',w*.24,.04,[0,h*.75,d*.2],dark);wheel.rotation.x=Math.PI/2;}
      if(has('kneeling')){b('knee-pad',[w*.7,.08,d*.3],[0,h*.35,d*.25],cloth);rod('inclined-frame',[-w*.3,.05,d*.4],[w*.3,h*.7,-d*.3],.025,wood);}
      if(has('ring')){const ring=mesh('foot-ring',new T.TorusGeometry(w*.32,.015,8,32),[0,h*.22,0],metal);ring.rotation.x=Math.PI/2;}
      if(has('tufted'))for(let i=0;i<6;i++)ball('upholstery-button',.012,[(i-2.5)*w*.13,seatY+.05,0],dark);
      break;
    }
    case 'cabinet': {
      const cols=f.modules?.cols??Number(def.features.find(x=>/^cols/.test(x))?.slice(4)||1),rows=f.modules?.rows??Number(def.features.find(x=>/^rows/.test(x))?.slice(4)||2),t=Math.min(.02,w/(cols*8),h/(rows*8)),base=has('legs')||has('casters')?.09:0;
      b('cabinet-back',[w,h-base,t],[0,(h+base)/2,-d/2+t/2],wood);
      for(let i=0;i<=cols;i++)b('vertical-divider',[t,h-base,d],[-w/2+t/2+i*(w-t)/cols,(h+base)/2,0],wood);
      for(let i=0;i<=rows;i++)b('horizontal-shelf',[w,t,d],[0,base+t/2+i*(h-base-t)/rows,0],wood);
      if(base)for(const x of [-1,1])for(const z of [-1,1])cyl(has('casters')?'cabinet-caster':'cabinet-leg',.025,base,[x*w*.4,base/2,z*d*.35]);
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const cw=(w-t)/cols-t,ch=(h-base-t)/rows-t,x=-w/2+t+cw/2+col*(w-t)/cols,y=base+t+ch/2+row*(h-base-t)/rows;
        if(has('open')||has('media')&&(row===1||row===2)&&col===1)continue;
        b(has('drawers')||has('drawer')?'drawer-front':'door-panel',[cw,ch,.018],[x,y,d/2-(has('slats')||has('baskets')?.018:.009)],has('glass')?glass:has('locker')?metal:wood);
        b('handle',[Math.min(.12,cw*.4),.012,.025],[x,y,d/2-.012],metal);
        if(has('drawers')||has('drawer')){b('drawer-bottom',[cw*.95,.012,d*.8],[x,y-ch*.4,0],wood);for(const side of [-1,1])b('drawer-side',[.012,ch*.7,d*.8],[x+side*cw*.46,y,0],wood);}
        if(has('slats')||has('baskets'))for(let i=0;i<7;i++)b('front-slat',[cw*.08,ch*.9,.008],[x+(i-3)*cw*.13,y,d/2-.004],wood);
        if(has('locker'))for(let i=0;i<4;i++)b('locker-vent',[cw*.6,.006,.004],[x,y+ch*.22+i*.012,d/2-.002],dark);
        if(has('tilt'))b('tilt-seam',[cw*.85,.008,.004],[x,y+ch*.3,d/2-.002],dark);
        if(has('sliding'))b('sliding-track',[w,.008,.008],[0,base+t*.6,d/2-.005],metal);
      }
      if(has('rail'))rod('clothes-rail',[-w*.45,h*.85,0],[w*.45,h*.85,0],.014);
      if(has('chest')||has('bench'))panel('hinged-lid',h-.0125,w,d,0,0,has('cushion')?cloth:wood);
      break;
    }
    case 'bed': {
      const tall=has('bunk')||has('loft'),level=tall?h*.65:has('platform')?h*.35:h*.2,mh=Math.min(.22,h*.2);
      for(const x of [-1,1])for(const z of [-1,1])b('bed-leg',[.055,has('canopy')||tall?h:level,.055],[x*(w/2-.0275),(has('canopy')||tall?h:level)/2,z*(d/2-.0275)],has('metal')?metal:wood);
      b('bed-frame',[w,.12,d],[0,level,0],wood);b('mattress',[w-.06,mh,d-.1],[0,level+.06+mh/2,0],white);b('duvet',[w-.04,.045,d*.65],[0,level+.06+mh+.0225,d*.12],cloth);
      for(const x of [-1,1])b('pillow',[w*.35,.09,d*.18],[x*w*.23,level+.1+mh,-d*.32],white);
      if(has('spindle')||has('metal')){for(let i=0;i<9;i++)b('headboard-spindle',[.02,h*.65,.025],[(i-4)*w*.1,h*.6,-d/2+.02],has('metal')?metal:wood);b('headboard-crest',[w,.04,.04],[0,h-.02,-d/2+.02],wood);}
      else b('headboard',[w,h-(has('platform')?h*.15:.08),.06],[0,(h+(has('platform')?h*.15:.08))/2,-d/2+.03],cloth);
      if(has('drawers'))for(const side of [-1,1])for(let i=0;i<2;i++){b('bed-drawer',[.02,level*.8,d*.38],[side*(w/2-.01),level*.48,(i-.5)*d*.44],wood);b('drawer-pull',[.02,.02,d*.15],[side*(w/2-.01),level*.5,(i-.5)*d*.44],metal);}
      if(has('lift')){b('storage-base',[w-.03,level*.75,d-.05],[0,level*.4,0],wood);rod('lift-piston',[-w*.4,level*.6,0],[-w*.4,level+.04,d*.25],.012);}
      if(has('bunk')){b('lower-mattress',[w-.06,.16,d-.1],[0,h*.2,0],white);for(const z of [-1,1])b('upper-guard',[w,.1,.035],[0,h*.9,z*(d/2-.02)],wood);}
      if(has('loft'))panel('under-bed-desk',h*.38,w-.06,d*.4,0,-d*.27);
      if(tall){for(const side of [-1,1])rod('ladder-upright',[side*w*.18,.02,d*.48],[side*w*.18,h*.8,d*.48],.018,wood);for(let i=1;i<7;i++)rod('ladder-rung',[-w*.18,h*.8*i/7,d*.48],[w*.18,h*.8*i/7,d*.48],.014,wood);}
      if(has('canopy')){for(const z of [-1,1])b('canopy-crossrail',[w,.04,.04],[0,h-.02,z*(d/2-.02)],wood);for(const x of [-1,1])b('canopy-longrail',[.04,.04,d],[x*(w/2-.02),h-.02,0],wood);}
      if(has('day'))for(const side of [-1,1])b('daybed-end',[.06,h*.7,d],[side*(w/2-.03),h*.65,0],cloth);
      if(has('trundle')){b('pullout-frame',[w*.92,.11,d*.95],[0,.12,0],wood);for(const z of [-1,1])cyl('trundle-wheel',.025,.02,[0,.025,z*d*.4]);}
      if(has('sleigh')){for(const z of [-1,1]){const o=b('curved-end-cap',[w,.1,.12],[0,z<0?h-.08:level+.25,z*(d/2-.1)],wood);o.rotation.x=z*.3;}}
      if(has('tufted'))for(let i=0;i<7;i++)ball('headboard-button',.012,[(i-3)*w*.12,h*.73,-d/2+.065],dark);
      break;
    }
    case 'sofa': {
      const seats=has('two')?2:3,base=h*.22,seat=h*.46;
      b('sofa-base',[w,base,d],[0,base/2+.08,0],wood);
      for(const x of [-1,1])for(const z of [-1,1])b('sofa-foot',[.07,.08,.07],[x*w*.42,.04,z*d*.4],metal);
      for(let i=0;i<seats;i++){b('seat-cushion',[w/seats-.035,.16,d*.68],[(i-(seats-1)/2)*w/seats,seat,has('chaise')||has('corner')?-d*.15:0],cloth);b('back-cushion',[w/seats-.035,h*.5,.16],[(i-(seats-1)/2)*w/seats,h*.73,-d/2+.08],cloth);}
      if(!has('modular'))for(const side of [-1,1])b('armrest',[w*.075,h*.6,d],[side*(w/2-w*.0375),h*.44,0],cloth);
      if(has('chaise')||has('corner'))b('extended-chaise',[w*.32,.18,d*.65],[-w*.3,seat,d*.175],cloth);
      if(has('corner'))b('return-back',[.16,h*.5,d*.7],[-w/2+.08,h*.73,d*.15],cloth);
      if(has('futon')){b('fold-hinge',[w*.85,.025,.03],[0,seat+.1,0],metal);for(const x of [-1,1])rod('folding-brace',[x*w*.4,.08,d*.3],[x*w*.4,h*.8,-d*.4]);}
      break;
    }
    case 'arm': {
      cyl('desk-clamp',w*.055,.06,[-w*.3,.03,0]);rod('vertical-post',[-w*.3,.06,0],[-w*.3,h*.92,0],.018);
      const count=has('dual')?2:1;for(let i=0;i<count;i++){const end=count===2?(i===0?-w*.44:w*.44):w*.4;rod('lower-arm',[-w*.3,h*.35,0],[0,h*.65,-d*.3],.02);rod('upper-arm',[0,h*.65,-d*.3],[end,h*.9,d*.2],.018);ball('pivot-joint',.028,[0,h*.65,-d*.3],metal);b('vesa-plate',[.09,.09,.012],[end,h*.9,d*.2],metal);}
      if(has('microphone')){const o=cyl('mic-capsule',.035,h*.18,[w*.4,h*.8,d*.2],dark);o.rotation.z=.3;}
      break;
    }
    case 'audio': {
      if(has('mic')){for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod('tripod',[0,h*.35,0],[Math.cos(a)*w*.4,.015,Math.sin(a)*d*.4]);}cyl('mic-body',w*.18,h*.6,[0,h*.68,0],dark);}
      else {const count=has('pair')?2:1;for(let i=0;i<count;i++){const x=(i-(count-1)/2)*w*.6; b('audio-enclosure',[w*(count===2?.38:1),h,Math.max(.01,d-.04)],[x,h/2,-.02],main);drivers(has('bar')?4:has('interface')?2:1,x,d/2-.016,h*.6,Math.min(w/(count*3),h*.28));if(has('sub')){const p=cyl('bass-reflex-port',w*.09,.018,[0,h*.18,d/2-.010],dark);p.rotation.x=Math.PI/2;}if(has('interface'))for(let j=0;j<3;j++){const k=cyl('gain-control',.012,.02,[(j-1)*w*.2,h*.3,d/2-.01],metal);k.rotation.x=Math.PI/2;}}}
      break;
    }
    case 'peripheral': {
      if(has('keyboard')){b('keyboard-deck',[w,h*.55,d],[0,h*.275,0],metal);for(let row=0;row<5;row++)for(let col=0;col<15;col++)b('keycap',[w/17,h*.45,d/6],[(col-7)*w/16,h*.77,(row-2)*d/5.4],col%4?dark:main);}
      else if(has('mouse')){const o=ball('mouse-shell',.5,[0,h*.5,0],main);o.scale.set(w,h,d);b('button-split',[.001,h*.1,d*.4],[0,h*.93,-d*.15],dark);cyl('scroll-wheel',w*.06,h*.18,[0,h*.93,-d*.16],metal);}
      else if(has('mat')){b('desk-mat',[w,h,d],[0,h/2,0],cloth);for(const z of [-1,1])b('stitched-edge',[w,h*.3,.003],[0,h*.85,z*(d/2-.002)],white);}
      else if(has('controller')){for(const side of [-1,1]){const o=ball('controller-grip',.5,[side*w*.28,h*.48,d*.08],main);o.scale.set(w*.43,h*.9,d*.85);cyl('analog-stick',w*.07,h*.25,[side*w*.2,h*.8,-d*.05],dark);}b('central-bridge',[w*.55,h*.6,d*.5],[0,h*.5,-d*.15],main);}
      else if(has('headphones')){cyl('stand-base',Math.min(w,d)*.45,.02,[0,.01,0]);rod('headphone-post',[0,.02,0],[0,h*.8,0]);for(const side of [-1,1])b('ear-cushion',[w*.22,h*.32,d*.5],[side*w*.35,h*.6,0],cloth);rod('headband',[-w*.35,h*.79,0],[0,h*.94,0],.016);rod('headband',[0,h*.94,0],[w*.35,h*.79,0],.016);}
      else {cyl('vr-base',Math.min(w,d)*.45,.025,[0,.0125,0]);rod('vr-support',[0,.025,0],[0,h*.72,0]);b('headset-body',[w,h*.3,d*.6],[0,h*.82,0],dark);for(const side of [-1,1])cyl('lens',w*.16,.02,[side*w*.23,h*.8,-d*.2],glass);}
      break;
    }
    case 'rgb': {
      if(has('strip')||has('screenbar')){b('aluminium-channel',[w,h,d*.5],[0,h/2,-d*.25],metal);b('diffuser',[w,h*.8,d*.5],[0,h/2,d*.25],glow);for(const side of [-1,1])b('end-cap',[w*.01,h,d],[side*w*.495,h/2,0],metal);if(has('screenbar'))b('monitor-hook',[w*.12,h*.6,d],[0,h*.4,0],metal);}
      else if(has('corner')){cyl('floor-base',Math.min(w,d)/2,.03,[0,.015,0]);rod('LED-upright',[0,.03,0],[0,h,0],.012,glow);}
      else {const n=has('hex')?6:3;for(let i=0;i<n;i++){const x=(i%(n===6?3:2)-1)*w*.29,y=h*.28+Math.floor(i/(n===6?3:2))*h*.43;const o=cyl('modular-light-panel',Math.min(w*.17,h*.23),d,[x,y,0],glow,Math.min(w*.17,h*.23),has('hex')?6:3);o.rotation.x=Math.PI/2;}}
      break;
    }
    case 'lamp': {
      const ceiling=def.placement==='ceiling',wall=has('wall'),shadeY=ceiling?h*.3:h*.86;
      if(!ceiling&&!wall){cyl('lamp-base',Math.min(w,d)*.32,.035,[0,.0175,0]);if(has('tripod'))for(let i=0;i<3;i++){const a=i*2*Math.PI/3;rod('tripod-leg',[0,h*.8,0],[Math.cos(a)*w*.43,.02,Math.sin(a)*d*.43],.018,wood);}else rod('lamp-stem',[0,.03,0],[has('arc')?w*.34:0,h*.84,0],.014);}
      if(ceiling)rod('suspension',[0,h,0],[0,shadeY,0],.008);
      if(has('chandelier')||has('spots')){const n=has('spots')?3:6;for(let i=0;i<n;i++){const a=i*Math.PI*2/n,x=has('spots')?(i-1)*w*.35:Math.cos(a)*w*.36,z=has('spots')?0:Math.sin(a)*d*.36;rod('lamp-arm',[0,h*.55,0],[x,h*.35,z]);cyl('lamp-head',Math.min(w/n,d)*.3,h*.2,[x,h*.25,z],glow);}}
      else {const r=Math.min(w,d)*.45;cyl('shade',r,h*.22,[has('arc')?w*.2:0,shadeY,0],white,has('mushroom')?r*.35:r*.75);cyl('diffuser',r*.75,.008,[has('arc')?w*.2:0,shadeY-h*.1,0],glow);}
      if(has('task')){rod('lower-elbow',[0,.04,0],[-w*.3,h*.5,0]);rod('upper-elbow',[-w*.3,h*.5,0],[0,h*.85,0]);ball('hinge',.025,[-w*.3,h*.5,0],metal);}
      if(has('wall'))b('wall-plate',[w,.035,d],[0,h*.5,0],metal);
      if(has('paper'))for(let i=0;i<12;i++){const ring=mesh('paper-rib',new T.TorusGeometry(Math.min(w,d)*.44,.002,6,32),[0,h*(.2+i*.045),0],wood);ring.rotation.x=Math.PI/2;}
      break;
    }
    case 'appliance': {
      b('appliance-body',[w,h,has('washer')?d-.04:d],[0,h/2,has('washer')?-.02:0],white);
      if(has('fridge')){for(const yy of [.3,.8])b('refrigerator-handle',[.025,h*.15,.025],[w*.38,h*yy,d/2-.0125],metal);b('freezer-seam',[w,.006,.002],[0,h*.65,d/2],dark);}
      else {const drum=cyl('washer-door',w*.31,.03,[0,h*.48,d/2-.016],glass);drum.rotation.x=Math.PI/2;const bezel=mesh('washer-bezel',new T.TorusGeometry(w*.33,.018,8,32),[0,h*.48,d/2-.02],metal);b('control-panel',[w*.9,h*.12,.006],[0,h*.88,d/2-.003],dark);}
      break;
    }
    case 'display': case 'decor': {
      if(has('plant')){cyl('plant-pot',w*.23,h*.25,[0,h*.125,0],wood,w*.29);for(let i=0;i<9;i++){const a=i*2.4,x=Math.cos(a)*w*.32,z=Math.sin(a)*d*.32,yy=h*(.5+i*.045);rod('plant-stem',[0,h*.2,0],[x,yy,z],.006,mat('#436a38'));const shape=new T.Shape();shape.moveTo(0,-1);shape.bezierCurveTo(-.8,-.3,-.7,.4,0,1);shape.bezierCurveTo(.7,.4,.8,-.3,0,-1);const leafMat=mat(i%2?'#638250':'#436a38');leafMat.side=T.DoubleSide;const leaf=mesh('broad-leaf',new T.ShapeGeometry(shape,12),[x,yy,z],leafMat);leaf.scale.set(w*.16,h*.09,1);leaf.rotation.set(-.2,a,.3);}}
      else if(has('rug')||has('roundrug')){if(has('roundrug'))cyl('round-woven-rug',Math.min(w,d)/2,h,[0,h/2,0],cloth);else b('woven-rug',[w,h,d],[0,h/2,0],cloth);for(let i=0;i<20;i++)b('woven-pattern',[w*.012,h*.12,d*.85],[(i-9.5)*w/21,h*.95,0],white);}
      else if(has('curtain')){for(const side of [-1,1])for(let i=0;i<16;i++)cyl('curtain-fold',d*.18,h,[side*w*.38+(i-7.5)*w*.014,h/2,Math.sin(i)*d*.2],cloth);rod('curtain-rod',[-w/2,h-.01,0],[w/2,h-.01,0],.008);}
      else if(has('clock')){const o=cyl('clock-face',w*.5,d*.5,[0,h/2,-d*.25],white);o.rotation.x=Math.PI/2;for(let i=0;i<12;i++){const a=i*Math.PI/6;b('hour-mark',[w*.025,h*.06,.01],[Math.sin(a)*w*.4,h/2+Math.cos(a)*h*.4,d/2-.005],metal);}rod('minute-hand',[0,h/2,d*.25],[w*.18,h*.7,d*.25],.005);rod('hour-hand',[0,h/2,d*.25],[-w*.15,h*.6,d*.25],.008);}
      else if(has('pegboard')||has('acoustic')||has('partition')||has('whiteboard')||has('mirror')||has('art')){b('panel-frame',[w,h*.85,Math.min(d,.012)],[0,h*.57,-d*.2],wood);b(has('mirror')?'mirror-surface':'panel-infill',[w*.94,h*.78,.005],[0,h*.57,d*.35],has('mirror')?metal:has('partition')||has('acoustic')?cloth:white);if(has('acoustic'))for(let i=0;i<16;i++)b('acoustic-slat',[w/28,h*.8,d*.5],[(i-7.5)*w/17,h*.57,d*.22],wood);if(has('pegboard'))for(let i=0;i<18;i++){const x=(i%6-2.5)*w*.15,y=h*(.3+Math.floor(i/6)*.2);rod('peg-hook',[x,y,.02],[x,y+.02,d*.45],.006);}if(has('whiteboard')||has('mirror')||has('partition'))for(const x of [-1,1]){rod('panel-leg',[x*w*.4,.02,-d*.4],[x*w*.4,h*.3,0]);rod('panel-foot',[x*w*.4,.02,-d*.45],[x*w*.4,.02,d*.45]);}if(has('art')){b('abstract-block',[w*.3,h*.4,.008],[-w*.2,h*.6,d*.35],main);cyl('abstract-disc',w*.12,.01,[w*.2,h*.6,d*.35],metal).rotation.x=Math.PI/2;}}
      else if(has('coat')||has('valet')){cyl('rack-base',Math.min(w,d)*.45,.04,[0,.02,0]);rod('rack-post',[0,.02,0],[0,h,0],.02,wood);for(let i=0;i<(has('coat')?6:2);i++){const a=i*Math.PI*2/(has('coat')?6:2);rod('coat-hook',[0,h*.7,0],[Math.cos(a)*w*.4,h*.9,Math.sin(a)*d*.4],.018,wood);}}
      else if(has('magazine')){for(const side of [-1,1]){const o=b('V-magazine-panel',[w,h*.65,.025],[0,h*.45,side*d*.2],wood);o.rotation.x=side*.45;}rod('carrying-handle',[-w*.4,h-.02,0],[w*.4,h-.02,0],.014);}
      else if(has('pet')){b('pet-cushion',[w,h*.5,d],[0,h*.25,0],cloth);for(const side of [-1,1])b('pet-bolster',[w*.12,h,d],[side*w*.44,h/2,0],cloth);b('rear-bolster',[w,h,d*.15],[0,h/2,-d*.425],cloth);}
      else {
        const shelves=has('ladder')?5:has('steps')?3:has('tray')?3:has('corner')?4:2;
        for(let i=0;i<shelves;i++){const yy=(i+1)*h/(shelves+1),depth=has('ladder')?d*(1-i*.12):has('steps')?d/shelves:d;panel('display-shelf',yy,w,depth,0,has('steps')?(i-1)*d/3:0);}
        if(has('slots'))for(let i=0;i<10;i++)b('case-divider',[.008,h,d],[(i-4.5)*w/10,h/2,0],wood);
        if(has('hamper')){panel('hamper-lid',h-.0125,w,d,0,0,cloth);rod('carrying-handle',[-w*.3,h*.85,d*.45],[w*.3,h*.85,d*.45],.01);}
        if(has('basket')||has('hamper')){for(let i=0;i<10;i++)for(const side of [-1,1])b('basket-wire',[.008,h,d*.04],[(i-4.5)*w/10,h/2,side*d*.47],metal);panel('basket-bottom',.0125,w,d,0,0,metal);}
        if(has('laptop')){const o=b('laptop-platform',[w,.015,d],[0,h*.75,0],metal);o.rotation.x=-.14;for(let i=0;i<7;i++)b('vent-slot',[.008,.002,d*.65],[(i-3)*w*.1,h*.76,0],dark);}
        for(const x of [-1,1])for(const z of [-1,1])rod('display-upright',[x*w*.46,.015,z*d*.4],[x*w*.46,h,z*d*.4],.012,wood);
        if(has('cart')||has('booktruck'))for(const x of [-1,1])for(const z of [-1,1])cyl('trolley-wheel',.025,.02,[x*w*.43,.025,z*d*.4],dark);
        if(has('corner'))rod('corner-back-post',[0,0,-d*.45],[0,h,-d*.45],.02,wood);
      }
      break;
    }
    default: throw new Error(`Missing geometry family ${def.family}`);
  }
  g.name=f.id;g.userData.furnitureId=f.id;
  g.position.set(f.x/1000,f.y/1000,f.z/1000);g.rotation.y=f.rotation*Math.PI/180;
  if((def.family==='rgb'||def.family==='lamp')&&f.light?.enabled!==false){const light=new T.PointLight(f.light?.color||'#a085ff',(f.light?.intensity??2)*4,4,2);light.position.set(0,h*.7,0);g.add(light);}
  return g;
}
