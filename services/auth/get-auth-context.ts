import { clerkAuth as auth } from './providers/clerk/server'
import { headers } from 'next/headers'
import { getAdminClient } from './supabase-admin'
import { resolveTenantIdFromHost } from './resolve-tenant-from-host'
import { logAuthEvent } from '@/services/audit'
import { AuthEventType } from '@/services/audit/types'

export interface AuthContext {
  owner_id: string
  tenant_id: string
}

/**
 * Resolves the current Clerk user to their Supabase owner_id and the tenant
 * context for this request.
 *
 * A platform admin can belong to many tenants, so a single user may have
 * multiple `tenant_users` rows. When that happens the active tenant is
 * determined by the request Host: jefflougheed.ca → the Jeff tenant,
 * heirloom.jefflougheed.ca → the Heirloom tenant, and so on for any number
 * of tenants. Users with a single membership keep their one tenant unchanged.
 *
 * Throws if the user is not authenticated or has no tenant membership.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const { userId: clerkId } = await auth()
  console.log('[getAuthContext] clerk userId:', clerkId)
  if (!clerkId) {
    const hdrs = await headers()
    void logAuthEvent({
      event_type: AuthEventType.ADMIN_ACCESS_FAILED,
      outcome: 'failure',
      failure_reason: 'no_clerk_session',
      correlation_id: hdrs.get('x-correlation-id'),
    })
    throw new Error('Unauthorized')
  }

  const supabase = getAdminClient()

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', clerkId)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  // Fetch ALL memberships — never .single() here: a platform admin belongs to
  // many tenants, and .single() throwing on >1 row is exactly what took admin
  // down.
  const { data: memberships, error: tenantError } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)

  if (tenantError || !memberships || memberships.length === 0) {
    throw new Error('Tenant not found')
  }

  // Single membership → unchanged behavior (single-tenant users, dev, preview).
  if (memberships.length === 1) {
    return { owner_id: user.id, tenant_id: memberships[0].tenant_id }
  }

  // Multiple memberships → the active tenant is determined by the request host.
  const membershipIds = memberships.map((m) => m.tenant_id)

  const { data: tenants, error: domainError } = await supabase
    .from('tenants')
    .select('id, domain')
    .in('id', membershipIds)

  if (domainError || !tenants) {
    throw new Error('Tenant not found')
  }

  const host = (await headers()).get('host')
  const matched = resolveTenantIdFromHost(
    host,
    tenants.map((t) => ({ tenant_id: t.id, domain: t.domain })),
  )

  if (matched) {
    console.log('[getAuthContext] resolved tenant by host:', host, '→', matched)
    return { owner_id: user.id, tenant_id: matched }
  }

  // Fallback for hosts that match no tenant domain (Vercel preview, localhost):
  // an explicit default when it is one of the user's memberships, else the
  // first membership (sorted for determinism) so admin never hard-fails.
  const fallback = process.env.DEFAULT_ADMIN_TENANT_ID
  if (fallback && membershipIds.includes(fallback)) {
    console.warn('[getAuthContext] host unmatched; using DEFAULT_ADMIN_TENANT_ID:', fallback)
    return { owner_id: user.id, tenant_id: fallback }
  }

  const deterministic = [...membershipIds].sort()[0]
  console.warn('[getAuthContext] host unmatched, no valid DEFAULT_ADMIN_TENANT_ID; using first membership:', deterministic)
  return { owner_id: user.id, tenant_id: deterministic }
}
