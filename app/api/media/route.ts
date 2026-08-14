// GET /api/media?chat_id=...&status=ready,failed
// Returns the current user's media items for a chat session, optionally
// filtered by status. Used for catch-up hydration on ChatProvider mount
// to recover any items whose Realtime completion event was missed.
//
// Also attaches a signed display `url` per image item (batched here, in
// parallel) so the client can render inline previews without a separate
// per-image GET /api/media/[id]/url round trip on every reload — see
// components/shells/membership/MessageList.tsx's InlineImage.
//
// Pagination (`limit`, optionally `cursor`) is opt-in — see
// services/media/index.ts's MediaPaginationParams doc comment for why
// cursor-based, not offset. Passing `limit` signs URLs for only that
// page's items, closing the "signs every account/chat item upfront, before
// anything renders" bottleneck (System Docs/Known Gaps.md). Omitting
// `limit` keeps this route's original unpaginated behavior — chatStore.tsx's
// catch-up/poll fetches rely on getting the complete list back, not a page.

import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { listByChat, listByMember, withDisplayUrl, type MediaItemStatus } from '@/services/media'

const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 100

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
  const limitParam = searchParams.get('limit')
  const cursor = searchParams.get('cursor')
  const paginated = limitParam !== null
  const limit = paginated
    ? Math.min(Math.max(parseInt(limitParam, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
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

  if (paginated) {
    const page = chatId
      ? await listByChat(chatId, tenantId, statuses, { limit: limit!, cursor })
      : await listByMember(memberRow.id, tenantId, { limit: limit! })

    // Filter to only this member's items (defense-in-depth)
    const ownItems = page.items.filter((item) => item.member_id === memberRow.id)
    const itemsWithUrls = await Promise.all(ownItems.map(withDisplayUrl))

    return Response.json({ items: itemsWithUrls, hasMore: page.hasMore, nextCursor: page.nextCursor })
  }

  const items = chatId
    ? await listByChat(chatId, tenantId, statuses)
    : await listByMember(memberRow.id, tenantId)

  // Filter to only this member's items (defense-in-depth)
  const ownItems = items.filter((item) => item.member_id === memberRow.id)

  const itemsWithUrls = await Promise.all(ownItems.map(withDisplayUrl))

  return Response.json({ items: itemsWithUrls })
}
