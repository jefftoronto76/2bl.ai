import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReadSpike, type ReadSpikeEvent } from '../spike/ReadSpike';

declare global {
  interface Window {
    __events: ReadSpikeEvent[];
    __mount: (opts?: { strict?: boolean }) => void;
    __unmount: () => void;
  }
}

window.__events = [];
let root: Root | null = null;
const record = (e: ReadSpikeEvent) => { window.__events.push(e); };

window.__mount = ({ strict = true } = {}) => {
  const container = document.getElementById('root');
  if (!container) throw new Error('no root');
  root ??= createRoot(container);
  const tree = (
    <div id="surface" className="flex items-center justify-center">
      <ReadSpike onEvent={record} />
    </div>
  );
  root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};
window.__unmount = () => { root?.unmount(); root = null; };
