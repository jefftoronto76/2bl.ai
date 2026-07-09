'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Box,
  Button,
  Chip,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'

import {
  IconCheck,
  IconChevronsDown,
  IconChevronsUp,
  IconFilter,
  IconPlus,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import {
  ORDERED_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  type BlockType,
} from '@/services/prompt/block-types'
import type { TypeFilter, StatusFilter } from '@/components/admin/content/useBlocksFilters'

// ── Flip this constant to compare the three filter presentations. ──────────
export const FILTER_LAYOUT: 'bar' | 'rail' | 'popover' = 'bar'

// ── Shared types ────────────────────────────────────────────────────────────

export interface FilterState {
  query: string
  setQuery: (v: string) => void
  typeFilter: TypeFilter
  setTypeFilter: (v: TypeFilter) => void
  statusFilter: StatusFilter
  setStatusFilter: (v: StatusFilter) => void
}

export type TypeCounts = Partial<Record<BlockType, number>>
export interface StatusCounts { active: number; disabled: number }

// ── Tint helpers — CSS var based, no hardcoded hex ──────────────────────────

function typeTint(type: BlockType) {
  const c = TYPE_COLORS[type]
  return {
    bg: `var(--mantine-color-${c}-1)`,
    fg: `var(--mantine-color-${c}-8)`,
    solid: `var(--mantine-color-${c}-6)`,
    border: `var(--mantine-color-${c}-3)`,
  }
}

function statusTint(s: 'active' | 'disabled') {
  return s === 'active'
    ? {
        bg: 'var(--mantine-color-green-1)',
        fg: 'var(--mantine-color-green-8)',
        solid: 'var(--mantine-color-green-6)',
        border: 'var(--mantine-color-green-3)',
      }
    : {
        bg: 'var(--mantine-color-gray-1)',
        fg: 'var(--mantine-color-gray-7)',
        solid: 'var(--mantine-color-gray-5)',
        border: 'var(--mantine-color-gray-3)',
      }
}

// ── FilterToken — removable tinted pill (bar + popover) ─────────────────────

export interface FilterTokenProps {
  tint: ReturnType<typeof typeTint>
  label: string
  onClear: () => void
}

export function FilterToken({ tint, label, onClear }: FilterTokenProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 4px 0 9px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        border: `1px solid ${tint.border}`,
        background: tint.bg,
        color: tint.fg,
        flex: '0 0 auto',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: tint.solid,
          flexShrink: 0,
        }}
      />
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 17,
          height: 17,
          border: 'none',
          background: 'transparent',
          borderRadius: 999,
          color: 'currentColor',
          opacity: 0.7,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <IconX size={11} />
      </button>
    </span>
  )
}

// ── SearchField — TextInput with clear X (rail + popover) ───────────────────

export interface SearchFieldProps {
  f: FilterState
  placeholder?: string
}

export function SearchField({ f, placeholder = 'Search blocks' }: SearchFieldProps) {
  return (
    <TextInput
      value={f.query}
      onChange={(e) => f.setQuery(e.currentTarget.value)}
      placeholder={placeholder}
      size="sm"
      style={{ flex: '1 1 280px' }}
      leftSection={<IconSearch size={14} />}
      rightSection={
        f.query
          ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => f.setQuery('')}
              aria-label="Clear search"
            >
              <IconX size={12} />
            </ActionIcon>
          )
          : null
      }
    />
  )
}

// ── ResultMeta — filtered/total counter + expand all/collapse all ────────────

export interface ResultMetaProps {
  filteredCount: number
  totalCount: number
  allExpanded: boolean
  onToggleExpand: () => void
}

export function ResultMeta({ filteredCount, totalCount, allExpanded, onToggleExpand }: ResultMetaProps) {
  return (
    <Group gap="sm" align="center">
      <Text
        c="dimmed"
        size="sm"
        style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
      >
        {filteredCount} / {totalCount}
      </Text>
      <Button
        variant="subtle"
        color="gray"
        size="xs"
        leftSection={allExpanded ? <IconChevronsUp size={14} /> : <IconChevronsDown size={14} />}
        onClick={onToggleExpand}
      >
        {allExpanded ? 'Collapse all' : 'Expand all'}
      </Button>
    </Group>
  )
}

