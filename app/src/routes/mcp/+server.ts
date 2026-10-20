import { json } from '@sveltejs/kit';
import { HandoffError } from '$lib/server/handoffQuota';
import { createLimiter, handleMcpMessage } from '$lib/server/assistantMcp';
import { shareStorage } from '$lib/server/assistantShareRoutes';

const MAX_BODY = 64 * 1024;
const codeLimiter = createLimiter(30), globalLimiter = createLimiter(120);
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

/** Streamable HTTP transport, stateless: every POST carries one JSON-RPC message or a batch. */
export async function POST({ request }: { request: Request }) {
  let store;
  try { store = shareStorage(); }
  catch (error) { return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: error instanceof HandoffError ? error.message : 'Unavailable' } }, { status: 503, headers }); }
  if (Number(request.headers.get('content-length')) > MAX_BODY) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, { status: 413, headers });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) throw new Error('too large');
    body = JSON.parse(text);
  } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers }); }
  const deps = { store, codeLimiter, globalLimiter };
  if (Array.isArray(body)) {
    if (body.length > 20) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch too large' } }, { status: 400, headers });
    const responses = (await Promise.all(body.map(message => handleMcpMessage(message, deps)))).filter(Boolean);
    return responses.length ? json(responses, { status: 200, headers }) : new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }
  const response = await handleMcpMessage(body, deps);
  return response ? json(response, { status: 200, headers }) : new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

const notAllowed = () => new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
