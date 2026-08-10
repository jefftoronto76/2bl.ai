import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { discardStory } from '@/services/crm/stories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

/**
 * DELETE /api/stories/[id] — soft-discards a story (discardStory,
 * services/crm/stories.ts). Mirrors DELETE /api/sessions/[id]'s single-row
 * shape (204, tenant-scoped only) rather than the bulk memories DELETE
 * route's `{ ok: true }` shape.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories/[id]/route] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const result = await discardStory(tenantId, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.STORY_DISCARDED,
    tenant_id: tenantId,
    target_type: 'story',
    target_id: id,
  })

  return new NextResponse(null, { status: 204 })
}
