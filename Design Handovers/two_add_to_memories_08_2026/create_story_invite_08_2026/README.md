# Handover \u2014 Create Story & Invite Collaborators

Source: `production-reference/chat-widget-canvas.jsx`. Two separate modals, both entered from the sidebar's "Stories" footer section (Create / Invite icon buttons) and from a few contextual triggers elsewhere.

## Create Story (`function CreateStoryModal`, ~line 1520)
**Fields:** Name (required, autofocus, single-line, Enter submits), Description (optional, 3-row textarea, labeled "optional, shown on hover"). Submit disabled until Name is non-empty (`canCreate`).

**Visual pattern:** centered modal, backdrop blur, 46px accent-soft icon badge (`bookOpen` icon) at top, `hl-modal-in` entrance animation, Escape-to-close. This is the shared modal chrome pattern used across the app (`ConfirmDeleteModal`, `InviteModal` use the same shell) \u2014 don't invent a new one.

**Wiring:** `onCreate` prop \u2192 App's `createStory(name, description)` (~line 2006):
- Generates a client-side id (`'st' + Date.now()`), appends `{ id, name, tagline: description }` to `stories` state.
- If `pendingStoryAttachRef` is set (see below), the newly created story id is attached to that pending memory's `storyId` \u2014 this is the "start a story from a memory prompt" flow, not the plain sidebar entry point.
- Closes the modal (`setBeginOpen(false)`) and flashes "Story created".

**Two entry points:**
1. Sidebar "Stories" footer \u2192 "Create" button \u2192 `onCreateStory={() => setBeginOpen(true)}`, no pending attachment.
2. `handleStoryPrompt` (~line 2013), triggered when a member accepts an inline "start a story?" prompt after a memory is kept \u2014 sets `pendingStoryAttachRef.current = memId` before opening the modal, so the new story picks up that memory automatically on create.

## Invite Collaborators (`function InviteModal`, ~line 1429)
**Structure**, top to bottom:
1. Header: 46px accent icon badge (`userPlus`), title "Invite collaborators", contextual copy \u2014 if opened with a `context` string (e.g. a memory title), the copy references it in italics; otherwise generic copy.
2. **Magic link row**: mono-font truncated link, Copy button (flips to a checkmark + "Copied" for ~1.9s), expiry label ("Expires in 7 days \u00b7 {date}"), and a "Reset link" action that regenerates the token and briefly flashes the link row's border.
3. **Already invited** section: avatar-initial circles, name + relationship line, and a status pill (`joined` = accent-tinted with a dot, `pending` = neutral-tinted) per collaborator, with a joined/pending count summary above the list.
4. Footer note: shield icon + "You stay the author..." reassurance line \u2014 static copy, always shown.

**Wiring:**
- Link generation: `LINK_BASE + makeToken()` (search `makeToken`) \u2014 a random-looking 12-character token in `XXXX-XXXX-XXXX` form, purely cosmetic/client-side, not a real invite system.
- `expiry` is `Date.now() + 7 * 864e5` (7 days), regenerated alongside the link on reset.
- `collaborators` is static seed data (`SEED_COLLABS`) \u2014 no real invite send/accept flow exists.
- Copy-to-clipboard uses `navigator.clipboard.writeText`.

**Entry points:** Sidebar "Stories" footer \u2192 "Invite" button (`onInviteAll={() => setInvite({ context: null })}`), and any other call site that sets `invite` with a `context` string (e.g. from a memory's detail view) to get the contextual copy variant.

## Known-knowns
- Both modals share the same visual chrome (centered card, backdrop, icon badge header, Escape-to-close) \u2014 reuse that shell for any new modal rather than styling one from scratch.
- Invite's magic link, token, expiry, and collaborator list are all prototype-only \u2014 no backend, no real email/link delivery.
- Create Story's "attach to a pending memory" behavior only fires when entered via the in-context story prompt, not the plain sidebar button \u2014 don't assume every Create submission attaches something.

## Unknown-knowns
- No decision on real invite delivery (email? SMS? both?) or real link expiry/security behavior \u2014 flagging so it isn't assumed settled by this prototype.
- No permissions model beyond the static "collaborators can read and add, never edit yours" copy \u2014 not enforced anywhere in code, just stated in the UI.
- Story creation has no validation beyond "name is non-empty" (no duplicate-name check, no length limit) \u2014 unverified whether that's sufficient for production.
