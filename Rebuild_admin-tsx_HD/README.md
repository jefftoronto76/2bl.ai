# Admin screens — production Mantine (`.tsx`)

Ten admin screens as real React/TypeScript Mantine components, structured to drop
into your `app/` + `components/admin/` tree. No htm, no CDN, no build harness — plain
JSX + `@tabler/icons-react` + `@mantine/*`, same conventions as your existing
`MasterPromptPicker.tsx` / `page.tsx`.

Each screen runs **as-is** off typed fixtures so it compiles and renders the day you
paste it in; every fixture read is marked `// TODO: replace with query`. Swap those for
your Supabase/route reads — the shapes already match (see `lib/types.ts`).

---

## 1 · File map

```
admin-tsx/
├─ app/
│  ├─ admin/
│  │  ├─ page.tsx                          Inbound Chats         /admin
│  │  ├─ settings/page.tsx                 Tenant Settings       /admin/settings
│  │  ├─ prompt-builder/
│  │  │  ├─ page.tsx                        Composer              /admin/prompt-builder
│  │  │  ├─ ConversationSidebar.tsx
│  │  │  └─ ComposerPickers.tsx
│  │  └─ prompt-studio/
│  │     ├─ blocks/page.tsx                 Blocks                /admin/prompt-studio/blocks
│  │     ├─ history/page.tsx                History               /admin/prompt-studio/history
│  │     └─ assets/page.tsx                 Assets                /admin/prompt-studio/assets
│  └─ platform/
│     ├─ admin/page.tsx + TenantModal.tsx   Tenants               /platform/admin
│     ├─ members/page.tsx + MemberDrawer    Members               /platform/members
│     ├─ usage/page.tsx                      Usage                 /platform/usage
│     └─ settings/page.tsx + SystemPromptPicker  Settings         /platform/settings
└─ components/admin/
   ├─ AdminProviders.tsx                    MantineProvider + Notifications
   ├─ theme/mantine-theme.ts                buildAdminTheme + accentMix
   ├─ lib/
   │  ├─ types.ts                           all row/token types + helpers
   │  ├─ fixtures.ts                        typed sample data (replace with queries)
   │  ├─ badges.tsx                         TintBadge, StatusBadge + colour maps
   │  └─ primitives.tsx                     StatTile, MetaRow, Donut, notify()
   ├─ prompt-sets/PromptSetList.tsx         shared by both Settings screens
   └─ appearance/Appearance.tsx             WebsiteAppearance (storefront + admin)
```

The two **page-level** screens that share UI (`Platform Settings` and `Tenant
Settings`) both import `components/admin/prompt-sets/PromptSetList`; Tenant Settings
also imports `components/admin/appearance/Appearance`. Keep those shared — don't inline.

---

## 2 · Provider & global setup

```bash
npm i @mantine/core @mantine/hooks @mantine/notifications @tabler/icons-react
```

Load the Mantine CSS + the three fonts once (root layout):

```tsx
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
// fonts: Newsreader (headings), Manrope (body), DM Mono (labels) — next/font or <link>
```

Wrap the admin route group with the provider (or reuse the one you already have):

```tsx
// app/(admin)/layout.tsx
import { AdminProviders } from '@/components/admin/AdminProviders'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminProviders>{children}</AdminProviders>
}
```

> **Already have `buildAdminTheme`?** Delete `theme/mantine-theme.ts` and point
> `AdminProviders` at yours. Every screen reads theme values through
> `var(--mantine-*)`, so it binds to whatever theme the provider uses.

**Path alias.** Imports use `@/components/admin/...`. Make sure your `tsconfig.json`
`paths` maps `@/*` to the root where you place `components/` and `app/` (most Next.js
apps already do). Otherwise find-and-replace `@/` to a relative prefix.

---

## 3 · Wiring real data (per screen)

Every screen seeds local state from a fixture, e.g.:

```tsx
const [tenants, setTenants] = useState<Tenant[]>(TENANTS) // TODO: replace with query
```

Replace the initializer with your fetched rows (server component → prop, SWR/React
Query, or a server action) and point the mutations (`onSave`, `onDelete`, bulk
actions, toggles) at your endpoints. The `notify()` calls currently stand in for those
round-trips. The funnel/cost math in Inbound Chats uses local rate constants
(`IN_COST` / `OUT_COST`) — swap for your pricing source.

`fixtures.ts` is the single place all sample data lives; it documents each shape and
its production origin.

---

## 4 · Notes

- **Composer** assistant replies are canned (`setTimeout`) to demonstrate the flow —
  wire `send()` / `opening()` to your model endpoint and `saveDraft()` to your block
  mutation.
- **Blocks** drops the design-time "Tweaks" panel (a prototyping artifact); the real
  Hide/Show prompt-summary control is kept.
- **Custom dropdowns** (System Prompt picker, Blocks/Composer prompt-set pickers) are
  intentionally hand-built `<button>` + popover, not Mantine `<Select>`, to match the
  design exactly — same as your shipped `MasterPromptPicker.tsx`.
- The dark sidebar/shell from the prototype harness is **not** included — these are the
  screen bodies only; your real `UnifiedAdminShell` wraps them.
- `data-screen-label` attributes are left on each root for your review/comment tooling.
