// Probe: the Framer Motion surface the flip needs, under the repo's strict flags.
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function Probe({ page, onDone }: { page: number; onDone: () => void }) {
  const rotateY = useMotionValue(0);
  const reduced = useReducedMotion();
  const frontOpacity = useTransform(rotateY, [-90, -1, 1, 90], [0, 1, 1, 0]);
  const shadow = useTransform(rotateY, (v: number) => `0 ${Math.abs(v) / 10}px 20px rgb(0 0 0 / 0.2)`);
  const last = useRef(page);
  useEffect(() => {
    if (last.current === page) return;
    const controls = animate(rotateY, -180, { duration: reduced ? 0 : 0.6, onComplete: onDone });
    return () => controls.stop();
  }, [page, reduced, rotateY, onDone]);
  const onDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo): void => {
    if (info.velocity.x < -500) onDone();
  };
  return (
    <motion.div style={{ rotateY, opacity: frontOpacity, boxShadow: shadow }} drag="x" dragElastic={0} dragMomentum={false} onDragEnd={onDragEnd} />
  );
}
