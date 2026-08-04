// app/admin/settings/utils.ts
//
// Presentation helpers for the Appearance change history.

/** "Jun 18, 2026, 2:22 PM" — absolute timestamp for an audit row. */
export function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
