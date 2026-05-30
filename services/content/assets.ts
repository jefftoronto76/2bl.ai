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
import type { AuthScope, ContentResult } from './types'

export const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const base64 = buffer.toString('base64')
  console.log('[assets/upload] PDF base64 length:', base64.length)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

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
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
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

  console.log('[assets/upload] sending to Anthropic API, content types:', requestBody.messages[0].content.map(c => c.type))

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    console.error('[assets/upload] Anthropic API error:', { status: res.status, body: errorBody })
    throw new Error(`Anthropic API error: ${res.status} ${errorBody}`)
  }

  const data = await res.json()
  console.log('[assets/upload] Anthropic response stop_reason:', data.stop_reason, 'content blocks:', data.content?.length)

  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
  if (!textBlock?.text) {
    console.error('[assets/upload] no text in Anthropic response:', JSON.stringify(data.content))
    throw new Error('No text returned from Anthropic')
  }

  return textBlock.text
}

/** Extract raw text from an uploaded document buffer. Throws on failure. */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const fileType = ACCEPTED_TYPES[mimeType]

  switch (fileType) {
    case 'pdf': {
      return extractTextFromPdf(buffer)
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
