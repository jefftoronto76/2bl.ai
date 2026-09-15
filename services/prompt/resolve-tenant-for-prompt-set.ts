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
// the set's own tenant_id (SBL) rather than the caller's session tenant --
// regardless of whether the caller's OWN tenant happens to be SBL too. The
// gate is "is this the Composer tool," not "is this a foreign tenant."
//
// For an ordinary (non-composer) set, the relevant question IS tenant
// ownership: same-tenant requests need no override (authCtx.tenant_id already
// matches), and a genuinely cross-tenant request -- the requested set is
// real, but belongs to some OTHER tenant than the caller's session -- is
// allowed only for a platform admin, who resolves to the set's real tenant
// exactly as the composer case already does.
//
// A lookup miss or a query error is reported explicitly (404 / 500) rather
// than silently falling through to authCtx.tenant_id: that used to read as
// "not this function's job to 404 -- let the caller's tenant-scoped query
// fail naturally," but callers don't actually fail naturally on it. A
// cross-tenant, non-composer requestedSetId used to take that same silent
// fallthrough (is_composer_prompt !== true short-circuited before the tenant
// was ever compared), so the caller went on to query THEIR OWN tenant for an
// id that only exists in someone else's -- a real, existing prompt set that
// every downstream query then genuinely cannot find, for a reason none of
// them can see or report (see app/admin/prompt-studio/blocks/page.tsx's
// resolveActiveSet fallback, which used to mask exactly this by silently
// substituting the caller's own Live set).

export type ResolveTenantForPromptSetResult =
  | { ok: true; tenantId: string }
  | { ok: false; status: 403 | 404 | 500; error: string }

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

  if (error) {
    return { ok: false, status: 500, error: 'Could not verify the prompt set.' }
  }
  if (!data) {
    return { ok: false, status: 404, error: 'Prompt set not found.' }
  }

  if (data.is_composer_prompt === true) {
    if (!isPlatformAdmin) {
      return { ok: false, status: 403, error: 'Only platform admins can access the Composer prompt.' }
    }
    return { ok: true, tenantId: data.tenant_id as string }
  }

  // Ordinary tenant-family set, same tenant as the caller -- no override needed.
  if (data.tenant_id === authCtx.tenant_id) {
    return { ok: true, tenantId: authCtx.tenant_id }
  }

  // Ordinary tenant-family set, but genuinely owned by a different tenant --
  // only a platform admin may resolve to it.
  if (!isPlatformAdmin) {
    return { ok: false, status: 403, error: 'You do not have access to this prompt set.' }
  }

  return { ok: true, tenantId: data.tenant_id as string }
}
