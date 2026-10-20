import {it,expect} from 'vitest';
import {Box3,Vector3,Mesh} from 'three';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalog,categories} from '../../src/lib/roomfit/catalog';
import {createRoom,addItem,readScene} from '../../src/lib/roomfit/scene';
import {furnitureModel} from '../../src/lib/roomfit/models';
import {dispose,renderManifest} from '../../src/lib/roomfit/buildScene';
import {footprint,area} from '../../src/lib/roomfit/geometry';
import {encodeScene,decodeScene} from '../../src/lib/roomfit/storage';
import {lengthMm,validateDimension,attach,syncSupports,replaceItem,temperatureColor} from '../../src/lib/roomfit/editing';
import {readMeshAsset,meshAssetModel} from '../../src/lib/roomfit/assetGeometry';
it('audits every independent asset through geometry, bounds, placement, persistence and shared export',()=>{
  const reports:any[]=[], minima=[45,20,20,18,12,14,10,11];
  categories.forEach((c,i)=>expect(catalog.filter(f=>f.category===c).length).toBeGreaterThanOrEqual(minima[i]));
  expect(new Set(catalog.map(f=>f.id)).size).toBe(catalog.length);
  for(const def of catalog){
    const s=createRoom(),f=addItem(s,def.id,1800,1500);f.rotation=0;
    const root=furnitureModel(f),bounds=new Box3().setFromObject(root),size=bounds.getSize(new Vector3()).multiplyScalar(1000);
    const parts:any[]=[];let vertices=0;root.updateMatrixWorld(true);
    root.traverse(o=>{if(o instanceof Mesh){const p=o.geometry.getAttribute('position');vertices+=p.count;expect(p.count,def.id).toBeGreaterThan(2);for(let i=0;i<p.count;i++)expect(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)),def.id).toBe(true);parts.push({name:o.name,type:o.geometry.type,size:new Box3().setFromObject(o).getSize(new Vector3()).toArray().map((n,i)=>+(n/([f.width,f.height,f.depth][i]/1000)).toFixed(5)),position:o.position.toArray().map((n,i)=>+(n/([f.width,f.height,f.depth][i]/1000)).toFixed(5))});}});
    expect(parts.length,def.id).toBeGreaterThan(1);
    const fit=size.x<=f.width+1&&size.y<=f.height+1&&size.z<=f.depth+1&&bounds.min.y>=-.001;
    f.rotation=37;expect(area(footprint(f))).toBeCloseTo(f.width*f.depth*(def.family==='desk'&&def.features.includes('L')?.43+.38*.57:1),1);
    expect(decodeScene(encodeScene(s))).toEqual(s);
    const exported=renderManifest(s);expect(exported.meshes.length,def.id).toBeGreaterThan(parts.length);
    expect(def.source&&def.license).toBeTruthy();
    reports.push({id:def.id,name:def.name,category:def.category,recipe:[def.family,...def.features],license:def.license,source:def.source,dimensionsMm:[def.w,def.d,def.h],actualBoundsMm:size.toArray().map(n=>+n.toFixed(3)),minimumY:bounds.min.y,parts:parts.length,vertices,fit,structureHash:createHash('sha256').update(JSON.stringify(parts)).digest('hex'),savedReloaded:true,sharedExportMeshes:exported.meshes.length});
    dispose(root);
  }
  writeFileSync('../evidence/v020-asset-audit.json',JSON.stringify({count:reports.length,categories:Object.fromEntries(categories.map(c=>[c,reports.filter(r=>r.category===c).length])),reports},null,2));
  expect(reports.filter(r=>!r.fit).map(r=>({id:r.id,actual:r.actualBoundsMm,declared:r.dimensionsMm,minY:r.minimumY}))).toEqual([]);
  const hashes=reports.map(r=>r.structureHash);expect(new Set(hashes).size).toBe(hashes.length);
},30000);
it('parses human units and rejects implausible desk heights',()=>{expect(lengthMm('120cm')).toBe(1200);expect(lengthMm('1.2m')).toBe(1200);expect(lengthMm('1200mm')).toBe(1200);expect(lengthMm('120','cm')).toBe(1200);expect(()=>lengthMm('1e9')).toThrow();const s=createRoom(),f=addItem(s,'gaming_desk');expect(()=>validateDimension(f,'height',7500)).toThrow();});
it('keeps attached objects on a rotated resized desk, replaces and detaches safely',()=>{const s=createRoom(),desk=addItem(s,'gaming_desk',1800,1000),screen=addItem(s,'monitor_27',1800,1000);attach(s,screen,desk);expect(screen.y).toBe(750);desk.height=900;desk.rotation=90;desk.x=2000;syncSupports(s);expect(screen.y).toBe(900);expect(screen.x).toBe(2000);expect(screen.rotation).toBe(90);replaceItem(s,desk,'gaming_desk_drawer');expect(screen.support?.parentId).toBe(desk.id);expect(screen.y).toBe(750);expect(readScene(s)).toEqual(s);delete screen.support;desk.height=1000;syncSupports(s);expect(screen.y).toBe(750);});
it('rebuilds cabinet dividers and disposes actual GPU geometry and materials',()=>{const s=createRoom(),f=addItem(s,'cube_shelf');f.modules={cols:2,rows:2};const first=furnitureModel(f);f.modules={cols:4,rows:5};const second=furnitureModel(f);expect(first.children.filter(c=>c.name==='vertical-divider')).toHaveLength(3);expect(second.children.filter(c=>c.name==='vertical-divider')).toHaveLength(5);expect(second.children.filter(c=>c.name==='horizontal-shelf')).toHaveLength(6);let expectedGeometry=0,disposedGeometry=0;const mats=new Set<any>();for(const g of [first,second])g.traverse(o=>{if(o instanceof Mesh){expectedGeometry++;o.geometry.addEventListener('dispose',()=>disposedGeometry++);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});let disposedMaterials=0;mats.forEach(m=>m.addEventListener('dispose',()=>disposedMaterials++));dispose(first);dispose(second);expect(disposedGeometry).toBe(expectedGeometry);expect(disposedMaterials).toBe(mats.size);});
it('validates embedded GLB mesh data and preserves physical proportions',()=>{const data=JSON.stringify({format:'RoomFitMesh1',size:[1,1,1],parts:[{name:'tetra',positions:[0,0,0,1,0,0,0,1,0,0,0,1],indices:[0,1,2,0,2,3,1,3,2,0,3,1],color:'#ab9977',roughness:.5,metalness:0,kind:'paint',emission:'#000000'}]});expect(readMeshAsset(data).parts).toHaveLength(1);const g=meshAssetModel(data,1200,1200,1200);expect(new Box3().setFromObject(g).max.x).toBeCloseTo(1.2,5);dispose(g);expect(()=>meshAssetModel(data,1200,1000,1200)).toThrow();expect(()=>readMeshAsset(data.replace('[0,1,2','[900,1,2'))).toThrow();});

it('maps temperature references to persistent shared RGB values',()=>{expect(temperatureColor(2700)).toBe('#ffbd80');expect(temperatureColor(6500)).toBe('#fff9f2');expect(temperatureColor(5000)).toMatch(/^#[0-9a-f]{6}$/);expect(()=>temperatureColor(30000)).toThrow();});
