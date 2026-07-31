import { describe, it, expect } from 'vitest'
import { sortBlocks, nextSortState, type SortableBlock } from './sortBlocks'

const A: SortableBlock = { title: 'Zebra block', type: 'knowledge', updated_at: '2026-06-01T00:00:00Z' }
const B: SortableBlock = { title: 'apple block', type: 'guardrail', updated_at: '2026-07-01T00:00:00Z' }
const C: SortableBlock = { title: 'Mango block', type: 'identity', updated_at: '2026-05-01T00:00:00Z' }
const LIST = [A, B, C]

describe('sortBlocks', () => {
  it('sortBy null returns the original order untouched', () => {
    expect(sortBlocks(LIST, null, 'asc')).toEqual(LIST)
  })

  it('does not mutate the input array', () => {
    const copy = [...LIST]
    sortBlocks(LIST, 'title', 'asc')
    expect(LIST).toEqual(copy)
  })

  it('sorts by title case-insensitively, ascending', () => {
    expect(sortBlocks(LIST, 'title', 'asc').map(b => b.title)).toEqual([
      'apple block',
      'Mango block',
      'Zebra block',
    ])
  })

  it('sorts by title descending', () => {
    expect(sortBlocks(LIST, 'title', 'desc').map(b => b.title)).toEqual([
      'Zebra block',
      'Mango block',
      'apple block',
    ])
  })

  it('sorts by type using compile order (identity, knowledge, guardrail, process, output_format), not alphabetical', () => {
    // identity(1) < knowledge(2) < guardrail(3) per ORDERED_TYPES/TYPE_COMPILE_ORDER
    expect(sortBlocks(LIST, 'type', 'asc').map(b => b.type)).toEqual([
      'identity',
      'knowledge',
      'guardrail',
    ])
  })

  it('sorts by updated_at ascending (oldest first)', () => {
    expect(sortBlocks(LIST, 'updated', 'asc').map(b => b.updated_at)).toEqual([
      '2026-05-01T00:00:00Z',
      '2026-06-01T00:00:00Z',
      '2026-07-01T00:00:00Z',
    ])
  })

  it('sorts by updated_at descending (newest first)', () => {
    expect(sortBlocks(LIST, 'updated', 'desc').map(b => b.updated_at)).toEqual([
      '2026-07-01T00:00:00Z',
      '2026-06-01T00:00:00Z',
      '2026-05-01T00:00:00Z',
    ])
  })

  it('is a pure reorder — same elements, same length, regardless of sort field/direction', () => {
    for (const field of ['title', 'type', 'updated'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const sorted = sortBlocks(LIST, field, dir)
        expect(sorted).toHaveLength(LIST.length)
        expect(new Set(sorted)).toEqual(new Set(LIST))
      }
    }
  })
})

describe('nextSortState', () => {
  it('clicking an unsorted table by title starts ascending', () => {
    expect(nextSortState({ sortBy: null, sortDir: 'asc' }, 'title')).toEqual({
      sortBy: 'title',
      sortDir: 'asc',
    })
  })

  it('clicking an unsorted table by the date field starts descending (newest first)', () => {
    expect(nextSortState({ sortBy: null, sortDir: 'asc' }, 'updated')).toEqual({
      sortBy: 'updated',
      sortDir: 'desc',
    })
  })

  it('clicking the same field again flips direction', () => {
    expect(nextSortState({ sortBy: 'title', sortDir: 'asc' }, 'title')).toEqual({
      sortBy: 'title',
      sortDir: 'desc',
    })
    expect(nextSortState({ sortBy: 'title', sortDir: 'desc' }, 'title')).toEqual({
      sortBy: 'title',
      sortDir: 'asc',
    })
  })

  it('clicking a different field takes over at that field\'s own default direction', () => {
    expect(nextSortState({ sortBy: 'title', sortDir: 'desc' }, 'updated')).toEqual({
      sortBy: 'updated',
      sortDir: 'desc',
    })
    expect(nextSortState({ sortBy: 'updated', sortDir: 'desc' }, 'type')).toEqual({
      sortBy: 'type',
      sortDir: 'asc',
    })
  })
})
