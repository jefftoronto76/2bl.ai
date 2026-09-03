import { clerkCurrentUser as currentUser } from './providers/clerk/server'
import { getAdminClient } from './supabase-admin'
import { setIdentityField, setIdentityEmail } from '@/services/shared/identity'

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

  // D4: `[firstName, lastName].filter(Boolean).join(' ')` yields '' when Clerk
  // holds no name, and `name` was previously written unconditionally — so every
  // admin page load overwrote a good users.name with an empty string. Two rows
  // were damaged. Same rule as every other identity write now.
  const name = [clerk.firstName, clerk.lastName].filter(Boolean).join(' ')

  const payload: Record<string, unknown> = { clerk_id: clerk.id }
  setIdentityEmail(payload, 'email', email)
  setIdentityField(payload, 'name', name)

  const supabase = getAdminClient('sync_user')

  const { data, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'clerk_id' })
    .select('id')
    .single()

  if (error) {
    console.error('[sync-user] upsert failed:', error.message)
    return null
  }

  return data.id
}
