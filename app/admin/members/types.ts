// app/admin/members/types.ts
//
// Shared types for the Members admin. The list is USER-centric: one row per user,
// each carrying one or more tenant memberships.

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'waitlist' | 'suspended' | 'deleted';

// Display-only. Source is TBD (billing) — see handover §Open decisions.
export type Plan = 'free' | 'pro' | 'team';

// ─── Invite tracking (Option B) ────────────────────────────────────────────
//
// The invite lifecycle. A recipient moves forward through these stages;
// `reached` is the FURTHEST stage they got to.
//
// Which stages are observable depends on HOW the link is sent:
//   • 'sent'      always observable — logged when the invite row / token is created.
//   • 'opened'    observable via the tokenised redirect route (GET /invite/[token]);
//                 first hit ⇒ opened.
//   • 'accepted'  always observable — the invitee completes signup (members.used_at).
//   • 'delivered' NOT observable while links are copy-pasted; GATED out of
//                 INVITE_STAGES until an email-provider delivery webhook exists.
export type InviteStage = 'sent' | 'delivered' | 'opened' | 'accepted';

export interface InviteLink {
  /** Opaque token. The recipient URL is `${INVITE_BASE_URL}/invite/${token}`. */
  token: string;
  /** Furthest stage reached. Drives the badge + how far the timeline fills. */
  reached: InviteStage;
  /** ISO timestamps — present only for stages actually reached, null beyond. */
  sentAt: string | null;
  /** Only ever set by a provider webhook (gated stage — no column yet). */
  deliveredAt?: string | null;
  openedAt: string | null;
  acceptedAt: string | null;
  /** Total redirect hits. > 1 means opened on multiple devices/clicks. */
  opens?: number;
  /** ISO — link expiry, if invites expire. null = no expiry. */
  expiresAt?: string | null;
  /** ISO — set when an admin revokes the link. Non-null ⇒ link is dead. */
  revokedAt?: string | null;
}

// The async fetch state for a membership's live invite detail. The drawer
// refetches on open to get the freshest stage + opens count; while that is in
// flight it shows a skeleton, and on failure an inline retry (see LinkTimeline).
export type InviteFetchState = 'ready' | 'loading' | 'error';
// ─── end invite tracking ────────────────────────────────────────────────────

export interface Membership {
  /** members.id — used for invite resend, token operations. */
  memberId: string;
  tenantId: string;
  tenantName: string;
  /** tenants.domain — used to build correct invite URLs for each product host. */
  tenantDomain: string | null;
  role: Role;
  status: MemberStatus;
  plan: Plan;
  /** ISO date — when the user joined THIS tenant (members.created_at). */
  joined: string | null;
  /** ISO timestamp — last activity on this tenant. Source TBD (see handover). */
  lastActive: string | null;
  /** Optional name the admin set at invite creation. */
  invitedName: string | null;
  /** Display name of the admin who created the invite (users.name via members.invited_by). Null = seeded/self-service — renders as a dash. */
  invitedByName: string | null;
  /** Invite token — present when status = 'invited' and not yet used. */
  token: string | null;
  /** Invite-tracking snapshot for this membership. Present while an invite has
   *  been created for this tenant; null/absent = no tracked invite (e.g. the
   *  member was added directly). Kept post-accept so the timeline stays visible. */
  invite?: InviteLink | null;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  /** Sorted; memberships[0] is treated as the "primary" for collapsed list columns. */
  memberships: Membership[];
  /** True when this row represents an invited-only member with no users row yet. */
  isInviteOnly?: boolean;
  /** True when this row has a Clerk account (clerk_id set, status active/suspended)
   *  but members.user_id is null — a data-integrity gap, not a normal invite.
   *  See System Docs/Known Gaps.md. Read-only until backfilled or self-healed. */
  isOrphaned?: boolean;
}

export interface TenantOption {
  id: string;
  name: string;
  domain?: string | null;
}

/** Payload for the single "save all role changes" write. */
export interface RoleChange {
  tenantId: string;
  role: Role;
}
