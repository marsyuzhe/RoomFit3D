import * as T from "three";
import { structuredModel } from "./procedural";
import {meshAssetModel} from './assetGeometry';
import {catalog} from './catalog';
import {createFurnitureModel} from '$lib/utils/furnitureModels3d';
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Furniture,RoomScene } from "./scene";

export function material(
  color: string,
  kind = "paint",
  roughness = 0.7,
  metalness = 0,
) {
  const m = new T.MeshStandardMaterial({ color, roughness, metalness });
  m.name = kind;
  return m;
}
export function box(
  parent: T.Object3D,
  name: string,
  size: number[],
  position: number[],
  m: T.Material,
  rounded = 0,
) {
  const g = rounded
    ? new RoundedBoxGeometry(
        size[0],
        size[1],
        size[2],
        3,
        Math.min(rounded, ...size.map((n) => n / 3)),
      )
    : new T.BoxGeometry(...(size as [number, number, number]));
  const mesh = new T.Mesh(g, m);
  mesh.position.set(...(position as [number, number, number]));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function furnitureModel(f: Furniture,assets:RoomScene['assets']={}): T.Group {
  if(f.assetId){const asset=assets[f.assetId];if(!asset)throw new Error('Missing GLB asset');const g=meshAssetModel(asset.data,f.width,f.height,f.depth);g.name=f.id;g.userData.furnitureId=f.id;g.position.set(f.x/1000,f.y/1000,f.z/1000);g.rotation.y=f.rotation*Math.PI/180;return g;}
  if(!catalog.some(c=>c.id===f.catalogId)){const g=new T.Group(),legacy=createFurnitureModel(f.catalogId,{id:f.catalogId,name:f.name,category:'Legacy',icon:'',width:f.width/10,depth:f.depth/10,height:f.height/10,color:f.color});legacy.scale.setScalar(.01);g.add(legacy);g.name=f.id;g.userData.furnitureId=f.id;g.position.set(f.x/1000,f.y/1000,f.z/1000);g.rotation.y=f.rotation*Math.PI/180;return g;}
  if(f.catalogId !== "bed_queen") return structuredModel(f);
  const g = new T.Group();
  g.name = f.id;
  g.userData.furnitureId = f.id;
  const w = f.width / 1000,
    d = f.depth / 1000,
    h = f.height / 1000;
  if (f.catalogId.startsWith("bed_")) {
    const wood = material("#75513a", "wood", 0.42),
      cloth = material(f.color, "fabric", 0.87),
      linen = material("#e6e0d4", "fabric", 0.96),
      throwM = material("#78847c", "fabric", 0.94);
    const yScale = Math.min(1, h / 1.05);
    const legH = 0.16 * yScale,
      frameY = 0.25 * yScale,
      mattressY = 0.46 * yScale;
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        box(
          g,
          "bed-leg",
          [0.065, legH, 0.065],
          [x * (w / 2 - 0.1), legH / 2, z * (d / 2 - 0.15)],
          wood,
          0.012,
        );
    box(
      g,
      "bed-frame",
      [w, 0.18 * yScale, d - 0.035],
      [0, frameY, 0.0175],
      wood,
      0.025,
    );
    box(
      g,
      "upholstered-headboard",
      [w, h - 0.08 * yScale, 0.065],
      [0, (h + 0.08 * yScale) / 2, -d / 2 + 0.0325],
      cloth,
      0.028,
    );
    for (let i = 1; i < 6; i++)
      box(
        g,
        "headboard-seam",
        [0.003, h - 0.16 * yScale, 0.002],
        [-w / 2 + (i * w) / 6, (h + 0.08 * yScale) / 2, -d / 2 + 0.066],
        linen,
        0.001,
      );
    box(
      g,
      "mattress",
      [w - 0.045, 0.24 * yScale, d - 0.125],
      [0, mattressY, -0.003],
      linen,
      0.055,
    );
    box(
      g,
      "duvet",
      [w - 0.025, 0.115 * yScale, d * 0.69],
      [0, 0.6 * yScale, d * 0.14],
      cloth,
      0.05,
    );
    for (let i = 0; i < 11; i++) {
      const fold = box(
        g,
        "duvet-fold",
        [(w - 0.09) / 11, 0.015 * yScale, d * 0.62],
        [
          -w / 2 + 0.06 + ((i + 0.5) * (w - 0.12)) / 11,
          (0.658 + Math.sin(i * 2.4) * 0.004) * yScale,
          d * 0.16,
        ],
        cloth,
        0.006,
      );
      fold.rotation.z = Math.sin(i) * 0.016;
    }
    const count = 2;
    for (let i = 0; i < count; i++) {
      const p = box(
        g,
        "linen-pillow",
        [Math.min(0.64, w * 0.38), 0.14 * yScale, Math.min(0.4, d * 0.2)],
        [(i - (count - 1) / 2) * w * 0.45, 0.65 * yScale, -d * 0.3],
        linen,
        0.065,
      );
      p.rotation.y = (i - 0.5) * 0.06;
    }
    box(
      g,
      "woven-bed-throw",
      [w - 0.015, 0.038 * yScale, Math.min(0.4, d * 0.2)],
      [0, 0.682 * yScale, d * 0.29],
      throwM,
      0.015,
    );
  }
  g.position.set(f.x / 1000, f.y / 1000, f.z / 1000);
  g.rotation.y = (f.rotation * Math.PI) / 180;
  return g;
}
