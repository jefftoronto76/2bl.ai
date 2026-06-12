// app/admin/members/constants.ts
//
// Badge colors map to Mantine theme color names (variant="light"), so they inherit
// the admin theme rather than hard-coding hex. Adjust names to taste in mantine-theme.ts.

import type { Role, MemberStatus, Plan } from './types';

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
  { value: 'suspended', label: 'Suspended' },
  { value: 'deleted', label: 'Deleted' },
];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
