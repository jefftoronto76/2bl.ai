# Landing update — matched to the Heirloom repo design system

Two files, both at their real repo paths. The **design is unchanged** (flat egg-shell
base, terracotta accent, the formats hero / book centerpiece / SBL footer layouts).
What changed is that everything now speaks the repo's **canonical token system**
(`css-token-unification-spec.md`) instead of the invented `--lg-*` / `data-brand="legacy"`
names the earlier drop-in used — and the design's actual colour values are written into
`globals.css` on those canonical tokens.

## Files
| Path | What it is |
|---|---|
| `app/heirloom/globals.css` | Canonical `:root` tokens with the flat/terracotta **values baked in**. Replaces the old `--hl-*` file. |
| `app/heirloom/components/landing/LandingPage.tsx` | The redesigned landing page, using only canonical Tailwind token classes. Drop-in for the file on `main`. |

> The old `app/legacy/...` copy was removed — wrong route, wrong tokens.

## Design values → canonical token (now in globals.css)
| Role | Value | Token |
|---|---|---|
| Page background | `#FAF6EE` | `--color-background` `250 246 238` |
| Surface / card | `#FFFFFF` | `--color-surface` `255 255 255` |
| Accent | `#C8542E` | `--color-accent` `200 84 46` |
| Accent hover | `#A93F1D` | `--color-accent-hover` `169 63 29` |
| Ink / primary text | `#1F1A14` | `--color-text-primary` `31 26 20` |
| Muted text | `#6B6256` | `--color-text-muted` `107 98 86` |
| Faint text | `#9A917F` | `--color-text-dim` `154 145 127` |
| Neutral border | `#E6DCC8` | `--color-border` `230 220 200` |
| Border hover | `#D6C9AC` | `--color-border-hover` `214 201 172` |

Accent-tinted hairlines come from `border-accent/20…40` classes inline (not from
`--color-border`). Flat base = the radial glow utilities collapse to `--color-background`;
no grain.

## What was corrected vs. the previous drop-in
- `--lg-*` token classes (`bg-lg-background`, `text-lg-text-primary`, `text-lg-text-muted`,
  `border-lg-border`, `bg-lg-border`, `hover:bg-lg-accent-hover`) → canonical
  `bg-background`, `text-text-primary`, `text-text-muted`, `border-border`,
  `hover:bg-accent-hover`. (Tenant prefixes fail `scripts/lint-tokens.ts`.)
- `text-white` on accent fills → `text-background` (the repo convention).
- `#what-is-legacy` anchor + its nav target → `#what-is-heirloom` (preserved per hand-over).
- Local layout helper classes `lg-*` → `hl-*` (`hl-reveal`, `hl-hero-grid`, `hl-book-grid`, …),
  and `.hl-reveal`/`.hl-visible` are defined in `globals.css` to match.
- Wordmark home link `/legacy` → `/heirloom` (route path preserved).

## To finish in the codebase
1. **DB branding row** (this is the "reverse-update"): set the Heirloom tenant to
   `background #FAF6EE`, `accent #C8542E`, `heading #1F1A14`, `lede #6B6256`,
   `paper_effect = flat`. `layout.tsx` injects these onto the same `:root` tokens, so the
   static values above are the fallback when `use_db_branding` is off.
2. **Clerk modal**: `clerkAppearance.ts` references the old `--hl-modal-*` vars — repoint
   them to `--color-modal-*` in the same migration (kept out of this file to avoid a silent break).
3. Brand wordmark copy is **"Legacy"** per the rename in `hand-over.md`; preserved technical
   identifiers: `#what-is-heirloom` anchor, `hl.liveEditorVote` localStorage key, `/heirloom` route.
4. Open questions still standing: Pricing nav target, "Secure & responsible" destination route,
   CTA chat wiring (`dispatch({ type: 'OPEN_CHAT' })`).
