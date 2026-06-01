export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
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
        // Heirloom storefront tokens — values are scoped to [data-brand="heirloom"]
        // in globals.css, so these are inert elsewhere. `surface` and `accent`
        // (above) are reused; these are the Heirloom-only additions.
        background: 'rgb(var(--hl-bg) / <alpha-value>)',
        'text-primary': 'rgb(var(--hl-text-primary) / <alpha-value>)',
        'text-muted': 'var(--hl-text-muted)',
        'accent-hover': 'var(--hl-accent-hover)',
        border: 'var(--hl-border)',
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
