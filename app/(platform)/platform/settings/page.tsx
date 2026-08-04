'use client'

// Platform Settings — Composer Prompt. Read-only list of composer-family
// prompt sets (is_composer_prompt = true) plus Add New. There is no
// Select/Save/Revert here anymore (July 2026) — the old flow only ever
// flipped is_composer_prompt as a bare live pointer, with no compile step,
// no release note, and no real audit trail. The only way to make a composer
// set live is Compile & Publish on the Blocks screen, reached via each row's
// Edit pencil — the same one true activation path every ordinary tenant
// prompt set already goes through. See System Docs/Known Gaps.md.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Accordion, Button, Card, Group, Modal, Skeleton, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { CurrentSystemPromptPill, MasterPromptPicker } from './MasterPromptPicker'
import { TenantPrompts } from './TenantPrompts'
import { type MasterPromptOption, type MasterPromptSetting } from './types'

export const dynamic = 'force-dynamic'

function isComposerSet(o: MasterPromptOption): boolean {
  return o.is_composer_prompt === true
}

export default function PlatformSettingsPage() {
  const router = useRouter()
  const [options, setOptions] = useState<MasterPromptOption[]>([])
  const [master, setMaster] = useState<MasterPromptSetting>({ promptSetId: null })
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDescription, setNewDescription] = useState('')

  // Re-fetch just the picker options. Called on mount and whenever TenantPrompts
  // mutates a set (create/edit/delete) so this list never goes stale.
  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/prompt-sets')
      if (res.ok) setOptions(await res.json())
    } catch (err) {
      console.error('[PlatformSettings] options refresh failed:', err)
    }
  }, [])

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
        if (masterRes.ok) setMaster(await masterRes.json())
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

  const composerOptions = options.filter(isComposerSet)
  const isEmpty = !loading && composerOptions.length === 0
  const current = options.find((o) => o.id === master.promptSetId) ?? null

  function editInBlocks(option: MasterPromptOption) {
    router.push(`/admin/prompt-studio/blocks?set=${encodeURIComponent(option.id)}`)
  }

  async function createComposerSet() {
    if (!newLabel.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/platform/prompt-sets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel.trim(),
          description: newDescription.trim(),
          status: 'draft',
          is_composer_prompt: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        notifications.show({
          color: 'red',
          title: 'Create failed',
          message: (data?.error as string) ?? 'Could not create the prompt set.',
        })
        return
      }
      await loadOptions()
      setCreateOpen(false)
      setNewLabel('')
      setNewDescription('')
      notifications.show({
        color: 'green',
        title: 'Composer prompt set created',
        message: 'Edit it in Blocks, then Compile & Publish to make it live.',
      })
    } catch (err) {
      console.error('[PlatformSettings] create failed:', err)
      notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' })
    } finally {
      setCreating(false)
    }
  }

  function closeCreate() {
    if (creating) return
    setCreateOpen(false)
    setNewLabel('')
    setNewDescription('')
  }

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1} size="h2">
          Settings
        </Title>
        <Text c="dimmed">Platform-wide configuration.</Text>
      </Stack>

      <Accordion variant="separated" defaultValue="system-prompt">
        <Accordion.Item value="system-prompt">
          <Accordion.Control>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--mantine-font-size-md)' }}>Composer Prompt</span>
            <span style={{ display: 'block', fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' }}>
              The compiled prompt that powers the Composer AI when building blocks. Activate one by editing it in
              Blocks and using Compile &amp; Publish there.
            </span>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {loading ? (
                <Stack gap="sm">
                  <Skeleton height={40} radius="sm" />
                  <Skeleton height={40} radius="sm" />
                </Stack>
              ) : (
                <>
                  <Group gap="sm" align="center" wrap="wrap">
                    <CurrentSystemPromptPill set={current} setByName={master.setByName} setAt={master.setAt} />
                    <Button color="green" size="sm" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
                      Add New
                    </Button>
                  </Group>

                  {isEmpty ? (
                    <Stack gap={4}>
                      <Text fw={500}>No composer prompt sets yet.</Text>
                      <Text c="dimmed" size="sm">
                        Add New here, then edit it in Blocks and Compile &amp; Publish to make it live.
                      </Text>
                    </Stack>
                  ) : (
                    <MasterPromptPicker options={composerOptions} onEdit={editInBlocks} />
                  )}
                </>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Title order={2} size="h4">
            Tenant Prompts
          </Title>

          <TenantPrompts onSetsChanged={loadOptions} />
        </Stack>
      </Card>

      <Modal opened={createOpen} onClose={closeCreate} title="New composer prompt set" centered size="sm">
        <Stack gap="md">
          <TextInput
            label="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.currentTarget.value)}
            placeholder="e.g. Composer v2"
            required
            disabled={creating}
          />
          <Textarea
            label="Description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.currentTarget.value)}
            placeholder="What this set is for…"
            autosize
            minRows={2}
            maxRows={6}
            disabled={creating}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={closeCreate} disabled={creating}>
              Cancel
            </Button>
            <Button color="green" loading={creating} disabled={!newLabel.trim()} onClick={createComposerSet}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
