import { AuditAction } from '@/services/audit/types'
import { extractText } from '@/services/content/assets'
import {
  getMediaItem,
  logMediaEvent,
  updateMediaItem,
  type MediaItem,
} from './index'
import { generateLongLivedSignedUrl, generateSignedDownloadUrl } from './storage'

// ---------------------------------------------------------------------------
// Audio transcription via Deepgram nova-3 batch API.
// This is the uploaded-file pipeline — completely separate from the live
// in-chat voice recording at /api/transcribe (nova-2, browser MediaRecorder).
// ---------------------------------------------------------------------------
async function processAudio(
  item: MediaItem,
  correlationId: string,
): Promise<void> {
  // Use a long-lived URL (1hr) to guard against slow Deepgram queues for
  // large audio files causing URL expiry before the fetch completes.
  const signedUrl = await generateLongLivedSignedUrl(item.storage_path)

  const key = process.env.DEEPGRAM_API_KEY
  if (!key) throw new Error('DEEPGRAM_API_KEY is not configured')

  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: signedUrl }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Deepgram API error: ${res.status} ${body}`)
  }

  const data = await res.json()
  const transcript: string =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

  // Classify based on filename/context heuristics
  const lower = item.original_filename.toLowerCase()
  const classification =
    lower.includes('interview') ? 'interview_recording' : 'voice_memo'

  await updateMediaItem(item.id, {
    status: 'ready',
    derived_content: transcript,
    classification,
    processed_at: new Date().toISOString(),
  })

  await logMediaEvent({
    tenant_id: item.tenant_id,
    member_id: item.member_id,
    media_item_id: item.id,
    action: AuditAction.MEDIA_ITEM_PROCESSED,
    outcome: 'success',
    correlation_id: correlationId,
    metadata: {
      type: item.type,
      classification,
      derived_content_length: transcript.length,
    },
  })
}

// ---------------------------------------------------------------------------
// Image analysis via Claude Haiku vision.
// ---------------------------------------------------------------------------
async function processImage(
  item: MediaItem,
  correlationId: string,
): Promise<void> {
  const signedUrl = await generateSignedDownloadUrl(item.storage_path)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: signedUrl },
            },
            {
              type: 'text',
              text: 'Describe this image, classify it, and extract any visible text. Return JSON only: {"caption": "...", "classification": "...", "extracted_text": "..."}',
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic vision error: ${res.status} ${body}`)
  }

  const data = await res.json()
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text block returned from Anthropic vision')

  let caption = ''
  let classification = 'photo'
  let extracted_text = ''
  try {
    const parsed = JSON.parse(textBlock.text)
    caption = parsed.caption ?? ''
    classification = parsed.classification ?? 'photo'
    extracted_text = parsed.extracted_text ?? ''
  } catch {
    caption = textBlock.text
  }

  const derived = [caption, extracted_text].filter(Boolean).join('\n\n')

  await updateMediaItem(item.id, {
    status: 'ready',
    derived_content: derived || caption,
    classification,
    processed_at: new Date().toISOString(),
  })

  await logMediaEvent({
    tenant_id: item.tenant_id,
    member_id: item.member_id,
    media_item_id: item.id,
    action: AuditAction.MEDIA_ITEM_PROCESSED,
    outcome: 'success',
    correlation_id: correlationId,
    metadata: {
      type: item.type,
      classification,
      derived_content_length: derived.length,
    },
  })
}

// ---------------------------------------------------------------------------
// Document extraction + classification via extractText (PDF/DOCX/TXT).
// extractText() uses direct fetch to Anthropic for PDF and mammoth for DOCX —
// both are headless-safe in a background function context.
// ---------------------------------------------------------------------------
async function processDocument(
  item: MediaItem,
  correlationId: string,
): Promise<void> {
  // Download the file binary from storage for extraction
  const signedUrl = await generateSignedDownloadUrl(item.storage_path)
  const fileRes = await fetch(signedUrl)
  if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`)

  const arrayBuffer = await fileRes.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const rawText = await extractText(buffer, item.mime_type)

  // Light classification pass via Claude Haiku
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  let classification = 'document'
  try {
    const classRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64,
        messages: [
          {
            role: 'user',
            content: `Classify this document in one word (e.g. letter, memoir, journal, article, report, recipe, legal, photo_album, other). Respond with only the single classification word.\n\n${rawText.slice(0, 2000)}`,
          },
        ],
      }),
    })
    if (classRes.ok) {
      const classData = await classRes.json()
      const word = classData.content?.[0]?.text?.trim().toLowerCase()
      if (word) classification = word
    }
  } catch {
    // classification pass is best-effort; continue with 'document' default
  }

  await updateMediaItem(item.id, {
    status: 'ready',
    derived_content: rawText,
    classification,
    processed_at: new Date().toISOString(),
  })

  await logMediaEvent({
    tenant_id: item.tenant_id,
    member_id: item.member_id,
    media_item_id: item.id,
    action: AuditAction.MEDIA_ITEM_PROCESSED,
    outcome: 'success',
    correlation_id: correlationId,
    metadata: {
      type: item.type,
      classification,
      derived_content_length: rawText.length,
    },
  })
}

// ---------------------------------------------------------------------------
// Main entry point — called by the webhook route after signature verification.
// ---------------------------------------------------------------------------
export async function processMediaItem(record: MediaItem): Promise<void> {
  const correlationId = crypto.randomUUID()
  const startMs = Date.now()

  // Verify the item still exists and is pending (idempotency guard is in the
  // webhook route, but double-check here in case of concurrent delivery)
  const item = await getMediaItem(record.id, record.tenant_id)
  if (!item || item.status !== 'pending') return

  // Job start audit log
  await logMediaEvent({
    tenant_id: item.tenant_id,
    member_id: item.member_id,
    media_item_id: item.id,
    action: AuditAction.MEDIA_ITEM_PROCESSING,
    outcome: 'success',
    correlation_id: correlationId,
    metadata: {
      type: item.type,
      file_size_bytes: item.file_size_bytes,
      original_filename: item.original_filename,
    },
  })

  await updateMediaItem(item.id, { status: 'processing' })

  let pipeline_step = 'init'
  try {
    switch (item.type) {
      case 'audio':
        pipeline_step = 'deepgram_transcription'
        await processAudio(item, correlationId)
        break
      case 'image':
        pipeline_step = 'claude_vision'
        await processImage(item, correlationId)
        break
      case 'document':
        pipeline_step = 'text_extraction'
        await processDocument(item, correlationId)
        break
      default:
        throw new Error(`Unsupported media type: ${item.type}`)
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[media/processor] job failed', {
      media_item_id: item.id,
      type: item.type,
      pipeline_step,
      error: errorMessage,
      correlation_id: correlationId,
    })

    await updateMediaItem(item.id, {
      status: 'failed',
      error_message: errorMessage,
    })

    await logMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.MEDIA_ITEM_FAILED,
      outcome: 'failure',
      correlation_id: correlationId,
      metadata: {
        type: item.type,
        error: errorMessage,
        pipeline_step,
        duration_ms: Date.now() - startMs,
      },
    })
  }
}
