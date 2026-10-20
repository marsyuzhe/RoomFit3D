import { z } from "zod";
import { catalog } from "./catalog";
import {readMeshAsset} from './assetGeometry';

const id = z.string().min(1).max(160);
const finite = z.number().finite().min(-1e7).max(1e7);
const dimension = z.number().finite().positive().max(100000);
const point = z.object({ x: finite, z: finite });
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const confidence = z.enum([
  "measured",
  "drawing",
  "manufacturer",
  "confirmed",
  "estimated",
]);
const wall = z.object({
  id,
  start: point,
  end: point,
  thickness: dimension,
  height: dimension,
  color,
  locked: z.boolean().default(false),
});
const opening = z.object({
  id,
  wallId: id,
  kind: z.enum(["door", "window"]),
  offset: finite,
  width: dimension,
  height: dimension,
  sill: z.number().finite().min(0),
  swing: z.enum(["left", "right"]).default("left"),
});
const furniture = z.object({
  id,
  name: z.string().max(200),
  catalogId: id,
  width: dimension,
  depth: dimension,
  height: dimension,
  x: finite,
  y: finite.default(0),
  z: finite,
  rotation: finite,
  color,
  confidence,
  locked: z.boolean().default(false),
  brand: z.string().default(""),
  model: z.string().default(""),
  sourceUrl: z.string().max(2000).default(""),
  assetId: z.string().optional(),
  support: z.object({parentId:id, x:finite, z:finite, rotation:finite, offsetY:finite}).optional(),
  modules: z.object({cols:z.number().int().min(1).max(8), rows:z.number().int().min(1).max(8)}).optional(),
  light: z.object({enabled:z.boolean(),color,intensity:z.number().min(0).max(30),temperature:z.number().min(1000).max(12000).optional()}).optional(),
});
const material = z.object({
  color,
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  kind: z.enum(["wood", "paint", "tile", "concrete", "fabric"]),
  tileMm: dimension.default(600),
});
const pixelPoint = z.object({
  x: z.number().finite().min(0).max(2400),
  y: z.number().finite().min(0).max(2400),
});
const calibration = z.object({
  a: pixelPoint,
  b: pixelPoint,
  distanceMm: dimension,
});
export const floorPlanSchema = z.object({
  name: z.string().max(300),
  page: z.number().int().min(1).max(200),
  pageCount: z.number().int().min(1).max(200),
  width: z.number().int().positive().max(2400),
  height: z.number().int().positive().max(2400),
  dataUrl: z
    .string()
    .max(16e6)
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
  position: point,
  mmPerPixel: z.number().finite().positive().max(1000),
  opacity: z.number().min(0).max(1).default(0.45),
  calibration,
  crossCheck: calibration.optional(),
  candidates: z
    .array(
      z.object({
        id,
        a: pixelPoint,
        b: pixelPoint,
        thickness: z.number().finite().min(1).max(400),
        accepted: z.boolean(),
        origin: z.enum(["detected", "manual"]),
      }),
    )
    .max(500),
});
export type FloorPlan = z.infer<typeof floorPlanSchema>;
export const sceneSchema = z.object({
  schema: z.literal("RoomFit3D"),
  version: z.literal(3),
  units: z.literal("mm"),
  coordinates: z.literal("RH-Y-up-X-right-Z-plan-down"),
  id,
  name: z.string().min(1).max(200),
  author: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  dimensionConfidence: confidence,
  rooms: z
    .array(
      z.object({
        id,
        name: z.string(),
        polygon: z.array(point).min(3).max(1000),
        height: dimension,
        confidence,
      }),
    )
    .min(1)
    .max(200),
  walls: z.array(wall).max(3000),
  openings: z.array(opening).max(3000),
  furniture: z.array(furniture).max(2000),
  materials: z.object({ floor: material, wall: material }),
  camera: z.object({
    position: z.tuple([finite, finite, finite]),
    target: z.tuple([finite, finite, finite]),
    fov: z.number().min(25).max(85),
  }),
  render: z.object({
    preset: z.enum(["day", "overcast", "dusk", "night"]),
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(180).max(2160),
    samples: z.number().int().min(1).max(1024),
    exposure: z.number().min(-4).max(4),
  }),
  clearanceTarget: z.number().min(0).max(2000),
  assets: z
    .record(
      z.string(),
      z.object({
        name: z.string(),
        data: z.string().max(72e6),
        license: z.string(),
      }),
    )
    .default({}),
  notes: z.array(z.string()).default([]),
  floorPlan: floorPlanSchema.optional(),
});
export type RoomScene = z.infer<typeof sceneSchema>;
export type Furniture = RoomScene["furniture"][number];
export type Wall = RoomScene["walls"][number];
export const uid = () => crypto.randomUUID();
export const mmToM = (n: number) => n / 1000;
export const mToMm = (n: number) => n * 1000;
export const toBlender = ([x, y, z]: number[]) => [
  x / 1000,
  -z / 1000,
  y / 1000,
];
export const fromBlender = ([x, y, z]: number[]) => [
  x * 1000,
  z * 1000,
  -y * 1000,
];
export function readScene(value: unknown): RoomScene {
  const old =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const s = sceneSchema.parse(
    old?.schema === "RoomFit3D" && [1, 2].includes(Number(old.version))
      ? { ...old, version: 3 }
      : value,
  );
  if (s.floorPlan) {
    const p = s.floorPlan;
    const length = Math.hypot(
      p.calibration.b.x - p.calibration.a.x,
      p.calibration.b.y - p.calibration.a.y,
    );
    if (
      length < 10 ||
      Math.abs(length * p.mmPerPixel - p.calibration.distanceMm) > 0.01
    )
      throw new Error("底图比例与校准记录不一致，请重新校准");
    if (p.page > p.pageCount) throw new Error("底图页码无效");
    for (const q of [
      p.calibration,
      ...(p.crossCheck ? [p.crossCheck] : []),
      ...p.candidates,
    ])
      if ([q.a, q.b].some((v) => v.x > p.width || v.y > p.height))
        throw new Error("底图坐标超出图片");
  }
  const ids = [...s.walls, ...s.openings, ...s.furniture, ...s.rooms].map(
    (o) => o.id,
  );
  if (new Set(ids).size !== ids.length) throw new Error("对象 ID 重复");
  for (const w of s.walls)
    if (Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z) < 1)
      throw new Error("墙体长度必须大于 1 mm");
  for (const o of s.openings) {
    const w = s.walls.find((w) => w.id === o.wallId);
    if (!w) throw new Error("门窗引用了不存在的墙");
    const length = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
    if (
      o.offset - o.width / 2 < 0 ||
      o.offset + o.width / 2 > length ||
      o.sill + o.height > w.height
    )
      throw new Error("门窗超出所属墙体");
  }
  for (const f of s.furniture) {
    if(f.assetId){const a=s.assets[f.assetId];if(!a)throw new Error('Missing furniture asset');const mesh=readMeshAsset(a.data),ratios=[f.width/mesh.size[0],f.height/mesh.size[1],f.depth/mesh.size[2]];if(Math.max(...ratios)-Math.min(...ratios)>Math.max(...ratios)*.02)throw new Error('GLB 必须保持原始比例 / Preserve GLB aspect ratio');}
    if (
      catalog.find(c=>c.id===f.catalogId)?.family === "bed" &&
      (f.width < 400 || f.depth < 600 || f.height < 300)
    )
      throw new Error("床的最小结构尺寸为 400 × 600 × 300 mm");
  }
  for (const f of s.furniture) {
    if (f.support && (!s.furniture.some(p=>p.id===f.support!.parentId)||f.support.parentId===f.id)) throw new Error("Invalid furniture support");
    const seen=new Set([f.id]); let p=f;
    while(p.support){ if(seen.has(p.support.parentId))throw new Error("Cyclic support"); seen.add(p.support.parentId);p=s.furniture.find(q=>q.id===p.support!.parentId)!; }
  }
  return s;
}
export function createRoom(
  width = 3600,
  depth = 3200,
  height = 2800,
  thickness = 120,
  shape: "rectangle" | "L" = "rectangle",
): RoomScene {
  if (
    ![width, depth, height, thickness].every(
      (n) => Number.isFinite(n) && n >= 50 && n <= 100000,
    )
  )
    throw new Error("请输入有效房间尺寸");
  const polygon =
    shape === "rectangle"
      ? [
          { x: 0, z: 0 },
          { x: width, z: 0 },
          { x: width, z: depth },
          { x: 0, z: depth },
        ]
      : [
          { x: 0, z: 0 },
          { x: width, z: 0 },
          { x: width, z: depth * 0.55 },
          { x: width * 0.6, z: depth * 0.55 },
          { x: width * 0.6, z: depth },
          { x: 0, z: depth },
        ];
  // Place wall centrelines outside the exact finished interior polygon.
  const centers = polygon.map((p, i) => {
    const a = polygon[(i + polygon.length - 1) % polygon.length],
      b = polygon[(i + 1) % polygon.length];
    const prev = { x: p.x - a.x, z: p.z - a.z },
      next = { x: b.x - p.x, z: b.z - p.z };
    const l1 = Math.hypot(prev.x, prev.z),
      l2 = Math.hypot(next.x, next.z);
    const n1 = { x: prev.z / l1, z: -prev.x / l1 },
      n2 = { x: next.z / l2, z: -next.x / l2 };
    const scale = thickness / 2 / (1 + n1.x * n2.x + n1.z * n2.z);
    return { x: p.x + (n1.x + n2.x) * scale, z: p.z + (n1.z + n2.z) * scale };
  });
  const walls = centers.map((start, i) => ({
    id: uid(),
    start,
    end: centers[(i + 1) % centers.length],
    thickness,
    height,
    color: "#eeeae2",
    locked: false,
  }));
  const now = new Date().toISOString();
  return readScene({
    schema: "RoomFit3D",
    version: 3,
    units: "mm",
    coordinates: "RH-Y-up-X-right-Z-plan-down",
    id: uid(),
    name: "我的卧室",
    author: "Links Tam",
    createdAt: now,
    modifiedAt: now,
    dimensionConfidence: "confirmed",
    rooms: [
      { id: uid(), name: "卧室", polygon, height, confidence: "confirmed" },
    ],
    walls,
    openings: [
      {
        id: uid(),
        wallId: walls[2].id,
        kind: "door",
        offset: 650,
        width: 850,
        height: 2100,
        sill: 0,
        swing: "left",
      },
      {
        id: uid(),
        wallId: walls[0].id,
        kind: "window",
        offset: (width + thickness) / 2,
        width: Math.min(1600, width * 0.5),
        height: 1450,
        sill: 850,
        swing: "left",
      },
    ],
    furniture: [],
    materials: {
      floor: {
        kind: "wood",
        color: "#ac8155",
        roughness: 0.48,
        metalness: 0,
        tileMm: 600,
      },
      wall: {
        kind: "paint",
        color: "#eeeae2",
        roughness: 0.82,
        metalness: 0,
        tileMm: 600,
      },
    },
    camera: {
      position: [width * 0.94, 1550, depth * 0.94],
      target: [width * 0.4, 950, depth * 0.24],
      fov: 62,
    },
    render: {
      preset: "day",
      width: 1920,
      height: 1080,
      samples: 64,
      exposure: 0,
    },
    clearanceTarget: 600,
    assets: {},
    notes: ["日照为示意照明，未进行地理方位分析。"],
  });
}
export { catalog } from "./catalog";
export function addItem(
  s: RoomScene,
  catalogId: string,
  x = 1800,
  z = 1400,
): Furniture {
  const def = catalog.find((o) => o.id === catalogId);
  if (!def) throw new Error("未知家具");
  const item: Furniture = {
    id: uid(),
    name: def.name,
    catalogId,
    width: def.w,
    depth: def.d,
    height: def.h,
    x,
    y: 0,
    z,
    rotation: 0,
    color: def.color,
    confidence: "estimated",
    locked: false,
    brand: "",
    model: "",
    sourceUrl: "",
    ...(["lamp","rgb","monitor"].includes(def.family)?{light:{enabled:true,color:def.family==="monitor"?"#6c92bd":"#9365ff",intensity:def.family==="monitor"?0.4:2}}:{}),
  };
  s.furniture.push(item);
  return item;
}
export function bedroom(): RoomScene {
  const s = createRoom();
  s.name = "标准卧室 · 方案 A";
  addItem(s, "bed_queen", 1450, 1180);
  addItem(s, "nightstand", 300, 400);
  addItem(s, "nightstand", 2600, 400);
  addItem(s, "wardrobe", 900, 2850);
  addItem(s, "desk", 3250, 1000).rotation = 90;
  addItem(s, "curtain", 1800, 60);
  return s;
}
