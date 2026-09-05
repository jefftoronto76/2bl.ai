// Clerk server adapter — with middleware.ts and client.ts/ui.tsx in this
// folder, the only place in the codebase that may import @clerk/nextjs/server.
// Everything Clerk-specific on the server is contained here; product code
// consumes the provider-agnostic surface via @/services/auth.

import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'

import type { AppSession, AuthUser } from '../../types'
import { getAdminClient } from '../../supabase-admin'
import { mapClerkUser } from './map'

/**
 * AUTHORIZATION IS OURS — server-side isPlatformAdmin comes from the Supabase
 * `users.role` column, not the provider (flipped 2026-06-11). The provider
 * authenticates; our database authorizes.
 *
 * Resolution: users.role = 'platform_admin' → true; any other role, or no
 * users row yet → false. If the LOOKUP ITSELF fails (e.g. the column doesn't
 * exist yet — Studio prerequisite), falls back LOUDLY to the provider
 * publicMetadata mapping so an admin is never locked out by a missing
 * migration. The fallback log line is the §15 test-plan check: it must NOT
 * appear once users.role is confirmed.
 *
 * Client-side (`useAuthUser`) still maps from publicMetadata — the browser has
 * no service-role DB path. Client isPlatformAdmin gates display-only surfaces
 * (debug pills, greeting); every privileged action is server-gated through
 * this function.
 */
async function resolveIsPlatformAdminFromDb(
  providerUserId: string,
  metadataFallback: boolean,
): Promise<boolean> {
  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('clerk_id', providerUserId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return false
    return (data as { role?: string }).role === 'platform_admin'
  } catch (err) {
    console.error(
      '[auth] users.role lookup failed — falling back to publicMetadata:',
      err instanceof Error ? err.message : err,
    )
    return metadataFallback
  }
}

/**
 * Cheap session presence — JWT check only, no Clerk backend call. Use for
 * presence gates (401 paths); use getCurrentUser() when profile fields or
 * isPlatformAdmin are needed.
 */
export async function getSession(): Promise<AppSession | null> {
  const { userId } = await auth()
  if (!userId) return null
  return { providerUserId: userId }
}

/**
 * Full identity — one Clerk backend call (`currentUser()`), normalized to the
 * boundary's AuthUser. Returns null when no session.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const user = await currentUser()
  if (!user) return null
  const mapped = mapClerkUser(user)
  return {
    ...mapped,
    isPlatformAdmin: await resolveIsPlatformAdminFromDb(user.id, mapped.isPlatformAdmin),
  }
}

/**
 * Platform-admin gate. Returns the AuthUser when the caller is signed in AND
 * a platform admin, else null — callers that must distinguish "signed out"
 * from "signed in but not admin" (e.g. redirect targets) use getCurrentUser()
 * and branch on `isPlatformAdmin` themselves.
 */
export async function requirePlatformAdmin(): Promise<AuthUser | null> {
  const user = await getCurrentUser()
  if (!user?.isPlatformAdmin) return null
  return user
}

/**
 * Permanently deletes a Clerk user by their Clerk user id. Irreversible —
 * destroys the Clerk identity, all active sessions, and all Clerk-side data.
 * Callers must write the audit record and handle Supabase deletion separately.
 * clerkClient is an async factory in Core 3 (v7) — must be awaited before use.
 */
export async function deleteClerkUser(clerkUserId: string): Promise<void> {
  const client = await clerkClient()
  await client.users.deleteUser(clerkUserId)
}

/**
 * Updates a Clerk user's first name server-side. Used only by the
 * name-completion interstitial's submit path
 * (components/shells/membership/NameCompletionGate.tsx) — the client-side
 * signUp.update() write (client.ts) operates on a live, in-browser SignUp
 * resource and is gated to the sign-up branch only, so a name typed by an
 * already-authenticated visitor never reaches Clerk any other way.
 * Deliberately narrow: this is not general Clerk/Supabase reconciliation —
 * see D3 in System Docs/Identity System.md for that broader, unbuilt
 * problem, which this function does not attempt to solve.
 * clerkClient is an async factory in Core 3 (v7) — must be awaited before
 * use, same as deleteClerkUser above.
 */
export async function updateClerkUserFirstName(clerkUserId: string, firstName: string): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUser(clerkUserId, { firstName })
}

// Low-level Clerk re-exports for IN-BOUNDARY use only (the existing
// services/auth helpers — get-auth-context, sync-user, … — import these
// instead of @clerk/nextjs/server so the lint override can eventually narrow
// to providers/clerk/**). Never import these from product code.
export { auth as clerkAuth, currentUser as clerkCurrentUser }
