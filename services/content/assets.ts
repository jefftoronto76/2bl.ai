// services/content/assets.ts
//
// Document-asset ingestion: text extraction (PDF via Anthropic, DOCX via
// mammoth, TXT via Buffer) plus the content-row insert + Supabase Storage
// upload. The app/api/admin/assets/upload route is a thin consumer: it owns
// auth, multipart parsing, and file validation (size/type), then calls
// extractText + createDocumentAsset. Behavior is identical to the prior inline
// route logic — same Anthropic request, same queries, same storage path, same
// non-fatal storage handling, same log strings.

import mammoth from 'mammoth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { isMediaAuditEnabled, logAiMediaEvent } from '@/services/media'
import { AuditAction } from '@/services/audit/types'
import type { AuthScope, ContentResult } from './types'

/**
 * Attributes the PDF Files API events below (upload/extraction/cleanup) to a
 * real media_items row. Optional because extractText/extractTextFromPdf are
 * also called from the unrelated admin document-upload flow
 * (app/api/admin/assets/upload/route.ts), which has no media_items row at
 * all — that caller omits this context and simply gets no audit logging for
 * these steps, unchanged from its existing behavior.
 */
export interface MediaAuditContext {
  tenant_id: string
  member_id: string
  media_item_id: string
  correlation_id: string
}

export const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// Files API (beta) is used instead of inlining the PDF as base64 — inline
// base64 hits Anthropic's documented 32MB per-request payload limit well
// before this app's own 50MB upload cap (app/api/media/upload-url/route.ts),
// so any document in that gap failed outright. Uploading once and
// referencing by file_id keeps the request payload small regardless of file
// size. See platform.claude.com/docs/en/build-with-claude/pdf-support.
const ANTHROPIC_FILES_BETA_HEADER = 'files-api-2025-04-14'

async function uploadFileToAnthropic(buffer: Buffer, apiKey: string, ctx?: MediaAuditContext): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([Uint8Array.from(buffer)], { type: 'application/pdf' }), 'document.pdf')

  const res = await fetch('https://api.anthropic.com/v1/files', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': ANTHROPIC_FILES_BETA_HEADER,
    },
    body: form,
  })

  if (!res.ok) {
    const errorBody = await res.text()
    const errorMessage = `Anthropic file upload error: ${res.status} ${errorBody}`
    if (ctx && isMediaAuditEnabled()) {
      await logAiMediaEvent({
        tenant_id: ctx.tenant_id,
        member_id: ctx.member_id,
        media_item_id: ctx.media_item_id,
        action: AuditAction.MEDIA_FILE_UPLOAD_FAILED,
        outcome: 'failure',
        correlation_id: ctx.correlation_id,
        metadata: { status: res.status, error_message: errorMessage, timestamp: new Date().toISOString() },
      })
    }
    throw new Error(errorMessage)
  }

  const data = (await res.json()) as { id: string }
  if (ctx && isMediaAuditEnabled()) {
    await logAiMediaEvent({
      tenant_id: ctx.tenant_id,
      member_id: ctx.member_id,
      media_item_id: ctx.media_item_id,
      action: AuditAction.MEDIA_FILE_UPLOAD_RECEIVED,
      outcome: 'success',
      correlation_id: ctx.correlation_id,
      metadata: { file_id: data.id, byte_length: buffer.length, timestamp: new Date().toISOString() },
    })
  }
  return data.id
}

/**
 * Best-effort cleanup — the PDF's original binary is already durably stored
 * in Supabase Storage, so the Anthropic-side copy is purely transient for
 * this one extraction call. Never let a failed delete mask the real
 * extraction result; a missed delete here is a wasted-storage concern, not a
 * correctness one, since Anthropic-side files also auto-expire.
 */
