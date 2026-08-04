'use client'

// Prompt Studio · Assets — source documents Sage draws on when building knowledge
// blocks. Route: /admin/prompt-studio/assets
// TODO: replace ASSETS with the live query and wire upload/remove to your storage.

import { useState } from 'react'
import { ActionIcon, Badge, Button, Card, Group, Stack, Table, Text, ThemeIcon, Title } from '@mantine/core'
import { IconFileText, IconTrash, IconUpload } from '@tabler/icons-react'
import { ASSETS } from '@/components/admin/lib/fixtures'
import { notify } from '@/components/admin/lib/primitives'
import type { Asset, BadgeTint } from '@/components/admin/lib/types'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const extOf = (name: string) => (name.split('.').pop() || '').toUpperCase()
const FILE_TINTS: Record<string, BadgeTint> = {
  PDF: { bg: 'rgba(250,82,82,0.12)', fg: '#e03131' },
  DOCX: { bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  TXT: { bg: 'rgba(73,80,87,0.09)', fg: '#495057' },
}
const fileTint = (ext: string): BadgeTint => FILE_TINTS[ext] || { bg: 'rgba(73,80,87,0.09)', fg: '#495057' }

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>(ASSETS) // TODO: replace with query
  const remove = (a: Asset) => {
    setAssets((prev) => prev.filter((x) => x.id !== a.id))
    notify({ color: 'green', title: 'Asset removed', message: a.name })
  }
  return (
    <Stack gap="lg" data-screen-label="Prompt Studio · Assets">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Stack gap={4}>
          <Title order={1} size="h2">Assets</Title>
          <Text c="dimmed">Source documents Sage draws on when building knowledge blocks.</Text>
        </Stack>
        <Button leftSection={<IconUpload size={16} />} onClick={() => notify({ color: 'green', title: 'Upload', message: 'File picker would open here.' })}>Upload</Button>
      </Group>
      <Card withBorder radius="md" p={0} style={{ background: 'transparent', overflow: 'hidden' }}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Size</Table.Th>
              <Table.Th>Stored</Table.Th>
              <Table.Th>Added</Table.Th>
              <Table.Th style={{ width: 40 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {assets.map((a) => {
              const ext = extOf(a.name)
              return (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon variant="light" color="gray" size={30} radius="sm"><IconFileText size={16} /></ThemeIcon>
                      <Text fw={500} size="sm">{a.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" radius="sm" variant="light" styles={{ root: { background: fileTint(ext).bg, color: fileTint(ext).fg, textTransform: 'none', fontWeight: 600 } }}>{ext}</Badge>
                  </Table.Td>
                  <Table.Td><Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{(a.raw_len / 1000).toFixed(1)}k chars</Text></Table.Td>
                  <Table.Td>
                    {a.storage_path
                      ? <Badge size="sm" radius="sm" variant="light" color="green">Stored</Badge>
                      : <Badge size="sm" radius="sm" variant="light" color="gray">Inline</Badge>}
                  </Table.Td>
                  <Table.Td><Text c="dimmed" size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{fmtDate(a.created_at)}</Text></Table.Td>
                  <Table.Td><ActionIcon variant="subtle" color="red" aria-label="Remove" onClick={() => remove(a)}><IconTrash size={16} /></ActionIcon></Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  )
}
