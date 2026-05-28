import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'
import { updateSession } from '@/services/crm/sessions'

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

  const { messages, visitorName, phone } = await req.json()
  console.log('[sessions/[id]/route] message count:', messages?.length, '| visitorName:', visitorName, '| has_phone:', !!phone)

  const result = await updateSession(tenantId, id, { messages, visitorName, phone })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
