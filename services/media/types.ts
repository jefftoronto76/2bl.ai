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
}
