# 2BL Platform — Canonical CSS Token Spec

## Overview

Every tenant on the 2BL platform must define exactly this set of CSS custom properties in their `globals.css` file. Token names are fixed — values are tenant-specific. No tenant-scoped prefixes (`--hl-*`, `--lg-*`, etc.). No aliases, no substitutions.

A lint script (`scripts/lint-tokens.ts`) validates compliance at build time. Any missing or renamed token fails the build.

---

## Token Set

### Color Tokens

| Token | Role |
|---|---|
| `--color-background` | Page background — the outermost canvas color |
| `--color-surface` | Card, panel, and container backgrounds — one step above background |
| `--color-accent` | Primary brand color — CTAs, highlights, active states |
| `--color-accent-hover` | Accent color on hover/active — slightly darker or lighter than accent |
| `--color-text-primary` | Primary body and heading text |
| `--color-text-muted` | Secondary text — captions, labels, supporting copy |
| `--color-text-dim` | Tertiary text — placeholders, disabled states, metadata |
| `--color-border` | Default border color |
| `--color-border-hover` | Border color on hover/focus |
| `--color-modal-background` | Modal backdrop background |
| `--color-modal-surface` | Modal panel/card background |
| `--color-modal-text-primary` | Primary text inside modals |
| `--color-modal-text-muted` | Secondary text inside modals |
| `--color-modal-border` | Border color inside modals |

### Typography Tokens

| Token | Role |
|---|---|
| `--font-display` | Display and heading typeface — H1, H2, H3, hero text |
| `--font-body` | Body and UI typeface — paragraphs, labels, buttons |
| `--font-accent` | Accent typeface — pull quotes, decorative text, italic roles |
| `--font-mono` | Monospace typeface — code, timestamps, metadata, tags |

---

## Value Format

**Color tokens** must be defined as raw RGB components (no `rgb()` wrapper), so Tailwind's opacity modifier syntax works:

```css
--color-accent: 200 84 46;
```

Used in components as:
```css
/* Full opacity */
color: rgb(var(--color-accent));

/* With opacity */
background: rgb(var(--color-accent) / 0.12);

/* Tailwind opacity modifier */
class="bg-accent/10"
```

**Typography tokens** must be defined as a full CSS font-family stack:

```css
--font-display: 'Cormorant Garamond', Georgia, serif;
--font-body: 'DM Sans', system-ui, sans-serif;
--font-accent: 'Cormorant Garamond', Georgia, serif;
--font-mono: 'DM Mono', 'Fira Code', monospace;
```

---

## globals.css Structure

Each tenant globals.css must follow this structure exactly:

```css
/* ─── [Tenant Name] Design Tokens ─────────────────────────────────────────
   Source of truth for all CSS custom properties.
   Token names are canonical — do not rename or add tenant-scoped prefixes.
   Values are injected at runtime by layout.tsx when use_db_branding is true.
   ───────────────────────────────────────────────────────────────────────── */

:root {
  /* Color */
  --color-background:       ;
  --color-surface:          ;
  --color-accent:           ;
  --color-accent-hover:     ;
  --color-text-primary:     ;
  --color-text-muted:       ;
  --color-text-dim:         ;
  --color-border:           ;
  --color-border-hover:     ;

  /* Modal */
  --color-modal-background: ;
  --color-modal-surface:    ;
  --color-modal-text-primary: ;
  --color-modal-text-muted: ;
  --color-modal-border:     ;

  /* Typography */
  --font-display: ;
  --font-body:    ;
  --font-accent:  ;
  --font-mono:    ;
}
```

---

## layout.tsx Injection

When `use_db_branding` is true, the layout must inject the same canonical token names — no tenant-scoped names. Injection targets `:root`:

```tsx
<style>{`
  :root {
    --color-background: ${branding.background};
    --color-surface: ${branding.surface};
    --color-accent: ${branding.accent};
    --color-accent-hover: ${branding.accentHover};
    --color-text-primary: ${branding.textPrimary};
    --color-text-muted: ${branding.textMuted};
    --color-text-dim: ${branding.textDim};
    --color-border: ${branding.border};
    --color-border-hover: ${branding.borderHover};
    --color-modal-background: ${branding.modalBackground};
    --color-modal-surface: ${branding.modalSurface};
    --color-modal-text-primary: ${branding.modalTextPrimary};
    --color-modal-text-muted: ${branding.modalTextMuted};
    --color-modal-border: ${branding.modalBorder};
    --font-display: ${branding.fontDisplay};
    --font-body: ${branding.fontBody};
    --font-accent: ${branding.fontAccent};
    --font-mono: ${branding.fontMono};
  }
`}</style>
```

---

## Lint Script

`scripts/lint-tokens.ts` runs as part of every build (`tsx scripts/lint-tokens.ts && next build`).

It reads every `globals.css` file under `app/` and validates:

1. All 18 canonical tokens are defined
2. No tenant-scoped prefixes exist (`--hl-*`, `--lg-*`, or any `--[two-letter-prefix]-*` pattern)
3. Color token values are raw RGB triplets (not hex, not `rgb()` wrapped)

Exits with code 1 and a clear error message if any check fails.

---

## Migration Status

| Tenant | globals.css | layout.tsx injection | Status |
|---|---|---|---|
| jefflougheed.ca | Uses `--color-bg` (rename to `--color-background`) | Partially canonical | Needs migration |
| Heirloom | Uses `--hl-*` prefixes | Uses `--hl-*` prefixes | Needs migration |
| Legacy | Uses `--lg-*` prefixes | No dynamic injection | Needs migration |

Migration is a single branch per tenant. CC executes, Jeff approves each before merge. No schema changes required.

---

## Adding a New Tenant

1. Copy the template block above into `app/[tenant]/globals.css`
2. Fill in all 18 token values
3. Add dynamic injection to `app/[tenant]/layout.tsx` using the canonical names
4. Run `tsx scripts/lint-tokens.ts` — must pass before opening a PR
