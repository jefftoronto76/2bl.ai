// app/admin/settings/SyncStatus.tsx
//
// Read-only branding sync status, rendered below the editor grid for each
// target (Storefront / Admin). Two fields:
//   • Last synced — formatted `defaults_synced_at`, or "Never synced"
//   • Warnings    — list of flagged tokens from `branding_warnings`, or a green
//                   "No warnings" state
//
// Informational only — no actions. Data comes from the GET /api/admin/appearance
// row (defaults_synced_at + branding_warnings) and is passed in as `sync`.

'use client';

import { Card, Group, Text } from '@mantine/core';
import type { BrandingSync } from './types';
import { formatSyncTime } from './utils';

/* Inline icons keep this dependency-free (no @tabler import assumed). */
function AlertIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.36 3.59 2.26 17.12A1.9 1.9 0 0 0 3.9 20h16.2a1.9 1.9 0 0 0 1.64-2.88L13.64 3.6a1.9 1.9 0 0 0-3.28 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5 10-10" />
    </svg>
  );
}

const LINE = 'var(--mantine-color-gray-2, #e9ecef)';

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '132px 1fr',
  border: `1px solid ${LINE}`,
  borderRadius: 'var(--mantine-radius-md, 8px)',
  overflow: 'hidden',
};
const cellBase: React.CSSProperties = { padding: '12px 13px', fontSize: 13.5, borderBottom: `1px solid ${LINE}` };
const keyCell: React.CSSProperties = {
  ...cellBase,
  color: 'var(--mantine-color-dimmed)',
  background: 'var(--mantine-color-gray-0, #f8f9fa)',
  whiteSpace: 'nowrap',
  fontWeight: 500,
};
const valCell: React.CSSProperties = {
  ...cellBase,
  color: 'var(--mantine-color-gray-8, #343a40)',
  display: 'flex',
  minWidth: 0,
};

export function SyncStatus({ sync }: { sync: BrandingSync }) {
  const synced = formatSyncTime(sync.defaults_synced_at);
  const warnings = sync.branding_warnings ?? [];
  const hasWarnings = warnings.length > 0;

  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Group justify="space-between" align="baseline" mb="xs">
        <Text fw={600} size="sm">Sync status</Text>
        <Text ff="monospace" size="xs" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.12em' }}>
          Read-only
        </Text>
      </Group>

      <div style={grid}>
        {/* Last synced */}
        <div style={keyCell}>Last synced</div>
        <div style={{ ...valCell, alignItems: 'center' }}>
          {synced ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{synced}</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--mantine-color-dimmed)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--mantine-color-gray-4, #ced4da)', flex: '0 0 auto' }} aria-hidden />
              Never synced
            </span>
          )}
        </div>

        {/* Warnings */}
        <div style={{ ...keyCell, borderBottom: 'none', alignItems: 'flex-start' }}>Warnings</div>
        <div style={{ ...valCell, borderBottom: 'none', alignItems: hasWarnings ? 'flex-start' : 'center' }}>
          {hasWarnings ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {warnings.map((w, i) => (
                <li key={`${w.token}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <span
                    aria-hidden
                    style={{
                      flex: '0 0 auto',
                      display: 'grid',
                      placeItems: 'center',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'rgba(176,124,12,0.13)',
                      color: '#b07c0c',
                      marginTop: 1,
                    }}
                  >
                    <AlertIcon />
                  </span>
                  <span style={{ minWidth: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--mantine-color-gray-7, #495057)' }}>
                    <code
                      style={{
                        fontFamily: 'var(--mantine-font-family-monospace)',
                        fontSize: 12,
                        background: 'var(--mantine-color-gray-1, #f1f3f5)',
                        border: `1px solid ${LINE}`,
                        borderRadius: 5,
                        padding: '1px 6px',
                        marginRight: 7,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {w.token}
                    </code>
                    {w.message ? <span>{w.message}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--mantine-color-green-8, #2b8a3e)',
                background: 'rgba(45,106,79,0.08)',
                border: '1px solid rgba(45,106,79,0.22)',
                borderRadius: 999,
                padding: '4px 11px 4px 9px',
              }}
            >
              <CheckIcon />
              No warnings
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
