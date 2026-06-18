'use client';
import { useState, useRef, useEffect } from 'react';

const DELAY = 2800, AUTOHIDE = 6500;

export function usePeekCoach(
  mode: string,
  rule: 'first-use' | 'session' | 'every' | 'off' = 'first-use',
  armKey: unknown,
) {
  const [show, setShow] = useState(false);
  const openedRef = useRef(false);

  const allowed = () => {
    if (mode !== 'peek' || rule === 'off') return false;
    if (rule === 'first-use') return localStorage.getItem('hl.peekCoachUsed') !== '1';
    if (rule === 'session')   return sessionStorage.getItem('hl.peekCoachSession') !== '1';
    return true;
  };

  useEffect(() => {
    openedRef.current = false;
    setShow(false);
    if (!allowed()) return;
    const id = setTimeout(() => {
      if (openedRef.current) return;
      setShow(true);
      if (rule === 'session') sessionStorage.setItem('hl.peekCoachSession', '1');
    }, DELAY);
    return () => clearTimeout(id);
  }, [armKey, mode, rule]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(false), AUTOHIDE);
    return () => clearTimeout(id);
  }, [show]);

  const learned = () => { localStorage.setItem('hl.peekCoachUsed', '1'); setShow(false); };
  return { show, learned, openedRef };
}
