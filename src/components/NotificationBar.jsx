import React, { useState, useEffect, useCallback, useRef } from 'react';
import useWebSocket from '../hooks/useWebSocket';

const TYPE_CONFIG = {
  project_started:    { color: '#3b82f6', label: 'Started',   icon: '▶' },
  project_ending:     { color: '#f59e0b', label: 'Ending',    icon: '⚠' },
  project_completed:  { color: '#22c55e', label: 'Completed', icon: '✓' },
  researcher_offline: { color: '#ef4444', label: 'Offline',   icon: '!' },
  geofence_breach:    { color: '#ef4444', label: 'Breach',    icon: '⊘' },
  sample_milestone:   { color: '#14b8a6', label: 'Milestone', icon: '◈' },
  alert:              { color: '#ef4444', label: 'Alert',     icon: '!' },
  info:               { color: '#3b82f6', label: 'Info',      icon: 'ℹ' },
};

const DEMO_NOTIFICATIONS = [
  { id: 1, type: 'geofence_breach',    message: 'FW-008 exited Al Maryah project boundary',              ts: Date.now() - 3  * 60000 },
  { id: 2, type: 'researcher_offline', message: 'FW-012 offline for 18 min — Abu Dhabi Residential',      ts: Date.now() - 12 * 60000 },
  { id: 3, type: 'project_ending',     message: 'Project "Marina East" ends in 3 days',                  ts: Date.now() - 20 * 60000 },
  { id: 4, type: 'sample_milestone',   message: '"Khalifa City" reached 50% completion',                 ts: Date.now() - 35 * 60000 },
  { id: 5, type: 'project_started',    message: 'Project "Al Reem Survey" started',                      ts: Date.now() - 60 * 60000 },
  { id: 6, type: 'researcher_offline', message: 'FW-004 GPS signal lost — Al Ain Agricultural Survey',   ts: Date.now() - 75 * 60000 },
  { id: 7, type: 'geofence_breach',    message: 'FW-019 entered restricted zone — Khalifa City A',       ts: Date.now() - 90 * 60000 },
  { id: 8, type: 'sample_milestone',   message: '"Traffic Flow Analysis" 75% complete — 2,340 samples',  ts: Date.now() - 120 * 60000 },
];

