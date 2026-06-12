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
}

export interface WritingPrompt {
  id: string;
  text: string;
}

export type RowTarget = 'conversation' | 'story';
export type RowAction =
  | 'star'
  | 'rename'
  | 'invite'
  | 'moveToChapter'
  | 'removeFromChapter'
  | 'delete';
