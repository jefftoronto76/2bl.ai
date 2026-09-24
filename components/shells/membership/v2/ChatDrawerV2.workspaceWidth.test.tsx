// Story-deck workspace fixes items 1 + 3 (2026-09): descendants grow the
// Workspace (ChatDrawerV2) through WorkspaceContext instead of squeezing the
// content that shares its row. Class-contract tests — happy-dom has no
// layout, so real pixel widths are verified on the Vercel preview.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';

import { ChatDrawerV2 } from './ChatDrawerV2';
import { useWorkspaceWidthRequest, type WorkspaceWidthRequest } from './WorkspaceContext';
import { PreviewModal } from './PreviewModal';

afterEach(() => {
  cleanup();
});

const LANDSCAPE_MIN = 'min-w-[min(100vw,calc(min(74vh,660px)*1.286+232px))]';

function Requester({ k, active }: { k: WorkspaceWidthRequest; active: boolean }) {
  useWorkspaceWidthRequest(k, active);
  return null;
}

function Drawer({ isFullScreen = false, children }: { isFullScreen?: boolean; children?: React.ReactNode }) {
  return (
    <ChatDrawerV2
      isFullScreen={isFullScreen}
      onToggleFullScreen={vi.fn()}
      onClose={vi.fn()}
      showHeader={false}
      title="Workspace"
      defaultWidthClassName="w-full max-w-2xl"
      navExpandedWidthClassName="w-full max-w-[880px]"
    >
      {children}
    </ChatDrawerV2>
  );
}

const drawer = () => screen.getByRole('dialog', { name: 'Workspace' });

describe('ChatDrawerV2 — Nav expansion grows the Workspace', () => {
  it('uses the default (rail) width with no requests', () => {
    render(<Drawer />);
    expect(drawer().className).toContain('max-w-2xl');
    expect(drawer().className).not.toContain('max-w-[880px]');
  });

  it('switches to the nav-expanded width while a navExpanded request is active, and back when it clears', () => {
    const { rerender } = render(<Drawer><Requester k="navExpanded" active /></Drawer>);
    expect(drawer().className).toContain('max-w-[880px]');
    expect(drawer().className).not.toContain('max-w-2xl');

    rerender(<Drawer><Requester k="navExpanded" active={false} /></Drawer>);
    expect(drawer().className).toContain('max-w-2xl');
  });

  it('clears the request when the requester unmounts', () => {
    const { rerender } = render(<Drawer><Requester k="navExpanded" active /></Drawer>);
    rerender(<Drawer />);
    expect(drawer().className).toContain('max-w-2xl');
  });

  it('ignores requests at full screen — there is no room left to grow, so content absorbs it', () => {
    render(<Drawer isFullScreen><Requester k="navExpanded" active /><Requester k="landscapePreview" active /></Drawer>);
    expect(drawer().className).toContain('w-screen');
    expect(drawer().className).not.toContain('max-w-[880px]');
    expect(drawer().className).not.toContain(LANDSCAPE_MIN);
  });

  it('never grows for the Nav when the mount passes no navExpandedWidthClassName', () => {
    render(
      <ChatDrawerV2 isFullScreen={false} onToggleFullScreen={vi.fn()} onClose={vi.fn()} showHeader={false} title="Workspace" defaultWidthClassName="w-full max-w-2xl">
        <Requester k="navExpanded" active />
      </ChatDrawerV2>,
    );
    expect(drawer().className).toContain('max-w-2xl');
  });

  it('animates min-width along with width, on the same curve', () => {
    render(<Drawer />);
    expect(drawer().className).toContain('transition-[transform,width,min-width]');
    expect(drawer().className).toContain('duration-500');
  });
});

describe('ChatDrawerV2 — Preview Landscape grows the Workspace (item 3)', () => {
  function PreviewHarness() {
    const [open, setOpen] = useState(true);
    return (
      <Drawer>
        <button type="button" onClick={() => setOpen(true)}>Reopen</button>
        <PreviewModal open={open} storyName="A Life" cover={null} backPage={null} memories={[]} onClose={() => setOpen(false)} />
      </Drawer>
    );
  }

  it('adds the landscape min-width only while Preview is open in Landscape', () => {
    render(<PreviewHarness />);
    expect(drawer().className).not.toContain(LANDSCAPE_MIN);

    fireEvent.click(screen.getByRole('button', { name: 'landscape' }));
    expect(drawer().className).toContain(LANDSCAPE_MIN);

    fireEvent.click(screen.getByRole('button', { name: 'novel' }));
    expect(drawer().className).not.toContain(LANDSCAPE_MIN);

    fireEvent.click(screen.getByRole('button', { name: 'landscape' }));
    expect(drawer().className).toContain(LANDSCAPE_MIN);
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(drawer().className).not.toContain(LANDSCAPE_MIN);
  });

  it('keeps the base width alongside the min-width (min-width wins only when larger)', () => {
    render(<PreviewHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'landscape' }));
    expect(drawer().className).toContain('max-w-2xl');
  });
});

describe('WorkspaceContext hooks outside a provider', () => {
  it('useWorkspaceWidthRequest is a no-op without a drawer', () => {
    expect(() => render(<Requester k="navExpanded" active />)).not.toThrow();
  });
});
