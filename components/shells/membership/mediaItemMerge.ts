import type { ClientMediaItem } from './chatStore'

/**
 * Merges a fresh media item (from GET /api/media or a Realtime payload) over a
 * previously-known one. `localPreviewUrl` only ever comes from the initial
 * upload (Realtime/API responses never carry it) and `url` only comes from
 * the API's batch signing (Realtime payloads never carry it) — both are
 * preserved from the previous entry when the incoming one doesn't have them,
 * rather than being clobbered to undefined/null. Same reasoning for
 * `width`/`height` — client-captured only, never present on a Realtime/API
 * refresh payload.
 */
export function mergeMediaItem(
  prev: ClientMediaItem | undefined,
  incoming: ClientMediaItem,
): ClientMediaItem {
  return {
    ...incoming,
    localPreviewUrl: prev?.localPreviewUrl ?? incoming.localPreviewUrl,
    url: incoming.url ?? prev?.url ?? null,
    width: incoming.width ?? prev?.width,
    height: incoming.height ?? prev?.height,
  }
}
