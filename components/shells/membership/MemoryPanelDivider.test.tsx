// Unit coverage for MemoryPanelDivider's hover/drag visual treatment
// (memory-panel-layout Stage D). The drag mechanic itself (Stage C) already
// has integration coverage via ChatHero.memoryPanel.test.tsx — this file is
// scoped to the new hot/live-driven styling only, tested in isolation so it
// doesn't need the rest of ChatHero mounted.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryPanelDivider } from './MemoryPanelDivider';

afterEach(cleanup);

function renderDivider() {
  const onStart = vi.fn(() => 400);
  const onMove = vi.fn();
  const onDragStateChange = vi.fn();
  render(
    <MemoryPanelDivider
      label="Resize the memory panel"
      onStart={onStart}
      onMove={onMove}
      onDragStateChange={onDragStateChange}
    />,
  );
  const divider = screen.getByRole('separator', { name: 'Resize the memory panel' });
  const [line, pill] = Array.from(divider.children) as HTMLSpanElement[];
  return { divider, line, pill, onMove, onDragStateChange };
}

describe('MemoryPanelDivider — hover/drag visual treatment', () => {
  it('is at rest by default: border-colored line, invisible pill, no background wash', () => {
    const { divider, line, pill } = renderDivider();
    expect(line.className).toContain('bg-border');
    expect(line.className).not.toContain('bg-accent');
    expect(pill.className).toContain('opacity-0');
    expect(divider.className).not.toContain('bg-accent');
  });

  it('hover with no drag shows the treatment, and reverts cleanly on mouse-away', () => {
    const { divider, line, pill } = renderDivider();

    fireEvent.mouseEnter(divider);
    expect(line.className).toContain('bg-accent');
    expect(pill.className).toContain('opacity-100');
    expect(divider.className).toContain('bg-accent/[0.12]');

    fireEvent.mouseLeave(divider);
    expect(line.className).toContain('bg-border');
    expect(line.className).not.toContain('bg-accent');
    expect(pill.className).toContain('opacity-0');
    expect(divider.className).not.toContain('bg-accent');
  });

  it('dragging (no hover) also shows the treatment, and it holds until pointerup', () => {
    const { divider, line, pill } = renderDivider();

    fireEvent.pointerDown(divider, { clientX: 500, button: 0 });
    expect(line.className).toContain('bg-accent');
    expect(pill.className).toContain('opacity-100');

    fireEvent.pointerMove(window, { clientX: 450 });
    expect(line.className).toContain('bg-accent'); // still live mid-drag

    fireEvent.pointerUp(window);
    expect(line.className).toContain('bg-border');
    expect(pill.className).toContain('opacity-0');
  });

  it('mouse leaving mid-drag does not turn off the treatment — it tracks drag-live, not just hover', () => {
    const { divider, line } = renderDivider();

    fireEvent.mouseEnter(divider);
    fireEvent.pointerDown(divider, { clientX: 500, button: 0 });
    fireEvent.mouseLeave(divider); // cursor outstrips the 9px zone during a fast drag
    expect(line.className).toContain('bg-accent'); // live still true

    fireEvent.pointerUp(window);
    expect(line.className).toContain('bg-border');
  });
});
