import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HandoffError, reserveAdmission, type AdmissionLimits, type AdmissionMessages, type QuotaStore } from './handoffQuota';
import { jsonBytes, packageJSON, readPackageZip, writePackageZip } from '$lib/utils/projectPackageZip';
import { nativeAssetNames, validatePackagePlan } from '$lib/utils/projectPackageBridge';

/** Assistant shares: one bounded project package per code, read by the remote MCP server. */
export const SHARE_LIMITS: AdmissionLimits & { maxBytesWithoutPhotos: number } = {
  maxBytes: 64 * 1024 * 1024,
  maxBytesWithoutPhotos: 16 * 1024 * 1024,
  dailyUploads: 20,
  dailyBytes: 200 * 1024 * 1024,
  minuteUploads: 5,
};
export const SHARE_RETENTION_MS = 7 * 86_400_000;
export const SHARE_LOCKOUT = 20;
export const SHARE_PREFIX = 'assistant-shares/';
export const SHARE_LEDGER = '_system/assistant-share-admission-v1';
const SOURCE = 'assistant-share-v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MESSAGES: AdmissionMessages = {
  tooLarge: 'This project is too large to share with an assistant: 64 MiB with photos, 16 MiB without.',
  limited: 'Assistant sharing has reached its daily limit. Export the project package and attach it instead, or try again later.',
  busy: 'Assistant sharing is busy. Try again shortly.',
};

export interface ShareStore extends QuotaStore {
  create(name: string, bytes: Uint8Array, metadata?: Record<string, string>, contentType?: string): Promise<boolean>;
  metadata(name: string): Promise<{ metadata: Record<string, string>; generation: string; metageneration: string; size: number } | null>;
  get(name: string, maxBytes: number): Promise<Uint8Array | null>;
  patchMetadata(name: string, metadata: Record<string, string>, metageneration: string): Promise<boolean>;
  remove(name: string): Promise<boolean>;
}

export const validCode = (code: unknown): code is string => typeof code === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(code);
export const validSecret = (secret: unknown): secret is string => typeof secret === 'string' && /^[0-9a-f]{32}$/.test(secret);
export const shareObjectName = (code: string) => `${SHARE_PREFIX}${code}/package.zip`;
const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

/** Count the actual streamed bytes of a package upload, even with missing or dishonest Content-Length. */
export async function readShareUpload(request: Request): Promise<Uint8Array> {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if ((type !== 'application/zip' && type !== 'application/octet-stream') ||
    (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity')) {
    throw new HandoffError(415, 'Assistant sharing accepts an OpenPlan3D project package (ZIP).');
  }
  if (Number(request.headers.get('content-length')) > SHARE_LIMITS.maxBytes) throw new HandoffError(413, MESSAGES.tooLarge);
  if (!request.body) throw new HandoffError(400, 'The package is empty.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HandoffError(408, 'The upload took too long. Please try again.')), 30_000);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > SHARE_LIMITS.maxBytes) throw new HandoffError(413, MESSAGES.tooLarge);
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer!);
    void reader.cancel().catch(() => {});
  }
}

export interface PreparedShare { bytes: Uint8Array; title: string; producer: string; photoCount: number; includePhotos: boolean }

/**
 * Validate a package with the editor's own reader and keep only what the assistant
 * needs: the manifest, plan.json and the attachments plan.json references. Retained
 * web/native originals are dropped; with `includePhotos` false, photo references and
 * their files go too, leaving the tracing image.
 */
export function prepareShare(bytes: Uint8Array, includePhotos = true): PreparedShare {
  let files: Record<string, Uint8Array>;
  try { files = readPackageZip(bytes); }
  catch { throw new HandoffError(422, 'This file is not a valid OpenPlan3D project package.'); }
  const manifest = safeJSON(files['manifest.json']);
  if (manifest?.format !== 'openplan3d-project' || manifest.version !== 1 || !['web', 'ios'].includes(manifest.producer) || typeof manifest.title !== 'string' || manifest.title.length > 1000) {
    throw new HandoffError(422, 'This file is not an OpenPlan3D project package.');
  }
  for (const name of Object.keys(files)) {
    if (!['manifest.json', 'plan.json', 'web.json', 'baseline.json', 'mapping.json'].includes(name) && !name.startsWith('assets/')) throw new HandoffError(422, `Unrecognized package file: ${name}.`);
  }
  let plan: Record<string, any>;
  try { plan = validatePackagePlan(safeJSON(files['plan.json'])); }
  catch { throw new HandoffError(422, 'The package plan contains invalid geometry or references.'); }
  let photoCount = 0;
  if (!includePhotos) {
    for (const item of [...plan.rooms, ...plan.furniture]) if (item.photos !== undefined) { photoCount += (item.photos ?? []).length; delete item.photos; }
  } else {
    for (const item of [...plan.rooms, ...plan.furniture]) photoCount += (item.photos ?? []).length;
  }
  const kept: Record<string, Uint8Array> = { 'manifest.json': jsonBytes({ format: 'openplan3d-project', version: 1, producer: manifest.producer, title: manifest.title }) };
  kept['plan.json'] = includePhotos ? files['plan.json'] : jsonBytes(plan);
  for (const filename of nativeAssetNames(plan)) {
    const entry = files[`assets/${filename}`];
    if (!entry) throw new HandoffError(422, `Missing attachment: ${filename}.`);
    kept[`assets/${filename}`] = entry;
  }
  const out = writePackageZip(kept);
  const limit = includePhotos ? SHARE_LIMITS.maxBytes : SHARE_LIMITS.maxBytesWithoutPhotos;
  if (out.byteLength > limit) throw new HandoffError(413, MESSAGES.tooLarge);
  return { bytes: out, title: manifest.title, producer: manifest.producer, photoCount, includePhotos };
}

