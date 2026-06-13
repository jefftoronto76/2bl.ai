'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Group, Skeleton, Stack, Switch } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Text } from '@/components/admin/primitives/Text'

export function InviteGate() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tenant-settings')
      if (!res.ok) throw new Error(`${res.status}`)
      const data: { invite_gate_enabled: boolean } = await res.json()
      setSaved(data.invite_gate_enabled)
      setEnabled(data.invite_gate_enabled)
    } catch (err) {
      console.error('[InviteGate] fetch failed:', err)
      notifications.show({
        color: 'red',
        title: 'Failed to load gate settings',
        message: 'Could not load invite gate settings.',
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
    console.log('[InviteGate] PATCH dispatch:', { invite_gate_enabled: enabled })
    setSaving(true)
    try {
      const res = await fetch('/api/admin/tenant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_gate_enabled: enabled }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const msg =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'Failed to save gate setting.'
        console.error('[InviteGate] PATCH failed:', msg)
        notifications.show({ color: 'red', title: 'Save failed', message: msg })
        return
      }
      const data: { invite_gate_enabled: boolean } = await res.json()
      console.log('[InviteGate] PATCH success:', data)
      setSaved(data.invite_gate_enabled)
      setEnabled(data.invite_gate_enabled)
      notifications.show({
        color: 'green',
        title: 'Gate setting saved',
        message: `Invite gate is now ${data.invite_gate_enabled ? 'on' : 'off'}.`,
      })
    } catch (err) {
      console.error('[InviteGate] PATCH request failed:', err)
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
            id="invite-gate-heading"
            variant="title"
            style={{ fontSize: 'var(--mantine-font-size-md)' }}
          >
            Invite Gate
          </Text>
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
            Control whether this chat requires membership or an invite to access.
          </Text>
        </Stack>
      </Group>

      {loading ? (
        <Skeleton height={100} radius="md" />
      ) : (
        <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
          <Stack gap="sm">
            <Switch
              label="Require an invite to access this chat"
              description="When enabled, visitors must present an invite link or be an active member to open the chat."
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
