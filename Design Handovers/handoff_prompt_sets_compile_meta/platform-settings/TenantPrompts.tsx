'use client'

// TenantPrompts — NEW section for Platform Settings (app/(platform)/platform/settings).
// Today the platform Settings page has ONE card (Master Prompt picker). This adds a
// second card: every prompt set across every tenant, pulled live and grouped by tenant
// — the read/observability counterpart to the Master Prompt write surface.
//
// Scope: READ + "view compiled prompt". Create/edit/delete stay on the tenant surface
// (app/admin/settings/PromptSets.tsx); the platform Master Prompt picker owns is_composer
// selection. If platform-wide CRUD is wanted later, the tenant edit card can be lifted
// into a shared module — see handover §6 (open question).
//
// Data: GET /api/platform/prompt-sets (extended to PlatformPromptSet[] with tenant_name
// + the derived compile metadata — see api/platform.prompt-sets.route.ts in this bundle).

import { useEffect, useMemo, useState } from 'react'
import { Badge, Card, Group, Skeleton, Stack, Text as MantineText, TextInput } from '@mantine/core'
import { ActionIcon, Alert } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconEye, IconSearch } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { CompiledPromptModal } from '@/components/admin/settings/CompiledPromptModal'
import { type PlatformPromptSet, formatDate, isStale } from '@/lib/promptSet'

export function TenantPrompts() {
  const [sets, setSets] = useState<PlatformPromptSet[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [viewTarget, setViewTarget] = useState<PlatformPromptSet | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/platform/prompt-sets')
        if (cancelled) return
        if (!res.ok) {
          notifications.show({ color: 'red', title: 'Failed to load', message: 'Could not load prompt sets.' })
          return
        }
        setSets(await res.json())
      } catch (err) {
        if (!cancelled) {
          console.error('[TenantPrompts] fetch failed:', err)
          notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sets
    return sets.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        s.tenant_name.toLowerCase().includes(q),
    )
  }, [sets, query])

  // Group by tenant, preserving tenant-name order.
  const groups = useMemo(() => {
    const byTenant = new Map<string, PlatformPromptSet[]>()
    for (const s of filtered) {
      const list = byTenant.get(s.tenant_name) ?? []
      list.push(s)
      byTenant.set(s.tenant_name, list)
    }
    return [...byTenant.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <Stack gap="md">
      <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
        Every prompt set in the database, across all tenants — pulled live, grouped by tenant.
      </Text>

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder="Search prompt set, description, or tenant…"
        leftSection={<IconSearch size={15} />}
        size="sm"
      />

      {loading ? (
        <Stack gap="sm">
          <Skeleton height={130} radius="md" />
          <Skeleton height={130} radius="md" />
        </Stack>
      ) : groups.length === 0 ? (
        <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          {query ? 'No prompt sets match your search.' : 'No prompt sets in the database yet.'}
        </Text>
      ) : (
        groups.map(([tenantName, list]) => (
          <Stack key={tenantName} gap="xs">
            <Group justify="space-between" align="baseline">
              <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
                {tenantName}
              </Text>
              <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)' }}>
                {list.length} {list.length === 1 ? 'set' : 'sets'}
              </Text>
            </Group>
            <Stack gap="sm">
              {list.map((set) => (
                <PlatformPromptSetCard key={set.id} set={set} onView={() => setViewTarget(set)} />
              ))}
            </Stack>
          </Stack>
        ))
      )}

      {viewTarget && (
        <CompiledPromptModal
          set={viewTarget}
          compiledUrl={`/api/platform/prompt-sets/${encodeURIComponent(viewTarget.id)}/compiled`}
          opened={viewTarget !== null}
          onClose={() => setViewTarget(null)}
        />
      )}
    </Stack>
  )
}

// Read-only card: same visual vocabulary as the tenant view card, minus edit/delete.
function PlatformPromptSetCard({ set, onView }: { set: PlatformPromptSet; onView: () => void }) {
  const stale = isStale(set)
  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
          <Group gap="sm" align="center" wrap="wrap" style={{ minWidth: 0 }}>
            <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-md)' }}>
              {set.label}
            </Text>
            <Text
              variant="muted"
              style={{ fontSize: 'var(--mantine-font-size-xs)', fontFamily: 'var(--mantine-font-family-monospace)' }}
            >
              v{set.version}
            </Text>
            <Group gap={6} wrap="wrap">
              <Badge color={set.status === 'live' ? 'green' : 'yellow'} variant="light" radius="sm">
                {set.status === 'live' ? 'Live' : 'Draft'}
              </Badge>
              {set.is_composer_prompt && (
                <Badge color="green" variant="filled" radius="sm">
                  Composer
                </Badge>
              )}
              {stale && (
                <Badge color="yellow" variant="filled" radius="sm" leftSection={<IconAlertTriangle size={11} />}>
                  Stale
                </Badge>
              )}
            </Group>
          </Group>
          <ActionIcon variant="subtle" color="gray" size="md" onClick={onView} aria-label={`View compiled prompt for ${set.label}`}>
            <IconEye size={16} />
          </ActionIcon>
        </Group>

        {set.description && (
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
            {set.description}
          </Text>
        )}

        {stale && (
          <Alert color="yellow" variant="light" radius="sm" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
              Edited since last compile — recompile to apply changes.
            </Text>
          </Alert>
        )}

        <Card withBorder radius="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Group gap="xl" wrap="wrap">
            <Meta label="Blocks" value={String(set.block_count ?? 0)} />
            <Meta label="Last compiled" value={set.last_compiled_at ? formatDate(set.last_compiled_at) : 'Never compiled'} />
            <Meta label="Compiled version" value={set.compiled_version != null ? `v${set.compiled_version}` : '—'} mono />
          </Group>
        </Card>
      </Stack>
    </Card>
  )
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Group gap={6} align="baseline">
      <MantineText c="dimmed" size="xs">
        {label}
      </MantineText>
      <MantineText
        size="sm"
        style={mono ? { fontFamily: 'var(--mantine-font-family-monospace)' } : undefined}
      >
        {value}
      </MantineText>
    </Group>
  )
}
