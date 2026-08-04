# Wiring `TenantPrompts` into Platform Settings

Target file: **`app/(platform)/platform/settings/page.tsx`**

The page currently renders a single `<Card>` (Master Prompt). Add the new section as a
**second card below it**, inside the existing top-level `<Stack gap="lg">`. No other
change to the page is required — `TenantPrompts` owns its own fetch/state.

### 1. Import (top of file, with the other imports)

```tsx
import { TenantPrompts } from './TenantPrompts'
```

### 2. New card (immediately after the closing `</Card>` of the Master Prompt card,
still inside the outer `<Stack gap="lg">`)

```tsx
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Stack gap={4}>
            <Title order={2} size="h4">
              Tenant Prompts
            </Title>
            <Text c="dimmed" size="sm">
              Every prompt set across all tenants, pulled from the database. Read-only here — manage a
              set from its tenant&rsquo;s Settings, or mark the platform master above.
            </Text>
          </Stack>

          <TenantPrompts />
        </Stack>
      </Card>
```

`Card`, `Stack`, `Title`, `Text` are already imported by the page. Done.
