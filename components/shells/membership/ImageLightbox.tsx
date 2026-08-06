'use client';

// components/shells/membership/ImageLightbox.tsx
//
// Near-full-screen image viewer, reached by tapping a ready image thumbnail
// in the chat (UploadThumbnail). Portaled into ChatDrawerV2's relative body
// via useChatOverlayHost — same mechanism VoiceImmersive uses, and for the
// same reason: ChatDrawerV2's slide animation is a CSS transform, which
// makes `position: fixed` descendants trapped inside it. `absolute inset-0`
// on this host is transform-safe.
//
// Dismissal is tap-based only (backdrop tap, explicit back button, Escape)
// — confirmed decision, no swipe-gesture code; there is no precedent for
// swipe gestures anywhere in this codebase.

import { X } from 'lucide-react';
import { useRef } from 'react';
import { useModalA11y } from './v2/useModalA11y';

export interface ImageLightboxProps {
  src: string;
  filename: string;
  onClose: () => void;
}

export function ImageLightbox({ src, filename, onClose }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(true, dialogRef, onClose);

  return (
    <div
      onClick={onClose}
      role="presentation"
      className="absolute inset-0 z-[70] flex flex-col bg-black/90 motion-safe:animate-[hl-fade-in_.2s_ease]"
    >
      <div className="flex justify-end p-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="relative grid place-items-center w-10 h-10 rounded-lg text-white/90 hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <X size={22} />
        </button>
      </div>

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={filename}
        onClick={e => e.stopPropagation()}
        className="flex-1 min-h-0 flex items-center justify-center px-4 pb-4 focus:outline-none"
      >
        <img src={src} alt={filename} className="max-h-full max-w-full object-contain" />
      </div>

      <p className="pb-5 px-4 text-center font-body text-[13px] text-white/80 truncate">{filename}</p>
    </div>
  );
}
