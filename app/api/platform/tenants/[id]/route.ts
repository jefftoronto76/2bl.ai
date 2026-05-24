import { currentUser } from '@clerk/nextjs/server'
import { getAdminClient } from '@/lib/supabase-admin'

// PATCH/DELETE for a single tenant. Same gate as POST /api/platform/tenants —
// platform_admin only, re-checked here so these privileged service-role writes
// can never run for a non-admin.

const VALID_TYPES = ['platform', 'product', 'business', 'reseller', 'member'] as const
type TenantType = (typeof VALID_TYPES)[number]

function isTenantType(value: unknown): value is TenantType {
  return typeof value === 'string' && (VALID_TYPES as readonly string[]).includes(value)
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface RouteContext {
  params: Promise<{ id: string }>
}

// Returns a denial Response when the caller is not a platform admin, else null.
async function denyUnlessPlatformAdmin(): Promise<Response | null> {
  const user = await currentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (user.publicMetadata as Record<string, unknown>)?.role
  if (role !== 'platform_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function PATCH(req: Request, context: RouteContext) {
  const denied = await denyUnlessPlatformAdmin()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return Response.json({ error: 'Missing tenant id' }, { status: 400 })
  }

  let body: {
    name?: unknown
    type?: unknown
    parent_id?: unknown
    slug?: unknown
    domain?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length === 0) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  if (!isTenantType(body.type)) {
    return Response.json(
      { error: `Invalid type (expected one of: ${VALID_TYPES.join(', ')})` },
      { status: 400 },
    )
  }
  const type: TenantType = body.type

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (slug.length === 0) {
    return Response.json({ error: 'Slug is required' }, { status: 400 })
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json(
      { error: 'Slug may contain only lowercase letters, numbers, and single hyphens' },
      { status: 400 },
    )
  }

  const parentId =
    typeof body.parent_id === 'string' && body.parent_id.length > 0 ? body.parent_id : null
  if (parentId === id) {
    return Response.json({ error: 'A tenant cannot be its own parent' }, { status: 400 })
  }

  const domainRaw = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : ''
  const domain = domainRaw.length > 0 ? domainRaw : null

  const supabase = getAdminClient()

  const { data: existing, error: existingError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existingError) {
    console.error('[platform/tenants/:id] existence check failed:', existingError.message)
    return Response.json({ error: existingError.message }, { status: 500 })
  }
  if (!existing) {
    return Response.json({ error: 'Tenant not found' }, { status: 404 })
  }

  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', parentId)
      .maybeSingle()
    if (parentError) {
      console.error('[platform/tenants/:id] parent lookup failed:', parentError.message)
      return Response.json({ error: parentError.message }, { status: 500 })
    }
    if (!parent) {
      return Response.json({ error: 'Parent tenant not found' }, { status: 400 })
    }
  }

  // Uniqueness excluding self. The DB constraint (if present) remains the
  // source of truth — the 23505 catch below covers the race.
  const { data: slugClash, error: slugError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .neq('id', id)
    .limit(1)
    .maybeSingle()
  if (slugError) {
    console.error('[platform/tenants/:id] slug check failed:', slugError.message)
    return Response.json({ error: slugError.message }, { status: 500 })
  }
  if (slugClash) {
    return Response.json({ error: 'Slug is already in use' }, { status: 409 })
  }

  if (domain) {
    const { data: domainClash, error: domainError } = await supabase
      .from('tenants')
      .select('id')
      .eq('domain', domain)
      .neq('id', id)
      .limit(1)
      .maybeSingle()
    if (domainError) {
      console.error('[platform/tenants/:id] domain check failed:', domainError.message)
      return Response.json({ error: domainError.message }, { status: 500 })
    }
    if (domainClash) {
      return Response.json({ error: 'Domain is already in use' }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('tenants')
    .update({ name, type, parent_id: parentId, slug, domain })
    .eq('id', id)
    .select('id, parent_id, name, slug, type, domain')
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'Slug or domain is already in use' }, { status: 409 })
    }
    console.error('[platform/tenants/:id] update failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  console.log('[platform/tenants/:id] updated', { id: data.id, slug: data.slug, type: data.type })
  return Response.json(data)
}

export async function DELETE(_req: Request, context: RouteContext) {
  const denied = await denyUnlessPlatformAdmin()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return Response.json({ error: 'Missing tenant id' }, { status: 400 })
  }

  const supabase = getAdminClient()

  const { data: existing, error: existingError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existingError) {
    console.error('[platform/tenants/:id] existence check failed:', existingError.message)
    return Response.json({ error: existingError.message }, { status: 500 })
  }
  if (!existing) {
    return Response.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // Block deletion of a tenant that still has sub-tenants — deleting it would
  // orphan them (or hit a foreign-key error). The admin must reassign or remove
  // the children first.
  const { data: children, error: childrenError } = await supabase
    .from('tenants')
    .select('id')
    .eq('parent_id', id)
    .limit(1)
  if (childrenError) {
    console.error('[platform/tenants/:id] children check failed:', childrenError.message)
    return Response.json({ error: childrenError.message }, { status: 500 })
  }
  if (children && children.length > 0) {
    return Response.json(
      { error: 'This tenant has sub-tenants. Reassign or delete them first.' },
      { status: 409 },
    )
  }

  const { error } = await supabase.from('tenants').delete().eq('id', id)

  if (error) {
    // 23503 = foreign_key_violation: dependent rows in other tables still
    // reference this tenant (chat_sessions, blocks, etc.).
    if (error.code === '23503') {
      return Response.json(
        { error: 'This tenant has dependent records and cannot be deleted.' },
        { status: 409 },
      )
    }
    console.error('[platform/tenants/:id] delete failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  console.log('[platform/tenants/:id] deleted', { id })
  return Response.json({ success: true })
}
