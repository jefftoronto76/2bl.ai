'use client'

import { useState } from 'react'
import { Badge, Box, Group, Menu, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { Text as MutedText } from '@/components/admin/primitives/Text'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { resolveActiveSet, type PromptSet, type PromptSetStatus } from './promptSets'

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
      style={{
        transition: 'transform 150ms ease',
        transform: open ? 'rotate(90deg)' : 'none',
        color: 'var(--mantine-color-dimmed)',
      }}
    >
      <path d="M9 6l6 6l-6 6" />
    </svg>
  )
}

function Check() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ color: 'var(--mantine-color-green-7)' }}
    >
      <path d="M5 12l5 5l10 -10" />
    </svg>
  )
}

function StatusBadge({ status }: { status: PromptSetStatus }) {
  const normalized = String(status).toLowerCase()
  const color = normalized === 'live' ? 'green' : normalized === 'retired' ? 'gray' : 'yellow'
  const label = normalized === 'live' ? 'Live' : normalized === 'retired' ? 'Retired' : 'Draft'
  return (
    <Badge color={color} variant="light" size="sm" radius="sm">
      {label}
    </Badge>
  )
}

export interface PromptSetSelectProps {
  sets: PromptSet[]
  activeId: string
}

export function PromptSetSelect({ sets, activeId }: PromptSetSelectProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const active = resolveActiveSet(sets, activeId)
  if (!active) return null

  function select(id: string) {
    if (id === active!.id) return
    // Strip stale filter params when switching sets — start clean.
    const next = new URLSearchParams()
    next.set('set', id)
    router.push(`${pathname}?${next.toString()}`)
  }

  const showSearch = sets.length > 6
  const visible = showSearch && search.trim()
    ? sets.filter((s) => s.label.toLowerCase().includes(search.trim().toLowerCase()))
    : sets

  return (
    <Group gap="sm" align="center" wrap="nowrap">
      <MutedText
        variant="muted"
        style={{
          fontSize: 'var(--mantine-font-size-xs)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        Current Prompt Set
      </MutedText>

      <Menu
        position="bottom-start"
        width={280}
        radius="md"
        shadow="md"
        withinPortal
        opened={menuOpen}
        onChange={(open) => { setMenuOpen(open); if (!open) setSearch('') }}
      >
        <Menu.Target>
          <UnstyledButton
            aria-haspopup="listbox"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              padding: '0 9px 0 13px',
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: 'var(--mantine-radius-sm)',
              background: '#fff',
            }}
          >
            <Text fw={600} style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{active.label}</Text>
            <StatusBadge status={active.status} />
            <Caret open={menuOpen} />
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          {showSearch && (
            <Box px={6} pt={6} pb={4}>
              <TextInput
                data-autofocus
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="Find a prompt set"
                size="xs"
                leftSection={<IconSearch size={12} />}
              />
            </Box>
          )}
          {visible.map((s) => (
            <Menu.Item key={s.id} onClick={() => select(s.id)} aria-selected={s.id === active.id}>
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>{s.label}</Text>
                <Group gap={8} wrap="nowrap">
                  <Text ff="monospace" size="xs" c="dimmed">v{s.version}</Text>
                  <StatusBadge status={s.status} />
                  <span style={{ width: 14, display: 'inline-flex' }}>
                    {s.id === active.id ? <Check /> : null}
                  </span>
                </Group>
              </Group>
            </Menu.Item>
          ))}
          {showSearch && visible.length === 0 && (
            <Text c="dimmed" size="sm" ta="center" py="sm">No prompt sets match.</Text>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
