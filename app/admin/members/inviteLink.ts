// app/admin/members/inviteLink.ts
//
// Server-safe helpers for invite-link tracking (Option B). No JSX, no
// Mantine, no React — importable from server components and API routes.
// Single source of truth for the `/invite/{token}` URL shape and for
// deriving the `InviteLink` view model from a `members` row.

import type { InviteLink } from './types';

/** The subset of `members` columns needed to derive an `InviteLink`. */
export interface InviteLinkRow {
  token: string | null;
  created_at: string | null;
  used_at: string | null;
  opened_at: string | null;
  opens: number | null;
  revoked_at: string | null;
  expires_at: string | null;
}

/**
 * Maps a `members` row onto the `InviteLink` view model. Returns null when
 * the row has no token — i.e. there is nothing to track (member was added
 * directly, or the invite was never generated).
 */
export function toInviteLink(row: InviteLinkRow): InviteLink | null {
  if (!row.token) return null;

  const reached: InviteLink['reached'] = row.used_at ? 'accepted' : row.opened_at ? 'opened' : 'sent';

  return {
    token: row.token,
    reached,
    sentAt: row.created_at ?? null,
    openedAt: row.opened_at ?? null,
    acceptedAt: row.used_at ?? null,
    opens: row.opens ?? 0,
    expiresAt: row.expires_at ?? null,
    revokedAt: row.revoked_at ?? null,
  };
}

/**
 * Builds the recipient-facing invite URL. Prefers the tenant's configured
 * domain (so links point at the right product host); falls back to the
 * supplied origin (e.g. the current admin host) when no domain is set.
 */
export function inviteUrlFor(token: string, tenantDomain?: string | null, origin?: string): string {
  const base = tenantDomain ? `https://${tenantDomain}` : (origin ?? '');
  return `${base}/invite/${token}`;
}
