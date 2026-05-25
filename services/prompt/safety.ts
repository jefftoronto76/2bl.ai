// services/prompt/safety.ts
//
// LLM safety review for the prompt service. reviewBlockBody backs
// /api/admin/prompt/compile/check (single-block review, fail-open).
// reviewMasterPrompt backs the legacy /api/admin/prompt/check (whole-prompt
// review). Moved verbatim from those route bodies; the routes are now thin
// handlers owning auth/validation/HTTP mapping.

import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const BLOCK_REVIEW_META_PROMPT = `You are reviewing a single block of a system prompt for an AI assistant called Sage on a professional business context.

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

const PROMPT_REVIEW_META_PROMPT = `You are reviewing a system prompt for an AI assistant called Sage on a professional business coaching website (jefflougheed.ca).

Evaluate whether the prompt is:
1. Safe — no instructions to harm, deceive, or manipulate users against their interests
2. On-brand — appropriate for a professional business/coaching context
3. Non-deceptive — doesn't instruct the AI to misrepresent itself or make false claims
4. Functional — maintains a coherent purpose as a business assistant

Your entire response must be a single raw JSON object. Do not use markdown. Do not wrap in backticks or code fences. Do not include any text before or after the JSON. Output only the JSON object, starting with { and ending with }.

Use exactly this format:
{"pass": true, "issues": []}
or
{"pass": false, "issues": [{"description": "Clear description of the issue", "offendingText": "The exact verbatim text from the prompt that should be removed to fix this issue, or null if no specific text can be isolated"}]}

The offendingText must be copied verbatim from the prompt — it will be used for an exact string match removal. Only set it if a specific passage is the problem; set it to null for structural issues.`

interface CheckIssueRaw {
  description?: unknown
  offendingText?: unknown
}

export interface CheckIssue {
  description: string
  offendingText: string | null
}

export interface CheckResult {
  ok: boolean
  issues: CheckIssue[]
}

/**
 * Single-block safety review for the compile flow. Always returns a
 * CheckResult — fails open to { ok: true, issues: [] } on any error so the
 * save flow is never blocked. Every returned offendingText is validated as a
 * real verbatim substring of the block body.
 */
export async function reviewBlockBody(blockBody: string): Promise<CheckResult> {
  console.log('[prompt/compile/check] checking block body, length:', blockBody.length)

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: BLOCK_REVIEW_META_PROMPT,
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
    return result
  } catch (err) {
    console.error('[prompt/compile/check] check failed:', err instanceof Error ? err.message : err)
    // Fail open — don't block the save flow on a check error.
    return { ok: true, issues: [] }
  }
}

/**
 * Whole-prompt safety review (legacy). Returns the parsed LLM JSON result.
 * Throws on model/parse failure — the route maps that to a 500.
 */
export async function reviewMasterPrompt(prompt: string): Promise<unknown> {
  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    system: PROMPT_REVIEW_META_PROMPT,
    prompt: `System prompt to review:\n---\n${prompt}\n---`,
    maxTokens: 500,
  })

  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(clean)
}
