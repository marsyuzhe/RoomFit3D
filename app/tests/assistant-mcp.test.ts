import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createLimiter, handleMcpMessage, mcpTools } from '$lib/server/assistantMcp';
import { createShare, prepareShare } from '$lib/server/assistantShares';
import { MemoryShareStore } from './fixtures/shareStore';

const now = Date.UTC(2026, 8, 16, 12, 0, 30);
const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}.zip`));
const rpc = (method: string, params: any = {}, id: number | string = 1) => ({ jsonrpc: '2.0', id, method, params });

it('handshakes, lists four read-only tools and ignores notifications', async () => {
  const store = new MemoryShareStore();
  const init = await handleMcpMessage(rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {} }), { store });
  expect(init).toMatchObject({ id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'openplan3d-shares' } } });
  expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, { store })).toBeNull();
  const tools = (await handleMcpMessage(rpc('tools/list'), { store }))!.result.tools;
  expect(tools.map((t: any) => t.name)).toEqual(['summarize_share', 'review_share_photos', 'handoff_share', 'list_share_files']);
  expect(mcpTools().every(t => t.inputSchema.required.includes('secret'))).toBe(true);
  expect(mcpTools().every(t => t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false)).toBe(true);
  expect(await handleMcpMessage(rpc('ping'), { store })).toMatchObject({ result: {} });
  expect(await handleMcpMessage(rpc('nonsense'), { store })).toMatchObject({ error: { code: -32601 } });
  expect(await handleMcpMessage('garbage', { store })).toMatchObject({ error: { code: -32600 } });
});

it('runs every tool against a share and reports wrong secrets as tool errors', async () => {
  const store = new MemoryShareStore();
  const created = await createShare(store, prepareShare(fixture('native-project-package')), now);
  const call = (name: string, extra: any = {}) => handleMcpMessage(rpc('tools/call', { name, arguments: { code: created.code, secret: created.secret, ...extra } }), { store, now: () => now });
  const summary = (await call('summarize_share'))!.result;
  expect(summary.isError).toBe(false);
  expect(summary.structuredContent.totals.wallCount).toBe(5);
  expect(JSON.parse(summary.content[0].text).title).toBe('QA Project Package');
  expect((await call('review_share_photos'))!.result.structuredContent.unreferenced).toEqual([]); // orphan.png was stripped at share time
  const handoff = (await call('handoff_share', { codes: { doors: 'DOR-1' } }))!.result.structuredContent;
  expect(handoff.codesApplied).toEqual(['doors']);
  expect((await call('handoff_share', { codes: ['bad'] }))!.result).toMatchObject({ isError: true });
  const files = (await call('list_share_files'))!.result.structuredContent;
  expect(files).toMatchObject({ title: 'QA Project Package', photosIncluded: true });
  expect(files.files.map((f: any) => f.path).sort()).toEqual(['assets/chair.png', 'manifest.json', 'plan.json']);
  const wrong = await handleMcpMessage(rpc('tools/call', { name: 'summarize_share', arguments: { code: created.code, secret: 'f'.repeat(32) } }), { store, now: () => now });
  expect(wrong!.result).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/Wrong secret/) }] });
  const missing = await handleMcpMessage(rpc('tools/call', { name: 'summarize_share', arguments: {} }), { store });
  expect(missing!.result).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/eight-character code/) }] });
  expect((await call('unknown_tool'))!.result).toMatchObject({ isError: true });
});

it('rate-limits a single code per minute without touching storage', async () => {
  const store = new MemoryShareStore();
  const created = await createShare(store, prepareShare(fixture('native-project-package')), now);
  const codeLimiter = createLimiter(2);
  const deps = { store, now: () => now, codeLimiter };
  const args = { code: created.code, secret: created.secret };
  expect((await handleMcpMessage(rpc('tools/call', { name: 'list_share_files', arguments: args }), deps))!.result.isError).toBe(false);
  expect((await handleMcpMessage(rpc('tools/call', { name: 'list_share_files', arguments: args }), deps))!.result.isError).toBe(false);
  const third = await handleMcpMessage(rpc('tools/call', { name: 'list_share_files', arguments: args }), deps);
  expect(third!.result).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/Too many requests/) }] });
  expect((await handleMcpMessage(rpc('tools/call', { name: 'list_share_files', arguments: args }), { ...deps, now: () => now + 60_000 }))!.result.isError).toBe(false);
});
