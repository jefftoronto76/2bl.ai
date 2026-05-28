'use client';

import {
  SquarePen,
  Search,
  MessageSquare,
  LayoutGrid,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { useChatStore } from '../store/chatStore';

const navItems = [
  { icon: SquarePen, label: 'New Chat' },
  { icon: Search, label: 'Search' },
  { icon: MessageSquare, label: 'Conversations' },
  { icon: LayoutGrid, label: 'Dashboard' },
];

export function Sidebar() {
  const { state, dispatch, recentSessions, loadSession } = useChatStore();
  const expanded = state.isSidebarExpanded;

  return (
    <aside
      className={`flex flex-col h-full bg-background border-r border-border transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
        expanded ? 'w-64' : 'w-12'
      }`}
    >
      <div className="flex flex-col flex-1 py-2">
        <div className={`flex items-center px-1.5 mb-2 ${expanded ? 'justify-end' : 'justify-center'}`}>
          <IconButton
            label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>

        <nav className="flex flex-col gap-0.5 px-1.5">
          {navItems.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                expanded ? 'w-full' : 'w-9 justify-center'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              {expanded && <span className="font-body text-base font-medium truncate">{label}</span>}
            </button>
          ))}
        </nav>

        {expanded && recentSessions.length > 0 && (
          <div className="mt-4 px-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={12} className="text-text-muted" />
              <span className="font-body text-base text-text-muted uppercase tracking-wider font-medium">
                Recent
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => loadSession(session.id)}
                  aria-current={state.sessionId === session.id ? 'true' : undefined}
                  className={`text-left px-2 py-1.5 rounded-lg font-body text-base transition-all duration-200 truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    state.sessionId === session.id
                      ? 'bg-text-primary/10 text-text-primary'
                      : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                  }`}
                >
                  {session.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