// ── FilterBar — unified search pill with inline tokens + "+ Filter" popover ─

interface MenuItemProps {
  active: boolean
  dot?: string
  label: string
  count: number
  onClick: () => void
}

function PopoverMenuItem({ active, dot, label, count, onClick }: MenuItemProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        textAlign: 'left',
        border: 'none',
        borderRadius: 'var(--mantine-radius-sm)',
        padding: '7px 8px',
        fontSize: 13.5,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: active
          ? 'var(--mantine-color-green-0)'
          : hovered
          ? 'var(--mantine-color-gray-1)'
          : 'transparent',
        color: active ? 'var(--mantine-color-green-8)' : 'var(--mantine-color-text)',
      }}
    >
      {dot && (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: dot,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ flex: '1 1 auto' }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 11,
          color: active ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-dimmed)',
        }}
      >
        {count}
      </span>
      {active && (
        <IconCheck size={13} style={{ color: 'var(--mantine-color-green-7)' }} />
      )}
    </button>
  )
}

export interface FilterBarProps {
  f: FilterState
  typeCounts: TypeCounts
  statusCounts: StatusCounts
}

export function FilterBar({ f, typeCounts, statusCounts }: FilterBarProps) {
  const [pop, setPop] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || popoverRef.current?.contains(t)) return
      setPop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pop])

  const hasFilter = f.typeFilter !== 'all' || f.statusFilter !== 'all'

  return (
    <div style={{ flex: '1 1 420px', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 42,
          padding: '6px 6px 6px 13px',
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-md)',
          background: '#fff',
          flexWrap: 'wrap',
        }}
      >
        <IconSearch size={15} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />

        {f.typeFilter !== 'all' && (
          <FilterToken
            tint={typeTint(f.typeFilter)}
            label={TYPE_LABELS[f.typeFilter]}
            onClear={() => f.setTypeFilter('all')}
          />
        )}

        {f.statusFilter !== 'all' && (
          <FilterToken
            tint={statusTint(f.statusFilter)}
            label={f.statusFilter === 'active' ? 'Active' : 'Disabled'}
            onClear={() => f.setStatusFilter('all')}
          />
        )}

        <input
          value={f.query}
          onChange={(e) => f.setQuery(e.currentTarget.value)}
          placeholder={hasFilter ? 'Search…' : 'Search blocks by title or content'}
          style={{
            flex: '1 1 160px',
            minWidth: 110,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 14,
            height: 28,
            fontFamily: 'inherit',
            color: 'var(--mantine-color-text)',
          }}
        />

        {f.query && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => f.setQuery('')}
            aria-label="Clear search"
          >
            <IconX size={13} />
          </ActionIcon>
        )}

        {/* + Filter button + popover */}
        <div ref={containerRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setPop((o) => !o)}
            aria-expanded={pop}
            aria-haspopup="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 30,
              padding: '0 12px',
              border: '1px dashed var(--mantine-color-gray-4)',
              borderRadius: 999,
              background: pop ? 'var(--mantine-color-gray-1)' : 'var(--mantine-color-body)',
              color: 'var(--mantine-color-gray-7)',
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <IconPlus size={14} />
            Filter
          </button>

          {pop && (
            <div
              ref={popoverRef}
              role="menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 30,
                minWidth: 236,
                background: 'var(--mantine-color-body)',
                border: '1px solid var(--mantine-color-gray-3)',
                borderRadius: 'var(--mantine-radius-sm)',
                boxShadow: 'var(--mantine-shadow-md)',
                padding: 6,
              }}
            >
              <Text
                tt="uppercase"
                size="xs"
                c="dimmed"
                fw={600}
                px={8}
                py={4}
                style={{
                  letterSpacing: '0.12em',
                  fontFamily: 'var(--mantine-font-family-monospace)',
                }}
              >
                Type
              </Text>

              {ORDERED_TYPES.map((t) => (
                <PopoverMenuItem
                  key={t}
                  active={f.typeFilter === t}
                  dot={`var(--mantine-color-${TYPE_COLORS[t]}-6)`}
                  label={TYPE_LABELS[t]}
                  count={typeCounts[t] ?? 0}
                  onClick={() => { f.setTypeFilter(f.typeFilter === t ? 'all' : t); setPop(false) }}
                />
              ))}

              <Box mt={4} pt={6} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                <Text
                  tt="uppercase"
                  size="xs"
                  c="dimmed"
                  fw={600}
                  px={8}
                  py={4}
                  style={{
                    letterSpacing: '0.12em',
                    fontFamily: 'var(--mantine-font-family-monospace)',
                  }}
                >
                  Status
                </Text>

                {(['active', 'disabled'] as const).map((s) => (
                  <PopoverMenuItem
                    key={s}
                    active={f.statusFilter === s}
                    dot={statusTint(s).solid}
                    label={s === 'active' ? 'Active' : 'Disabled'}
                    count={statusCounts[s] ?? 0}
                    onClick={() => { f.setStatusFilter(f.statusFilter === s ? 'all' : s); setPop(false) }}
                  />
                ))}
              </Box>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── FilterRail — 208px sticky sidebar with faceted type + status lists ───────

