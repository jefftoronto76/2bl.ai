# Handoff: Heirloom PWA — Launch "Moments"

The **lifecycle moments** of the installable Heirloom PWA: **Splash → Landing → Install (A2HS) → Push permission → Offline**. This document is self-sufficient — a developer who wasn't in the design conversation can build it from here alone.

**Repo:** `jefftoronto76/2bl.ai` · **Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind · Mantine v7 · Supabase · Vercel · **Serwist** (`@serwist/next`) for the service worker.

## Current state — branch `claude/optimistic-gates-25hhvt`
Audited against the branch. The **upload-flow** components are in; the **PWA Moments are green-field** — no Serwist, no manifest, no install/push/offline UI. Build status per piece:

| Piece | Status | Notes |
|-------|--------|-------|
| **Splash** | 🔨 Build | No `app/manifest.ts` → no standalone launch yet. |
| **Landing** | ♻️ Extend | A web landing exists: `app/heirloom/components/landing/*` (`LandingPage`, `WhatIsHeirloomSection`, `HowItWorksSection`, `CtaSection`, `LandingNav`, `Footer`). Reuse its content/sections; add the mobile install callout + Start→app entry. Don't rebuild the marketing copy. |
| **Install (A2HS)** | 🔨 Build | No `usePWAInstall()` hook, no install sheet. Build both. |
| **Push permission** | 🔨 Build (UI only) | No push UI. `web-push`/send side is separate and out of scope. |
| **Offline** | 🔨 Build | `@serwist/next` is **not** a dependency yet — add it; no `app/sw.ts`. |
| **Manifest** | 🔨 Build | Add `app/manifest.ts`. |
| **Sheet primitive** | ♻️ Reuse | No custom `BottomSheet` in the membership shells — use **Mantine `Drawer`** (`position="bottom"`) to match the existing modal/drawer patterns (`ChatDrawerV2`, the v2 modals), not a hand-rolled sheet. |
| **Tokens / fonts / glows** | ✅ Exists | `app/heirloom/globals.css` + `layout.tsx` already define the palette, next/font families, glow utilities, and modal animations (§8). Reuse them — do **not** introduce new tokens. |
| **Upload-flow components** | ✅ Installed | `SourceSheet`, `MediaPills`, `MaterialsGrid`, `TranscriptReview`, `MediaGallery` already in `components/shells/membership/` (not part of this handoff, but the install/source patterns there are the precedent to match). |

**The one new dependency** this whole feature requires is `@serwist/next` (for offline/SW). Manifest and the install/push UI need no new packages. Everything renders under the `[data-brand="heirloom"]` wrapper so the route-scoped tokens resolve — new PWA components must live inside that subtree (or re-declare the fonts), see §8.

## About these files
The bundle is a **design reference built as an HTML/React prototype** (Babel-in-browser, inline styles, `--hl-*` CSS variables) — **not** production code to ship. The task is to **recreate these moments in the Next.js app** using its real PWA plumbing (below) and the existing semantic Tailwind tokens. **Fidelity: hi-fi** — match the layout, copy, motion, and tokens precisely.

| File | What it is |
|------|-----------|
| `Heirloom-PWA-Moments-Visual.html` | Standalone, offline visual reference — the live prototype with the Tweaks panel (Device / Theme / Nav / **PWA moments**). Open in a browser; use the "PWA moments" tweak buttons to replay each moment. |
| `prototype-src/mobile-app.jsx` | **The orchestrator** — phase machine + which moment fires when. Read this first. |
| `prototype-src/mobile-pwa.jsx` | All the moment UI: `Splash`, `InstallSheet`, `PushSheet`, `OfflineBar`, `BottomSheet`, `Toast`, `PhoneFrame`, `AppIcon`. |
| `prototype-src/mobile-screens.jsx` | `MobileLanding` (the landing moment) + app screens. |
| `prototype-src/mobile-data.jsx`, `icons.jsx` | Content/theme tokens and the lucide icon set. |

---

## 1. The production PWA architecture (authoritative — build against this)
These are fixed facts about the Heirloom codebase. The prototype only *mocks* the surfaces; wire them to the real plumbing:

1. **Manifest → `app/manifest.ts`** (native Next.js `MetadataRoute.Manifest`, no library). Icons, `theme_color`, `display`, `start_url` go straight in this file. The brand icons (gold tile + feather) and theme colors below drop in here. No extra deps.
2. **Service worker → `app/sw.ts` compiled to `public/sw.js` via Serwist** (`@serwist/next`) — **not** next-pwa. Any offline/caching behavior (the Offline moment, §6) is specced against Serwist runtime caching.
3. **Install prompt → a client-component hook `usePWAInstall()`** that captures `beforeinstallprompt`. The install UI is a **client component that consumes that hook** — design against that contract (`{ canInstall, promptInstall, platform }`), don't re-implement event capture in the view.
4. **Testing → production build only.** Vercel **preview** URLs won't show PWA behavior. Test installs/offline/push on the live tenant domain **heirloom.2bl.ai**.
5. **Web Push → server-side only.** The permission-prompt **UI is a client component**; the sending logic is a Vercel function using `web-push`. **CD builds only the prompt UI** — not the send side.

