import { levelName, levelOf, or, pathSuffix, photosOf, pySorted, type AssetInfo, type LoadedPackage, type ObjectMap } from './shared';

const LOW_RESOLUTION_PIXELS = 800;
const IMAGE_SUFFIXES = new Set(['.png', '.jpg', '.jpeg', '.heic', '.gif', '.webp']);
const SOF = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF]);

/** (width, height, format) from a PNG, JPEG or GIF header; HEIC reports only its format. */
export function imageDimensions(head: Uint8Array): [number | null, number | null, string | null] {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const ascii = (start: number, end: number) => String.fromCharCode(...head.subarray(start, end));
  if (head.length >= 24 && ascii(0, 8) === '\x89PNG\r\n\x1a\n' && ascii(12, 16) === 'IHDR') return [view.getUint32(16), view.getUint32(20), 'png'];
  if (head[0] === 0xFF && head[1] === 0xD8) {
    let i = 2;
    while (i + 9 < head.length) {
      if (head[i] !== 0xFF) break;
      const marker = head[i + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
      const length = view.getUint16(i + 2);
      if (SOF.has(marker)) return [view.getUint16(i + 7), view.getUint16(i + 5), 'jpeg'];
      i += 2 + length;
    }
    return [null, null, 'jpeg'];
  }
  if (head.length >= 10 && ascii(0, 4) === 'GIF8') return [view.getUint16(6, true), view.getUint16(8, true), 'gif'];
  if (head.length >= 12 && ['ftypheic', 'ftypheix', 'ftypmif1', 'ftypheif'].includes(ascii(4, 12))) return [null, null, 'heic'];
  return [null, null, null];
}

function nearestRoom(item: ObjectMap, rooms: ObjectMap[]): string | null {
  const level = levelOf(item);
  let best: [number, string] | null = null;
  for (const room of rooms) {
    if (levelOf(room) !== level || !room.center || typeof room.center !== 'object') continue;
    const d = Math.hypot((room.center.x ?? 0) - (item.center?.x ?? 0), (room.center.y ?? 0) - (item.center?.y ?? 0));
    if (best === null || d < best[0]) best = [d, or(room.name, 'Unnamed room')];
  }
  return best ? best[1] : null;
}

/** Port of openplan3d-photo-review/scripts/review_photos.py. */
export function reviewPhotos({ manifest, plan, assets }: LoadedPackage): ObjectMap {
  const rooms: ObjectMap[] = plan.rooms ?? [], furniture: ObjectMap[] = plan.furniture ?? [], levels: ObjectMap[] = plan.levels ?? [];
  const stats: ObjectMap | null = plan.statistics && typeof plan.statistics === 'object' && !Array.isArray(plan.statistics) ? plan.statistics : null;
  const statsRooms = new Map<string, number | null>();
  if (stats && stats.version === 1) for (const r of stats.rooms ?? []) if (r && typeof r === 'object' && !Array.isArray(r)) statsRooms.set(r.id, r.floorArea ?? null);
  const underlay: string | undefined = (plan.underlay ?? {}).imageFilename;

  const references = new Map<string, string[]>();
  const photoNames = new Set<string>();
  const refer = (name: string, owner: string, photo = true) => {
    references.set(name, [...(references.get(name) ?? []), owner]);
    if (photo) photoNames.add(name);
  };

  const roomEntries = rooms.map(room => {
    const photos = photosOf(room), name = or(room.name, 'Unnamed room');
    for (const photo of photos) refer(photo, `room ${name}`);
    return {
      id: room.id ?? null, name, type: room.type ?? null, level: levelOf(room), levelName: levelName(levels, levelOf(room)),
      floorArea: statsRooms.has(room.id) ? statsRooms.get(room.id) : null,
      photoCount: photos.length, photos, note: room.note ?? null,
      coverage: !photos.length ? 'none' : photos.length === 1 ? 'single' : 'multiple',
    };
  });
  const furnitureEntries = furniture.map(item => {
    const photos = photosOf(item), category = or(item.category, 'unknown');
    for (const photo of photos) refer(photo, `${category} on ${levelName(levels, levelOf(item))}`);
    return { id: item.id ?? null, category, level: levelOf(item), nearestRoom: nearestRoom(item, rooms), photoCount: photos.length, photos, note: item.note ?? null, price: item.price ?? null };
  });
  if (underlay) refer(underlay, 'tracing image', false);

  const files = Object.keys(assets).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(name => {
    const { size, head } = assets[name] as AssetInfo;
    const [width, height, format] = imageDimensions(head);
    return {
      name, bytes: size, format, width, height, referencedBy: references.get(name) ?? [],
      lowResolution: !!(width && height && Math.max(width, height) < LOW_RESOLUTION_PIXELS),
      isImage: format !== null || IMAGE_SUFFIXES.has(pathSuffix(name)),
    };
  });
  const assetSet = new Set(Object.keys(assets));
  const missing = manifest ? pySorted([...references.keys()].filter(n => !assetSet.has(n))) : [];
  const unreferenced = files.filter(f => !f.referencedBy.length).map(f => f.name);
  const shared: Record<string, string[]> = {};
  for (const [name, owners] of references) if (owners.length > 1) shared[name] = owners;

  const roomsWithout = roomEntries.filter(r => r.photoCount === 0), roomsSingle = roomEntries.filter(r => r.photoCount === 1);
  const furnitureWithout = furnitureEntries.filter(f => f.photoCount === 0);
  const byCategory = new Map<string, number>();
  for (const f of furnitureWithout) byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);

  const gaps: string[] = [];
  if (!rooms.length) gaps.push('No room labels, so photo coverage cannot be reported per room.');
  for (const r of roomsWithout) gaps.push(`Room '${r.name}' (${r.levelName}) has no photos.`);
  for (const r of roomsSingle) gaps.push(`Room '${r.name}' (${r.levelName}) has only one photo; a second angle is recommended.`);
  if (byCategory.size) {
    const detail = [...byCategory].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([category, count]) => `${count} ${category}`).join(', ');
    gaps.push(`${furnitureWithout.length} furniture item(s) have no photos: ${detail}.`);
  }
  for (const name of missing) gaps.push(`Photo '${name}' is referenced by ${references.get(name)!.join(', ')} but is not in the package.`);
  for (const f of files) {
    if (f.lowResolution) gaps.push(`Photo '${f.name}' is ${f.width}×${f.height} px, below ${LOW_RESOLUTION_PIXELS} px; it may not be usable as evidence.`);
    if (!f.isImage) gaps.push(`Attachment '${f.name}' is not a recognized image.`);
  }
  if (unreferenced.length) gaps.push(`${unreferenced.length} attachment(s) are not attached to any room or item: ${unreferenced.join(', ')}.`);
  for (const [name, owners] of Object.entries(shared)) gaps.push(`Photo '${name}' is shared by ${owners.length} items: ${owners.join(', ')}.`);

  return {
    title: or(manifest?.title, 'Untitled plan'), producer: manifest?.producer ?? null, source: manifest ? 'package' : 'plan.json (no attachments available)',
    coverage: {
      roomsWithPhotos: rooms.length - roomsWithout.length, roomCount: rooms.length,
      furnitureWithPhotos: furniture.length - furnitureWithout.length, furnitureCount: furniture.length,
      photoFileCount: files.filter(f => f.isImage && (photoNames.has(f.name) || f.name !== underlay)).length,
      referencedPhotoCount: photoNames.size, hasTracingImage: !!underlay,
    },
    rooms: roomEntries, furniture: furnitureEntries, files, missing, unreferenced, shared, gaps,
    limitations: [
      'Only PNG, JPEG and GIF dimensions are read from file headers; HEIC and other formats report no size.',
      'Furniture is matched to the nearest room label on its level, not to a room boundary.',
      'Photo content is not inspected; this reports presence, size and references only.',
    ],
  };
}
