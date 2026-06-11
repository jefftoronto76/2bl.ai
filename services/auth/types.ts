// Provider-agnostic auth contracts — the only shapes product code may know.
//
// Golden Rule (docs/auth-service-rebuild.md): no file outside services/auth/
// imports an auth provider directly. Product code consumes these types via
// @/services/auth (server), @/services/auth/client (client hooks), or
// @/services/auth/ui (prebuilt UI re-exports).
//
// The contract is tiered to preserve the cost profile of the underlying
// provider calls — a presence check must stay cheap (JWT-only), and only
// callers that need profile fields pay for a provider backend call.

/**
 * Cheap session presence — backed by a JWT check (no provider backend call).
 * `providerUserId` is the auth provider's opaque subject id (today: the Clerk
 * user id). Product code must treat it as opaque; resolution to Supabase
 * `users.id` happens inside services/auth (getCurrentUserId / getAuthContext).
 */
export interface AppSession {
  providerUserId: string
}

/**
 * Full identity — backed by one provider backend call. `isPlatformAdmin` is an
 * authorization fact owned by us, resolved inside the service layer
 * (providers/clerk/map.ts `resolveIsPlatformAdmin` is the single swap point —
 * Clerk publicMetadata today, Supabase `users.role` once confirmed in Studio).
 */
export interface AuthUser {
  providerUserId: string
  email?: string
  phone?: string
  name?: string
  /** Provider-hosted avatar URL, when the provider supplies one. */
  imageUrl?: string
  isPlatformAdmin: boolean
}

/**
 * Client-side auth state, mirroring the provider's loading semantics exactly.
 * `isSignedIn` is `undefined` until `isLoaded` is true — consumers that gate on
 * the signed-out→signed-in transition (e.g. the Heirloom chatStore recovery
 * effect) depend on this tri-state and it must never be coerced to boolean
 * while loading.
 */
export interface AuthUserState {
  isLoaded: boolean
  isSignedIn: boolean | undefined
  user: AuthUser | null | undefined
}

/** Imperative client-side auth actions (sign-out, provider modals). */
export interface AuthActions {
  signOut: () => Promise<void>
  openSignIn: (opts?: { appearance?: AuthAppearance }) => void
  openSignUp: (opts?: { appearance?: AuthAppearance }) => void
  openUserProfile: (opts?: { appearance?: AuthAppearance }) => void
}

/**
 * Opaque theming object for provider-rendered UI (modals, prebuilt panels).
 * Product code builds these as plain objects (see
 * components/shells/membership/clerkAppearance.ts); the provider adapter is
 * responsible for handing them to the underlying SDK.
 */
export type AuthAppearance = Record<string, unknown>
