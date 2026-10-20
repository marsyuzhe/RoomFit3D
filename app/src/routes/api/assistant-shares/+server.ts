import { json } from '@sveltejs/kit';
import { HandoffError } from '$lib/server/handoffQuota';
import { createShare, prepareShare, readShareUpload } from '$lib/server/assistantShares';
import { shareErrorResponse, shareStorage } from '$lib/server/assistantShareRoutes';

let minute = -1, requests = 0;

export async function POST({ request, url }: { request: Request; url: URL }) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  try {
    const store = shareStorage();
    const currentMinute = Math.floor(Date.now() / 60_000);
    if (minute !== currentMinute) { minute = currentMinute; requests = 0; }
    if (++requests > 10) throw new HandoffError(429, 'Assistant sharing is busy. Try again in a minute.', 60);
    const includePhotos = url.searchParams.get('photos') !== '0';
    const prepared = prepareShare(await readShareUpload(request), includePhotos);
    return json(await createShare(store, prepared), { status: 201, headers });
  } catch (error) {
    return shareErrorResponse(error, headers);
  }
}
