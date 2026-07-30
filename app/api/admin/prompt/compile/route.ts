import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, getCurrentUser } from '@/services/auth'
import { compilePrompt, resolveTenantForPromptSet } from '@/services/prompt'
import { parseNote } from '@/services/prompt/release-note'
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

  // Optimistic concurrency (July 2026): the version the caller's UI displayed
  // when the Compile & Publish modal opened. Absent/invalid means "skip the
  // guard" — the RPC treats null the same way.
  const expectedVersion: number | null =
    typeof body.expected_version === 'number' && Number.isInteger(body.expected_version)
      ? body.expected_version
      : null

  // Release note (July 2026): required on every publish. Validation mirrors
  // the client exactly — parseNote is the single shared implementation.
  const note = parseNote(body.note)
  if (!note) {
    return NextResponse.json({ error: 'A release summary is required.' }, { status: 400 })
  }

  // A composer-family target overrides tenantId to its own (SBL) tenant and
  // requires isPlatformAdmin — see resolveTenantForPromptSet. Ordinary sets
  // are unaffected; tenantId stays authCtx.tenant_id.
  const user = await getCurrentUser()
  const tenantResult = await resolveTenantForPromptSet(promptSetId, authCtx, user?.isPlatformAdmin === true)
  if (!tenantResult.ok) {
    return NextResponse.json({ error: tenantResult.error }, { status: tenantResult.status })
  }
  const tenantId = tenantResult.tenantId

  const result = await compilePrompt(tenantId, promptSetId, note, expectedVersion)
  if (!result.ok) {
    void logEvent({
      action: AuditAction.PROMPT_COMPILE,
      tenant_id: tenantId,
      actor_id: authCtx.owner_id,
      target_type: 'compiled_prompt',
      target_id: tenantId,
      outcome: 'failure',
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: result.error },
    })
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.PROMPT_COMPILE,
    tenant_id: tenantId,
    actor_id: authCtx.owner_id,
    target_type: 'compiled_prompt',
    target_id: tenantId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { version: result.data.version, token_count: result.data.tokenCount, summary: note.summary },
  })

  return NextResponse.json(result.data)
}
