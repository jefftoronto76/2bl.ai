import { clerkAuth as auth } from './providers/clerk/server'
import { getAdminClient } from './supabase-admin'

/**
 * Read-only resolution of the current Clerk user to their Supabase `users.id`.
 *
 * Unlike `getAuthContext`, this does NOT require a `tenant_users` membership —
 * it is for end-customers (e.g. Heirloom visitors) who have a `users` row but
 * are not platform admins. Unlike `syncUser`, it never writes; a signed-in user
 * with no `users` row simply resolves to null (they own no sessions yet).
 *
 * Returns the Supabase user id, or null when there is no Clerk session or no
 * matching `users` row.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', clerkId)
    .maybeSingle()

  if (error || !data) return null
  return data.id as string
}
