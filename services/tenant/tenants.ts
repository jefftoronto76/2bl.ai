// services/tenant/tenants.ts
//
// Tenant CRUD data-access + validation for the platform-admin surface. All
// Supabase reads/writes against the `tenants` table for create/update/delete
// live here; the app/api/platform/tenants/* route handlers are thin consumers
// that own the platform_admin auth gate, JSON parsing, the `id` path param,
// and HTTP response mapping only. Behavior is identical to the prior inline
// route logic — same queries, same validation, same status codes, same log
// strings.

import { getAdminClient } from '@/services/auth/supabase-admin'

const VALID_TYPES = ['platform', 'product', 'business', 'reseller', 'member'] as const
type TenantType = (typeof VALID_TYPES)[number]

function isTenantType(value: unknown): value is TenantType {
  return typeof value === 'string' && (VALID_TYPES as readonly string[]).includes(value)
}

// Lowercase letters/digits in hyphen-separated groups — no leading/trailing or
// doubled hyphens. The client slugifies before sending; this is the server guard.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// The row shape returned to the client (and by the route) — unchanged.
export interface TenantRow {
  id: string
  parent_id: string | null
  name: string
  slug: string
  type: string
  domain: string | null
}

export interface TenantInput {
  name?: unknown
  type?: unknown
  parent_id?: unknown
  slug?: unknown
  domain?: unknown
}

// Success carries the HTTP status (201 for create, 200 otherwise) and the
// payload to return; failure carries the status + message the route surfaces,
// preserving the routes' exact responses.
export type TenantResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }

interface NormalizedFields {
  name: string
  type: TenantType
  parentId: string | null
  slug: string
  domain: string | null
}

// Shared validation for create + update. `selfId` is the tenant's own id on
// update, used for the self-parent guard (null on create).
function validateInput(
  body: TenantInput,
  selfId: string | null,
): { ok: true; fields: NormalizedFields } | { ok: false; status: number; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length === 0) {
    return { ok: false, status: 400, error: 'Name is required' }
  }

  if (!isTenantType(body.type)) {
    return {
      ok: false,
      status: 400,
      error: `Invalid type (expected one of: ${VALID_TYPES.join(', ')})`,
    }
  }
  const type: TenantType = body.type

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (slug.length === 0) {
    return { ok: false, status: 400, error: 'Slug is required' }
  }
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      status: 400,
      error: 'Slug may contain only lowercase letters, numbers, and single hyphens',
    }
  }

  const parentId =
    typeof body.parent_id === 'string' && body.parent_id.length > 0 ? body.parent_id : null
  if (selfId !== null && parentId === selfId) {
    return { ok: false, status: 400, error: 'A tenant cannot be its own parent' }
  }

  const domainRaw = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : ''
  const domain = domainRaw.length > 0 ? domainRaw : null

  return { ok: true, fields: { name, type, parentId, slug, domain } }
}

