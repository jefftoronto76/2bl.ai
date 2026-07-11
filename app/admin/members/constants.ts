// app/admin/members/constants.ts
//
// Badge colors map to Mantine theme color names (variant="light"), so they inherit
// the admin theme rather than hard-coding hex. Adjust names to taste in mantine-theme.ts.

import type { Role, MemberStatus, Plan, InviteStage } from './types';

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

export const ROLE_COLOR: Record<Role, string> = {
  owner: 'yellow',
  admin: 'teal',
  member: 'gray',
  viewer: 'gray',
};

export const STATUS_COLOR: Record<MemberStatus, string> = {
  active: 'green',
  invited: 'blue',
  waitlist: 'yellow',
  suspended: 'orange',
  deleted: 'gray',
};

export const PLAN_COLOR: Record<Plan, string> = {
  free: 'gray',
  pro: 'blue',
  team: 'grape',
};

export const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro', team: 'Team' };

// Status filter segmented control. 'all' is a UI-only pseudo-value.
export type StatusFilter = 'all' | MemberStatus;
export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deleted', label: 'Deleted' },
];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Invite tracking (Option B) ────────────────────────────────────────────

/**
 * The stages the timeline renders, IN ORDER.
 *
 * Default is the copy-paste reality: three observable stages. When links are
 * copied and pasted into the admin's own email/SMS there is no delivery signal,
 * so 'delivered' is intentionally omitted.
 *
 * ▶ To light up 'delivered', integrate an email provider that posts a delivery
 *   webhook, then change this to: ['sent', 'delivered', 'opened', 'accepted']
 *   The components read this array — no other change is needed.
 */
export const INVITE_STAGES: InviteStage[] = ['sent', 'opened', 'accepted'];

/**
 * Per-stage presentation. `label` is the short chip/step word; `stamp` is the
 * verb used in the timeline row ("Opened 2d ago"). Colors are the admin palette:
 * terracotta accent #C8542E for "Opened", forest green #2d6a4f for the terminal.
 */
export const INVITE_STAGE_META: Record<
  InviteStage,
  { label: string; stamp: string; color: string; hint: string }
> = {
  sent: {
    label: 'Created',
    stamp: 'Created',
    color: '#a99e8b',
    // Honest wording: we log link creation, not the manual paste-and-send.
    hint: 'Invite link generated and copied',
  },
  delivered: {
    label: 'Delivered',
    stamp: 'Delivered',
    color: '#1c7ed6',
    hint: 'Confirmed delivered by the email provider',
  },
  opened: {
    label: 'Opened',
    stamp: 'Opened',
    color: '#C8542E',
    hint: 'Recipient visited the invite link',
  },
  accepted: {
    label: 'Accepted',
    stamp: 'Accepted',
    color: '#2d6a4f',
    hint: 'Signed up and joined the tenant',
  },
};

/** Position of a stage within the active INVITE_STAGES order (−1 if gated off). */
export const inviteStageIndex = (s: InviteStage) => INVITE_STAGES.indexOf(s);

/**
 * Days a link may sit at 'opened' without being accepted before we flag it as
 * STALLED (a subtle nudge to resend). Tune to taste.
 */
export const INVITE_STALL_DAYS = 3;

/** Days an invite link stays valid after being created or resent. Stamped
 *  onto members.expires_at; not yet enforced at the redirect route. */
export const INVITE_TTL_DAYS = 14;

/** Base URL for tokenised invite links. Set from env in production. */
export const INVITE_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.2bl.ai';

// ─── end invite tracking ────────────────────────────────────────────────────
