// app/admin/members/utils.ts
//
// Presentation helpers. Inputs are ISO strings (or null) coming off the API.

/** "Jan 2025" — used for the per-tenant "Joined" field. */
export function formatMonthYear(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** "12m ago" / "2h ago" / "3d ago" — used for "Last active". */
export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/**
 * Aggregate status for the collapsed list row / row actions.
 * If every membership is deleted the user reads as deleted; otherwise use the
 * primary (first) membership's status.
 */
import type { UserRow, MemberStatus } from './types';
export function primaryStatus(u: UserRow): MemberStatus {
  if (u.memberships.length > 0 && u.memberships.every((m) => m.status === 'deleted')) return 'deleted';
  return u.memberships[0]?.status ?? 'active';
}
