// components/shells/membership/memory/memoryKinds.ts
//
// MEMORY_KINDS — the card's whole presentation, keyed by source kind.
// Everything that varies by kind lives in this table; MemoryCard reads from
// it and nothing else. Adding a sixth kind means adding a row here, not
// editing the component.
//
// What must NEVER vary: the action spine (Keep this · Rewrite · Discard),
// its order, or its position — that's built directly into MemoryCard, not
// driven from this table. Type-specific actions go on their own row above it.
//
// Carried over from the design handoff (Design Handovers/heirloom_chat_handoffV2_2026_July 28/memories/MemoryKinds.ts)
// with one change: no `slots` distinction removal — kept as specced. Type-
// specific actions are specified but not built this pass (they fire a
// lightweight local toast) — see MemoryCard.tsx.

import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'

export interface MemoryKindSpec {
  /** lucide-react icon name (kebab-case) — used in the running pill, card header, and saved receipt. */
  icon: string
  /** mono eyebrow in the card header. */
  eyebrow: string
  /** copy shown beside the pulsing icon in the running state. */
  running: string
  /** which media block to render above the title, if any. Every media block is a placeholder this pass — no upload, no real thumbnail/waveform. */
  media: null | 'still' | 'video' | 'audio' | 'page'
  /** whether the "add photos later" slots appear — false where media IS the hero. */
  slots: boolean
  /** type-specific actions: [label, toast copy]. Rendered ABOVE the spine. Fire a toast — undesigned this pass. */
  extra: Array<[label: string, toastCopy: string]>
}

export const MEMORY_KINDS: Record<MemorySourceKind, MemoryKindSpec> = {
  conversation: {
    icon: 'feather',
    eyebrow: 'A memory, written up',
    running: 'Gathering this memory…',
    media: null,
    slots: true,
    extra: [],
  },
  photo: {
    icon: 'image',
    eyebrow: 'A photograph, remembered',
    running: 'Looking at this photograph…',
    media: 'still',
    slots: false,
    extra: [["Who's in this?", 'Tagging people is coming soon.'], ['Add another', 'Adding more photos is coming soon.']],
  },
  video: {
    icon: 'video',
    eyebrow: 'A moment on film',
    running: 'Watching this back…',
    media: 'video',
    slots: false,
    extra: [['Choose a still', 'Picking a still frame is coming soon.']],
  },
  audio: {
    icon: 'mic',
    eyebrow: 'In your own voice',
    running: 'Listening to this…',
    media: 'audio',
    slots: true,
    extra: [['Keep the recording', 'Saving the original recording is coming soon.']],
  },
  document: {
    icon: 'file-text',
    eyebrow: 'From your papers',
    running: 'Reading this over…',
    media: 'page',
    slots: true,
    extra: [['Check the transcription', 'Viewing the transcription is coming soon.']],
  },
}

export function memoryKindOf(kind: MemorySourceKind): MemoryKindSpec {
  return MEMORY_KINDS[kind] ?? MEMORY_KINDS.conversation
}
