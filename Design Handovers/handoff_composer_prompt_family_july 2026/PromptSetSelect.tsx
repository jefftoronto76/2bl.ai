'use client'

// PromptSetSelect — the Blocks screen's "Current Prompt Set" picker.
//
// July 2026: prompt sets belong to one of two FAMILIES and the screen shows one at a time.
//   'tenant'   — 2bl.ai prompt sets: the assistants a tenant ships to its own users.
//   'composer' — the prompt that powers the Composer AI itself (the tool you're standing in).
//
// The distinction is deliberately quiet: a scope switch INSIDE this dropdown, plus a small chip
// on the trigger when a composer set is active. No new screen chrome — most sessions never leave
// 'tenant', and the marker should cost them nothing.
//
// Browsing the other family does not change the screen; only picking a set navigates.

import { useEffect, useMemo, useState } from 'react'
import { Badge, Box, Group, Menu, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { Text as MutedText } from '@/components/admin/primitives/Text'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { resolveActiveSet, type PromptSet, type PromptSetStatus } from './promptSets'

export type SetFamily = 'tenant' | 'composer'

// TODO(UK-6): design wording. If product has settled names, they only change here.
const SET_FAMILIES: { value: SetFamily; label: string; hint: string }[] = [
  { value: 'tenant', label: '2bl.ai', hint: 'Prompt sets your tenants ship to their users.' },
  { value: 'composer', label: 'Composer', hint: 'The prompt that powers the Composer AI itself.' },
]

/**
 * Which family a set belongs to.
 *
 * TODO(UK-1) — THE ONE LINE THAT CHANGES WITH THE SCHEMA DECISION.
 * prompt_sets.is_composer_prompt CANNOT be used here: it is a singleton pointer (exactly one row
 * platform-wide, enforced by prompt_sets_single_composer_idx) meaning "this set is live as the
 * Composer Prompt right now" — not "this set is a composer set". A separate field is required;
 * the README compares four shapes. Written here for option A (a `kind` column).
 */
function familyOf(set: PromptSet): SetFamily {
  return (set as PromptSet & { kind?: string }).kind === 'composer' ? 'composer' : 'tenant'
}

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
  const isLive = String(status).toLowerCase() === 'live'
  return (
    <Badge color={isLive ? 'green' : 'yellow'} variant="light" size="sm" radius="sm">
      {isLive ? 'Live' : 'Draft'}
    </Badge>
  )
}

/** The quiet marker on the trigger. Composer sets only. */
function FamilyChip() {
  return (
    <Box
      component="span"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 7px',
        flexShrink: 0,
        borderRadius: 'var(--mantine-radius-sm)',
        background: 'var(--mantine-color-gray-1)',
        color: 'var(--mantine-color-dimmed)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.02em',
      }}
    >
      Composer
    </Box>
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
  const activeFamilyValue: SetFamily = active ? familyOf(active) : 'tenant'

  // The scope you're BROWSING. Local state, not the URL: browsing is transient, picking
  // navigates. TODO(UK-3): confirm the scope needn't survive reload / a shared link.
  const [family, setFamily] = useState<SetFamily>(activeFamilyValue)

  // Reopening always returns you to the family you're actually in.
  useEffect(() => {
    if (menuOpen) setFamily(activeFamilyValue)
  }, [menuOpen, activeFamilyValue])

  const counts = useMemo(() => {
    const c: Record<SetFamily, number> = { tenant: 0, composer: 0 }
    for (const s of sets) c[familyOf(s)] += 1
    return c
  }, [sets])

  // With only one family present there is nothing to switch between — don't show the control.
  // TODO(UK-2): for a tenant admin with no composer sets, this is the normal case.
  const showFamilySwitch = counts.tenant > 0 && counts.composer > 0

  const inFamily = useMemo(
    () => (showFamilySwitch ? sets.filter((s) => familyOf(s) === family) : sets),
    [sets, family, showFamilySwitch],
  )

  if (!active) return null

  function select(id: string) {
    if (id === active!.id) return
    // Strip stale filter params when switching sets — start clean (unchanged behaviour).
    const next = new URLSearchParams()
    next.set('set', id)
    router.push(`${pathname}?${next.toString()}`)
  }

  const showSearch = inFamily.length > 6
  const visible =
    showSearch && search.trim()
      ? inFamily.filter((s) => s.label.toLowerCase().includes(search.trim().toLowerCase()))
      : inFamily
  const activeFamilyMeta = SET_FAMILIES.find((f) => f.value === family)

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
        width={300}
        radius="md"
        shadow="md"
        withinPortal
        opened={menuOpen}
        onChange={(open) => {
          setMenuOpen(open)
          if (!open) setSearch('')
        }}
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
            {activeFamilyValue === 'composer' && <FamilyChip />}
            <Text fw={600} style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
              {active.label}
            </Text>
            <StatusBadge status={active.status} />
            <Caret open={menuOpen} />
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          {showFamilySwitch && (
            <Box px={6} pt={6} pb={2}>
              <Box
                style={{
                  display: 'flex',
                  gap: 2,
                  padding: 3,
                  background: 'var(--mantine-color-gray-1)',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              >
                {SET_FAMILIES.map((f) => {
                  const on = f.value === family
                  return (
                    <UnstyledButton
                      key={f.value}
                      title={f.hint}
                      aria-pressed={on}
                      onClick={(e) => {
                        // Switching scope must not close the menu or select anything.
                        e.stopPropagation()
                        setFamily(f.value)
                        setSearch('')
                      }}
                      style={{
                        flex: 1,
                        height: 26,
                        borderRadius: 'calc(var(--mantine-radius-sm) - 1px)',
                        textAlign: 'center',
                        fontSize: 12.5,
                        fontWeight: on ? 600 : 500,
                        background: on ? '#fff' : 'transparent',
                        color: on ? 'var(--mantine-color-text)' : 'var(--mantine-color-dimmed)',
                        boxShadow: on ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                      }}
                    >
                      {f.label}
                    </UnstyledButton>
                  )
                })}
              </Box>
              <Text size="xs" c="dimmed" mt={6} mb={2} style={{ lineHeight: 1.45 }}>
                {activeFamilyMeta?.hint}
              </Text>
            </Box>
          )}

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
                <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                  {s.label}
                </Text>
                <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <Text ff="monospace" size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    v{s.version}
                  </Text>
                  <StatusBadge status={s.status} />
                  <span style={{ width: 14, display: 'inline-flex' }}>
                    {s.id === active.id ? <Check /> : null}
                  </span>
                </Group>
              </Group>
            </Menu.Item>
          ))}

          {visible.length === 0 && (
            <Text c="dimmed" size="sm" ta="center" py="sm">
              No {activeFamilyMeta?.label ?? ''} prompt sets{search.trim() ? ' match.' : ' yet.'}
            </Text>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
