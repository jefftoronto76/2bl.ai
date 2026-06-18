'use client';

import { useEffect } from 'react';
import { Camera, Images, ScanLine, Mic, X } from 'lucide-react';

interface SourceSheetProps {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onLibrary: () => void;
  onScan: () => void;
  onRecord: () => void;
}

interface OptionRowProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function OptionRow({ icon, label, onClick }: OptionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 w-full px-6 py-3.5 min-h-[44px] text-left text-text-primary hover:bg-text-primary/5 active:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      <span className="flex-shrink-0 text-text-muted">{icon}</span>
      <span className="font-body text-[15px]">{label}</span>
    </button>
  );
}

export function SourceSheet({ open, onClose, onCamera, onLibrary, onScan, onRecord }: SourceSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add attachment"
        inert={!open}
        className={[
          'fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-2xl shadow-xl transition-transform duration-300 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* Handle + close row */}
        <div className="relative flex items-center justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-text-primary/20" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3 grid place-items-center w-8 h-8 rounded-full text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={16} />
          </button>
        </div>

        {/* Options */}
        <div className="divide-y divide-text-primary/10 mt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <OptionRow
            icon={<Camera size={20} />}
            label="Take a photo"
            onClick={() => { onCamera(); onClose(); }}
          />
          <OptionRow
            icon={<Images size={20} />}
            label="Photo library"
            onClick={() => { onLibrary(); onClose(); }}
          />
          <OptionRow
            icon={<ScanLine size={20} />}
            label="Scan a document"
            onClick={() => { onScan(); onClose(); }}
          />
          <OptionRow
            icon={<Mic size={20} />}
            label="Record audio"
            onClick={() => { onRecord(); onClose(); }}
          />
        </div>
      </div>
    </>
  );
}
