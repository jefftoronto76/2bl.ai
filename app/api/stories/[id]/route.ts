import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { discardStory } from '@/services/crm/stories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

/**
 * DELETE /api/stories/[id] — soft-deletes a story (discardStory,
 * services/crm/stories.ts — stamps discarded_at, same convention
 * discardMemory already uses on this same artifacts table). Requires a
 * signed-in account: a story is scoped to tenant_id + user_id (not
 * session_id — a story has none), so there's no anonymous-caller shape to
 * support here the way memories' session-scoped writes have.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories/[id]] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const result = await discardStory(tenantId, userId, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.STORY_DISCARDED,
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: 'user',
    target_type: 'story',
    target_id: id,
    outcome: 'success',
  })

  return NextResponse.json({ ok: true })
}
