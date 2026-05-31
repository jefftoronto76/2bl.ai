import { describe, it, expect } from 'vitest';
import { chatReducer, initialState, type ShellState } from './chatReducer';

describe('chatReducer — shell state', () => {
  it('initialState is collapsed sidebar + closed panel', () => {
    expect(initialState).toEqual({ isSidebarExpanded: false, isChatOpen: false });
  });

  it('TOGGLE_SIDEBAR flips isSidebarExpanded', () => {
    const opened = chatReducer(initialState, { type: 'TOGGLE_SIDEBAR' });
    expect(opened.isSidebarExpanded).toBe(true);
    const closed = chatReducer(opened, { type: 'TOGGLE_SIDEBAR' });
    expect(closed.isSidebarExpanded).toBe(false);
  });

  it('SET_SIDEBAR sets isSidebarExpanded explicitly', () => {
    expect(chatReducer(initialState, { type: 'SET_SIDEBAR', payload: true }).isSidebarExpanded).toBe(true);
    const expanded: ShellState = { isSidebarExpanded: true, isChatOpen: false };
    expect(chatReducer(expanded, { type: 'SET_SIDEBAR', payload: false }).isSidebarExpanded).toBe(false);
  });

  it('OPEN_CHAT opens the panel; CLOSE_CHAT closes it', () => {
    const opened = chatReducer(initialState, { type: 'OPEN_CHAT' });
    expect(opened.isChatOpen).toBe(true);
    const closed = chatReducer(opened, { type: 'CLOSE_CHAT' });
    expect(closed.isChatOpen).toBe(false);
  });

  it('OPEN_CHAT preserves sidebar state (independent shell fields)', () => {
    const expanded: ShellState = { isSidebarExpanded: true, isChatOpen: false };
    expect(chatReducer(expanded, { type: 'OPEN_CHAT' })).toEqual({
      isSidebarExpanded: true,
      isChatOpen: true,
    });
  });

  it('does not mutate the input state', () => {
    const input: ShellState = { isSidebarExpanded: true, isChatOpen: true };
    const snapshot = { ...input };
    chatReducer(input, { type: 'TOGGLE_SIDEBAR' });
    expect(input).toEqual(snapshot);
  });
});
