'use client'

// Clerk client adapter — the only place client-side code may import
// @clerk/nextjs hooks. Product components consume useAuthUser / useAuthActions
// via @/services/auth/client.

import { useClerk, useUser } from '@clerk/nextjs'

import type { AuthActions, AuthAppearance, AuthUserState } from '../../types'
import { mapClerkUser } from './map'

/**
 * Provider-agnostic mirror of Clerk's useUser().
 *
 * The `isLoaded` / `isSignedIn` tri-state is passed through VERBATIM:
 * `isSignedIn` stays `undefined` until Clerk has loaded. Consumers gate on the
 * loaded false→true transition (chatStore's session recovery and
 * first-observation guard) — coercing to boolean while `!isLoaded` would
 * corrupt those gates.
 */
export function useAuthUser(): AuthUserState {
  const { isLoaded, isSignedIn, user } = useUser()
  return {
    isLoaded,
    isSignedIn,
    // undefined = provider not loaded yet; null = loaded, signed out.
    user: !isLoaded ? undefined : user ? mapClerkUser(user) : null,
  }
}

/**
 * Imperative auth actions. `signOut` keeps the provider's configured
 * `afterSignOutUrl` semantics (set on AuthProvider in the root layout) —
 * do not wrap it with extra navigation. The open* modal launchers accept the
 * boundary's opaque AuthAppearance and hand it to Clerk unchanged.
 */
export function useAuthActions(): AuthActions {
  const clerk = useClerk()
  return {
    signOut: () => clerk.signOut(),
    openSignIn: (opts?: { appearance?: AuthAppearance }) =>
      clerk.openSignIn({ appearance: opts?.appearance } as Parameters<typeof clerk.openSignIn>[0]),
    openSignUp: (opts?: { appearance?: AuthAppearance }) =>
      clerk.openSignUp({ appearance: opts?.appearance } as Parameters<typeof clerk.openSignUp>[0]),
    openUserProfile: (opts?: { appearance?: AuthAppearance }) =>
      clerk.openUserProfile({ appearance: opts?.appearance } as Parameters<typeof clerk.openUserProfile>[0]),
  }
}
