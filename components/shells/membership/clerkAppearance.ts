// Heirloom Clerk modal appearance — colours reference CSS custom properties
// loaded by app/heirloom/globals.css so no hex values are hardcoded here.
// The :root variables resolve inside Clerk's modal portal because they are
// defined on :root (not scoped to [data-brand="heirloom"]).
//
// RGB-triplet tokens (e.g. --color-accent: 201 169 110) must be wrapped in
// rgb() to produce a valid CSS colour; rgba tokens (--hl-text-muted) and hex
// tokens (--hl-accent-hover) are used directly.
export const heirloomClerkAppearance = {
  variables: {
    colorPrimary: 'rgb(var(--color-accent))',
    colorBackground: 'rgb(var(--hl-bg))',
    colorText: 'rgb(var(--hl-text-primary))',
    colorTextSecondary: 'var(--hl-text-muted)',
    colorInputBackground: 'rgb(var(--color-surface))',
    colorInputText: 'rgb(var(--hl-text-primary))',
    borderRadius: '0.75rem',
  },
};
