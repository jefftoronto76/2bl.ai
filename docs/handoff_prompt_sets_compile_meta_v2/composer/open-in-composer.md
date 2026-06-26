# "Open in Composer" — navigation contract

Both prompt-set cards (tenant Settings → Prompt Sets, and Platform Settings → Tenant
Prompts) have an **Open in Composer** button. It deep-links to the Composer with the set
preselected:

```ts
router.push(`/admin/prompt-builder?promptSet=${encodeURIComponent(set.id)}`)
```

The Composer (`app/admin/prompt-builder/page.tsx`) must read that query param on load and
preselect the matching set (it already owns `activePromptSetId` + the prompt-set fetch):

```tsx
import { useSearchParams } from 'next/navigation'
// …
const searchParams = useSearchParams()

// After promptSets have loaded, honor ?promptSet=<id> once.
useEffect(() => {
  const requested = searchParams.get('promptSet')
  if (requested && promptSets.some((s) => s.id === requested)) {
    setActivePromptSetId(requested)
  }
  // depend on the loaded list so it runs after the fetch resolves
}, [searchParams, promptSets])
```

Notes
- **Cross-tenant caveat (platform surface):** opening another tenant's set in *your*
  Composer only makes sense if the Composer resolves blocks/sets by the set's own
  `tenant_id`. If the Composer is hard-scoped to the session tenant, gate the button on
  `set.tenant_id === sessionTenantId` on the platform card (pass an `onOpenInComposer`
  only for own-tenant sets). Confirm desired behavior — see handover §6.
- If a deep-linked set isn't in the user's list (deleted / not visible), the effect is a
  no-op and the Composer keeps its default selection.
