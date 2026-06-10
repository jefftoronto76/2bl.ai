import { getAdminClient } from './supabase-admin'

/**
 * Looks up a Supabase users row by Clerk user ID.
 * Returns { id } when found, null when no row exists or on error.
 * Uses the service-role client — server-only.
 */
export async function findUserByClerkId(clerkId: string): Promise<{ id: string } | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', clerkId)
    .maybeSingle()

  if (error) {
    console.error('[find-user-by-clerk-id] query failed:', error.message)
    return null
  }
  return data ? { id: data.id as string } : null
}
