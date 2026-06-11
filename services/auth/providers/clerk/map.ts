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
  imageUrl?: string | null
}

/**
 * Provider-metadata admin resolution — CLIENT-SIDE and fallback only.
 *
 * As of 2026-06-11 the authoritative server-side resolution is the Supabase
 * `users.role` column (resolveIsPlatformAdminFromDb in ./server.ts — every
 * privileged gate goes through it). This publicMetadata read remains for:
 * (1) the client mapping in useAuthUser — the browser has no service-role DB
 * path, and client isPlatformAdmin gates display-only surfaces; (2) the loud
 * server fallback when the users.role lookup itself fails.
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
    imageUrl: user.imageUrl ?? undefined,
    isPlatformAdmin: resolveIsPlatformAdmin(user),
  }
}