let nextId = 100;

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBar() {
  const [notifications, setNotifications] = useState(DEMO_NOTIFICATIONS);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const barRef = useRef(null);

  const wsUrl = process.env.REACT_APP_API_BASE_URL
    ? `${process.env.REACT_APP_API_BASE_URL.replace(/^http/, 'ws')}/ws/notifications`
    : null;
  const { lastMessage } = useWebSocket(wsUrl, { enabled: !!wsUrl, maxRetries: 5 });

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage;
    if (!msg.type && !msg.message) return;
    setNotifications(prev => [{
      id: nextId++,
      type: msg.alert_type || msg.type || 'info',
      message: msg.message || msg.text || JSON.stringify(msg),
      ts: Date.now(),
    }, ...prev].slice(0, 50));
  }, [lastMessage]);

  // Simulate occasional new alerts in demo mode
  useEffect(() => {
    if (wsUrl) return;
    const alerts = [
      { type: 'researcher_offline', message: 'FW-021 offline — no GPS ping for 15 min' },
      { type: 'geofence_breach',    message: 'FW-003 crossed project boundary — Sector 7' },
      { type: 'sample_milestone',   message: '"Al Ain Survey" reached 25% completion' },
      { type: 'project_ending',     message: 'Project "Musaffah Industrial" ends in 2 days' },
    ];
    const id = setInterval(() => {
      const a = alerts[Math.floor(Math.random() * alerts.length)];
      setNotifications(prev => [{ id: nextId++, ...a, ts: Date.now() }, ...prev].slice(0, 50));
    }, 60000 + Math.random() * 30000);
    return () => clearInterval(id);
  }, [wsUrl]);

  const dismiss = useCallback((id, e) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => setNotifications([]), []);

  // Close drawer on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target) &&
          barRef.current && !barRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const criticals = notifications.filter(n => n.type === 'researcher_offline' || n.type === 'geofence_breach');
  const latest = notifications[0];
  const latestCfg = latest ? (TYPE_CONFIG[latest.type] || TYPE_CONFIG.info) : null;

  return (
    <div style={s.wrapper}>
      {/* ── Compact bar ── */}
      <div
        ref={barRef}
        style={{ ...s.bar, borderBottomColor: open ? 'var(--accent-blue)' : 'var(--border-default)' }}
        onClick={() => setOpen(v => !v)}
        role="button"
        aria-expanded={open}
        aria-label={`${notifications.length} notifications — click to view`}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(v => !v)}
      >
        {/* Bell + count */}
        <div style={s.bellWrap}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {notifications.length > 0 && (
            <span style={{ ...s.countBadge, backgroundColor: criticals.length > 0 ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
              {notifications.length > 99 ? '99+' : notifications.length}
            </span>
          )}
        </div>

        {/* Latest notification preview */}
        {latest && latestCfg && (
          <div style={s.previewRow}>
            <span style={{ ...s.previewDot, color: latestCfg.color }}>{latestCfg.icon}</span>
            <span style={s.previewText}>{latest.message}</span>
            <span style={s.previewTime}>{timeAgo(latest.ts)}</span>
          </div>
        )}
        {notifications.length === 0 && (
          <span style={s.emptyText}>No active alerts</span>
        )}

        {/* Type pills summary */}
        <div style={s.typePills}>
          {criticals.length > 0 && (
            <span style={{ ...s.typePill, backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              ⚠ {criticals.length} critical
            </span>
          )}
          {notifications.length > 1 && (
            <span style={s.viewAll}>View all {notifications.length} →</span>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ color: 'var(--text-faint)', transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* ── Expanded drawer ── */}
      {open && (
        <div ref={drawerRef} style={s.drawer} role="region" aria-label="All notifications">
          <div style={s.drawerHeader}>
            <span style={s.drawerTitle}>Alerts & Notifications</span>
            <div style={s.drawerActions}>
              {notifications.length > 0 && (
                <button style={s.clearBtn} onClick={dismissAll}>Clear all</button>
              )}
              <button style={s.drawerClose} onClick={() => setOpen(false)} aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <div style={s.drawerList}>
            {notifications.length === 0 && (
              <div style={s.emptyDrawer}>No notifications</div>
            )}
            {notifications.map(n => {
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
              return (
                <div key={n.id} style={{ ...s.notifRow, borderLeftColor: cfg.color }}>
                  <div style={s.notifLeft}>
                    <span style={{ ...s.notifIcon, color: cfg.color }}>{cfg.icon}</span>
                    <div style={s.notifBody}>
                      <span style={{ ...s.notifLabel, color: cfg.color }}>{cfg.label}</span>
                      <span style={s.notifMsg}>{n.message}</span>
                      <span style={s.notifTime}>{timeAgo(n.ts)}</span>
                    </div>
                  </div>
                  <button style={s.notifDismiss} onClick={e => dismiss(n.id, e)} aria-label="Dismiss">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { position: 'relative', flexShrink: 0, zIndex: 'var(--z-dropdown, 40)' },

  bar: {
    height: '36px',
    backgroundColor: 'var(--bg-sidebar)',
    borderBottom: '1px solid var(--border-default)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 14px',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'border-bottom-color 150ms ease-out',
  },

  bellWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  countBadge: {
    position: 'absolute',
    top: '-6px',
    right: '-8px',
    minWidth: '16px',
    height: '16px',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '9px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    fontFamily: 'var(--font-mono)',
  },

  previewRow: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    overflow: 'hidden',
  },
  previewDot: { fontSize: '10px', fontWeight: 700, flexShrink: 0 },
  previewText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-mono)',
  },
  previewTime: { fontSize: '10px', color: 'var(--text-faint)', flexShrink: 0 },
  emptyText: { fontSize: '11px', color: 'var(--text-faint)', flex: 1 },

  typePills: { display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 },
  typePill: {
    fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
    whiteSpace: 'nowrap',
  },
  viewAll: { fontSize: '10px', color: 'var(--accent-blue)', fontWeight: 600, whiteSpace: 'nowrap' },

  /* Drawer */
  drawer: {
    position: 'absolute',
    top: '36px',
    left: 0,
    right: 0,
    backgroundColor: 'var(--bg-sidebar)',
    border: '1px solid var(--border-default)',
    borderTop: 'none',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    maxHeight: '380px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'toastSlideIn 150ms ease-out',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-light)',
    flexShrink: 0,
  },
  drawerTitle: { fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' },
  drawerActions: { display: 'flex', gap: '8px', alignItems: 'center' },
  clearBtn: {
    fontSize: '11px', color: 'var(--accent-red)', background: 'none', border: 'none',
    cursor: 'pointer', padding: '2px 6px', borderRadius: '4px',
    fontFamily: 'var(--font-body)',
  },
  drawerClose: {
    width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: '5px', backgroundColor: 'transparent', color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  drawerList: { overflowY: 'auto', flex: 1 },
  emptyDrawer: { padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)' },
  notifRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-light)',
    borderLeft: '3px solid transparent',
    gap: '8px',
    transition: 'background-color 100ms',
  },
  notifLeft: { display: 'flex', gap: '10px', flex: 1, minWidth: 0 },
  notifIcon: { fontSize: '13px', fontWeight: 700, flexShrink: 0, marginTop: '1px' },
  notifBody: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  notifLabel: { fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' },
  notifMsg: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 },
  notifTime: { fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },
  notifDismiss: {
    flexShrink: 0, width: '20px', height: '20px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', border: 'none', borderRadius: '4px',
    backgroundColor: 'transparent', color: 'var(--text-faint)', cursor: 'pointer',
    marginTop: '1px',
  },
};
