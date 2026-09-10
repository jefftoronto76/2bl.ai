import { StrictMode, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import HTMLFlipBook from 'react-pageflip';
import { BookSpike, type SpikeEvent } from '../spike/BookSpike';
import type { FlipBookHandle } from '../spike/pageFlipTypes';

interface MountOptions { strict?: boolean; pageCount?: number; variant?: 'spike' | 'raw'; label?: string; renderOnly?: boolean }

declare global {
  interface Window {
    __events: SpikeEvent[];
    __mount: (opts: MountOptions) => void;
    __unmount: () => void;
    __handle: FlipBookHandle | null;
  }
}

window.__events = [];
window.__handle = null;
let root: Root | null = null;
const record = (e: SpikeEvent) => { window.__events.push(e); };

/** Raw HTMLFlipBook with no wrapper: used to measure the library's own unmount behaviour. */
function RawBook({ pageCount, label, renderOnly }: { pageCount: number; label: string; renderOnly: boolean }) {
  const ref = useRef<FlipBookHandle>(null);
  window.__handle = ref.current;
  const ev = (name: SpikeEvent['name']) => (e: { data: unknown }) => record({ name, data: `${label}/${JSON.stringify(e.data)}`, at: performance.now() });
  const pages: ReactNode[] = Array.from({ length: pageCount }, (_, i) => <div key={i} className="page">Raw {i + 1}</div>);
  return (
    <HTMLFlipBook
      ref={(h: FlipBookHandle | null) => { ref.current = h; window.__handle = h; }}
      width={300} height={420} className="" style={{}} startPage={0} size="fixed"
      minWidth={0} maxWidth={0} minHeight={0} maxHeight={0} drawShadow flippingTime={400}
      usePortrait startZIndex={0} autoSize maxShadowOpacity={1} showCover={false}
      mobileScrollSupport clickEventForward useMouseEvents swipeDistance={30}
      showPageCorners disableFlipByClick={false} renderOnlyPageLengthChange={renderOnly}
      onInit={ev('init')} onFlip={ev('flip')} onChangeState={ev('changeState')}
      onChangeOrientation={ev('changeOrientation')} onUpdate={ev('update')}
    >
      {pages}
    </HTMLFlipBook>
  );
}

function SpikeHost({ pageCount, label }: { pageCount: number; label: string }) {
  return <BookSpike onEvent={(e) => record({ ...e, data: `${label}/${JSON.stringify(e.data)}` })} pageCount={pageCount} />;
}

window.__mount = ({ strict = false, pageCount = 6, variant = 'spike', label = 'A', renderOnly = false }: MountOptions) => {
  const container = document.getElementById('root');
  if (!container) throw new Error('no root');
  root ??= createRoot(container);
  const tree = variant === 'raw' ? <RawBook pageCount={pageCount} label={label} renderOnly={renderOnly} /> : <SpikeHost pageCount={pageCount} label={label} />;
  root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};
window.__unmount = () => { root?.unmount(); root = null; };
