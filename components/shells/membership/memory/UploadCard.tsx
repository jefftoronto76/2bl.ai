'use client'

/**
 * UploadCard — selects which of the three upload-progress cards to render
 * for a given real media_items row, keyed off its actual status. This is
 * the one place that decision is made; the three cards themselves are pure
 * presentational components that don't know about status at all.
 *
 *   undefined (not yet hydrated into mediaItems) / 'pending' / 'processing' -> UploadRunningCard
 *   'ready'                                                                -> UploadReadyCard
 *   'failed'                                                               -> UploadErrorCard
 *
 * Client-side upload failures (userMsg.failures in MessageList.tsx — the
 * file never reached the server, so there is no media_items row and no id
 * to retry against) are NOT routed through here — they stay on the existing
 * FailedUploadChip. Structural, not stylistic: this component's retry
 * button has nothing to call for that case.
 */

import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import type { ClientMediaItem } from '../chatStore'
import { sanitizeFailureReason } from '@/services/media/errorCopy'
import { UploadRunningCard } from './UploadRunningCard'
import { UploadReadyCard } from './UploadReadyCard'
import { UploadErrorCard } from './UploadErrorCard'

export interface UploadCardProps {
  item: ClientMediaItem | undefined
  sourceKind: MemorySourceKind
  onDiscard: () => void
}

export function UploadCard({ item, sourceKind, onDiscard }: UploadCardProps) {
  if (item?.status === 'ready') {
    return <UploadReadyCard sourceKind={sourceKind} onDiscard={onDiscard} />
  }

  if (item?.status === 'failed') {
    return (
      <UploadErrorCard
        sourceKind={sourceKind}
        errorMessage={sanitizeFailureReason(item.error_message)}
        onRetry={() => {
          void fetch(`/api/media/${item.id}/retry`, { method: 'POST' })
        }}
        onDiscard={onDiscard}
      />
    )
  }

  // undefined | 'pending' | 'processing'
  return <UploadRunningCard sourceKind={sourceKind} />
}
