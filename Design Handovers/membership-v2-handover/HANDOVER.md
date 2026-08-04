# Heirloom Chat Widget — V2 Handover

> **Integration note (2026-06-12):** the shared domain types (`Story`,
> `Collaborator`, `WritingPrompt`, `RowTarget`, `RowAction`) were extracted to
> `v2/types.ts` at landing, per the "Note on tsx only" below. `SidebarV2.tsx`
> and `InviteCollaboratorsModal.tsx` now import from `./types`. Everything else
> in this document is the handover as received.

Five `.tsx` components for the V2 chat widget, built to match the existing
`components/shells/membership/` patterns: Tailwind utility classes with the
repo's design tokens (`bg-background`, `bg-surface`, `border-border`,
`text-text-primary`, `text-text-muted`, `bg-accent`/`hover:bg-accent-hover`,
`font-display`/`font-body`/`font-mono`), **lucide-react** icons, the existing
`ui/Button`, `ui/IconButton`, `ui/Avatar` primitives, `'use client'`, and
exported `interface` prop types.

A visual reference of all five rendering together lives at
`Heirloom V2 Components Preview.html` (standalone — Tailwind via CDN mapped to
the espresso palette; not part of the shipped code).

---

## Files & locations

All under `components/shells/membership/v2/`:

| File | Type | Data source |
| --- | --- | --- |
| `SidebarV2.tsx` | Sidebar shell | Reads `useChatStore()` (like v1) **+** props for V2 data |
| `BeginStoryModal.tsx` | Modal | Props only |
| `ChatDrawerV2.tsx` | Drawer wrapper | Props only |
| `InviteCollaboratorsModal.tsx` | Modal | Props only |
| `ShareHeirloomModal.tsx` | Modal | Props only |

`SidebarV2.tsx` is the **canonical type source** — it exports the shared domain
types (`Story`, `Collaborator`, `WritingPrompt`, `RowTarget`, `RowAction`).
`InviteCollaboratorsModal` imports `Collaborator` from it via `import type`
(erased at compile time — no runtime coupling to the store).

> **Note on "tsx only":** there is no separate `types.ts` — all shared types
> live in `SidebarV2.tsx`. Move them to a `v2/types.ts` if you'd rather not have
> the modals import a type from a component file; the import is type-only so it
> makes no runtime difference either way.

---

## Shared types (exported from `SidebarV2.tsx`)

```ts
export interface Collaborator {
  name: string;
  relationship: string;
  status: 'joined' | 'pending';
}

export interface Story {
  id: string;
  name: string;
  description?: string;        // surfaced as the row's hover tooltip
  collaborators?: Collaborator[];
}

export interface WritingPrompt {
  id: string;
  text: string;
}

export type RowTarget = 'conversation' | 'story';
export type RowAction =
  | 'star' | 'rename' | 'invite'
  | 'moveToChapter' | 'removeFromChapter' | 'delete';
```

---

## 1 · `SidebarV2.tsx`

