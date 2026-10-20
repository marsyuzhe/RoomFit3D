import type { PackageMapping, Project } from '$lib/models/types';
import { resolveRoomGeometry } from '$lib/utils/roomDetection';
import { roomHoles } from '$lib/utils/roomNesting';
import { interiorRoomArea } from '$lib/utils/interiorArea';

type ObjectMap = Record<string, any>;

/** Mirrors the native `PlanStatisticsExport` shape written by the iPhone/Mac app. */
export interface StatisticsTotals {
  livingArea: number; grossArea: number; wallAreaGross: number; wallAreaNet: number; openingArea: number; wallLength: number;
  roomCount: number; wallCount: number; doorCount: number; windowCount: number; furnitureCount: number; roomsWithoutArea: number;
}
export interface PlanStatisticsBlock {
  version: 1;
  units: 'metres';
  totals: StatisticsTotals;
  levels: { index: number; name: string; totals: StatisticsTotals }[];
  rooms: { id: string; name: string; level: number; floorArea?: number; ceilingHeight: number; floorOpening: boolean }[];
  costs: { openingCost: number; furnitureCost: number; totalCost: number; pricedOpeningCount: number; pricedFurnitureCount: number };
}

const DEFAULT_CEILING = 2.4, DEFAULT_INTERIOR_THICKNESS = 0.12, DEFAULT_DOOR_HEIGHT = 2, DEFAULT_WINDOW_HEIGHT = 1.2;
const round = (value: number) => Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : 0;
const key = (id: string) => String(id).toLowerCase();

function defaultLevelName(index: number): string {
  if (index === 0) return 'Ground Floor';
  if (index < 0) return index === -1 ? 'Basement' : `Basement ${-index}`;
  return `Floor ${index}`;
}

/**
 * Derived quantities for the `statistics` block of an exported `plan.json`.
 *
 * Counts, wall runs, wall surfaces and openings come from the native-shaped
 * plan (metres) exactly as the native app computes them. Room floor areas
 * use the web's interior-face measurement, which excludes wall footprints
 * like the native raster fill. Rooms that are no longer enclosed have no
 * area and are counted in `roomsWithoutArea`; floor openings contribute
 * zero. The block is recomputed on every export and never read back.
 */
export function planStatistics(project: Project, plan: ObjectMap, mapping: PackageMapping): PlanStatisticsBlock {
  const defaults = plan.defaults ?? {};
  const ceiling = defaults.ceilingHeight ?? DEFAULT_CEILING, interior = defaults.interiorWallThickness ?? DEFAULT_INTERIOR_THICKNESS;
  const areas = new Map<string, number | null>();
  for (const floor of project.floors) {
    const geometry = resolveRoomGeometry(floor);
    const holes = roomHoles(geometry.map(item => item.polygon));
    geometry.forEach((entry, i) => {
      const nativeId = mapping.find(m => m.kind === 'rooms' && m.floorId === floor.id && m.webId === entry.room.id)?.id;
      if (!nativeId) return;
      areas.set(key(nativeId), entry.room.floorOpening ? 0 : interiorRoomArea(entry.polygon, holes[i], floor.walls));
    });
  }
  const walls: ObjectMap[] = plan.walls ?? [], openings: ObjectMap[] = plan.openings ?? [], furniture: ObjectMap[] = plan.furniture ?? [], rooms: ObjectMap[] = plan.rooms ?? [];
  const level = (item: ObjectMap) => Number.isSafeInteger(item.level) ? item.level as number : 0;
  const wallLevel = new Map(walls.map(wall => [key(wall.id), level(wall)]));

  function totals(ws: ObjectMap[], os: ObjectMap[], fs: ObjectMap[], rs: ObjectMap[]): StatisticsTotals {
    let wallLength = 0, wallAreaGross = 0, footprint = 0, openingArea = 0, living = 0, without = 0;
    for (const wall of ws) {
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      wallLength += length; wallAreaGross += length * (wall.height ?? ceiling); footprint += length * (wall.thickness ?? interior);
    }
    for (const opening of os) openingArea += (opening.width ?? 0) * (opening.height ?? (opening.kind === 'door' ? DEFAULT_DOOR_HEIGHT : DEFAULT_WINDOW_HEIGHT));
    for (const room of rs) {
      if (room.floorOpening === true) continue;
      const area = areas.get(key(room.id));
      if (area == null) without++; else living += area;
    }
    return {
      livingArea: round(living), grossArea: round(living + footprint / 2), wallAreaGross: round(wallAreaGross),
      wallAreaNet: round(Math.max(wallAreaGross - openingArea, 0)), openingArea: round(openingArea), wallLength: round(wallLength),
      roomCount: rs.length, wallCount: ws.length, doorCount: os.filter(o => o.kind === 'door').length,
      windowCount: os.filter(o => o.kind === 'window').length, furnitureCount: fs.length, roomsWithoutArea: without,
    };
  }

  const indices = new Set<number>([0, ...walls.map(level), ...rooms.map(level), ...furniture.map(level),
    ...(plan.levels ?? []).map((l: ObjectMap) => l.index).filter(Number.isSafeInteger)]);
  if (Number.isSafeInteger(plan.underlay?.level)) indices.add(plan.underlay.level);
  const named = new Map<number, string>((plan.levels ?? []).map((l: ObjectMap) => [l.index, l.name]));
  const levels = [...indices].sort((a, b) => a - b).map(index => ({
    index, name: named.get(index) ?? defaultLevelName(index),
    totals: totals(walls.filter(w => level(w) === index), openings.filter(o => wallLevel.get(key(o.wallID)) === index),
      furniture.filter(f => level(f) === index), rooms.filter(r => level(r) === index)),
  }));
  const priced = (items: ObjectMap[]) => items.filter(item => typeof item.price === 'number' && Number.isFinite(item.price));
  const sum = (items: ObjectMap[]) => items.reduce((total, item) => total + Math.max(item.price, 0), 0);
  const pricedOpenings = priced(openings), pricedFurniture = priced(furniture);
  return {
    version: 1, units: 'metres', totals: totals(walls, openings, furniture, rooms), levels,
    rooms: rooms.map(room => {
      const area = areas.get(key(room.id));
      return {
        id: room.id, name: room.name, level: level(room),
        ...(area == null ? {} : { floorArea: round(area) }),
        ceilingHeight: round(room.ceilingHeight ?? ceiling), floorOpening: room.floorOpening === true,
      };
    }),
    costs: {
      openingCost: round(sum(pricedOpenings)), furnitureCost: round(sum(pricedFurniture)), totalCost: round(sum(pricedOpenings) + sum(pricedFurniture)),
      pricedOpeningCount: pricedOpenings.length, pricedFurnitureCount: pricedFurniture.length,
    },
  };
}
