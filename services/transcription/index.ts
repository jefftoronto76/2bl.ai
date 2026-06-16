/**
 * Transcription service — owns all Deepgram API interaction, logging, and
 * retry logic. No Next.js imports, no JSX, no framework coupling.
 *
 * The route (`app/api/transcribe/route.ts`) is responsible for auth,
 * FormData extraction, API-key resolution, HTTP response mapping, and
 * audit logging. This module is responsible for the Deepgram call only.
 */

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true';

type DeepgramResponse = {
  metadata?: { request_id?: string };
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
};

export type TranscriptionResult = {
  text: string;
  requestId?: string;
  attempts: number;
};

async function callDeepgram(apiKey: string, audioBuffer: ArrayBuffer, contentType: string): Promise<Response> {
  return fetch(DEEPGRAM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    // slice(0) creates a fresh copy — fetch may transfer/detach the original,
    // so each call needs its own ArrayBuffer to keep the retry path safe.
    body: audioBuffer.slice(0),
  });
}

/**
 * Sends audio to Deepgram and returns the transcript plus metadata.
 *
 * - Retries once on 429 / 5xx (transient errors) with a 1-second delay.
 * - Does not retry on 400 (bad audio) or 401 (invalid key).
 * - Returns empty string when Deepgram transcribes silence / no speech.
 * - Throws on unrecoverable Deepgram failures so the route can map to 502.
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  contentType: string,
  apiKey: string,
): Promise<TranscriptionResult> {
  let attempts = 1;

  let dgRes: Response;
  try {
    dgRes = await callDeepgram(apiKey, audioBuffer, contentType);
  } catch (fetchErr) {
    console.error('[transcription/service] fetch failed', { fetchErr });
    throw fetchErr;
  }

  // Retry once on transient Deepgram errors.
  if (dgRes.status === 429 || dgRes.status >= 500) {
    await new Promise((r) => setTimeout(r, 1000));
    attempts = 2;
    try {
      dgRes = await callDeepgram(apiKey, audioBuffer, contentType);
    } catch (fetchErr) {
      console.error('[transcription/service] fetch failed on retry', { fetchErr });
      throw fetchErr;
    }
  }

  if (!dgRes.ok) {
    let requestId: string | undefined;
    let bodyText: string;
    try {
      const errJson = (await dgRes.json()) as { request_id?: string };
      requestId = errJson.request_id;
      bodyText = JSON.stringify(errJson);
    } catch {
      bodyText = await dgRes.text();
    }
    console.error('[transcription/service] Deepgram error', {
      status: dgRes.status,
      requestId,
      body: bodyText,
      attempts,
    });
    throw new Error(`Deepgram returned ${dgRes.status}`);
  }

  const data = (await dgRes.json()) as DeepgramResponse;
  const requestId = data.metadata?.request_id;
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

  if (!text) {
    console.log('[transcription/service] empty transcript', { requestId, attempts });
  } else {
    console.log('[transcription/service] ok', { chars: text.length, requestId, attempts });
  }

  return { text, requestId, attempts };
}
