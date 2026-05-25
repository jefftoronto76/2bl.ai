import { NextRequest } from 'next/server'
import mammoth from 'mammoth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'

// App Router route segment config — allow up to 60 s for PDF text extraction.
// Body size is governed by the deployment platform (Vercel: 4.5 MB serverless),
// not by a per-route config in App Router (that pattern is Pages Router only).
export const maxDuration = 60

const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

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

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
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

export async function POST(req: NextRequest) {
  console.log('[assets/upload] route hit')

  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[assets/upload] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.error('[assets/upload] formData parse failed:', err)
    return Response.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    console.error('[assets/upload] missing file field, keys:', [...formData.keys()])
    return Response.json({ error: 'Missing file field' }, { status: 400 })
  }

  console.log('[assets/upload] file received:', { name: file.name, type: file.type, size: file.size })

  if (file.size > MAX_FILE_SIZE) {
    console.error('[assets/upload] file too large:', file.size)
    return Response.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })
  }

  if (!ACCEPTED_TYPES[file.type]) {
    console.error('[assets/upload] unsupported type:', file.type)
    return Response.json(
      { error: `Unsupported file type. Accepted: ${Object.values(ACCEPTED_TYPES).join(', ')}` },
      { status: 400 },
    )
  }

  let raw: string
  try {
    console.log('[assets/upload] starting text extraction for type:', file.type)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    raw = await extractText(buffer, file.type)
    console.log('[assets/upload] text extraction complete, length:', raw.length)
  } catch (err) {
    console.error('[assets/upload] text extraction failed:', err instanceof Error ? { message: err.message, stack: err.stack } : err)
    return Response.json({ error: 'Failed to extract text from file' }, { status: 422 })
  }

  if (!raw.trim()) {
    console.error('[assets/upload] extracted text is empty')
    return Response.json({ error: 'No text could be extracted from this file' }, { status: 422 })
  }

  const supabase = getAdminClient()

  // 1. Insert content record to get the content_id
  console.log('[assets/upload] inserting content record:', { name: file.name, rawLength: raw.trim().length })
  const { data, error } = await supabase
    .from('content')
    .insert({
      tenant_id: authCtx.tenant_id,
      owner_id: authCtx.owner_id,
      name: file.name,
      type: 'document',
      raw: raw.trim(),
    })
    .select('id, name, raw')
    .single()

  if (error) {
    console.error('[assets/upload] supabase insert failed:', { message: error.message, code: error.code, details: error.details, hint: error.hint })
    return Response.json({ error: error.message }, { status: 500 })
  }

  // 2. Upload original file to Supabase Storage
  const storagePath = `${authCtx.tenant_id}/${data.id}/${file.name}`
  console.log('[assets/upload] uploading to storage:', storagePath)

  const fileBuffer = await file.arrayBuffer()
  const { error: storageError } = await supabase.storage
    .from('assets')
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
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
  return Response.json({
    content_id: data.id,
    name: data.name,
    raw: data.raw,
  })
}
