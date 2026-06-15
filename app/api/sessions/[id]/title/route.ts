import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getTenantFromRequest } from '@/services/auth'
import { updateSession } from '@/services/crm/sessions'

/**
 * POST /api/sessions/[id]/title — generate a 2-4 word AI title for a session.
 *
 * Called client-side after the first completed turn (messages.length === 2)
 * as a fire-and-forget fetch. Fail-open: any error returns { title: null }
 * so the client continues with the derived fallback title.
 *
 * Uses claude-haiku-4-5-20251001 — fast, cheap, single-turn with strict
 * output constraints.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('[sessions/[id]/title] POST called for id:', id)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ title: null }, { status: 400 })
  }

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/title] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ title: null }, { status: 400 })
  }

  let firstUserMessage = ''
  let firstAssistantText = ''
  try {
    const body = await req.json()
    firstUserMessage = String(body.firstUserMessage ?? '').trim()
    firstAssistantText = String(body.firstAssistantText ?? '').slice(0, 200).trim()
  } catch {
    return NextResponse.json({ title: null }, { status: 400 })
  }

  if (!firstUserMessage) {
    return NextResponse.json({ title: null }, { status: 400 })
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system:
        'You generate ultra-short conversation titles for a personal memoir chat. ' +
        'Reply with only the title — 2 to 4 words, no quotes, no punctuation, no explanation.',
      prompt:
        `User message: "${firstUserMessage}"\n` +
        (firstAssistantText ? `Assistant reply: "${firstAssistantText}"` : ''),
      maxTokens: 20,
    })

    const title = text.trim().replace(/^["']|["']$/g, '')
    if (!title) {
      console.warn('[sessions/[id]/title] empty title generated for session:', id)
      return NextResponse.json({ title: null })
    }

    const result = await updateSession(tenantId, id, {
      messages: undefined,
      visitorName: undefined,
      title,
    })

    if (!result.ok) {
      console.error('[sessions/[id]/title] failed to persist title for session:', id, result.error)
      return NextResponse.json({ title: null })
    }

    console.log('[sessions/[id]/title] generated:', id, '|', title)
    return NextResponse.json({ title })
  } catch (err) {
    console.error('[sessions/[id]/title] failed:', id, err)
    return NextResponse.json({ title: null })
  }
}
