// app/api/probe/tool-call/route.ts
//
// TEMPORARY PROBE — delete after it has answered its question.
//
// Answers §9 row 1 of `Design Handovers/september_2026/
// tool_calling_infrastructure_design_2026-09-15.md`: does
// `@ai-sdk/anthropic@0.0.39` — a provider that predates Claude 3.7/4 entirely,
// whose stream transform `throw`s on any unrecognized content-block or delta
// type — actually handle a tool turn from `claude-sonnet-4-6`?
//
// Nothing here touches /api/sage, services/chat/server/stream.ts, the DB, or
// any tenant. It calls `getModelInstance` (the real production resolver) so
// the probe exercises the same wiring a real turn would, and nothing else.
//
// Not reachable in production: VERCEL_ENV === 'production' returns 404 before
// any work happens, and every other environment still requires ?run=1.

import { streamText, tool } from 'ai'
import { z } from 'zod'
import { getModelInstance } from '@/services/chat/server/stream'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL_ID = 'claude-sonnet-4-6'

/** Deliberately trivial: a no-op whose only job is to exist and be called. */
const pingTool = tool({
  description:
    'Returns a fixed status token. Call this whenever the user asks for the system status token.',
  parameters: z.object({
    label: z.string().describe('A short label to echo back with the token.'),
  }),
  execute: async ({ label }) => ({ token: 'PROBE_OK', label }),
})

interface Captured {
  ok: boolean
  chunkTypes?: string[]
  toolCallNames?: string[]
  toolResults?: unknown[]
  stepCount?: number
  stepTypes?: string[]
  stepTexts?: string[]
  resolvedText?: string
  finishReason?: string
  usage?: unknown
  error?: { name: string; message: string; stackHead: string[]; stringified: string }
}

function describeError(err: unknown): Captured['error'] {
  const e = err instanceof Error ? err : null
  return {
    name: e?.name ?? typeof err,
    message: e?.message ?? String(err),
    stackHead: (e?.stack ?? '').split('\n').slice(0, 6),
    stringified: String(err),
  }
}

/**
 * Drains `fullStream` (the layer where the provider's exhaustive content-block
 * switch would throw) and records what came back.
 */
async function runScenario(
  opts: Parameters<typeof streamText>[0],
): Promise<Captured> {
  try {
    const result = await streamText(opts)

    const chunkTypes: string[] = []
    const toolCallNames: string[] = []
    const toolResults: unknown[] = []

    // Read the part structurally rather than through the SDK's union. The
    // generic tool type is erased by this function's signature, and — more to
    // the point — a probe should record whatever type string actually arrives,
    // including one the 3.4 types do not predict.
    for await (const rawPart of result.fullStream) {
      const part = rawPart as { type: string; toolName?: string; result?: unknown; error?: unknown }
      chunkTypes.push(part.type)
      if (part.type === 'tool-call' && part.toolName) toolCallNames.push(part.toolName)
      if (part.type === 'tool-result') toolResults.push(part.result)
      if (part.type === 'error') {
        return { ok: false, chunkTypes, toolCallNames, toolResults, error: describeError(part.error) }
      }
    }

    const steps = await result.steps
    return {
      ok: true,
      chunkTypes,
      toolCallNames,
      toolResults,
      stepCount: steps.length,
      stepTypes: steps.map(s => s.stepType),
      stepTexts: steps.map(s => s.text),
      resolvedText: await result.text,
      finishReason: await result.finishReason,
      usage: await result.usage,
    }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }
  if (new URL(req.url).searchParams.get('run') !== '1') {
    return Response.json({ probe: 'tool-call', hint: 'add ?run=1' }, { status: 400 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set in this environment' }, { status: 500 })
  }

  const model = getModelInstance('anthropic', MODEL_ID)
  const out: Record<string, unknown> = {
    model: MODEL_ID,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  }

  // S0 — control. No tools. Proves the key, the model id and the provider work
  // at all, so any failure below is attributable to tools and nothing else.
  out.s0_control_noTools = await runScenario({
    model,
    maxTokens: 64,
    prompt: 'Reply with exactly the word: control',
  })

  // S1 — forced tool call, single step. Exercises the RESPONSE side: tool_use
  // content blocks and input_json_delta deltas through the 0.0.39 transform.
  out.s1_forcedTool_1step = await runScenario({
    model,
    maxTokens: 256,
    tools: { ping: pingTool },
    toolChoice: { type: 'tool', toolName: 'ping' },
    maxSteps: 1,
    prompt: 'Get the system status token with the label "probe".',
  })

  // S2 — auto tool choice, two steps. Exercises the full round trip, including
  // the REQUEST side: tool_result blocks fed back for the second model call.
  out.s2_autoTool_2steps = await runScenario({
    model,
    maxTokens: 256,
    tools: { ping: pingTool },
    maxSteps: 2,
    prompt:
      'What is the system status token? Use the label "probe". Answer with the token value once you have it.',
  })

  // S3 — the same shape as S2, but drained through toDataStreamResponse() so we
  // capture the literal wire bytes /api/sage would emit. Validates §2.2.
  try {
    const result = await streamText({
      model,
      maxTokens: 256,
      tools: { ping: pingTool },
      maxSteps: 2,
      prompt:
        'What is the system status token? Use the label "probe". Answer with the token value once you have it.',
    })
    const body = await result.toDataStreamResponse().text()
    out.s3_wireBytes = {
      ok: true,
      lines: body.split('\n').filter(Boolean).map(l => l.slice(0, 300)),
      partCodes: [...new Set(body.split('\n').filter(Boolean).map(l => l.split(':')[0]))],
    }
  } catch (err) {
    out.s3_wireBytes = { ok: false, error: describeError(err) }
  }

  return Response.json(out, { status: 200 })
}
