import { describe, it, expect } from 'vitest'
import { resolveActiveSet, familyOf, type PromptSet } from './promptSet'

function makeSet(overrides: Partial<PromptSet> & Pick<PromptSet, 'id' | 'label'>): PromptSet {
  return {
    promptTypeId: null,
    version: 1,
    status: 'draft',
    lastCompiledAt: null,
    compiledVersion: null,
    isComposerPrompt: false,
    ...overrides,
  }
}

const LIVE = makeSet({ id: 'set-live', label: 'Sage Base', status: 'live' })
const DRAFT = makeSet({ id: 'set-draft', label: 'Sage v2', status: 'draft' })
const RETIRED = makeSet({ id: 'set-retired', label: 'Old Sage', status: 'retired' })

describe('resolveActiveSet', () => {
  it('returns null when there are no sets at all, regardless of what was requested', () => {
    expect(resolveActiveSet([], null)).toBeNull()
    expect(resolveActiveSet([], 'set-draft')).toBeNull()
  })

  it('defaults to the Live set when no id was requested', () => {
    expect(resolveActiveSet([DRAFT, LIVE, RETIRED], null)).toBe(LIVE)
  })

  it('defaults to the first set when no id was requested and none is Live', () => {
    expect(resolveActiveSet([DRAFT, RETIRED], null)).toBe(DRAFT)
  })

  it('returns the exact requested set when found, even if it is not Live', () => {
    expect(resolveActiveSet([LIVE, DRAFT, RETIRED], 'set-draft')).toBe(DRAFT)
  })

  it('returns the requested Retired set rather than defaulting to Live', () => {
    expect(resolveActiveSet([LIVE, DRAFT, RETIRED], 'set-retired')).toBe(RETIRED)
  })

  // Regression: this used to silently substitute the Live set here, which is
  // exactly the "wrong set's blocks under the right set's URL" bug — a real,
  // existing prompt set (just not present in THIS `sets` list, e.g. because
  // it belongs to a different tenant than the one the caller queried) must
  // come back as "not found," never as some other set's data standing in for
  // it unannounced.
  it('returns null — not a substituted Live/first set — when a requested id is not present in the list', () => {
    expect(resolveActiveSet([LIVE, DRAFT], 'set-does-not-exist')).toBeNull()
  })

  it('treats an empty-string requestedId the same as no request (defaults to Live)', () => {
    expect(resolveActiveSet([DRAFT, LIVE], '')).toBe(LIVE)
  })
})

describe('familyOf', () => {
  it('is "tenant" for an ordinary set and "composer" for a composer-family one', () => {
    expect(familyOf(LIVE)).toBe('tenant')
    expect(familyOf(makeSet({ id: 'set-c', label: 'Composer', isComposerPrompt: true }))).toBe('composer')
  })
})
