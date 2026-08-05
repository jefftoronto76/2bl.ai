/* story-canvas-nav.jsx — the left rail / sidebar that gets you to a story.
   Two widths: full (264) and rail (52). Stories stay reachable from the rail,
   because the rail is what you see once a story canvas is open. */
function SCSidebar({ rail, onToggle, floating, convs, activeConvId, onSelectConv, onNewChat, stories, activeStoryId, canvasOpen, storyCount, convCount, onOpenStory, onNewStory }) {
  const label = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
  const row = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 10, background: 'transparent', border: 'none', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background .15s' };
  const hov = (e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)');
  const unhov = (e) => (e.currentTarget.style.background = 'transparent');
  const mark = (n) => (
    <span title={n + (n === 1 ? ' memory' : ' memories')} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--hl-accent)' }}>
      <SIcon n="bookmark" s={11} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1 }}>{n}</span>
    </span>
  );

  return (
    <aside style={{
      width: rail ? 52 : 264, minWidth: rail ? 52 : 264, maxWidth: rail ? 52 : 264, flex: '0 0 auto', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--hl-surface-2)', borderRight: '1px solid var(--hl-border)', transition: 'width .28s cubic-bezier(.4,0,.2,1)',
      ...(floating ? { position: 'absolute', left: 0, top: 0, zIndex: 40, boxShadow: '14px 0 60px -18px var(--hl-shadow)' } : {}),
    }}>
      <div style={{ flexShrink: 0, boxSizing: 'border-box', height: 64, display: 'flex', alignItems: 'center', gap: 9, padding: rail ? '0 10px' : '0 14px' }}>
        <button onClick={onToggle} aria-label={rail ? 'Show menu' : 'Hide menu'} title={rail ? 'Show menu' : 'Hide menu'}
          style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', display: 'grid', placeItems: 'center' }}
          onMouseEnter={hov} onMouseLeave={unhov}><SIcon n="menu" s={18} /></button>
        {!rail && <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--hl-text)', whiteSpace: 'nowrap' }}>Heirloom</span>}
      </div>

      <div style={{ padding: rail ? '0 10px 8px' : '0 12px 8px' }}>
        <button onClick={onNewChat} style={rail ? { ...row, padding: 0, width: 32, height: 32, justifyContent: 'center' } : row} onMouseEnter={hov} onMouseLeave={unhov} title="New conversation" aria-label="New conversation">
          <SIcon n="plusCircle" s={17} style={{ color: 'var(--hl-accent)' }} />{!rail && 'New conversation'}
        </button>
      </div>

      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: rail ? '4px 10px 16px' : '4px 12px 16px' }}>
        {!rail && (
          <React.Fragment>
            <div style={{ ...label, padding: '10px 6px 8px' }}>Conversations</div>
            {convs.map((c) => {
              const n = convCount(c.id);
              return (
                <button key={c.id} onClick={() => onSelectConv(c.id)} onMouseEnter={hov} onMouseLeave={unhov}
                  style={{ ...row, fontWeight: c.id === activeConvId ? 600 : 400, background: c.id === activeConvId ? 'color-mix(in srgb, var(--hl-accent) 12%, transparent)' : 'transparent' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  {n > 0 && mark(n)}
                </button>
              );
            })}
          </React.Fragment>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: rail ? '10px 0 8px' : '18px 6px 10px', justifyContent: rail ? 'center' : 'flex-start' }}>
          <SIcon n="bookOpen" s={13} style={{ color: 'var(--hl-faint)' }} />
          {!rail && <span style={label}>Stories</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: rail ? 6 : 2, alignItems: rail ? 'center' : 'stretch' }}>
          {stories.map((st) => {
            const on = canvasOpen && st.id === activeStoryId;
            if (rail) return (
              <button key={st.id} onClick={() => onOpenStory(st.id)} title={`${st.name} — ${storyCount(st.id)} memories`} aria-label={`Open ${st.name}`}
                style={{ position: 'relative', width: 32, height: 32, borderRadius: 9, border: '1px solid', borderColor: on ? 'var(--hl-accent)' : 'transparent', background: on ? 'var(--hl-accent-soft)' : 'transparent', color: on ? 'var(--hl-accent)' : 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <SIcon n="bookOpen" s={16} />
                {storyCount(st.id) > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 99, background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-mono)', fontSize: 9, lineHeight: '14px', textAlign: 'center' }}>{storyCount(st.id)}</span>}
              </button>
            );
            return (
              <button key={st.id} onClick={() => onOpenStory(st.id)} title={st.tagline || st.name}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 8px 8px 10px', borderRadius: 9, border: 'none', background: on ? 'color-mix(in srgb, var(--hl-accent) 12%, transparent)' : 'transparent', color: on ? 'var(--hl-text)' : 'var(--hl-muted)', cursor: 'pointer', transition: 'background .18s, color .18s' }}
                onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 5%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; } }}
                onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; } }}>
                <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: 'var(--hl-accent)', opacity: on ? 1 : 0.55 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 15.5, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.name}</span>
                {storyCount(st.id) > 0 && mark(storyCount(st.id))}
              </button>
            );
          })}
          {!rail && (
            <button onClick={onNewStory} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-accent)', cursor: 'pointer', marginTop: 2 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-soft)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <SIcon n="plus" s={15} /><span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600 }}>New story</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
Object.assign(window, { SCSidebar });
