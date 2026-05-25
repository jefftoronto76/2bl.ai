import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('[sessions/route] env check — url present:', !!url, '| service key present:', !!key)
  return createClient(url!, key!)
}

export async function POST(req: Request) {
  console.log('[sessions/route] POST called')

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/route] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json(
      { error: 'Unable to resolve tenant for this domain' },
      { status: 400 },
    )
  }

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      tenant_id: tenantId,
      messages: [],
      status: 'active',
      session_type: 'prospect',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[sessions/route] insert error:', JSON.stringify(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[sessions/route] created session:', data.id, '| tenant_id:', tenantId)
  return NextResponse.json({ id: data.id })
}
