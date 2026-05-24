import { Stack, Title, Text } from '@mantine/core';

export default function PlatformTenantsPage() {
  return (
    <Stack gap="xs">
      <Title order={1} size="h2">Tenants</Title>
      <Text c="dimmed">
        Cross-tenant management lands here — every tenant, its type, and its child
        tenants. (Tenant list ships in the next commit.)
      </Text>
    </Stack>
  );
}
