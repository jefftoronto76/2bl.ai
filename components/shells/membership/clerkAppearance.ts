// Heirloom Clerk modal appearance — colours reference CSS custom properties
// loaded by app/heirloom/globals.css so no hex values are hardcoded here.
// The :root variables resolve inside Clerk's modal portal because they are
// defined on :root (not scoped to [data-brand="heirloom"]).
//
// --color-modal-background, -surface, -text-primary store raw RGB triplets
// and must be wrapped in rgb(). --color-modal-text-muted and
// --color-modal-border store direct rgba() values and are consumed via
// plain var() with no wrapper.
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
    colorBackground: 'rgb(var(--color-modal-background))',
    colorForeground: 'rgb(var(--color-modal-text-primary))',
    colorMutedForeground: 'var(--color-modal-text-muted)',
    colorPrimaryForeground: 'rgb(var(--color-modal-text-primary))',
    colorInput: 'rgb(var(--color-modal-surface))',
    colorInputForeground: 'rgb(var(--color-modal-text-primary))',
    colorNeutral: 'var(--color-modal-border)',
    colorModalBackdrop: 'rgba(0, 0, 0, 0.7)',
    fontFamily: '"DM Sans", sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    headerTitle:    { color: 'rgb(var(--color-modal-text-primary))' },
    headerSubtitle: { color: 'var(--color-modal-text-muted)' },
    formFieldLabel: { color: 'rgb(var(--color-modal-text-primary))' },
    dividerRow:     { color: 'var(--color-modal-text-muted)' },
    footerActionText: { color: 'var(--color-modal-text-muted)' },
    footerActionLink: { color: 'rgb(var(--color-modal-text-primary))', fontWeight: '600' },
    // All social buttons get a visible border and dark text against the off-white modal background
    socialButtonsBlockButton: {
      border: '1px solid var(--color-modal-border)',
      color: 'rgb(var(--color-modal-text-primary))',
    },
    // Apple button: dark background on light modal so the white Apple logo is legible
    socialButtonsBlockButton__apple: {
      backgroundColor: 'rgb(var(--color-modal-text-primary))',
      color: 'rgb(var(--color-modal-background))',
    },
    // Country code selector — portal-rendered outside modal DOM; elements block
    // applies globally regardless of portal boundary, globals.css cannot reach these.
    selectButton__countryCode:     { color: 'rgb(var(--color-modal-text-primary))' },
    selectButtonIcon__countryCode: { color: 'rgb(var(--color-modal-text-primary))' },
    selectOption__countryCode:     { color: 'rgb(var(--color-modal-text-primary))' },
  },
};
