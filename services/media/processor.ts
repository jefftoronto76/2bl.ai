import { gps as exifrGps } from 'exifr'
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
import { callVisionTool, callTextTool, type AnthropicTool } from './vision-tool'

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
 * The tool `processImage`'s vision call forces via callVisionTool
 * (services/media/vision-tool.ts) — its input_schema is what constrains
 * the model's output now, replacing the old "Return JSON only: {...}" text
 * instruction. Exactly the three fields the prior prompt asked for; do not
 * add or drop fields here without also updating what processImage reads
 * off the result.
 */
interface VisionAnalysis {
  caption: string
  classification: string
  extracted_text: string
}

const VISION_ANALYSIS_TOOL: AnthropicTool = {
  name: 'record_image_analysis',
  description:
    'Record a description of the provided image, a short classification for it, and any text visible within it.',
  input_schema: {
    type: 'object',
    properties: {
      caption: {
        type: 'string',
        description: 'A description of the image.',
      },
      classification: {
        type: 'string',
        description: 'A short classification label for the image (e.g. photo, screenshot, document, receipt).',
      },
      extracted_text: {
        type: 'string',
        description: 'Any text visible in the image. Empty string if none.',
      },
    },
    required: ['caption', 'classification', 'extracted_text'],
  },
}

interface GpsCoordinates {
  latitude: number | null
  longitude: number | null
}

/**
 * GPS Extraction (2026-08-08) — downloads the photo's own bytes (same
 * fetch-the-signed-url-directly pattern processDocument uses below, not
 * exifr's own Node URL-polyfill, so this is mockable/testable the same way
 * every other network call in this file already is) and reads its EXIF GPS
 * tags via `exifr.gps()`, which parses just the GPS IFD (a fast, targeted
 * read, not a full EXIF parse) and already converts the EXIF GPS block's
 * raw degrees/minutes/seconds triplet to a single signed decimal-degree
 * value itself — no separate DMS-to-decimal conversion is needed here
 * (verified against a real fixture with known GPS EXIF,
 * services/media/processor.test.ts).
 *
 * Most photos carry NO GPS data at all — screenshots, downloads, a member
 * with location services off — so `exifr.gps()` resolving to `undefined`
 * is the expected COMMON case, not a failure: this returns null/null
 * silently, no log, no audit event. A genuine failure (the download itself
 * failing, corrupt/truncated EXIF, an unsupported format) is caught here
 * and ALSO degrades to null/null — this must never throw, and must never
 * block or fail the vision step that follows it, or the upload itself.
 * Logged via console.error (not audit_events), same precedent as this
 * file's own vision-JSON-parse-failure handling just below — length/type
 * only, never raw EXIF bytes.
 */
async function extractGpsCoordinates(signedUrl: string, item: MediaItem): Promise<GpsCoordinates> {
  try {
    const res = await fetch(signedUrl)
    if (!res.ok) throw new Error(`Failed to download file for GPS extraction: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const gps = await exifrGps(buffer)
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return { latitude: null, longitude: null }
    }
    return { latitude: gps.latitude, longitude: gps.longitude }
  } catch (err) {
    console.error('[media/processor] GPS extraction failed, continuing without coordinates', {
      media_item_id: item.id,
      error_type: err instanceof Error ? err.name : typeof err,
    })
    return { latitude: null, longitude: null }
  }
}

// ---------------------------------------------------------------------------
// Image analysis via Claude Haiku vision, using forced tool-use
// (callVisionTool, services/media/vision-tool.ts) for structured output —
// see that file's doc comment for why. Anthropic's structured-output tool
// contract guarantees the input already matches VISION_ANALYSIS_TOOL's
// schema, so no parsing happens here on the happy path.
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

  // GPS extraction runs first, off the same signed URL, while it's freshest
  // (60s expiry, generateSignedDownloadUrl) — independent of and never
  // blocking the vision call below; see extractGpsCoordinates's own doc
  // comment for why a miss or a parse failure both just resolve to null.
  const { latitude, longitude } = await extractGpsCoordinates(signedUrl, item)

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

  let result: VisionAnalysis | null
  try {
    result = await callVisionTool<VisionAnalysis>(signedUrl, VISION_ANALYSIS_TOOL, apiKey, {
      model: HAIKU_MODEL,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
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
    throw err
  }

  if (!result) {
    // callVisionTool already tried its own fence-stripped-JSON fallback
    // internally and still came back empty — an API-level edge case (the
    // model ignored the forced tool_choice AND returned no recoverable
    // text), not the common path. This is a genuine failure, not a
    // soft-degrade: a photo's caption is core content the member sees
    // directly, and unlike a stuck item, a failed one already has a
    // working recovery path (POST /api/media/[id]/retry re-runs this
    // whole pipeline from scratch). Distinguishable message from the
    // non-ok-HTTP throw above ('Anthropic vision error: ...') — different
    // failure mode, different wording.
    throw new Error('Vision tool call returned no usable output')
  }

  const caption = result.caption ?? ''
  const classification = result.classification ?? 'photo'
  const extracted_text = result.extracted_text ?? ''

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
    latitude,
    longitude,
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
        // Presence only, never the raw coordinates (CLAUDE.md's audit-logging rule).
        gps_found: latitude !== null,
      },
    })
  }
}

/**
 * The tool processDocument's classification pass forces via callTextTool
 * (services/media/vision-tool.ts) — replaces the old free-text "Classify
 * this document in one word..." instruction. Single required field,
 * matching the prior prompt's guidance exactly.
 */
interface DocumentClassification {
  classification: string
}

const DOCUMENT_CLASSIFICATION_TOOL: AnthropicTool = {
  name: 'record_document_classification',
  description: 'Record a single-word classification for the provided document text.',
  input_schema: {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        description:
          'A single-word classification for the document (e.g. letter, memoir, journal, article, report, recipe, legal, photo_album, other).',
      },
    },
    required: ['classification'],
  },
}

// ---------------------------------------------------------------------------
// Document extraction + classification via extractText (PDF/DOCX/TXT).
// extractText() uses direct fetch to Anthropic for PDF and mammoth for DOCX —
// both are headless-safe in a background function context. The
// classification pass below uses forced tool-use (callTextTool) for the
// same reason processImage's vision call does — see that function's
// banner comment and vision-tool.ts's doc comments.
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
    const result = await callTextTool<DocumentClassification>(
      rawText.slice(0, 2000),
      DOCUMENT_CLASSIFICATION_TOOL,
      apiKey,
      { model: HAIKU_MODEL, maxTokens: 64 },
    )
    if (result?.classification) classification = result.classification.trim().toLowerCase()
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
  } catch (err) {
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
          error_message: err instanceof Error ? err.message : String(err),
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
