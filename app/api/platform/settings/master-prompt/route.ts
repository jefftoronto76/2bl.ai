import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'

// Platform composer-prompt pointer: which prompt set carries is_composer_prompt=true
// (the single composer prompt across all tenants). Platform-admin only
// (defense-in-depth). The partial unique index prompt_sets_single_composer_idx
// enforces at most one such row.

async function requirePlatformAdmin() {
  const user = await getCurrentUser()
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!user.isPlatformAdmin) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function GET() {
  const gate = await requirePlatformAdmin()
  if (gate.error) return gate.error

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_sets')
    .select('id')
    .eq('is_composer_prompt', true)
    .maybeSingle()

  if (error) {
    console.error('[platform/master-prompt] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ promptSetId: data?.id ?? null })
}

export async function PUT(req: Request) {
  const gate = await requirePlatformAdmin()
  if (gate.error) return gate.error

  let body: { promptSetId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const promptSetId = body.promptSetId ?? null
  if (promptSetId !== null && (typeof promptSetId !== 'string' || promptSetId.length === 0)) {
    return Response.json({ error: 'Missing or invalid promptSetId' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Revert to fallback: promptSetId === null clears whichever row is currently the
  // composer prompt, without requiring a replacement to be picked first.
  if (promptSetId === null) {
    const { error: clearErr } = await supabase
      .from('prompt_sets')
      .update({ is_composer_prompt: false })
      .eq('is_composer_prompt', true)

    if (clearErr) {
      console.error('[platform/master-prompt] revert to fallback failed:', clearErr.message)
      return Response.json({ error: clearErr.message }, { status: 500 })
    }

    console.log('[platform/master-prompt] PUT revert to fallback')
    void logEvent({
      action: AuditAction.PROMPT_SET_MASTER_SET,
      tenant_id: await getTenantFromRequest(req),
      actor_id: null,
      actor_type: 'user',
      clerk_user_id: gate.user.providerUserId,
      target_type: 'prompt_set',
      target_id: null,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { is_composer_prompt: false },
    })

    return Response.json({ promptSetId: null })
  }

  // The target must exist before we flip the master pointer.
  const { data: target, error: targetErr } = await supabase
    .from('prompt_sets')
    .select('id, tenant_id')
    .eq('id', promptSetId)
    .maybeSingle()

  if (targetErr) {
    console.error('[platform/master-prompt] target lookup failed:', targetErr.message)
    return Response.json({ error: targetErr.message }, { status: 500 })
  }
  if (!target) {
    return Response.json({ error: 'Prompt set not found' }, { status: 404 })
  }

  // Clear any other composer prompt FIRST so the single-composer partial unique index
  // never sees two true rows, then set the target. (REST has no true transaction here;
  // the index is the backstop and this ordering avoids a conflict.)
  const { error: clearErr } = await supabase
    .from('prompt_sets')
    .update({ is_composer_prompt: false })
    .eq('is_composer_prompt', true)
    .neq('id', promptSetId)

  if (clearErr) {
    console.error('[platform/master-prompt] clear previous master failed:', clearErr.message)
    return Response.json({ error: clearErr.message }, { status: 500 })
  }

  const { error: setErr } = await supabase
    .from('prompt_sets')
    .update({ is_composer_prompt: true })
    .eq('id', promptSetId)

  if (setErr) {
    console.error('[platform/master-prompt] set master failed:', setErr.message)
    return Response.json({ error: setErr.message }, { status: 500 })
  }

  console.log('[platform/master-prompt] PUT', { promptSetId })
  void logEvent({
    action: AuditAction.PROMPT_SET_MASTER_SET,
    tenant_id: (target.tenant_id as string | null) ?? (await getTenantFromRequest(req)),
    actor_id: null,
    actor_type: 'user',
    clerk_user_id: gate.user.providerUserId,
    target_type: 'prompt_set',
    target_id: promptSetId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { is_composer_prompt: true },
  })

  return Response.json({ promptSetId })
}
