import { SignIn } from '@clerk/nextjs'

// Reached at /sign-in on any domain alias (jefflougheed.ca/sign-in,
// 2bl.ai/sign-in, etc.). The catch-all [[...sign-in]] absorbs Clerk's
// internal sub-routes (factor-one, sso-callback, reset-password, etc.).
// Used as the admin auth gate — unauthenticated /admin requests redirect
// here so the sign-in page resolves on the same domain, not Clerk's
// Account Portal on the primary domain.
export default function SignInPage() {
  return (
    <main
      style={{
        display: 'grid',
        minHeight: '100dvh',
        placeItems: 'center',
        backgroundColor: 'var(--color-bg, #f9f8f5)',
        padding: '3rem 1.25rem',
      }}
    >
      <SignIn forceRedirectUrl="/admin" />
    </main>
  )
}