export interface FilterRailProps {
  f: FilterState
  typeCounts: TypeCounts
  statusCounts: StatusCounts
  total: number
}

interface RailOptionProps {
  on: boolean
  dot?: string
  name: string
  count: number
  onClick: () => void
}

function RailOption({ on, dot, name, count, onClick }: RailOptionProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        textAlign: 'left',
        border: 'none',
        borderRadius: 'var(--mantine-radius-sm)',
        padding: 8,
        fontSize: 13.5,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: on
          ? 'var(--mantine-color-green-0)'
          : hovered
          ? 'var(--mantine-color-gray-1)'
          : 'transparent',
        color: on ? 'var(--mantine-color-green-8)' : 'var(--mantine-color-gray-7)',
        fontWeight: on ? 600 : 400,
      }}
    >
      {dot && (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: dot,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>{name}</span>
      <span
        style={{
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 11,
          color: on ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-dimmed)',
        }}
      >
        {count}
      </span>
    </button>
  )
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      tt="uppercase"
      size="xs"
      c="dimmed"
      fw={600}
      px={8}
      pb={6}
      style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}
    >
      {children}
    </Text>
  )
}

export function FilterRail({ f, typeCounts, statusCounts, total }: FilterRailProps) {
  return (
    <Box style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <RailLabel>Type</RailLabel>
        <RailOption
          on={f.typeFilter === 'all'}
          name="All types"
          count={total}
          onClick={() => f.setTypeFilter('all')}
        />
        {ORDERED_TYPES.map((t) => (
          <RailOption
            key={t}
            on={f.typeFilter === t}
            dot={`var(--mantine-color-${TYPE_COLORS[t]}-6)`}
            name={TYPE_LABELS[t]}
            count={typeCounts[t] ?? 0}
            onClick={() => f.setTypeFilter(f.typeFilter === t ? 'all' : t)}
          />
        ))}
      </div>

      <div>
        <RailLabel>Status</RailLabel>
        <RailOption
          on={f.statusFilter === 'all'}
          name="All"
          count={total}
          onClick={() => f.setStatusFilter('all')}
        />
        <RailOption
          on={f.statusFilter === 'active'}
          dot="var(--mantine-color-green-6)"
          name="Active"
          count={statusCounts.active}
          onClick={() => f.setStatusFilter(f.statusFilter === 'active' ? 'all' : 'active')}
        />
        <RailOption
          on={f.statusFilter === 'disabled'}
          dot="var(--mantine-color-gray-5)"
          name="Disabled"
          count={statusCounts.disabled}
          onClick={() => f.setStatusFilter(f.statusFilter === 'disabled' ? 'all' : 'disabled')}
        />
      </div>
    </Box>
  )
}

// ── FilterPopover — slim search + Filters button with active-count badge ─────

export interface FilterPopoverProps {
  f: FilterState
  typeCounts: TypeCounts
  statusCounts: StatusCounts
}

