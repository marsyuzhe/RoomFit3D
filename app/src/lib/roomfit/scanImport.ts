import {
  importRoomPlanFloors,
  validateRoomPlan,
} from "$lib/utils/roomplanImport";
import { detectRooms } from "$lib/utils/roomDetection";
import { createRoom, catalog, readScene, type RoomScene } from "./scene";
import { fromOpenPlan } from "./openplanAdapter";
import type ZipTypes from "jszip";
const LIMIT = 30e6;
export type ScanOptions = {
  level: number;
  cleanup: boolean;
  doors: boolean;
  windows: boolean;
  furniture: boolean;
};
export function scanLevels(data: unknown) {
  validateRoomPlan(data);
  const source = data as any,
    levels = new Set<number>(
      (source.walls || []).map((w: any) => w.story ?? 0),
    );
  return [...levels]
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      name:
        source.stories?.find((s: any) => s.index === level)?.name ||
        `Floor ${level}`,
    }));
}
export async function loadScanFile(file: File): Promise<any> {
  if (file.size > LIMIT) throw new Error("扫描文件超过 30 MB");
  let text: string;
  if (/\.zip$/i.test(file.name)) {
    const JSZip = (await import("jszip")).default,
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    const files = Object.values(zip.files).filter((f) => !f.dir);
    if (files.some((f) => /(^|\/)plan\.json$/i.test(f.name)))
      throw new Error(
        "此 ZIP 包含编辑后的 iPhone 工程，请在手机选择 Export Editable Plan (JSON)，避免误导入原始扫描",
      );
    const captures = files.filter((f) => /(^|\/)room\.json$/i.test(f.name));
    if (captures.length !== 1)
      throw new Error("扫描 ZIP 必须恰好包含一个 room.json");
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let size = 0,
        failed = false;
      // Public JSZip API; JSZipObject's bundled typings omit internalStream.
      const entry = captures[0] as unknown as {
        internalStream(
          type: "uint8array",
        ): ZipTypes.JSZipStreamHelper<Uint8Array>;
      };
      const stream = entry.internalStream("uint8array");
      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size > LIMIT) {
          failed = true;
          stream.pause();
          reject(new Error("解压后的扫描 JSON 超过 30 MB"));
          return;
        }
        chunks.push(chunk);
      });
      stream
        .on("error", reject)
        .on("end", () => {
          if (failed) return;
          const out = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(out);
        })
        .resume();
    });
    text = new TextDecoder().decode(bytes);
  } else if (/\.json$/i.test(file.name)) text = await file.text();
  else throw new Error("请选择 RoomPlan JSON 或包含 room.json 的扫描 ZIP");
  const data = JSON.parse(text);
  validateRoomPlan(data);
  if (!scanLevels(data).length) throw new Error("扫描文件中没有墙体");
  return data;
}
export function scanSummary(data: any, level: number) {
  validateRoomPlan(data);
  const same = (v: any) => (v.story ?? 0) === level;
  return {
    walls: data.walls.filter(same).length,
    doors: [...(data.doors || []), ...(data.openings || [])].filter(same)
      .length,
    windows: (data.windows || []).filter(same).length,
    objects: (data.objects || []).filter(same).length,
  };
}
export function sceneFromScan(
  data: any,
  name: string,
  options: ScanOptions,
): { scene: RoomScene; warnings: string[] } {
  validateRoomPlan(data);
  if (JSON.stringify(data).length > LIMIT)
    throw new Error("扫描 JSON 超过 30 MB");
  if (!scanLevels(data).some((s) => s.level === options.level))
    throw new Error("所选楼层不存在");
  const floors = importRoomPlanFloors(data, {
    straighten: options.cleanup,
    orthogonal: false,
    mergeDistance: options.cleanup ? 3 : 0,
    angleTolerance: 5,
  });
  const floor = floors.find((f) => f.level === options.level)!;
  const warnings = ["扫描尺寸为估算，请对关键尺寸现场复测。"];
  if (options.cleanup)
    warnings.push("已启用墙线校正，部分墙体角度和端点经过调整。");
  if (
    options.doors &&
    floor.doors.some((d) => d.type !== "single" || d.flipSide)
  )
    throw new Error(
      "存在通道、特殊门型或外开门。请取消导入门，在墙体工具手工添加；原始数据会保留。",
    );
  if (!options.doors && floor.doors.length)
    warnings.push("门未导入，请在墙体工具中手工补充。");
  floor.doors = options.doors ? floor.doors : [];
  if (
    options.windows &&
    floor.windows.some((w) => w.type !== "standard" && w.type !== "fixed")
  )
    warnings.push("特殊窗型按矩形洞口导入，原始窗型保存在来源文件。");
  floor.windows = options.windows ? floor.windows : [];
  const supported = new Map(catalog.map((c) => [c.id, c]));
  const unsupported = floor.furniture.filter(
    (f) =>
      !supported.has(f.catalogId) ||
      (f.scale?.x ?? 1) !== 1 ||
      (f.scale?.y ?? 1) !== 1,
  );
  if (unsupported.length)
    warnings.push(
      `未导入 ${unsupported.length} 件不支持的家具，原始数据保留。`,
    );
  floor.furniture = options.furniture
    ? floor.furniture.filter((f) => !unsupported.includes(f))
    : [];
  if (!detectRooms(floor.walls).length)
    throw new Error("扫描墙线尚未闭合。可尝试墙线校正，或先在手机补全后导出。");
  const base = createRoom();
  base.dimensionConfidence = "estimated";
  base.furniture = [];
  base.openings = [];
  base.name = name.replace(/\.(json|zip)$/i, "") || "RoomPlan";
  base.rooms[0].name = floor.rooms[0]?.name || floor.name;
  const scene = fromOpenPlan(
    {
      id: base.id,
      name: base.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      activeFloorId: floor.id,
      floors: [floor],
    },
    base,
  );
  for (const [i, r] of scene.rooms.entries()) {
    r.confidence = "estimated";
    r.name = floor.rooms[i]?.name || `${floor.name} ${i + 1}`;
  }
  const same = (v: any) => (v.story ?? 0) === options.level;
  const floorYs = data.walls
    .filter(same)
    .map((w: any) => w.transform[13] - w.dimensions[1] / 2)
    .sort((a: number, b: number) => a - b);
  const floorY = floorYs[Math.floor(floorYs.length / 2)];
  for (const f of scene.furniture) {
    const def = supported.get(f.catalogId)!;
    f.name = def.name;
    f.confidence = "estimated";
    f.rotation = f.rotation || 0;
    const raw = data.objects?.find((o: any) => o.identifier === f.id);
    if (raw) f.y = (raw.transform[13] - raw.dimensions[1] / 2 - floorY) * 1000;
  }
  scene.assets["roomplan-source"] = {
    name,
    data: JSON.stringify(data),
    license:
      "User-provided scan; retain original rights / 用户提供的扫描，原权利不变",
  };
  scene.notes.push(
    `RoomPlan: ${name}; level ${options.level}; imported locally.`,
    ...warnings,
  );
  const points = scene.rooms.flatMap((r) => r.polygon),
    xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    loX = Math.min(...xs),
    hiX = Math.max(...xs),
    loZ = Math.min(...zs),
    hiZ = Math.max(...zs);
  scene.camera.position = [
    hiX - (hiX - loX) * 0.08,
    1550,
    hiZ - (hiZ - loZ) * 0.08,
  ];
  scene.camera.target = [
    loX + (hiX - loX) * 0.4,
    950,
    loZ + (hiZ - loZ) * 0.25,
  ];
  return { scene: readScene(scene), warnings };
}
