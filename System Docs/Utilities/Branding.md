# Branding Service

### Branding service (`services/branding/`)

Per-tenant visual identity — colors, fonts, and the derived "paper" surface
relationships — read from the `tenant_branding` table and injected as CSS
custom properties by each root layout. Server-readable; `font-registry.ts`
and `hex-utils.ts` are pure and safe on the client too. Imported by
path (`@/services/branding/<file>`), not through a barrel — there is no
`index.ts` in this service.

Consumed by all four root layouts (`app/admin/layout.tsx`,
`app/(jefflougheed)/layout.tsx`, `app/(platform)/layout.tsx`,
`app/heirloom/layout.tsx`), the admin Mantine theme
(`components/admin/theme/mantine-theme.ts`), the admin Appearance settings
page, and `app/api/admin/appearance/route.ts`.

| File | Exports | Purpose |
|------|---------|---------|
| `get-tenant-branding.ts` | `TenantBranding` (interface), `getTenantBranding(tenantId, target?)` | Fetches the `tenant_branding` row for a tenant and `target` (`'storefront'` — default — or `'admin'`, so one tenant can brand its storefront and its admin differently). Service-role read via `getAdminClient()`, wrapped in `unstable_noStore()` so branding is never baked into a static render. **Returns `null` on miss, DB error, or throw** — never raises; callers fall back to their own CSS defaults. The 21 selected columns are the full `TenantBranding` shape: palette (`background`, `accent`, `accent_hover`, `accent_rgb`, `lede`, `heading`, `body`, `sidebar_bg`, `sidebar_text`, `muted`, `border`), typography (`font_primary`, `font_secondary`, `font_mono`), and behavior flags (`paper_effect`, `accent_buttons`, `use_db_branding`, `favicon_base_path`, `custom_css`). Every field is nullable. |
| `paper-stack.ts` | `PaperStack` (interface), `derivePaperStack`, `deriveSurface`, `resolvePaperStack`, `paperStackVars` | Derives raised/sunken surfaces and the hairline from the single tenant-chosen `background`, rather than storing five hand-tuned creams a user could desync. **The two derivation strategies are a deliberate per-tenant fork — do not collapse them** (the file says so itself): `derivePaperStack` is the amber stack, SBL only, stepping toward `#c8a87e` at 10/20/42% to fill SBL's three surface levels (`--color-paper-2`, `--color-paper-3`, `--color-line`); `deriveSurface` is the white lift for Heirloom and jefflougheed, stepping one surface 40% toward white, because those palettes gain luminance on elevated elements rather than warmth. `paperEffect` gates both — off collapses surfaces to the background with a faint neutral hairline tinted from `FLAT_LINE_INK`. `paperStackVars` maps a `PaperStack` onto the `--color-paper*` / `--color-line` custom properties defined in `app/secondbrainlabs/globals.css`. |
| `font-registry.ts` | `FontEntry` (type), `DISPLAY_FONTS`, `BODY_FONTS`, `MONO_FONTS`, `ALL_FONTS` | The allowed font list, one entry per face (`label`, `value`, optional `googleFamily`). Backs the Appearance settings pickers and the layouts' Google Fonts link construction. `ALL_FONTS` is the flattened concatenation of the three categories. |
| `hex-utils.ts` | `isValidHex(s)`, `hexToRgbTriplet(hex)` | `isValidHex` is a type guard for 6-digit `#RRGGBB` strings — the validation gate on `app/api/admin/appearance/route.ts` writes. `hexToRgbTriplet` converts `#RRGGBB` to a space-separated `"R G B"` triplet, the form CSS custom properties need to be usable inside `rgb(var(--x) / <alpha>)`; returns `null` on unparseable input. |

See `System Docs/Design System.md` for the tokens and palettes these values
feed, and `System Docs/Database Schema.md` for the `tenant_branding` table.
