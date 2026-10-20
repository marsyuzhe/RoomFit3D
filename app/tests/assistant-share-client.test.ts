import { expect, it, vi } from 'vitest';
import { deleteAssistantShare, shareWithAssistant, AssistantShareError } from '$lib/services/assistantShare';
import { readPackageZip } from '$lib/utils/projectPackageZip';
import { roomProject } from './fixtures/project';

const reply = { code: 'ABCDEFGH', secret: '0123456789abcdef0123456789abcdef', expiresAt: '2026-09-23T12:00:30.000Z', title: 'Regression plan' };
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

it('uploads the project package as a ZIP and parses the share', async () => {
  const fetchImpl = vi.fn(async () => respond(201, reply));
  const share = await shareWithAssistant(roomProject(), true, fetchImpl as any);
  expect(share).toEqual(reply);
  const [url, init] = fetchImpl.mock.calls[0] as any;
  expect(url).toBe('/api/assistant-shares');
  expect(init.method).toBe('POST');
  expect(init.headers['Content-Type']).toBe('application/zip');
  expect(Object.keys(readPackageZip(init.body))).toContain('plan.json');
});

it('flags excluded photos on the URL, sends the secret only in the delete body, and maps errors', async () => {
  const fetchImpl = vi.fn(async (url: string) => (url.includes('photos=0') ? respond(201, reply) : new Response(null, { status: 204 })));
  await shareWithAssistant(roomProject(), false, fetchImpl as any);
  await deleteAssistantShare(reply, fetchImpl as any);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/assistant-shares?photos=0');
  const [deleteUrl, deleteInit] = fetchImpl.mock.calls[1] as any;
  expect(deleteUrl).toBe('/api/assistant-shares/ABCDEFGH');
  expect(deleteInit.method).toBe('DELETE');
  expect(JSON.parse(deleteInit.body)).toEqual({ secret: reply.secret });
  for (const [status, pattern] of [[429, /daily limit/], [503, /not available/], [413, /too large/]] as const) {
    await expect(shareWithAssistant(roomProject(), true, (async () => respond(status, {})) as any)).rejects.toMatchObject({ status, message: pattern });
  }
  await expect(shareWithAssistant(roomProject(), true, (async () => respond(422, { error: 'Server says no.' })) as any)).rejects.toThrow('Server says no.');
  await expect(shareWithAssistant(roomProject(), true, (async () => respond(201, { code: 'x', secret: 'y', expiresAt: 'z' })) as any)).rejects.toBeInstanceOf(AssistantShareError);
});
