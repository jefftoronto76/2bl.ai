'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Modal,
  TextInput,
  Combobox,
  useCombobox,
  Group,
  Text,
  Button,
  Stack,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconSearch } from '@tabler/icons-react'

interface MemberResult {
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
  const [stage, setStage] = useState<'search' | 'confirm'>('search')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<MemberResult[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null)
  const [confirming, setConfirming] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })

  const fetchMembers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    try {
      const res = await fetch(`/api/admin/members/search?q=${encodeURIComponent(q.trim())}`)
      if (!res.ok) {
        setResults([])
        return
      }
      const data: MemberResult[] = await res.json()
      setResults(data)
      combobox.openDropdown()
    } catch {
      setResults([])
    }
  }, [combobox])

  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setResults([])
      combobox.closeDropdown()
      return
    }
    debounceRef.current = setTimeout(() => {
      void fetchMembers(value)
    }, 300)
  }

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
      const displayName =
        selectedMember.name ?? selectedMember.invited_name ?? 'the selected member'
      notifications.show({
        title: 'Session transferred',
        message: `Session assigned to ${displayName}.`,
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

  // Reset to Stage 1 after the modal closes (after animation)
  useEffect(() => {
    if (!opened) {
      const timer = setTimeout(() => {
        setStage('search')
        setSearch('')
        setResults([])
        setSelectedMember(null)
        setConfirming(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [opened])

  const memberDisplayName = (m: MemberResult) => m.name ?? m.invited_name ?? '—'
  const sessionDisplayName = visitorName ?? 'Anonymous'

  const options = results.map((member) => (
    <Combobox.Option key={member.id} value={member.user_id}>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={600} style={{ minWidth: 0, flexShrink: 1 }}>
          {memberDisplayName(member)}
        </Text>
        {member.email && (
          <Text
            size="xs"
            c="dimmed"
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              flexShrink: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {member.email}
          </Text>
        )}
      </Group>
    </Combobox.Option>
  ))

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Transfer Session"
      size="sm"
      centered
    >
      {stage === 'search' ? (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Search for a member to assign{' '}
            <Text component="span" size="sm" fw={600} c="dark">
              {sessionDisplayName}
            </Text>
            {"'s session to."}
          </Text>
          <Combobox
            store={combobox}
            onOptionSubmit={(userId) => {
              const member = results.find((m) => m.user_id === userId)
              if (member) {
                setSelectedMember(member)
                setStage('confirm')
              }
              combobox.closeDropdown()
            }}
          >
            <Combobox.Target>
              <TextInput
                leftSection={<IconSearch size={14} />}
                placeholder="Name, email, or phone"
                value={search}
                onChange={(e) => handleSearchChange(e.currentTarget.value)}
                onFocus={() => {
                  if (results.length > 0) combobox.openDropdown()
                }}
                autoFocus
              />
            </Combobox.Target>
            <Combobox.Dropdown>
              <Combobox.Options>
                {options.length > 0 ? (
                  options
                ) : (
                  <Combobox.Empty>
                    {search.trim() ? 'No active members found' : 'Type to search members'}
                  </Combobox.Empty>
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </Stack>
      ) : (
        <Stack gap="md">
          <Text size="sm">
            You are transferring{' '}
            <Text component="span" size="sm" fw={600}>
              {sessionDisplayName}
            </Text>
            {"'s session to "}
            <Text component="span" size="sm" fw={600}>
              {selectedMember ? memberDisplayName(selectedMember) : ''}
            </Text>
            . Press OK to confirm.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setStage('search')}
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
              OK
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
