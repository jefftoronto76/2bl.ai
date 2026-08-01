// GET /api/media?chat_id=...&status=ready,failed
// Returns the current user's media items for a chat session, optionally
// filtered by status. Used for catch-up hydration on ChatProvider mount
// to recover any items whose Realtime completion event was missed.
//
// Also attaches a signed display `url` per image item (batched here, in
// parallel) so the client can render inline previews without a separate
// per-image GET /api/media/[id]/url round trip on every reload — see
// components/shells/membership/MessageList.tsx's InlineImage.

import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { listByChat, listByMember, type MediaItem, type MediaItemStatus } from '@/services/media'
import { generateSignedDownloadUrl } from '@/services/media/storage'

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

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return Response.json({ items: [] })
  }

  const { searchParams } = new URL(req.url)
  const chatId = searchParams.get('chat_id')
  const statusParam = searchParams.get('status')
  const statuses = statusParam
    ? (statusParam.split(',').filter(Boolean) as MediaItemStatus[])
    : undefined

  // Resolve members.id for scoping
  const supabase = getAdminClient()
  const { data: memberRow } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('clerk_id', user.providerUserId)
    .single()

  if (!memberRow) {
    return Response.json({ items: [] })
  }

  const items = chatId
    ? await listByChat(chatId, tenantId, statuses)
    : await listByMember(memberRow.id, tenantId)

  // Filter to only this member's items (defense-in-depth)
  const ownItems = items.filter((item) => item.member_id === memberRow.id)

  const itemsWithUrls = await Promise.all(ownItems.map(withDisplayUrl))

  return Response.json({ items: itemsWithUrls })
}
