# Wiring `PromptSets` into the Settings accordion

One import + one `Accordion.Item` in **`app/admin/settings/page.tsx`**. Drop it in as
the second item (after Parameters), matching the existing items exactly.

```tsx
import { PromptSets } from './PromptSets'   // add with the other panel imports
```

```tsx
{/* place directly after the "parameters" Accordion.Item */}
<Accordion.Item value="prompt-sets">
  <Accordion.Control>
    <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--mantine-font-size-md)' }}>Prompt Sets</span>
    <span style={{ display: 'block', fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' }}>The prompt sets this tenant runs — label, status, and where each live set is used.</span>
  </Accordion.Control>
  <Accordion.Panel>
    <PromptSets />
  </Accordion.Panel>
</Accordion.Item>
```

Nothing else on the page changes. `PromptSets` owns its own data fetching, state, and
notifications (same pattern as `SageParameters`).
