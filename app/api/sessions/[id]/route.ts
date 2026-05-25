import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

// Anonymous visitor write path — the one justified server-role use. The tenant
// is always derived from the Host header server-side and never trusted from the
// client, and every write is scoped by both id AND tenant_id so a visitor on
// tenant A can never touch tenant B's session (cross-tenant IDOR). This client
// is server-only. (Phase 3 centralizes this in services/auth per MIGRATION.md.)
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('[sessions/[id]/route] env check — url present:', !!url, '| service key present:', !!key)
  return createClient(url!, key!)
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

  const { messages, visitorName } = await req.json()
  console.log('[sessions/[id]/route] message count:', messages?.length, '| visitorName:', visitorName)

  const supabase = getAdminClient()

  // Only write visitor_name when the client sends a non-empty string. The
  // server-side name extractor in /api/sage may have already populated it
  // from Sage's response, and client PATCHes still send `visitorName: null`
  // until front-end name capture lands — so unconditionally writing would
  // clobber the server's value.
  const trimmedName = typeof visitorName === 'string' ? visitorName.trim() : ''
  const baseUpdate = {
    messages,
    updated_at: new Date().toISOString(),
    status: 'in_progress' as const,
  }
  const update = trimmedName.length > 0
    ? { ...baseUpdate, visitor_name: trimmedName }
    : baseUpdate

  // Scope the write by BOTH id and the host-derived tenant_id. A session that
  // belongs to another tenant simply matches no row — returned as 404 so the
  // endpoint cannot be used to probe or mutate other tenants' sessions.
  const { data, error } = await supabase
    .from('chat_sessions')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')

  if (error) {
    console.error('[sessions/[id]/route] update error:', JSON.stringify(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    console.warn('[sessions/[id]/route] no session matched id + tenant:', { id, tenant_id: tenantId })
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  console.log('[sessions/[id]/route] updated session:', id, '| tenant_id:', tenantId)
  return NextResponse.json({ ok: true })
}