async function deleteAnthropicFile(fileId: string, apiKey: string, ctx?: MediaAuditContext): Promise<void> {
  try {
    const res = await fetch(`https://api.anthropic.com/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': ANTHROPIC_FILES_BETA_HEADER,
      },
    })
    if (!res.ok && ctx && isMediaAuditEnabled()) {
      await logAiMediaEvent({
        tenant_id: ctx.tenant_id,
        member_id: ctx.member_id,
        media_item_id: ctx.media_item_id,
        action: AuditAction.MEDIA_FILE_CLEANUP_FAILED,
        outcome: 'failure',
        correlation_id: ctx.correlation_id,
        metadata: { file_id: fileId, status: res.status, timestamp: new Date().toISOString() },
      })
    }
  } catch (err) {
    if (ctx && isMediaAuditEnabled()) {
      await logAiMediaEvent({
        tenant_id: ctx.tenant_id,
        member_id: ctx.member_id,
        media_item_id: ctx.media_item_id,
        action: AuditAction.MEDIA_FILE_CLEANUP_FAILED,
        outcome: 'failure',
        correlation_id: ctx.correlation_id,
        metadata: {
          file_id: fileId,
          error_message: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
      })
    }
  }
}

async function extractTextFromPdf(buffer: Buffer, ctx?: MediaAuditContext): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const fileId = await uploadFileToAnthropic(buffer, apiKey, ctx)

  try {
    const requestBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'file',
                file_id: fileId,
              },
            },
            {
              type: 'text',
              text: 'Extract all text from this document exactly as written. Return only the extracted text with no commentary.',
            },
          ],
        },
      ],
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': ANTHROPIC_FILES_BETA_HEADER,
      },
      body: JSON.stringify(requestBody),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      const errorMessage = `Anthropic API error: ${res.status} ${errorBody}`
      if (ctx && isMediaAuditEnabled()) {
        await logAiMediaEvent({
          tenant_id: ctx.tenant_id,
          member_id: ctx.member_id,
          media_item_id: ctx.media_item_id,
          action: AuditAction.MEDIA_PDF_EXTRACTION_FAILED,
          outcome: 'failure',
          correlation_id: ctx.correlation_id,
          metadata: { status: res.status, error_message: errorMessage, timestamp: new Date().toISOString() },
        })
      }
      throw new Error(errorMessage)
    }

    const data = await res.json()
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')

    if (!textBlock?.text) {
      if (ctx && isMediaAuditEnabled()) {
        await logAiMediaEvent({
          tenant_id: ctx.tenant_id,
          member_id: ctx.member_id,
          media_item_id: ctx.media_item_id,
          action: AuditAction.MEDIA_PDF_EXTRACTION_FAILED,
          outcome: 'failure',
          correlation_id: ctx.correlation_id,
          metadata: {
            error_message: 'No text returned from Anthropic',
            stop_reason: data.stop_reason ?? null,
            content_block_count: data.content?.length ?? 0,
            timestamp: new Date().toISOString(),
          },
        })
      }
      throw new Error('No text returned from Anthropic')
    }

    if (ctx && isMediaAuditEnabled()) {
      await logAiMediaEvent({
        tenant_id: ctx.tenant_id,
        member_id: ctx.member_id,
        media_item_id: ctx.media_item_id,
        action: AuditAction.MEDIA_PDF_EXTRACTION_RECEIVED,
        outcome: 'success',
        correlation_id: ctx.correlation_id,
        metadata: {
          stop_reason: data.stop_reason ?? null,
          content_block_count: data.content?.length ?? 0,
          extracted_text_length: textBlock.text.length,
          timestamp: new Date().toISOString(),
        },
      })
    }

    return textBlock.text
  } finally {
    await deleteAnthropicFile(fileId, apiKey, ctx)
  }
}

/** Extract raw text from an uploaded document buffer. Throws on failure. */
export async function extractText(buffer: Buffer, mimeType: string, ctx?: MediaAuditContext): Promise<string> {
  const fileType = ACCEPTED_TYPES[mimeType]

  switch (fileType) {
    case 'pdf': {
      return extractTextFromPdf(buffer, ctx)
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer })
      return result.value
    }
    case 'txt': {
      return buffer.toString('utf-8')
    }
    default:
      throw new Error(`Unsupported file type: ${mimeType}`)
  }
}

export interface CreateDocumentAssetInput {
  name: string
  raw: string
  fileBuffer: ArrayBuffer
  contentType: string
}

export interface DocumentAsset {
  content_id: string
  name: string
  raw: string
}

/**
 * Insert the extracted document as a `content` row, then upload the original
 * binary to the `assets` storage bucket and stamp the storage path. The storage
 * steps are non-fatal: the content record is already saved, so a storage
 * failure is logged but does not fail the request (matching prior behavior).
 */
export async function createDocumentAsset(
  authCtx: AuthScope,
  input: CreateDocumentAssetInput,
): Promise<ContentResult<DocumentAsset>> {
  const { name, raw, fileBuffer, contentType } = input
  const supabase = getAdminClient()

  // 1. Insert content record to get the content_id
  console.log('[assets/upload] inserting content record:', { name, rawLength: raw.length })
  const { data, error } = await supabase
    .from('content')
    .insert({
      tenant_id: authCtx.tenant_id,
      owner_id: authCtx.owner_id,
      name,
      type: 'document',
      raw,
    })
    .select('id, name, raw')
    .single()

  if (error) {
    console.error('[assets/upload] supabase insert failed:', { message: error.message, code: error.code, details: error.details, hint: error.hint })
    return { ok: false, status: 500, error: error.message }
  }

  // 2. Upload original file to Supabase Storage
  const storagePath = `${authCtx.tenant_id}/${data.id}/${name}`
  console.log('[assets/upload] uploading to storage:', storagePath)

  const { error: storageError } = await supabase.storage
    .from('assets')
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
    })

  if (storageError) {
    console.error('[assets/upload] storage upload failed:', { message: storageError.message })
    // Content record was saved — log but don't fail the request
  } else {
    console.log('[assets/upload] storage upload success:', storagePath)

    // 3. Update content record with the storage path
    const { error: updateError } = await supabase
      .from('content')
      .update({ storage_path: storagePath })
      .eq('id', data.id)

    if (updateError) {
      console.error('[assets/upload] storage_path update failed:', { message: updateError.message })
    }
  }

  console.log('[assets/upload] success, content_id:', data.id)
  return { ok: true, data: { content_id: data.id, name: data.name, raw: data.raw } }
}
