import {createRoom,addItem,type RoomScene} from './scene';
import {attach,syncSupports} from './editing';
export const templates=[
  {id:'gaming-black',name:'8㎡ 黑色极简电竞房',en:'8m² dark minimal gaming',w:3200,d:2500,gaming:true,color:'#323b46'},
  {id:'gaming-nordic',name:'10㎡ 白色北欧电竞房',en:'10m² white Nordic gaming',w:4000,d:2500,gaming:true,color:'#dedbd0'},
  {id:'gaming-bedroom',name:'12㎡ RGB 卧室',en:'12m² RGB gaming bedroom',w:4000,d:3000,gaming:true,color:'#565478'},
  {id:'gaming-double',name:'15㎡ 双人电竞房',en:'15m² double gaming room',w:5000,d:3000,gaming:true,color:'#506473'},
  {id:'gaming-stream',name:'18㎡ 主播工作室',en:'18m² streaming studio',w:6000,d:3000,gaming:true,color:'#4b405c'},
  {id:'gaming-office',name:'9㎡ 电竞办公房',en:'9m² gaming home office',w:3000,d:3000,gaming:true,color:'#738076'},
  {id:'small-bedroom',name:'小卧室',en:'Compact bedroom',w:3200,d:3000,gaming:false,color:'#b6ae9c'},
  {id:'nordic-bedroom',name:'北欧卧室',en:'Nordic bedroom',w:4000,d:3500,gaming:false,color:'#b3baa5'},
  {id:'modern-living',name:'现代客厅',en:'Modern living room',w:5000,d:3600,gaming:false,color:'#a7b1b2'},
  {id:'small-study',name:'小书房',en:'Small study',w:3000,d:2800,gaming:false,color:'#b4a184'},
  {id:'living-dining',name:'客餐厅',en:'Living and dining',w:6000,d:4000,gaming:false,color:'#b9ad98'},
  {id:'storage-bedroom',name:'收纳卧室',en:'Storage bedroom',w:4200,d:3400,gaming:false,color:'#c3b69f'},
];
export function templateScene(id:string):RoomScene{
  const t=templates.find(t=>t.id===id);if(!t)throw new Error('Unknown template');
  const s=createRoom(t.w,t.d);s.name=t.name;s.dimensionConfidence='estimated';s.rooms[0].confidence='estimated';
  s.notes.push('装修模板仅为示例，并非任何真实住宅或实购商品。 / Example layout, not a surveyed home.');
  s.materials.floor.color=t.gaming?'#857159':'#b7a184';
  const place=(id:string,x:number,z:number,rotation=0)=>{const f=addItem(s,id,x,z);f.rotation=rotation;return f;};
  if(t.gaming){
    const double=id==='gaming-double',cx=t.w/2+(id==='gaming-bedroom'?450:0),desk=place(double?'gaming_desk_double':id==='gaming-office'?'gaming_desk_standing':'gaming_desk',cx,500);
    desk.width=double?2400:2000;desk.color=t.color;
    const onDesk=(id:string,x:number,z:number)=>{const f=place(id,x,z);attach(s,f,desk);return f;};
    onDesk('monitor_ultrawide',cx+(double?450:0),360);onDesk('keyboard',cx+(double?450:0),650);onDesk('mouse',cx+(double?820:400),650);onDesk('pc_glass',cx+(double?1000:800),480);
    if(!double)onDesk('speaker_pair',cx-750,400);else place('subwoofer',t.w-400,600);
    onDesk('headphone_stand',cx-(double?1000:700),650);
    place('gaming_chair',cx+(double?450:0),1350,180);if(double){place('mesh_chair',cx-600,1350,180);onDesk('monitor_portrait',cx-600,400);onDesk('keyboard',cx-600,650);}
    const rgb=place('rgb_hex',40,1000,90);rgb.y=1500;const corner=place('rgb_corner',t.w-250,250);if(id==='gaming-bedroom'){rgb.light={enabled:true,color:'#7550ff',intensity:9};corner.light={enabled:true,color:'#d34cff',intensity:9};}
    place('display_glass',id==='gaming-bedroom'?t.w-500:450,id==='gaming-bedroom'?1600:t.d-450);place('acoustic_panel',t.w-40,1600,90).y=800;
    if(id==='gaming-bedroom')place('bed_twin',550,1800);
    if(id==='gaming-stream'){onDesk('mic_desktop',cx-400,650);place('whiteboard',t.w-700,t.d/2,90);place('sofa',t.w/2,t.d-550);}
    s.render.preset=id==='gaming-bedroom'?'night':'day';
  }else if(id.includes('bedroom')){
    place(id==='storage-bedroom'?'bed_storage':id==='small-bedroom'?'bed_twin':'bed_queen',t.w*.45,t.d*.37);
    place('nightstand',t.w*.13,400);place('wardrobe',850,t.d-350);place('lamp_table',t.w*.13,400).y=500;
    if(id==='storage-bedroom')place('cube_shelf',t.w-220,t.d*.4,90);
  }else if(id==='small-study'){
    const desk=place('desk',t.w/2,450);place('office_chair',t.w/2,1200,180);place('bookshelf',500,t.d-250);const screen=place('monitor_27',t.w/2,400);attach(s,screen,desk);place('floor_lamp',t.w-300,t.d-300);
  }else{
    place('sofa',t.w/2,t.d-550);place('coffee_table',t.w/2,t.d-1600);place('tv_stand',t.w/2,250);place('television',t.w/2,250).y=500;place('plant',t.w-450,550);
    if(id==='living-dining'){place('dining_round',900,1500);place('dining_chair',900,2400);place('dining_chair',1800,1500,90);}
  }
  const curtain=place('curtain',t.w/2,60);curtain.width=Math.min(2200,t.w*.6);
  s.camera.position=[t.w*.94,1550,t.d*.94];s.camera.target=[t.w*.45,950,t.d*.25];
  if(id==='gaming-bedroom'){s.camera.position=[1300,1550,t.d-150];s.camera.target=[t.w/2+450,1000,400];}
  syncSupports(s);return s;
}
