import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { MediaPills, pillsFor } from './MediaPills'
import type { MediaAction, MediaKind } from './MediaPills'

// ── pillsFor unit tests ───────────────────────────────────────────────────────

describe('pillsFor()', () => {
  it('image → story (primary), tagPeople, tagDate, caption, file', () => {
    const pills = pillsFor('image')
    const actions = pills.map((p) => p.action)
    expect(actions).toEqual(['story', 'tagPeople', 'tagDate', 'caption', 'file'])
    expect(pills.find((p) => p.action === 'story')?.primary).toBe(true)
  })

  it('audio → stt (primary), memory, file', () => {
    const pills = pillsFor('audio')
    const actions = pills.map((p) => p.action)
    expect(actions).toEqual(['stt', 'memory', 'file'])
    expect(pills.find((p) => p.action === 'stt')?.primary).toBe(true)
  })

  it('video → stt (primary), frameGrab, story, file', () => {
    const pills = pillsFor('video')
    const actions = pills.map((p) => p.action)
    expect(actions).toEqual(['stt', 'frameGrab', 'story', 'file'])
    expect(pills.find((p) => p.action === 'stt')?.primary).toBe(true)
  })

  it('document → ocr (primary), story, tagPeople, file', () => {
    const pills = pillsFor('document')
    const actions = pills.map((p) => p.action)
    expect(actions).toEqual(['ocr', 'story', 'tagPeople', 'file'])
    expect(pills.find((p) => p.action === 'ocr')?.primary).toBe(true)
  })

  it('multiple → reviewEach (primary), batchFile', () => {
    const pills = pillsFor('multiple')
    const actions = pills.map((p) => p.action)
    expect(actions).toEqual(['reviewEach', 'batchFile'])
    expect(pills.find((p) => p.action === 'reviewEach')?.primary).toBe(true)
  })
})

// ── MediaPills component tests ────────────────────────────────────────────────

function renderPills(kind: MediaKind, onPill = vi.fn()) {
  render(<MediaPills kind={kind} onPill={onPill} />)
  return onPill
}

describe('MediaPills component', () => {
  it('renders all image pill buttons by aria-label', () => {
    renderPills('image')
    expect(screen.getByRole('button', { name: "Tell its story" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Who's in it?" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'When was this?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a caption' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Just keep it' })).toBeInTheDocument()
  })

  it('renders audio pills', () => {
    renderPills('audio')
    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add as a memory' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Just keep it' })).toBeInTheDocument()
  })

  it('renders multiple pills', () => {
    renderPills('multiple')
    expect(screen.getByRole('button', { name: 'Process one by one' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add all to a chapter' })).toBeInTheDocument()
  })

  it('clicking a pill calls onPill with the correct action', () => {
    const onPill = vi.fn()
    renderPills('image', onPill)
    fireEvent.click(screen.getByRole('button', { name: "Who's in it?" }))
    expect(onPill).toHaveBeenCalledOnce()
    expect(onPill).toHaveBeenCalledWith('tagPeople' satisfies MediaAction)
  })

  it('clicking different pills calls onPill with different actions', () => {
    const onPill = vi.fn()
    renderPills('image', onPill)
    fireEvent.click(screen.getByRole('button', { name: 'Add a caption' }))
    expect(onPill).toHaveBeenCalledWith('caption' satisfies MediaAction)
    fireEvent.click(screen.getByRole('button', { name: 'Just keep it' }))
    expect(onPill).toHaveBeenCalledWith('file' satisfies MediaAction)
  })

  it('primary pill has accent background class', () => {
    renderPills('image')
    const primary = screen.getByRole('button', { name: 'Tell its story' })
    expect(primary.className).toContain('bg-accent')
  })

  it('non-primary pill has surface background class', () => {
    renderPills('image')
    const nonPrimary = screen.getByRole('button', { name: 'Just keep it' })
    expect(nonPrimary.className).toContain('bg-surface')
  })

  it('group has accessible aria-label', () => {
    renderPills('image')
    expect(
      screen.getByRole('group', { name: 'What would you like to do with this?' }),
    ).toBeInTheDocument()
  })
})
