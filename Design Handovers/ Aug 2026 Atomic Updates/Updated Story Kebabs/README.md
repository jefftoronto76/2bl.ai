# Handover — Story kebab: add "Admin" (members + description panel)

Add an "Admin" action to the story row's kebab menu, opening a right-side
panel with an editable story description and a member roster (remove/revoke
access). On both mobile and desktop — `SidebarV2`'s kebab is one shared
component for both.

Source: `production-reference/SidebarV2.tsx` + `types.ts` (fresh pulls from
`main`, 2026-08-13). `prototype-reference/chat-widget-canvas.jsx` has this
fully built and verified live — the panel, the confirm-before-remove step,
and the kebab wiring.

## Built and verified (prototype)

**Kebab menu item**, between Rename and the delete divider:

```js
// BEFORE
{[['star', st.starred ? 'Unstar' : 'Star', 'star'], ['pen', 'Rename', 'rename']].map(([ic, lbl, act]) => (

// AFTER
{[['star', st.starred ? 'Unstar' : 'Star', 'star'], ['pen', 'Rename', 'rename'], ['shield', 'Admin', 'admin']].map(([ic, lbl, act]) => (
```

**Handler**, wired to both `<Sidebar>` render sites (mobile drawer + docked
desktop — same component, so one wire-up covers both):

```js
const storyRowAction = (id, act) => { if (act === 'admin') setAdminStoryId(id); };
// passed as onStoryRowAction={storyRowAction}
```

**`StoryAdminPanel`** — new right-side sliding panel, same pattern as the
existing "Add memories to this story" panel (`position: fixed`, right-anchored,
`width: min(400px, 100vw)`, translateX transition):

- **Description** — textarea seeded from the story's tagline, committed on
  blur. Same field the Create Story modal writes on creation; this just makes
  it editable afterward.
- **Members** — roster list (name, relationship, joined date, memory count)
  with a **Remove** action per row. Remove opens a confirm dialog ("Remove
  [name] from this story? They'll lose access immediately.") before actually
  removing.

## Target on `main`

1. **`types.ts`** — `RowAction` has no `'admin'` value today:
   ```ts
   export type RowAction = 'star' | 'rename' | 'moveToChapter' | 'removeFromChapter' | 'delete';
   ```
   Add `'admin'` to the union.

2. **`SidebarV2.tsx`'s `MENU_ITEMS`** is currently shared between
   conversation and story rows (`RowMenu` takes the same array regardless of
   `target`):
   ```tsx
   const MENU_ITEMS: { key: RowAction; icon: typeof Star; label: string; danger?: boolean }[] = [
     { key: 'star', icon: Star, label: 'Star' },
     { key: 'rename', icon: Pencil, label: 'Rename' },
     { key: 'moveToChapter', icon: FolderInput, label: 'Move to chapter' },
     { key: 'removeFromChapter', icon: FolderMinus, label: 'Remove from chapter' },
     { key: 'delete', icon: Trash2, label: 'Delete', danger: true },
   ];
   ```
   "Admin" is story-only — `RowMenu` needs either a second items array passed
   in per `target`, or an inline filter (e.g. `MENU_ITEMS.filter(it => it.key !== 'admin' || target === 'story')`
   plus adding the Admin entry only to the story-row call site). Use a
   `shield`-equivalent icon (lucide `Shield`, not currently imported).

3. **New panel** — `StoryAdminPanel`, following the same slide-in pattern
   `ChatHero.tsx` already uses for the memory/media third-pane (fixed
   right-anchored overlay, not inline in the sidebar). Needs new state in
   `ChatHero.tsx` (`adminStoryId`, mirroring `openMemory`/`mediaOpen`) and a
   render site alongside the existing modals.

## Known knowns

- Kebab is one shared component for mobile and desktop (`SidebarV2.tsx`
  itself, not forked) — ships on both automatically once built.
- `RowMenu`'s current `MENU_ITEMS` array is NOT target-aware (same five items
  render for both `'conversation'` and `'story'` rows) — Admin is the first
  action that needs to be story-only, which the current structure doesn't
  support without a change.
- Member data in the prototype reuses the same collaborator shape as the
  Invite modal (`Collaborator` type in `types.ts` — name, `joinedDate`,
  `memoryCount`). On `main`, real members come from
  `GET /api/heirloom/story-invites?story_id=...` (already used by
  `InviteCollaboratorsModal`), scoped to the story being administered.

## Known unknowns

- **No member-removal endpoint exists on `main`.** Today's invite flow only
  supports invalidating a whole link (`DELETE /api/heirloom/story-invites`),
  not revoking one already-joined member. Needs a real "revoke this
  member's access" API before this can be wired to production data.
- **Who can see "Admin"?** No owner/role check exists in the prototype, and
  per the invite-modal handovers, no role system exists yet on `main` either.
  If Admin should be owner-only, that gating isn't designed yet.
- Star/Rename on story rows were found to route through `onRowAction`, which
  IS wired on `main` (unlike the prototype, where the equivalent prop was
  found unwired before this session's fix) — so `main`'s Star/Rename should
  already work; only Admin is genuinely new here.
