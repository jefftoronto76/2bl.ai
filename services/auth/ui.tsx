// services/auth/ui — prebuilt provider UI, surfaced under boundary-neutral
// names. NO 'use client' directive — pure re-exports preserve the provider
// package's own server/client boundary markers (see providers/clerk/ui.tsx).
//
//   import { AuthProvider } from '@/services/auth/ui'      // root layout
//   import { UserButton } from '@/services/auth/ui'        // admin shells
//   import { SignInPanel } from '@/services/auth/ui'       // sign-in page
//   import { CaptchaSlot } from '@/services/auth/ui'       // custom sign-up forms

export { AuthProvider, UserButton, SignInPanel, CaptchaSlot } from './providers/clerk/ui'
export type { AuthAppearance } from './types'
