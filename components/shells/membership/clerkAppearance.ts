// Heirloom Clerk modal appearance — colours reference CSS custom properties
// loaded by app/heirloom/globals.css so no hex values are hardcoded here.
// The :root variables resolve inside Clerk's modal portal because they are
// defined on :root (not scoped to [data-brand="heirloom"]).
//
// RGB-triplet tokens (e.g. --color-accent: 201 169 110) must be wrapped in
// rgb() to produce a valid CSS colour; rgba tokens (--hl-modal-ink-muted,
// --hl-modal-border) and hex tokens (--hl-accent-hover) are used directly.
//
// Font vars (--font-body, --font-serif) are scoped to [data-brand="heirloom"]
// and do not resolve inside Clerk's modal portal (appended to document.body,
// outside the brand wrapper). The literal DM Sans family string is used instead.
//
// Modal surface is eggshell/off-white (#FAF6EE) — the card floats light over
// the dark page. Text and border tokens invert accordingly (--hl-modal-ink*).
//
// NOTE: The Clerk docs recommend the `simple` theme to strip competing default
// styles, but it is not present in @clerk/ui@1.15.0 (the current stable release).
// Until a stable release ships it, targeted .cl-* rules in globals.css handle
// the remaining specificity gaps, with !important only where Clerk's own rules
// win (currently: .cl-selectButton__countryCode vs .cl-button).
export const heirloomClerkAppearance = {
  variables: {
    colorPrimary: 'rgb(var(--color-accent))',
    colorBackground: 'rgb(var(--hl-modal-bg))',
    colorText: 'rgb(var(--hl-modal-ink))',
    colorTextSecondary: 'var(--hl-modal-ink-muted)',
    // Dark ink on gold primary button — unchanged direction
    colorTextOnPrimaryBackground: 'rgb(var(--hl-modal-ink))',
    colorInputBackground: 'rgb(var(--hl-modal-surface))',
    colorInputText: 'rgb(var(--hl-modal-ink))',
    // --hl-modal-border is already rgba(...) — no rgb() wrapper needed
    colorNeutral: 'var(--hl-modal-border)',
    colorModalBackdrop: 'rgba(0, 0, 0, 0.7)',
    fontFamily: '"DM Sans", sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    headerTitle:    { color: 'rgb(var(--hl-modal-ink))' },
    headerSubtitle: { color: 'var(--hl-modal-ink-muted)' },
    formFieldLabel: { color: 'rgb(var(--hl-modal-ink))' },
    dividerRow:     { color: 'var(--hl-modal-ink-muted)' },
    footerActionText: { color: 'var(--hl-modal-ink-muted)' },
    // Apple button: dark background on light modal so the white Apple logo is legible
    socialButtonsBlockButton__apple: {
      backgroundColor: 'rgb(var(--hl-modal-ink))',
      color: 'rgb(var(--hl-modal-bg))',
    },
    // Country code selector — portal-rendered outside modal DOM; elements block
    // applies globally regardless of portal boundary, globals.css cannot reach these.
    selectButton__countryCode:     { color: 'rgb(var(--hl-modal-ink))' },
    selectButtonIcon__countryCode: { color: 'rgb(var(--hl-modal-ink))' },
    selectOption__countryCode:     { color: 'rgb(var(--hl-modal-ink))' },
  },
};
