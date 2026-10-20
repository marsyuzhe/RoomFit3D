import * as T from 'three';
import {z} from 'zod';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const n=z.number().finite().min(-1e6).max(1e6);
const assetSchema=z.object({format:z.literal('RoomFitMesh1'),size:z.tuple([n,n,n]),parts:z.array(z.object({name:z.string().max(200),positions:z.array(n).min(9).max(900000),indices:z.array(z.number().int().min(0).max(300000)).max(900000),color:z.string().regex(/^#[0-9a-f]{6}$/i),roughness:z.number().min(0).max(1),metalness:z.number().min(0).max(1),kind:z.enum(['paint','metal','glass']),emission:z.string().regex(/^#[0-9a-f]{6}$/i)})).min(1).max(200)});
export type MeshAsset=z.infer<typeof assetSchema>;
export function readMeshAsset(data:string){if(data.length>24e6)throw new Error('GLB mesh exceeds 24 MB');const a=assetSchema.parse(JSON.parse(data));if(a.size.some(n=>n<=0||n>100))throw new Error('Invalid GLB bounds');let total=0;for(const p of a.parts){if(p.positions.length%3||p.indices.length%3||p.indices.some(i=>i>=p.positions.length/3))throw new Error('Invalid GLB triangles');total+=p.positions.length;}if(total>900000)throw new Error('GLB geometry exceeds 300k vertices');return a;}
export function meshAssetModel(data:string,width:number,height:number,depth:number){const a=readMeshAsset(data),ratios=[width/1000/a.size[0],height/1000/a.size[1],depth/1000/a.size[2]];if(Math.max(...ratios)-Math.min(...ratios)>Math.max(...ratios)*.02)throw new Error('GLB 保持原始比例，请统一缩放 / GLB dimensions must preserve aspect ratio');const scale=ratios[0],g=new T.Group();for(const p of a.parts){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p.positions.map(n=>n*scale),3));if(p.indices.length)geometry.setIndex(p.indices);geometry.computeVertexNormals();const mat=new T.MeshStandardMaterial({color:p.color,roughness:p.roughness,metalness:p.metalness,emissive:p.emission,emissiveIntensity:1});mat.name=p.kind;if(p.kind==='glass'){mat.transparent=true;mat.opacity=.35;}const mesh=new T.Mesh(geometry,mat);mesh.name=p.name;mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);}return g;}
export async function importGlb(file:File,unit:'m'|'cm'|'mm'='m',turns=0){
 if(!/\.glb$/i.test(file.name)||file.size>20e6)throw new Error('请选择 ≤20 MB 的 GLB / Choose a GLB up to 20 MB');
 const raw=await file.arrayBuffer(),view=new DataView(raw);if(raw.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw new Error('Invalid GLB 2.0 header');
 const size=view.getUint32(12,true);if(size>raw.byteLength-20)throw new Error('Invalid GLB JSON');const json=JSON.parse(new TextDecoder().decode(raw.slice(20,20+size)));
 if(json.animations?.length)throw new Error('动画 GLB 暂不支持 / Animated GLB is unsupported');
 if(json.buffers?.some((b:{uri?:string})=>b.uri)||json.images?.some((b:{uri?:string})=>b.uri)||json.extensionsUsed?.some((s:string)=>/draco|meshopt/i.test(s)))throw new Error('仅支持内嵌、无压缩 GLB / Embedded uncompressed GLB required');
 const parsed=await new GLTFLoader().parseAsync(raw,''),root=parsed.scene;root.rotation.y=turns*Math.PI/2;root.scale.setScalar(({m:1,cm:.01,mm:.001})[unit]);root.updateMatrixWorld(true);
 try{
  const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  if(![size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>.0005&&n<100))throw new Error('GLB 尺寸异常，请检查单位 / Check GLB units');
  const parts:MeshAsset['parts']=[];let count=0;
  root.traverse(o=>{if(!(o instanceof T.Mesh))return;if(o instanceof T.SkinnedMesh)throw new Error('Skinned GLB is unsupported');const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>m.map||m.normalMap||m.roughnessMap||m.metalnessMap||m.emissiveMap))throw new Error('带贴图 GLB 暂不支持，请导出纯 PBR 材质模型 / Textured GLB is not supported; export solid PBR materials');
   const geo=o.geometry,p=geo.getAttribute('position'),index=geo.index,v=new T.Vector3();count+=p.count;if(count>300000)throw new Error('GLB 超过 30 万顶点 / Too many vertices');
   const positions:number[]=[];for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);positions.push(v.x-center.x,v.y-bounds.min.y,v.z-center.z);}
   const groups=geo.groups.length?geo.groups:[{start:0,count:index?.count||p.count,materialIndex:0}];
   for(const group of groups){const mat=mats[group.materialIndex||0] as T.MeshStandardMaterial,indices:number[]=[];for(let i=group.start;i<group.start+group.count;i++)indices.push(index?index.getX(i):i);parts.push({name:o.name||'personal-mesh',positions,indices,color:'#'+(mat.color||new T.Color('#bbbbbb')).getHexString(),roughness:mat.roughness??.6,metalness:mat.metalness??0,kind:mat.transparent?'glass':(mat.metalness||0)>.5?'metal':'paint',emission:'#'+(mat.emissive||new T.Color(0)).getHexString()});}
  });
  const asset:MeshAsset={format:'RoomFitMesh1',size:size.toArray(),parts};const data=JSON.stringify(asset);readMeshAsset(data);return {data,width:size.x*1000,height:size.y*1000,depth:size.z*1000,parts:parts.length,vertices:count};
 }finally{root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])m[k]?.dispose();m.dispose();}}});}
}
