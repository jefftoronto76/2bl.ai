// components/shells/membership/v2/types.ts
//
// Shared V2 domain types. Extracted from SidebarV2.tsx at integration (the
// handover shipped them inline there; see HANDOVER.md "Note on tsx only") so
// the modals don't import types from a component file.

export interface Collaborator {
  name: string;
  /** Optional — real collaborators come from artifact_subscribers joined to
   *  members (see services/crm/story-invites.ts's listStoryCollaborators),
   *  and members has no relationship column. Only render this line when set. */
  relationship?: string;
  /** Every real collaborator has joined by construction — a roster row only
   *  exists once acceptStoryInvite has written the artifact_subscribers
   *  grant. No 'pending' state exists to represent. */
  status: 'joined';
  /** e.g. "Aug 3" — pre-formatted by the caller from artifact_subscribers.created_at. */
  joinedDate: string;
  /** Memories this collaborator has added to the story. Undefined (not 0)
   *  until story <-> memory linking (artifact_containments) is wired — see
   *  System Docs/Known Gaps.md. Never fabricate a number here. */
  memoryCount?: number;
}

export interface Story {
  id: string;
  name: string;
  /** Surfaced as the row's hover tooltip. */
  description?: string;
  collaborators?: Collaborator[];
  /** True when the story has an active invite link and/or any subscriber —
   *  from GET/POST /api/stories (services/crm/stories.ts's listStories).
   *  Drives ConfirmDeleteModal's extra warning line. */
  hasActiveInviteOrSubscribers?: boolean;
  /** True when the signed-in caller is this story's owner (its artifacts
   *  row's user_id) — from GET/POST /api/stories (services/crm/stories.ts's
   *  listStories/createStory). Drives SidebarV2's story-row kebab: a
   *  collaborator reached the story only via artifact_subscribers and has no
   *  way to coordinate row-level actions (star/rename/invite/delete/admin)
   *  with the owner (no inter-member chat exists), so the kebab trigger is
   *  hidden entirely when this is false rather than gating individual menu
   *  items (2026-08-13, supersedes the old "deliberately unrestricted in
   *  V1" note this field used to carry). */
  isOwner?: boolean;
}

export interface WritingPrompt {
  id: string;
  text: string;
}

// 'memory' isn't a sidebar row target (SidebarV2's kebab only ever produces
// 'conversation'/'story') — it rides this same union because ChatHero.tsx's
// pendingDelete state and ConfirmDeleteModal are shared across all three
// delete flows (memory-panel-layout CardView chrome pass, 2026-08-08),
// not because a memory row exists in the sidebar.
export type RowTarget = 'conversation' | 'story' | 'memory';
// 'invite' dropped 2026-08-10 (invites-collaboration-modal): it was a
// deliberate no-op buried in the kebab for both row types (see Known Gaps.md)
// and is superseded by SidebarV2's dedicated per-story-row invite icon
// (onInviteStory), not routed through onRowAction anymore.
// 'admin' added 2026-08-13 (Updated Story Kebabs handover) — story-only
// (SidebarV2's MENU_ITEMS gates it via `targets`), opens the story admin
// panel (member roster + description). The panel itself isn't built yet —
// this pass only wires the click through to ChatHero.tsx's adminStoryId
// state; see System Docs/Known Gaps.md.
export type RowAction =
  | 'star'
  | 'rename'
  | 'admin'
  | 'moveToChapter'
  | 'removeFromChapter'
  | 'delete';
