/**
 * Shared types for this package. Extends the `Memory` / `MemoryToolMessage`
 * shapes from design_handoff_memories — import those, don't redefine them.
 */

import type { MemoryKind } from '../design_handoff_memories/MemoryKinds';

/** A file attached inline to a visitor's own chat message (not a memory card). */
export type Upload = {
  id: string;
  kindKey: Exclude<MemoryKind, 'conversation'>; // photo | video | audio | document
  filename: string;
  url?: string;
  status: 'uploading' | 'ready' | 'failed';
  /**
   * Whether GPS/location data was found in the file. SIMULATED in the prototype
   * (true for every successful photo). A real implementation sets this from
   * server-side EXIF extraction once processing completes — see README §4.
   */
  gpsFound?: boolean;
  /** Present once gpsFound is true and a real pipeline exists. Undecided — see README §2. */
  location?: { lat: number; lng: number; place?: string };
};

/** Props shared by the two memory-canvas views (list and card). */
export type MemoryCanvasMode =
  | { view: 'list' }
  | { view: 'list'; selectMode: true; pendingUploadId: string }
  | { view: 'card'; memoryId: string };
