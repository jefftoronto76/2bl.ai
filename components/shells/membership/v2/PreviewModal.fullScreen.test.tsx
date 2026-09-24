// Story-deck workspace fixes item 4 (2026-09): Preview's own expand-to-100%
// control. It reuses ChatDrawerV2's isFullScreen/onToggleFullScreen via
// WorkspaceContext (Preview fills the Workspace, so a full-screen Workspace
// IS a full-screen Preview). Closing Preview restores the previous width
// only if Preview's own button turned full screen on.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';

import { ChatDrawerV2 } from './ChatDrawerV2';
import { PreviewModal } from './PreviewModal';

afterEach(() => {
  cleanup();
});

function Harness({ startFullScreen = false, onToggleSpy }: { startFullScreen?: boolean; onToggleSpy?: () => void }) {
  const [isFullScreen, setIsFullScreen] = useState(startFullScreen);
  const [open, setOpen] = useState(true);
  return (
    <ChatDrawerV2
      isFullScreen={isFullScreen}
      onToggleFullScreen={() => { onToggleSpy?.(); setIsFullScreen((v) => !v); }}
      onClose={vi.fn()}
      showHeader={false}
      title="Workspace"
      defaultWidthClassName="w-full max-w-2xl"
    >
      <button type="button" onClick={() => setOpen(true)}>Open preview</button>
      <PreviewModal open={open} storyName="A Life" cover={null} backPage={null} memories={[]} onClose={() => setOpen(false)} />
    </ChatDrawerV2>
  );
}

const drawer = () => screen.getByRole('dialog', { name: 'Workspace' });

describe('PreviewModal — expand to full screen', () => {
  it('shows an "Expand to full screen" button that puts the Workspace at 100vw, then flips to "Exit full screen"', () => {
    render(<Harness />);
    expect(drawer().className).not.toContain('w-screen');

    fireEvent.click(screen.getByRole('button', { name: 'Expand to full screen' }));
    expect(drawer().className).toContain('w-screen');

    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(drawer().className).not.toContain('w-screen');
  });

  it('restores the previous width on close when Preview itself turned full screen on', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand to full screen' }));
    expect(drawer().className).toContain('w-screen');

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(drawer().className).not.toContain('w-screen');
  });

  it('leaves full screen alone on close when the Workspace was already full screen before Preview opened', () => {
    const spy = vi.fn();
    render(<Harness startFullScreen onToggleSpy={spy} />);
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(drawer().className).toContain('w-screen');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not toggle on close when the member expanded and then exited full screen from Preview', () => {
    const spy = vi.fn();
    render(<Harness onToggleSpy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand to full screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(spy).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(drawer().className).not.toContain('w-screen');
  });

  it('only restores once — reopening Preview starts fresh', () => {
    const spy = vi.fn();
    render(<Harness onToggleSpy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand to full screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(spy).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Open preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('renders no full-screen button outside a drawer (no toggle to reuse)', () => {
    render(<PreviewModal open storyName="A Life" cover={null} backPage={null} memories={[]} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /full screen/ })).toBeNull();
  });
});
