/**
 * Shared helpers for the assistant skill computations. These are line-by-line
 * ports of the Python scripts in openplan3d-ios/tooling/skills; the parity
 * tests compare both implementations on the same fixtures, so keep the
 * semantics (including Python's `or` defaults and round-half-even) intact.
 */
import { packageJSON, readPackageZip } from '$lib/utils/projectPackageZip';

export type ObjectMap = Record<string, any>;
export interface AssetInfo { size: number; head: Uint8Array }
export interface LoadedPackage { manifest: ObjectMap | null; plan: ObjectMap; assets: Record<string, AssetInfo> }

export class SkillPackageError extends Error {}

const MAX_ENTRIES = 512;
const HEAD_BYTES = 65_536;

/** Read a project package the way the skill scripts do: manifest, plan and asset headers. */
export function loadPackage(bytes: Uint8Array): LoadedPackage {
  const files = readPackageZip(bytes);
  const names = Object.keys(files);
  if (names.length > MAX_ENTRIES) throw new SkillPackageError('Package exceeds 512 entries');
  if (!files['manifest.json'] || !files['plan.json']) throw new SkillPackageError('Missing manifest.json or plan.json');
  const manifest = packageJSON(files['manifest.json']);
  if (manifest.format !== 'openplan3d-project' || manifest.version !== 1) throw new SkillPackageError('Unsupported package format or version');
  const plan = packageJSON(files['plan.json']);
  const assets: Record<string, AssetInfo> = {};
  for (const name of names) {
    if (name.startsWith('assets/') && !name.endsWith('/')) assets[name.slice('assets/'.length)] = { size: files[name].byteLength, head: files[name].subarray(0, HEAD_BYTES) };
  }
  return { manifest, plan, assets };
}

/** Python's round(): correctly rounded, ties to even. */
export function pyRound(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits, scaled = value * scale, floor = Math.floor(scaled), diff = scaled - floor;
  const rounded = diff > 0.5 ? floor + 1 : diff < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
  return rounded / scale;
}

export const distance = (a: ObjectMap, b: ObjectMap) => Math.hypot(b.x - a.x, b.y - a.y);
export const truthy = (value: unknown) => !!value && !(Array.isArray(value) && value.length === 0) && !(typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);
export const or = <T>(value: unknown, fallback: T): T => (truthy(value) ? (value as T) : fallback);
export const levelOf = (item: ObjectMap) => or<number>(item.level, 0);
export const isNumber = (value: unknown): value is number => typeof value === 'number';
export const pySorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export function levelName(levels: ObjectMap[], index: number): string {
  for (const level of levels) if (level.index === index) return or(level.name, `Level ${index}`);
  return index === 0 ? 'Ground Floor' : `Level ${index}`;
}

export function levelIndices(plan: ObjectMap, levelFilter: (level: ObjectMap) => boolean): number[] {
  const set = new Set<number>([0]);
  for (const kind of ['walls', 'rooms', 'furniture']) for (const item of plan[kind] ?? []) set.add(levelOf(item));
  for (const level of plan.levels ?? []) if (levelFilter(level)) set.add(level.index);
  return [...set].sort((a, b) => a - b);
}

export const photosOf = (item: ObjectMap): string[] => (Array.isArray(item.photos) ? item.photos.filter((p: unknown) => typeof p === 'string') : []);
export const strings = (values: unknown): string[] => (Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : []);
export function pathSuffix(name: string): string {
  const base = name.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i).toLowerCase() : '';
}
export function sortedObject<T>(entries: Iterable<[string, T]>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) result[key] = value;
  return result;
}
