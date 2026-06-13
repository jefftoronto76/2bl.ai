'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Code,
  Group,
  Modal,
  Skeleton,
  Stack,
  Switch,
  Table,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconCopy, IconLink, IconPlus, IconTrash } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'

interface InviteRow {
  id: string
  token: string
  email: string | null
  used_at: string | null
  expires_at: string | null
  created_at: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function buildInviteUrl(token: string, tenantDomain: string | null): string {
  const origin = tenantDomain ? `https://${tenantDomain}` : window.location.origin
  return `${origin}?invite=${token}`
}

function truncateToken(token: string): string {
  return token.length > 14 ? `${token.slice(0, 12)}…` : token
}

interface InvitesManagerProps {
  tenantName: string
  tenantDomain: string | null
}

export function InvitesManager({ tenantName, tenantDomain }: InvitesManagerProps) {
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  // Gate toggle state
  const [gateEnabled, setGateEnabled] = useState(true)
  const [gateSaved, setGateSaved] = useState<boolean | null>(null)
  const [gateSaving, setGateSaving] = useState(false)
  const [gateLoading, setGateLoading] = useState(true)

  // New invite modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalUrl, setModalUrl] = useState('')
  const [modalEmail, setModalEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<InviteRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Per-row copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [modalCopied, setModalCopied] = useState(false)

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/invites')
      if (!res.ok) throw new Error(`${res.status}`)
      const data: InviteRow[] = await res.json()
      setInvites(data)
    } catch (err) {
      console.error('[invites] fetch failed:', err)
      notifications.show({
        color: 'red',
        title: 'Failed to load invites',
        message: 'Could not fetch the invite list. Try refreshing.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchGateSettings = useCallback(async () => {
    console.log('[invites] fetching gate settings')
    try {
      const res = await fetch('/api/admin/tenant-settings')
      if (!res.ok) throw new Error(`${res.status}`)
      const data: { invite_gate_enabled: boolean } = await res.json()
      console.log('[invites] gate settings fetched:', data)
      setGateSaved(data.invite_gate_enabled)
      setGateEnabled(data.invite_gate_enabled)
    } catch (err) {
      console.error('[invites] gate settings fetch failed:', err)
      notifications.show({
        color: 'red',
        title: 'Failed to load gate settings',
        message: 'Could not load invite gate settings.',
      })
    } finally {
      setGateLoading(false)
    }
  }, [])

  useEffect(() => { fetchInvites() }, [fetchInvites])
  useEffect(() => { fetchGateSettings() }, [fetchGateSettings])

  const gateDirty = gateSaved !== null && gateEnabled !== gateSaved

  async function handleGateSave() {
    console.log('[invites] PATCH gate:', { invite_gate_enabled: gateEnabled })
    setGateSaving(true)
    try {
      const res = await fetch('/api/admin/tenant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_gate_enabled: gateEnabled }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const msg =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'Failed to save gate settings.'
        console.error('[invites] PATCH gate failed:', msg)
        notifications.show({ color: 'red', title: 'Save failed', message: msg })
        return
      }
      const data: { invite_gate_enabled: boolean } = await res.json()
      console.log('[invites] PATCH gate success:', data)
      setGateSaved(data.invite_gate_enabled)
      setGateEnabled(data.invite_gate_enabled)
      notifications.show({
        color: 'green',
        title: 'Invite gate saved',
        message: `Invite gate is now ${data.invite_gate_enabled ? 'on' : 'off'}.`,
      })
    } catch (err) {
      console.error('[invites] PATCH gate request failed:', err)
      notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' })
    } finally {
      setGateSaving(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const email = emailInput.trim() || null
      const body = email ? JSON.stringify({ email }) : '{}'
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `${res.status}`)
      }
      const invite: InviteRow = await res.json()
      setInvites(prev => [invite, ...prev])
      setEmailInput('')
      setModalUrl(buildInviteUrl(invite.token, tenantDomain))
      setModalEmail(invite.email ?? '')
      setModalCopied(false)
      setModalOpen(true)
      console.log('[invites] created:', invite.id)
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Failed to create invite',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/invites/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `${res.status}`)
      }
      setInvites(prev => prev.filter(i => i.id !== deleteTarget.id))
      setDeleteTarget(null)
      notifications.show({ color: 'green', message: 'Invite deleted.' })
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Failed to delete invite',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setDeleting(false)
    }
  }

  function copyToClipboard(text: string, onDone: () => void) {
    navigator.clipboard.writeText(text).then(onDone).catch(() => {
      notifications.show({ color: 'red', message: 'Could not copy to clipboard.' })
    })
  }

