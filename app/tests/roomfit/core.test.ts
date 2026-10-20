import { describe, it, expect } from "vitest";
import {
  createRoom,
  bedroom,
  addItem,
  readScene,
  mmToM,
  mToMm,
  toBlender,
  fromBlender,
} from "../../src/lib/roomfit/scene";
import {
  area,
  footprint,
  overlaps,
  distance,
  analyze,
} from "../../src/lib/roomfit/geometry";
import {
  encodeScene,
  decodeScene,
  History,
} from "../../src/lib/roomfit/storage";
import {
  buildScene,
  renderManifest,
  dispose,
} from "../../src/lib/roomfit/buildScene";
import { Box3, Vector3, Mesh } from "three";
import { writeFileSync, mkdirSync } from "node:fs";
function stable<T>(value: T): T {
  const ids = new Map<string, string>();
  return JSON.parse(
    JSON.stringify(value)
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        (id) => {
          if (!ids.has(id)) ids.set(id, `sample-${ids.size}`);
          return ids.get(id)!;
        },
      )
      .replace(
        /2026-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g,
        "2026-10-19T12:00:00.000Z",
      ),
  );
}
describe("RoomFit precision geometry", () => {
  it("keeps the finished floor at Y=0 and preserves clear room height", () => {
    const s = bedroom(),
      root = buildScene(s, true);
    const boards = root.children.filter((c) => c.name === "floor-plank");
    for (const board of boards)
      expect(new Box3().setFromObject(board).max.y).toBeCloseTo(0, 6);
    const bed = root.children.find((c) => c.name === s.furniture[0].id)!;
    expect(new Box3().setFromObject(bed).min.y).toBeCloseTo(0, 6);
    const ceiling = root.children.find((c) => c.name === "ceiling")!;
    expect(new Box3().setFromObject(ceiling).min.y).toBeCloseTo(2.8, 6);
    dispose(root);
  });
  it("maintains bed bounds for a low frame and a compact bed", () => {
    for (const [width, depth, height] of [
      [1200, 1900, 650],
      [400, 600, 300],
    ]) {
      const s = createRoom(),
        f = addItem(s, "bed_twin");
      Object.assign(f, { width, depth, height });
      const root = buildScene(s);
      const size = new Box3()
        .setFromObject(root.children.find((c) => c.name === f.id)!)
        .getSize(new Vector3());
      expect(size.x * 1000).toBeCloseTo(width, 2);
      expect(size.y * 1000).toBeCloseTo(height, 2);
      expect(size.z * 1000).toBeCloseTo(depth, 2);
      dispose(root);
    }
  });
  it("converts mm and metres without changing dimensions", () => {
    expect(mmToM(3600)).toBe(3.6);
    expect(mToMm(3.6)).toBe(3600);
  });
  it("converts right-handed Y up to Blender Z up and back", () => {
    const p = [1234, 2876, -431];
    expect(fromBlender(toBlender(p))).toEqual(p);
    expect(toBlender([1000, 2000, 3000])).toEqual([1, -3, 2]);
  });
  it("creates exact finished interior dimensions with outward walls", () => {
    const s = createRoom();
    expect(area(s.rooms[0].polygon)).toBe(11520000);
    expect(s.walls[0].start).toEqual({ x: -60, z: -60 });
    expect(s.walls[0].end).toEqual({ x: 3660, z: -60 });
    expect(
      Math.hypot(
        s.walls[0].end.x - s.walls[0].start.x,
        s.walls[0].end.z - s.walls[0].start.z,
      ),
    ).toBe(3720);
  });
  it("creates a closed L shaped room, not a rectangular envelope", () => {
    const s = createRoom(6000, 5000, 2800, 120, "L");
    expect(s.rooms[0].polygon).toHaveLength(6);
    expect(area(s.rooms[0].polygon)).toBe(24600000);
    s.walls.forEach((w, i) =>
      expect(w.end).toEqual(s.walls[(i + 1) % s.walls.length].start),
    );
  });
  it("honors furniture rotation in collision and distance", () => {
    const a = { x: 0, z: 0, width: 2000, depth: 400, rotation: 45 };
    const b = { x: 600, z: 600, width: 200, depth: 200, rotation: 0 };
    expect(overlaps(footprint(a), footprint(b))).toBe(false);
    expect(overlaps(footprint({ ...a, rotation: -45 }), footprint(b))).toBe(
      true,
    );
    expect(
      distance(
        footprint({ x: 0, z: 0, width: 100, depth: 100, rotation: 0 }),
        footprint({ x: 300, z: 0, width: 100, depth: 100, rotation: 0 }),
      ),
    ).toBeCloseTo(200, 6);
  });
  it("detects room escape, rotated furniture intersections, and estimate status", () => {
    const s = createRoom();
    addItem(s, "bed_queen", 0, 1000);
    expect(analyze(s).some((f) => f.message.includes("越出"))).toBe(true);
    addItem(s, "desk", 200, 1000);
    expect(analyze(s).some((f) => f.message.includes("碰撞"))).toBe(true);
    expect(analyze(s).some((f) => f.message.includes("待确认"))).toBe(true);
  });
  it("detects a blocked door sweep", () => {
    const s = createRoom();
    const door = s.openings.find((o) => o.kind === "door")!,
      w = s.walls.find((w) => w.id === door.wallId)!;
    const x = w.start.x - door.offset;
    addItem(s, "nightstand", x, 2900);
    expect(analyze(s).some((f) => f.message.includes("门扇"))).toBe(true);
  });
  it("cuts real openings and conserves wall face area", () => {
    const s = createRoom(),
      root = buildScene(s);
    const wall = s.walls[0],
      group = root.children.find((c) => c.name === wall.id)!;
    let faceArea = 0;
    group.children
      .filter((c) => c.name === "wall")
      .forEach((c) => {
        const box = new Box3().setFromObject(c),
          size = box.getSize(new Vector3());
        faceArea += size.x * size.y;
      });
    expect(faceArea).toBeCloseTo(3.72 * 2.8 - 1.6 * 1.45, 5);
    dispose(root);
  });
  it("preserves bed outer dimensions with parameterized structure", () => {
    const s = createRoom(),
      f = addItem(s, "bed_queen");
    const root = buildScene(s),
      obj = root.children.find((c) => c.name === f.id)!;
    const size = new Box3().setFromObject(obj).getSize(new Vector3());
    expect(size.x * 1000).toBeCloseTo(f.width, 2);
    expect(size.z * 1000).toBeCloseTo(f.depth, 2);
    expect(size.y * 1000).toBeCloseTo(f.height, 2);
    expect(obj.children.filter((c) => c.name === "bed-leg")).toHaveLength(4);
    expect(obj.children.filter((c) => c.name === "linen-pillow")).toHaveLength(
      2,
    );
    dispose(root);
  });
  it("saves and reloads all scene values and geometry", () => {
    const s = bedroom(),
      loaded = decodeScene(encodeScene(s));
    expect(loaded).toEqual(s);
    expect(renderManifest(loaded)).toEqual(renderManifest(s));
  });
  it("supports bounded undo and redo", () => {
    const s = createRoom(),
      h = new History();
    h.push(s);
    s.name = "B";
    const a = h.undo(s);
    expect(a.name).toBe("我的卧室");
    expect(h.redo(a).name).toBe("B");
  });
  it("rejects invalid values and unsupported project versions", () => {
    const s = createRoom();
    expect(() => readScene({ ...s, version: 9 })).toThrow();
    expect(() => readScene({ ...s, units: "m" })).toThrow();
    expect(() =>
      readScene({ ...s, furniture: [{ ...addItem(s, "desk"), width: -1 }] }),
    ).toThrow();
    expect(() =>
      readScene({ ...s, openings: [{ ...s.openings[0], wallId: "missing" }] }),
    ).toThrow();
  });
  it("exports identical world vertices for Cycles with a single axis transform", () => {
    const s = bedroom(),
      root = buildScene(s, true),
      manifest = renderManifest(s);
    let i = 0;
    root.traverse((o) => {
      if (!(o instanceof Mesh) || !o.visible) return;
      const p = o.geometry.getAttribute("position"),
        v = new Vector3().fromBufferAttribute(p, 0).applyMatrix4(o.matrixWorld);
      expect(manifest.meshes[i++].vertices[0]).toEqual([v.x, -v.z, v.y]);
    });
    expect(manifest.meshes).toHaveLength(i);
    dispose(root);
  });
  it("writes reproducible sample projects and a real render input", () => {
    mkdirSync("../samples", { recursive: true });
    mkdirSync("../evidence", { recursive: true });
    const s = stable(bedroom());
    writeFileSync("../samples/A-standard-bedroom.roomfit", encodeScene(s));
    const b = createRoom(6000, 5000, 2800, 120, "L");
    b.name = "L 形客餐厅";
    addItem(b, "sofa", 1800, 850);
    addItem(b, "coffee_table", 1800, 1900);
    addItem(b, "dining_table", 1800, 3700);
    writeFileSync("../samples/B-living-dining.roomfit", encodeScene(stable(b)));
    const sample = {
      ...s,
      render: { ...s.render, width: 1920, height: 1080, samples: 64 },
    };
    writeFileSync(
      "../evidence/v020-bedroom-day.scene.json",
      JSON.stringify(renderManifest(sample)),
    );
    writeFileSync(
      "../evidence/v020-bedroom-night.scene.json",
      JSON.stringify(
        renderManifest({
          ...sample,
          render: { ...sample.render, preset: "night" },
        }),
      ),
    );
    expect(analyze(s).filter((f) => f.severity === "error")).toEqual([]);
  });
});
