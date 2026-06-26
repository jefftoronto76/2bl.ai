import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/services/auth'
import { compilePrompt } from '@/services/prompt/compile'
import { logEvent, AuditAction } from '@/services/audit'

export async function POST(req: NextRequest) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt/compile] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const promptSetId: string | null =
    typeof body.prompt_set_id === 'string' && body.prompt_set_id.length > 0
      ? body.prompt_set_id
      : null

  const result = await compilePrompt(authCtx.tenant_id, promptSetId)
  if (!result.ok) {
    void logEvent({
      action: AuditAction.PROMPT_COMPILE,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      target_type: 'master_prompt',
      target_id: authCtx.tenant_id,
      outcome: 'failure',
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: result.error },
    })
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.PROMPT_COMPILE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'master_prompt',
    target_id: authCtx.tenant_id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { version: result.data.version, token_count: result.data.tokenCount },
  })

  return NextResponse.json(result.data)
}
