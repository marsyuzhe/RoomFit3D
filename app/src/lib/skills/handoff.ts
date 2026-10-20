import { distance, isNumber, levelIndices, levelName, levelOf, or, photosOf, pyRound, pySorted, sortedObject, type LoadedPackage, type ObjectMap } from './shared';

const DEFAULT_WALL_HEIGHT = 2.4, DEFAULT_CEILING_HEIGHT = 2.4, DEFAULT_WALL_THICKNESS = 0.12, DEFAULT_DOOR_HEIGHT = 2.0, DEFAULT_WINDOW_HEIGHT = 1.2, DEFAULT_SILL = 0.9;
const FT = 3.280839895, SQFT = 10.76391042;

function measure(metres: number | null | undefined, kind: 'length' | 'area'): ObjectMap | null {
  if (metres === null || metres === undefined) return null;
  const [factor, unit, imperialUnit] = kind === 'length' ? [FT, 'm', 'ft'] : [SQFT, 'm²', 'ft²'];
  return { value: pyRound(metres, 3), unit, imperial: pyRound(metres * factor, 1), imperialUnit };
}
const wallHeight = (wall: ObjectMap, defaults: ObjectMap) => or<number>(wall.height, or<number>(defaults.ceilingHeight, DEFAULT_WALL_HEIGHT));
const openingHeight = (o: ObjectMap) => or<number>(o.height, o.kind === 'door' ? DEFAULT_DOOR_HEIGHT : DEFAULT_WINDOW_HEIGHT);
const lower = (value: unknown) => (value === undefined || value === null ? 'None' : String(value)).toLowerCase();
void DEFAULT_WALL_THICKNESS;

