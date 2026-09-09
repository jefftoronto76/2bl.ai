import { describe, it, expect } from 'vitest'
import { QUESTION_MODE_CONTEXT } from '@/services/prompt/compiler'
import { questionModeProvider } from './question-mode'
import { makeInput } from '../test-input'

describe('questionModeProvider', () => {
  it('applies only in question mode', () => {
    expect(questionModeProvider.appliesTo(makeInput({ mode: 'question' }))).toBe(true)
    expect(questionModeProvider.appliesTo(makeInput({ mode: null }))).toBe(false)
  })

  it('returns the QUESTION_MODE_CONTEXT constant unchanged', async () => {
    expect(await questionModeProvider.resolve(makeInput({ mode: 'question' }))).toBe(QUESTION_MODE_CONTEXT)
  })

  it('sits last in the prompt but is not the first block to drop under budget', () => {
    expect(questionModeProvider.order).toBe(50)
    expect(questionModeProvider.priority).toBeLessThan(20)
    expect(questionModeProvider.freshness).toBe('static')
  })
})
