import * as T from "three";
import clipping from "polygon-clipping";
import { buildWallSegments } from "$lib/utils/wallProfiles";
import { createRoomSlabGeometry } from "$lib/utils/roomSlabGeometry";
import { box, material, furnitureModel } from "./models";
import { toBlender, type RoomScene } from "./scene";
import { jambMm, doorLeafWidth } from "./openings";
import { catalog } from './catalog';

export function buildScene(s: RoomScene, ceiling = false): T.Group {
  const root = new T.Group();
  root.name = "RoomFit";
  const wallMat = material(
    s.materials.wall.color,
    s.materials.wall.kind,
    s.materials.wall.roughness,
  );
  const floorMat = material(
    s.materials.floor.color,
    s.materials.floor.kind,
    s.materials.floor.roughness,
  );
  for (const r of s.rooms) {
    const geo = createRoomSlabGeometry(
      r.polygon.map((p) => ({ x: p.x / 1000, y: p.z / 1000 })),
      0.08,
    );
    if (geo) {
      const floor = new T.Mesh(geo, floorMat);
      floor.position.y = ["wood", "tile"].includes(s.materials.floor.kind)
        ? -0.004
        : 0;
      floor.name = `floor-${r.id}`;
      floor.receiveShadow = true;
      root.add(floor);
      const ceilingMesh = new T.Mesh(
        geo.clone(),
        material("#f0ede6", "paint", 0.85),
      );
      ceilingMesh.position.y = r.height / 1000 + 0.08;
      ceilingMesh.name = "ceiling";
      ceilingMesh.visible = ceiling;
      root.add(ceilingMesh);
    }
    if (["wood", "tile"].includes(s.materials.floor.kind)) {
      const p = r.polygon,
        loX = Math.min(...p.map((p) => p.x)),
        hiX = Math.max(...p.map((p) => p.x)),
        loZ = Math.min(...p.map((p) => p.z)),
        hiZ = Math.max(...p.map((p) => p.z));
      const wood = s.materials.floor.kind === "wood",
        tile = s.materials.floor.tileMm,
        stepX = wood ? Math.max(100, tile * 0.3) : tile,
        stepZ = wood ? tile * 2 : tile;
      let count = 0;
      for (let x = loX; x < hiX; x += stepX) {
        const column = Math.round((x - loX) / stepX),
          offset = wood ? ((column % 3) * stepZ) / 3 : 0;
        for (let z = loZ - offset; z < hiZ; z += stepZ) {
          if (++count > 5000) break;
          const ring = clipping.intersection(
            [p.map((p) => [p.x, p.z] as [number, number])],
            [
              [
                [x + 0.8, z + 0.8],
                [x + stepX - 0.8, z + 0.8],
                [x + stepX - 0.8, z + stepZ - 0.8],
                [x + 0.8, z + stepZ - 0.8],
                [x + 0.8, z + 0.8],
              ],
            ],
          );
          for (const poly of ring) {
            const shape = poly[0].map(([x, z]) => ({
              x: x / 1000,
              y: z / 1000,
            }));
            const plankGeo = createRoomSlabGeometry(shape, 0.004);
            if (!plankGeo) continue;
            const mat = floorMat.clone();
            mat.color.multiplyScalar(
              0.92 + (Math.sin(column * 37 + z * 0.02) + 1) * 0.075,
            );
            const mesh = new T.Mesh(plankGeo, mat);
            mesh.name = wood ? "floor-plank" : "floor-tile";
            mesh.position.y = 0;
            mesh.receiveShadow = true;
            root.add(mesh);
          }
        }
      }
    }
  }
  for (const w of s.walls) {
    const group = new T.Group();
    group.name = w.id;
    group.userData.roomfitWall = true;
    group.position.set(w.start.x / 1000, 0, w.start.z / 1000);
    const length = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
    group.rotation.y = -Math.atan2(w.end.z - w.start.z, w.end.x - w.start.x);
    const ops = s.openings.filter((o) => o.wallId === w.id);
    const doors = ops
      .filter((o) => o.kind === "door")
      .map((o) => ({
        id: o.id,
        wallId: w.id,
        position: o.offset / length,
        width: o.width,
        height: o.height,
        type: "single" as const,
        swingDirection: o.swing,
        flipSide: false,
      }));
    const windows = ops
      .filter((o) => o.kind === "window")
      .map((o) => ({
        id: o.id,
        wallId: w.id,
        position: o.offset / length,
        width: o.width,
        height: o.height,
        sillHeight: o.sill,
        type: "standard" as const,
      }));
    for (const seg of buildWallSegments(
      length,
      w.height,
      w.height,
      doors,
      windows,
    )) {
      box(
        group,
        "wall",
        [
          seg.width / 1000,
          (seg.topYLeft - seg.bottomY) / 1000,
          w.thickness / 1000,
        ],
        [seg.offsetX / 1000, (seg.bottomY + seg.topYLeft) / 2000, 0],
        wallMat,
      );
      if (seg.bottomY === 0)
        box(
          group,
          "skirting",
          [seg.width / 1000, 0.07, w.thickness / 1000 + 0.015],
          [seg.offsetX / 1000, 0.035, 0],
          material("#dfd8cc", "paint", 0.5),
        );
    }
    for (const o of ops) {
      const x = o.offset / 1000,
        ww = o.width / 1000,
        hh = o.height / 1000,
        y = o.sill / 1000,
        th = w.thickness / 1000;
      const frame = material(
        o.kind === "window" ? "#e5dfd4" : "#8f7156",
        o.kind === "window" ? "paint" : "wood",
        0.4,
      );
      for (const sign of [-1, 1])
        box(
          group,
          "opening-jamb",
          [0.035, hh, th + 0.035],
          [x + sign * (ww / 2 - 0.0175), y + hh / 2, 0],
          frame,
          0.005,
        );
      box(
        group,
        "opening-lintel",
        [ww, 0.035, th + 0.035],
        [x, y + hh - 0.0175, 0],
        frame,
        0.005,
      );
      if (o.kind === "window") {
        box(
          group,
          "window-sill",
          [ww + 0.1, 0.045, th + 0.16],
          [x, y - 0.0225, 0],
          frame,
          0.006,
        );
        box(
          group,
          "window-mullion",
          [0.028, hh, 0.035],
          [x, y + hh / 2, 0],
          frame,
          0.003,
        );
        const glass = new T.MeshPhysicalMaterial({
          color: "#edf4f5",
          roughness: 0.07,
          transmission: 1,
          transparent: true,
          opacity: 0.22,
          thickness: 0.006,
          ior: 1.45,
        });
        glass.name = "glass";
        box(
          group,
          "window-glass",
          [ww - 0.07, hh - 0.07, 0.006],
          [x, y + hh / 2, 0],
          glass,
        );
      } else {
        const hinge = new T.Group();
        const sign = o.swing === "left" ? 1 : -1,
          leafWidth = doorLeafWidth(o.width) / 1000;
        hinge.position.set(x - sign * (ww / 2 - jambMm / 1000), 0, 0);
        hinge.rotation.y = -sign * 0.18;
        group.add(hinge);
        box(
          hinge,
          "door-leaf",
          [leafWidth, hh - 0.04, 0.035],
          [(sign * leafWidth) / 2, (hh - 0.04) / 2, 0],
          frame,
          0.006,
        );
        box(
          hinge,
          "door-handle",
          [0.09, 0.018, 0.05],
          [sign * (leafWidth - 0.1), Math.min(1.02, hh * 0.5), 0.035],
          material("#a09c8d", "metal", 0.25, 0.8),
          0.006,
        );
      }
    }
    root.add(group);
  }
  for (const f of s.furniture) root.add(furnitureModel(f,s.assets));
  const bounds = new T.Box3().setFromObject(root),
    center = bounds.getCenter(new T.Vector3());
  box(
    root,
    "ceiling-light",
    [0.52, 0.045, 0.36],
    [center.x, s.rooms[0].height / 1000 - 0.035, center.z],
    material("#f1e5cc", "light", 0.4),
    0.02,
  );
  root.updateMatrixWorld(true);
  return root;
}
export function dispose(root: T.Object3D) {
  const materials = new Set<T.Material>();
  root.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Line || o instanceof T.Points) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        materials.add(m),
      );
    }
  });
  materials.forEach((m) => m.dispose());
}
export interface RenderMesh {
  name: string;
  vertices: number[][];
  faces: number[][];
  material: {
    color: number[];
    roughness: number;
    metalness: number;
    kind: string;
    emission: number[];
    emissionStrength: number;
  };
}
export function renderManifest(s: RoomScene) {
  const root = buildScene(s, true),
    meshes: RenderMesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof T.Mesh) || !o.visible) return;
    const g = o.geometry,
      p = g.getAttribute("position"),
      index = g.index,
      m = (
        Array.isArray(o.material) ? o.material[0] : o.material
      ) as T.MeshStandardMaterial;
    const v = new T.Vector3(),
      vertices: number[][] = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      vertices.push([v.x, -v.z, v.y]);
    }
    const faces: number[][] = [];
    for (let i = 0; i < (index?.count ?? p.count); i += 3)
      faces.push([0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)));
    meshes.push({
      name: o.name,
      vertices,
      faces,
      material: {
        color: m.color.toArray(),
        roughness: m.roughness,
        metalness: m.metalness,
        kind: m.name,
        emission: m.emissive?.toArray() ?? [0,0,0],
        emissionStrength: m.emissiveIntensity ?? 0,
      },
    });
  });
  dispose(root);
  const camera = new T.PerspectiveCamera(
    s.camera.fov,
    s.render.width / s.render.height,
    0.02,
    200,
  );
  camera.position.set(
    ...(s.camera.position.map((n) => n / 1000) as [number, number, number]),
  );
  camera.lookAt(
    new T.Vector3(
      ...(s.camera.target.map((n) => n / 1000) as [number, number, number]),
    ),
  );
  camera.updateMatrixWorld(true);
  // Avoid points on/behind the camera plane, whose NDC is numerically unbounded.
  // Check stable room-space samples inside or close to the field of view.
  const polygon=s.rooms[0].polygon,centroid={x:polygon.reduce((a,p)=>a+p.x,0)/polygon.length,z:polygon.reduce((a,p)=>a+p.z,0)/polygon.length};
  const samples=[centroid,...polygon,...polygon.map(p=>({x:(p.x+centroid.x)/2,z:(p.z+centroid.z)/2}))];
  const projectionChecks = samples.flatMap(p=>[.7,1.2].map(y=>new T.Vector3(p.x/1000,y,p.z/1000))).filter(point=>point.clone().applyMatrix4(camera.matrixWorldInverse).z<-.15).map(point=>{
    const ndc=point.clone().project(camera);return {world:[point.x,-point.z,point.y],expected:[ndc.x/2+.5,ndc.y/2+.5]};
  }).filter(p=>p.expected.every(n=>Number.isFinite(n)&&Math.abs(n)<4)).slice(0,6);
  if(projectionChecks.length<3)throw new Error('相机未朝向可验证的房间区域 / Aim the camera toward the room');
  return {
    schema: "RoomFitRender",
    version: 1,
    units: "metres",
    coordinates: "RH-Z-up",
    scene: s,
    meshes,
    lights: s.furniture.filter(f=>f.light?.enabled && ['rgb','lamp'].includes(catalog.find(c=>c.id===f.catalogId)?.family||'')).map(f=>({position:toBlender([f.x,f.y+f.height*.7,f.z]),color:new T.Color(f.light!.color).toArray(),power:f.light!.intensity*4})),
    projectionChecks,
    camera: {
      position: toBlender(s.camera.position),
      target: toBlender(s.camera.target),
      fov: s.camera.fov,
    },
  };
}
