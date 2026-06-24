/**
 * Branding sync — prebuild step.
 *
 * Reads each tenant's tenant_branding row from Supabase, compares the DB
 * values against the corresponding CSS custom properties in the tenant's
 * globals.css :root block, applies any mismatches in-place, and writes
 * defaults_synced_at + branding_warnings back to the DB row.
 *
 * Run: npx tsx scripts/sync-branding.ts [--dry-run]
 * Hooked: "prebuild": "tsx scripts/sync-branding.ts" in package.json
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { isValidHex, hexToRgbTriplet } from '../services/branding/hex-utils';

// ── Config ─────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const REPO_ROOT = process.cwd(); // always run from repo root (prebuild / npx tsx)

// ── Types ──────────────────────────────────────────────────────────────────────

interface TenantBrandingRow {
  background:     string | null;
  accent:         string | null;
  heading:        string | null;
  lede:           string | null;
  body:           string | null;
  font_primary:   string | null;
  font_secondary: string | null;
  font_mono:      string | null;
  use_db_branding: boolean | null;
}

type CssFormat = 'triplet' | 'hex' | 'string';

interface TokenMapping {
  dbField: keyof TenantBrandingRow;
  cssVar:  string;
  format:  CssFormat;
}

interface BrandingWarning {
  type:         'ORPHAN' | 'CSS_DERIVED' | 'CSS_NATIVE';
  property:     string;
  currentValue: string;
  message:      string;
}

interface ParsedRoot {
  openBrace:  number; // index of '{' in the full css string
  closeBrace: number; // index of '}' in the full css string
  properties: Map<string, string>; // cssVar -> current value (trimmed)
}

// ── Tenant mapping table ───────────────────────────────────────────────────────

const JEFFLOUGHEED_MAPPINGS: TokenMapping[] = [
  { dbField: 'background',    cssVar: '--color-bg',          format: 'triplet' },
  { dbField: 'accent',        cssVar: '--color-accent',       format: 'triplet' },
  { dbField: 'heading',       cssVar: '--color-text-primary', format: 'hex'     },
  { dbField: 'heading',       cssVar: '--ink-rgb',            format: 'triplet' },
  { dbField: 'lede',          cssVar: '--color-text-muted',   format: 'string'  },
  { dbField: 'font_primary',  cssVar: '--font-display',       format: 'string'  },
  { dbField: 'font_secondary',cssVar: '--font-body',          format: 'string'  },
  { dbField: 'font_mono',     cssVar: '--font-mono',          format: 'string'  },
];

// Tokens derived from DB values but not directly synced.
// The orphan scan notes these and moves on — never flags, never updates.
const JEFFLOUGHEED_CSS_DERIVED = new Set([
  '--color-surface',      // background via layout injection
  '--color-accent-hover', // derived from accent
  '--color-text-dim',     // derived from --ink-rgb
  '--color-border',       // derived from --ink-rgb
  '--color-border-hover', // derived from --ink-rgb
]);

const TENANT_FILE_MAP = [
  {
    tenantId:  'e07334a0-2afd-4544-898b-edb124d2dd33',
    cssFile:   'app/(jefflougheed)/globals.css',
    mappings:  JEFFLOUGHEED_MAPPINGS,
    cssDerived: JEFFLOUGHEED_CSS_DERIVED,
    paletteSelector: 'html[data-brand="jefflougheed"]',
  },
  // SBL (6720ee2f) and Heirloom (20767f1d) deferred to a follow-up pass.
];

// ── CSS helpers ────────────────────────────────────────────────────────────────

/** Extracts the first :root { … } block from a CSS string. */
function parseRootBlock(css: string): ParsedRoot | null {
  const rootMatch = /(?:^|\n):root\s*\{/.exec(css);
  if (!rootMatch) return null;

  const openBrace  = css.indexOf('{', rootMatch.index);
  const closeBrace = css.indexOf('}', openBrace);
  if (openBrace < 0 || closeBrace < 0) return null;

  const blockContent = css.slice(openBrace + 1, closeBrace);
  const properties   = new Map<string, string>();

  for (const line of blockContent.split('\n')) {
    const m = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*;/.exec(line);
    if (m) properties.set(m[1], m[2].trim());
  }

  return { openBrace, closeBrace, properties };
}

/**
 * Applies in-place value updates and new-property inserts to the :root block.
 * Updates replace only the value portion of the matching line.
 * Inserts are appended just before the closing `}`.
 */
function patchRootBlock(
  css: string,
  parsed: ParsedRoot,
  updates: Map<string, string>, // cssVar -> newValue (existing properties)
  inserts: Map<string, string>, // cssVar -> newValue (properties to add)
): string {
  let block = css.slice(parsed.openBrace + 1, parsed.closeBrace);

  for (const [cssVar, newValue] of updates) {
    // Replace only the value portion; preserve indentation, colon, semicolon.
    const propRe = new RegExp(`(\\s*${cssVar}\\s*:\\s*)([^;\\n]+)(;)`);
    block = block.replace(propRe, (_, pre, _old, semi) => `${pre}${newValue}${semi}`);
  }

  for (const [cssVar, newValue] of inserts) {
    block += `  ${cssVar}: ${newValue};\n`;
  }

  return css.slice(0, parsed.openBrace + 1) + block + css.slice(parsed.closeBrace);
}

// ── Value helpers ──────────────────────────────────────────────────────────────

function computeExpected(dbValue: string, format: CssFormat): string | null {
  if (format === 'triplet') return hexToRgbTriplet(dbValue);
  if (format === 'hex')     return isValidHex(dbValue) ? dbValue.toLowerCase() : null;
  return dbValue; // 'string': use as-is
}

function normalize(value: string, format: CssFormat): string {
  const t = value.trim();
  if (format === 'triplet') return t.replace(/\s+/g, ' ');
  if (format === 'hex')     return t.toLowerCase();
  return t; // 'string': whitespace-trim only
}

// ── Per-tenant processing ──────────────────────────────────────────────────────

async function processTenant(
  cssFile:    string,
  mappings:   TokenMapping[],
  cssDerived: Set<string>,
  paletteSelector: string,
  branding:   TenantBrandingRow,
): Promise<{ updateCount: number; warnings: BrandingWarning[]; hasError: boolean }> {
  const warnings: BrandingWarning[] = [];
  let hasError = false;

  // Read CSS file
  const fullPath = path.join(REPO_ROOT, cssFile);
  let css: string;
  try {
    css = fs.readFileSync(fullPath, 'utf-8');
  } catch (err) {
    log(`  [ERROR]  Cannot read ${cssFile}: ${err instanceof Error ? err.message : String(err)}`);
    return { updateCount: 0, warnings, hasError: true };
  }

  // Parse :root block
  const parsed = parseRootBlock(css);
  if (!parsed) {
    log(`  [ERROR]  No :root block found in ${cssFile}`);
    return { updateCount: 0, warnings, hasError: true };
  }

  const shouldUpdate = branding.use_db_branding !== false;
  if (!shouldUpdate) log(`  [SKIP-UPDATE] use_db_branding is false — scan only`);

  const directMappedVars = new Set(mappings.map(m => m.cssVar));
  const cssUpdates = new Map<string, string>();
  const cssInserts = new Map<string, string>();

  // ── Direct mappings ────────────────────────────────────────────────────────
  for (const { dbField, cssVar, format } of mappings) {
    const dbValue = branding[dbField];
    if (dbValue == null) {
      log(`  [SKIP]    ${pad(cssVar)} DB field "${dbField}" is null`);
      continue;
    }

    const expected = computeExpected(dbValue as string, format);
    if (expected == null) {
      log(`  [SKIP]    ${pad(cssVar)} Cannot convert "${dbValue}" for format "${format}"`);
      continue;
    }

    const existing = parsed.properties.get(cssVar);
    if (existing === undefined) {
      log(`  [ADD]     ${pad(cssVar)} "${expected}" (property not yet in :root)`);
      cssInserts.set(cssVar, expected);
      continue;
    }

    const currentNorm  = normalize(existing, format);
    const expectedNorm = normalize(expected, format);

    if (currentNorm === expectedNorm) {
      log(`  [MATCH]   ${pad(cssVar)} "${existing}"`);
    } else {
      log(`  [UPDATE]  ${pad(cssVar)} "${existing}" → "${expected}"`);
      cssUpdates.set(cssVar, expected);
    }
  }

  // ── Orphan scan ────────────────────────────────────────────────────────────
  const cssNativeRe = /rgb\s*\(\s*var\s*\(--[^)]+\)\s*\//;
  for (const [property, value] of parsed.properties) {
    if (directMappedVars.has(property)) continue;

    if (cssDerived.has(property)) {
      log(`  [NOTE]    ${pad(property)} CSS-derived`);
      continue;
    }

    if (cssNativeRe.test(value) || value.includes('calc(')) {
      log(`  [NOTE]    ${pad(property)} CSS-native reference`);
      continue;
    }

    warnings.push({ type: 'ORPHAN', property, currentValue: value, message: 'Hard-coded value with no DB mapping' });
    log(`  [FLAG]    ${pad(property)} orphaned: "${value}"`);
  }

  log(`  [NOTE]    ${pad(paletteSelector)} out of scope — hand-crafted dark palette, not DB-driven`);

  // ── Write CSS ──────────────────────────────────────────────────────────────
  const updateCount = cssUpdates.size + cssInserts.size;
  if (updateCount > 0 && shouldUpdate && !DRY_RUN) {
    try {
      const patched = patchRootBlock(css, parsed, cssUpdates, cssInserts);
      fs.writeFileSync(fullPath, patched, 'utf-8');
      log(`  CSS written (${updateCount} change(s))`);
    } catch (err) {
      log(`  [ERROR]  Cannot write ${cssFile}: ${err instanceof Error ? err.message : String(err)}`);
      hasError = true;
    }
  } else if (updateCount > 0 && DRY_RUN) {
    log(`  CSS would change (${updateCount} change(s)) — dry-run, skipping write`);
  } else {
    log(`  CSS unchanged`);
  }

  return { updateCount, warnings, hasError };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[branding-sync] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping sync');
    process.exit(0); // Don't fail the build when env vars aren't available (e.g. local dev without .env.local)
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  log(`[branding-sync] Starting — ${TENANT_FILE_MAP.length} tenant(s)${DRY_RUN ? ' [DRY RUN]' : ''}`);

  let totalUpdates = 0;
  let totalFlags   = 0;
  let hasError     = false;

  for (const tenant of TENANT_FILE_MAP) {
    log(`[branding-sync] ${tenant.tenantId.slice(0, 8)} → ${tenant.cssFile}`);

    // Fetch branding row
    const { data: branding, error: fetchError } = await supabase
      .from('tenant_branding')
      .select('background,accent,heading,lede,body,font_primary,font_secondary,font_mono,use_db_branding')
      .eq('tenant_id', tenant.tenantId)
      .eq('target', 'storefront')
      .single<TenantBrandingRow>();

    if (fetchError || !branding) {
      log(`  [ERROR]  DB fetch failed: ${fetchError?.message ?? 'no row found'}`);
      hasError = true;
      continue;
    }

    const { updateCount, warnings, hasError: tenantError } = await processTenant(
      tenant.cssFile,
      tenant.mappings,
      tenant.cssDerived,
      tenant.paletteSelector,
      branding,
    );

    totalUpdates += updateCount;
    totalFlags   += warnings.filter(w => w.type === 'ORPHAN').length;
    if (tenantError) hasError = true;

    // DB write-back (non-fatal on failure)
    if (!DRY_RUN) {
      const { error: writeError } = await supabase
        .from('tenant_branding')
        .update({
          defaults_synced_at: new Date().toISOString(),
          branding_warnings:  warnings.length > 0 ? JSON.stringify(warnings) : null,
        })
        .eq('tenant_id', tenant.tenantId)
        .eq('target', 'storefront');

      if (writeError) {
        log(`  [ERROR]  DB write-back failed: ${writeError.message}`);
      } else {
        log(`  DB write-back: defaults_synced_at + ${warnings.length} warning(s)`);
      }
    }
  }

  log(`[branding-sync] Done — ${totalUpdates} update(s), ${totalFlags} flag(s), ${hasError ? '1+ error(s)' : '0 errors'}`);
  process.exit(hasError ? 1 : 0);
}

// ── Util ───────────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(msg); }
function pad(s: string, n = 32) { return s.padEnd(n); }

main().catch(err => {
  console.error('[branding-sync] Fatal:', err);
  process.exit(1);
});
