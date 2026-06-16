'use client';

import { useEffect, useRef } from 'react';
import { Camera, Image as ImageIcon, FileText, Mic, Upload, X } from 'lucide-react';

export interface SourceSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with a FileList from any picker (camera / gallery / browse). */
  onFiles: (files: FileList) => void;
  /** Called when the user chooses "Record" — parent starts MediaRecorder. */
  onRecord: () => void;
  isMember: boolean;
}

interface SourceRow {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  action: 'camera' | 'gallery' | 'scan' | 'record' | 'browse';
  primary?: boolean;
}

const ROWS: SourceRow[] = [
  {
    icon: <Camera size={20} />,
    label: 'Take a photo',
    sub: 'Open camera',
    action: 'camera',
    primary: true,
  },
  {
    icon: <ImageIcon size={20} />,
    label: 'Photo library',
    sub: 'Choose from photos',
    action: 'gallery',
  },
  {
    icon: <FileText size={20} />,
    label: 'Scan a document',
    sub: 'Letter, certificate, clipping',
    action: 'scan',
  },
  {
    icon: <Mic size={20} />,
    label: 'Record audio',
    sub: 'Voice memo or story',
    action: 'record',
  },
  {
    icon: <Upload size={20} />,
    label: 'Browse files',
    sub: 'Any file from your device',
    action: 'browse',
  },
];

export function SourceSheet({ open, onClose, onFiles, onRecord, isMember }: SourceSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const browseRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleAction = (action: SourceRow['action']) => {
    onClose();
    switch (action) {
      case 'camera':
        cameraRef.current?.click();
        break;
      case 'gallery':
        galleryRef.current?.click();
        break;
      case 'scan':
        // PWA-gated: fallback to gallery picker (same as photo library)
        galleryRef.current?.click();
        break;
      case 'record':
        onRecord();
        break;
      case 'browse':
        browseRef.current?.click();
        break;
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — capture is valid HTML but not in all TS libs
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={galleryRef}
        type="file"
        accept=".jpg,.jpeg,.png,.gif,.webp"
        multiple
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={browseRef}
        type="file"
        multiple
        accept=".m4a,.mp3,.wav,.ogg,.webm,.jpg,.jpeg,.png,.webp,.pdf,.docx,.txt"
        className="hidden"
        onChange={onInputChange}
      />

      {/* Sheet panel — positioned above the composer by the parent */}
      <div
        ref={sheetRef}
        role="menu"
        aria-label="Add media"
        className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl border border-border bg-surface shadow-xl z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-display text-[15px] text-text-primary italic">Add to this memory</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid place-items-center w-7 h-7 rounded-lg text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={15} />
          </button>
        </div>

        {/* Rows */}
        <div className="py-1">
          {ROWS.map((row) => (
            <button
              key={row.action}
              type="button"
              role="menuitem"
              aria-label={row.label}
              disabled={!isMember}
              onClick={() => handleAction(row.action)}
              className="w-full flex items-center gap-3.5 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-text-primary/8 group"
            >
              <span
                className={`flex-shrink-0 grid place-items-center w-9 h-9 rounded-xl transition-colors ${
                  row.primary
                    ? 'bg-accent text-background'
                    : 'bg-text-primary/10 text-text-muted group-hover:text-text-primary group-hover:bg-text-primary/15'
                }`}
              >
                {row.icon}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-body text-[14px] text-text-primary">{row.label}</span>
                {row.sub && (
                  <span className="font-mono text-[11px] text-text-muted mt-0.5">{row.sub}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
