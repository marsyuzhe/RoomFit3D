import { it, expect } from "vitest";
import { bedroom, createRoom } from "../../src/lib/roomfit/scene";
import { area } from "../../src/lib/roomfit/geometry";
import {
  toOpenPlan,
  fromOpenPlan,
} from "../../src/lib/roomfit/openplanAdapter";
it("adapts canonical millimetres to upstream centimetres and preserves exact net room geometry", () => {
  const s = bedroom();
  const p = toOpenPlan(s);
  expect(p.floors[0].furniture[0].width).toBe(180);
  expect(p.floors[0].walls[0].thickness).toBe(12);
  const back = fromOpenPlan(p, s);
  expect(area(back.rooms[0].polygon)).toBeCloseTo(11520000, 6);
  expect(back.furniture).toEqual(s.furniture);
  expect(back.walls).toEqual(s.walls);
  expect(back.openings).toEqual(s.openings);
});
it("uses one explicit rotation sign boundary and recomputes interior when a wall moves", () => {
  const s = createRoom(),
    p = toOpenPlan(s);
  const f = p.floors[0];
  f.walls[0].start.y -= 40;
  f.walls[0].end.y -= 40;
  f.walls[1].start.y -= 40;
  f.walls[3].end.y -= 40;
  const changed = fromOpenPlan(p, s);
  expect(area(changed.rooms[0].polygon)).toBeCloseTo(3600 * 3600, 6);
});
