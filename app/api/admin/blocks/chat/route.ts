import { buildBlocksComposerSystem, type BlocksComposerInput } from '@/services/prompt/composer'
import { runChatStream } from '@/services/chat/server/stream'
import type { ModelConfig } from '@/services/chat/server/types'

const ADMIN_BLOCKS_CONFIG: ModelConfig = {
  provider: 'anthropic',
  chatModel: 'claude-sonnet-4-6',
  fallbackModel: 'gpt-4o',
  maxTokens: 4000,
  rateLimitRequestsPerHour: 100,
}

export async function POST(req: Request) {
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

  const system = buildBlocksComposerSystem(body)
  const messages = body.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    return await runChatStream({ config: ADMIN_BLOCKS_CONFIG, system, messages })
  } catch (error) {
    console.error('[blocks/chat/route] streamText error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Upstream error: ${message}`, { status: 502 })
  }
}
