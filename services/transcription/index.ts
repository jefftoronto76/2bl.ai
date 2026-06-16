/**
 * Transcription service — owns all Deepgram API interaction, logging, and
 * retry logic. No Next.js imports, no JSX, no framework coupling.
 *
 * The route (`app/api/transcribe/route.ts`) is responsible for auth,
 * FormData extraction, API-key resolution, and HTTP response mapping.
 * This module is responsible for the Deepgram call and nothing else.
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

async function callDeepgram(
  apiKey: string,
  audioBuffer: ArrayBuffer,
  contentType: string,
): Promise<Response> {
  return fetch(DEEPGRAM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: audioBuffer,
  });
}

/**
 * Sends audio to Deepgram and returns the transcript.
 *
 * - Retries once on 429 / 5xx (transient errors) with a 1-second delay.
 * - Does not retry on 400 (bad audio) or 401 (invalid key).
 * - Returns an empty string when Deepgram transcribes silence / no speech.
 * - Throws on unrecoverable Deepgram failures so the route can map to 502.
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  contentType: string,
  apiKey: string,
): Promise<string> {
  let dgRes = await callDeepgram(apiKey, audioBuffer, contentType);

  // Retry once on transient Deepgram errors.
  if (dgRes.status === 429 || dgRes.status >= 500) {
    await new Promise((r) => setTimeout(r, 1000));
    dgRes = await callDeepgram(apiKey, audioBuffer, contentType);
  }

  if (!dgRes.ok) {
    let requestId: string | undefined;
    let body: string;
    try {
      const errJson = (await dgRes.json()) as { request_id?: string };
      requestId = errJson.request_id;
      body = JSON.stringify(errJson);
    } catch {
      body = await dgRes.text();
    }
    console.error('[transcription/service] Deepgram error', {
      status: dgRes.status,
      requestId,
      body,
    });
    throw new Error(`Deepgram returned ${dgRes.status}`);
  }

  const data = (await dgRes.json()) as DeepgramResponse;
  const requestId = data.metadata?.request_id;
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

  if (!text) {
    console.log('[transcription/service] empty transcript', { requestId });
  } else {
    console.log('[transcription/service] ok', { chars: text.length, requestId });
  }

  return text;
}
