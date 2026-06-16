import { getAdminClient } from '@/services/auth/supabase-admin'

const BUCKET = 'assets'

/**
 * Generates a signed upload URL for direct client-to-Supabase uploads.
 * The client PUT's the file binary to this URL — it never passes through our server.
 */
export async function generateSignedUploadUrl(storagePath: string): Promise<{
  signedUrl: string
  token: string
}> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (error || !data) throw new Error(`Failed to create signed upload URL: ${error?.message}`)
  return { signedUrl: data.signedUrl, token: data.token }
}

/**
 * Generates a short-lived signed download URL for member-facing access (60s expiry).
 */
export async function generateSignedDownloadUrl(storagePath: string): Promise<string> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60)

  if (error || !data) throw new Error(`Failed to create signed download URL: ${error?.message}`)
  return data.signedUrl
}

/**
 * Generates a long-lived signed URL for background processing jobs (1 hour expiry).
 * Used for Deepgram batch transcription where processing time may be significant.
 */
export async function generateLongLivedSignedUrl(storagePath: string): Promise<string> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)

  if (error || !data) throw new Error(`Failed to create long-lived signed URL: ${error?.message}`)
  return data.signedUrl
}

/**
 * Builds the storage path for a media upload.
 * Distinct from admin document paths ({tenant_id}/{content_id}/{filename}) — the
 * media/ segment ensures no collision with existing assets.
 */
export function buildMediaStoragePath(
  tenantId: string,
  memberId: string,
  mediaItemId: string,
  filename: string,
): string {
  return `${tenantId}/media/${memberId}/${mediaItemId}/${filename}`
}
