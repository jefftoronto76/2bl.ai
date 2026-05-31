import { describe, it, expect, beforeEach } from 'vitest'
import { useWidgetShell } from './useWidgetShell'

// The store is a module singleton, so reset to the initial shell state between
// tests to keep them independent.
beforeEach(() => {
  useWidgetShell.setState({ isExpanded: false, mode: null, composerRef: null })
})

describe('useWidgetShell', () => {
  it('expand() opens the overlay in default (null) mode', () => {
    useWidgetShell.getState().expand()
    const s = useWidgetShell.getState()
    expect(s.isExpanded).toBe(true)
    expect(s.mode).toBeNull()
  })

  it("expand('question') sets isExpanded AND mode together (mode-bridge pairing)", () => {
    // The Chat mode-bridge reads getState().mode on overlay open, so expand
    // MUST set both fields atomically — this is the load-bearing pairing.
    useWidgetShell.getState().expand('question')
    const s = useWidgetShell.getState()
    expect(s.isExpanded).toBe(true)
    expect(s.mode).toBe('question')
  })

  it('collapse() closes the overlay without clearing mode', () => {
    useWidgetShell.getState().expand('question')
    useWidgetShell.getState().collapse()
    const s = useWidgetShell.getState()
    expect(s.isExpanded).toBe(false)
    expect(s.mode).toBe('question')
  })

  it('setMode updates mode independently of isExpanded', () => {
    useWidgetShell.getState().setMode('question')
    expect(useWidgetShell.getState().mode).toBe('question')
    expect(useWidgetShell.getState().isExpanded).toBe(false)
    useWidgetShell.getState().setMode(null)
    expect(useWidgetShell.getState().mode).toBeNull()
  })

  it('setComposerRef stores and clears the composer ref', () => {
    const ref = { current: null }
    useWidgetShell.getState().setComposerRef(ref)
    expect(useWidgetShell.getState().composerRef).toBe(ref)
    useWidgetShell.getState().setComposerRef(null)
    expect(useWidgetShell.getState().composerRef).toBeNull()
  })
})
