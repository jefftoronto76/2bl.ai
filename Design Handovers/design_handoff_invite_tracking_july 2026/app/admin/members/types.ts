// app/admin/members/types.ts
//
// Shared types for the Members admin. The list is USER-centric: one row per user,
// each carrying one or more tenant memberships.
//
// ▶ INVITE-TRACKING ADDITIONS (Option B) are marked with ‹invite tracking›.
//   Everything above that block is unchanged from the shipped members-admin file —
//   this is a drop-in replacement.

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'suspended' | 'deleted';

// Display-only. Source is TBD (billing) — see members-admin handover §Open decisions.
export type Plan = 'free' | 'pro' | 'team';

// ─── ‹invite tracking› ───────────────────────────────────────────────────
//
// The invite lifecycle. A recipient moves forward through these stages; `reached`
// is the FURTHEST stage they got to.
//
// IMPORTANT — which stages are observable depends on HOW the link is sent:
//   • 'sent'      always observable — we log it when the admin generates + copies
//                 the invite link (the invite row / token is created).
//   • 'opened'    observable ONLY with a tokenised invite URL that routes through
//                 our redirect endpoint (see handover §Data source). First hit ⇒ opened.
//   • 'accepted'  always observable — the invitee completes signup and the membership
//                 goes active.
//   • 'delivered' NOT observable while links are copy-pasted into the admin's own
//                 email/SMS. It only lights up if the invite is sent through an
//                 integrated email provider that reports delivery via webhook.
//                 It is GATED — omitted from INVITE_STAGES until that integration
//                 exists (see constants.ts).
export type InviteStage = 'sent' | 'delivered' | 'opened' | 'accepted';

export interface InviteLink {
  /** Opaque token. The recipient URL is `${INVITE_BASE_URL}/invite/${token}`. */
  token: string;
  /** Furthest stage reached. Drives the badge + how far the timeline fills. */
  reached: InviteStage;
  /** ISO timestamps — present only for stages actually reached, null beyond. */
  sentAt: string | null;
  deliveredAt?: string | null; // only ever set by a provider webhook
  openedAt: string | null;
  acceptedAt: string | null;
  /** Total redirect hits. > 1 means opened on multiple devices/clicks. Optional. */
  opens?: number;
  /** ISO — link expiry, if invites expire. null = no expiry. */
  expiresAt?: string | null;
  /** ISO — set when an admin revokes the link. Non-null ⇒ link is dead. */
  revokedAt?: string | null;
}
// ─── end ‹invite tracking› ─────────────────────────────────────────────────

export interface Membership {
  tenantId: string;
  tenantName: string;
  role: Role;
  status: MemberStatus;
  plan: Plan;
  /** ISO date — when the user joined THIS tenant (members.created_at). */
  joined: string | null;
  /** ISO timestamp — last activity on this tenant. Source TBD (see handover). */
  lastActive: string | null;
  // ‹invite tracking› — the invite for THIS tenant membership. Present while the
  // membership is 'invited'; may be kept post-accept for the historical record.
  // null / absent ⇒ no tracked invite (e.g. user was added directly).
  invite?: InviteLink | null;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  /** Sorted; memberships[0] is treated as the "primary" for collapsed list columns. */
  memberships: Membership[];
}

export interface TenantOption {
  id: string;
  name: string;
}

/** Payload for the single "save all role changes" write. */
export interface RoleChange {
  tenantId: string;
  role: Role;
}

// ‹invite tracking› — the async fetch state for a membership's live invite detail.
// The drawer refetches on open to get the freshest stage + opens count; while that
// is in flight it shows a skeleton, and on failure an inline retry (see LinkTimeline).
export type InviteFetchState = 'ready' | 'loading' | 'error';
