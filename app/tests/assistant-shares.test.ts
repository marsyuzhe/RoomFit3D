import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { authorizeShare, createShare, deleteShare, loadShare, prepareShare, readShareUpload, SHARE_LIMITS, SHARE_LOCKOUT, SHARE_RETENTION_MS, validCode, validSecret, type ShareStore } from '$lib/server/assistantShares';
import { jsonBytes, packageJSON, readPackageZip, writePackageZip } from '$lib/utils/projectPackageZip';
import { MemoryShareStore } from './fixtures/shareStore';

const now = Date.UTC(2026, 8, 16, 12, 0, 30);
const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}.zip`));

export const fixedRandom = (size: number) => Buffer.alloc(size, 7);

it('keeps only the manifest, plan and referenced attachments, dropping retained originals', () => {
  const prepared = prepareShare(fixture('web-metadata-package'));
  const files = readPackageZip(prepared.bytes);
  expect(Object.keys(files).sort()).toEqual(['assets/chair.png', 'assets/new-photo.png', 'manifest.json', 'plan.json']);
  expect(packageJSON(files['manifest.json'])).toEqual({ format: 'openplan3d-project', version: 1, producer: 'web', title: 'QA Project Package' });
  expect(files['plan.json']).toEqual(readPackageZip(fixture('web-metadata-package'))['plan.json']);
  expect(prepared).toMatchObject({ title: 'QA Project Package', producer: 'web', photoCount: 2, includePhotos: true });
});

it('strips photo references and files when photos are excluded, keeping the tracing image', () => {
  const prepared = prepareShare(fixture('web-metadata-package'), false);
  const files = readPackageZip(prepared.bytes), plan = packageJSON(files['plan.json']);
  expect(Object.keys(files).sort()).toEqual(['assets/chair.png', 'manifest.json', 'plan.json']); // chair.png is the underlay
  expect(plan.rooms[0].photos).toBeUndefined(); expect(plan.furniture[0].photos).toBeUndefined();
  expect(plan.planNotes).toBe('Keep the complete plan notes'); expect(plan.vendor).toEqual({ original: 'Keep me' });
  expect(prepared.photoCount).toBe(2);
});

it('rejects non-packages, foreign entries, missing attachments and oversize shares', () => {
  expect(() => prepareShare(new Uint8Array([1, 2, 3]))).toThrow(/not a valid/);
  const base = readPackageZip(fixture('native-project-package'));
  expect(() => prepareShare(writePackageZip({ ...base, 'manifest.json': jsonBytes({ format: 'other', version: 1 }) }))).toThrow(/not an OpenPlan3D/);
  expect(() => prepareShare(writePackageZip({ ...base, 'notes.txt': new Uint8Array([1]) }))).toThrow(/Unrecognized package file/);
  const missing = { ...base }; delete missing['assets/chair.png'];
  expect(() => prepareShare(writePackageZip(missing))).toThrow(/Missing attachment/);
  const big = { ...base, 'assets/chair.png': new Uint8Array(SHARE_LIMITS.maxBytesWithoutPhotos + 1) };
  expect(() => prepareShare(writePackageZip(big), false)).toThrow(/too large/);
});

it('validates upload headers and counts streamed bytes', async () => {
  const request = (body: Uint8Array, headers: Record<string, string>) => new Request('https://example.test/api/assistant-shares', { method: 'POST', headers, body: body as unknown as BodyInit });
  await expect(readShareUpload(request(fixture('native-project-package'), { 'Content-Type': 'application/json' }))).rejects.toMatchObject({ status: 415 });
  await expect(readShareUpload(request(fixture('native-project-package'), { 'Content-Type': 'application/zip', 'Content-Length': String(SHARE_LIMITS.maxBytes + 1) }))).rejects.toMatchObject({ status: 413 });
  const bytes = await readShareUpload(request(fixture('native-project-package'), { 'Content-Type': 'application/zip' }));
  expect(bytes.byteLength).toBe(fixture('native-project-package').byteLength);
  expect(Buffer.compare(Buffer.from(bytes), Buffer.from(fixture('native-project-package')))).toBe(0);
});

it('creates a share behind the quota ledger and stores only a hash of the secret', async () => {
  const store = new MemoryShareStore();
  const created = await createShare(store, prepareShare(fixture('native-project-package')), now, fixedRandom as any);
  expect(validCode(created.code)).toBe(true); expect(validSecret(created.secret)).toBe(true);
  expect(created.expiresAt).toBe(new Date(now + SHARE_RETENTION_MS).toISOString());
  expect(store.snapshot!.state).toMatchObject({ uploads: 1 });
  const object = store.objects.get(`assistant-shares/${created.code}/package.zip`)!;
  expect(object.contentType).toBe('application/zip');
  expect(object.metadata).toMatchObject({ source: 'assistant-share-v1', title: 'QA Project Package', producer: 'ios', photos: '1', failures: '0' });
  expect(object.metadata.secretHash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(object.metadata)).not.toContain(created.secret);
  expect(readPackageZip(object.bytes)['plan.json']).toBeDefined();
  await expect(createShare(store, prepareShare(fixture('native-project-package')), now, fixedRandom as any)).rejects.toMatchObject({ status: 503 }); // same fixed code
});

it('authorizes with the right secret, counts wrong secrets, locks after twenty and honours expiry', async () => {
  const store = new MemoryShareStore();
  const created = await createShare(store, prepareShare(fixture('native-project-package')), now);
  const loaded = await loadShare(store, created.code, created.secret, now);
  expect(readPackageZip(loaded.bytes)['plan.json']).toBeDefined();
  expect(loaded.metadata.title).toBe('QA Project Package');
  await expect(authorizeShare(store, created.code, 'f'.repeat(32), now)).rejects.toMatchObject({ status: 403, message: /Wrong secret/ });
  expect(store.objects.get(`assistant-shares/${created.code}/package.zip`)!.metadata.failures).toBe('1');
  for (let i = 1; i < SHARE_LOCKOUT; i++) await authorizeShare(store, created.code, 'f'.repeat(32), now).catch(() => {});
  await expect(authorizeShare(store, created.code, created.secret, now)).rejects.toMatchObject({ status: 403, message: /locked/ });
  await expect(authorizeShare(store, 'ZZZZZZZZ', created.secret, now)).rejects.toMatchObject({ status: 404 });
  await expect(authorizeShare(store, 'bad code', created.secret, now)).rejects.toMatchObject({ status: 400 });
  await expect(authorizeShare(store, created.code, 'short', now)).rejects.toMatchObject({ status: 400 });
  const fresh = new MemoryShareStore();
  const later = await createShare(fresh, prepareShare(fixture('native-project-package')), now);
  await expect(authorizeShare(fresh, later.code, later.secret, now + SHARE_RETENTION_MS)).rejects.toMatchObject({ status: 410 });
});

it('deletes only with the right secret', async () => {
  const store = new MemoryShareStore();
  const created = await createShare(store, prepareShare(fixture('native-project-package')), now);
  await expect(deleteShare(store, created.code, 'f'.repeat(32), now)).rejects.toMatchObject({ status: 403 });
  expect(store.objects.size).toBe(1);
  await deleteShare(store, created.code, created.secret, now);
  expect(store.objects.size).toBe(0);
  await expect(loadShare(store, created.code, created.secret, now)).rejects.toMatchObject({ status: 404 });
});
