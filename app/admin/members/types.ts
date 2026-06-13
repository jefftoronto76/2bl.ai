// app/admin/members/types.ts
//
// Shared types for the Members admin. The list is USER-centric: one row per user,
// each carrying one or more tenant memberships.

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'waitlist' | 'suspended' | 'deleted';

// Display-only. Source is TBD (billing) — see handover §Open decisions.
export type Plan = 'free' | 'pro' | 'team';

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
  /** Invite token — present when status = 'invited' and not yet used. */
  token: string | null;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  /** Sorted; memberships[0] is treated as the "primary" for collapsed list columns. */
  memberships: Membership[];
  /** True when this row represents an invited-only member with no users row yet. */
  isInviteOnly?: boolean;
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
