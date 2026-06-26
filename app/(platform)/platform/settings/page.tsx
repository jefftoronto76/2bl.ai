'use client'

// Platform Settings — Master Prompt. One screen, one field for now: a cross-tenant
// picker that marks one prompt set as the platform-wide master (is_master). This
// page owns all state: it fetches every prompt set across tenants + the current
// master pointer, holds the PENDING selection (defaults to the live master), and
// owns the Save call — nothing auto-saves. Rebuilt in Mantine per CLAUDE.md.

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { MasterPromptPicker } from './MasterPromptPicker'
import { type MasterPromptOption, type MasterPromptSetting, statusLabel } from './types'

export const dynamic = 'force-dynamic'

export default function PlatformSettingsPage() {
  const [options, setOptions] = useState<MasterPromptOption[]>([])
  const [master, setMaster] = useState<MasterPromptSetting>({ promptSetId: null })
  const [pending, setPending] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [optsRes, masterRes] = await Promise.all([
          fetch('/api/platform/prompt-sets'),
          fetch('/api/platform/settings/master-prompt'),
        ])
        if (cancelled) return
        if (optsRes.ok) setOptions(await optsRes.json())
        if (masterRes.ok) {
          const m: MasterPromptSetting = await masterRes.json()
          setMaster(m)
          setPending(m.promptSetId) // default the pending pick to the live master
        }
      } catch (err) {
        console.error('[PlatformSettings] load failed:', err)
        notifications.show({ color: 'red', title: 'Failed to load', message: 'Could not reach the server.' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const isEmpty = !loading && options.length === 0
  const dirty = pending !== master.promptSetId
  const current = options.find((o) => o.id === master.promptSetId) ?? null

  async function save() {
    if (!dirty || pending == null || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/platform/settings/master-prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptSetId: pending }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        notifications.show({
          color: 'red',
          title: 'Save failed',
          message: (data?.error as string) ?? 'Could not save. Try again.',
        })
        return
      }
      const saved: MasterPromptSetting = await res.json()
      setMaster(saved)
      setPending(saved.promptSetId)
      const savedSet = options.find((o) => o.id === saved.promptSetId)
      notifications.show({
        color: 'green',
        title: 'Master prompt updated',
        message: savedSet ? `${savedSet.label} — ${savedSet.tenantName}` : 'Saved.',
      })
    } catch (err) {
      console.error('[PlatformSettings] save failed:', err)
      notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' })
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setPending(master.promptSetId)
  }

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1} size="h2">
          Settings
        </Title>
        <Text c="dimmed">Platform-wide configuration.</Text>
      </Stack>

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Stack gap={4}>
            <Title order={2} size="h4">
              Master Prompt
            </Title>
            <Text c="dimmed" size="sm">
              The system prompt that powers every tenant&rsquo;s Composer when building blocks. The set you mark here
              is compiled and sent as the master system prompt platform-wide.
            </Text>
          </Stack>

          {loading ? (
            <Stack gap="sm">
              <Skeleton height={40} radius="sm" />
              <Skeleton height={40} radius="sm" />
            </Stack>
          ) : isEmpty ? (
            <Stack gap={4}>
              <Text fw={500}>No prompt sets yet.</Text>
              <Text c="dimmed" size="sm">
                Create a prompt set in any tenant&rsquo;s Settings, then return here to mark it as the platform master.
              </Text>
            </Stack>
          ) : (
            <>
              <Group gap="xs" wrap="wrap" align="center">
                <Text size="sm" c="dimmed">
                  Current master
                </Text>
                <Text size="sm" aria-hidden>
                  ·
                </Text>
                {current ? (
                  <>
                    <Text size="sm" fw={600}>
                      {current.label}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {current.tenantName}
                    </Text>
                    <Badge
                      size="sm"
                      radius="sm"
                      variant="light"
                      color={current.status.toLowerCase() === 'live' ? 'green' : 'yellow'}
                    >
                      {statusLabel(current.status)}
                    </Badge>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    No master set yet
                  </Text>
                )}
              </Group>

              <MasterPromptPicker
                options={options}
                selectedId={pending}
                masterId={master.promptSetId}
                onSelect={setPending}
                disabled={saving}
              />

              <Group gap="sm" align="center">
                <Button color="green" onClick={save} loading={saving} disabled={!dirty || pending == null}>
                  Save
                </Button>
                {dirty && !saving && (
                  <Button variant="subtle" color="gray" onClick={cancel}>
                    Cancel
                  </Button>
                )}
                {dirty && !saving && (
                  <Text size="sm" c="dimmed">
                    Unsaved change
                  </Text>
                )}
              </Group>
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}
