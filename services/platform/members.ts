// services/platform/members.ts
//
// Platform-admin member management: look up a user by email and assign them
// to a tenant. The app/api/platform/members route is the thin consumer —
// it owns auth gates, parsing, and HTTP response mapping; all data-access
// and business logic live here.

import { getAdminClient } from '@/services/auth/supabase-admin'

export interface UserRow {
  id: string
  clerk_id: string
  email: string | null
  name: string | null
}

export type MemberResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }

/**
 * Find a platform user by their email address.
 * Returns { data: null } (not an error) when no match exists.
 */
export async function findUserByEmail(email: string): Promise<MemberResult<UserRow | null>> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) {
    return { ok: false, status: 400, error: 'Email is required' }
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, clerk_id, email, name')
    .eq('email', normalized)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[platform/members] user lookup failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  console.log('[platform/members] email search', { email: normalized, found: !!data })
  return { ok: true, status: 200, data: data as UserRow | null }
}

/**
 * Add a user to a tenant as an admin (tenant_users row, role='admin').
 * Idempotent — if the row already exists, returns ok without error.
 */
export async function addTenantMembership(
  userId: string,
  tenantId: string,
): Promise<MemberResult<{ success: true }>> {
  const supabase = getAdminClient()
  const logTag = '[platform/members]'

  // Verify user exists
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (userError) {
    console.error(`${logTag} user existence check failed:`, userError.message)
    return { ok: false, status: 500, error: userError.message }
  }
  if (!user) {
    return { ok: false, status: 404, error: 'User not found' }
  }

  // Verify tenant exists
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantError) {
    console.error(`${logTag} tenant existence check failed:`, tenantError.message)
    return { ok: false, status: 500, error: tenantError.message }
  }
  if (!tenant) {
    return { ok: false, status: 404, error: 'Tenant not found' }
  }

  // Idempotent: check whether the membership already exists
  const { data: existing, error: existingError } = await supabase
    .from('tenant_users')
    .select('user_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (existingError) {
    console.error(`${logTag} membership check failed:`, existingError.message)
    return { ok: false, status: 500, error: existingError.message }
  }
  if (existing) {
    console.log(`${logTag} membership already exists`, { userId, tenantId })
    return { ok: true, status: 200, data: { success: true } }
  }

  const { error: insertError } = await supabase
    .from('tenant_users')
    .insert({ user_id: userId, tenant_id: tenantId, role: 'admin' })

  if (insertError) {
    // 23505 = unique_violation: race between our existence check and the insert
    if (insertError.code === '23505') {
      console.log(`${logTag} membership race — already exists`, { userId, tenantId })
      return { ok: true, status: 200, data: { success: true } }
    }
    console.error(`${logTag} insert failed:`, insertError.message)
    return { ok: false, status: 500, error: insertError.message }
  }

  console.log(`${logTag} membership created`, { userId, tenantId, role: 'admin' })
  return { ok: true, status: 200, data: { success: true } }
}
