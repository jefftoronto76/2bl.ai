import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth'
import { logEvent, AuditAction } from '@/services/audit'

type OpenAs = 'new_tab' | 'popup'

interface SageParameter {
  id: string
  tenant_id: string
  key: string
  value: string
  label: string | null
  description: string | null
  cta_label: string | null
  url: string | null
  open_as: OpenAs
  embed_code: string | null
  updated_at: string
}

const DESCRIPTION_MAX = 60
const CTA_LABEL_MAX = 20
const VALID_OPEN_AS: readonly OpenAs[] = ['new_tab', 'popup']

function isOpenAs(value: unknown): value is OpenAs {
  return typeof value === 'string' && (VALID_OPEN_AS as readonly string[]).includes(value)
}

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[sage-parameters] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('sage_parameters')
    .select('id, tenant_id, key, value, label, description, cta_label, url, open_as, embed_code, updated_at')
    .eq('tenant_id', authCtx.tenant_id)
    .order('key')

  if (error) {
    console.error('[sage-parameters] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const parameters: SageParameter[] = data ?? []
  console.log('[sage-parameters] GET', {
    tenant_id: authCtx.tenant_id,
    count: parameters.length,
  })

  return Response.json(parameters)
}

export async function PATCH(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[sage-parameters] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    key?: unknown
    value?: unknown
    label?: unknown
    description?: unknown
    cta_label?: unknown
    url?: unknown
    open_as?: unknown
    embed_code?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.key !== 'string' || body.key.length === 0) {
    return Response.json({ error: 'Missing or invalid key' }, { status: 400 })
  }
  if (typeof body.label !== 'string') {
    return Response.json({ error: 'Missing or invalid label' }, { status: 400 })
  }
  if (body.value !== undefined && typeof body.value !== 'string') {
    return Response.json({ error: 'Invalid value' }, { status: 400 })
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    return Response.json({ error: 'Invalid description' }, { status: 400 })
  }
  if (body.cta_label !== undefined && typeof body.cta_label !== 'string') {
    return Response.json({ error: 'Invalid cta_label' }, { status: 400 })
  }
  if (body.url !== undefined && typeof body.url !== 'string') {
    return Response.json({ error: 'Invalid url' }, { status: 400 })
  }
  if (body.open_as !== undefined && !isOpenAs(body.open_as)) {
    return Response.json(
      { error: `Invalid open_as (expected one of: ${VALID_OPEN_AS.join(', ')})` },
      { status: 400 },
    )
  }
  if (body.embed_code !== undefined && body.embed_code !== null && typeof body.embed_code !== 'string') {
    return Response.json({ error: 'Invalid embed_code' }, { status: 400 })
  }

  const key: string = body.key
  const label: string = body.label
  const value: string = typeof body.value === 'string' ? body.value : ''
  const description: string = typeof body.description === 'string' ? body.description : ''
  const ctaLabel: string = typeof body.cta_label === 'string' ? body.cta_label : ''
  const url: string = typeof body.url === 'string' ? body.url : ''
  const openAs: OpenAs = isOpenAs(body.open_as) ? body.open_as : 'new_tab'
  const embedCode: string | null =
    typeof body.embed_code === 'string' && body.embed_code.length > 0 ? body.embed_code : null

  if (description.length > DESCRIPTION_MAX) {
    return Response.json(
      { error: `Description must be ${DESCRIPTION_MAX} characters or fewer` },
      { status: 400 },
    )
  }
  if (ctaLabel.length > CTA_LABEL_MAX) {
    return Response.json(
      { error: `CTA label must be ${CTA_LABEL_MAX} characters or fewer` },
      { status: 400 },
    )
  }

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('sage_parameters')
    .upsert(
      {
        tenant_id: authCtx.tenant_id,
        key,
        value,
        label,
        description,
        cta_label: ctaLabel,
        url,
        open_as: openAs,
        embed_code: embedCode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id, key' },
    )
    .select('id, tenant_id, key, value, label, description, cta_label, url, open_as, embed_code, updated_at')
    .single()

  if (error) {
    console.error('[sage-parameters] upsert failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const parameter: SageParameter = data
  console.log('[sage-parameters] PATCH', {
    key,
    open_as: parameter.open_as,
    has_embed_code: Boolean(parameter.embed_code),
  })

  void logEvent({
    action: AuditAction.SAGE_PARAMETER_UPSERT,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'sage_parameter',
    target_id: key,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { open_as: openAs, has_embed_code: Boolean(embedCode) },
  })

  return Response.json(parameter)
}
