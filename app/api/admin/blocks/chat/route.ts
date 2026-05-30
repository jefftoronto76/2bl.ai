import { streamBlocksComposer, type BlocksComposerInput } from '@/services/prompt/composer'

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

  return streamBlocksComposer(body)
}