function safeJSON(bytes: Uint8Array | undefined): any {
  try { return packageJSON(bytes); } catch { return undefined; }
}

export interface CreatedShare { code: string; secret: string; expiresAt: string; title: string }

export async function createShare(store: ShareStore, prepared: PreparedShare, now = Date.now(), random = randomBytes): Promise<CreatedShare> {
  await reserveAdmission(store, prepared.bytes.byteLength, SHARE_LIMITS, MESSAGES, now);
  const expiresAt = new Date(now + SHARE_RETENTION_MS).toISOString();
  const secret = random(16).toString('hex');
  const metadata = {
    source: SOURCE, secretHash: hashSecret(secret), expiresAt, failures: '0',
    title: prepared.title.replace(/[\p{Cc}]/gu, ' ').slice(0, 120), producer: prepared.producer, photos: prepared.includePhotos ? '1' : '0',
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = [...random(8)].map(value => ALPHABET[value & 31]).join('');
    if (await store.create(shareObjectName(code), prepared.bytes, metadata, 'application/zip')) return { code, secret, expiresAt, title: prepared.title };
  }
  throw new HandoffError(503, 'Could not reserve a share code. Please try again.', 5);
}

export interface AuthorizedShare { name: string; metadata: Record<string, string>; metageneration: string; size: number }

/** Check a code/secret pair without revealing which half was wrong; twenty bad secrets lock the code. */
export async function authorizeShare(store: ShareStore, code: unknown, secret: unknown, now = Date.now()): Promise<AuthorizedShare> {
  if (!validCode(code) || !validSecret(secret)) throw new HandoffError(400, 'A share needs its eight-character code and the secret shown when it was created.');
  const name = shareObjectName(code);
  const object = await store.metadata(name);
  if (!object || object.metadata.source !== SOURCE) throw new HandoffError(404, 'Unknown or expired share code.');
  const expires = Date.parse(object.metadata.expiresAt ?? '');
  if (!Number.isFinite(expires) || expires <= now) throw new HandoffError(410, 'This share has expired.');
  const failures = Number(object.metadata.failures ?? '0');
  if (!Number.isSafeInteger(failures) || failures >= SHARE_LOCKOUT) throw new HandoffError(403, 'This share is locked after too many wrong secrets. Create a new share.');
  const expected = Buffer.from(object.metadata.secretHash ?? '', 'hex'), actual = Buffer.from(hashSecret(secret), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    // Best effort: a lost increment under contention only delays the lockout by one attempt.
    for (let attempt = 0, snapshot = object; attempt < 3 && snapshot; attempt++) {
      if (await store.patchMetadata(name, { ...snapshot.metadata, failures: String(Number(snapshot.metadata.failures ?? '0') + 1) }, snapshot.metageneration)) break;
      snapshot = (await store.metadata(name))!;
    }
    throw new HandoffError(403, 'Wrong secret for this share code.');
  }
  return { name, metadata: object.metadata, metageneration: object.metageneration, size: object.size };
}

export async function loadShare(store: ShareStore, code: unknown, secret: unknown, now = Date.now()): Promise<{ bytes: Uint8Array; metadata: Record<string, string> }> {
  const share = await authorizeShare(store, code, secret, now);
  const bytes = await store.get(share.name, SHARE_LIMITS.maxBytes);
  if (!bytes) throw new HandoffError(404, 'Unknown or expired share code.');
  return { bytes, metadata: share.metadata };
}

export async function deleteShare(store: ShareStore, code: unknown, secret: unknown, now = Date.now()): Promise<void> {
  const share = await authorizeShare(store, code, secret, now);
  await store.remove(share.name);
}
