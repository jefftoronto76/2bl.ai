// Clerk server adapter — with middleware.ts and client.ts/ui.tsx in this
// folder, the only place in the codebase that may import @clerk/nextjs/server.
// Everything Clerk-specific on the server is contained here; product code
// consumes the provider-agnostic surface via @/services/auth.

import { auth, currentUser } from '@clerk/nextjs/server'

import type { AppSession, AuthUser } from '../../types'
import { mapClerkUser } from './map'

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
  return mapClerkUser(user)
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

// Low-level Clerk re-exports for IN-BOUNDARY use only (the existing
// services/auth helpers — get-auth-context, sync-user, … — import these
// instead of @clerk/nextjs/server so the lint override can eventually narrow
// to providers/clerk/**). Never import these from product code.
export { auth as clerkAuth, currentUser as clerkCurrentUser }
