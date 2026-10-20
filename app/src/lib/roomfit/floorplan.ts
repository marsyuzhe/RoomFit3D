import {
  createRoom,
  floorPlanSchema,
  readScene,
  uid,
  type FloorPlan,
  type RoomScene,
} from "./scene";
import { toOpenPlan, fromOpenPlan } from "./openplanAdapter";
import { detectRooms } from "$lib/utils/roomDetection";

export type PixelPoint = { x: number; y: number };
export type WallCandidate = FloorPlan["candidates"][number];
export function calibratedScale(
  a: PixelPoint,
  b: PixelPoint,
  distanceMm: number,
) {
  const pixels = Math.hypot(b.x - a.x, b.y - a.y);
  if (pixels < 10)
    throw new Error("校准两点至少间隔 10 像素，请选取较长的已知尺寸");
  if (!Number.isFinite(distanceMm) || distanceMm < 50 || distanceMm > 100000)
    throw new Error("已知长度须为 50–100000 mm");
  const scale = distanceMm / pixels;
  if (scale > 1000) throw new Error("比例过大，请检查单位和所选两点");
  return scale;
}
export function checkDeviation(
  scale: number,
  a: PixelPoint,
  b: PixelPoint,
  distanceMm: number,
) {
  calibratedScale(a, b, distanceMm);
  const actualMm = Math.hypot(b.x - a.x, b.y - a.y) * scale;
  return { actualMm, percent: (actualMm / distanceMm - 1) * 100 };
}

/** Long dark runs in both axes, grouped into filled bands. Thin dimension lines
 * are filtered by band thickness. This is an editable proposal, not semantic AI. */
export function detectWallCandidates(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: { threshold: number; minLength: number; minThickness: number },
): WallCandidate[] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2400 ||
    height > 2400 ||
    rgba.length !== width * height * 4
  )
    throw new Error("识别图片尺寸无效");
  const { threshold, minLength, minThickness } = options;
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 255 ||
    !Number.isFinite(minLength) ||
    minLength < 10 ||
    minLength > 2400 ||
    !Number.isFinite(minThickness) ||
    minThickness < 1 ||
    minThickness > 400
  )
    throw new Error("识别参数无效");
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < binary.length; i++) {
    const alpha = rgba[i * 4 + 3] / 255;
    const gray =
      (0.2126 * rgba[i * 4] +
        0.7152 * rgba[i * 4 + 1] +
        0.0722 * rgba[i * 4 + 2]) *
        alpha +
      255 * (1 - alpha);
    binary[i] = gray < threshold ? 1 : 0;
  }
  type Band = {
    first: number;
    last: number;
    start: number;
    end: number;
    count: number;
  };
  const output: WallCandidate[] = [];
  for (const horizontal of [true, false]) {
    const across = horizontal ? height : width,
      along = horizontal ? width : height;
    let active: Band[] = [];
    const finish = (b: Band) => {
      const thickness = b.last - b.first + 1;
      if (thickness < minThickness || thickness > 400) return;
      const start = b.start / b.count,
        end = b.end / b.count,
        center = (b.first + b.last) / 2;
      if (end - start < minLength || end - start < thickness * 3) return;
      const a = horizontal ? { x: start, y: center } : { x: center, y: start };
      const z = horizontal ? { x: end, y: center } : { x: center, y: end };
      output.push({
        id: uid(),
        a,
        b: z,
        thickness,
        accepted: true,
        origin: "detected",
      });
    };
    for (let row = 0; row < across; row++) {
      const runs: { start: number; end: number }[] = [];
      let start = -1,
        lastInk = -1;
      for (let col = 0; col <= along; col++) {
        const ink =
          col < along &&
          binary[horizontal ? row * width + col : col * width + row];
        if (ink) {
          if (start < 0) start = col;
          lastInk = col;
        }
        // Bridge only tiny scan/compression gaps, never infer a doorway.
        if ((!ink && col - lastInk > 2) || col === along) {
          if (start >= 0 && lastInk - start + 1 >= minLength)
            runs.push({ start, end: lastInk + 1 });
          start = -1;
        }
      }
      const used = new Set<Band>();
      for (const run of runs) {
        const match = active.find(
          (b) =>
            !used.has(b) &&
            b.last === row - 1 &&
            Math.abs(b.start / b.count - run.start) <=
              Math.max(3, minThickness * 2) &&
            Math.abs(b.end / b.count - run.end) <=
              Math.max(3, minThickness * 2),
        );
        if (match) {
          match.last = row;
          match.start += run.start;
          match.end += run.end;
          match.count++;
          used.add(match);
        } else {
          const b = { first: row, last: row, ...run, count: 1 };
          active.push(b);
          used.add(b);
        }
      }
      active = active.filter((b) => {
        if (!used.has(b)) {
          finish(b);
          return false;
        }
        return true;
      });
    }
    active.forEach(finish);
  }
  return output
    .sort(
      (a, b) =>
        Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) -
        Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y),
    )
    .slice(0, 500);
}

