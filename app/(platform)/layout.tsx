import { getCurrentUserTimed, getTenantName, getTenantType, getAuthContext } from '@/services/auth';
import { redirect } from 'next/navigation';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but platform lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { AdminThemeProvider } from '@/components/admin/theme/AdminThemeProvider';
import type { BrandingForTheme } from '@/components/admin/theme/mantine-theme';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { ALL_FONTS, type FontEntry } from '@/services/branding/font-registry';

// Platform admin is gated here in the layout (server component) rather than via
// middleware auth.protect(): no NEXT_PUBLIC_CLERK_SIGN_IN_URL is configured, so
// middleware would redirect to Clerk's hosted Account Portal, bypassing the
// branded /secondbrainlabs/sign-in page. Redirecting from here lets us route
// unauthenticated users to that branded page (which also resolves on Vercel
// preview hosts, where the bare /sign-in alias does not). Role is read from
// the boundary's AuthUser.isPlatformAdmin (resolved inside services/auth).
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserTimed('app/(platform)/layout.tsx');
  if (!user) {
    redirect('/secondbrainlabs/sign-in');
  }

  if (!user.isPlatformAdmin) {
    redirect('/admin');
  }

  // Auth dedupe (2026-09, same pattern as app/admin/layout.tsx, PR #498):
  // getAuthContext() is resolved exactly once, after the gate above. Tenant
  // name, tenant type and branding only need its tenant_id, so they run
  // concurrently off it. Previously getTenantName() and getTenantType() each
  // re-ran the full auth chain internally and branding ran it a third time.
  // An auth failure never failed the render before (the tenant helpers
  // swallowed it, branding sat in a try) — keep it that way.
  const authCtx = await getAuthContext().catch((err) => {
    console.error('[platform layout] auth context failed:', err instanceof Error ? err.message : err);
    return null;
  });

  // Resolve branding server-side; pass raw values to AdminThemeProvider (client).
  let tenantName: string | null = null;
  let tenantType: string | null = null;
  let resolvedBranding: BrandingForTheme | null = null;
  let resolvedTenantId: string | undefined;
  let brandingFontEntries: FontEntry[] = [];
  if (authCtx) {
    const tenantId = authCtx.tenant_id;
    resolvedTenantId = tenantId;
    const [name, type, branding] = await Promise.all([
      getTenantName(tenantId),
      getTenantType(tenantId),
      // null yields the same defaults the old catch path left in place.
      getTenantBranding(tenantId, 'admin').catch((err) => {
        console.error('[platform layout] branding fetch failed:', err instanceof Error ? err.message : err);
        return null;
      }),
    ]);
    tenantName = name;
    tenantType = type;
    if (branding) {
      console.log('[branding:platform]', JSON.stringify({ branding }));
      resolvedBranding = branding;
      console.log('[platform layout] branding resolved:', {
        tenant_id: tenantId,
        font_primary: branding.font_primary,
        font_secondary: branding.font_secondary,
        accent: branding.accent,
      });
      const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));
      brandingFontEntries = [
        branding.font_primary,
        branding.font_secondary,
        branding.font_mono,
      ]
        .filter((v): v is string => !!v && allowedFontValues.has(v))
        .map(v => ALL_FONTS.find(f => f.value === v)!)
        .filter(e => !!e?.googleFamily);
    }
  }
  const isPlatformAdmin = user.isPlatformAdmin === true && tenantType === 'platform'
  console.log('[platform layout]', { isPlatformAdmin: user?.isPlatformAdmin, tenantType, computed: user?.isPlatformAdmin === true && tenantType === 'platform' })

  return (
    <>
      {brandingFontEntries.map(entry => (
        <link
          key={entry.googleFamily}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`}
        />
      ))}
      <AdminThemeProvider branding={resolvedBranding} tenantId={resolvedTenantId}>
        <UnifiedAdminShell tenantName={tenantName ?? 'Natural Resource'} isPlatformAdmin={isPlatformAdmin}>
          {children}
        </UnifiedAdminShell>
      </AdminThemeProvider>
    </>
  );
}
