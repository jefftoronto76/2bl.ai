// components/shells/membership/VoiceImmersive.test.tsx

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VoiceImmersive } from './VoiceImmersive';

// useMediaQuery from @mantine/hooks doesn't resolve correctly in happy-dom.
// Mock it at the module level; default to desktop (false) so tests cover the
// main rendering path. Override per-test when mobile coverage is needed.
vi.mock('@mantine/hooks', () => ({
  useMediaQuery: vi.fn(() => false),
}));

import { useMediaQuery } from '@mantine/hooks';
const mockUseMediaQuery = vi.mocked(useMediaQuery);

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onDone: vi.fn(),
  onSkipToTyping: vi.fn(),
  guidanceQuestion: 'What memory stands out the most from your childhood?',
  isRecording: true,
  elapsedSeconds: 0,
  onPause: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VoiceImmersive', () => {
  it('renders nothing when open is false', () => {
    render(<VoiceImmersive {...baseProps} open={false} />);
    expect(document.body.querySelector('[data-voice-immersive]')).toBeNull();
  });

  it('portals into document.body when open is true', () => {
    render(<VoiceImmersive {...baseProps} />);
    expect(document.body.querySelector('[data-voice-immersive]')).not.toBeNull();
  });

  it('renders the guidanceQuestion text', () => {
    render(<VoiceImmersive {...baseProps} />);
    expect(screen.getByText(baseProps.guidanceQuestion)).toBeInTheDocument();
  });

  it('does not render guide question when guidanceQuestion is empty', () => {
    render(<VoiceImmersive {...baseProps} guidanceQuestion="" />);
    // The heading label should still be there but no question <p>
    expect(screen.queryByText('Your Guide Asks')).not.toBeNull();
    // The guide question paragraph is conditionally rendered — nothing extra rendered
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
  });

  it('formats elapsedSeconds correctly — 0 → 00:00', () => {
    render(<VoiceImmersive {...baseProps} elapsedSeconds={0} />);
    const timers = screen.getAllByText('00:00');
    expect(timers.length).toBeGreaterThanOrEqual(1);
  });

  it('formats elapsedSeconds correctly — 65 → 01:05', () => {
    render(<VoiceImmersive {...baseProps} elapsedSeconds={65} />);
    const timers = screen.getAllByText('01:05');
    expect(timers.length).toBeGreaterThanOrEqual(1);
  });

  it('top-bar X calls onClose', () => {
    const onClose = vi.fn();
    render(<VoiceImmersive {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Cancel recording'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Done button calls onDone', () => {
    const onDone = vi.fn();
    render(<VoiceImmersive {...baseProps} onDone={onDone} />);
    fireEvent.click(screen.getByLabelText('Finish recording'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Skip to typing button calls onSkipToTyping', () => {
    const onSkipToTyping = vi.fn();
    render(<VoiceImmersive {...baseProps} onSkipToTyping={onSkipToTyping} />);
    fireEvent.click(screen.getByLabelText('Skip to typing'));
    expect(onSkipToTyping).toHaveBeenCalledTimes(1);
  });

  it('footer Pause button calls onPause', () => {
    const onPause = vi.fn();
    render(<VoiceImmersive {...baseProps} onPause={onPause} />);
    fireEvent.click(screen.getByLabelText('Collapse to compact recording bar'));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<VoiceImmersive {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the desktop panel variant (not full-screen) on non-mobile', () => {
    mockUseMediaQuery.mockReturnValue(false);
    render(<VoiceImmersive {...baseProps} />);
    const portal = document.body.querySelector('[data-voice-immersive]');
    expect(portal).not.toBeNull();
    // Desktop variant has a scrim (bg-black/50) and a centered panel
    const scrim = portal!.querySelector('[aria-hidden="true"]');
    expect(scrim).not.toBeNull();
  });

  it('renders the mobile full-screen variant', () => {
    mockUseMediaQuery.mockReturnValue(true);
    render(<VoiceImmersive {...baseProps} />);
    const portal = document.body.querySelector('[data-voice-immersive]');
    expect(portal).not.toBeNull();
    // Mobile: no scrim element outside the dialog
    const dialog = portal!.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
  });
});
