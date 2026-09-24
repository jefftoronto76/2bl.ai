'use client';

// components/shells/membership/v2/WorkspaceContext.tsx
//
// Lets a descendant of ChatDrawerV2 (the Workspace) ask the drawer to change
// its own outer size, instead of squeezing whatever else shares the row.
// Sibling of ChatOverlayHost.tsx: same "the drawer publishes something to
// deep children" pattern, one context for every size concern:
//
//   • 'navExpanded'      — the docked Nav is expanded (w-64) rather than
//                          the w-12 rail. The Workspace grows by the Nav's
//                          delta so Chat and any open panel keep their exact
//                          pixel widths (story-deck workspace fixes item 1).
//   • 'landscapePreview' — PreviewModal is showing the Landscape page, which
//                          is wider than the default Workspace (item 3).
//
// It also re-publishes the drawer's own full-screen state + toggle, so
// PreviewModal can reuse that exact mechanism rather than inventing one
// (item 4).
//
// Every hook here is a no-op outside a provider — SidebarV2/StoryView/
// PreviewModal render unchanged in isolation (tests, any non-drawer mount).

import { createContext, useContext, useEffect } from 'react';

export type WorkspaceWidthRequest = 'navExpanded' | 'landscapePreview';

export interface WorkspaceContextValue {
  /** The drawer is at 100vw — no room left to grow. */
  isFullScreen: boolean;
  /** The drawer's own full-screen toggle, when the mount provides one. */
  onToggleFullScreen?: () => void;
  /** Turns one width request on or off. */
  setWidthRequest: (key: WorkspaceWidthRequest, active: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

export function useWorkspace(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}

/**
 * Declares that this component needs the Workspace to accommodate `key`
 * while `active` is true. Cleared automatically when `active` goes false
 * or the component unmounts, so a request can never outlive its owner.
 */
export function useWorkspaceWidthRequest(key: WorkspaceWidthRequest, active: boolean): void {
  const setWidthRequest = useContext(WorkspaceContext)?.setWidthRequest;
  useEffect(() => {
    if (!setWidthRequest || !active) return;
    setWidthRequest(key, true);
    return () => setWidthRequest(key, false);
  }, [setWidthRequest, key, active]);
}
