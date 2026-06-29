'use client'

// Platform · Settings — two collapsible Accordion sections:
//   1. System Prompt — cross-tenant picker that marks one prompt set as the
//      platform-wide system prompt. The page owns the pending selection + Save.
//   2. Tenant Prompts — the cross-tenant PromptSetList (scope="platform").
// Route: /platform/settings
//
// TODO: replace OPTIONS/MASTER_ID/SET_META with the live prompt-set query + the
// current master-prompt pointer, and wire save() to PUT the new pointer.

import { useState } from 'react'
import { Accordion, Button, Group, Stack, Text, Title } from '@mantine/core'
import { PROMPT_SETS, TENANTS } from '@/components/admin/lib/fixtures'
import { StatusBadge } from '@/components/admin/lib/badges'
import { accentMix } from '@/components/admin/theme/mantine-theme'
import { notify } from '@/components/admin/lib/primitives'
import { fmtDate } from '@/components/admin/lib/types'
import type { MasterPromptOption } from '@/components/admin/lib/types'
import { PromptSetList } from '@/components/admin/prompt-sets/PromptSetList'
import { SystemPromptPicker } from './SystemPromptPicker'

const tenantName = (tid: string) => TENANTS.find((t) => t.id === tid)?.name || tid
const OPTIONS: MasterPromptOption[] = PROMPT_SETS.map((s) => ({
  id: s.id, label: s.label, tenantName: tenantName(s.tenant_id), status: s.status, version: s.version,
}))
const MASTER_ID = PROMPT_SETS.find((s) => s.is_master)?.id ?? null
const SET_META = { byName: 'Jeff Lougheed', at: '2026-06-14T09:40:00' }

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Stack gap={2}>
      <Text fw={600} fz="md">{title}</Text>
      {subtitle && <Text c="dimmed" size="sm">{subtitle}</Text>}
    </Stack>
  )
}

function SystemPromptPanel() {
  const [pending, setPending] = useState<string | null>(MASTER_ID)
  const current = OPTIONS.find((o) => o.id === MASTER_ID) ?? null
  const dirty = pending !== MASTER_ID
  const save = () => {
    const s = OPTIONS.find((o) => o.id === pending)
    notify({ color: 'green', title: 'System prompt updated', message: s ? `${s.label} — ${s.tenantName}` : 'Saved.' })
  }
  return (
    <Stack gap="md" pt={4}>
      <Text c="dimmed" size="sm">
        The system prompt that powers every tenant&rsquo;s Composer when building blocks. The set you mark here is compiled and sent as the system prompt platform-wide.
      </Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 12px', padding: '12px 14px', background: accentMix(7), border: `1px solid ${accentMix(22)}`, borderRadius: 'var(--mantine-radius-md)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--mantine-color-brand-6)', boxShadow: `0 0 0 3px ${accentMix(18, 'transparent')}`, flex: '0 0 auto' }} />
        {current ? (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Text size="sm" c="dimmed">Current system prompt</Text>
            <Text size="sm" c="dimmed">·</Text>
            <Text size="sm" fw={600}>{current.label}</Text>
            <Text size="sm" c="dimmed">{current.tenantName}</Text>
            <StatusBadge status={current.status} />
          </span>
        ) : (
          <Text size="sm" c="dimmed">No system prompt set yet</Text>
        )}
        <Text style={{ marginLeft: 'auto', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: 'var(--mantine-color-gray-5)', whiteSpace: 'nowrap' }}>
          Set by {SET_META.byName} · {fmtDate(SET_META.at)}
        </Text>
      </div>
      <SystemPromptPicker options={OPTIONS} selectedId={pending} masterId={MASTER_ID} onSelect={setPending} />
      <Group gap="sm" align="center">
        <Button color="green" disabled={!dirty} onClick={save}>Save</Button>
        {dirty && <Button variant="subtle" color="gray" onClick={() => setPending(MASTER_ID)}>Cancel</Button>}
        {dirty && <Text size="sm" c="dimmed">Unsaved change</Text>}
      </Group>
    </Stack>
  )
}

export default function PlatformSettingsPage() {
  return (
    <Stack gap="lg" data-screen-label="Platform · Settings">
      <Stack gap={4}>
        <Title order={1} size="h2">Settings</Title>
        <Text c="dimmed">Platform-wide configuration.</Text>
      </Stack>
      <Accordion multiple defaultValue={['system-prompt', 'tenant-prompts']} variant="separated" radius="md" chevronPosition="right">
        <Accordion.Item value="system-prompt">
          <Accordion.Control><SectionHeading title="System Prompt" subtitle="The prompt set sent as the platform-wide system prompt." /></Accordion.Control>
          <Accordion.Panel><SystemPromptPanel /></Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="tenant-prompts">
          <Accordion.Control><SectionHeading title="Tenant Prompts" /></Accordion.Control>
          <Accordion.Panel><PromptSetList scope="platform" /></Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  )
}
