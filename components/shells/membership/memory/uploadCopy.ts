// components/shells/membership/memory/uploadCopy.ts — copy tables for the
// upload-specific memory-card states (running/ready/error). Mirrors
// memoryKinds.ts's per-kind-table pattern: everything that varies by kind
// lives here, components read from it only.
//
// Ticker timing (1.3s/step, in UploadRunningCard.tsx) is a cosmetic
// "something is happening" cadence — the real backend has no fine-grained
// progress signal (media_items.status is only pending/processing/ready/
// failed), so the ticker text cycles on its own harmless interval and never
// gates which card renders; that's driven by the real status (see
// UploadCard.tsx). The progress bar itself is indeterminate for the same
// reason (see Design Handovers/design_handoff_upload_progress_2026/HANDOFF_UPLOAD_FLOW.md
// and the staged implementation plan this shipped from).

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
