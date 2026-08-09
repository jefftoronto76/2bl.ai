export type MediaItemStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type MediaItemType = 'audio' | 'image' | 'document'

export interface MediaItem {
  id: string
  tenant_id: string
  member_id: string
  chat_id: string | null
  story_id: string | null
  type: MediaItemType
  original_filename: string
  storage_path: string
  file_size_bytes: number
  mime_type: string
  status: MediaItemStatus
  derived_content: string | null
  classification: string | null
  error_message: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
  /**
   * Decimal degrees, extracted from the photo's own EXIF GPS tags
   * (services/media/processor.ts's extractGpsCoordinates, GPS Extraction
   * pass, 2026-08-08). Both null together for every non-image item, and for
   * the common image case too — most photos carry no GPS data at all
   * (screenshots, downloads, location services off) — this is the expected
   * default, not a failure signal. Raw coordinates only: no
   * reverse-geocoding, no map, no tap behavior. Optional (not just
   * nullable) — same posture as MemoryRow.media_item_id when that column
   * was added — so the many existing MediaItem test fixtures that predate
   * this column don't all need updating; a real DB row always has it
   * populated (a number or null, never actually absent).
   */
  latitude?: number | null
  longitude?: number | null
}
