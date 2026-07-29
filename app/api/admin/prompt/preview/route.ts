import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, getCurrentUser } from '@/services/auth'
import { buildCompiledContent, resolveTenantForPromptSet } from '@/services/prompt'

export async function POST(req: NextRequest) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt/preview] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const promptSetId: string | null =
    typeof body.prompt_set_id === 'string' && body.prompt_set_id.length > 0
      ? body.prompt_set_id
      : null

  const user = await getCurrentUser()
  const tenantResult = await resolveTenantForPromptSet(promptSetId, authCtx, user?.isPlatformAdmin === true)
  if (!tenantResult.ok) {
    return NextResponse.json({ error: tenantResult.error }, { status: tenantResult.status })
  }

  const result = await buildCompiledContent(tenantResult.tenantId, promptSetId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ content: result.content, tokenCount: result.tokenCount })
}
