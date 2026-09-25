// services/auth/get-tenant-name.ts
//
// Resolves the active tenant's display name for the admin banner. Uses the
// same host-aware tenant resolution as the rest of the admin (getAuthContext —
// which picks the tenant by request Host for multi-tenant users), then reads
// tenants.name. Server-only. Returns null on any failure so the caller can
// fall back; never throws.
//
// Pass `tenantId` when the caller has already resolved getAuthContext() (the
// admin layout does) — the helper then skips its own auth resolution and runs
// only the tenants lookup. Omitted, it self-resolves as before.

import { getAuthContext } from './get-auth-context'
import { getAdminClient } from './supabase-admin'

export async function getTenantName(tenantId?: string): Promise<string | null> {
  try {
    const tenant_id = tenantId ?? (await getAuthContext()).tenant_id

    const { data, error } = await getAdminClient()
      .from('tenants')
      .select('name')
      .eq('id', tenant_id)
      .maybeSingle()

    if (error) {
      console.error('[getTenantName] tenants lookup failed:', error.message)
      return null
    }
    if (!data || typeof data.name !== 'string' || data.name.length === 0) {
      console.warn('[getTenantName] no name for tenant_id:', tenant_id)
      return null
    }

    return data.name
  } catch (err) {
    console.error('[getTenantName] resolution threw:', err instanceof Error ? err.message : err)
    return null
  }
}
