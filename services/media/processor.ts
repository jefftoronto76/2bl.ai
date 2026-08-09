import { AuditAction } from '@/services/audit/types'
import { extractText, type MediaAuditContext } from '@/services/content/assets'
import {
  getMediaItem,
  isMediaAuditEnabled,
  logAiMediaEvent,
  logMediaEvent,
  logSttMediaEvent,
  updateMediaItem,
  type MediaItem,
} from './index'
import { generateLongLivedSignedUrl, generateSignedDownloadUrl, objectExists } from './storage'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const SONNET_MODEL = 'claude-sonnet-4-6'

// ---------------------------------------------------------------------------
// The Supabase Database Webhook fires the instant the media_items row is
// INSERTed — which happens before the signed upload URL is even returned to
// the client, let alone before the client's PUT of the file bytes (a
// separate, later request) lands in Storage. Without this wait, processing
// frequently starts against an object that doesn't exist yet, and the
// downstream STT/vision/extraction call fails with a confusing fetch error
// that looks like an upstream API problem rather than a timing one.
//
// Bounded retry, not a fixed sleep: most uploads land well within the first
// attempt or two, and this keeps the common case fast while still covering
// slower uploads. ~5.5s worst case before giving up.
// ---------------------------------------------------------------------------
export const STORAGE_WAIT_DELAYS_MS = [0, 300, 700, 1500, 3000]

export async function waitForStorageObject(storagePath: string): Promise<void> {
  for (const delay of STORAGE_WAIT_DELAYS_MS) {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    if (await objectExists(storagePath)) return
  }
  throw new Error(
    `Storage object not available after ${STORAGE_WAIT_DELAYS_MS.length} attempts: ${storagePath}`,
  )
}

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
  let signedUrl: string
  try {
    signedUrl = await generateLongLivedSignedUrl(item.storage_path)
  } catch (err) {
    if (isMediaAuditEnabled()) {
      await logMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.MEDIA_URL_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          mime_type: item.mime_type,
          original_filename: item.original_filename,
          file_size_bytes: item.file_size_bytes,
          timestamp: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : String(err),
        },
      })
    }
    throw err
  }

  const key = process.env.DEEPGRAM_API_KEY
  if (!key) throw new Error('DEEPGRAM_API_KEY is not configured')

  const sttStart = Date.now()

  if (isMediaAuditEnabled()) {
    await logSttMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.STT_REQUEST_SENT,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        mime_type: item.mime_type,
        file_size_bytes: item.file_size_bytes,
        timestamp: new Date().toISOString(),
      },
    })
  }

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
    const errorMessage = `Deepgram API error: ${res.status} ${body}`
    if (isMediaAuditEnabled()) {
      await logSttMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.STT_REQUEST_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          error_message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })
    }
    throw new Error(errorMessage)
  }

  const data = await res.json()
  const transcript: string =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

  if (isMediaAuditEnabled()) {
    await logSttMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.STT_RESPONSE_RECEIVED,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        transcript_length_chars: transcript.length,
        latency_ms: Date.now() - sttStart,
        timestamp: new Date().toISOString(),
      },
    })
  }

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

  if (isMediaAuditEnabled()) {
    await logMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.MEDIA_PROCESS_COMPLETED,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        mime_type: item.mime_type,
        original_filename: item.original_filename,
        file_size_bytes: item.file_size_bytes,
        timestamp: new Date().toISOString(),
        type: item.type,
        classification,
        derived_content_length: transcript.length,
      },
    })
  }
}

/**
 * Strips a ```json ... ``` (or plain ``` ... ```) markdown code fence that
 * Claude sometimes wraps its response in, despite the "Return JSON only"
 * instruction below — a real, observed failure mode: JSON.parse throws on
 * the fence markers themselves, since ` ```json\n{...}\n``` ` isn't valid
 * JSON on its own. Returns the input unchanged when no fence is present, so
 * this is always safe to run before parsing regardless of which shape the
 * model actually returned.
 */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : text
}

