'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Group, Skeleton, Stack, Switch } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Text } from '@/components/admin/primitives/Text'

interface GateSettings {
  invite_gate_enabled: boolean
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error
  }
  return fallback
}

export function InviteGateSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState(true)

  const fetchSettings = useCallback(async () => {
    console.log('[InviteGateSettings] fetching settings')
    try {
      const res = await fetch('/api/admin/tenant-settings')
      if (!res.ok) {
        console.error('[InviteGateSettings] fetch failed:', res.status)
        notifications.show({
          color: 'red',
          title: 'Failed to load gate settings',
          message: 'Could not load invite gate settings.',
        })
        return
      }
      const data: GateSettings = await res.json()
      console.log('[InviteGateSettings] fetched settings:', data)
      setSaved(data.invite_gate_enabled)
      setEnabled(data.invite_gate_enabled)
    } catch (err) {
      console.error('[InviteGateSettings] fetch request failed:', err)
      notifications.show({
        color: 'red',
        title: 'Network error',
        message: 'Could not reach the server.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const dirty = saved !== null && enabled !== saved

  async function handleSave() {
    console.log('[InviteGateSettings] PATCH dispatch:', { invite_gate_enabled: enabled })
    setSaving(true)
    try {
      const res = await fetch('/api/admin/tenant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_gate_enabled: enabled }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const errorMessage = extractErrorMessage(body, 'Failed to save gate settings.')
        console.error('[InviteGateSettings] PATCH failed:', errorMessage)
        notifications.show({ color: 'red', title: 'Save failed', message: errorMessage })
        return
      }
      const data: GateSettings = await res.json()
      console.log('[InviteGateSettings] PATCH success:', data)
      setSaved(data.invite_gate_enabled)
      setEnabled(data.invite_gate_enabled)
      notifications.show({
        color: 'green',
        title: 'Invite gate saved',
        message: `Invite gate is now ${data.invite_gate_enabled ? 'enabled' : 'disabled'}.`,
      })
    } catch (err) {
      console.error('[InviteGateSettings] PATCH request failed:', err)
      notifications.show({
        color: 'red',
        title: 'Network error',
        message: 'Could not reach the server.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
          <Text
            id="gate-heading"
            variant="title"
            style={{ fontSize: 'var(--mantine-font-size-md)' }}
          >
            Invite Gate
          </Text>
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
            Control whether the Heirloom chat requires membership to access.
          </Text>
        </Stack>
      </Group>

      {loading ? (
        <Skeleton height={100} radius="md" />
      ) : (
        <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
          <Stack gap="sm">
            <Switch
              label="Require membership to access chat"
              description="When enabled, visitors must sign in or claim a membership to open the chat."
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
              disabled={saving}
              size="md"
            />
            <Group gap="xs" justify="flex-end">
              <Button
                variant="filled"
                color="green"
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!dirty}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
