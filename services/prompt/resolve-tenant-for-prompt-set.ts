import { getAdminClient } from '@/services/auth/supabase-admin'

// Composer-family prompt sets (is_composer_prompt=true) all live under the
// SBL/platform tenant. A platform admin editing one is NOT necessarily
// resolved to that tenant by getAuthContext() -- that resolution is entirely
// host/session-based (which tenant_users row matches the current request
// Host), with no relationship to which prompt_set the admin is actually
// trying to view or edit. A platform admin working from their own tenant's
// admin session (the ordinary case -- e.g. Jeff on jefflougheed.ca) would
// otherwise have every Blocks/compile/block-CRUD call silently scoped to
// the wrong tenant the moment the target is a composer set.
//
// This is the one place that decision gets made, for every route that can
// act on a specific prompt_set (directly, or via a block's own
// prompt_set_id): if the target is composer-family, only a platform admin
// may proceed at all, and the tenant used for every downstream query becomes
// the set's own tenant_id (SBL) rather than the caller's session tenant.
// Ordinary tenant-family sets are entirely unaffected -- this returns
// authCtx.tenant_id unchanged, for admin and non-admin callers alike.

export type ResolveTenantForPromptSetResult =
  | { ok: true; tenantId: string }
  | { ok: false; status: 403; error: string }

export async function resolveTenantForPromptSet(
  requestedSetId: string | null | undefined,
  authCtx: { tenant_id: string },
  isPlatformAdmin: boolean,
): Promise<ResolveTenantForPromptSetResult> {
  if (!requestedSetId) {
    return { ok: true, tenantId: authCtx.tenant_id }
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_sets')
    .select('tenant_id, is_composer_prompt')
    .eq('id', requestedSetId)
    .maybeSingle()

  // Lookup miss or error: not this function's job to 404 -- fall through
  // unchanged and let the caller's own (tenant-scoped) query fail naturally.
  if (error || !data || data.is_composer_prompt !== true) {
    return { ok: true, tenantId: authCtx.tenant_id }
  }

  if (!isPlatformAdmin) {
    return { ok: false, status: 403, error: 'Only platform admins can access the Composer prompt.' }
  }

  return { ok: true, tenantId: data.tenant_id as string }
}