  function handleRowCopy(invite: InviteRow) {
    copyToClipboard(buildInviteUrl(invite.token, tenantDomain), () => {
      setCopiedId(invite.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function handleModalCopy() {
    copyToClipboard(modalUrl, () => {
      setModalCopied(true)
      setTimeout(() => setModalCopied(false), 2000)
    })
  }

  return (
    <>
      {/* Gate toggle */}
      <Stack gap="md" mb="xl">
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
              Control whether {tenantName} chat requires membership or an invite to access.
            </Text>
          </Stack>
        </Group>
        {gateLoading ? (
          <Skeleton height={100} radius="md" />
        ) : (
          <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
            <Stack gap="sm">
              <Switch
                label={`Require an invite to access ${tenantName} chat`}
                description="When enabled, visitors must present an invite link or be an active member to open the chat."
                checked={gateEnabled}
                onChange={(e) => setGateEnabled(e.currentTarget.checked)}
                disabled={gateSaving}
                size="md"
              />
              <Group gap="xs" justify="flex-end">
                <Button
                  variant="filled"
                  color="green"
                  size="sm"
                  onClick={handleGateSave}
                  loading={gateSaving}
                  disabled={!gateDirty}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
      </Stack>

      {/* Section header */}
      <Group justify="space-between" align="center" mb="md">
        <div>
          <Text variant="title" id="invites-heading">
            Invites
          </Text>
          <Text variant="muted">
            Invite-only access links for {tenantName}. Each token can be used once.
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          color="green"
          loading={generating}
          onClick={handleGenerate}
          disabled={!gateEnabled}
        >
          Generate invite
        </Button>
      </Group>

      {/* Optional email input */}
      <TextInput
        label="Lock to email (optional)"
        description="If set, only the person with this email address can use the link."
        placeholder="someone@example.com"
        value={emailInput}
        onChange={e => setEmailInput(e.currentTarget.value)}
        disabled={!gateEnabled}
        mb="lg"
        style={{ maxWidth: 360 }}
      />

      {/* Invite list */}
      {loading ? (
        <Stack gap="sm">
          {[1, 2, 3].map(n => <Skeleton key={n} height={44} radius="sm" />)}
        </Stack>
      ) : invites.length === 0 ? (
        <Center h={120}>
          <Text variant="muted">No invites yet. Generate one above.</Text>
        </Center>
      ) : (
        <Box style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover verticalSpacing="sm" miw={640}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Email / Access</Table.Th>
                <Table.Th>Token</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Used</Table.Th>
                <Table.Th style={{ width: 80 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {invites.map(invite => (
                <Table.Tr key={invite.id}>
                  <Table.Td>
                    <Text variant="body">{invite.email ?? <span style={{ opacity: 0.45 }}>Open</span>}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Code suppressHydrationWarning>{truncateToken(invite.token)}</Code>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={invite.used_at ? 'gray' : 'green'} variant="light" size="sm">
                      {invite.used_at ? 'Used' : 'Pending'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" suppressHydrationWarning>
                      {formatDate(invite.created_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text variant="muted" suppressHydrationWarning>
                      {formatDate(invite.used_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      <Tooltip label={copiedId === invite.id ? 'Copied!' : 'Copy invite link'} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color={copiedId === invite.id ? 'green' : 'gray'}
                          onClick={() => handleRowCopy(invite)}
                          aria-label="Copy invite link"
                        >
                          {copiedId === invite.id ? <IconCheck size={16} /> : <IconLink size={16} />}
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete invite" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => setDeleteTarget(invite)}
                          aria-label="Delete invite"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {/* New invite modal */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Invite link generated"
        centered
      >
        <Stack gap="md">
          {modalEmail && (
            <Text variant="muted">
              This link is locked to <strong>{modalEmail}</strong>.
            </Text>
          )}
          <Text variant="body">Copy and send this link. It can only be used once.</Text>
          <Code
            block
            style={{ wordBreak: 'break-all', fontSize: 13 }}
            suppressHydrationWarning
          >
            {modalUrl}
          </Code>
          <Button
            leftSection={modalCopied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            color={modalCopied ? 'green' : 'blue'}
            onClick={handleModalCopy}
            fullWidth
          >
            {modalCopied ? 'Copied!' : 'Copy link'}
          </Button>
        </Stack>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete invite?"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text variant="body">
            This invite will be permanently deleted and the link will stop working.
            {deleteTarget?.email ? ` (locked to ${deleteTarget.email})` : ''}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button color="red" loading={deleting} onClick={handleDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
