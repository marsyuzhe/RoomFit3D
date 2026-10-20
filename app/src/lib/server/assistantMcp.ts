import { HandoffError } from './handoffQuota';
import { loadShare, validCode, type ShareStore } from './assistantShares';
import { readPackageZip } from '$lib/utils/projectPackageZip';
import { handoffScope, loadPackage, reviewPhotos, summarizePackage, SkillPackageError } from '$lib/skills';

/** Minimal Model Context Protocol server over streamable HTTP, stateless, read-only. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_INFO = { name: 'openplan3d-shares', version: '0.1.0' };
export const MCP_INSTRUCTIONS =
  'OpenPlan3D floor plan data shared by its owner. Every tool needs the eight-character share code and the secret the person was shown ' +
  'when they chose Share with Assistant; ask for both. Lengths are metres. Tools are read-only. Room areas come from the app; never invent them.';
const CODE_KEYS = ['floorArea', 'ceilingArea', 'wallAreaNetRoom', 'wallRunRoom', 'livingAreaLevel', 'wallAreaNetLevel', 'wallAreaGrossLevel', 'wallRunLevel', 'doors', 'windows'];

export interface McpLimiter { allow(key: string, now: number): boolean }
/** Process-local per-key minute window; the durable protection is the secret plus lockout. */
export function createLimiter(perMinute: number): McpLimiter {
  const counts = new Map<string, { minute: number; count: number }>();
  return {
    allow(key, now) {
      const minute = Math.floor(now / 60_000);
      const entry = counts.get(key);
      if (!entry || entry.minute !== minute) { if (counts.size > 10_000) counts.clear(); counts.set(key, { minute, count: 1 }); return true; }
      return ++entry.count <= perMinute;
    },
  };
}
export interface McpDeps { store: ShareStore; now?: () => number; codeLimiter?: McpLimiter; globalLimiter?: McpLimiter }

const shareArguments = {
  code: { type: 'string', description: 'Eight-character share code from the app' },
  secret: { type: 'string', description: 'Secret shown with the code when the share was created' },
};
/** Every tool only reads a share; clients such as ChatGPT use these hints to skip write/destructive warnings. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export function mcpTools() {
  return [
    { name: 'summarize_share', annotations: READ_ONLY, description: 'Summarize a shared OpenPlan3D project: floors, rooms with areas, openings, furniture, notes, attachments and documentation gaps.', inputSchema: { type: 'object', properties: shareArguments, required: ['code', 'secret'] } },
    { name: 'review_share_photos', annotations: READ_ONLY, description: 'Review photo coverage of a shared project: photos per room and item, missing, unreferenced, shared and low-resolution files, and photos still to take.', inputSchema: { type: 'object', properties: shareArguments, required: ['code', 'secret'] } },
    { name: 'handoff_share', annotations: READ_ONLY, description: 'Build a contractor or adjuster handoff from a shared project: per-floor and per-room areas, wall runs and surfaces, openings schedule, furniture inventory, notes, evidence and a quantities table. Quantities only, no pricing. Optional codes map quantity keys to your line-item codes.', inputSchema: { type: 'object', properties: { ...shareArguments, codes: { type: 'object', additionalProperties: { type: 'string' }, description: `Optional map of quantity keys (${CODE_KEYS.join(', ')}) to your codes` } }, required: ['code', 'secret'] } },
    { name: 'list_share_files', annotations: READ_ONLY, description: 'List the files inside a shared project package with sizes, plus the share title, expiry and whether photos were included. Photo bytes are not returned.', inputSchema: { type: 'object', properties: shareArguments, required: ['code', 'secret'] } },
  ];
}

class ToolError extends Error {}

async function callTool(name: string, args: Record<string, any>, deps: McpDeps) {
  const now = deps.now?.() ?? Date.now();
  if (deps.globalLimiter && !deps.globalLimiter.allow('global', now)) throw new ToolError('The assistant connector is busy. Try again in a minute.');
  const code = args.code;
  if (deps.codeLimiter && validCode(code) && !deps.codeLimiter.allow(code, now)) throw new ToolError('Too many requests for this share code. Try again in a minute.');
  const { bytes, metadata } = await loadShare(deps.store, code, args.secret, now);
  if (name === 'list_share_files') {
    const files = readPackageZip(bytes);
    return {
      title: metadata.title ?? null, expiresAt: metadata.expiresAt ?? null, photosIncluded: metadata.photos === '1',
      files: Object.entries(files).map(([path, data]) => ({ path, bytes: data.byteLength })),
    };
  }
  let loaded;
  try { loaded = loadPackage(bytes); }
  catch (error) { throw new ToolError(error instanceof SkillPackageError ? error.message : 'The shared package could not be read.'); }
  if (name === 'summarize_share') return summarizePackage(loaded);
  if (name === 'review_share_photos') return reviewPhotos(loaded);
  if (name === 'handoff_share') {
    const codes = args.codes ?? {};
    if (typeof codes !== 'object' || Array.isArray(codes) || !Object.entries(codes).every(([k, v]) => typeof k === 'string' && typeof v === 'string' && k.length <= 64 && v.length <= 64)) {
      throw new ToolError('codes must be an object mapping quantity keys to string codes');
    }
    if (Object.keys(codes).length > 100) throw new ToolError('codes may hold at most 100 entries');
    return handoffScope(loaded, codes);
  }
  throw new ToolError(`Unknown tool: ${name}`);
}

/** One JSON-RPC message in, one response out; null for notifications. */
export async function handleMcpMessage(message: any, deps: McpDeps): Promise<Record<string, any> | null> {
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.method !== 'string') {
    return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  }
  const { method, id } = message, params = message.params ?? {};
  if (method.startsWith('notifications/') || id === undefined || id === null) return null;
  try {
    let result: any;
    if (method === 'initialize') {
      const requested = typeof params.protocolVersion === 'string' && params.protocolVersion ? params.protocolVersion : MCP_PROTOCOL_VERSION;
      result = { protocolVersion: requested, capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS };
    } else if (method === 'ping') result = {};
    else if (method === 'tools/list') result = { tools: mcpTools() };
    else if (method === 'resources/list') result = { resources: [] };
    else if (method === 'prompts/list') result = { prompts: [] };
    else if (method === 'tools/call') {
      try {
        const value = await callTool(String(params.name), params.arguments && typeof params.arguments === 'object' ? params.arguments : {}, deps);
        result = { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false };
      } catch (error) {
        if (error instanceof ToolError || error instanceof HandoffError) result = { content: [{ type: 'text', text: error.message }], isError: true };
        else throw error;
      }
    } else return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    return { jsonrpc: '2.0', id, result };
  } catch (error) {
    console.error(JSON.stringify({ event: 'mcp_internal_error', method, kind: error instanceof Error ? error.name : 'unknown' }));
    return { jsonrpc: '2.0', id, error: { code: -32603, message: 'The assistant connector is temporarily unavailable.' } };
  }
}
