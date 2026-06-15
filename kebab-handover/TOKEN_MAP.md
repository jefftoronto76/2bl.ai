# Token Map — `--hl-*` → production Tailwind tokens

The prototype (`prototype/chat-v2.jsx`, `prototype/*.html`) uses raw
`--hl-*` CSS variables because it's a standalone HTML file. **Do not hardcode
these hex values.** Map each to the repo's existing semantic token.

> ✅ The reference component `reference/SidebarV2.tsx` is **already written in the
> production tokens** below — when in doubt, copy its class names directly. The
> `--hl-*` vars only appear in the standalone prototype.

## Colors
| Prototype `--hl-*` | Espresso value | Production token (Tailwind class) | Notes |
|---|---|---|---|
| `--hl-bg` | `#1C0F06` | `bg-background` | app base background |
| `--hl-bg-2` | `#170B04` | `bg-background` | sidebar bg — v2 uses `bg-background` (no separate token) |
| `--hl-surface` | `#2A1A0E` | `bg-surface` | elevated panels; the menu panel in the TSX |
| `--hl-surface-2` | `#33210F` | `bg-surface` | prototype's menu/toast bg → use `bg-surface` |
| `--hl-text` | `#F5EFE6` | `text-text-primary` | primary text |
| `--hl-muted` | `rgba(245,239,230,.55)` | `text-text-muted` | secondary text + resting icons |
| `--hl-faint` | `rgba(245,239,230,.30)` | `text-text-muted/60` | no exact token — muted at reduced opacity |
| `--hl-border` | `rgba(245,239,230,.12)` | `border-border` | dividers, hairlines |
| `--hl-border-strong` | `rgba(245,239,230,.20)` | `border-border` | menu border — bump opacity if your token is lighter |
| `--hl-accent` | `#C9A96E` | `bg-accent` / `text-accent` | brand gold |
| `--hl-accent-hover` | `#B8935A` | `hover:bg-accent-hover` | |
| `--hl-accent-soft` | accent @16% | `bg-accent/15` | hover wash on accent items |
| `--hl-accent-line` | accent @30% | `border-accent/30` | accent hairline / focused input border |
| `--hl-on-accent` | `#1C0F06` | `text-background` | text/icon ON an accent fill |
| `--hl-danger` | `#E58D80` | `text-amber-400` | ⚠️ in this repo **danger = amber-400**, not red — see RowMenu |
| `--hl-shadow` | `rgba(0,0,0,.55)` | `shadow-lg` | use the Tailwind shadow util, not a raw value |

## Hover washes (`color-mix(...)` in the prototype)
| Prototype expression | Production class |
|---|---|
| `color-mix(--hl-text 12%, transparent)` (kebab hover) | `hover:bg-text-primary/10` |
| `color-mix(--hl-text 8%, transparent)` (menu item hover) | `hover:bg-text-primary/[0.08]` |
| `color-mix(--hl-text 6%, transparent)` (row hover) | `hover:bg-text-primary/[0.06]` |
| `color-mix(--hl-text 5%, transparent)` (story row hover) | `hover:bg-text-primary/[0.05]` |
| `color-mix(--hl-danger 14%, transparent)` (delete hover) | `hover:bg-amber-400/10` |

## Type
| Prototype var | Family | Production class |
|---|---|---|
| `--font-display` | Cormorant Garamond | `font-display` |
| `--font-body` | DM Sans | `font-body` |
| `--font-mono` | DM Mono | `font-mono` |

## Spacing / radius / sizing (literal px → Tailwind)
These aren't tokenized as vars; translate directly:
| Prototype | Tailwind | Used for |
|---|---|---|
| radius 15px (popover) | `rounded-xl` (12) → or `rounded-2xl` (16) | menu container |
| radius 9px (item) | `rounded-lg` (8) | menu item rows |
| radius 7px (kebab) | `rounded-md`/`rounded-lg` | kebab button |
| kebab 26×26 / 28×28 | `w-7 h-7` (28) | trigger (TSX uses `w-7 h-7`) |
| menu width 212px | `w-52` (208) | popover (TSX uses `w-52`) |
| item pad `8px 11px` | `px-2.5 py-2` | menu item |
| gap 12px | `gap-3` | icon ↔ label |
| icon 16px / 15px | `size={16}` / `size={15}` | lucide props |
| focus ring | `focus-visible:ring-2 focus-visible:ring-accent` | all interactive |

## ⚠️ Mobile caveat (carry into implementation)
`w-7 h-7` (28px) and the `opacity-0 group-hover:opacity-100` reveal are
desktop-only patterns. On touch: gate the hover-fade behind `@media (hover:hover)`,
raise hit targets to **≥44px**, and consider a bottom sheet instead of the
popover. (See the "Mobile / touch" notes in `README.md`.)
