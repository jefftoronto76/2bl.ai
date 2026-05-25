import { currentUser } from '@clerk/nextjs/server'
import { getAdminClient } from './supabase-admin'

/**
 * Ensures the current Clerk user has a corresponding row in the Supabase
 * `users` table.  Upserts on email conflict, updating clerk_id and name
 * if they've changed.  Safe to call on every admin page load.
 *
 * Returns the Supabase UUID for the user, or null if no Clerk session.
 */
export async function syncUser(): Promise<string | null> {
  const clerk = await currentUser()
  if (!clerk) return null

  const email = clerk.emailAddresses[0]?.emailAddress
  if (!email) return null

  const name = [clerk.firstName, clerk.lastName].filter(Boolean).join(' ')
  const clerkId = clerk.id

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('users')
    .upsert(
      { email, name, clerk_id: clerkId },
      { onConflict: 'clerk_id' }
    )
    .select('id')
    .single()

  if (error) {
    console.error('[sync-user] upsert failed:', error.message)
    return null
  }

  return data.id
}
