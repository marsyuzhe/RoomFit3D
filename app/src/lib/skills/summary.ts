import { distance, isNumber, levelIndices, levelName, levelOf, or, photosOf, pyRound, pySorted, sortedObject, strings, type LoadedPackage, type ObjectMap } from './shared';

const DEFAULT_WALL_HEIGHT = 2.4, DEFAULT_CEILING_HEIGHT = 2.4, DEFAULT_DOOR_HEIGHT = 2.0, DEFAULT_WINDOW_HEIGHT = 1.2;

/** Port of openplan3d-project-summary/scripts/summarize_package.py. */
export function summarizePackage({ manifest, plan, assets: assetMap }: LoadedPackage): ObjectMap {
  const assets = Object.keys(assetMap);
  const walls: ObjectMap[] = plan.walls ?? [], openings: ObjectMap[] = plan.openings ?? [], furniture: ObjectMap[] = plan.furniture ?? [];
  const rooms: ObjectMap[] = plan.rooms ?? [], notes: ObjectMap[] = plan.notes ?? [], levels: ObjectMap[] = plan.levels ?? [];
  const defaults: ObjectMap = plan.defaults ?? {};
  const ceilingDefault = or<number>(defaults.ceilingHeight, DEFAULT_CEILING_HEIGHT);
  const wallIds = new Set(walls.map(w => w.id));

  const perLevel: ObjectMap[] = [];
  for (const index of levelIndices(plan, level => 'index' in level)) {
    const levelWalls = walls.filter(w => levelOf(w) === index);
    const ids = new Set(levelWalls.map(w => w.id));
    const levelOpenings = openings.filter(o => ids.has(o.wallID));
    const levelRooms = rooms.filter(r => levelOf(r) === index);
    const levelFurniture = furniture.filter(f => levelOf(f) === index);
    let wallLength = 0, grossWallArea = 0, openingArea = 0;
    for (const w of levelWalls) wallLength += distance(w.start, w.end);
    for (const w of levelWalls) grossWallArea += distance(w.start, w.end) * or<number>(w.height, DEFAULT_WALL_HEIGHT);
    for (const o of levelOpenings) openingArea += or<number>(o.width, 0) * or<number>(o.height, o.kind === 'door' ? DEFAULT_DOOR_HEIGHT : DEFAULT_WINDOW_HEIGHT);
    const points = [...levelWalls.map(w => w.start), ...levelWalls.map(w => w.end)];
    let extent: ObjectMap | null = null;
    if (points.length) {
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      extent = { width: pyRound(Math.max(...xs) - Math.min(...xs), 3), depth: pyRound(Math.max(...ys) - Math.min(...ys), 3) };
    }
    perLevel.push({
      index, name: levelName(levels, index), wallCount: levelWalls.length,
      wallLength: pyRound(wallLength, 3), wallAreaGross: pyRound(grossWallArea, 3), wallAreaNet: pyRound(Math.max(grossWallArea - openingArea, 0), 3),
      doorCount: levelOpenings.filter(o => o.kind === 'door').length, windowCount: levelOpenings.filter(o => o.kind === 'window').length,
      roomCount: levelRooms.length, furnitureCount: levelFurniture.length, boundingExtentMetres: extent,
      rooms: levelRooms.map(r => ({
        name: or(r.name, 'Unnamed room'), type: r.type ?? null, ceilingHeight: or(r.ceilingHeight, ceilingDefault),
        hasBoundary: Array.isArray(r.boundaryWallIDs) && r.boundaryWallIDs.length > 0, photoCount: (r.photos ?? []).length, note: r.note ?? null,
      })),
    });
  }

  const priced = [...openings.filter(o => isNumber(o.price)), ...furniture.filter(f => isNumber(f.price))];
  const referenced = new Set<string>();
  for (const item of [...rooms, ...furniture]) for (const p of item.photos ?? []) referenced.add(p);
  const underlay: ObjectMap = plan.underlay ?? {};
  if (underlay.imageFilename) referenced.add(underlay.imageFilename);
  const assetSet = new Set(assets);
  const missingAssets = manifest ? pySorted([...referenced].filter(n => !assetSet.has(n))) : [];
  const unreferencedAssets = manifest ? pySorted(assets.filter(n => !referenced.has(n))) : [];

  const stats: ObjectMap | null = plan.statistics && typeof plan.statistics === 'object' && !Array.isArray(plan.statistics) ? plan.statistics : null;
  let areas: ObjectMap | null = null;
  const roomAreas = new Map<string, number | null>();
  if (stats && stats.version === 1 && stats.totals && typeof stats.totals === 'object' && !Array.isArray(stats.totals)) {
    for (const r of stats.rooms ?? []) if (r && typeof r === 'object' && !Array.isArray(r)) roomAreas.set(r.id, r.floorArea ?? null);
    for (const level of perLevel) {
      const levelRooms = rooms.filter(r => levelOf(r) === level.index);
      level.rooms.forEach((entry: ObjectMap, i: number) => { entry.floorArea = roomAreas.has(levelRooms[i].id) ? roomAreas.get(levelRooms[i].id) : null; });
    }
    areas = {
      source: 'app statistics block',
      livingArea: stats.totals.livingArea ?? null, grossArea: stats.totals.grossArea ?? null, roomsWithoutArea: stats.totals.roomsWithoutArea ?? null,
      levels: (stats.levels ?? []).filter((l: unknown) => l && typeof l === 'object' && !Array.isArray(l)).map((l: ObjectMap) => ({
        index: l.index ?? null, name: l.name ?? null, livingArea: (l.totals ?? {}).livingArea ?? null, grossArea: (l.totals ?? {}).grossArea ?? null,
      })),
    };
  }

  const byCategory = new Map<string, number>();
  for (const item of furniture) { const c = or(item.category, 'unknown'); byCategory.set(c, (byCategory.get(c) ?? 0) + 1); }

  const gaps: string[] = [];
  if (!rooms.length) gaps.push('No room labels: room names and areas are unavailable.');
  for (const room of rooms) {
    const name = or(room.name, 'Unnamed room');
    if (areas !== null) {
      if ((roomAreas.get(room.id) ?? null) === null && !room.floorOpening) gaps.push(`Room '${name}' has no measured floor area; its label is outside any closed boundary.`);
    } else if (!(Array.isArray(room.boundaryWallIDs) && room.boundaryWallIDs.length)) {
      gaps.push(`Room '${name}' has no stored wall boundary; this export carries no measured area for it.`);
    }
    if (!(Array.isArray(room.photos) && room.photos.length)) gaps.push(`Room '${name}' has no photos.`);
  }
  for (const opening of openings) if (!wallIds.has(opening.wallID)) gaps.push(`Opening ${opening.id ?? 'None'} references a missing wall.`);
  if (missingAssets.length) gaps.push(`${missingAssets.length} referenced photo(s) are missing from the package assets.`);
  if (!walls.length) gaps.push('Plan has no walls.');

  return {
    title: or(manifest?.title, 'Untitled plan'), producer: manifest?.producer ?? null, format: manifest ? manifest.format ?? null : 'plan.json', units: 'metres',
    levelCount: perLevel.length, levels: perLevel,
    totals: {
      wallCount: walls.length,
      wallLength: pyRound(perLevel.reduce((s, l) => s + l.wallLength, 0), 3),
      wallAreaGross: pyRound(perLevel.reduce((s, l) => s + l.wallAreaGross, 0), 3),
      wallAreaNet: pyRound(perLevel.reduce((s, l) => s + l.wallAreaNet, 0), 3),
      doorCount: openings.filter(o => o.kind === 'door').length, windowCount: openings.filter(o => o.kind === 'window').length,
      roomCount: rooms.length, furnitureCount: furniture.length, furnitureByCategory: sortedObject(byCategory),
      pricedItemCount: priced.length, pricedTotal: pyRound(priced.reduce((s, i) => s + i.price, 0), 2),
    },
    notes: {
      planNotes: plan.planNotes ?? null, pinnedNotes: notes.filter(n => n.text).map(n => n.text),
      wallNotes: walls.filter(w => w.note).map(w => w.note), furnitureNotes: furniture.filter(f => f.note).map(f => f.note),
    },
    attachments: { assetCount: assets.length, referencedPhotoCount: referenced.size, missingAssets, unreferencedAssets, hasTracingImage: !!underlay.imageFilename },
    areas, documentationGaps: gaps,
    limitations: [
      ...(areas ? ["Living and gross areas and per-room floor areas come from the app's statistics block in this export."]
        : ['This export has no statistics block, so room floor areas are unavailable; the script reports wall lengths, wall areas and bounding extents only. Re-export from a current app version to include areas.']),
      'Wall areas use default heights (2.4 m) and opening heights (door 2.0 m, window 1.2 m) where the plan omits them.',
      'Prices are user-entered and unverified; no currency is stored.',
    ],
  };
  void strings;
}
