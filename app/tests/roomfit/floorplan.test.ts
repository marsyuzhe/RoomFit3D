import { describe, it, expect } from "vitest";
import {
  calibratedScale,
  checkDeviation,
  detectWallCandidates,
  connectCandidates,
  sceneFromFloorPlan,
  type WallCandidate,
} from "../../src/lib/roomfit/floorplan";
import {
  bedroom,
  readScene,
  type FloorPlan,
} from "../../src/lib/roomfit/scene";
import { encodeScene, decodeScene } from "../../src/lib/roomfit/storage";
import {
  toOpenPlan,
  fromOpenPlan,
} from "../../src/lib/roomfit/openplanAdapter";
import { area } from "../../src/lib/roomfit/geometry";
import { buildScene, dispose } from "../../src/lib/roomfit/buildScene";
const line = (
  id: string,
  x: number,
  y: number,
  u: number,
  v: number,
): WallCandidate => ({
  id,
  a: { x, y },
  b: { x: u, y: v },
  thickness: 12,
  accepted: true,
  origin: "manual",
});
const plan = (): FloorPlan => ({
  name: "calibrated.png",
  page: 1,
  pageCount: 1,
  width: 500,
  height: 400,
  dataUrl: "data:image/png;base64,AAAA",
  mmPerPixel: 10,
  position: { x: -1000, z: 2000 },
  opacity: 0.45,
  calibration: { a: { x: 40, y: 40 }, b: { x: 440, y: 40 }, distanceMm: 4000 },
  crossCheck: { a: { x: 40, y: 40 }, b: { x: 40, y: 340 }, distanceMm: 3000 },
  candidates: [
    line("a", 40, 40, 440, 40),
    line("b", 440, 40, 440, 340),
    line("c", 440, 340, 40, 340),
    line("d", 40, 340, 40, 40),
  ],
});
describe("floorplan import and calibrated candidate geometry", () => {
  it("uses Euclidean calibration and reports independent mismatch without distorting geometry", () => {
    expect(calibratedScale({ x: 0, y: 0 }, { x: 300, y: 400 }, 5000)).toBe(10);
    expect(
      checkDeviation(10, { x: 0, y: 0 }, { x: 0, y: 300 }, 3000).percent,
    ).toBe(0);
    expect(
      checkDeviation(10, { x: 0, y: 0 }, { x: 0, y: 300 }, 2800).percent,
    ).toBeCloseTo(7.142857);
    expect(() =>
      calibratedScale({ x: 0, y: 0 }, { x: 1, y: 0 }, 5000),
    ).toThrow();
    expect(() =>
      calibratedScale({ x: 0, y: 0 }, { x: 100, y: 0 }, NaN),
    ).toThrow();
  });
  it("finds real raster bands, ignores thin dimensions and transparent pixels", () => {
    const w = 240,
      h = 190,
      pixels = new Uint8ClampedArray(w * h * 4).fill(255);
    const rect = (
      x: number,
      y: number,
      dx: number,
      dy: number,
      alpha = 255,
    ) => {
      for (let j = y; j < y + dy; j++)
        for (let i = x; i < x + dx; i++)
          pixels.set([0, 0, 0, alpha], (j * w + i) * 4);
    };
    rect(20, 20, 180, 8);
    rect(20, 130, 180, 8);
    rect(20, 20, 8, 118);
    rect(192, 20, 8, 118);
    rect(10, 155, 200, 1);
    rect(10, 175, 200, 8, 0);
    const lines = detectWallCandidates(pixels, w, h, {
      threshold: 150,
      minLength: 60,
      minThickness: 3,
    });
    expect(lines).toHaveLength(4);
    expect(lines.every((c) => c.thickness === 8)).toBe(true);
    expect(lines.some((c) => c.a.y >= 150)).toBe(false);
    expect(() =>
      detectWallCandidates([], w, h, {
        threshold: 150,
        minLength: 60,
        minThickness: 3,
      }),
    ).toThrow();
  });
  it("connects nearby perpendicular junctions while preserving distant openings and excluded lines", () => {
    const lines = [
      line("a", 20, 20, 190, 20),
      line("b", 200, 30, 200, 130),
      { ...line("c", 210, 140, 30, 140), accepted: false },
    ];
    const next = connectCandidates(lines, 12);
    expect(next[0].b).toEqual({ x: 200, y: 20 });
    expect(next[1].a).toEqual({ x: 200, y: 20 });
    expect(next[2]).toEqual(lines[2]);
    expect(lines[0].b.x).toBe(190);
    expect(connectCandidates(lines, 5)[0].b.x).toBe(190);
  });
  it("builds closed mm geometry and net interior after subtracting wall thickness", () => {
    const s = sceneFromFloorPlan(plan(), 2800, false);
    expect(s.dimensionConfidence).toBe("estimated");
    expect(s.walls).toHaveLength(4);
    expect(s.rooms).toHaveLength(1);
    expect(area(s.rooms[0].polygon)).toBeCloseTo(3880 * 2880);
    expect(s.walls[0].start).toEqual({ x: -600, z: 2400 });
    expect(s.walls[0].thickness).toBe(120);
    expect(s.furniture).toHaveLength(0);
    expect(s.openings).toHaveLength(0);
    const group = buildScene(s);
    expect(group.children.some((c) => c.name.startsWith("floor-"))).toBe(true);
    dispose(group);
    expect(sceneFromFloorPlan(plan(), 2800, true).dimensionConfidence).toBe(
      "confirmed",
    );
  });
  it("rejects open chains and failed second dimensions instead of silently inventing a room", () => {
    const p = plan();
    p.candidates.pop();
    expect(() => sceneFromFloorPlan(p, 2800, false)).toThrow(/闭合/);
    const q = plan();
    q.crossCheck!.distanceMm = 2000;
    expect(() => sceneFromFloorPlan(q, 2800, true)).toThrow(/偏差/);
  });
  it("persists image, calibration, edits and exact background centre through adapter and file roundtrip", () => {
    const s = bedroom();
    s.floorPlan = plan();
    const project = toOpenPlan(s),
      bg = project.floors[0].backgroundImage!;
    expect(bg.scale).toBe(1);
    expect(bg.position).toEqual({ x: 150, y: 400 });
    expect(decodeScene(encodeScene(s)).floorPlan).toEqual(s.floorPlan);
    expect(fromOpenPlan(project, s).floorPlan).toEqual(s.floorPlan);
    bg.position.x += 10;
    expect(fromOpenPlan(project, s).floorPlan!.position.x).toBe(-900);
    bg.scale = 2;
    expect(() => fromOpenPlan(project, s)).toThrow(/校准/);
  });
  it("rejects remote images, altered scale, pixel coordinates outside source, and retains old projects", () => {
    const s = bedroom();
    expect(readScene(s).floorPlan).toBeUndefined();
    const legacy = { ...s, version: 1 };
    expect(readScene(legacy)).toEqual(s);
    expect(JSON.parse(encodeScene(readScene(legacy))).version).toBe(3);
    s.floorPlan = plan();
    s.floorPlan.dataUrl = "https://example.com/a.png";
    expect(() => readScene(s)).toThrow();
    s.floorPlan = plan();
    s.floorPlan.mmPerPixel = 5;
    expect(() => readScene(s)).toThrow(/比例/);
    s.floorPlan = plan();
    s.floorPlan.candidates[0].b.x = 501;
    expect(() => readScene(s)).toThrow(/超出/);
  });
});
