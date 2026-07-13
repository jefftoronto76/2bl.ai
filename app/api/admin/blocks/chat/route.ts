import { getAuthContext } from '@/services/auth'
import { getCompiledComposerSystem, type BlocksComposerInput } from '@/services/prompt/composer'
import { runChatStream } from '@/services/chat/server/stream'
import { DEFAULT_ADMIN_MODEL_CONFIG } from '@/services/chat/server/config'

export async function POST(req: Request) {
  try {
    await getAuthContext()
  } catch (err) {
    console.error('[blocks/chat] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY is not configured', { status: 500 })
  }

  let body: BlocksComposerInput
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const system = await getCompiledComposerSystem(body)
  const messages = body.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    return await runChatStream({ config: { ...DEFAULT_ADMIN_MODEL_CONFIG, maxTokens: 4000 }, system, messages })
  } catch (error) {
    console.error('[blocks/chat/route] streamText error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Upstream error: ${message}`, { status: 502 })
  }
}
