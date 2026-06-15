'use client'

import { useState, useEffect } from 'react'
import {
  Modal,
  TextInput,
  Table,
  Group,
  Text,
  Button,
  Stack,
  ScrollArea,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconSearch } from '@tabler/icons-react'

interface MemberRow {
  id: string
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  invited_name: string | null
}

export interface TransferModalProps {
  opened: boolean
  sessionId: string
  visitorName: string | null
  onClose: () => void
  onSuccess: () => void
}

export function TransferModal({
  opened,
  sessionId,
  visitorName,
  onClose,
  onSuccess,
}: TransferModalProps) {
  const [allMembers, setAllMembers] = useState<MemberRow[]>([])
  const [query, setQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Fetch all active members once when the modal opens
  useEffect(() => {
    if (!opened) return
    fetch('/api/admin/members/search')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MemberRow[]) => setAllMembers(data))
      .catch(() => setAllMembers([]))
  }, [opened])

  // Reset state after modal closes (after animation)
  useEffect(() => {
    if (!opened) {
      const timer = setTimeout(() => {
        setQuery('')
        setSelectedMember(null)
        setConfirming(false)
        setAllMembers([])
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [opened])

  const filtered = query.trim()
    ? allMembers.filter((m) => {
        const q = query.toLowerCase()
        return (
          m.name?.toLowerCase().includes(q) ||
          m.invited_name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          m.phone?.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)
        )
      })
    : allMembers

  const displayName = (m: MemberRow) => m.name ?? m.invited_name ?? '—'
  const sessionDisplayName = visitorName ?? 'Anonymous'

  async function handleConfirm() {
    if (!selectedMember) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/transfer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: selectedMember.user_id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        notifications.show({
          title: 'Transfer failed',
          message: (body as { error?: string }).error ?? 'Something went wrong.',
          color: 'red',
        })
        setConfirming(false)
        return
      }
      notifications.show({
        title: 'Session transferred',
        message: `Session assigned to ${displayName(selectedMember)}.`,
        color: 'green',
      })
      onSuccess()
    } catch {
      notifications.show({
        title: 'Transfer failed',
        message: 'Network error. Please try again.',
        color: 'red',
      })
      setConfirming(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Transfer Session"
      size="lg"
      centered
    >
      {selectedMember ? (
        // Confirmation stage
        <Stack gap="md">
          <Text size="sm">
            Transfer{' '}
            <Text component="span" size="sm" fw={600}>
              {sessionDisplayName}
            </Text>
            {"'s session to "}
            <Text component="span" size="sm" fw={600}>
              {displayName(selectedMember)}
            </Text>
            ?
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setSelectedMember(null)}
              disabled={confirming}
            >
              Back
            </Button>
            <Button
              color="green"
              size="sm"
              loading={confirming}
              onClick={() => void handleConfirm()}
            >
              Confirm transfer
            </Button>
          </Group>
        </Stack>
      ) : (
        // Search + table stage
        <Stack gap="sm">
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder="Filter by name, email, or phone"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            autoFocus
          />
          <ScrollArea h={320}>
            <Table highlightOnHover verticalSpacing="xs" striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Phone</Table.Th>
                  <Table.Th>Member ID</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text size="sm" c="dimmed" ta="center" py="md">
                        {allMembers.length === 0 ? 'Loading…' : 'No members match.'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filtered.map((m) => (
                    <Table.Tr
                      key={m.id}
                      onClick={() => setSelectedMember(m)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {displayName(m)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                        >
                          {m.email ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                        >
                          {m.phone ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                        >
                          {m.id}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      )}
    </Modal>
  )
}
