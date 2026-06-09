// Heirloom Clerk modal appearance — colours reference CSS custom properties
// loaded by app/heirloom/globals.css so no hex values are hardcoded here.
// The :root variables resolve inside Clerk's modal portal because they are
// defined on :root (not scoped to [data-brand="heirloom"]).
//
// RGB-triplet tokens (e.g. --color-accent: 201 169 110) must be wrapped in
// rgb() to produce a valid CSS colour; rgba tokens (--hl-text-muted) and hex
// tokens (--hl-accent-hover) are used directly.
//
// Font vars (--font-body, --font-serif) are scoped to [data-brand="heirloom"]
// and do not resolve inside Clerk's modal portal (appended to document.body,
// outside the brand wrapper). The literal DM Sans family string is used instead.
//
// NOTE: The Clerk docs recommend the `simple` theme to strip competing default
// styles, but it is not present in @clerk/ui@1.15.0 (the current stable release).
// Until a stable release ships it, targeted .cl-* rules in globals.css handle
// the remaining specificity gaps, with !important only where Clerk's own rules
// win (currently: .cl-selectButton__countryCode vs .cl-button).
export const heirloomClerkAppearance = {
  variables: {
    colorPrimary: 'rgb(var(--color-accent))',
    colorBackground: 'rgb(var(--hl-bg))',
    colorText: 'rgb(var(--hl-text-primary))',
    colorTextSecondary: 'var(--hl-text-muted)',
    colorTextOnPrimaryBackground: 'rgb(var(--hl-bg))',
    colorInputBackground: 'rgb(var(--color-surface))',
    colorInputText: 'rgb(var(--hl-text-primary))',
    // --hl-border is already rgba(...) — no rgb() wrapper needed
    colorNeutral: 'var(--hl-border)',
    colorModalBackdrop: 'rgba(0, 0, 0, 0.7)',
    fontFamily: '"DM Sans", sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    headerTitle:    { color: 'rgb(var(--hl-text-primary))' },
    headerSubtitle: { color: 'var(--hl-text-muted)' },
    formFieldLabel: { color: 'rgb(var(--hl-text-primary))' },
    dividerRow:     { color: 'var(--hl-text-muted)' },
    footerActionText: { color: 'var(--hl-text-muted)' },
    // Apple button: cream background so the Apple logo is legible on dark modal
    socialButtonsBlockButton__apple: {
      backgroundColor: 'rgb(var(--hl-text-primary))',
      color: 'rgb(var(--hl-bg))',
    },
  },
};
