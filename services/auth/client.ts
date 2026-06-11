'use client'

// services/auth/client — the CLIENT entry point of the auth boundary.
//
// Direct-import only (never re-exported from the server barrel index.ts):
//   import { useAuthUser, useAuthActions } from '@/services/auth/client'
//
// Backed by the active provider adapter (providers/clerk/client today).

export { useAuthUser, useAuthActions } from './providers/clerk/client'
export type { AuthUser, AuthUserState, AuthActions, AuthAppearance } from './types'