/** Port of openplan3d-contractor-handoff/scripts/handoff_scope.py. */
export function handoffScope({ manifest, plan, assets: assetMap }: LoadedPackage, codes: Record<string, string> = {}): ObjectMap {
  const assets = Object.keys(assetMap);
  const walls: ObjectMap[] = plan.walls ?? [], openings: ObjectMap[] = plan.openings ?? [], furniture: ObjectMap[] = plan.furniture ?? [];
  const rooms: ObjectMap[] = plan.rooms ?? [], notes: ObjectMap[] = plan.notes ?? [], levels: ObjectMap[] = plan.levels ?? [];
  const defaults: ObjectMap = plan.defaults ?? {};
  const ceilingDefault = or<number>(defaults.ceilingHeight, DEFAULT_CEILING_HEIGHT);
  const wallById = new Map(walls.map(w => [lower(w.id), w]));

  const stats: ObjectMap | null = plan.statistics && typeof plan.statistics === 'object' && !Array.isArray(plan.statistics) ? plan.statistics : null;
  const hasStats = !!(stats && stats.version === 1 && stats.totals && typeof stats.totals === 'object' && !Array.isArray(stats.totals));
  const roomArea = new Map<string, number | null>(), levelStats = new Map<number, ObjectMap>();
  if (hasStats) {
    for (const r of stats!.rooms ?? []) if (r && typeof r === 'object' && !Array.isArray(r)) roomArea.set(r.id, r.floorArea ?? null);
    for (const l of stats!.levels ?? []) if (l && typeof l === 'object' && !Array.isArray(l)) levelStats.set(l.index, l.totals ?? {});
  }

  const assumptions = [
    'Wall runs are centreline lengths; wall areas are run × height with doors and windows deducted for the net figure.',
    'Ceiling area is taken as equal to floor area (flat ceilings assumed).',
    "A wall shared by two rooms appears in both rooms' boundary figures; use level totals for material takeoff.",
  ];
  if (!hasStats) assumptions.push('This export has no statistics block, so room floor and ceiling areas are unavailable; re-export from a current app version for areas.');
  const gaps: string[] = [], quantities: ObjectMap[] = [];
  const addQuantity = (key: string, description: string, metres: number | null | undefined, kind: 'length' | 'area' | null, level: string | null = null, room: string | null = null, count: number | null = null) => {
    const item: ObjectMap = { key, description, level, room };
    if (count !== null) Object.assign(item, { quantity: count, unit: 'count' });
    else {
      if (metres === null || metres === undefined) return;
      const m = measure(metres, kind!)!;
      Object.assign(item, { quantity: m.value, unit: m.unit, imperialQuantity: m.imperial, imperialUnit: m.imperialUnit });
    }
    if (key in codes) item.code = codes[key];
    quantities.push(item);
  };

  const levelEntries: ObjectMap[] = [];
  for (const index of levelIndices(plan, level => Number.isInteger(level.index))) {
    const name = levelName(levels, index);
    const levelWalls = walls.filter(w => levelOf(w) === index);
    const wallIds = new Set(levelWalls.map(w => lower(w.id)));
    const levelOpenings = openings.filter(o => wallIds.has(lower(o.wallID)));
    const levelRooms = rooms.filter(r => levelOf(r) === index), levelFurniture = furniture.filter(f => levelOf(f) === index);
    let run = 0, gross = 0, openingArea = 0;
    for (const w of levelWalls) run += distance(w.start, w.end);
    for (const w of levelWalls) gross += distance(w.start, w.end) * wallHeight(w, defaults);
    for (const o of levelOpenings) openingArea += or<number>(o.width, 0) * openingHeight(o);
    const net = Math.max(gross - openingArea, 0);
    const totals = levelStats.get(index) ?? {};
    const living = hasStats ? totals.livingArea ?? null : null;

    const roomEntries: ObjectMap[] = [];
    for (const room of levelRooms) {
      const rname = or(room.name, 'Unnamed room');
      const area = hasStats ? (roomArea.has(room.id) ? roomArea.get(room.id)! : null) : null;
      const boundaryIds = (Array.isArray(room.boundaryWallIDs) ? room.boundaryWallIDs : []).map(lower);
      const boundaryWalls = boundaryIds.filter(i => wallById.has(i)).map(i => wallById.get(i)!);
      let boundaryRun: number | null = null, boundaryGross: number | null = null, boundaryNet: number | null = null;
      let boundaryOpenings: ObjectMap[] = [];
      if (boundaryWalls.length) {
        boundaryRun = 0; boundaryGross = 0;
        for (const w of boundaryWalls) boundaryRun += distance(w.start, w.end);
        for (const w of boundaryWalls) boundaryGross += distance(w.start, w.end) * wallHeight(w, defaults);
        const idSet = new Set(boundaryIds);
        boundaryOpenings = openings.filter(o => idSet.has(lower(o.wallID)));
        let deduct = 0;
        for (const o of boundaryOpenings) deduct += or<number>(o.width, 0) * openingHeight(o);
        boundaryNet = Math.max(boundaryGross - deduct, 0);
      }
      const height = or<number>(room.ceilingHeight, ceilingDefault), photos = photosOf(room);
      roomEntries.push({
        name: rname, type: room.type ?? null, floorOpening: room.floorOpening === true,
        floorArea: measure(area, 'area'), ceilingArea: !room.floorOpening ? measure(area, 'area') : null, ceilingHeight: measure(height, 'length'),
        boundaryWallRun: measure(boundaryRun, 'length'), boundaryWallAreaGross: measure(boundaryGross, 'area'), boundaryWallAreaNet: measure(boundaryNet, 'area'),
        boundaryDoorCount: boundaryOpenings.filter(o => o.kind === 'door').length, boundaryWindowCount: boundaryOpenings.filter(o => o.kind === 'window').length,
        photoCount: photos.length, photos, note: room.note ?? null,
      });
      if (area === null && hasStats && !room.floorOpening) gaps.push(`Room '${rname}' (${name}) has no measured floor area; its label is outside any closed boundary.`);
      if (!photos.length) gaps.push(`Room '${rname}' (${name}) has no photos.`);
      if (!room.floorOpening) {
        addQuantity('floorArea', `Floor area, ${rname}`, area, 'area', name, rname);
        addQuantity('ceilingArea', `Ceiling area, ${rname}`, area, 'area', name, rname);
        addQuantity('wallAreaNetRoom', `Wall area net of openings, ${rname} boundary`, boundaryNet, 'area', name, rname);
        addQuantity('wallRunRoom', `Wall run, ${rname} boundary`, boundaryRun, 'length', name, rname);
      }
    }

    const openingsSchedule = levelOpenings.map(o => {
      const wall = wallById.get(lower(o.wallID));
      return {
        kind: o.kind ?? null, style: o.style ?? null, width: measure(o.width ?? null, 'length'), height: measure(openingHeight(o), 'length'),
        sillHeight: o.kind === 'window' ? measure(or<number>(o.sillHeight, DEFAULT_SILL), 'length') : null,
        wallHeight: wall && Object.keys(wall).length ? measure(wallHeight(wall, defaults), 'length') : null,
        positionAlongWall: o.position ?? null, price: o.price ?? null,
      };
    });
    const inventory = new Map<string, ObjectMap>();
    for (const item of levelFurniture) {
      const category = or(item.category, 'unknown');
      const bucket = inventory.get(category) ?? { count: 0, items: [] };
      if (!inventory.has(category)) inventory.set(category, bucket);
      bucket.count += 1;
      bucket.items.push({
        width: measure(item.width ?? null, 'length'), depth: measure(item.depth ?? null, 'length'), height: item.height ? measure(item.height, 'length') : null,
        note: item.note ?? null, price: item.price ?? null, photoCount: (item.photos ?? []).length,
      });
    }

    levelEntries.push({
      index, name, livingArea: measure(living, 'area'), grossArea: hasStats ? measure(totals.grossArea ?? null, 'area') : null,
      wallRun: measure(run, 'length'), wallAreaGross: measure(gross, 'area'), wallAreaNet: measure(net, 'area'), openingArea: measure(openingArea, 'area'),
      doorCount: levelOpenings.filter(o => o.kind === 'door').length, windowCount: levelOpenings.filter(o => o.kind === 'window').length,
      wallCount: levelWalls.length, furnitureCount: levelFurniture.length,
      rooms: roomEntries, openings: openingsSchedule, furniture: sortedObject(inventory),
    });
    addQuantity('livingAreaLevel', `Living area, ${name}`, living, 'area', name);
    addQuantity('wallAreaNetLevel', `Wall area net of openings, ${name}`, net, 'area', name);
    addQuantity('wallAreaGrossLevel', `Wall area gross, ${name}`, gross, 'area', name);
    addQuantity('wallRunLevel', `Wall run, ${name}`, run, 'length', name);
    addQuantity('doors', `Doors, ${name}`, null, null, name, null, levelOpenings.filter(o => o.kind === 'door').length);
    addQuantity('windows', `Windows, ${name}`, null, null, name, null, levelOpenings.filter(o => o.kind === 'window').length);
  }

  const priced = [...openings.filter(o => isNumber(o.price)), ...furniture.filter(f => isNumber(f.price))];
  const costs = priced.length ? {
    pricedItemCount: priced.length, pricedTotal: pyRound(priced.reduce((s, i) => s + Math.max(i.price, 0), 0), 2),
    unpricedItemCount: openings.length + furniture.length - priced.length, note: 'User-entered prices with no currency; not an estimate.',
  } : null;

  const referenced = new Set<string>();
  for (const item of [...rooms, ...furniture]) for (const p of photosOf(item)) referenced.add(p);
  const assetSet = new Set(assets);
  const missing = manifest ? pySorted([...referenced].filter(n => !assetSet.has(n))) : [];
  for (const name of missing) gaps.push(`Photo '${name}' is referenced but not included in the package.`);
  if (!rooms.length) gaps.push('No room labels: per-room quantities are unavailable; only level totals are reported.');
  if (!walls.length) gaps.push('Plan has no walls.');

  let totalRun = 0;
  for (const w of walls) totalRun += distance(w.start, w.end);
  const underlayName = (plan.underlay ?? {}).imageFilename;
  return {
    title: or(manifest?.title, 'Untitled plan'), producer: manifest?.producer ?? null,
    units: { metric: 'metres and square metres', imperial: 'feet and square feet, rounded to 0.1' },
    summary: {
      levelCount: levelEntries.length, roomCount: rooms.length, wallCount: walls.length,
      doorCount: openings.filter(o => o.kind === 'door').length, windowCount: openings.filter(o => o.kind === 'window').length, furnitureCount: furniture.length,
      livingArea: hasStats ? measure(stats!.totals.livingArea ?? null, 'area') : null, grossArea: hasStats ? measure(stats!.totals.grossArea ?? null, 'area') : null,
      wallRun: measure(totalRun, 'length'), wallAreaNet: measure(levelEntries.reduce((s, l) => s + l.wallAreaNet.value, 0), 'area'),
      roomsWithPhotos: rooms.filter(r => Array.isArray(r.photos) && r.photos.length).length, photoFileCount: assets.filter(a => referenced.has(a)).length,
    },
    levels: levelEntries, quantities,
    notes: {
      planNotes: plan.planNotes ?? null, pinnedNotes: notes.filter(n => n.text).map(n => n.text), wallNotes: walls.filter(w => w.note).map(w => w.note),
      roomNotes: rooms.filter(r => r.note).map(r => ({ room: r.name ?? null, note: r.note })),
      furnitureNotes: furniture.filter(f => f.note).map(f => ({ category: f.category ?? null, note: f.note })),
    },
    costs,
    evidence: { missingPhotos: missing, unreferencedFiles: manifest ? pySorted(assets.filter(a => !referenced.has(a) && a !== underlayName)) : [] },
    assumptions, gaps,
    codesApplied: pySorted(Object.keys(codes).filter(k => quantities.some(q => q.key === k))),
  };
}
