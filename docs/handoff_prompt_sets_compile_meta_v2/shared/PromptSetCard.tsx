'use client'

// PromptSetCard — the SINGLE source of truth for how a prompt-set renders, used by
// BOTH surfaces so they can never drift again:
//   • Tenant Settings → Prompt Sets   (app/admin/settings/PromptSets.tsx)
//   • Platform Settings → Tenant Prompts (app/(platform)/platform/settings/TenantPrompts.tsx)
//
// Actions are opt-in: pass only the handlers a surface supports. The tenant surface
// passes all of them; the platform surface passes the same set (it has full CRUD in
// the approved design — see handover §6). `tenantName` adds the leading "Tenant" meta
// row on the platform surface.
//
// Drop at: components/admin/settings/PromptSetCard.tsx

import { ActionIcon, Alert, Badge, Button, Card, Group, Stack } from '@mantine/core'
import { IconAlertTriangle, IconEye, IconPencil, IconTrash, IconWand } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { type PromptSet, formatDate, isStale } from '@/lib/promptSet'

export function StatusBadge({ status }: { status: PromptSet['status'] }) {
  return status === 'live' ? (
    <Badge color="green" variant="light" radius="sm">
      Live
    </Badge>
  ) : (
    <Badge color="yellow" variant="light" radius="sm">
      Draft
    </Badge>
  )
}

export function PromptSetBadges({ set, typeName }: { set: PromptSet; typeName: string | null }) {
  return (
    <Group gap={6} wrap="wrap">
      <StatusBadge status={set.status} />
      {set.is_composer_prompt && (
        <Badge color="green" variant="filled" radius="sm">
          Composer
        </Badge>
      )}
      {typeName && (
        <Badge color="gray" variant="light" radius="sm">
          {typeName}
        </Badge>
      )}
      {isStale(set) && (
        <Badge color="yellow" variant="filled" radius="sm" leftSection={<IconAlertTriangle size={11} />}>
          Stale
        </Badge>
      )}
    </Group>
  )
}

export function PromptSetMetaStrip({
  set,
  isNew,
  tenantName,
}: {
  set?: PromptSet
  isNew?: boolean
  tenantName?: string
}) {
  const dim = (s: string) => (
    <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
      {s}
    </Text>
  )
  const body = (s: string) => (
    <Text variant="body" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
      {s}
    </Text>
  )
  const mono = (s: string) => (
    <Text
      variant="body"
      style={{
        fontSize: 'var(--mantine-font-size-sm)',
        fontFamily: 'var(--mantine-font-family-monospace)',
        wordBreak: 'break-all',
      }}
    >
      {s}
    </Text>
  )

  return (
    <Card withBorder radius="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Stack gap={6}>
        {tenantName && <MetaRow label="Tenant" value={<Text variant="label" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{tenantName}</Text>} />}
        <MetaRow
          label="Version"
          value={
            <Group gap={6} wrap="wrap" align="baseline">
              {mono(`v${set?.version ?? 1}`)}
              {dim('· auto-increments on compile')}
            </Group>
          }
        />
        <MetaRow
          label="Composer"
          value={
            set?.is_composer_prompt ? (
              <Badge color="green" variant="filled" radius="sm">
                Composer
              </Badge>
            ) : (
              dim('—')
            )
          }
        />
        <MetaRow label="Blocks" value={isNew ? dim('on compile') : body(String(set?.block_count ?? 0))} />
        <MetaRow
          label="Last compiled"
          value={isNew ? dim('on compile') : set?.last_compiled_at ? body(formatDate(set.last_compiled_at)) : dim('Never compiled')}
        />
        <MetaRow
          label="Compiled version"
          value={
            isNew ? (
              dim('on compile')
            ) : set?.compiled_version != null ? (
              <Group gap={6} wrap="wrap" align="baseline">
                {mono(`v${set.compiled_version}`)}
                {set && isStale(set) ? dim('· out of date') : null}
              </Group>
            ) : (
              dim('—')
            )
          }
        />
        <MetaRow label="ID" value={isNew ? dim('generated on save') : mono(set?.id ?? '')} />
        <MetaRow label="Tenant ID" value={isNew ? dim('from session') : mono(set?.tenant_id ?? '')} />
        <MetaRow label="Created" value={isNew ? dim('on save') : body(set ? formatDate(set.created_at) : '—')} />
        <MetaRow label="Updated" value={isNew ? dim('on save') : body(set ? formatDate(set.updated_at) : '—')} />
      </Stack>
    </Card>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="wrap" align="baseline">
      <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', minWidth: 96 }}>
        {label}
      </Text>
      <div style={{ flex: 1, minWidth: 0 }}>{value}</div>
    </Group>
  )
}

// The full view card. Every action is optional — render only what a surface supports.
export function PromptSetViewCard({
  set,
  typeName,
  tenantName,
  onOpenInComposer,
  onView,
  onEdit,
  onDelete,
}: {
  set: PromptSet
  typeName: string | null
  tenantName?: string
  onOpenInComposer?: () => void
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
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
            <PromptSetBadges set={set} typeName={typeName} />
          </Group>
          <Group gap={8} align="center" wrap="nowrap">
            {onOpenInComposer && (
              <Button
                variant="default"
                size="compact-sm"
                color="green"
                leftSection={<IconWand size={14} />}
                onClick={onOpenInComposer}
              >
                Open in Composer
              </Button>
            )}
            <Group gap={4} wrap="nowrap">
              {onView && (
                <ActionIcon variant="subtle" color="gray" size="md" onClick={onView} aria-label={`View compiled prompt for ${set.label}`}>
                  <IconEye size={16} />
                </ActionIcon>
              )}
              {onEdit && (
                <ActionIcon variant="subtle" color="gray" size="md" onClick={onEdit} aria-label={`Edit ${set.label}`}>
                  <IconPencil size={16} />
                </ActionIcon>
              )}
              {onDelete && (
                <ActionIcon variant="subtle" color="red" size="md" onClick={onDelete} aria-label={`Delete ${set.label}`}>
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          </Group>
        </Group>

        {set.description && (
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
            {set.description}
          </Text>
        )}

        {isStale(set) && (
          <Alert color="yellow" variant="light" radius="sm" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
              Edited since last compile — recompile to apply changes.
            </Text>
          </Alert>
        )}

        <PromptSetMetaStrip set={set} tenantName={tenantName} />
      </Stack>
    </Card>
  )
}
