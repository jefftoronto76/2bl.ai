import { SageMessage } from './store'
import { readDataStream } from '@/services/chat/server/stream-utils'

export async function streamSageResponse(
  messages: SageMessage[],
  onChunk: (chunk: string) => void,
  options?: { mode?: 'question' | null; sessionId?: string | null },
): Promise<void> {
  const response = await fetch('/api/sage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      mode: options?.mode ?? null,
      session_id: options?.sessionId ?? null,
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  await readDataStream(response, onChunk)
}
