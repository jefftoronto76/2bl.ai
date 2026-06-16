// GET /api/media?chat_id=...&status=ready,failed
// Returns the current user's media items for a chat session, optionally
// filtered by status. Used for catch-up hydration on ChatProvider mount
// to recover any items whose Realtime completion event was missed.

import { getCurrentUser } from '@/services/auth'
import { getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { listByChat, listByMember, type MediaItemStatus } from '@/services/media'

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

  return Response.json({ items: ownItems })
}
