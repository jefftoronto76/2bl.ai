'use client';

export type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'multiple';

export type MediaAction =
  | 'story'
  | 'ocr'
  | 'stt'
  | 'tagPeople'
  | 'tagDate'
  | 'caption'
  | 'memory'
  | 'frameGrab'
  | 'reviewEach'
  | 'batchFile'
  | 'file';

export interface Pill {
  action: MediaAction;
  label: string;
  primary?: boolean;
}

export function pillsFor(kind: MediaKind): Pill[] {
  switch (kind) {
    case 'image':
      return [
        { action: 'story', label: 'Tell its story', primary: true },
        { action: 'tagPeople', label: "Who's in it?" },
        { action: 'tagDate', label: 'When was this?' },
        { action: 'caption', label: 'Add a caption' },
        { action: 'file', label: 'Just keep it' },
      ];
    case 'document':
      return [
        { action: 'ocr', label: 'Transcribe', primary: true },
        { action: 'story', label: 'Tell its story' },
        { action: 'tagPeople', label: 'Tag people' },
        { action: 'file', label: 'Just keep it' },
      ];
    case 'audio':
      return [
        { action: 'stt', label: 'Transcribe', primary: true },
        { action: 'memory', label: 'Add as a memory' },
        { action: 'file', label: 'Just keep it' },
      ];
    case 'video':
      return [
        { action: 'stt', label: 'Transcribe', primary: true },
        { action: 'frameGrab', label: 'Pull a still' },
        { action: 'story', label: 'Tell its story' },
        { action: 'file', label: 'Just keep it' },
      ];
    case 'multiple':
      return [
        { action: 'reviewEach', label: 'Process one by one', primary: true },
        { action: 'batchFile', label: 'Add all to a chapter' },
      ];
  }
}

interface MediaPillsProps {
  kind: MediaKind;
  onPill: (action: MediaAction) => void;
}

export function MediaPills({ kind, onPill }: MediaPillsProps) {
  const pills = pillsFor(kind);

  return (
    <div
      role="group"
      aria-label="What would you like to do with this?"
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none mt-2"
    >
      {pills.map((pill) => (
        <button
          key={pill.action}
          type="button"
          aria-label={pill.label}
          onClick={() => onPill(pill.action)}
          className={[
            'flex-shrink-0 rounded-full px-4 py-2 text-sm font-body transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            pill.primary
              ? 'bg-accent text-background hover:bg-accent-hover'
              : 'bg-surface border border-border text-text-primary hover:border-accent/40',
          ].join(' ')}
        >
          {pill.label}
        </button>
      ))}
    </div>
  );
}
