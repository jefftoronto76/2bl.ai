/**
 * MEMORY_KINDS — the card's whole presentation, keyed by source type.
 *
 * The card is typed by what the memory was saved AROUND. Everything that varies
 * lives in this table; the card component reads from it and nothing else.
 * Adding a sixth kind should mean adding a row here, not editing the component.
 *
 * What must NEVER vary: the action spine (Keep this · Rewrite · Discard),
 * its order, or its position. Type-specific actions go on their own row above.
 */

export type MemoryKind = 'conversation' | 'photo' | 'video' | 'audio' | 'document';

export type MemoryKindSpec = {
  /** lucide icon name — used in the running pill, card header, and saved receipt */
  icon: string;
  /** mono eyebrow in the card header */
  eyebrow: string;
  /** copy shown beside the pulsing icon in the running state */
  running: string;
  /** which media block to render above the title, if any */
  media: null | 'still' | 'video' | 'audio' | 'page';
  /** whether the "add photos later" slots appear — false where media IS the hero */
  slots: boolean;
  /** type-specific actions: [lucide icon, label]. Rendered ABOVE the spine. */
  extra: Array<[string, string]>;
};

export const MEMORY_KINDS: Record<MemoryKind, MemoryKindSpec> = {
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
    extra: [['users', 'Who’s in this?'], ['image-plus', 'Add another']],
  },
  video: {
    icon: 'video',
    eyebrow: 'A moment on film',
    running: 'Watching this back…',
    media: 'video',
    slots: false,
    // Assumes a still can be picked client-side from the uploaded video. UNVERIFIED.
    extra: [['crop', 'Choose a still']],
  },
  audio: {
    icon: 'mic',
    eyebrow: 'In your own voice',
    running: 'Listening to this…',
    media: 'audio',
    slots: true,
    extra: [['mic', 'Keep the recording']],
  },
  document: {
    icon: 'file-text',
    eyebrow: 'From your papers',
    running: 'Reading this over…',
    media: 'page',
    slots: true,
    // Assumes OCR/transcription exists server-side. UNVERIFIED — see README §2.
    extra: [['scan-line', 'Check the transcription']],
  },
};

export const kindOf = (k?: string): MemoryKindSpec =>
  MEMORY_KINDS[(k as MemoryKind) ?? 'conversation'] ?? MEMORY_KINDS.conversation;
