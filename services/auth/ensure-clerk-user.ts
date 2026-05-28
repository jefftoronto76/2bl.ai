import { currentUser } from '@clerk/nextjs/server'
import { getAdminClient } from './supabase-admin'

/**
 * Upsert the current Clerk user into the Supabase `users` table by `clerk_id`,
 * returning `users.id`. Unlike `syncUser`, this does NOT require an email —
 * it supports phone-only Heirloom sign-ups (the phone lives on the Clerk user;
 * `users` has no phone column). Email/name are written only when present, so a
 * phone-only row inserts with a null email (requires `users.email` nullable).
 *
 * Distinct from `syncUser` on purpose: the admin/jefflougheed path keeps its
 * email-required behavior untouched. Returns null when there is no Clerk
 * session or the upsert fails (callers degrade gracefully — no account link).
 */
export async function ensureClerkUser(): Promise<string | null> {
  const clerk = await currentUser()
  if (!clerk) return null

  const email = clerk.emailAddresses[0]?.emailAddress ?? null
  const name = [clerk.firstName, clerk.lastName].filter(Boolean).join(' ') || null

  const row: { clerk_id: string; email?: string; name?: string } = { clerk_id: clerk.id }
  if (email) row.email = email
  if (name) row.name = name

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('users')
    .upsert(row, { onConflict: 'clerk_id' })
    .select('id')
    .single()

  if (error) {
    console.error('[ensure-clerk-user] upsert failed:', error.message)
    return null
  }

  return data.id as string
}
