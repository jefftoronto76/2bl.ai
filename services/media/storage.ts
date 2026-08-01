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
 * Checks whether an object actually exists in Storage yet, via the list() API
 * (not a HEAD request against a signed URL — list() is a documented, stable
 * Storage API, whereas relying on HEAD semantics against a signed download
 * URL is unverified and would be a worse foundation for a retry loop).
 *
 * Used to close the race between the media_items INSERT (which fires the
 * processing webhook immediately) and the client's PUT of the file bytes
 * (a separate, slightly-later request) — see waitForStorageObject in
 * services/media/processor.ts.
 */
export async function objectExists(storagePath: string): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf('/')
  const folder = storagePath.slice(0, lastSlash)
  const filename = storagePath.slice(lastSlash + 1)

  const supabase = getAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: filename, limit: 1 })

  if (error || !data) return false
  return data.some(f => f.name === filename)
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
