import { getAuthContext, getCurrentUser } from '@/services/auth'
import { createBlock } from '@/services/prompt/blocks'
import { resolveTenantForPromptSet } from '@/services/prompt'
import { logEvent, AuditAction } from '@/services/audit'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[blocks/save] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    type?: string | null
    topic_id?: string | null
    title?: string | null
    body: string
    source_id?: string | null
    is_default?: boolean
    prompt_set_id?: string | null
    conversation_id?: string | null
    messages?: { role: string; content: string }[]
  }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { body: blockBody } = body

  // Body is the only required field. Title / Type / Topic are optional —
  // omitted ones are stored null on the block (the user can fill them in
  // later via edit).
  if (!blockBody) {
    return Response.json({ error: 'Body is required' }, { status: 400 })
  }

  const user = await getCurrentUser()
  const tenantResult = await resolveTenantForPromptSet(body.prompt_set_id ?? null, authCtx, user?.isPlatformAdmin === true)
  if (!tenantResult.ok) {
    return Response.json({ error: tenantResult.error }, { status: tenantResult.status })
  }
  const scope = { owner_id: authCtx.owner_id, tenant_id: tenantResult.tenantId }

  const result = await createBlock(scope, body)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  const created = result.data as { id?: string; title?: string; type?: string }
  void logEvent({
    action: AuditAction.BLOCK_CREATE,
    tenant_id: scope.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'block',
    target_id: created.id ?? null,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { title: created.title, type: created.type },
  })

  return Response.json(result.data)
}
