import { auth } from '@clerk/nextjs/server'
import { findUserByClerkId } from './findUserByClerkId'

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

  const found = await findUserByClerkId(clerkId)
  return found?.user?.id ?? null
}
