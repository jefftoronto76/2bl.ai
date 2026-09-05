import { clerkCurrentUser as currentUser } from './providers/clerk/server'
import { getAdminClient } from './supabase-admin'
import { setIdentityField, setIdentityEmail } from '@/services/shared/identity'

/**
 * Upsert the current Clerk user into the Supabase `users` table by `clerk_id`,
 * returning `users.id`. Unlike `syncUser`, this does NOT require an email —
 * it supports phone-only Heirloom sign-ups. Email/name/phone are written only
 * when present (requires `users.email` and `users.phone` to be nullable).
 *
 * Distinct from `syncUser` on purpose: the admin/jefflougheed path keeps its
 * email-required behavior untouched. Returns null when there is no Clerk
 * session or the upsert fails (callers degrade gracefully — no account link).
 */
export async function ensureClerkUser(): Promise<string | null> {
  const clerk = await currentUser()
  if (!clerk) return null

  const email = clerk.emailAddresses[0]?.emailAddress ?? null
  const phone = clerk.phoneNumbers[0]?.phoneNumber ?? null
  const name = [clerk.firstName, clerk.lastName].filter(Boolean).join(' ') || null

  // Behaviourally unchanged — this function already got the rule right. Routed
  // through the shared helper so it stays that way by construction.
  const row: Record<string, unknown> = { clerk_id: clerk.id }
  setIdentityEmail(row, 'email', email)
  setIdentityField(row, 'name', name)
  setIdentityField(row, 'phone', phone)

  // A live authenticated session with no identifiers is unexpected — still
  // upsert (the session is real and the caller needs users.id to link it),
  // but surface it loudly: identifier-less rows are how ghost users appear.
  if (!email && !phone) {
    console.warn(
      '[ensure-clerk-user] upserting users row with no email or phone — Clerk user has no identifiers:',
      clerk.id,
    )
  }

  const supabase = getAdminClient('ensure_clerk_user')
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
