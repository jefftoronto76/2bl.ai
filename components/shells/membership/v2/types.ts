// components/shells/membership/v2/types.ts
//
// Shared V2 domain types. Extracted from SidebarV2.tsx at integration (the
// handover shipped them inline there; see HANDOVER.md "Note on tsx only") so
// the modals don't import types from a component file.

export interface Collaborator {
  name: string;
  relationship: string;
  status: 'joined' | 'pending';
}

export interface Story {
  id: string;
  name: string;
  /** Surfaced as the row's hover tooltip. */
  description?: string;
  collaborators?: Collaborator[];
  /** True when the story has an active invite link and/or any subscriber —
   *  from GET/POST /api/stories (services/crm/stories.ts's listStories).
   *  Drives ConfirmDeleteModal's extra warning line; not used to gate the
   *  Invite/Delete controls themselves (deliberately unrestricted in V1). */
  hasActiveInviteOrSubscribers?: boolean;
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
export type RowAction =
  | 'star'
  | 'rename'
  | 'moveToChapter'
  | 'removeFromChapter'
  | 'delete';
