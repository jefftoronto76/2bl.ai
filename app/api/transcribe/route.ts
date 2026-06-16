import { getSession } from '@/services/auth';
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

  console.log('[transcribe/route] entry', { size: audio.size, type: audio.type });

  const audioBuffer = await audio.arrayBuffer();
  const contentType = audio.type || 'audio/webm';

  try {
    const text = await transcribeAudio(audioBuffer, contentType, apiKey);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }
}
