// Regression guard for a real bug flagged in review on the Story Deck &
// Memory Panel handover (Phase 1, PR #492): `.hl-animate-slide-right` wraps
// StoryMemoryEditor, which renders its own ConfirmDeleteModal (`absolute
// inset-0`, meant to cover the whole drawer/overlay). A `both`/`forwards`
// fill-mode leaves `transform: translateX(0)` on the wrapper forever after
// the animation ends — and ANY non-`none` transform on an ancestor
// establishes a new CSS containing block for absolutely-positioned
// descendants, clipping the confirm-delete scrim to the wrapper's own box
// instead of the full drawer. jsdom/happy-dom don't execute real CSS
// animations, so the actual containing-block behavior can't be asserted
// from a computed style here — this instead pins the one thing that
// prevents the bug: the animation shorthand must carry no persistent
// fill-mode. See app/heirloom/globals.css's own comment on this rule for
// the full explanation.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('.hl-animate-slide-right animation declaration', () => {
  it('never carries a `both` or `forwards` fill-mode', () => {
    const css = readFileSync(join(__dirname, 'globals.css'), 'utf-8')
    const match = css.match(/\.hl-animate-slide-right\s*\{\s*animation:\s*([^;]+);/)
    expect(match).not.toBeNull()
    const declaration = match![1]
    expect(declaration).not.toMatch(/\bboth\b/)
    expect(declaration).not.toMatch(/\bforwards\b/)
  })
})
