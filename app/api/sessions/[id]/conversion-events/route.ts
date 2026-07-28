import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { overwriteConversionEventsFrom } from '@/services/crm/conversion-events'

/**
 * PATCH /api/sessions/[id]/conversion-events?after=<ISO 8601 timestamp> —
 * flips every still-'presented' conversion_events row for this session
 * created after `after` to 'overwritten'. Called by the chat engine
 * (services/chat/ui/v1/useChatTurn.ts `truncateAndRedeliver`) right after
 * editing/resending a visitor message truncates the transcript, so a
 * booking offer or contact capture tied to a now-discarded reply doesn't sit
 * silently as 'presented' forever — mirrors DELETE /api/sessions/[id]/feedback.
 * Always returns 200 once the request itself validates: overwriteConversionEventsFrom
 * swallows its own errors (this is best-effort bookkeeping nothing reads
 * back from, unlike a visitor's own feedback rating), so there is nothing
 * meaningful to surface as a failure status here. Same anonymous-safe trust
 * posture as the feedback route — no Clerk auth requirement, tenant +
 * session scoping is the guard.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/conversion-events] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const after = searchParams.get('after')
  if (!after || Number.isNaN(Date.parse(after))) {
    return NextResponse.json({ error: 'after must be a valid ISO 8601 timestamp' }, { status: 400 })
  }

  await overwriteConversionEventsFrom(tenantId, id, after)

  return NextResponse.json({ ok: true })
}
