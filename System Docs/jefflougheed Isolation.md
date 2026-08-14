# jefflougheed.ca Isolation

## jefflougheed.ca Isolation

jefflougheed.ca-only code and assets are isolated from shared/platform code:

- **Components** live in `app/(jefflougheed)/components/` — the self-contained,
  presentational pieces owned solely by the public site: `Footer`,
  `SectionOutcomes`, `SectionWhy`, `SectionCareer`, `SectionTestimonials`,
  `Problem`, `Session`, `Colophon`, `FeaturedTestimonial`, `SectionRail`,
  `ShareIcons`, `ShareModal`, `useMode`, plus `Nav` and `SectionProcess` (see
  below). `page.tsx` imports these via relative `./components/…`.
- **Public assets** live in `public/sage/jefflougheed/` and are referenced as
  `/sage/jefflougheed/…` (favicons, headshots, the ten career logos,
  `ProblemBackground.webp`, `chewing-gum.svg`, `bench.svg`). Next.js only
  serves static files from the **root** `public/` directory — there is no
  route-group-scoped `public/`, so isolation is achieved by namespacing under
  root `public/` rather than moving the folder into `app/(jefflougheed)/`. The
  webmanifest lives at `/sage/jefflougheed/favicons/site.webmanifest` and its
  internal icon `src`s point at `/sage/jefflougheed/favicons/…`.

The widget-shell chat surfaces have been extracted (centralization Step E):
the former `Hero.tsx`, `Chat.tsx`, and `sage/*` (`SageReply`, `BookingCard`,
`markdownComponents`) now live in **`components/shells/widget/`** (app-importable
shared presentation) — `Hero.tsx` and `Chat.tsx` were subsequently consolidated
into `WidgetShell.tsx`, exporting `WidgetShellHero` and `WidgetShellChat` — with
the headless pieces (`useWidgetShell`,
`useSageParameters`) in `services/chat/ui/v1/`. `SectionProcess.tsx` is a
jefflougheed marketing section that consumes the widget via those headless
`useWidgetShell` and `useSageParameters` hooks (Step E relocates it into
`app/(jefflougheed)/components/`).

`Nav.tsx` — jefflougheed nav chrome with no chat coupling — has been relocated
into `app/(jefflougheed)/components/` (it imports `ShareModal` via relative
`./ShareModal`). With this move `src/components/` is **empty and removed**; the
last `boundaries/element-types` warning (the old `Nav → ShareModal` `src→app`
pair) is cleared. `src/` now holds only `calendly.d.ts`.

Do not move or delete these without explicit instruction from Jeff.

Notes:
- `SectionProcess.tsx` now lives in `app/(jefflougheed)/components/`
  (relocated in centralization Step E). It does **not** import
  `FEATURED_TESTIMONIALS` (an earlier note to that effect was stale); its
  cross-module dependencies are the headless `useWidgetShell` store and
  `useSageParameters` (both `app→services`, legal), both from
  `services/chat/ui/v1/`.
- `public/logos/` deliberately still holds the platform `2blai_logo.svg` and
  some duplicate/variant logos — only the specific jefflougheed logos were
  namespaced.
- The earlier DesignLab logo filename typo is fixed: `SectionCareer`
  references `/sage/jefflougheed/logos/DesignLab_Logo.svg` and the on-disk
  file is spelled to match, so the logo resolves.

---
