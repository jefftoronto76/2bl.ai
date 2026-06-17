'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { AuditAction } from '@/services/audit/types';

// BeforeInstallPromptEvent is a non-standard Chrome event not yet in lib.dom.d.ts.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type PWAPlatform = 'android' | 'ios' | 'other';

export interface PWAInstallState {
  /** True when the install prompt is available (Android) or iOS Safari not yet standalone. */
  canInstall: boolean;
  /** Detected platform — determines which install UI to show. */
  platform: PWAPlatform;
  /**
   * Trigger the install prompt.
   * - Android: fires the captured beforeinstallprompt event.
   * - iOS: resolves immediately — caller is responsible for showing the
   *   "Share → Add to Home Screen" instructions sheet.
   */
  promptInstall: () => Promise<void>;
}

function detectPlatform(): PWAPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  if (isIOS) return 'ios';
  // Android Chrome fires beforeinstallprompt — we treat everything non-iOS
  // that fired the event as 'android' for install-flow branching.
  return 'android';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    // Safari on iOS sets navigator.standalone
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);
}

async function logPWAEvent(
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch('/api/events/pwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, metadata }),
      keepalive: true,
    });
  } catch {
    // Fire-and-forget — never let observability break the install flow
  }
}

export function usePWAInstall(): PWAInstallState {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const platform = useRef<PWAPlatform>('other');

  useEffect(() => {
    platform.current = detectPlatform();

    // iOS: can "install" via Share → Add to Home Screen if not already standalone
    if (platform.current === 'ios' && !isStandalone()) {
      setCanInstall(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      platform.current = 'android';
      setCanInstall(true);

      track('pwa_install_available');
      void logPWAEvent(AuditAction.PWA_INSTALL_PROMPTED, {
        platform: 'android',
      });
    };

    const handleAppInstalled = () => {
      deferredPrompt.current = null;
      setCanInstall(false);

      track('pwa_installed', { platform: platform.current });
      void logPWAEvent(AuditAction.PWA_INSTALLED, {
        platform: platform.current,
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    track('pwa_install_triggered', { platform: platform.current });

    if (platform.current === 'android' && deferredPrompt.current) {
      await deferredPrompt.current.prompt();
      const choice = await deferredPrompt.current.userChoice;
      deferredPrompt.current = null;
      if (choice.outcome === 'accepted') {
        setCanInstall(false);
      }
    }
    // iOS: caller shows the Share → Add to Home Screen instructions sheet
  }, []);

  return { canInstall, platform: platform.current, promptInstall };
}
