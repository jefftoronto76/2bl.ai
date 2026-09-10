/** Mirrors the Heirloom token mapping in /home/user/2bl.ai/tailwind.config.js for the harness only. */
module.exports = {
  content: ['./spike/**/*.tsx', './harness/**/*.{html,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        border: 'var(--color-border)',
      },
    },
  },
};
