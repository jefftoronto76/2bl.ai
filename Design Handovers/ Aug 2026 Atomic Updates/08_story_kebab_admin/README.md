# Handover — Story kebab: add "Admin" (members + description)

Source: `chat-widget-canvas.jsx`, `Sidebar` component's story-row kebab menu
(shared mobile/desktop) + new `StoryAdminPanel` component.

## Diff

**Kebab menu item added**, between Rename and the existing delete divider:

```js
// BEFORE
{[['star', st.starred ? 'Unstar' : 'Star', 'star'], ['pen', 'Rename', 'rename']].map(([ic, lbl, act]) => (

// AFTER
{[['star', st.starred ? 'Unstar' : 'Star', 'star'], ['pen', 'Rename', 'rename'], ['shield', 'Admin', 'admin']].map(([ic, lbl, act]) => (
```

**New handler**, wired to both `<Sidebar>` render sites (mobile drawer +
docked desktop):

```js
const storyRowAction = (id, act) => { if (act === 'admin') setAdminStoryId(id); };
// passed as onStoryRowAction={storyRowAction}
```

**New right-side sliding panel** (`StoryAdminPanel`), same slide-in pattern
as the existing "Add memories to this story" panel (`position: fixed`,
right-anchored, `width: min(400px, 100vw)`, translateX transition):

- **Description**: a textarea seeded from `story.tagline`, committed
  on blur (`onRename(tagline)` → `setStories` patch). This is the same field
  the Create Story modal writes on story creation — Admin just makes it
  editable after the fact.
- **Members**: a roster list (reuses the same collaborator shape as the
  Invite modal — name, relationship, joined date, memory count) with a
  **Remove** action per row. Remove opens a confirm dialog ("Remove
  [name] from this story? They'll lose access immediately.") before
  actually removing.

## Known

- Kebab is one shared component for mobile and desktop — this ships on both
  automatically, no separate mobile handling needed.
- Member data in the prototype is a shared seed array (`SEED_COLLABS`), same
  one the Invite modal's roster uses — not per-story in this mock. On `main`,
  members would come from the real story-invite/collaborator fetch already
  used by `InviteCollaboratorsModal` (`GET /api/heirloom/story-invites?story_id=...`,
  per `ChatHero.tsx`), scoped to the story being administered.
- Removing a member here is UI-only in the prototype (local state filter +
  toast). On `main` this needs a real revoke endpoint — no such endpoint was
  found in this session's reading of `ChatHero.tsx`/`InviteCollaboratorsModal.tsx`;
  today's invite flow only supports invalidating a whole link, not removing
  one already-joined member.

## Open questions

- **Backing endpoint for member removal** doesn't exist yet on `main` as far
  as this session confirmed — needs a real "revoke this member's access"
  API, distinct from "invalidate the invite link" (which the invite modal
  already has). Scope that before wiring this to production data.
- **Who can see "Admin"?** The kebab shows it to whoever can open the story
  menu at all — no owner/role check exists in the prototype (nor, per the
  invite-modal handovers, does a role system exist yet on `main`). If
  "Admin" should be owner-only, that gating needs to be designed and is not
  covered here.
- Star/Rename in this same kebab were found to be unwired on both `<Sidebar>`
  render sites in this codebase (`onStoryRowAction` was never passed before
  this change) — pre-existing, not introduced by this handover, but worth
  fixing in the same pass since the prop is now wired anyway.
