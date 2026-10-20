import type { Project } from '$lib/models/types';
import { projectPackageBytes } from './projectPackage';

/** Share with Assistant from the web editor: upload the project package and show the code and secret once. */
export const ASSISTANT_SHARE_ENDPOINT = '/api/assistant-shares';
export const ASSISTANT_CONNECTOR_URL = 'https://app.openplan3d.com/mcp';
export const ASSISTANT_SHARE_MAX_BYTES = 64 * 1024 * 1024;

export interface AssistantShare { code: string; secret: string; expiresAt: string; title: string }
export class AssistantShareError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const validCode = (code: unknown) => typeof code === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(code);
const validSecret = (secret: unknown) => typeof secret === 'string' && /^[0-9a-f]{32}$/.test(secret);

async function failure(response: Response): Promise<AssistantShareError> {
  let message = '';
  try { message = String((await response.json())?.error ?? ''); } catch { /* non-JSON error body */ }
  const fallback: Record<number, string> = {
    413: 'This project is too large to share with an assistant: 64 MiB with photos, 16 MiB without.',
    422: 'This project could not be packaged for sharing.',
    429: 'Assistant sharing has reached its daily limit. Download the project package and attach it instead, or try again later.',
    503: 'Assistant sharing is not available right now. Download the project package and attach it instead.',
  };
  return new AssistantShareError(response.status, message || fallback[response.status] || `Sharing failed (HTTP ${response.status}).`);
}

/** Never retried: an uncertain response may already hold a quota reservation. */
export async function shareWithAssistant(project: Project, includePhotos: boolean, fetchImpl: typeof fetch = fetch): Promise<AssistantShare> {
  const bytes = projectPackageBytes(project);
  if (bytes.byteLength > ASSISTANT_SHARE_MAX_BYTES) throw new AssistantShareError(413, 'This project is too large to share with an assistant: 64 MiB with photos, 16 MiB without.');
  const response = await fetchImpl(includePhotos ? ASSISTANT_SHARE_ENDPOINT : `${ASSISTANT_SHARE_ENDPOINT}?photos=0`, {
    method: 'POST', headers: { 'Content-Type': 'application/zip', Accept: 'application/json' }, body: bytes as Uint8Array<ArrayBuffer>,
  });
  if (!response.ok) throw await failure(response);
  const reply = await response.json().catch(() => null);
  if (!reply || !validCode(reply.code) || !validSecret(reply.secret) || !Number.isFinite(Date.parse(reply.expiresAt))) {
    throw new AssistantShareError(502, 'The sharing server returned an invalid response. Download the project package and attach it instead.');
  }
  return { code: reply.code, secret: reply.secret, expiresAt: reply.expiresAt, title: typeof reply.title === 'string' ? reply.title : project.name };
}

export async function deleteAssistantShare(share: Pick<AssistantShare, 'code' | 'secret'>, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!validCode(share.code)) throw new AssistantShareError(400, 'Invalid share code.');
  const response = await fetchImpl(`${ASSISTANT_SHARE_ENDPOINT}/${share.code}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: share.secret }),
  });
  if (!response.ok) throw await failure(response);
}
