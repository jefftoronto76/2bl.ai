import { unstable_noStore } from 'next/cache';
import { getAdminClient } from '@/services/auth/supabase-admin';

export interface TenantBranding {
  background:      string | null;
  accent:          string | null;
  accent_hover:    string | null;
  accent_rgb:      string | null;
  lede:            string | null;
  heading:         string | null;
  body:            string | null;
  sidebar_bg:      string | null;
  sidebar_text:    string | null;
  muted:           string | null;
  border:          string | null;
  font_primary:    string | null;
  font_secondary:  string | null;
  font_mono:       string | null;
  paper_effect:    'warm' | 'lift' | 'flat' | null;
  accent_buttons:  boolean | null;
  use_db_branding: boolean | null;
  favicon_base_path: string | null;
}

/** Fetches the tenant_branding row for `tenantId` and `target`. Returns null on miss or error. */
export async function getTenantBranding(
  tenantId: string,
  target: 'storefront' | 'admin' = 'storefront',
): Promise<TenantBranding | null> {
  unstable_noStore();
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('tenant_branding')
      .select(
        'background, accent, accent_hover, accent_rgb, lede, heading, body, sidebar_bg, sidebar_text, muted, border, font_primary, font_secondary, font_mono, paper_effect, accent_buttons, use_db_branding, favicon_base_path'
      )
      .eq('tenant_id', tenantId)
      .eq('target', target)
      .maybeSingle();

    if (error) {
      console.error('[branding] fetch failed:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[branding] fetch threw:', err instanceof Error ? err.message : err);
    return null;
  }
}
