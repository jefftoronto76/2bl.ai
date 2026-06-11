// Clerk prebuilt-UI re-exports — provider-rendered components surfaced under
// boundary-neutral names. Jeff's call (June 11): re-export rather than rebuild,
// so the visitor-facing UI stays byte-identical while the Golden Rule holds.
//
// DELIBERATELY NO 'use client' DIRECTIVE. These are pure re-exports: Clerk's
// own package carries the correct server/client boundary markers, and
// ClerkProvider imported from @clerk/nextjs in a server component is the
// SSR-aware provider (initial auth state on first paint). Wrapping it inside a
// 'use client' module would force the client-only build and silently break SSR
// auth state.

export {
  ClerkProvider as AuthProvider,
  UserButton,
  SignIn as SignInPanel,
} from '@clerk/nextjs'

/**
 * Clerk bot-protection mount point. Must be present in the DOM before
 * `signUp.create()` fires (sign-up silently fails without it) — render it
 * inside any custom sign-up form, exactly where the raw div sits today.
 */
export function CaptchaSlot() {
  return <div id="clerk-captcha" />
}
