// app/admin/settings/utils.ts
//
// Presentation helpers for the Appearance tab.

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

/**
 * "June 23, 2026 at 9:47 PM" — long human-readable timestamp for the Sync
 * status "Last synced" field. Returns null for a null/invalid value so the UI
 * can show the "Never synced" state.
 */
export function formatSyncTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}
