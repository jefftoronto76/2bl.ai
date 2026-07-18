# HOTFIX — invisible "Special Projects" chip label (production)

**Severity:** visible bug on the live site.
**Files:** `SectionOutcomes.tsx`, `SectionWhy.tsx`, `SectionProcess.tsx`

## Symptom
The **selected** mode chip (Special Projects / active track) renders as a
blank cream pill — the label is invisible. Coach/other chips are fine.

## Cause
The active chip's text color used the `text-bg` utility:

```
'bg-[color:var(--color-text-primary)] border-[color:var(--color-text-primary)] text-bg'
```

`text-bg` does not resolve to a usable color in the build, so the label falls
back to the inherited cream text — cream text on a cream pill = invisible.
The same `text-bg` is on the accent CTA button (low-contrast, less obvious).

## Fix
Use the explicit `rgb()` arbitrary value — the exact pattern the rest of these
files already use for tokens (`text-[color:var(--color-text-primary)]`, etc.):

```diff
- text-bg
+ text-[rgb(var(--color-bg))]
```

`--color-bg` is a space-separated triple (e.g. `24 32 41`), so it must be
wrapped in `rgb(...)`. This renders the dark page background as the label
color → dark text on the cream pill.

### Locations (4)
- `SectionOutcomes.tsx` — `ModeToggle`, active chip branch
- `SectionWhy.tsx` — `ModeToggle`, active chip branch
- `SectionProcess.tsx` — track-chip active branch **and** the accent CTA button
  (`bg-accent text-bg` → `bg-accent text-[rgb(var(--color-bg))]`)

## Optional follow-up
If you'd rather keep the short `text-bg` class, define it properly in the
Tailwind theme so it emits `color: rgb(var(--color-bg))`, then this fix is
unnecessary. Until then, the arbitrary value is build-config-independent.
