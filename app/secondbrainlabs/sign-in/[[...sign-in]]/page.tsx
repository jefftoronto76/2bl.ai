import { SignIn } from '@clerk/nextjs'

// Reached at 2bl.ai/sign-in (middleware rewrites the SBL host's /sign-in path
// into this /secondbrainlabs segment, so the address bar keeps showing
// 2bl.ai/sign-in). The catch-all [[...sign-in]] absorbs Clerk's internal
// sub-routes (factor-one, sso-callback, reset-password). Inherits the SBL
// design tokens + fonts from app/secondbrainlabs/layout.tsx.
export default function PlatformSignInPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-paper px-5 py-12 font-sans text-ink">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-ink">
            <img
              src="/2bl/2blai_logo.svg"
              alt="Second Brain Labs"
              className="h-full w-full object-cover"
            />
          </span>
          <div>
            <p className="font-serif text-[22px] leading-tight text-ink">Second Brain Labs</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
              Platform Admin
            </p>
          </div>
        </div>

        <SignIn
          forceRedirectUrl="/platform/admin"
          appearance={{
            variables: {
              colorPrimary: '#C8542E',
              colorText: '#1F1A14',
              colorTextSecondary: '#6B6256',
              colorInputText: '#1F1A14',
              colorBackground: '#FFFFFF',
              borderRadius: '0.625rem',
              fontFamily: 'var(--font-sans)',
            },
            elements: {
              footerAction: 'hidden',
            },
          }}
        />
      </div>
    </main>
  )
}
