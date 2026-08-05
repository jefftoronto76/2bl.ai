// Verifies runChatStream forwards abortSignal to streamText (and, via
// streamText, into the provider's doStream call) so the client disconnecting
// (Stop) actually cancels the upstream Anthropic call instead of letting it
// run to completion. See System Docs/Utilities/Chat UI.md's "Stop / interrupted-turn protocol".

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelConfig } from './types'

const mockToDataStreamResponse = vi.fn(() => new Response('mock stream'))
const mockStreamText = vi.fn((_opts: unknown) =>
  Promise.resolve({ toDataStreamResponse: mockToDataStreamResponse }),
)
const mockAnthropic = vi.fn((modelId: string, settings?: unknown) => ({
  modelId,
  provider: 'anthropic',
  settings,
}))

vi.mock('ai', () => ({
  streamText: (opts: unknown) => mockStreamText(opts),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelId: string, settings?: unknown) => mockAnthropic(modelId, settings),
}))

import { runChatStream, getModelInstance } from './stream'

const config: ModelConfig = {
  provider: 'anthropic',
  chatModel: 'claude-sonnet-4-6',
  fallbackModel: 'gpt-4o',
  maxTokens: 1000,
  rateLimitRequestsPerHour: 100,
}

beforeEach(() => {
  mockStreamText.mockClear()
  mockToDataStreamResponse.mockClear()
  mockAnthropic.mockClear()
})

describe('getModelInstance', () => {
  it('enables cacheControl on the Anthropic model — without it, cache_control on messages is silently dropped', () => {
    getModelInstance('anthropic', 'claude-sonnet-4-6')
    expect(mockAnthropic).toHaveBeenCalledWith('claude-sonnet-4-6', { cacheControl: true })
  })
})

describe('runChatStream', () => {
  it('passes the caller abortSignal through to streamText', async () => {
    const controller = new AbortController()
    await runChatStream({ config, system: 'sys', messages: [], abortSignal: controller.signal })
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    )
  })

  it('passes abortSignal as undefined when the caller provides none', async () => {
    await runChatStream({ config, system: 'sys', messages: [] })
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: undefined }),
    )
  })

  it('still returns the data-stream Response when abortSignal is supplied', async () => {
    const controller = new AbortController()
    const response = await runChatStream({ config, system: 'sys', messages: [], abortSignal: controller.signal })
    expect(mockToDataStreamResponse).toHaveBeenCalled()
    expect(response).toBeInstanceOf(Response)
  })
})

// Verifies prompt caching is wired correctly at the exact version-specific
// shape confirmed by direct source inspection: cachedSystem must arrive as
// its own leading `role: 'system'` message array entry carrying
// `experimental_providerMetadata.anthropic.cacheControl`, NOT via streamText's
// `system:` string shorthand (which ai@3.4.33 silently strips metadata from
// with no error — see runChatStream's doc comment). Also verifies onFinish
// surfaces cache usage from the provider's response metadata.
describe('runChatStream — prompt caching', () => {
  it('sends cachedSystem as its own leading system message with cache_control, followed by the uncached system message', async () => {
    await runChatStream({
      config,
      cachedSystem: 'STATIC TENANT PROMPT',
      system: 'DYNAMIC PER-TURN CONTEXT',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content: 'STATIC TENANT PROMPT',
            experimental_providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
          { role: 'system', content: 'DYNAMIC PER-TURN CONTEXT' },
          { role: 'user', content: 'hi' },
        ],
      }),
    )
    // The old `system:` shorthand must NOT be used — that's the exact path
    // that silently drops providerMetadata at this SDK version.
    const callArgs = mockStreamText.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(callArgs.system).toBeUndefined()
  })

  it('omits the uncached leading message when system is empty', async () => {
    await runChatStream({
      config,
      cachedSystem: 'STATIC TENANT PROMPT',
      system: '',
      messages: [],
    })

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content: 'STATIC TENANT PROMPT',
            experimental_providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
        ],
      }),
    )
  })

  it('sends a single uncached system message when cachedSystem is omitted (admin-route shape)', async () => {
    await runChatStream({ config, system: 'ADMIN PROMPT', messages: [] })

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'system', content: 'ADMIN PROMPT' }],
      }),
    )
  })

  it('emits no leading system messages when both cachedSystem and system are empty', async () => {
    await runChatStream({ config, system: '', messages: [{ role: 'user', content: 'hi' }] })

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: 'hi' }] }),
    )
  })

  it('extracts cacheUsage from the provider response and passes it to onFinish', async () => {
    const onFinish = vi.fn()
    mockStreamText.mockImplementationOnce(async (opts: unknown) => {
      const { onFinish: streamTextOnFinish } = opts as {
        onFinish: (event: unknown) => Promise<void>
      }
      await streamTextOnFinish({
        text: 'hello',
        usage: { promptTokens: 10, completionTokens: 5 },
        experimental_providerMetadata: {
          anthropic: { cacheCreationInputTokens: 8000, cacheReadInputTokens: 0 },
        },
      })
      return { toDataStreamResponse: mockToDataStreamResponse }
    })

    await runChatStream({
      config,
      cachedSystem: 'STATIC',
      system: '',
      messages: [],
      onFinish,
    })

    expect(onFinish).toHaveBeenCalledWith({
      text: 'hello',
      usage: { promptTokens: 10, completionTokens: 5 },
      cacheUsage: { cacheCreationInputTokens: 8000, cacheReadInputTokens: 0 },
    })
  })

  it('passes cacheUsage as null when the provider response carries no anthropic metadata', async () => {
    const onFinish = vi.fn()
    mockStreamText.mockImplementationOnce(async (opts: unknown) => {
      const { onFinish: streamTextOnFinish } = opts as {
        onFinish: (event: unknown) => Promise<void>
      }
      await streamTextOnFinish({ text: 'hello', usage: null, experimental_providerMetadata: undefined })
      return { toDataStreamResponse: mockToDataStreamResponse }
    })

    await runChatStream({ config, system: 'sys', messages: [], onFinish })

    expect(onFinish).toHaveBeenCalledWith({ text: 'hello', usage: null, cacheUsage: null })
  })
})
