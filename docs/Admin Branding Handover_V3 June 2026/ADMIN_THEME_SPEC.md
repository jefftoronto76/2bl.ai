# Admin branding → Mantine theme — production spec

How the admin branding variables are **stored in the DB and passed to the client the
Mantine-idiomatic way**. Replaces the current half-Mantine / half-hand-rolled bridge in
`components/admin/theme/mantine-theme.ts` (`buildAdminTheme`) + `app/admin/layout.tsx`.

The interactive reference is `admin-mantine/` → Settings → **Appearance → Admin**
(`appearance.js` editor + `AdminPreview`, tokens in `data.js → ADMIN_THEME_TOKENS`).

---

## 1. The admin variable set (`tenant_branding`, `target = 'admin'`)

One row per tenant (and the platform), keyed by `(tenant_id, target)`. Seed each tenant's
**initial** admin row from its existing base palette (SBL shown).

| Column | Type | Seed (SBL) | Drives (admin chrome) |
|---|---|---|---|
| `accent` | hex | `#C8542E` | active nav, primary buttons, links, `ADMIN` kicker |
| `accent_hover` | hex | `#A03D1E` | hover on nav items + accented buttons |
| `accent_buttons` | bool | `true` | off → primary buttons go neutral (ink) |
| `sidebar_bg` | hex | `#17130E` | **new** — the dark navigation rail |
| `sidebar_text` | hex | `#CFC9BF` | **new** — inactive nav item labels |
| `background` | hex | `#FAF6EE` | main content canvas |
| `heading` | hex | `#1F1A14` | page titles + section headers |
| `body` | hex | `#1F1A14` | paragraph + table text |
| `muted` | hex | `#6B6256` | **new** — subtitles, helper text, timestamps |
| `font_primary` | text | `Newsreader` | heading font |
| `font_secondary` | text | `Manrope` | body font |
| `font_mono` | text | `DM Mono` | kicker, section labels, code |

**New columns:** `sidebar_bg`, `sidebar_text`, `muted` (nullable; only meaningful for the
`admin` target — storefront rows leave them null). Everything else already exists on
`tenant_branding`. `paper_effect` is **not** part of the admin set (storefront-only).

> Why `muted` and not reuse storefront's `lede`? They're different semantics per target
> (`lede` = hero intro paragraph; admin `muted` = helper/timestamp text). Keeping them
> separate avoids overloading one column with two meanings. If you'd rather not add the
> column, map "Muted text" → existing `lede` — but `muted` is the cleaner canonical choice.

---

## 2. DB value → Mantine token / CSS variable

The goal: **Mantine generates and emits the CSS variables from the theme** — no
`colorsTuple` flattening, no `theme.other` bag, no hand-written `<style>` var block.

| DB field | Mantine mechanism | CSS variable consumed |
|---|---|---|
| `accent` | `colors.brand = generateColors(accent)` + `primaryColor:'brand'` | `--mantine-color-brand-*` (real 10-shade scale → hover/variants work) |
| `accent_buttons` | `Button.defaultProps.color = accent_buttons ? 'brand' : 'ink'` | — |
| `accent_hover` | `cssVariablesResolver` | `--admin-accent-hover` |
| `sidebar_bg` | `cssVariablesResolver` | `--admin-sidebar-bg` |
| `sidebar_text` | `cssVariablesResolver` | `--admin-sidebar-text` |
| `background` | `cssVariablesResolver` (light) overrides body | `--mantine-color-body` |
| `heading` | `colors.ink = generateColors(heading)` + `theme.headings.color` | `--mantine-color-ink-*`, headings |
| `body` | `cssVariablesResolver` (light) | `--mantine-color-text` |
| `muted` | `cssVariablesResolver` | `--admin-text-muted` (use for `c="dimmed"`/muted text) |
| `font_primary` | `theme.headings.fontFamily` | `--mantine-font-family-headings` |
| `font_secondary` | `theme.fontFamily` | `--mantine-font-family` |
| `font_mono` | `theme.fontFamilyMonospace` | `--mantine-font-family-monospace` |

`generateColors` is `@mantine/colors-generator` (Mantine's recommended single-hex →
scale helper). This is the key fix: today `colorsTuple(accent)` makes all 10 shades
identical, so `--mantine-color-background-9` (the sidebar) just equals `background` and
hover states have nothing to step to. A real scale + explicit `--admin-sidebar-*` vars
fix both.

---

## 3. Implementation sketch — `buildAdminTheme`

```ts
import { createTheme, type CSSVariablesResolver } from '@mantine/core';
import { generateColors } from '@mantine/colors-generator';

export function buildAdminTheme(b: AdminBranding) {
  const theme = createTheme({
    primaryColor: 'brand',
    colors: {
      brand: generateColors(b.accent),   // real 10-shade scale
      ink:   generateColors(b.heading),
    },
    fontFamily:          fontStack(b.font_secondary),
    fontFamilyMonospace: fontStack(b.font_mono),
    headings: { fontFamily: fontStack(b.font_primary), textWrap: 'pretty' },
    components: {
      Button: { defaultProps: { color: b.accent_buttons ? 'brand' : 'ink' } },
    },
  });

  // Mantine emits these as real CSS variables — no manual <style> injection.
  const resolver: CSSVariablesResolver = () => ({
    variables: {
      '--admin-sidebar-bg':   b.sidebar_bg,
      '--admin-sidebar-text': b.sidebar_text,
      '--admin-accent-hover': b.accent_hover,
      '--admin-text-muted':   b.muted,
    },
    light: {
      '--mantine-color-body': b.background,
      '--mantine-color-text': b.body,
    },
    dark: {},
  });

  return { theme, resolver };
}
```

```tsx
// app/admin/layout.tsx — the ONLY wiring change on the client side.
const { theme, resolver } = buildAdminTheme(branding);
return (
  <MantineProvider theme={theme} cssVariablesResolver={resolver} defaultColorScheme="light">
    …
  </MantineProvider>
);
```

This deletes: `theme.other` (bodyBackground/textPrimary/textMuted/bodyText), the returned
`textMuted`/`accentHover` side-channel, and the `<style>{:root{--mantine-color-body:…}}</style>`
block in `layout.tsx`.

**Apply gate (unchanged):** keep the existing `use_db_branding` check. Build the dynamic
theme from the DB row only when `use_db_branding === true`; otherwise fall back to the
static per-tenant default theme exactly as today. `buildAdminTheme(null)` must still return
a valid default theme + resolver so a missing/`false` row never breaks the console.

---

## 4. Consumption (shell + screens)

`UnifiedAdminShell` and screens read the emitted variables — no hardcoded hex:

```tsx
// navbar / drawer
backgroundColor: 'var(--admin-sidebar-bg)'       // was var(--mantine-color-background-9)
// inactive nav label
color: 'var(--admin-sidebar-text)'
// nav hover (CSS) / active = brand
'&:hover': { color: 'var(--admin-accent-hover)' }
// active item background, primary buttons → brand scale (automatic)
// muted text → c="dimmed" mapped to --admin-text-muted, or var() directly
```

Result: **DB row → one Mantine theme + resolver → CSS variables → every admin surface.**
Each editor field in §1 has a 1:1 element it visibly drives, the sidebar is themeable
(not hardcoded), and there's no storefront-Tailwind borrowing and no manual var bridge.
