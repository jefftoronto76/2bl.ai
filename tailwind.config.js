export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        // Second Brain Labs storefront tokens — values are scoped to
        // [data-brand="sbl"] in globals.css, so these are inert elsewhere.
        paper: 'rgb(var(--color-paper-rgb) / <alpha-value>)',
        'paper-2': 'var(--color-paper-2)',
        'paper-3': 'var(--color-paper-3)',
        line: 'var(--color-line)',
        'line-2': 'var(--color-line-2)',
        ink: 'var(--color-ink)',
        'ink-2': 'var(--color-ink-2)',
        muted: 'var(--color-muted)',
        dim: 'var(--color-dim)',
        'accent-deep': 'var(--color-accent-deep)',
        'accent-soft': 'var(--color-accent-soft)',
        pos: 'var(--color-pos)',
        // Heirloom/Legacy storefront tokens — mapped to canonical --color-* names
        // (Backlog/css-token-unification-spec.md). Values are defined in each route's
        // globals.css; these are inert on routes that don't define the vars.
        background:     'rgb(var(--color-background) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-muted':   'var(--color-text-muted)',
        'accent-hover': 'var(--color-accent-hover)',
        border:         'var(--color-border)',
        'surface-2':    'rgb(var(--color-surface-2) / <alpha-value>)',
        // Legacy storefront tokens — values are scoped to /legacy routes via
        // app/legacy/globals.css; inert everywhere else.
        'lg-background':   'rgb(var(--lg-bg) / <alpha-value>)',
        'lg-text-primary': 'rgb(var(--lg-text-primary) / <alpha-value>)',
        'lg-text-muted':   'var(--lg-text-muted)',
        'lg-accent-hover': 'var(--lg-accent-hover)',
        'lg-border':       'var(--lg-border)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
        serif: ['var(--font-serif)', 'Times New Roman', 'serif'],
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        waveform: { '0%,100%': { transform: 'scaleY(0.35)' }, '50%': { transform: 'scaleY(1)' } },
        recpulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
      },
      animation: {
        waveform: 'waveform 0.9s ease-in-out infinite',
        recpulse: 'recpulse 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
