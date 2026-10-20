import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import {
  sceneFromScan,
  loadScanFile,
  scanLevels,
} from "../../src/lib/roomfit/scanImport";
import { area } from "../../src/lib/roomfit/geometry";
import { renderManifest } from "../../src/lib/roomfit/buildScene";
import { encodeScene, decodeScene } from "../../src/lib/roomfit/storage";
const options = {
  level: 0,
  cleanup: false,
  doors: true,
  windows: true,
  furniture: true,
};
export function fixture() {
  const transform = (x: number, y: number, z: number, dx = 1, dz = 0) => [
    dx,
    0,
    dz,
    0,
    0,
    1,
    0,
    0,
    -dz || 0,
    0,
    dx,
    0,
    x,
    y,
    z,
    1,
  ];
  const wall = (
    identifier: string,
    x: number,
    z: number,
    length: number,
    dx = 1,
    dz = 0,
  ) => ({
    identifier,
    dimensions: [length, 2.8, 0.12],
    transform: transform(x, 1.4, z, dx, dz),
    category: { wall: {} },
  });
  return {
    openplanPrepared: true,
    walls: [
      wall("north", 2, 0, 4),
      wall("east", 4, 1.5, 3, 0, 1),
      wall("south", 2, 3, 4, -1, 0),
      wall("west", 0, 1.5, 3, 0, -1),
    ],
    doors: [
      {
        identifier: "door",
        parentIdentifier: "south",
        dimensions: [0.8, 2.1, 0],
        transform: transform(3, 1.05, 3, -1, 0),
        category: { door: {} },
      },
    ],
    windows: [
      {
        identifier: "window",
        parentIdentifier: "north",
        dimensions: [1.2, 1.2, 0],
        transform: transform(2, 1.5, 0),
        category: { window: {} },
      },
    ],
    objects: [
      {
        identifier: "bed",
        dimensions: [1.8, 1.05, 2],
        transform: transform(2, 0.525, 1.5),
        category: { bed: {} },
      },
    ],
    sections: [],
  };
}
describe("RoomPlan bridge into canonical mm scenes", () => {
  it("preserves metres as mm, clear floor area, openings and furniture dimensions", () => {
    const data = fixture(),
      { scene, warnings } = sceneFromScan(data, "phone.json", options);
    expect(scene.walls[0].start).toEqual({ x: 0, z: 0 });
    expect(scene.walls[0].end).toEqual({ x: 4000, z: 0 });
    expect(scene.walls[0].height).toBe(2800);
    expect(scene.walls[0].thickness).toBe(120);
    expect(area(scene.rooms[0].polygon)).toBeCloseTo(3880 * 2880);
    expect(scene.dimensionConfidence).toBe("estimated");
    expect(scene.openings).toHaveLength(2);
    expect(scene.openings.find((o) => o.kind === "window")?.sill).toBeCloseTo(
      900,
    );
    expect(scene.furniture[0]).toMatchObject({
      width: 1800,
      depth: 2000,
      height: 1050,
      rotation: 0,
      y: 0,
      confidence: "estimated",
    });
    expect(JSON.parse(scene.assets["roomplan-source"].data)).toEqual(data);
    expect(warnings).not.toHaveLength(0);
    expect(decodeScene(encodeScene(scene))).toEqual(scene);
    expect(renderManifest(scene).meshes.length).toBeGreaterThan(20);
  });
  it("selects a floor explicitly and never collapses multiple stories", () => {
    const data: any = fixture();
    data.walls.push(
      ...fixture().walls.map((w) => ({
        ...w,
        identifier: "upper-" + w.identifier,
        story: 1,
        transform: w.transform.map((v, i) => (i === 13 ? v + 3 : v)),
      })),
    );
    expect(scanLevels(data).map((s) => s.level)).toEqual([0, 1]);
    const { scene } = sceneFromScan(data, "multi.json", {
      ...options,
      level: 1,
    });
    expect(scene.walls).toHaveLength(4);
    expect(scene.furniture).toHaveLength(0);
    expect(scene.openings).toHaveLength(0);
    expect(() =>
      sceneFromScan(data, "multi.json", { ...options, level: 3 }),
    ).toThrow(/楼层/);
  });
  it("rejects unsupported opening semantics and preserves omitted objects in raw source", () => {
    const data: any = fixture();
    data.doors[0].opensInward = false;
    expect(() => sceneFromScan(data, "scan.json", options)).toThrow(/外开门/);
    data.objects.push({
      ...data.objects[0],
      identifier: "unknown",
      category: { unrecognized: {} },
    });
    const { scene, warnings } = sceneFromScan(data, "scan.json", {
      ...options,
      doors: false,
    });
    expect(scene.openings).toHaveLength(1);
    expect(scene.furniture).toHaveLength(1);
    expect(warnings.join(" ")).toContain("不支持");
    expect(
      JSON.parse(scene.assets["roomplan-source"].data).objects,
    ).toHaveLength(2);
  });
  it("rejects damaged references and open room chains instead of inserting an invented room", () => {
    const data = fixture();
    data.walls.pop();
    expect(() => sceneFromScan(data, "open.json", options)).toThrow(/闭合/);
    const invalid = fixture();
    invalid.doors[0].parentIdentifier = "missing";
    expect(() => sceneFromScan(invalid, "invalid.json", options)).toThrow(
      /parentIdentifier/,
    );
  });
  it("reads JSON and raw ZIP, rejects edited plan ZIP and oversized decompressed JSON", async () => {
    const data = fixture(),
      file = new File([JSON.stringify(data)], "capture.json");
    expect(await loadScanFile(file)).toEqual(data);
    const zip = new JSZip();
    zip.file("capture/room.json", JSON.stringify(data));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    expect(await loadScanFile(new File([bytes], "scan.zip"))).toEqual(data);
    zip.file("plan.json", "{}");
    await expect(
      loadScanFile(
        new File(
          [await zip.generateAsync({ type: "arraybuffer" })],
          "edited.zip",
        ),
      ),
    ).rejects.toThrow(/Editable Plan/);
    const large = new JSZip();
    large.file("room.json", " ".repeat(30000001));
    await expect(
      loadScanFile(
        new File(
          [
            await large.generateAsync({
              type: "arraybuffer",
              compression: "DEFLATE",
            }),
          ],
          "large.zip",
        ),
      ),
    ).rejects.toThrow(/30 MB/);
  });
  it("accepts the inherited OpenPlan prepared fixture without losing original source", () => {
    const data = JSON.parse(
      readFileSync("tests/fixtures/handoff-roomplan.json", "utf8"),
    );
    const { scene } = sceneFromScan(data, "openplan-prepared.json", {
      ...options,
      doors: false,
      furniture: false,
    });
    expect(scene.walls.length).toBeGreaterThan(3);
    expect(scene.assets["roomplan-source"]).toBeDefined();
    writeFileSync("../evidence/scan-compatibility.roomfit", encodeScene(scene));
    writeFileSync(
      "../samples/D-RoomPlan-test-fixture.json",
      JSON.stringify(fixture(), null, 2),
    );
  });
});
