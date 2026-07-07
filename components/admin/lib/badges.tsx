'use client'

// Badge components + the colour/tint token maps shared across the admin screens.
// Tints mirror Mantine's light-variant fills; production quirks (e.g. only four
// tenant types get a colour) are preserved verbatim.

import { type ReactNode } from 'react'
import { Badge } from '@mantine/core'
import type {
  BadgeTint, BlockType, HistoryStatus, MemberPlan, MemberRole, MemberStatus,
  PromptSetStatus, SessionStatus, TenantType,
} from './types'
import { statusLabel } from './types'

/* ── tenant type → colour key (TenantList.tsx). product/reseller/member fall to gray. ── */
export const TYPE_COLORS: Record<string, string> = {
  platform: 'grape',
  business: 'teal',
  agency: 'indigo',
  client: 'blue',
}
export const BADGE_COLORS: Record<string, BadgeTint> = {
  grape: { bg: 'rgba(190,75,219,0.11)', fg: '#9c36b5' },
  teal: { bg: 'rgba(18,184,134,0.11)', fg: '#099268' },
  indigo: { bg: 'rgba(66,99,235,0.11)', fg: '#3b5bdb' },
  blue: { bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  gray: { bg: 'rgba(73,80,87,0.09)', fg: '#495057' },
}
export const typeColor = (type?: string | null): string => (type && TYPE_COLORS[type]) || 'gray'
export const tenantTint = (type?: TenantType | null): BadgeTint => BADGE_COLORS[typeColor(type)]

/* ── prompt-set usage tints ── */
export const USAGE_BADGE: Record<string, BadgeTint> = {
  base: { bg: 'rgba(18,184,134,0.12)', fg: '#099268' },
  member: { bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  _custom: { bg: 'rgba(73,80,87,0.09)', fg: '#495057' },
}
export const usageBadge = (type?: string | null): BadgeTint =>
  (type && USAGE_BADGE[type]) || USAGE_BADGE._custom

/* ── member tints ── */
export const PLAN_BADGE: Record<MemberPlan, BadgeTint & { label: string }> = {
  free: { label: 'Free', bg: 'rgba(73,80,87,0.09)', fg: '#495057' },
  pro: { label: 'Pro', bg: 'rgba(66,99,235,0.11)', fg: '#3b5bdb' },
  team: { label: 'Team', bg: 'rgba(190,75,219,0.11)', fg: '#9c36b5' },
}
export const STATUS_BADGE: Record<MemberStatus, BadgeTint & { label: string }> = {
  active: { label: 'Active', bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f' },
  invited: { label: 'Invited', bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  suspended: { label: 'Suspended', bg: 'rgba(232,89,12,0.12)', fg: '#d9480f' },
  deleted: { label: 'Deleted', bg: 'rgba(73,80,87,0.10)', fg: '#868e96' },
}
export const ROLE_BADGE: Record<MemberRole, BadgeTint & { label: string }> = {
  owner: { label: 'Owner', bg: 'rgba(217,119,6,0.13)', fg: '#b45309' },
  admin: { label: 'Admin', bg: 'rgba(18,184,134,0.12)', fg: '#099268' },
  member: { label: 'Member', bg: 'rgba(73,80,87,0.09)', fg: '#495057' },
  viewer: { label: 'Viewer', bg: 'rgba(104,112,118,0.10)', fg: '#5c636e' },
}
export const STATUS_COLOR: Record<MemberStatus, string> = {
  active: '#2d6a4f', invited: '#1c7ed6', suspended: '#d9480f', deleted: '#868e96',
}

/* ── session tints (InboundChatsTable STATUS_COLORS) ── */
export const SESSION_STATUS_BADGE: Record<SessionStatus, BadgeTint & { label: string }> = {
  in_progress: { label: 'in_progress', bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f' },
  active: { label: 'active', bg: 'rgba(245,159,0,0.14)', fg: '#e67700' },
  abandoned: { label: 'abandoned', bg: 'rgba(73,80,87,0.10)', fg: '#868e96' },
}
export const SESSION_COLOR: Record<SessionStatus, string> = {
  in_progress: '#2d6a4f', active: '#e67700', abandoned: '#868e96',
}

/* ── block types (services/prompt/block-types.ts) ── */
export const BLOCK_TYPES: BlockType[] = ['identity', 'knowledge', 'guardrail', 'process', 'output_format', 'escalation']
export const BLOCK_TYPE_COLORS: Record<BlockType, string> = {
  identity: 'violet', knowledge: 'blue', guardrail: 'red', process: 'orange', output_format: 'green', escalation: 'yellow',
}
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  identity: 'Identity', knowledge: 'Knowledge', guardrail: 'Guardrail', process: 'Process', output_format: 'Output Format', escalation: 'Escalation',
}
export const BLOCK_TYPE_COMPILE_ORDER: Record<BlockType, number> = {
  identity: 1, knowledge: 2, guardrail: 3, process: 4, output_format: 5, escalation: 6,
}
export const ORDERED_BLOCK_TYPES: BlockType[] =
  [...BLOCK_TYPES].sort((a, b) => BLOCK_TYPE_COMPILE_ORDER[a] - BLOCK_TYPE_COMPILE_ORDER[b])

export const BLOCK_BADGE: Record<string, Required<BadgeTint>> = {
  violet: { bg: 'rgba(121,80,242,0.11)', fg: '#6741d9', solid: '#7950f2' },
  blue: { bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6', solid: '#228be6' },
  red: { bg: 'rgba(250,82,82,0.12)', fg: '#e03131', solid: '#fa5252' },
  orange: { bg: 'rgba(253,126,20,0.13)', fg: '#e8590c', solid: '#fd7e14' },
  yellow: { bg: 'rgba(245,159,0,0.15)', fg: '#e67700', solid: '#f59f00' },
  green: { bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f', solid: '#2d6a4f' },
  gray: { bg: 'rgba(73,80,87,0.09)', fg: '#495057', solid: '#adb5bd' },
}
export const blockTint = (type: BlockType): Required<BadgeTint> => BLOCK_BADGE[BLOCK_TYPE_COLORS[type]]

/* ── composer history tints ── */
export const HISTORY_STATUS_BADGE: Record<HistoryStatus, BadgeTint & { label: string }> = {
  completed: { label: 'completed', bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f' },
  active: { label: 'active', bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  flagged: { label: 'flagged', bg: 'rgba(245,159,0,0.14)', fg: '#e67700' },
}

/* ── avatar colours (deterministic from a seed) ── */
const AVATAR_COLORS: BadgeTint[] = [
  { bg: 'rgba(45,106,79,0.14)', fg: '#2d6a4f' },
  { bg: 'rgba(34,139,230,0.14)', fg: '#1c7ed6' },
  { bg: 'rgba(190,75,219,0.14)', fg: '#9c36b5' },
  { bg: 'rgba(18,184,134,0.16)', fg: '#099268' },
  { bg: 'rgba(232,89,12,0.13)', fg: '#d9480f' },
  { bg: 'rgba(66,99,235,0.14)', fg: '#3b5bdb' },
]
export const avatarColor = (seed: string): BadgeTint => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/* ══════════════════════════════════════════════════════════════════════════
   Badge components
   ══════════════════════════════════════════════════════════════════════════ */

/** Custom-tinted light badge for the {bg,fg} tints carried in the data maps. */
export function TintBadge({
  tint, children, size = 'sm',
}: { tint: BadgeTint; children: ReactNode; size?: string }) {
  return (
    <Badge
      size={size}
      radius="sm"
      variant="light"
      styles={{
        root: { background: tint.bg, color: tint.fg, textTransform: 'none', fontWeight: 600, width: 'fit-content', maxWidth: 'none' },
        label: { overflow: 'visible', textOverflow: 'clip' },
      }}
    >
      {children}
    </Badge>
  )
}

/** Live / draft status badge. */
export function StatusBadge({ status }: { status: PromptSetStatus | string }) {
  const live = String(status).toLowerCase() === 'live'
  return (
    <Badge size="sm" radius="sm" variant="light" color={live ? 'green' : 'yellow'}>
      {statusLabel(String(status))}
    </Badge>
  )
}
