import { HandoffError } from '$lib/server/handoffQuota';
import { deleteShare } from '$lib/server/assistantShares';
import { shareErrorResponse, shareStorage } from '$lib/server/assistantShareRoutes';

/** Immediate removal by the owner; the secret travels in the JSON body, never the URL. */
export async function DELETE({ request, params }: { request: Request; params: { code: string } }) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  try {
    const store = shareStorage();
    let body: any;
    try { body = await request.json(); } catch { throw new HandoffError(400, 'Send the share secret as JSON: {"secret": "..."}.'); }
    await deleteShare(store, params.code, body?.secret);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return shareErrorResponse(error, headers);
  }
}
