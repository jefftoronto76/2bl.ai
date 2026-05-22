export function Footer() {
  return (
    <footer style={{ padding: '64px clamp(24px, 5vw, 48px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
      <div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--color-text-muted)' }}>Jeff Lougheed</p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: '4px' }}>Experienced Operator</p>
      </div>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {['#about', '#work', '#chat'].map(href => (
          <a key={href} href={href} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-dim)', textDecoration: 'none' }}>
            {href.replace('#', '')}
          </a>
        ))}
      </div>
    </footer>
  )
}
