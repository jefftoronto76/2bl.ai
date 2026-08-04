/* Combined admin (Second Brain Labs) — single shell that merges the Platform
   admin and the Tenant admin into one flat sidebar.

   Platform screens live under /platform/*, the tenant ("Natural Resource")
   screens under /admin/*. Tenant screens manage their own full-height layout;
   platform + members screens render inside the padded .main-inner column. */
(function () {
  const { useState } = React;
  const I = window.Icons;
  const { useToasts } = window.TUI;
  const S = window.Screens;

  const USER = { name: 'Jeff Lougheed', email: 'jeff@2bl.ai', initials: 'JL' };

  /* ── Merged navigation — flat sidebar, grouped by section ──────────── */
  const NAV_SECTIONS = [
    {
      label: 'Platform',
      items: [
        { label: 'Tenants',  href: '/platform/admin' },
        { label: 'Members',  href: '/platform/members' },
        { label: 'Usage',    href: '/platform/usage' },
        { label: 'Prompt',   href: '/admin/prompt-studio/prompt' },
      ],
    },
    {
      label: 'Second Brain Labs',
      items: [
        { label: 'Inbound Chats', href: '/admin' },
        { label: 'Prompt',        href: '/admin/prompt' },
        { label: 'Settings',      href: '/admin/settings' },
      ],
    },
    {
      label: 'Prompt Studio',
      items: [
        { label: 'Composer', href: '/admin/prompt-builder' },
        { label: 'Blocks',   href: '/admin/prompt-studio/blocks' },
        { label: 'History',  href: '/admin/prompt-studio/history' },
        { label: 'Assets',   href: '/admin/prompt-studio/assets' },
      ],
    },
  ];

  // Mobile-header titles for every route.
  const PAGE_TITLES = {
    '/platform/admin': 'Tenants',
    '/platform/products': 'Products',
    '/platform/members': 'Members',
    '/platform/usage': 'Usage',
    ...window.ADMIN_PAGE_TITLES,
  };

  // Routes that render inside the padded .main-inner column (vs. full-bleed
  // tenant screens that own their own .screen layout).
  const PADDED = new Set([
    '/platform/admin', '/platform/products', '/platform/members', '/platform/usage',
    '/admin/members',
  ]);

  function Wordmark() {
    return (
      <div className="wordmark">
        <div className="name">Second Brain Labs</div>
        <div className="kicker">Admin</div>
      </div>
    );
  }

  function NavContent({ active, onNav }) {
    return (
      <>
        <Wordmark />
        <div className="nav-scroll">
          {NAV_SECTIONS.map((section, i) => (
            <React.Fragment key={section.label}>
              <div className="nav-section-label" style={i === 0 ? { marginTop: 6 } : undefined}>{section.label}</div>
              <div className="navlinks" style={{ paddingTop: 0 }}>
                {section.items.map((it) => (
                  <button
                    key={it.href}
                    className={`navlink ${active === it.href ? 'active' : ''}`}
                    aria-current={active === it.href ? 'page' : undefined}
                    onClick={() => onNav(it.href)}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{ padding: 8 }}>
          <button className="userbtn">
            <span className="avatar">{USER.initials}</span>
            <span className="u-meta"><span className="u-name">{USER.name}</span><span className="u-mail">{USER.email}</span></span>
            <span className="u-dots"><I.Dots size={16} /></span>
          </button>
        </div>
      </>
    );
  }

  function App() {
    const [route, setRoute] = useState('/platform/admin');
    const [drawer, setDrawer] = useState(false);
    const toasts = useToasts();
    const notify = (t) => toasts.show(t);

    function nav(href) { setRoute(href); setDrawer(false); }

    function render() {
      switch (route) {
        // ── Platform ──
        case '/platform/admin':    return <S.Tenants notify={notify} />;
        case '/platform/products': return <S.Products />;
        case '/platform/members':  return <window.MembersPage notify={notify} />;
        case '/platform/usage':    return <S.Usage />;
        // ── Tenant ──
        case '/admin':             return <S.InboundChats />;
        case '/admin/prompt':      return <S.SystemPrompt />;
        case '/admin/settings':    return <S.Settings notify={notify} />;
        case '/admin/members':     return <window.MembersPage notify={notify} />;
        case '/admin/prompt-builder':        return <S.Composer notify={notify} userName={USER.name} />;
        case '/admin/prompt-studio/blocks':  return <S.Blocks notify={notify} />;
        case '/admin/prompt-studio/history': return <S.History />;
        case '/admin/prompt-studio/assets':  return <S.Assets />;
        case '/admin/prompt-studio/prompt':  return <S.PromptPreview />;
        default: return <S.Tenants notify={notify} />;
      }
    }

    const padded = PADDED.has(route);

    return (
      <div className="shell">
        <div className="mobile-header">
          <button className="burger" aria-label="Toggle navigation" onClick={() => setDrawer(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="mh-title">{PAGE_TITLES[route]}</span>
        </div>

        <nav className="navbar desktop"><NavContent active={route} onNav={(h) => setRoute(h)} /></nav>

        {drawer && (
          <>
            <div className="drawer-overlay" onClick={() => setDrawer(false)} />
            <nav className="drawer"><NavContent active={route} onNav={nav} /></nav>
          </>
        )}

        <main className="main">
          {padded ? <div className="main-inner" style={{ maxWidth: 1080 }}>{render()}</div> : render()}
        </main>

        {toasts.view}
      </div>
    );
  }

  document.getElementById('boot')?.remove();
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
