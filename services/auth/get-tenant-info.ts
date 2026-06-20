// services/auth/get-tenant-info.ts
//
// Resolves the active tenant's name and type for the admin shell. Follows the
// same pattern as get-tenant-name.ts: uses getAuthContext() for the
// host-resolved tenant_id, then reads both columns in one query. Server-only.
// Returns null on any failure so callers can fall back; never throws.

import { getAuthContext } from './get-auth-context'
import { getAdminClient } from './supabase-admin'

export interface TenantInfo {
  name: string
  type: string | null
}

export async function getTenantInfo(): Promise<TenantInfo | null> {
  try {
    const { tenant_id } = await getAuthContext()

    const { data, error } = await getAdminClient()
      .from('tenants')
      .select('name, type')
      .eq('id', tenant_id)
      .maybeSingle()

    if (error) {
      console.error('[getTenantInfo] tenants lookup failed:', error.message)
      return null
    }
    if (!data) {
      console.warn('[getTenantInfo] no row for tenant_id:', tenant_id)
      return null
    }

    return {
      name: typeof data.name === 'string' ? data.name : '',
      type: typeof data.type === 'string' ? data.type : null,
    }
  } catch (err) {
    console.error('[getTenantInfo] resolution threw:', err instanceof Error ? err.message : err)
    return null
  }
}
