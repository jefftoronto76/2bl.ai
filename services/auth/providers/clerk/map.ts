// Shared Clerk → AuthUser mapping. Deliberately import-free (structural
// typing) so both the server adapter (@clerk/nextjs/server `User`) and the
// client adapter (@clerk/nextjs `UserResource`) can feed it without pulling
// server-only or client-only modules into each other's import graph.

import type { AuthUser } from '../../types'

/**
 * The minimal structural shape shared by Clerk's server `User` and client
 * `UserResource`. Both expose id, publicMetadata, emailAddresses[n].emailAddress,
 * phoneNumbers[n].phoneNumber, firstName/lastName.
 */
export interface ClerkUserLike {
  id: string
  publicMetadata?: Record<string, unknown> | null
  emailAddresses?: Array<{ emailAddress: string }> | null
  phoneNumbers?: Array<{ phoneNumber: string }> | null
  firstName?: string | null
  lastName?: string | null
}

/**
 * AUTHORIZATION SWAP POINT — the single place `isPlatformAdmin` is resolved.
 *
 * Today this reads Clerk `publicMetadata.role` (behavior-identical to the
 * pre-boundary gates in the platform layout/routes and the admin Composer).
 * The destination is the Supabase `users.role` column — owned by us, not the
 * provider — once Jeff confirms the column exists in Studio (plan commit 15).
 * Flipping it here re-points every gate without touching product code.
 */
export function resolveIsPlatformAdmin(user: ClerkUserLike): boolean {
  return (user.publicMetadata as Record<string, unknown> | null | undefined)?.role === 'platform_admin'
}

/** Normalize a Clerk user (server or client shape) into the boundary's AuthUser. */
export function mapClerkUser(user: ClerkUserLike): AuthUser {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
  return {
    providerUserId: user.id,
    email: user.emailAddresses?.[0]?.emailAddress ?? undefined,
    phone: user.phoneNumbers?.[0]?.phoneNumber ?? undefined,
    name: name || undefined,
    isPlatformAdmin: resolveIsPlatformAdmin(user),
  }
}
