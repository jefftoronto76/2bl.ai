import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

export async function GET(req: NextRequest) {
  let tenantId: string
  try {
    const authCtx = await getAuthContext()
    tenantId = authCtx.tenant_id
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100)

  const supabase = getAdminClient()

  let query = supabase
    .from('members')
    .select('id, user_id, name, email, phone, invited_name')
    .eq('tenant_id', tenantId)
    .not('user_id', 'is', null)
    .eq('status', 'active')
    .limit(200)

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,id.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[admin/members/search] query error:', error.message)
    return NextResponse.json([])
  }

  const results = data ?? []
  console.log(`[admin/members/search] q="${q}" results=${results.length} tenant=${tenantId}`)
  return NextResponse.json(results)
}