// ---------------------------------------------------------------------------
// Image analysis via Claude Haiku vision.
// ---------------------------------------------------------------------------
async function processImage(
  item: MediaItem,
  correlationId: string,
): Promise<void> {
  let signedUrl: string
  try {
    signedUrl = await generateSignedDownloadUrl(item.storage_path)
  } catch (err) {
    if (isMediaAuditEnabled()) {
      await logMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.MEDIA_URL_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          mime_type: item.mime_type,
          original_filename: item.original_filename,
          file_size_bytes: item.file_size_bytes,
          timestamp: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : String(err),
        },
      })
    }
    throw err
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const aiStart = Date.now()

  if (isMediaAuditEnabled()) {
    await logAiMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.AI_MEDIA_REQUEST_SENT,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        model: HAIKU_MODEL,
        mime_type: item.mime_type,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
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
    const errorMessage = `Anthropic vision error: ${res.status} ${body}`
    if (isMediaAuditEnabled()) {
      await logAiMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.AI_MEDIA_REQUEST_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          model: HAIKU_MODEL,
          error_message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })
    }
    throw new Error(errorMessage)
  }

  const data = await res.json()
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text block returned from Anthropic vision')

  let caption = ''
  let classification = 'photo'
  let extracted_text = ''
  try {
    const parsed = JSON.parse(stripCodeFence(textBlock.text))
    caption = parsed.caption ?? ''
    classification = parsed.classification ?? 'photo'
    extracted_text = parsed.extracted_text ?? ''
  } catch (err) {
    // Still not parseable JSON even after stripping a markdown fence — the
    // model returned something genuinely malformed, not just fenced. The old
    // fallback stored the ENTIRE raw response (braces, field names, fence
    // markers, everything) verbatim as the caption — this is a memory's
    // actual title/body once bookmarked (createPhotoMemoryFromMedia,
    // services/crm/memories.ts), so a member would see broken JSON as their
    // own memory's passage. A fixed, safe placeholder is better than that,
    // and — unlike an empty string — still non-empty, since
    // createPhotoMemoryFromMedia's 409 "not ready" gate treats an empty
    // derived_content as not-yet-processed and would otherwise leave this
    // photo permanently unbookmarkable. Length/presence only in the log,
    // never the raw model text (CLAUDE.md's audit-logging rule) — deliberately
    // NOT err.message: JSON.parse's own SyntaxError embeds a snippet of the
    // invalid input verbatim (e.g. `Unexpected token 'o', "not json..." is
    // not valid JSON`), so logging it would leak the very content this is
    // trying to keep out of the logs. error_type (the constructor name) is
    // still useful for debugging without that risk.
    console.error('[media/processor] vision response was not valid JSON, even after fence-stripping', {
      media_item_id: item.id,
      error_type: err instanceof Error ? err.name : typeof err,
      raw_text_length: textBlock.text.length,
    })
    caption = 'A photo.'
  }

  if (isMediaAuditEnabled()) {
    await logAiMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.AI_MEDIA_RESPONSE_RECEIVED,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        model: HAIKU_MODEL,
        latency_ms: Date.now() - aiStart,
        classification,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const derived = [caption, extracted_text].filter(Boolean).join('\n\n')

  await updateMediaItem(item.id, {
    status: 'ready',
    derived_content: derived || caption,
    classification,
    processed_at: new Date().toISOString(),
  })

  if (isMediaAuditEnabled()) {
    await logMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.MEDIA_PROCESS_COMPLETED,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        mime_type: item.mime_type,
        original_filename: item.original_filename,
        file_size_bytes: item.file_size_bytes,
        timestamp: new Date().toISOString(),
        type: item.type,
        classification,
        derived_content_length: derived.length,
      },
    })
  }
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
  let signedUrl: string
  try {
    signedUrl = await generateSignedDownloadUrl(item.storage_path)
  } catch (err) {
    if (isMediaAuditEnabled()) {
      await logMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.MEDIA_URL_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          mime_type: item.mime_type,
          original_filename: item.original_filename,
          file_size_bytes: item.file_size_bytes,
          timestamp: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : String(err),
        },
      })
    }
    throw err
  }

  const fileRes = await fetch(signedUrl)
  if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`)

  const arrayBuffer = await fileRes.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // PDF extraction calls claude-sonnet-4-6 via the Anthropic document API.
  // DOCX/TXT use mammoth/Buffer — no AI call. Only emit AI events for PDFs.
  const isPdf = item.mime_type === 'application/pdf'
  const extractStart = Date.now()

  if (isPdf && isMediaAuditEnabled()) {
    await logAiMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.AI_MEDIA_REQUEST_SENT,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        model: SONNET_MODEL,
        mime_type: item.mime_type,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const auditContext: MediaAuditContext = {
    tenant_id: item.tenant_id,
    member_id: item.member_id,
    media_item_id: item.id,
    correlation_id: correlationId,
  }

  let rawText: string
  try {
    rawText = await extractText(buffer, item.mime_type, auditContext)
  } catch (err) {
    if (isPdf && isMediaAuditEnabled()) {
      await logAiMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.AI_MEDIA_REQUEST_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          model: SONNET_MODEL,
          error_message: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
      })
    }
    throw err
  }

  if (isPdf && isMediaAuditEnabled()) {
    await logAiMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.AI_MEDIA_RESPONSE_RECEIVED,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        model: SONNET_MODEL,
        latency_ms: Date.now() - extractStart,
        classification: null,
        timestamp: new Date().toISOString(),
      },
    })
  }

  // Light classification pass via Claude Haiku
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  let classification = 'document'
  const classStart = Date.now()

  if (isMediaAuditEnabled()) {
    await logAiMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.AI_MEDIA_REQUEST_SENT,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        model: HAIKU_MODEL,
        mime_type: item.mime_type,
        timestamp: new Date().toISOString(),
      },
    })
  }

  try {
    const classRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
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
      if (isMediaAuditEnabled()) {
        await logAiMediaEvent({
          tenant_id: item.tenant_id,
          member_id: item.member_id,
          media_item_id: item.id,
          action: AuditAction.AI_MEDIA_RESPONSE_RECEIVED,
          outcome: 'success',
          correlation_id: correlationId,
          metadata: {
            model: HAIKU_MODEL,
            latency_ms: Date.now() - classStart,
            classification,
            timestamp: new Date().toISOString(),
          },
        })
      }
    } else {
      if (isMediaAuditEnabled()) {
        await logAiMediaEvent({
          tenant_id: item.tenant_id,
          member_id: item.member_id,
          media_item_id: item.id,
          action: AuditAction.AI_MEDIA_REQUEST_FAILED,
          outcome: 'failure',
          correlation_id: correlationId,
          metadata: {
            model: HAIKU_MODEL,
            error_message: `Classification HTTP ${classRes.status}`,
            timestamp: new Date().toISOString(),
          },
        })
      }
    }
  } catch {
    // classification pass is best-effort; continue with 'document' default
    if (isMediaAuditEnabled()) {
      await logAiMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.AI_MEDIA_REQUEST_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          model: HAIKU_MODEL,
          error_message: 'Classification request threw',
          timestamp: new Date().toISOString(),
        },
      })
    }
  }

  await updateMediaItem(item.id, {
    status: 'ready',
    derived_content: rawText,
    classification,
    processed_at: new Date().toISOString(),
  })

  if (isMediaAuditEnabled()) {
    await logMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.MEDIA_PROCESS_COMPLETED,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        mime_type: item.mime_type,
        original_filename: item.original_filename,
        file_size_bytes: item.file_size_bytes,
        timestamp: new Date().toISOString(),
        type: item.type,
        classification,
        derived_content_length: rawText.length,
      },
    })
  }
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

  if (isMediaAuditEnabled()) {
    await logMediaEvent({
      tenant_id: item.tenant_id,
      member_id: item.member_id,
      media_item_id: item.id,
      action: AuditAction.MEDIA_PROCESS_STARTED,
      outcome: 'success',
      correlation_id: correlationId,
      metadata: {
        mime_type: item.mime_type,
        original_filename: item.original_filename,
        file_size_bytes: item.file_size_bytes,
        timestamp: new Date().toISOString(),
        type: item.type,
      },
    })
  }

  await updateMediaItem(item.id, { status: 'processing' })

  let pipeline_step = 'await_storage_availability'
  try {
    await waitForStorageObject(item.storage_path)

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

    if (isMediaAuditEnabled()) {
      await logMediaEvent({
        tenant_id: item.tenant_id,
        member_id: item.member_id,
        media_item_id: item.id,
        action: AuditAction.MEDIA_PROCESS_FAILED,
        outcome: 'failure',
        correlation_id: correlationId,
        metadata: {
          mime_type: item.mime_type,
          original_filename: item.original_filename,
          file_size_bytes: item.file_size_bytes,
          timestamp: new Date().toISOString(),
          type: item.type,
          error_message: errorMessage,
          pipeline_step,
          duration_ms: Date.now() - startMs,
        },
      })
    }
  }
}