Top → bottom: collapse toggle · **Search** · New Chat · Uploads · Share Heirloom ·
**Conversations** (collapsible, lists the store's `recentSessions`) · **Stories**
(Create + Invite actions, then the story list) · **Writing Prompts**.

**Store-sourced (unchanged from v1 `Sidebar`):** `state.isSidebarExpanded`,
`dispatch({ type: 'TOGGLE_SIDEBAR' })`, `recentSessions`, `loadSession`,
`newChat`, `state.sessionId`. New Chat and the Conversations list are wired to
the store directly — you do **not** pass them as props.

**Props (V2 data + actions):**

```ts
interface SidebarV2Props {
  stories: Story[];
  writingPrompts: WritingPrompt[];
  searchThreshold?: number;            // default 8 — see "Search" below
  conversationsDefaultOpen?: boolean;  // default true
  starredConversationIds?: string[];   // drives the Star/Unstar menu label

  onUploads?: () => void;
  onShareHeirloom?: () => void;
  onSearch?: (query: string) => void;

  onCreateStory?: () => void;          // → open BeginStoryModal
  onInviteToStories?: () => void;      // → open InviteCollaboratorsModal (no story ctx)
  onSelectStory?: (storyId: string) => void;     // open the story
  onStartStoryChat?: (storyId: string) => void;  // new chat in that story

  onSelectPrompt?: (prompt: WritingPrompt) => void;

  onRowAction?: (target: RowTarget, id: string, action: RowAction) => void;
}
```

- **Search** is threshold-gated: it stays a faint hairline (≈40% opacity) until
  `recentSessions.length >= searchThreshold`, or while hovered/focused/non-empty.
  Collapsed sidebar shows a search **icon** only. `onSearch` fires per keystroke;
  filtering is the parent's job (no internal filtering).
- **Conversations** is collapsible (chevron rotates); open state is internal,
  seeded by `conversationsDefaultOpen`.
- **Stories** rows expose **two affordances** (per your answer): the **name**
  opens the story (`onSelectStory`); a **message icon** on hover starts a new
  chat in it (`onStartStoryChat`). `description` becomes the row's `title=`
  (hover tooltip).
- **Create** / **Invite** sit directly under the Stories header, above the list.
- **Per-row kebab menu** (conversations *and* stories): Star · Rename · Invite ·
  Move to chapter · Remove from chapter · Delete. Every choice is delegated via
  `onRowAction(target, id, action)` — the menu owns no mutation. Only rendered
  when `onRowAction` is provided. The Star label flips to "Unstar" when the id is
  in `starredConversationIds`.

```tsx
<SidebarV2
  stories={stories}
  writingPrompts={prompts}
  onUploads={() => setView('uploads')}
  onShareHeirloom={() => setShareOpen(true)}
  onCreateStory={() => setBeginOpen(true)}
  onInviteToStories={() => setInviteOpen(true)}
  onSelectStory={openStory}
  onStartStoryChat={startStoryChat}
  onSelectPrompt={(p) => sendMessage(p.text)}
  onRowAction={handleRowAction}
/>
```

---

## 2 · `BeginStoryModal.tsx`  (props only)

```ts
interface BeginStoryModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}
```

- **Name** (required — Create is disabled until non-empty; Enter submits).
- **Description** (optional; labelled "shown on hover" — it maps to `Story.description`,
  which `SidebarV2` renders as the row tooltip).
- Cancel (`ghost` Button) · Create story (`primary` Button).
- Esc / backdrop / X all call `onClose`. Resets + focuses name on open.

---

## 3 · `ChatDrawerV2.tsx`  (props only)

Right-anchored drawer with two width states. The full-screen toggle
(`Maximize2`/`Minimize2`) sits top-right of the drawer header, beside Close.

```ts
interface ChatDrawerV2Props {
  isOpen?: boolean;                  // default true; slides off-screen when false
  isFullScreen: boolean;            // 100vw (w-screen) when true
  onToggleFullScreen: () => void;
  onClose: () => void;
  title?: string;                    // default "Your Story"
  defaultWidthClassName?: string;    // default 'w-[clamp(680px,50vw,1120px)]'
  children: ReactNode;
}
```

- Default width is **passed in** via `defaultWidthClassName` so you can keep the
  app's *current* width unchanged (you asked to leave it as-is) — pass your
  existing width class. Full screen overrides to `w-screen`.
- `isFullScreen` / `onToggleFullScreen` are owned by the parent (lift the state to
  wherever the drawer is mounted). The component is otherwise stateless.
- Header here is intentionally minimal (title + expand + close). If you want the
  v1 account dropdown, keep `ChatHeader` and instead drop just the expand
  `IconButton` into its right-hand cluster — see "Integration" below.

```tsx
<ChatDrawerV2
  isOpen={isChatOpen}
  isFullScreen={isFull}
  onToggleFullScreen={() => setFull(v => !v)}
  onClose={() => dispatch({ type: 'CLOSE_CHAT' })}
  defaultWidthClassName="w-[clamp(680px,50vw,1120px)]"  // ← your current width
>
  {/* SidebarV2 + transcript + composer */}
</ChatDrawerV2>
```

---

## 4 · `InviteCollaboratorsModal.tsx`  (props only)

```ts
interface InviteCollaboratorsModalProps {
  open: boolean;
  onClose: () => void;
  magicLink: string;                 // e.g. "heirloom.life/join/AB12-CD34-EF56"
  expiresLabel?: string;             // e.g. "Expires in 7 days · Jun 18"
  collaborators: Collaborator[];     // name · relationship · joined/pending
  storyName?: string;                // personalises the copy when present
  onResetLink?: () => void;          // parent rotates the token
  onCopied?: () => void;
}
```

- Magic-link row with a Copy button (clipboard only — no backend). Expiry +
  optional "Reset link". Roster with initial avatars, relationship labels, and a
  joined/pending pill; header shows the `n joined · m pending` count. Footer
  reassurance note. Esc/backdrop/X close.

---

## 5 · `ShareHeirloomModal.tsx`  (props only)

```ts
interface ShareHeirloomModalProps {
  open: boolean;
  onClose: () => void;
  shareUrl?: string;                 // default https://heirloom.life
  shareMessage?: string;
  channels?: ShareChannel[];         // default X / Facebook / LinkedIn / Email
  onCopied?: () => void;
  onShare?: (channelKey: string) => void;
}
```

- 4-up channel grid (intents open in a new tab) + copy-link row. `ShareChannel`
  and `DEFAULT_SHARE_CHANNELS` are exported if you want to customise the set.

---

## Integration notes

1. **Dependencies already in the repo:** `lucide-react`, the `ui/` primitives,
   `chatStore`. No new packages.
2. **Icons used** (lucide-react): `SquarePen, Search, Upload, Share2,
   MessageSquare, BookOpen, ChevronRight, ChevronDown, Plus, UserPlus, Feather,
   Quote, Clock, MoreVertical, Star, Pencil, FolderInput, FolderMinus, Trash2,
   MessageCircle, Maximize2, Minimize2, X, Check, Copy, Link, RefreshCw, Shield,
   Heart, Mail`.
3. **Mounting:** swap `Sidebar` → `SidebarV2` inside `ChatHero` (or your shell),
   and wrap the whole `<section>` in `ChatDrawerV2`. Lift `isFullScreen` to the
   component that owns the drawer.
4. **Modals render relative to the drawer.** They use `absolute inset-0`, so the
   drawer's body (or a wrapping element) must be `position: relative` for them to
   overlay the chat rather than the whole page. (`ChatHero`'s `<section>` works;
   in the preview the drawer body is `relative`.) If you'd rather they cover the
   whole viewport, change `absolute` → `fixed` in each modal's outer div.
5. **State wiring suggestion:** one `activeModal: 'begin' | 'invite' | 'share' | null`
   in the drawer owner; `SidebarV2`'s `onCreateStory` / `onInviteToStories` /
   `onShareHeirloom` set it; each modal's `onClose` clears it.
6. **`onRowAction` is intentionally inert** in these components — Star/Rename/
   Move/Delete just emit the intent. Wire them to your store/session mutations
   (Rename likely opens an inline editor or your existing rename flow; Invite
   typically opens `InviteCollaboratorsModal` with that row's context).
7. **Keeping the v1 account dropdown:** `ChatDrawerV2`'s header is minimal by
   design. Either (a) use `ChatDrawerV2` purely for width + the expand toggle and
   keep rendering `ChatHeader` inside `children`, or (b) add the expand
   `IconButton` (`Maximize2`/`Minimize2`) into `ChatHeader`'s right cluster and
   drop `ChatDrawerV2`'s header. Both are a few lines.
8. **Search has no internal filter** — `onSearch(query)` is the only output; do
   the filtering against your sessions where you hold them.

---

## What was deliberately *not* built (out of scope / no API)

- No data fetching, persistence, or session mutation — every action is a prop
  callback or store call that already exists.
- No "Move to chapter" picker UI — `onRowAction(..., 'moveToChapter')` just fires;
  present your own chapter picker.
- Rename is emitted as an action, not an inline-edit field (v1 has no rename
  affordance to match; add one in the row if you want parity with the prototype).
