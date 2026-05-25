import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { NextResponse } from 'next/server'
import { getAuthContext } from '@/services/auth/get-auth-context'

const META_PROMPT = `You are reviewing a single block of a system prompt for an AI assistant called Sage on a professional business context.

Evaluate whether the block is:
1. Safe — no instructions to harm, deceive, or manipulate users
2. Consistent — doesn't contradict itself internally
3. On-brand — appropriate for a professional business/coaching tone
4. Functional — makes sense as an instruction to an AI assistant

Your entire response must be a single raw JSON object. Do not use markdown. Do not wrap in backticks. Output only the JSON, starting with { and ending with }.

Use exactly this format:
{"ok": true, "issues": []}
or
{"ok": false, "issues": [{"description": "short description of the issue", "offendingText": "exact verbatim substring from the block or null"}]}

Rules for issues:
- Each description must be concise (under 20 words)
- offendingText must be copied verbatim from the block — it will be used for an exact string match removal
- Only set offendingText when a specific passage is the problem; set it to null for structural or whole-block concerns
- Only flag real problems — do not invent concerns`

interface CheckIssueRaw {
  description?: unknown
  offendingText?: unknown
}

interface CheckIssue {
  description: string
  offendingText: string | null
}

interface CheckResult {
  ok: boolean
  issues: CheckIssue[]
}

export async function POST(req: Request) {
  try {
    await getAuthContext()
  } catch (err) {
    console.error('[prompt/compile/check] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { body?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const blockBody = body.body?.trim()
  if (!blockBody) {
    return NextResponse.json({ error: 'Missing body field' }, { status: 400 })
  }

  console.log('[prompt/compile/check] checking block body, length:', blockBody.length)

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: META_PROMPT,
      prompt: `Block to review:\n---\n${blockBody}\n---`,
      maxTokens: 700,
    })

    const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(clean) as { ok?: unknown; issues?: unknown }

    const okFlag = parsed.ok === true
    const rawIssues = Array.isArray(parsed.issues) ? (parsed.issues as CheckIssueRaw[]) : []

    // Normalize and validate: offendingText must be a real substring of the
    // block body. If the LLM paraphrased or hallucinated, null it out so the
    // UI knows not to show a Remove button.
    const issues: CheckIssue[] = rawIssues
      .map(raw => {
        const description = typeof raw.description === 'string' ? raw.description.trim() : ''
        if (!description) return null
        let offendingText: string | null = null
        if (typeof raw.offendingText === 'string' && raw.offendingText.trim().length > 0) {
          const candidate = raw.offendingText
          if (blockBody.includes(candidate)) {
            offendingText = candidate
          } else {
            console.warn('[prompt/compile/check] offendingText not found verbatim — nulling:', candidate.slice(0, 60))
          }
        }
        return { description, offendingText }
      })
      .filter((i): i is CheckIssue => i !== null)

    const result: CheckResult = { ok: okFlag && issues.length === 0, issues }
    console.log('[prompt/compile/check] result:', {
      ok: result.ok,
      issueCount: result.issues.length,
      withOffendingText: result.issues.filter(i => i.offendingText !== null).length,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[prompt/compile/check] check failed:', err instanceof Error ? err.message : err)
    // Fail open — don't block the save flow on a check error.
    return NextResponse.json({ ok: true, issues: [] })
  }
}
