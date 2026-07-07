# Pass 1 — Foundations: colours, fonts, borders

**Goal:** get the Legacy palette, type, and border language exactly right on the lander **and** the Story chat widget. This pass is intentionally style-only. Sign it off before any structural work — the widget inherits these tokens, so if they're right the widget lands.

### Target look
![Story chat widget — target terracotta palette](screenshots/pass-1-chat-widget.png)
![Lander hero — target palette & type](screenshots/pass-2-hero.png)

---

## 1. Colour tokens (canonical)

These are the exact values used throughout the source of truth (`:root` in the HTML). In the app they are the canonical **`--color-*`** tokens defined in `app/heirloom/globals.css` (already terracotta), surfaced through the semantic Tailwind tokens the components use.

> **Source-of-truth note:** where a prototype hex differs from `app/heirloom/globals.css`, **the Heirloom `--color-*` value wins** — do not overwrite Heirloom's tokens with the prototype hexes. The prototype was built on the Legacy token set, so the values match except **primary ink**: prototype `#1A150F` (= `--lg-text-primary`) vs Heirloom **`#1F1A14`** (`--color-text-primary`, rgb `31 26 20`). Keep Heirloom's `#1F1A14`. Everything else (bg, surface, accent, accent-hover, muted, faint, border, sidebar `#F4EFE5`) is already identical.

| Prototype var | Hex / value | Role | App Tailwind token |
|---|---|---|---|
| `--hl-bg` | `#FAF6EE` | Page background (egg-shell) | `background` → `bg-background` || `--hl-bg-2` | `#F2ECDF` | Alt background band | (add if needed) |
| `--hl-surface` | `#FFFFFF` | Cards, popovers, user bubble | `surface` → `bg-surface` |
| `--hl-surface-2` | `#F4EFE5` | **Chat sidebar**, insets | secondary surface (add token) |
| `--hl-accent` | `#C8542E` | Terracotta accent (CTAs, icons, links) | `accent` → `bg-accent` |
| `--hl-accent-hover` | `#A93F1D` | Accent hover | `accent-hover` → `hover:bg-accent-hover` |
| `--hl-accent-soft` | `color-mix(in srgb, #C8542E 13%, transparent)` | Soft accent fill (icon tiles, chips) | `accent/10`–`/15` |
| `--hl-accent-line` | `color-mix(in srgb, #C8542E 30%, transparent)` | Accent-tinted hairline/borders | `accent/30` |
| `--hl-text` | `#1A150F` proto / **`#1F1A14` Heirloom** | Primary text (near-black, warm) | `text-primary` → `text-text-primary` |
| `--hl-muted` | `#6B6256` | Secondary/body-muted text | `text-muted` → `text-text-muted` |
| `--hl-faint` | `#9A917F` | Faint text (mono captions, placeholders) | `text-faint` (or `text-text-muted/70`) |
| `--hl-border` | `#E6DCC8` | Warm hairline border | `border` → `border-border` |
| `--hl-border-strong` | `color-mix(in srgb, #C8542E 42%, transparent)` | Emphasised border | `accent/40` |
| `--hl-on-accent` | `#FFFFFF` | Text/icons on accent | `background` → `text-background` |
| `--hl-shadow` | `rgba(26,21,15,0.30)` | Shadow base tint | — |
| `--hl-glow-1 / -2` | `#F2E7CF` / `#ECE0C6` | Radial glow (final CTA only) | — |

> **Naming caution:** the `--hl-*` column above is the **prototype's** variable names — it is **not** the app's CSS-var naming. The app's canonical vars are **`--color-*`** (`--color-background`, `--color-text-primary`, `--color-text-muted`, `--color-accent-hover`, `--color-border`, `--color-surface`, `--color-accent`), defined in `app/heirloom/globals.css`. Do **not** introduce `--hl-*` or `--lg-*` vars — the canonical spec (`css-token-unification-spec.md`, repo root) forbids tenant prefixes. It names a `scripts/lint-tokens.ts` build gate, but **that file isn't present in the repo on this branch**, so it isn't enforced automatically — follow the spec anyway.

