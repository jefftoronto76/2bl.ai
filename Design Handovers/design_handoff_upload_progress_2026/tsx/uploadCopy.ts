// uploadCopy.ts — copy tables for the upload-specific memory-card states
// (running/ready/error). Mirrors memoryKinds.ts's per-kind-table pattern:
// everything that varies by kind lives here, components read from it only.
//
// KNOWN UNKNOWN: ticker timing (1.3s/step) and the 92% progress cap are
// prototype conventions with no real upload/analysis signal behind them —
// see the handoff doc §"Known unknowns."

import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'

/** Per-kind ticker copy for UploadRunningCard, advancing ~1.3s/step while the upload is in flight. */
export const UPLOAD_TICKER: Record<MemorySourceKind, string[]> = {
  conversation: ['Gathering this memory', 'Finding the words', 'Almost there'],
  photo: ['Uploading your photo', 'Looking closely', 'Remembering the moment', 'Almost there'],
  video: ['Uploading your video', 'Watching this back', 'Almost there'],
  audio: ['Uploading your recording', 'Listening in', 'Almost there'],
  document: ['Uploading your document', 'Reading this over', 'Almost there'],
}

/** Default title for a captionless upload once it lands on UploadReadyCard — no passage, so no AI title either. */
export const UPLOAD_DEFAULT_TITLE: Partial<Record<MemorySourceKind, string>> = {
  photo: 'A photograph, kept',
  video: 'A moment on film, kept',
  audio: 'A voice, kept',
  document: 'A paper, kept',
}
