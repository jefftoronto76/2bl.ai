/* mobile-app.jsx — Heirloom mobile PWA root: phase machine, nav variations,
   PWA moment orchestration, and Tweaks. Renders into #root. */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const Icon = window.Icon;
  const { CONTENT, buildTheme } = window.HL;
  const {
    PhoneFrame, Splash, OfflineBar, InstallSheet, PushSheet, Toast, AppIcon,
    MobileLanding, BottomTabBar, Drawer, ChatScreen, MemoriesScreen, StoriesScreen, ProfileScreen,
    RowActionsSheet, ContextMenu,
    useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSelect, TweakButton,
  } = window;

  const DEFAULTS = {
    device: 'ios',
    theme: 'sepia',
    nav: 'tabs',          // tabs | drawer | hybrid
    chatEntry: 'fullscreen', // fullscreen | tab | list
    rowAction: 'sheet',   // sheet | swipe | longpress
    grain: true,
  };

  // Deep-link / embed support (used by the screen-flow canvas).
  const PARAMS = new URLSearchParams(location.search);
  const EMBED = PARAMS.get('embed') === '1';
  const SCREEN = PARAMS.get('screen') || null; // splash|landing|chat|memories|stories|profile|install|push|offline
  const URL_T = {};
  ['device', 'theme', 'nav', 'chatEntry', 'rowAction'].forEach((k) => { const v = PARAMS.get(k); if (v) URL_T[k] = v; });
  const appScreens = ['chat', 'memories', 'stories', 'profile', 'install', 'push', 'offline'];

  function App() {
    // EMBED is a module-constant for the page lifetime, so this branch is stable
    // across renders (does not violate the rules of hooks).
    let t, setTweak;
    if (EMBED) { t = { ...DEFAULTS, ...URL_T }; setTweak = () => {}; }
    else { const tw = useTweaks(DEFAULTS); t = tw[0]; setTweak = tw[1]; }
    const theme = buildTheme(t.theme);
    const tone = (window.HL.THEMES[t.theme] || {})['--hl-statusbar'] || 'dark';

    // ── phase: splash → landing → app ──────────────────────────────────────
    const initPhase = EMBED ? (SCREEN === 'splash' ? 'splash' : (SCREEN === 'landing' || !SCREEN ? 'landing' : 'app')) : 'splash';
    const [phase, setPhase] = useState(initPhase);
    const [route, setRoute] = useState(EMBED && appScreens.includes(SCREEN) ? (SCREEN === 'chat' ? 'chat' : (['stories', 'profile'].includes(SCREEN) ? SCREEN : 'memories')) : 'memories');
    const [chat, setChat] = useState(EMBED && SCREEN === 'chat' && t.chatEntry !== 'tab' ? { title: 'A story worth keeping' } : null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [navSheet, setNavSheet] = useState(false);

    // ── PWA state ──────────────────────────────────────────────────────────
    const [installed, setInstalled] = useState(false);
    const [notifications, setNotifications] = useState(false);
    const [offline, setOffline] = useState(EMBED && SCREEN === 'offline');
    const [installOpen, setInstallOpen] = useState(EMBED && SCREEN === 'install');
    const [pushOpen, setPushOpen] = useState(EMBED && SCREEN === 'push');
    const [refreshing, setRefreshing] = useState(false);
    const pushedOnce = useRef(false);

    // ── row actions ────────────────────────────────────────────────────────
    const [memories, setMemories] = useState(CONTENT.memories);
    const [sheetItem, setSheetItem] = useState(EMBED && SCREEN === 'rowsheet' ? CONTENT.memories[0] : null);
    const [ctx, setCtx] = useState(null); // {item, rect}
    const [toast, setToast] = useState(null);
    const toastRef = useRef(null);
    const showToast = useCallback((m) => { setToast(m); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(null), 2000); }, []);

    // splash auto-dismiss (not in a static embedded splash tile)
    useEffect(() => {
      if (phase !== 'splash') return;
      if (EMBED && SCREEN === 'splash') return; // hold the splash for the canvas
      const id = setTimeout(() => setPhase(EMBED ? 'app' : 'landing'), 1500);
      return () => clearTimeout(id);
    }, [phase]);

    const enterApp = () => {
      setPhase('app');
      if (t.chatEntry === 'fullscreen') { setRoute('memories'); setChat({ title: 'A story worth keeping' }); }
      else if (t.chatEntry === 'tab') { setRoute('chat'); setChat(null); }
      else { setRoute('memories'); setChat(null); }
    };

    const openChat = (item) => setChat({ title: (item && (item.title || item.name)) || 'A story worth keeping' });

    // push permission moment — once, shortly after install (skipped in embed)
    useEffect(() => {
      if (EMBED) return;
      if (installed && !pushedOnce.current && !notifications) {
        pushedOnce.current = true;
        const id = setTimeout(() => setPushOpen(true), 700);
        return () => clearTimeout(id);
      }
    }, [installed, notifications]);

    const doRefresh = () => { setRefreshing(true); setTimeout(() => { setRefreshing(false); showToast('Synced just now'); }, 1100); };

    const onRowAction = (key) => {
      const it = sheetItem || (ctx && ctx.item); setSheetItem(null); setCtx(null);
      if (!it) return;
      onQuick(it, key);
    };
    const onQuick = (it, key) => {
      if (key === 'star') { setMemories((a) => a.map((x) => x.id === it.id ? { ...x, starred: !x.starred } : x)); showToast(it.starred ? 'Unstarred' : 'Starred'); }
      else if (key === 'delete') { setMemories((a) => a.filter((x) => x.id !== it.id)); showToast('Deleted'); }
      else if (key === 'rename') showToast('Rename…');
      else if (key === 'invite') showToast('Invite collaborators');
      else if (key === 'moveToChapter') showToast('Moved to chapter');
      else if (key === 'removeFromChapter') showToast('Removed from chapter');
    };

    // ── render the active app screen ───────────────────────────────────────
    const hasTabBar = t.nav === 'tabs' && !chat;
    const scrollPad = hasTabBar ? '18px' : 'calc(var(--safe-bottom) + 84px)'; // room for floating controls / tab bar handled by layout
    const listPad = hasTabBar ? '18px' : 'calc(var(--safe-bottom) + 20px)';

    const screen = () => {
      if (chat) {
        const overlay = !(t.chatEntry === 'tab' && t.nav === 'tabs');
        return <ChatScreen title={chat.title} onBack={overlay ? () => setChat(null) : null}
          onKebab={() => setSheetItem({ id: 'thread', title: chat.title })}
          onToast={showToast} bottomPad={hasTabBar ? '8px' : 'var(--safe-bottom)'} />;
      }
      if (route === 'chat') return <ChatScreen title="A story worth keeping" onKebab={() => setSheetItem({ id: 'thread', title: 'A story worth keeping' })} onToast={showToast} bottomPad="8px" />;
      if (route === 'stories') return <StoriesScreen onOpen={openChat} onSheet={(s) => setSheetItem(s)} onCreate={() => showToast('New story')} scrollPad={listPad} />;
      if (route === 'profile') return <ProfileScreen installed={installed} notifications={notifications} offline={offline}
        onInstall={() => setInstallOpen(true)} onNotifications={() => (notifications ? setNotifications(false) : setPushOpen(true))} onToggleOffline={() => setOffline((v) => !v)} scrollPad={listPad} />;
      return <MemoriesScreen items={memories} mode={t.rowAction} offline={offline} onOpen={openChat}
        onSheet={(it) => setSheetItem(it)} onContext={(it, rect) => setCtx({ item: it, rect })} onQuick={onQuick}
        refreshing={refreshing} onRefresh={doRefresh} scrollPad={listPad} />;
    };

    // ── app chrome (nav variations) ────────────────────────────────────────
    const navTo = (key) => {
      setNavSheet(false); setDrawerOpen(false);
      if (key === 'new') { openChat(); return; }
      setChat(null); setRoute(key);
    };

    return (
      <React.Fragment>
        <PhoneFrame os={t.device} tone={tone} grain={t.grain}>
          <div style={{ ...theme, position: 'absolute', inset: 0, fontFamily: 'var(--font-body)', color: 'var(--hl-text)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {phase === 'splash' && <Splash tone={tone} />}

            {phase === 'landing' && (
              <MobileLanding onStart={enterApp} onInstall={() => setInstallOpen(true)} />
            )}

            {phase === 'app' && (
              <React.Fragment>
                <OfflineBar show={offline} os={t.device} />
                <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  {screen()}
                </div>
                {hasTabBar && <BottomTabBar tab={route} onTab={(k) => navTo(k)} />}

                {/* drawer trigger (drawer nav) */}
                {t.nav === 'drawer' && !chat && (
                  <FloatBtn pos="tl" name="menu" label="Menu" onClick={() => setDrawerOpen(true)} />
                )}
                {t.nav === 'drawer' && (
                  <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onNav={navTo} active={route} />
                )}

                {/* hybrid: FAB + nav sheet */}
                {t.nav === 'hybrid' && !chat && (
                  <React.Fragment>
                    <FloatBtn pos="bl" name="menu" label="Menu" onClick={() => setNavSheet(true)} />
                    <FloatBtn pos="br" name="edit" label="New chat" primary onClick={() => openChat()} />
                  </React.Fragment>
                )}
                {t.nav === 'hybrid' && (
                  <NavSheet open={navSheet} active={route} onClose={() => setNavSheet(false)} onNav={navTo} />
                )}
              </React.Fragment>
            )}

            {/* PWA overlays */}
            <InstallSheet open={installOpen} os={t.device} onClose={() => setInstallOpen(false)} onInstalled={() => { setInstallOpen(false); setInstalled(true); showToast('Added to Home Screen'); }} />
            <PushSheet open={pushOpen} onClose={() => setPushOpen(false)} onAllow={() => { setPushOpen(false); setNotifications(true); showToast('Notifications on'); }} />

            {/* row action surfaces */}
            <RowActionsSheet open={!!sheetItem} item={sheetItem} onAction={onRowAction} onClose={() => setSheetItem(null)} />
            {ctx && <ContextMenu item={ctx.item} rect={ctx.rect} onAction={onRowAction} onClose={() => setCtx(null)} />}

            <Toast msg={toast} />
          </div>
        </PhoneFrame>

        {!EMBED && <TweaksPanel title="Tweaks">
          <TweakSection label="Device" />
          <TweakRadio label="Frame" value={t.device} options={['ios', 'android']} onChange={(v) => setTweak('device', v)} />
          <TweakSelect label="Theme" value={t.theme} options={['sepia', 'espresso', 'midnight']} onChange={(v) => setTweak('theme', v)} />
          <TweakToggle label="Paper grain" value={t.grain} onChange={(v) => setTweak('grain', v)} />

          <TweakSection label="Navigation" />
          <TweakRadio label="Pattern" value={t.nav} options={['tabs', 'drawer', 'hybrid']} onChange={(v) => setTweak('nav', v)} />
          <TweakSelect label="Chat entry" value={t.chatEntry} options={['fullscreen', 'tab', 'list']} onChange={(v) => setTweak('chatEntry', v)} />
          <TweakRadio label="Row actions" value={t.rowAction} options={['sheet', 'swipe', 'longpress']} onChange={(v) => setTweak('rowAction', v)} />

          <TweakSection label="PWA moments" />
          <TweakButton label="Replay launch" onClick={() => { setPhase('splash'); setChat(null); setRoute('memories'); }} />
          <TweakButton label="Install prompt" onClick={() => { if (phase === 'splash') setPhase('landing'); setInstallOpen(true); }} />
          <TweakButton label="Push permission" onClick={() => setPushOpen(true)} />
          <TweakToggle label="Offline mode" value={offline} onChange={(v) => setOffline(v)} />
        </TweaksPanel>}
      </React.Fragment>
    );
  }

  function FloatBtn({ pos, name, label, onClick, primary }) {
    const corner = {
      tl: { top: 'calc(var(--safe-top) + 6px)', left: 12 },
      bl: { bottom: 'calc(var(--safe-bottom) + 14px)', left: 16 },
      br: { bottom: 'calc(var(--safe-bottom) + 14px)', right: 16 },
    }[pos];
    return (
      <button aria-label={label} onClick={onClick} style={{ position: 'absolute', zIndex: 40, ...corner,
        width: primary ? 56 : 44, height: primary ? 56 : 44, borderRadius: primary ? 18 : 13, border: primary ? 'none' : '1px solid var(--hl-border-strong)',
        background: primary ? 'var(--hl-accent)' : 'color-mix(in srgb, var(--hl-surface) 92%, transparent)', backdropFilter: 'blur(10px)',
        color: primary ? 'var(--hl-on-accent)' : 'var(--hl-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        boxShadow: primary ? '0 14px 30px -10px color-mix(in srgb, var(--hl-accent) 55%, transparent)' : '0 8px 22px -10px rgba(0,0,0,.4)' }}>
        <Icon name={name} size={primary ? 24 : 20} />
      </button>
    );
  }

  function NavSheet({ open, active, onClose, onNav }) {
    const { BottomSheet } = window;
    const nav = [
      { key: 'new', icon: 'edit', label: 'New Chat' },
      { key: 'memories', icon: 'clock', label: 'Memories' },
      { key: 'stories', icon: 'bookOpen', label: 'Stories' },
      { key: 'profile', icon: 'user', label: 'You' },
    ];
    return (
      <BottomSheet open={open} onClose={onClose} label="Navigate">
        {nav.map((n) => (
          <button key={n.key} onClick={() => onNav(n.key)} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '14px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
            color: active === n.key ? 'var(--hl-accent)' : 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500 }}>
            <span style={{ display: 'flex', color: active === n.key ? 'var(--hl-accent)' : 'var(--hl-muted)' }}><Icon name={n.icon} size={20} /></span>{n.label}
          </button>
        ))}
      </BottomSheet>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
