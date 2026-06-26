import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

interface PromptType {
  id: string
  key: string
  name: string
  description: string | null
  sort_order: number | null
}

/**
 * Slugify a free-text name into a prompt_types.key:
 * lowercase, non-alphanumerics collapsed to a single underscore,
 * leading/trailing underscores trimmed. Mirrors the sage_parameters
 * key convention.
 */
function slugifyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-types] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_types')
    .select('id, key, name, description, sort_order')
    .eq('tenant_id', authCtx.tenant_id)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    console.error('[prompt-types] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const promptTypes: PromptType[] = data ?? []
  console.log('[prompt-types] GET', { tenant_id: authCtx.tenant_id, count: promptTypes.length })

  return Response.json(promptTypes)
}

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-types] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return Response.json({ error: 'Missing or invalid name' }, { status: 400 })
  }

  const name = body.name.trim()
  const key = slugifyKey(name)
  if (key.length === 0) {
    return Response.json({ error: 'Name must contain at least one alphanumeric character' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('prompt_types')
    .insert({
      tenant_id: authCtx.tenant_id,
      key,
      name,
      created_at: now,
      updated_at: now,
    })
    .select('id, key, name, description, sort_order')
    .single()

  if (error) {
    // 23505 = unique_violation on (tenant_id, key)
    if (error.code === '23505') {
      return Response.json({ error: 'A prompt type with that name already exists' }, { status: 409 })
    }
    console.error('[prompt-types] insert failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const promptType: PromptType = data
  console.log('[prompt-types] POST', { tenant_id: authCtx.tenant_id, key: promptType.key })

  return Response.json(promptType, { status: 201 })
}
