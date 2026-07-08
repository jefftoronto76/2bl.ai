export function Colophon() {
  return (
    <section
      aria-label="Brought to you by Second Brain Labs"
      style={{ padding: '40px 0 56px', borderTop: '1px solid var(--color-border)' }}
    >
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '0 clamp(24px, 5vw, 48px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '40px',
        }}
      >
        {/* Brand credit — left */}
        <div style={{ maxWidth: '40ch' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
              marginBottom: '18px',
            }}
          >
            Brought to you by
          </p>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '21px',
              fontWeight: 500,
              lineHeight: 1.15,
              color: 'var(--color-text-primary)',
              marginBottom: '16px',
            }}
          >
            Second Brain{' '}
            <em style={{ fontStyle: 'italic', color: 'rgb(var(--color-accent))' }}>Labs</em>
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13.5px',
              lineHeight: 1.65,
              color: 'var(--color-text-dim)',
            }}
          >
            A small workshop built around the belief that language is changing the
            relationship between people and technology.
          </p>
        </div>

        {/* Contact — right */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            alignItems: 'flex-end',
            textAlign: 'right',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
              marginBottom: '4px',
            }}
          >
            Contact
          </p>
          <a
            href="mailto:hello@2bl.ai"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-text-muted)',
              textDecoration: 'none',
            }}
          >
            hello@2bl.ai
          </a>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Toronto · Remote
          </p>
        </div>
      </div>
    </section>
  )
}
