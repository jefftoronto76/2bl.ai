import { NextResponse } from 'next/server'
import { getAuthContext } from '@/services/auth/get-auth-context'
import { compilePrompt } from '@/services/prompt/compile'

export async function POST() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt/compile] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await compilePrompt(authCtx.tenant_id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data)
}