### Where to implement
Target **`app/heirloom/`** (the Heirloom product; "Legacy" is its front-end brand). The chat shell is already mounted at `app/heirloom/HeirloomApp.tsx`, and `app/heirloom/globals.css` already ships this exact terracotta palette as `--color-*`. **Do not** re-create tokens in `app/legacy/` or re-mount the chat shell — that's a different route-scoped storefront and is not the target.

### The actual root cause of the broken widget palette (fix this)
`tailwind.config.js` maps the chat-shell colour tokens to **`--hl-*`** vars, but the theme defines **`--color-*`**. The names don't line up, so the classes resolve to *undefined* and fall back:

| Tailwind token (class) | config currently points at | should point at (defined in globals) |
|---|---|---|
| `background` (`bg-background`) | `var(--hl-bg)` ❌ | `rgb(var(--color-background) / <alpha>)` |
| `text-primary` (`text-text-primary`) | `var(--hl-text-primary)` ❌ | `rgb(var(--color-text-primary) / <alpha>)` |
| `text-muted` (`text-text-muted`) | `var(--hl-text-muted)` ❌ | `var(--color-text-muted)` |
| `accent-hover` (`hover:bg-accent-hover`) | `var(--hl-accent-hover)` ❌ | `var(--color-accent-hover)` |
| `border` (`border-border`) | `var(--hl-border)` ❌ | `var(--color-border)` |
| `surface`, `accent` | `--color-surface` / `--color-accent` ✅ | (already correct — why the widget was *partly* styled) |

**Fix:** repoint those five tokens in `tailwind.config.js` to the `--color-*` names the theme actually defines (also fix `bg` — it points at the undefined `--color-bg`; should be `--color-background`). **Also migrate `app/heirloom/layout.tsx`:** its `use_db_branding` injection pushes `--hl-bg / --hl-text-primary / --hl-text-muted` and omits the rest — rename those to `--color-*` and inject the full canonical set. Note `--hl-accent-hover` and `--hl-border` are defined **nowhere** today, so those two classes break regardless of the branding flag. Then add a **`surface-2`** token (`rgb(var(--color-surface-2) / <alpha>)`) + define `--color-surface-2: 244 239 229;` (`#F4EFE5`) in `app/heirloom/globals.css` for the chat sidebar, and wire **Caveat** (`--font-hand`) in `app/heirloom/layout.tsx` for Pass 2's handwritten note.

> ⚠️ `tailwind.config.js` is shared across brands — after the rename fix, spot-check the other brand routes (sbl / legacy) still render. There is **no `scripts/lint-tokens.ts`** in the repo on this branch, so grep for stray `--hl-`/`--lg-` custom-property refs by hand. Verify the *computed* colours on the Heirloom route, not just that a token name exists.

---

## 2. Typography

Already wired via `next/font` in `app/heirloom/layout.tsx` — just confirm usage.

| Token | Family | Where |
|---|---|---|
| `--font-display` | **Cormorant Garamond** (300/400/500/600, incl. italic) | H1/H2/H3, the chat empty-state headline, book cover, big display numerals |
| `--font-body` | **DM Sans** (400/500/600/700) | Body copy, buttons, chat bubbles, sidebar rows |
| `--font-mono` | **DM Mono** (400/500) | Eyebrows, captions, timestamps, tags — **UPPERCASE, letter-spacing .16–.34em** |
| `--font-hand` | **Caveat** (400/500/600) | **Hero only** — the handwritten note & doodle cards. Add to `next/font`. |

Type conventions to preserve:
- **Eyebrows / labels:** DM Mono, ~11–13px, `text-transform: uppercase`, `letter-spacing: .16em–.34em`, colour `accent` (or `faint` for section labels).
- **Display headings:** Cormorant, `font-weight: 300` for large H1/H2 (e.g. hero "Legacy", "What's a story worth keeping?"), `500` for smaller H3s; tight tracking `-.01em`.
- **Body:** DM Sans 400–500, line-height ~1.6.

