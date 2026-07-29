'use client'

// PromptSetSelect — the prompt-set picker shared by two surfaces: the Blocks
// screen's "Current Prompt Set" header control and the Composer's "Building
// in" top-bar control. One component, one family-switch mechanism — this
// used to be two separate implementations (components/admin/prompt-builder/
// PromptSetPicker.tsx duplicated this one in plain CSS Modules); that copy is
// retired in favor of this one, generalized via props rather than forked.
//
// July 2026: prompt sets belong to one of two FAMILIES and the screen shows
// one at a time.
//   'tenant'   — 2bl.ai prompt sets: the assistants a tenant ships to its own users.
//   'composer' — the prompt that powers the Composer AI itself (the tool you're standing in).
//
// The distinction is deliberately quiet: a scope switch INSIDE this dropdown,
// plus a small chip on the trigger when a composer set is active. No new
// screen chrome — most sessions never leave 'tenant', and the marker should
// cost them nothing.
//
// Browsing the other family does not change the screen; only picking a set
// acts (navigates, on Blocks; sets local state, on the Composer).
//
// Two things vary by caller, both optional so Blocks' existing usage is
// untouched:
//   - `onSelect`: when absent, picking a set navigates via `?set=<id>`
//     (Blocks' behavior). When supplied (the Composer), it's called instead —
//     no navigation happens.
//   - `onCreate` (+ `promptTypes`): when supplied (the Composer), an inline
//     "New prompt set…" form renders at the bottom of the dropdown. Absent on
//     Blocks — creation lives on the Settings screen there.

import { useEffect, useMemo, useState } from 'react'
import { Badge, Box, Button, Group, Menu, Select, Text, Textarea, TextInput, UnstyledButton } from '@mantine/core'
import { IconPlus, IconSearch } from '@tabler/icons-react'
import { Text as MutedText } from '@/components/admin/primitives/Text'
import { usePathname, useRouter } from 'next/navigation'
import { resolveActiveSet, familyOf, SET_FAMILIES, type PromptSet, type PromptSetStatus, type SetFamily } from './promptSet'

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

export interface CreatePromptSetInput {
  label: string
  promptTypeId: string | null
  description: string
}

export interface PromptSetSelectProps {
  sets: PromptSet[]
  activeId: string
  /** Label above the trigger. Defaults to Blocks' copy. */
  label?: string
  /** Called instead of the default `?set=<id>` navigation, when supplied. */
  onSelect?: (id: string) => void
  /** Supplying this renders the inline "New prompt set…" form. */
  onCreate?: (input: CreatePromptSetInput) => void
  /** Options for the create form's optional Type field. */
  promptTypes?: { id: string; name: string }[]
}

const NO_TYPE = ''

export function PromptSetSelect({ sets, activeId, label, onSelect, onCreate, promptTypes = [] }: PromptSetSelectProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newTypeId, setNewTypeId] = useState(NO_TYPE)
  const [newDescription, setNewDescription] = useState('')
  const router = useRouter()
  const pathname = usePathname()

  const active = resolveActiveSet(sets, activeId)
  const activeFamilyValue: SetFamily = active ? familyOf(active) : 'tenant'

  // The scope you're BROWSING. Local state, not the URL — browsing is
  // transient, picking navigates. Reopening always returns you to the
  // family you're actually in.
  const [family, setFamily] = useState<SetFamily>(activeFamilyValue)

  useEffect(() => {
    if (menuOpen) setFamily(activeFamilyValue)
  }, [menuOpen, activeFamilyValue])

  const counts = useMemo(() => {
    const c: Record<SetFamily, number> = { tenant: 0, composer: 0 }
    for (const s of sets) c[familyOf(s)] += 1
    return c
  }, [sets])

  // With only one family present there is nothing to switch between — don't
  // show the control. The normal case for a tenant admin with no composer
  // sets in their tenant's own list.
  const showFamilySwitch = counts.tenant > 0 && counts.composer > 0

  const inFamily = useMemo(
    () => (showFamilySwitch ? sets.filter((s) => familyOf(s) === family) : sets),
    [sets, family, showFamilySwitch],
  )

  function resetCreate() {
    setCreating(false)
    setNewLabel('')
    setNewTypeId(NO_TYPE)
    setNewDescription('')
  }

  if (!active) return null

  function select(id: string) {
    if (id === active!.id) return
    if (onSelect) {
      onSelect(id)
      return
    }
    // Strip stale filter params when switching sets — start clean (unchanged behaviour).
    const next = new URLSearchParams()
    next.set('set', id)
    router.push(`${pathname}?${next.toString()}`)
  }

  function submitCreate() {
    const trimmed = newLabel.trim()
    if (!trimmed || !onCreate) return
    onCreate({ label: trimmed, promptTypeId: newTypeId || null, description: newDescription })
    resetCreate()
    setMenuOpen(false)
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
        {label ?? 'Current Prompt Set'}
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
          if (!open) {
            setSearch('')
            resetCreate()
          }
        }}
        closeOnItemClick={false}
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

          {showSearch && !creating && (
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

          {!creating &&
            visible.map((s) => (
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

          {!creating && visible.length === 0 && (
            <Text c="dimmed" size="sm" ta="center" py="sm">
              No {activeFamilyMeta?.label ?? ''} prompt sets{search.trim() ? ' match.' : ' yet.'}
            </Text>
          )}

          {onCreate && (
            <>
              <Box my={4} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }} />
              {creating ? (
                <Box px={8} py={6} onClick={(e) => e.stopPropagation()}>
                  <Text size="xs" fw={600} c="dimmed" mb={6}>
                    New prompt set
                  </Text>
                  <TextInput
                    data-autofocus
                    size="xs"
                    label="Name"
                    placeholder="e.g. Sage Base"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        resetCreate()
                      }
                    }}
                    mb={6}
                  />
                  <Select
                    size="xs"
                    label="Type"
                    placeholder="No type yet"
                    clearable
                    data={promptTypes.map((t) => ({ value: t.id, label: t.name }))}
                    value={newTypeId || null}
                    onChange={(value) => setNewTypeId(value ?? NO_TYPE)}
                    comboboxProps={{ withinPortal: true }}
                    mb={6}
                  />
                  <Textarea
                    size="xs"
                    label="Description"
                    placeholder="What this set is for…"
                    autosize
                    minRows={2}
                    maxRows={4}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.currentTarget.value)}
                    mb={8}
                  />
                  <Group gap="xs" justify="flex-end">
                    <Button variant="subtle" color="gray" size="xs" onClick={resetCreate}>
                      Cancel
                    </Button>
                    <Button size="xs" color="green" disabled={!newLabel.trim()} onClick={submitCreate}>
                      Create
                    </Button>
                  </Group>
                </Box>
              ) : (
                <Menu.Item leftSection={<IconPlus size={13} />} onClick={() => setCreating(true)}>
                  New prompt set…
                </Menu.Item>
              )}
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
