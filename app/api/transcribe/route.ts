import { logEvent } from '@/services/audit';
import { AuditAction } from '@/services/audit/types';
import { getSession, getTenantFromRequest } from '@/services/auth';
import { transcribeAudio } from '@/services/transcription';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Presence check only — getSession() is the boundary's cheap JWT check.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error('[transcribe/route] DEEPGRAM_API_KEY is not set');
    return NextResponse.json({ error: 'Transcription unavailable' }, { status: 503 });
  }

  // Resolve context for audit rows — fire-and-forget on null, never blocks response.
  const tenantId = await getTenantFromRequest(req);
  const clerkUserId = session.providerUserId;
  const correlationId = req.headers.get('x-correlation-id');

  const auditBase = {
    tenant_id: tenantId,
    clerk_user_id: clerkUserId,
    actor_type: 'user' as const,
    correlation_id: correlationId,
    product_id: 'heirloom',
  };

  let audio: File | null = null;
  try {
    const form = await req.formData();
    audio = form.get('audio') as File | null;
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }

  const audioSize = audio.size;
  const contentType = audio.type || 'audio/webm';

  console.log('[transcribe/route] entry', { size: audioSize, type: contentType });
  void logEvent({
    ...auditBase,
    action: AuditAction.TRANSCRIPTION_REQUESTED,
    metadata: { audioSize, contentType },
  });

  const audioBuffer = await audio.arrayBuffer();
  const startedAt = Date.now();

  try {
    const result = await transcribeAudio(audioBuffer, contentType, apiKey);
    const durationMs = Date.now() - startedAt;

    if (result.text) {
      void logEvent({
        ...auditBase,
        action: AuditAction.TRANSCRIPTION_SUCCEEDED,
        metadata: {
          charCount: result.text.length,
          requestId: result.requestId,
          attempts: result.attempts,
          durationMs,
        },
      });
    } else {
      void logEvent({
        ...auditBase,
        action: AuditAction.TRANSCRIPTION_EMPTY,
        metadata: {
          requestId: result.requestId,
          attempts: result.attempts,
          durationMs,
        },
      });
    }

    return NextResponse.json({ text: result.text });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error('[transcribe/route] transcription error', err);
    void logEvent({
      ...auditBase,
      action: AuditAction.TRANSCRIPTION_FAILED,
      outcome: 'failure',
      metadata: {
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      },
    });
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }
}
