// services/media/display-url.ts
//
// Extracted out of app/api/media/route.ts (2026-08-02) — a Next.js App
// Router route.ts file may only export HTTP method handlers (GET, POST, …)
// plus a small set of reserved config fields; any other named export fails
// Next's route-type validation at build time ("X is not a valid Route
// export field"), not just a lint warning — it fails `next build` outright.
// withDisplayUrl was a plain helper, not a route handler, so it never
// belonged in the route file to begin with.

import { generateSignedDownloadUrl } from '@/services/media/storage'
import type { MediaItem } from './types'

export interface MediaItemWithUrl extends MediaItem {
  /** Signed display URL, image items only — null for audio/document (no inline
   *  preview) and null if signing failed (caller falls back to its own fetch). */
  url: string | null
}

export async function withDisplayUrl(item: MediaItem): Promise<MediaItemWithUrl> {
  if (item.type !== 'image') return { ...item, url: null }
  try {
    return { ...item, url: await generateSignedDownloadUrl(item.storage_path) }
  } catch (err) {
    console.error('[api/media] failed to sign display url', { mediaItemId: item.id, err })
    return { ...item, url: null }
  }
}
