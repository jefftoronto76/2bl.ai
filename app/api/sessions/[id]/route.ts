import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { updateSession, softDeleteSession } from '@/services/crm/sessions'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('[sessions/[id]/route] PATCH called for id:', id)

  // Resolve tenant from the Host header before any write. No client-supplied
  // tenant_id is ever accepted. A request whose host maps to no tenant cannot
  // own a session, so it is rejected outright.
  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/route] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json(
      { error: 'Unable to resolve tenant for this domain' },
      { status: 400 },
    )
  }

  const { messages, visitorName, phone, email, title, starred, ttft_ms, last_error_type, stop_requested } = await req.json()
  console.log('[sessions/[id]/route] message count:', messages?.length, '| has_visitor_name:', !!visitorName, '| has_phone:', !!phone, '| has_email:', !!email, '| title present:', !!title, '| starred:', starred, '| ttft_ms:', ttft_ms, '| last_error_type:', last_error_type, '| stop_requested:', stop_requested)

  const result = await updateSession(tenantId, id, { messages, visitorName, phone, email, title, starred, ttftMs: ttft_ms, lastErrorType: last_error_type, stopRequested: stop_requested })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('[sessions/[id]/route] DELETE called for id:', id)

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/route] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json(
      { error: 'Unable to resolve tenant for this domain' },
      { status: 400 },
    )
  }

  const result = await softDeleteSession(tenantId, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return new NextResponse(null, { status: 204 })
}
