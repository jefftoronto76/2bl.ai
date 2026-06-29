'use client'

// Platform · Usage — analytics placeholder. Route: /platform/usage
// TODO: replace the empty state with the per-tenant token/session charts.

import { Badge, Card, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconChartHistogram } from '@tabler/icons-react'

export default function UsagePage() {
  return (
    <Stack gap="lg" data-screen-label="Platform · Usage">
      <Stack gap={4}>
        <Title order={1} size="h2">Usage</Title>
        <Text c="dimmed">Token and session volume across every tenant.</Text>
      </Stack>
      <Card withBorder radius="md" p={0} style={{ background: 'transparent', overflow: 'hidden' }}>
        <Center style={{ minHeight: 420, padding: 40 }}>
          <Stack gap="md" align="center" style={{ maxWidth: 380, textAlign: 'center' }}>
            <ThemeIcon variant="light" color="brand" size={56} radius="md"><IconChartHistogram size={30} /></ThemeIcon>
            <Stack gap={4} align="center">
              <Title order={2} size="h4">Usage analytics</Title>
              <Text c="dimmed" size="sm">Per-tenant token spend, session counts, and trend charts are coming soon.</Text>
            </Stack>
            <Badge variant="light" color="gray" radius="sm">Coming soon</Badge>
          </Stack>
        </Center>
      </Card>
    </Stack>
  )
}