---

## 3. Borders, radii, shadows

| Element | Value |
|---|---|
| Hairline border | `1px solid var(--hl-border)` (`#E6DCC8`); accent-tinted variant `1px solid var(--hl-accent-line)` |
| Card radius | `16px` (feature cards) · `18–20px` (large cards) · `24px` (hero/centre panels) |
| Pill / chip / tag | `999px` |
| Button radius | `10–13px` |
| Icon tile | `11–15px`, fill `--hl-accent-soft`, icon colour `--hl-accent` |
| Soft card shadow | `0 14px 30px -16px var(--hl-shadow), 0 1px 3px rgba(26,21,15,.06)` |
| Photo shadow | `0 18px 34px -14px var(--hl-shadow), 0 2px 6px -2px rgba(26,21,15,.18)` |
| Focus ring | 2px `accent` |

---

## 4. Chat widget — exact colour/type/border spec

*(Colours only — behaviour already exists. Reference: `chat-widget.jsx`.)* The drawer must read as the terracotta Legacy palette:

- **Drawer surface:** `background` (`#FAF6EE`). Shadow on the left edge `-30px 0 80px -30px rgba(26,21,15,.6)`. Backdrop `rgba(26,21,15,.5)` + `blur(4px)`.
- **Header (h52, border-bottom `border`):** title "Your Story" — DM Sans 600 15.5px `text-primary` + chevron `muted`; icon buttons `muted` → hover `text-primary` on `text-primary/8` bg, radius 9.
- **Sidebar:** background `surface-2` (`#F4EFE5`), right border `border`. Section labels DM Mono uppercase `.16em` `faint`. Rows DM Sans 14 `text-primary`, hover `text-primary/6`; active row bg `accent/12`, weight 600. "New chat" pen icon + writing-prompt icons in `accent`. Starred icon `accent` filled.
- **Empty state:** feather icon `accent`; headline **Cormorant 300, clamp(30–42px)**, `text-primary`, tracking `-.01em`; subcopy DM Sans 16 `muted`.
- **Message bubbles:** user = `surface` bg + `1px border`, radius 18 / bottom-right 5; assistant = **transparent**, `text-primary`, radius 18 / bottom-left 5. Assistant avatar = `accent` circle 32px with `on-accent` feather. Typing dots = `faint`.
- **Composer:** `surface` bg, `1px border`, radius 22, soft shadow; `+` and mic buttons `muted`; send button = `accent` circle (disabled = `accent/30`), arrow `on-accent`. Placeholder `faint`. Source-menu popover = `surface`, `border`, radius 16, rows with `accent` icons.
- **"Save this chat" button:** `accent` bg, `on-accent` text, radius 11, bookmark icon.
- **Toast:** `surface` + `border`, pill, check icon `accent`, DM Mono uppercase label.

---

## ✅ Pass 1 acceptance checklist
- [ ] Page background samples `#FAF6EE`; cards `#FFFFFF`; primary text **`#1F1A14`** (Heirloom canonical); hairlines `#E6DCC8`; every accent (buttons, icons, links, eyebrows) `#C8542E`, hover `#A93F1D`.
- [ ] Headings render in **Cormorant Garamond**; body in **DM Sans**; eyebrows/captions in **DM Mono** uppercase with wide tracking.
- [ ] Default `a` / `a:hover` colours use `accent` / `accent-hover` (no browser-blue links).
- [ ] Chat drawer opens in the **terracotta** palette: cream sidebar (`#F4EFE5`), white user bubbles with hairline, transparent assistant bubbles, `accent` feather avatar, **Cormorant** "What's a story worth keeping?" empty state.
- [ ] Radii/borders match the table (card 16–24, pills 999, composer 22, hairline 1px `#E6DCC8`).
- [ ] Side-by-side with `Heirloom_Combined Lander v2.html` (Constellation mode) at the same width shows no colour/type drift.
