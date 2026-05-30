import { NextRequest } from 'next/server'
import { getAuthContext } from '@/services/auth/get-auth-context'
import {
  ACCEPTED_TYPES,
  MAX_FILE_SIZE,
  extractText,
  createDocumentAsset,
} from '@/services/content'

// App Router route segment config — allow up to 60 s for PDF text extraction.
// Body size is governed by the deployment platform (Vercel: 4.5 MB serverless),
// not by a per-route config in App Router (that pattern is Pages Router only).
export const maxDuration = 60

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

  const result = await createDocumentAsset(authCtx, {
    name: file.name,
    raw: raw.trim(),
    fileBuffer: await file.arrayBuffer(),
    contentType: file.type,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
