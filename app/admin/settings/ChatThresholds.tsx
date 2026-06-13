'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Group, NumberInput, Skeleton, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'

interface TenantSettings {
  chat_in_progress_idle_seconds: number
  chat_active_idle_seconds: number
}

const DEFAULT_IN_PROGRESS = 300
const DEFAULT_ACTIVE = 86400

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

function isPositiveInteger(value: number | string): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function ChatThresholds() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<TenantSettings | null>(null)
  const [inProgress, setInProgress] = useState<number | string>(DEFAULT_IN_PROGRESS)
  const [active, setActive] = useState<number | string>(DEFAULT_ACTIVE)

  const fetchSettings = useCallback(async () => {
    console.log('[ChatThresholds] fetching settings')
    try {
      const res = await fetch('/api/admin/tenant-settings')
      if (!res.ok) {
        console.error('[ChatThresholds] fetch failed:', res.status)
        notifications.show({
          color: 'red',
          title: 'Failed to load thresholds',
          message: 'Could not load chat threshold settings.',
        })
        return
      }
      const data: TenantSettings = await res.json()
      console.log('[ChatThresholds] fetched settings:', data)
      setSaved(data)
      setInProgress(data.chat_in_progress_idle_seconds)
      setActive(data.chat_active_idle_seconds)
    } catch (err) {
      console.error('[ChatThresholds] fetch request failed:', err)
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

  const inProgressValid = isPositiveInteger(inProgress)
  const activeValid = isPositiveInteger(active)
  const orderingValid =
    inProgressValid && activeValid && (inProgress as number) < (active as number)
  const valid = inProgressValid && activeValid && orderingValid

  const dirty =
    saved !== null &&
    valid &&
    ((inProgress as number) !== saved.chat_in_progress_idle_seconds ||
      (active as number) !== saved.chat_active_idle_seconds)

  function validationMessage(): string | null {
    if (!inProgressValid) {
      return 'In-progress threshold must be a positive integer.'
    }
    if (!activeValid) {
      return 'Active threshold must be a positive integer.'
    }
    if (!orderingValid) {
      return 'In-progress threshold must be less than the active threshold.'
    }
    return null
  }

  async function handleSave() {
    const message = validationMessage()
    if (message) {
      notifications.show({ color: 'red', title: 'Invalid input', message })
      return
    }
    console.log('[ChatThresholds] PATCH dispatch:', {
      chat_in_progress_idle_seconds: inProgress,
      chat_active_idle_seconds: active,
    })
    setSaving(true)
    try {
      const res = await fetch('/api/admin/tenant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_in_progress_idle_seconds: inProgress,
          chat_active_idle_seconds: active,
        }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const errorMessage = extractErrorMessage(body, 'Failed to save thresholds.')
        console.error('[ChatThresholds] PATCH failed:', errorMessage)
        notifications.show({ color: 'red', title: 'Save failed', message: errorMessage })
        return
      }
      const data: TenantSettings = await res.json()
      console.log('[ChatThresholds] PATCH success:', data)
      setSaved(data)
      setInProgress(data.chat_in_progress_idle_seconds)
      setActive(data.chat_active_idle_seconds)
      notifications.show({
        color: 'green',
        title: 'Thresholds saved',
        message: 'Chat threshold settings updated.',
      })
    } catch (err) {
      console.error('[ChatThresholds] PATCH request failed:', err)
      notifications.show({
        color: 'red',
        title: 'Network error',
        message: 'Could not reach the server.',
      })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    console.log('[ChatThresholds] reset to defaults')
    setInProgress(DEFAULT_IN_PROGRESS)
    setActive(DEFAULT_ACTIVE)
  }

  return (
    <Stack gap="md">
      {loading ? (
        <Skeleton height={200} radius="md" />
      ) : (
        <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
          <Stack gap="sm">
            <NumberInput
              label="In-progress idle threshold"
              description="Seconds idle before a chat moves from In-progress to Active. Default: 300 (5 min)."
              value={inProgress}
              onChange={setInProgress}
              min={1}
              step={60}
              size="sm"
              allowDecimal={false}
              allowNegative={false}
              disabled={saving}
            />
            <NumberInput
              label="Active idle threshold"
              description="Seconds idle before a chat moves from Active to Abandoned. Default: 86400 (24 hr)."
              value={active}
              onChange={setActive}
              min={1}
              step={3600}
              size="sm"
              allowDecimal={false}
              allowNegative={false}
              disabled={saving}
            />
            <Group gap="xs" justify="flex-end" wrap="wrap">
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={handleReset}
                disabled={saving}
              >
                Reset to defaults
              </Button>
              <Button
                variant="filled"
                color="green"
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!dirty || !valid}
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