---

## 2. The launch state machine (from `mobile-app.jsx`)
A single `phase` drives the launch; PWA overlays are independent booleans layered on top.

```
phase: 'splash' ──(auto, ~1.5s)──▶ 'landing' ──(Start / Start Your Story)──▶ 'app'
```

Overlay state (each an independent boolean, rendered above the current phase):
- `installOpen` — the Install / Add-to-Home-Screen sheet
- `pushOpen` — the notification permission sheet
- `offline` — the offline banner + cached-content mode
- `installed`, `notifications` — sticky results that gate later moments

**Orchestration rules (preserve these):**
- **Splash auto-dismisses** after ~1500ms → `landing`. (In prod, dismiss when the app shell + first data are ready; keep a minimum visible time so it doesn't flash.)
- **Push is a *consequence of install*, not a launch step:** ~700ms after `installed` flips true, if notifications aren't already on, the push sheet appears **once** (guarded by a `pushedOnce` ref). Never prompt for push cold.
- **Install entry points:** the landing top-bar isn't it — install is offered from (a) the landing "Keep it in your pocket" callout and (b) the Profile screen. In prod, only reveal install affordances when `usePWAInstall().canInstall` is true (Android `beforeinstallprompt` fired, or iOS Safari standalone not yet active).

---

## 3. Moment — Splash (standalone launch)
`Splash` in `mobile-pwa.jsx`. Shown only on a true standalone launch (`display: standalone`), not in-browser.

- **Layout:** full-bleed, centered column, gap 24. Background is a radial glow: `radial-gradient(ellipse at 50% 38%, var(--hl-glow-1) 0%, var(--hl-glow-2) 42%, var(--hl-bg) 78%)`.
- **Content:** `AppIcon` 92px → wordmark **"Heirloom"** (`font-display`, 400, 40px, letter-spacing .02em, `--hl-text`) → kicker **"A memoir, guided"** (`font-mono`, 10.5px, letter-spacing .32em, uppercase, `--hl-accent`). Three pulsing accent dots pinned to the bottom safe-area.
- **Motion:** icon `hl-splash-glyph` (scale .86→1, .9s `cubic-bezier(.22,1,.36,1)`); text fades in at .4s; dots use the typing-dot keyframe. Respect `prefers-reduced-motion` — show the end-state.
- **Prod:** this is the OS splash for `display: standalone`. The manifest's `background_color`/`theme_color` paint the very first frame; this React splash covers the shell-hydration beat after. Keep them visually identical so there's no seam.

## 4. Moment — Landing (mobile)
`MobileLanding` in `mobile-screens.jsx`. The in-browser first-run / not-yet-installed entry. Scrollable.

- **Sticky top bar:** blurred `--hl-bg` 80%, `AppIcon` 28px + "Heirloom" wordmark, and a filled **Start** button (`--hl-accent`).
- **Hero:** mono eyebrow → oversized display "Heirloom" (`clamp(58px,17vw,84px)`, weight 300, line-height .94) → italic tagline (`--hl-accent`) → muted subhead → format pills → **Start Your Story** primary button + a 2×2 format grid (Book / Comic / Webpage / Audiobook).
- **Sections:** "What Is Heirloom" (icon cards), "How It Works" (5 numbered steps on a `--hl-surface` band), the **Install callout** ("Keep it in your pocket" → triggers the Install moment), and a closing quote with a final CTA.
- **Motion:** `.reveal` children rise+fade on scroll via IntersectionObserver, with a guaranteed fallback that reveals everything ~350ms after mount (never stuck hidden).
- **Prod:** this is a normal route. Start → enter the app shell. The install callout calls `usePWAInstall().promptInstall()` (Android) or opens the iOS instructions sheet (§5).

## 5. Moment — Install / Add to Home Screen
`InstallSheet` in `mobile-pwa.jsx` — **platform-branched**, rendered in a `BottomSheet`.

- **Android:** app row (`AppIcon` 52 + "Install Heirloom" + `heirloom.life`), one line of body copy, **Not now / Install** buttons. Install → in prod call `promptInstall()` from `usePWAInstall()` (fires the captured `beforeinstallprompt`), then on `appinstalled` flip `installed` and toast **"Added to Home Screen."**
- **iOS (no `beforeinstallprompt`):** an instructional sheet — app row, then a 2-step card: **1.** Tap *Share* in the toolbar, **2.** Choose *Add to Home Screen* (each step numbered with a lucide glyph), then a "Got it — add it" dismiss. This is the only path on iOS Safari; gate it on "is iOS && not already standalone."
- **BottomSheet primitive:** scrim `rgba(20,14,8,.42)` + 2px blur, surface `--hl-surface`, top radius 26, grab handle, `hl-sheet-up` entrance (.32s `cubic-bezier(.22,1,.36,1)`), bottom padding respects `--safe-bottom`.
- **Buttons (`SheetBtn`):** primary = `--hl-accent` on `--hl-on-accent`; ghost = transparent + `--hl-border-strong`; press scales to .97.

## 6. Moment — Push permission
`PushSheet` in `mobile-pwa.jsx`. Fires **once, ~700ms after install** (see §2) — never cold, never on the landing page.

- **Layout:** centered — a 56px rounded accent-soft tile with a heart glyph, display headline **"Stay close to your story,"** muted body (*"A gentle nudge when your guide has a new question, or when a loved one adds to a chapter. No noise — just the story."*), then **Allow notifications** (primary) / **Not now** (ghost).
- **Prod (client side only):** Allow → call `Notification.requestPermission()`; if granted, subscribe via `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` and POST the subscription to your API. Flip `notifications`, toast **"Notifications on."** **The sending side is a separate Vercel function using `web-push` — out of scope for this UI handoff.**

## 7. Moment — Offline
`OfflineBar` in `mobile-pwa.jsx` + the offline content mode.

- **Bar:** pinned below the status bar, full-width, `font-mono` uppercase 10.5px, dark-on-light pill background, a pulsing accent dot, copy **"Offline — showing saved memories."**
- **Behavior:** when offline, memory lists render from cache and write-actions degrade gracefully. In prod this is **Serwist** runtime caching (`app/sw.ts`): precache the app shell; runtime-cache memory/story GETs (stale-while-revalidate); queue or disable mutations while offline. Drive the bar off `navigator.onLine` + `online`/`offline` events. Pull-to-refresh (`PullToRefresh`) re-syncs and toasts **"Synced just now."**

---

## 8. Design tokens — use what's already in `app/heirloom/globals.css`
The Heirloom route already defines the full palette, fonts, glows, and animations, route-scoped via `[data-brand="heirloom"]` (and promoted to `:root` for colors). **Build the moments inside that subtree and consume these — do not introduce new tokens or re-declare the palette.**

**Existing color tokens (real names → Tailwind usage):**
| CSS var | Value | Tailwind |
|---------|-------|----------|
| `--color-surface` | `42 26 14` (#2A1A0E) | `bg-surface`, `bg-surface/NN` |
| `--color-accent` | `201 169 110` (#C9A96E) | `bg-accent`, `border-accent/NN` |
| `--hl-bg` | `28 15 6` (#1C0F06) | page bg / `on-accent` text |
| `--hl-text-primary` | `245 239 230` (#F5EFE6) | `text-text-primary` |
| `--hl-text-muted` | `rgba(245,239,230,0.55)` | `text-text-muted` |
| `--hl-accent-hover` | `#B8935A` | `hover:bg-accent-hover` |
| `--hl-border` | `rgba(245,239,230,0.12)` | `border-border` |

The prototype's extra shades (`surface-2 #33210F`, `accent-soft = accent/16`, `accent-line = accent/30`, `danger #E58D80`) aren't separate tokens in the app — express them with alpha modifiers on the existing tokens (`bg-accent/15`, `border-accent/30`) or add them to `globals.css` only if genuinely reused.

**Reuse the existing glow + animation utilities** instead of redefining: `.bg-hero-glow` / `.bg-cta-glow` / `.bg-contributor-glow` (the radial espresso glows for splash + landing + push backdrops), and `hl-fade-in` / `hl-modal-in` / `.hl-animate-fade` / `.hl-animate-modal` (entrances). Add only the few keyframes the app lacks (`hl-splash-glyph`, a sheet-up if not using Mantine `Drawer`'s own transition, the typing-dot pulse, `hl-spin`). Gate all motion on `prefers-reduced-motion: no-preference`.

**Fonts** are already wired in `app/heirloom/layout.tsx` via `next/font/google` — Cormorant Garamond → `--font-display`, DM Sans → `--font-body`, DM Mono → `--font-mono` (defined on the `[data-brand="heirloom"]` wrapper). Just use the `font-display/-body/-mono` classes; don't re-import the fonts.

**Manifest values** (`app/manifest.ts`, new): `background_color` + `theme_color` should equal the launch background (`#1C0F06`) so the OS splash and the React `Splash` are seamless. `display: 'standalone'`, `start_url: '/heirloom'` (Heirloom serves from the `/heirloom` route group on `heirloom.2bl.ai` — confirm the tenant rewrite so `start_url`/`scope` resolve correctly), `name`/`short_name` "Heirloom", icons = the gold-tile mark in `brand/` at 192 / 512 / maskable.

---

## 9. Wiring the plumbing (codebase-specific)

**Routing reality (from `middleware.ts`):** `heirloom.2bl.ai/` is rewritten **internally** to `/heirloom` (tagged `x-heirloom`). The browser only ever sees public paths on the `heirloom.2bl.ai` origin — it never sees `/heirloom`. Two consequences:
- **Manifest `start_url`/`scope`/`id` = `"/"`** (the public root on this origin), **not** `"/heirloom"`. The internal rewrite is invisible to the browser; `/heirloom` would only matter for the `2bl.ai/heirloom` preview path, which is not the PWA's install origin.
- The middleware `config.matcher` **excludes** `.webmanifest` and `sw.js` (static-asset skip list) and **passes `/api/*` through unrewritten** on the Heirloom host. So the manifest, the service worker, and the push API route all serve from the **origin root** untouched — don't add them to middleware, and keep the push endpoint at root `/api/...` (resolve tenant from the host header, same pattern as the existing API routes).

**Manifest is multi-tenant** — the same app also serves SBL at `2bl.ai`. Make `app/manifest.ts` **dynamic** by reading the host header and branching, so Heirloom gets its own name/icons/theme:
```ts
// app/manifest.ts
import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get('host')?.toLowerCase() ?? '';
  const isHeirloom = host.startsWith('heirloom.');
  if (!isHeirloom) return { /* SBL manifest — unchanged */ name: 'Second Brain Labs', start_url: '/', display: 'standalone', icons: [] };
  return {
    name: 'Heirloom', short_name: 'Heirloom', id: '/',
    start_url: '/', scope: '/',          // public root on heirloom.2bl.ai (NOT /heirloom)
    display: 'standalone', orientation: 'portrait',
    background_color: '#1C0F06', theme_color: '#1C0F06',
    icons: [
      { src: '/icons/heirloom-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/heirloom-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/heirloom-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```
(Drop the PNGs from `manifest-icons/` into `public/icons/`; generate a 192 and a maskable 512 with padding from the 1024.) Reading `headers()` opts the route out of static generation — intended here.

**Service worker — add Serwist** (`@serwist/next`, the one new dependency): wrap `next.config.mjs` with `withSerwist({ swSrc: 'app/sw.ts', swDest: 'public/sw.js' })`, author `app/sw.ts` (precache the shell; runtime-cache memory/story `GET`s stale-while-revalidate for the Offline moment; never cache `/api/*` mutations). Register `/sw.js` with `scope: '/'` from a client component mounted on Heirloom pages.

**Install hook — `usePWAInstall()`** (new client hook): capture `beforeinstallprompt` (preventDefault + stash the event), expose `{ canInstall, promptInstall, platform }`, and detect iOS Safari (no event → `platform: 'ios'`, show the Share→Add instructions instead). The install UI consumes this; it must not re-capture the event itself.

**Push — UI only.** Permission/subscription is client-side (§6); POST the `PushSubscription` to a root `/api/push/subscribe` route. The **send side** (a Vercel function using `web-push`) is out of scope for this handoff.

---

## 10. Behavior contract / QA
- [ ] Standalone launch shows the splash; in-browser does **not**. Splash auto-dismisses to landing/app; min visible time prevents flash.
- [ ] Manifest splash color === React splash background (no seam on cold launch).
- [ ] Install offered only when installable (Android `canInstall`, or iOS-Safari-not-standalone); hidden otherwise.
- [ ] Android install uses the captured `beforeinstallprompt` via `usePWAInstall()`; `appinstalled` → toast + sticky installed state.
- [ ] iOS shows the Share → Add to Home Screen instructions (no native prompt exists).
- [ ] Push prompt fires **once**, ~700ms after install, never cold, guarded so it can't re-fire.
- [ ] Granting push subscribes and POSTs the subscription; denial degrades silently. Send side not implemented here.
- [ ] Offline bar reflects `navigator.onLine`; lists render from Serwist cache; mutations queue/disable; pull-to-refresh re-syncs + toasts.
- [ ] All moments use existing tokens/fonts; `prefers-reduced-motion` shows end-states.
- [ ] Verified on a **production build** at **heirloom.2bl.ai**, not a Vercel preview URL.
