import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error('[2bl/transcribe] DEEPGRAM_API_KEY is not set');
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

  const audioBuffer = await audio.arrayBuffer();

  const dgRes = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': audio.type || 'audio/webm',
      },
      body: audioBuffer,
    },
  );

  if (!dgRes.ok) {
    const body = await dgRes.text();
    console.error(`[2bl/transcribe] Deepgram error ${dgRes.status}: ${body}`);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }

  type DeepgramResponse = {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
  };

  const data = (await dgRes.json()) as DeepgramResponse;
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

  return NextResponse.json({ text });
}
