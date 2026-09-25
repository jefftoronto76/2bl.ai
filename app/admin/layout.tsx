import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but admin lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { AdminThemeProvider } from '@/components/admin/theme/AdminThemeProvider';
import type { BrandingForTheme } from '@/components/admin/theme/mantine-theme';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { AdminUserProvider } from '@/services/auth/admin-user-context';
import { syncUser, getTenantName, getCurrentUserTimed, getTenantType, getAuthContext } from '@/services/auth';
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { ALL_FONTS, type FontEntry } from '@/services/branding/font-registry';
import { createPhaseTimer, AuditAction } from '@/services/audit';
import { after } from 'next/server';

// Timing instrumentation (2026-09, measurement only): one
// ADMIN_PAGE_LOAD_TIMING audit event per render with per-phase durations.
// timer.time() is a transparent pass-through — each stage's Promise.all
// members still run concurrently.
//
// Two stages (auth dedupe, 2026-09): getAuthContext() is resolved exactly
// once, in stage 1 alongside syncUser/getCurrentUser (all independent). Stage
// 2 — tenant name, tenant type, branding — only needs its tenant_id, so those
// three run concurrently once stage 1 settles. Previously getTenantName() and
// getTenantType() each re-ran the full auth chain internally, so it ran three
// times per render.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const timer = createPhaseTimer();
  const [supabaseUserId, user, authCtx] = await Promise.all([
    timer.time('syncUser', () => syncUser()),
    timer.time('getCurrentUser', () => getCurrentUserTimed('app/admin/layout.tsx')),
    // An auth failure never failed the render before (the tenant helpers
    // swallowed it, branding sat in a try) — keep it that way.
    timer.time('authContext', () => getAuthContext()).catch((err) => {
      console.error('[admin layout] auth context failed:', err instanceof Error ? err.message : err);
      return null;
    }),
  ])

  // Resolve branding server-side; pass raw values to AdminThemeProvider (client).
  // generateColors() is client-only so theme construction happens in the provider.
  let tenantName: string | null = null;
  let tenantType: string | null = null;
  let resolvedBranding: BrandingForTheme | null = null;
  let resolvedTenantId: string | undefined;
  let brandingFontEntries: FontEntry[] = [];
  let faviconBase: string | null = null;
  if (authCtx) {
    const tenantId = authCtx.tenant_id;
    resolvedTenantId = tenantId;
    const [name, type, branding] = await Promise.all([
      timer.time('tenantName', () => getTenantName(tenantId)),
      timer.time('tenantType', () => getTenantType(tenantId)),
      // null yields the same defaults the old catch path left in place.
      timer.time('branding', () => getTenantBranding(tenantId, 'admin')).catch((err) => {
        console.error('[admin layout] branding fetch failed:', err instanceof Error ? err.message : err);
        return null;
      }),
    ]);
    tenantName = name;
    tenantType = type;
    faviconBase = branding?.favicon_base_path ?? null;
    const useDbBranding = branding?.use_db_branding === true;
    console.log('[branding:admin]', JSON.stringify({ branding }));
    resolvedBranding = useDbBranding ? branding : null;
    console.log('[admin layout] branding resolved:', {
      tenant_id: tenantId,
      use_db_branding: useDbBranding,
      font_primary: branding?.font_primary,
      font_secondary: branding?.font_secondary,
      accent: branding?.accent,
    });
    if (useDbBranding) {
      const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));
      brandingFontEntries = [
        branding?.font_primary,
        branding?.font_secondary,
        branding?.font_mono,
      ]
        .filter((v): v is string => !!v && allowedFontValues.has(v))
        .map(v => ALL_FONTS.find(f => f.value === v)!)
        .filter(e => !!e?.googleFamily);
    }
  }
  // Registered after both stages so it runs on the success path and on the
  // caught auth/branding failure paths. after(): keep the insert alive past the response.
  after(() => timer.log(AuditAction.ADMIN_PAGE_LOAD_TIMING, { path: 'app/admin/layout.tsx', method: 'GET', status: 200, tenantId: resolvedTenantId }));
  const isPlatformAdmin = user?.isPlatformAdmin === true && tenantType === 'platform'
  console.log('[admin layout]', { isPlatformAdmin: user?.isPlatformAdmin, tenantType, computed: user?.isPlatformAdmin === true && tenantType === 'platform' })

  return (
    <>
      {faviconBase && (
        <>
          <link rel="icon" href={`${faviconBase}/favicon.ico`} sizes="any" />
          <link rel="icon" href={`${faviconBase}/favicon.svg`} type="image/svg+xml" />
          <link rel="icon" href={`${faviconBase}/favicon-96x96.png`} sizes="96x96" type="image/png" />
          <link rel="apple-touch-icon" href={`${faviconBase}/apple-touch-icon.png`} />
          <link rel="manifest" href={`${faviconBase}/site.webmanifest`} />
        </>
      )}
      {brandingFontEntries.map(entry => (
        <link
          key={entry.googleFamily}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`}
        />
      ))}
      <AdminUserProvider supabaseUserId={supabaseUserId}>
        <AdminThemeProvider branding={resolvedBranding} tenantId={resolvedTenantId}>
          <UnifiedAdminShell tenantName={tenantName ?? 'Natural Resource'} isPlatformAdmin={isPlatformAdmin}>
            {children}
          </UnifiedAdminShell>
        </AdminThemeProvider>
      </AdminUserProvider>
    </>
  );
}