export function FilterPopover({ f, typeCounts, statusCounts }: FilterPopoverProps) {
  const [pop, setPop] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || popoverRef.current?.contains(t)) return
      setPop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pop])

  const activeCount =
    (f.typeFilter !== 'all' ? 1 : 0) + (f.statusFilter !== 'all' ? 1 : 0)

  return (
    <Group gap="sm" align="center" wrap="wrap" style={{ flex: '1 1 auto' }}>
      <SearchField f={f} />

      <div ref={containerRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setPop((o) => !o)}
          aria-expanded={pop}
          aria-haspopup="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 36,
            padding: '0 14px',
            border: `1px solid ${activeCount > 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-3)'}`,
            borderRadius: 'var(--mantine-radius-sm)',
            background: pop ? 'var(--mantine-color-gray-1)' : 'var(--mantine-color-body)',
            color: activeCount > 0 ? 'var(--mantine-color-green-8)' : 'var(--mantine-color-gray-7)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <IconFilter size={14} />
          Filters
          {activeCount > 0 && (
            <span
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 999,
                background: 'var(--mantine-color-green-6)',
                color: 'var(--mantine-color-white)',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--mantine-font-family-monospace)',
              }}
            >
              {activeCount}
            </span>
          )}
        </button>

        {pop && (
          <div
            ref={popoverRef}
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              zIndex: 30,
              width: 330,
              maxWidth: '90vw',
              background: 'var(--mantine-color-body)',
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: 'var(--mantine-radius-md)',
              boxShadow: 'var(--mantine-shadow-md)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div>
              <Text
                tt="uppercase"
                size="xs"
                c="dimmed"
                fw={600}
                mb={8}
                style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}
              >
                Type
              </Text>
              <Chip.Group
                value={f.typeFilter}
                onChange={(v) => f.setTypeFilter(v as TypeFilter)}
              >
                <Group gap={6} wrap="wrap">
                  <Chip value="all" size="sm" variant="light">All</Chip>
                  {ORDERED_TYPES.map((t) => (
                    <Chip key={t} value={t} size="sm" variant="light" color={TYPE_COLORS[t]}>
                      {TYPE_LABELS[t]}{' '}
                      <span
                        style={{
                          fontFamily: 'var(--mantine-font-family-monospace)',
                          fontSize: 10.5,
                          opacity: 0.7,
                          marginLeft: 2,
                        }}
                      >
                        {typeCounts[t] ?? 0}
                      </span>
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>

            <div>
              <Text
                tt="uppercase"
                size="xs"
                c="dimmed"
                fw={600}
                mb={8}
                style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}
              >
                Status
              </Text>
              <Chip.Group
                value={f.statusFilter}
                onChange={(v) => f.setStatusFilter(v as StatusFilter)}
              >
                <Group gap={6} wrap="wrap">
                  <Chip value="all" size="sm" variant="light">All</Chip>
                  <Chip value="active" size="sm" variant="light" color="green">
                    Active{' '}
                    <span
                      style={{
                        fontFamily: 'var(--mantine-font-family-monospace)',
                        fontSize: 10.5,
                        opacity: 0.7,
                        marginLeft: 2,
                      }}
                    >
                      {statusCounts.active}
                    </span>
                  </Chip>
                  <Chip value="disabled" size="sm" variant="light" color="gray">
                    Disabled{' '}
                    <span
                      style={{
                        fontFamily: 'var(--mantine-font-family-monospace)',
                        fontSize: 10.5,
                        opacity: 0.7,
                        marginLeft: 2,
                      }}
                    >
                      {statusCounts.disabled}
                    </span>
                  </Chip>
                </Group>
              </Chip.Group>
            </div>

            {activeCount > 0 && (
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                w="fit-content"
                px={0}
                onClick={() => { f.setTypeFilter('all'); f.setStatusFilter('all') }}
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}
      </div>

      {f.typeFilter !== 'all' && (
        <FilterToken
          tint={typeTint(f.typeFilter)}
          label={TYPE_LABELS[f.typeFilter]}
          onClear={() => f.setTypeFilter('all')}
        />
      )}
      {f.statusFilter !== 'all' && (
        <FilterToken
          tint={statusTint(f.statusFilter)}
          label={f.statusFilter === 'active' ? 'Active' : 'Disabled'}
          onClear={() => f.setStatusFilter('all')}
        />
      )}
    </Group>
  )
}
