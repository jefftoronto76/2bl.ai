// services/auth/get-tenant-type.ts
//
// Resolves the active tenant's type for platform-section visibility gating.
// Uses the same host-aware tenant resolution as the rest of the admin
// (getAuthContext — which picks the tenant by request Host for multi-tenant
// users), then reads tenants.type. Server-only. Returns null on any failure
// so the caller can fall back; never throws.

import { getAuthContext } from './get-auth-context'
import { getAdminClient } from './supabase-admin'

export async function getTenantType(): Promise<string | null> {
  try {
    const { tenant_id } = await getAuthContext()

    const { data, error } = await getAdminClient()
      .from('tenants')
      .select('type')
      .eq('id', tenant_id)
      .maybeSingle()

    if (error) {
      console.error('[getTenantType] tenants lookup failed:', error.message)
      return null
    }
    if (!data || typeof data.type !== 'string' || data.type.length === 0) {
      console.warn('[getTenantType] no type for tenant_id:', tenant_id)
      return null
    }

    return data.type
  } catch (err) {
    console.error('[getTenantType] resolution threw:', err instanceof Error ? err.message : err)
    return null
  }
}