/** Snap only perpendicular endpoint-to-axis junctions within an explicit radius. */
export function connectCandidates(
  candidates: WallCandidate[],
  radius: number,
): WallCandidate[] {
  const next = candidates.map((c) => ({ ...c, a: { ...c.a }, b: { ...c.b } }));
  if (!Number.isFinite(radius) || radius < 0 || radius > 100)
    throw new Error("连接半径须为 0–100 px");
  for (const wall of next.filter((c) => c.accepted)) {
    const horizontal = Math.abs(wall.b.y - wall.a.y) < 0.01;
    const vertical = Math.abs(wall.b.x - wall.a.x) < 0.01;
    if (!horizontal && !vertical) continue;
    for (const end of [wall.a, wall.b]) {
      let nearest: PixelPoint | null = null,
        best = radius + 0.001;
      for (const other of candidates.filter(
        (c) => c.accepted && c.id !== wall.id,
      )) {
        const perpendicular = horizontal
          ? Math.abs(other.b.x - other.a.x) < 0.01
          : Math.abs(other.b.y - other.a.y) < 0.01;
        if (!perpendicular) continue;
        const p = horizontal
          ? { x: other.a.x, y: end.y }
          : { x: end.x, y: other.a.y };
        const extension = horizontal
          ? Math.max(
              Math.min(other.a.y, other.b.y) - p.y,
              p.y - Math.max(other.a.y, other.b.y),
              0,
            )
          : Math.max(
              Math.min(other.a.x, other.b.x) - p.x,
              p.x - Math.max(other.a.x, other.b.x),
              0,
            );
        const d = Math.hypot(p.x - end.x, p.y - end.y);
        if (extension <= radius && d < best) {
          best = d;
          nearest = p;
        }
      }
      if (nearest) Object.assign(end, nearest);
    }
  }
  return next;
}

export function sceneFromFloorPlan(
  plan: FloorPlan,
  height: number,
  confirmed: boolean,
): RoomScene {
  const p = floorPlanSchema.parse(plan);
  if (confirmed && !p.crossCheck)
    throw new Error("确认比例前须记录第二处独立尺寸复核");
  if (
    p.crossCheck &&
    Math.abs(
      checkDeviation(
        p.mmPerPixel,
        p.crossCheck.a,
        p.crossCheck.b,
        p.crossCheck.distanceMm,
      ).percent,
    ) > 3
  )
    throw new Error("复核尺寸偏差超过 3%，请重新校准或更换未变形图纸");
  const s = createRoom(3600, 3200, height, 120);
  s.name = p.name.replace(/\.[^.]+$/, "") || "图纸工程";
  s.dimensionConfidence = confirmed ? "confirmed" : "estimated";
  s.furniture = [];
  s.openings = [];
  s.floorPlan = p;
  s.walls = p.candidates
    .filter((c) => c.accepted)
    .map((c) => ({
      id: uid(),
      start: {
        x: p.position.x + c.a.x * p.mmPerPixel,
        z: p.position.z + c.a.y * p.mmPerPixel,
      },
      end: {
        x: p.position.x + c.b.x * p.mmPerPixel,
        z: p.position.z + c.b.y * p.mmPerPixel,
      },
      thickness: c.thickness * p.mmPerPixel,
      height,
      color: s.materials.wall.color,
      locked: false,
    }));
  const project = toOpenPlan(s);
  if (!detectRooms(project.floors[0].walls).length)
    throw new Error(
      "候选墙线尚未闭合。请连接端点、补线，或先附加底图继续人工描墙",
    );
  const result = fromOpenPlan(project, s);
  for (const r of result.rooms) r.confidence = s.dimensionConfidence;
  const ps = result.rooms.flatMap((r) => r.polygon),
    loX = Math.min(...ps.map((v) => v.x)),
    hiX = Math.max(...ps.map((v) => v.x)),
    loZ = Math.min(...ps.map((v) => v.z)),
    hiZ = Math.max(...ps.map((v) => v.z));
  result.camera.position = [
    hiX - (hiX - loX) * 0.08,
    1550,
    hiZ - (hiZ - loZ) * 0.08,
  ];
  result.camera.target = [
    loX + (hiX - loX) * 0.4,
    950,
    loZ + (hiZ - loZ) * 0.25,
  ];
  result.notes.push(
    `本地底图：${p.name}，第 ${p.page}/${p.pageCount} 页；墙线为辅助候选，经人工取舍。门窗待手工确认。`,
  );
  return readScene(result);
}
