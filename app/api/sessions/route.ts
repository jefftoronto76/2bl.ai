import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'
import { createSession } from '@/services/crm/sessions'

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

  const result = await createSession(tenantId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ id: result.data.id })
}
