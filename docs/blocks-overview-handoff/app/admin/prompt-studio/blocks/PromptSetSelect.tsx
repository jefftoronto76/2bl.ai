// app/admin/prompt-studio/blocks/PromptSetSelect.tsx
//
// "Current Prompt Set" picker for the Blocks page header. URL-driven (writes
// ?set=<id>, preserving other params) — same posture as useBlocksFilters, so
// the server page can read the active set and scope its blocks query. The
// active set's version + status flow into BlocksOverview.
//
// Mantine Menu for accessible listbox semantics; inline SVG icons keep this
// dependency-free.

'use client';

import { Badge, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { resolveActiveSet, type PromptSet, type PromptSetStatus } from './promptSets';

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ transition: 'transform 150ms ease', transform: open ? 'rotate(90deg)' : 'none', color: 'var(--mantine-color-dimmed)' }}
    >
      <path d="M9 6l6 6l-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: 'var(--mantine-color-green-7)' }}>
      <path d="M5 12l5 5l10 -10" />
    </svg>
  );
}

function StatusBadge({ status }: { status: PromptSetStatus }) {
  const isLive = String(status).toLowerCase() === 'live';
  return (
    <Badge color={isLive ? 'green' : 'yellow'} variant="light" size="sm" radius="sm">
      {status}
    </Badge>
  );
}

export interface PromptSetSelectProps {
  sets: PromptSet[];
  /** Currently-active set id (from the server, resolved from ?set=). */
  activeId: string;
}

export function PromptSetSelect({ sets, activeId }: PromptSetSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = resolveActiveSet(sets, activeId);
  if (!active) return null;

  function select(id: string) {
    if (id === active!.id) return;
    const next = new URLSearchParams(params.toString());
    next.set('set', id);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <Stack gap={6}>
      <Text
        variant="muted"
        style={{
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        Current Prompt Set
      </Text>

      <Menu position="bottom-start" width={280} radius="md" shadow="md" withinPortal>
        <Menu.Target>
          <UnstyledButton
            aria-haspopup="listbox"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              height: 36,
              padding: '0 9px 0 14px',
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: 'var(--mantine-radius-sm)',
              background: 'var(--mantine-color-body)',
            }}
          >
            <Text fw={600} size="sm" style={{ whiteSpace: 'nowrap' }}>{active.label}</Text>
            <StatusBadge status={active.status} />
            <Caret open={false} />
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          {sets.map((s) => (
            <Menu.Item key={s.id} onClick={() => select(s.id)} aria-selected={s.id === active.id}>
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>{s.label}</Text>
                <Group gap={8} wrap="nowrap">
                  <Text ff="monospace" size="xs" c="dimmed">v{s.version}</Text>
                  <StatusBadge status={s.status} />
                  <span style={{ width: 14, display: 'inline-flex' }}>{s.id === active.id ? <Check /> : null}</span>
                </Group>
              </Group>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Stack>
  );
}
