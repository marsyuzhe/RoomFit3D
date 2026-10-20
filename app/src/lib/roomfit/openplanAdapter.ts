import type { Project, Floor } from "$lib/models/types";
import { detectRooms, getRoomPolygon } from "$lib/utils/roomDetection";
import { getCatalogItem } from "$lib/utils/furnitureCatalog";
import clipping from "polygon-clipping";
import { readScene, type RoomScene, uid } from "./scene";
export function toOpenPlan(s: RoomScene): Project {
  const floor: Floor = {
    id: s.id + "-floor",
    name: "一层",
    level: 0,
    walls: s.walls.map((w) => ({
      id: w.id,
      start: { x: w.start.x / 10, y: w.start.z / 10 },
      end: { x: w.end.x / 10, y: w.end.z / 10 },
      thickness: w.thickness / 10,
      height: w.height / 10,
      color: w.color,
    })),
    doors: [],
    windows: [],
    rooms: [],
    furniture: s.furniture.map((f) => ({
      id: f.id,
      catalogId: f.catalogId,
      position: { x: f.x / 10, y: f.z / 10 },
      rotation: -f.rotation,
      scale: { x: 1, y: 1, z: 1 },
      width: f.width / 10,
      depth: f.depth / 10,
      height: f.height / 10,
      color: f.color,
      locked: f.locked,
    })),
    stairs: [],
    columns: [],
    guides: [],
    measurements: [],
    annotations: [],
    textAnnotations: [],
    groups: [],
  };
  if (s.floorPlan) {
    const p = s.floorPlan;
    floor.backgroundImage = {
      dataUrl: p.dataUrl,
      position: {
        x: (p.position.x + (p.width * p.mmPerPixel) / 2) / 10,
        y: (p.position.z + (p.height * p.mmPerPixel) / 2) / 10,
      },
      scale: p.mmPerPixel / 10,
      opacity: p.opacity,
      rotation: 0,
      locked: true,
    };
  }
  for (const o of s.openings) {
    const w = s.walls.find((w) => w.id === o.wallId)!;
    const position =
      o.offset / Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
    if (o.kind === "door")
      floor.doors.push({
        id: o.id,
        wallId: o.wallId,
        position,
        width: o.width / 10,
        height: o.height / 10,
        type: "single",
        swingDirection: o.swing,
        flipSide: false,
      });
    else
      floor.windows.push({
        id: o.id,
        wallId: o.wallId,
        position,
        width: o.width / 10,
        height: o.height / 10,
        sillHeight: o.sill / 10,
        type: "standard",
      });
  }
  floor.rooms = detectRooms(floor.walls);
  return {
    id: s.id,
    name: s.name,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.modifiedAt),
    activeFloorId: floor.id,
    floors: [floor],
  };
}
export function fromOpenPlan(project: Project, previous: RoomScene): RoomScene {
  const floor = project.floors[0];
  const s = structuredClone(previous);
  if (floor.backgroundImage) {
    const bg = floor.backgroundImage;
    if (
      !s.floorPlan ||
      bg.dataUrl !== s.floorPlan.dataUrl ||
      Math.abs(bg.scale * 10 - s.floorPlan.mmPerPixel) > 1e-6 ||
      bg.rotation !== 0
    )
      throw new Error("请通过“导入图纸”修改底图并记录毫米校准");
    s.floorPlan.position = {
      x: bg.position.x * 10 - (s.floorPlan.width * s.floorPlan.mmPerPixel) / 2,
      z: bg.position.y * 10 - (s.floorPlan.height * s.floorPlan.mmPerPixel) / 2,
    };
    s.floorPlan.opacity = bg.opacity;
  }
  s.modifiedAt = new Date().toISOString();
  s.walls = floor.walls.map((w) => ({
    id: w.id,
    start: { x: w.start.x * 10, z: w.start.y * 10 },
    end: { x: w.end.x * 10, z: w.end.y * 10 },
    thickness: w.thickness * 10,
    height: w.height * 10,
    color: w.color,
    locked: previous.walls.find((p) => p.id === w.id)?.locked || false,
  }));
  const length = (id: string) => {
    const w = s.walls.find((w) => w.id === id)!;
    return Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
  };
  s.openings = [
    ...floor.doors.map((o) => ({
      id: o.id,
      wallId: o.wallId,
      kind: "door" as const,
      offset: o.position * length(o.wallId),
      width: o.width * 10,
      height: o.height * 10,
      sill: 0,
      swing: o.swingDirection,
    })),
    ...floor.windows.map((o) => ({
      id: o.id,
      wallId: o.wallId,
      kind: "window" as const,
      offset: o.position * length(o.wallId),
      width: o.width * 10,
      height: o.height * 10,
      sill: o.sillHeight * 10,
      swing: "left" as const,
    })),
  ];
  s.furniture = floor.furniture.map((f) => {
    const old = s.furniture.find((p) => p.id === f.id),
      def = getCatalogItem(f.catalogId);
    return {
      id: f.id,
      name: old?.name || def?.name || "家具",
      catalogId: f.catalogId,
      width: (f.width ?? def?.width ?? 100) * 10,
      depth: (f.depth ?? def?.depth ?? 100) * 10,
      height: (f.height ?? def?.height ?? 100) * 10,
      x: f.position.x * 10,
      y: old?.y || 0,
      z: f.position.y * 10,
      rotation: -f.rotation,
      color: f.color || old?.color || "#aaaaaa",
      confidence: old?.confidence || "estimated",
      locked: f.locked || false,
      brand: old?.brand || "",
      model: old?.model || "",
      sourceUrl: old?.sourceUrl || "",
      ...(old?.assetId ? { assetId: old.assetId } : {}),
      ...(old?.support ? {support:old.support}:{}),
      ...(old?.light ? {light:old.light}:{}),
      ...(old?.modules ? {modules:old.modules}:{}),
    };
  });
  const rooms = detectRooms(floor.walls);
  const footprints = s.walls.map((w) => {
    const dx = w.end.x - w.start.x,
      dz = w.end.z - w.start.z,
      l = Math.hypot(dx, dz),
      h = w.thickness / 2;
    return [
      [
        [-h, -h],
        [l + h, -h],
        [l + h, h],
        [-h, h],
        [-h, -h],
      ].map(
        ([along, across]) =>
          [
            w.start.x + (along * dx) / l - (across * dz) / l,
            w.start.z + (along * dz) / l + (across * dx) / l,
          ] as [number, number],
      ),
    ];
  });
  if (rooms.length) {
    s.rooms = rooms.flatMap((r, i) => {
      const p = getRoomPolygon(r, floor.walls).map(
        (p) => [p.x * 10, p.y * 10] as [number, number],
      );
      const clear = clipping.difference([p], ...footprints);
      return clear.map((poly, j) => {
        if (poly.length > 1)
          throw new Error("带内部孔洞的房间暂不支持回传，请保留当前工程");
        const polygon = poly[0].slice(0, -1).map(([x, z]) => ({ x, z }));
        return {
          id: previous.rooms[i]?.id || uid(),
          name: previous.rooms[i]?.name || `房间 ${i + 1}-${j + 1}`,
          polygon,
          height: s.walls[0]?.height || 2800,
          confidence: s.dimensionConfidence,
        };
      });
    });
  }
  return readScene(s);
}
