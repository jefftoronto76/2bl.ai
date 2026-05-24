import { currentUser } from '@clerk/nextjs/server'
import { getAdminClient } from '@/lib/supabase-admin'

// Tenant creation is a privileged, cross-tenant write. Gate it on the same
// signal the (platform) layout/page use — Clerk publicMetadata.role —
// re-checked here so the service-role INSERT can never run for a non-admin,
// independent of any client-side routing.

const VALID_TYPES = ['platform', 'product', 'business', 'reseller', 'member'] as const
type TenantType = (typeof VALID_TYPES)[number]

function isTenantType(value: unknown): value is TenantType {
  return typeof value === 'string' && (VALID_TYPES as readonly string[]).includes(value)
}

// Lowercase letters/digits in hyphen-separated groups — no leading/trailing or
// doubled hyphens. The client slugifies before sending; this is the server guard.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (user.publicMetadata as Record<string, unknown>)?.role
  if (role !== 'platform_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
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

  const domainRaw = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : ''
  const domain = domainRaw.length > 0 ? domainRaw : null

  const supabase = getAdminClient()

  // Validate the parent exists when provided, so a bad id returns a clear 400
  // rather than an opaque foreign-key error from the INSERT.
  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', parentId)
      .maybeSingle()
    if (parentError) {
      console.error('[platform/tenants] parent lookup failed:', parentError.message)
      return Response.json({ error: parentError.message }, { status: 500 })
    }
    if (!parent) {
      return Response.json({ error: 'Parent tenant not found' }, { status: 400 })
    }
  }

  // Uniqueness pre-checks for friendly errors. The DB constraint (if present)
  // remains the source of truth — the 23505 catch below covers the race.
  const { data: slugClash, error: slugError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()
  if (slugError) {
    console.error('[platform/tenants] slug check failed:', slugError.message)
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
      .limit(1)
      .maybeSingle()
    if (domainError) {
      console.error('[platform/tenants] domain check failed:', domainError.message)
      return Response.json({ error: domainError.message }, { status: 500 })
    }
    if (domainClash) {
      return Response.json({ error: 'Domain is already in use' }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('tenants')
    .insert({ name, type, parent_id: parentId, slug, domain })
    .select('id, parent_id, name, slug, type, domain')
    .single()

  if (error) {
    // 23505 = unique_violation: a slug/domain race that beat the pre-check.
    if (error.code === '23505') {
      return Response.json({ error: 'Slug or domain is already in use' }, { status: 409 })
    }
    console.error('[platform/tenants] insert failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  console.log('[platform/tenants] created', { id: data.id, slug: data.slug, type: data.type })
  return Response.json(data, { status: 201 })
}
