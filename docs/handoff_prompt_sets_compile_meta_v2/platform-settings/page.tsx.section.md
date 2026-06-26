# Wiring `TenantPrompts` into Platform Settings

Target file: **`app/(platform)/platform/settings/page.tsx`**

The page renders stacked `<Card>`s inside one `<Stack gap="lg">` (Master Prompt is the
first). Add the Tenant Prompts card **after** it.

> ⚠️ Do NOT also write a `<Text c="dimmed">` subtitle in this card — `TenantPrompts`
> renders its own one-line intro (next to the Add New button). Writing one here too is
> what produced the doubled-paragraph bug. Title only.

### 1. Import (with the other imports)

```tsx
import { TenantPrompts } from './TenantPrompts'
```

### 2. New card (after the Master Prompt `</Card>`, inside the outer `<Stack gap="lg">`)

```tsx
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Title order={2} size="h4">
            Tenant Prompts
          </Title>

          <TenantPrompts />
        </Stack>
      </Card>
```

`Card`, `Stack`, `Title` are already imported by the page. That's the whole change —
the section's intro line, search, Add New, grouping, and cards all live inside
`TenantPrompts`.
