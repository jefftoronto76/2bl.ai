import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { updateSession } from '@/services/crm/sessions'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return NextResponse.json({ visitor_name: null })
  }

  try {
    const supabase = getAdminClient()
    const { data } = await supabase
      .from('chat_sessions')
      .select('visitor_name')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    return NextResponse.json({ visitor_name: data?.visitor_name ?? null })
  } catch {
    return NextResponse.json({ visitor_name: null })
  }
}

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

  const { messages, visitorName, phone, email } = await req.json()
  console.log('[sessions/[id]/route] message count:', messages?.length, '| visitorName:', visitorName, '| has_phone:', !!phone, '| has_email:', !!email)

  const result = await updateSession(tenantId, id, { messages, visitorName, phone, email })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
