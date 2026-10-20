import { vi } from 'vitest';
import type { ShareStore } from '$lib/server/assistantShares';
import type { QuotaSnapshot, QuotaState } from '$lib/server/handoffQuota';

/** In-memory stand-in for the bucket: quota ledger plus objects with metadata and preconditions. */
export class MemoryShareStore implements ShareStore {
  snapshot: QuotaSnapshot | null = null;
  objects = new Map<string, { bytes: Uint8Array; metadata: Record<string, string>; contentType: string; generation: number; metageneration: number }>();
  read = vi.fn(async () => structuredClone(this.snapshot));
  write = vi.fn(async (previous: QuotaSnapshot | null, state: QuotaState) => {
    if (previous?.metageneration !== this.snapshot?.metageneration) return false;
    this.snapshot = { state: structuredClone(state), generation: '1', metageneration: String(Number(this.snapshot?.metageneration ?? '0') + 1) };
    return true;
  });
  async create(name: string, bytes: Uint8Array, metadata: Record<string, string> = {}, contentType = 'application/json') {
    if (this.objects.has(name)) return false;
    this.objects.set(name, { bytes, metadata: { ...metadata }, contentType, generation: 1, metageneration: 1 });
    return true;
  }
  async metadata(name: string) {
    const object = this.objects.get(name);
    return object ? { metadata: { ...object.metadata }, generation: String(object.generation), metageneration: String(object.metageneration), size: object.bytes.byteLength } : null;
  }
  async get(name: string) { return this.objects.get(name)?.bytes ?? null; }
  async patchMetadata(name: string, metadata: Record<string, string>, metageneration: string) {
    const object = this.objects.get(name);
    if (!object || String(object.metageneration) !== metageneration) return false;
    object.metadata = { ...metadata }; object.metageneration++;
    return true;
  }
  async remove(name: string) { return this.objects.delete(name); }
}
