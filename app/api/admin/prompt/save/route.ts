import { getAuthContext } from '@/services/auth'
import { saveMasterPrompt } from '@/services/prompt/save'
import { NextRequest, NextResponse } from 'next/server'
import { logEvent, AuditAction } from '@/services/audit'

export async function POST(req: NextRequest) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt/save] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { prompt, checkResult } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt cannot be empty' }, { status: 400 })
  }

  const result = await saveMasterPrompt(authCtx.tenant_id, prompt, checkResult)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.PROMPT_SAVE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'master_prompt',
    target_id: authCtx.tenant_id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { version: result.version },
  })

  return NextResponse.json({ version: result.version })
}
