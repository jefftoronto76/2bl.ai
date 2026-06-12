'use client'

import { useState } from 'react'
import {
  Stack,
  Title,
  Card,
  TextInput,
  Button,
  Select,
  Group,
  Text,
  Badge,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Text as AdminText } from '@/components/admin/primitives/Text'

export interface TenantOption {
  id: string
  name: string
  slug: string
  type: string
}

interface FoundUser {
  id: string
  clerk_id: string
  email: string | null
  name: string | null
}

interface Props {
  tenants: TenantOption[]
}

export default function MembersManager({ tenants }: Props) {
  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [foundUser, setFoundUser] = useState<FoundUser | null | 'not_found'>(undefined as never)
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null)
  const [promoting, setPromoting] = useState(false)

  const tenantOptions = tenants.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.slug})`,
  }))

  async function handleSearch() {
    const trimmed = email.trim()
    if (!trimmed) return
    setSearching(true)
    setFoundUser(undefined as never)
    setSelectedTenant(null)
    try {
      const res = await fetch(
        `/api/platform/members?email=${encodeURIComponent(trimmed)}`,
      )
      const json = await res.json()
      if (!res.ok) {
        notifications.show({
          title: 'Search failed',
          message: json.error ?? 'Unknown error',
          color: 'red',
        })
        return
      }
      setFoundUser(json.user ?? 'not_found')
    } catch {
      notifications.show({
        title: 'Search failed',
        message: 'Network error — please try again.',
        color: 'red',
      })
    } finally {
      setSearching(false)
    }
  }

  async function handlePromote() {
    if (!foundUser || foundUser === 'not_found' || !selectedTenant) return
    setPromoting(true)
    try {
      const res = await fetch('/api/platform/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: foundUser.id, tenantId: selectedTenant }),
      })
      const json = await res.json()
      if (!res.ok) {
        notifications.show({
          title: 'Promote failed',
          message: json.error ?? 'Unknown error',
          color: 'red',
        })
        return
      }
      const tenantName = tenants.find((t) => t.id === selectedTenant)?.name ?? selectedTenant
      notifications.show({
        title: 'Done',
        message: `${foundUser.name ?? foundUser.email ?? foundUser.id} added to ${tenantName}.`,
        color: 'green',
      })
      setFoundUser(undefined as never)
      setSelectedTenant(null)
      setEmail('')
    } catch {
      notifications.show({
        title: 'Promote failed',
        message: 'Network error — please try again.',
        color: 'red',
      })
    } finally {
      setPromoting(false)
    }
  }

  const userFound = foundUser && foundUser !== 'not_found'

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={1} fz="lg" fw={600}>
          Members
        </Title>
        <AdminText variant="muted">Find a user by email and add them to a tenant.</AdminText>
      </Stack>

      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Text fw={500} size="sm">
            Find user
          </Text>
          <Group align="flex-end" gap="sm">
            <TextInput
              label="Email address"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch()
              }}
              style={{ flex: 1 }}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            />
            <Button
              onClick={() => void handleSearch()}
              loading={searching}
              disabled={!email.trim()}
              variant="filled"
            >
              Find User
            </Button>
          </Group>

          {foundUser === 'not_found' && (
            <Text size="sm" c="dimmed">
              No user found for that email address.
            </Text>
          )}

          {userFound && (
            <Card withBorder radius="sm" p="sm" bg="gray.0">
              <Group gap="xs" align="flex-start">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {(foundUser as FoundUser).name ?? '(no name)'}
                  </Text>
                  <Text size="xs" c="dimmed" ff="var(--mantine-font-family-monospace)">
                    {(foundUser as FoundUser).email}
                  </Text>
                  <Text size="xs" c="dimmed" ff="var(--mantine-font-family-monospace)">
                    id: {(foundUser as FoundUser).id.slice(0, 8)}…
                  </Text>
                </Stack>
                <Badge size="sm" variant="light" color="teal">
                  found
                </Badge>
              </Group>
            </Card>
          )}
        </Stack>
      </Card>

      {userFound && (
        <Card withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Text fw={500} size="sm">
              Add to tenant
            </Text>
            <Select
              label="Tenant"
              placeholder="Select a tenant…"
              data={tenantOptions}
              value={selectedTenant}
              onChange={setSelectedTenant}
              searchable
              clearable
            />
            <Group justify="flex-end">
              <Button
                onClick={() => void handlePromote()}
                loading={promoting}
                disabled={!selectedTenant}
                color="green"
              >
                Add to Tenant
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
