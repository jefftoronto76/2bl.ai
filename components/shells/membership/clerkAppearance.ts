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
// colorText alone does not reach Clerk's headerTitle element — Clerk's internal
// component CSS wins on specificity. The elements block below overrides that
// directly for header and subtitle nodes.
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
    // Explicit overrides because Clerk's component CSS outspecifics colorText
    // on these elements in the default stylesheet.
    headerTitle:    { color: 'rgb(var(--hl-text-primary))' },
    headerSubtitle: { color: 'var(--hl-text-muted)' },

    // Form field labels ("Email address", etc.)
    formFieldLabel: { color: 'rgb(var(--hl-text-primary))' },

    // "or" divider — dividerRow confirmed from project codebase
    dividerRow: { color: 'var(--hl-text-muted)' },

    // "Don't have an account?" — the static text portion of the footer
    footerActionText: { color: 'var(--hl-text-muted)' },

    // Apple button only: cream background so the black Apple logo is legible
    // on the dark modal. Google/Facebook are unaffected.
    socialButtonsBlockButton__apple: {
      backgroundColor: 'rgb(var(--hl-text-primary))',
      color: 'rgb(var(--hl-bg))',
    },
  },
};