// Confirms a provided parent id exists. Returns null on success, else a denial.
async function validateParent(
  supabase: ReturnType<typeof getAdminClient>,
  parentId: string,
  logTag: string,
): Promise<{ status: number; error: string } | null> {
  const { data: parent, error: parentError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', parentId)
    .maybeSingle()
  if (parentError) {
    console.error(`${logTag} parent lookup failed:`, parentError.message)
    return { status: 500, error: parentError.message }
  }
  if (!parent) {
    return { status: 400, error: 'Parent tenant not found' }
  }
  return null
}

/** POST /api/platform/tenants — create a tenant. */
export async function createTenant(body: TenantInput): Promise<TenantResult<TenantRow>> {
  const validated = validateInput(body, null)
  if (!validated.ok) return validated
  const { name, type, parentId, slug, domain } = validated.fields

  const supabase = getAdminClient()
  const logTag = '[platform/tenants]'

  // Validate the parent exists when provided, so a bad id returns a clear 400
  // rather than an opaque foreign-key error from the INSERT.
  if (parentId) {
    const denied = await validateParent(supabase, parentId, logTag)
    if (denied) return { ok: false, ...denied }
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
    console.error(`${logTag} slug check failed:`, slugError.message)
    return { ok: false, status: 500, error: slugError.message }
  }
  if (slugClash) {
    return { ok: false, status: 409, error: 'Slug is already in use' }
  }

  if (domain) {
    const { data: domainClash, error: domainError } = await supabase
      .from('tenants')
      .select('id')
      .eq('domain', domain)
      .limit(1)
      .maybeSingle()
    if (domainError) {
      console.error(`${logTag} domain check failed:`, domainError.message)
      return { ok: false, status: 500, error: domainError.message }
    }
    if (domainClash) {
      return { ok: false, status: 409, error: 'Domain is already in use' }
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
      return { ok: false, status: 409, error: 'Slug or domain is already in use' }
    }
    console.error(`${logTag} insert failed:`, error.message)
    return { ok: false, status: 500, error: error.message }
  }

  console.log(`${logTag} created`, { id: data.id, slug: data.slug, type: data.type })
  return { ok: true, status: 201, data: data as TenantRow }
}

/** PATCH /api/platform/tenants/[id] — update a tenant. */
export async function updateTenant(
  id: string,
  body: TenantInput,
): Promise<TenantResult<TenantRow>> {
  const validated = validateInput(body, id)
  if (!validated.ok) return validated
  const { name, type, parentId, slug, domain } = validated.fields

  const supabase = getAdminClient()
  const logTag = '[platform/tenants/:id]'

  const { data: existing, error: existingError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existingError) {
    console.error(`${logTag} existence check failed:`, existingError.message)
    return { ok: false, status: 500, error: existingError.message }
  }
  if (!existing) {
    return { ok: false, status: 404, error: 'Tenant not found' }
  }

  if (parentId) {
    const denied = await validateParent(supabase, parentId, logTag)
    if (denied) return { ok: false, ...denied }
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
    console.error(`${logTag} slug check failed:`, slugError.message)
    return { ok: false, status: 500, error: slugError.message }
  }
  if (slugClash) {
    return { ok: false, status: 409, error: 'Slug is already in use' }
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
      console.error(`${logTag} domain check failed:`, domainError.message)
      return { ok: false, status: 500, error: domainError.message }
    }
    if (domainClash) {
      return { ok: false, status: 409, error: 'Domain is already in use' }
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
      return { ok: false, status: 409, error: 'Slug or domain is already in use' }
    }
    console.error(`${logTag} update failed:`, error.message)
    return { ok: false, status: 500, error: error.message }
  }

  console.log(`${logTag} updated`, { id: data.id, slug: data.slug, type: data.type })
  return { ok: true, status: 200, data: data as TenantRow }
}

/** DELETE /api/platform/tenants/[id] — delete a tenant (guarded). */
export async function deleteTenant(id: string): Promise<TenantResult<{ success: true }>> {
  const supabase = getAdminClient()
  const logTag = '[platform/tenants/:id]'

  const { data: existing, error: existingError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existingError) {
    console.error(`${logTag} existence check failed:`, existingError.message)
    return { ok: false, status: 500, error: existingError.message }
  }
  if (!existing) {
    return { ok: false, status: 404, error: 'Tenant not found' }
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
    console.error(`${logTag} children check failed:`, childrenError.message)
    return { ok: false, status: 500, error: childrenError.message }
  }
  if (children && children.length > 0) {
    return {
      ok: false,
      status: 409,
      error: 'This tenant has sub-tenants. Reassign or delete them first.',
    }
  }

  const { error } = await supabase.from('tenants').delete().eq('id', id)

  if (error) {
    // 23503 = foreign_key_violation: dependent rows in other tables still
    // reference this tenant (chat_sessions, blocks, etc.).
    if (error.code === '23503') {
      return {
        ok: false,
        status: 409,
        error: 'This tenant has dependent records and cannot be deleted.',
      }
    }
    console.error(`${logTag} delete failed:`, error.message)
    return { ok: false, status: 500, error: error.message }
  }

  console.log(`${logTag} deleted`, { id })
  return { ok: true, status: 200, data: { success: true } }
}
