// services/auth — SERVER barrel.
//
// Golden Rule (Design Handovers/auth-service-rebuild.md): no file outside services/auth/
// imports an auth provider directly. Product code imports from here (server),
// @/services/auth/client ('use client' hooks), @/services/auth/ui (prebuilt
// provider UI), or @/services/auth/middleware (edge).
//
// This barrel is server-safe only. Client modules (client.ts, useAuthFlow.ts,
// admin-user-context.tsx) and the browser Supabase factory are deliberately
// NOT re-exported here — same convention as services/chat/ui/v1, whose barrel
// excludes useChatTurn so server consumers can import without pulling a
// 'use client' module.
//
// The active provider adapter is providers/clerk. A future provider swap is a
// new providers/<name>/ folder and re-pointing these exports — product code
// never changes.

export type { AppSession, AuthUser, AuthUserState, AuthActions, AuthAppearance } from './types'
export * from './errors'

// Provider-backed session/identity API (Clerk adapter today).
export { getSession, getCurrentUser, requirePlatformAdmin, deleteClerkUser, updateClerkUserFirstName } from './providers/clerk/server'

// Existing service helpers — Supabase-resolved identity, tenant scoping, sync.
export { getAuthContext } from './get-auth-context'
export { getCurrentUserId } from './get-current-user-id'
export { getTenantFromRequest } from './get-tenant-from-request'
export { getTenantName } from './get-tenant-name'
export { getTenantType } from './get-tenant-type'
export { syncUser } from './sync-user'
export { ensureClerkUser } from './ensure-clerk-user'
export { syncMember, HEIRLOOM_TENANT_ID } from './sync-member'
export { claimMembership } from './claim-membership'
export { findUserByClerkId } from './findUserByClerkId'
export { validateMagicLinkInput } from './magic-link'
export type { MagicLinkType, MagicLinkInput, MagicLinkResult } from './magic-link'
