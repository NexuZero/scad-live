/**
 * NotificationBar — Live Ops Ticker
 * A scrolling marquee ticker with real-time alert feed.
 * Plugin: ui-ux-pro-max › Real-Time Monitoring style
 *
 * Left:   LIVE badge + severity counters
 * Center: Auto-scrolling ticker (pauses on hover, loops seamlessly)
 * Right:  View-all drawer trigger
 *
 * New alerts: flash-in animation before joining the scroll stream.
 * Drawer: full chronological alert list with dismiss controls.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import useWebSocket from '../hooks/useWebSocket';

/* ── Alert type config ───────────────────────────────────────────── */
const TYPE = {
  researcher_offline: { label: 'OFFLINE',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   glyph: '●', tier: 'critical' },
  geofence_breach:    { label: 'BREACH',     color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   glyph: '⊘', tier: 'critical' },
  project_ending:     { label: 'ENDING',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  glyph: '⚠', tier: 'warning' },
  project_completed:  { label: 'COMPLETE',   color: '#22C55E', bg: 'rgba(34,197,94,0.1)',   glyph: '✓', tier: 'info' },
  project_started:    { label: 'STARTED',    color: '#4FC3F7', bg: 'rgba(79,195,247,0.1)',  glyph: '▶', tier: 'info' },
  sample_milestone:   { label: 'MILESTONE',  color: '#14B8A6', bg: 'rgba(20,184,166,0.1)',  glyph: '◈', tier: 'info' },
  alert:              { label: 'ALERT',      color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   glyph: '!', tier: 'critical' },
  info:               { label: 'INFO',       color: '#4FC3F7', bg: 'rgba(79,195,247,0.1)',  glyph: 'ℹ', tier: 'info' },
};

const DEMO_SEED = [
  { id: 1,  type: 'geofence_breach',    message: 'FW-008 exited Al Maryah Island boundary',          ts: Date.now() -  3 * 60000 },
  { id: 2,  type: 'researcher_offline', message: 'FW-012 offline — no GPS ping for 18 min',           ts: Date.now() - 10 * 60000 },
  { id: 3,  type: 'project_ending',     message: '"Marina East" project ends in 3 days',              ts: Date.now() - 20 * 60000 },
  { id: 4,  type: 'sample_milestone',   message: '"Khalifa City" reached 50% sample completion',      ts: Date.now() - 35 * 60000 },
  { id: 5,  type: 'project_started',    message: '"Al Reem Island Survey" started successfully',      ts: Date.now() - 60 * 60000 },
  { id: 6,  type: 'researcher_offline', message: 'FW-004 GPS signal lost — Al Ain Sector 3',          ts: Date.now() - 75 * 60000 },
  { id: 7,  type: 'geofence_breach',    message: 'FW-019 entered restricted zone — Khalifa City A',   ts: Date.now() - 90 * 60000 },
  { id: 8,  type: 'sample_milestone',   message: '"Traffic Flow Analysis" 75% complete — 2,340 pts',  ts: Date.now() - 120 * 60000 },
];

const LIVE_DEMO = [
  { type: 'researcher_offline', message: 'FW-021 offline — no heartbeat for 15 min' },
  { type: 'geofence_breach',    message: 'FW-003 crossed project boundary — Sector 7' },
  { type: 'sample_milestone',   message: '"Al Ain Survey" reached 25% completion' },
  { type: 'project_ending',     message: '"Musaffah Industrial" survey ends in 2 days' },
  { type: 'researcher_offline', message: 'FW-007 battery critical — coordinate swap' },
  { type: 'geofence_breach',    message: 'FW-015 outside assigned zone — Madinat Zayed' },
];

let _nextId = 100;
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/* ── Ticker Item ─────────────────────────────────────────────────── */
function TickerItem({ notif, isNew }) {
  const cfg = TYPE[notif.type] || TYPE.info;
  return (
    <span
      style={{
        ...tk.item,
        borderColor: cfg.color,
        backgroundColor: cfg.bg,
        animation: isNew ? 'alertFlash 0.8s ease-out' : undefined,
      }}
    >
      <span style={{ ...tk.glyph, color: cfg.color }}>{cfg.glyph}</span>
      <span style={{ ...tk.typeTag, color: cfg.color }}>{cfg.label}</span>
      <span style={tk.msg}>{notif.message}</span>
      <span style={tk.ts}>{timeAgo(notif.ts)}</span>
    </span>
  );
}

/* ── Drawer Alert Row ────────────────────────────────────────────── */
function DrawerRow({ notif, onDismiss }) {
  const cfg = TYPE[notif.type] || TYPE.info;
  return (
    <div style={{ ...dr.row, borderLeftColor: cfg.color }}>
      <span style={{ ...dr.glyph, color: cfg.color }}>{cfg.glyph}</span>
      <div style={dr.body}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ ...dr.tag, color: cfg.color }}>{cfg.label}</span>
          <span style={dr.ts}>{timeAgo(notif.ts)}</span>
        </div>
        <div style={dr.msg}>{notif.message}</div>
      </div>
      <button style={dr.dismiss} onClick={() => onDismiss(notif.id)} aria-label="Dismiss">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */
export function NotificationBar() {
  const [all, setAll] = useState(DEMO_SEED);
  const [newIds, setNewIds] = useState(new Set());
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const drawerRef = useRef(null);
  const barRef = useRef(null);

  /* WebSocket integration */
  const wsUrl = process.env.REACT_APP_API_BASE_URL
    ? `${process.env.REACT_APP_API_BASE_URL.replace(/^http/, 'ws')}/ws/notifications`
    : null;
  const { lastMessage } = useWebSocket(wsUrl, { enabled: !!wsUrl, maxRetries: 5 });

  useEffect(() => {
    if (!lastMessage) return;
    const n = { id: _nextId++, type: lastMessage.alert_type || lastMessage.type || 'info', message: lastMessage.message || lastMessage.text || '', ts: Date.now() };
    setAll(p => [n, ...p].slice(0, 60));
    setNewIds(p => new Set([...p, n.id]));
    setTimeout(() => setNewIds(p => { const s = new Set(p); s.delete(n.id); return s; }), 2000);
  }, [lastMessage]);

  /* Demo live alerts every 60-90s */
  useEffect(() => {
    if (wsUrl) return;
    const tick = () => {
      const a = LIVE_DEMO[Math.floor(Math.random() * LIVE_DEMO.length)];
      const n = { id: _nextId++, ...a, ts: Date.now() };
      setAll(p => [n, ...p].slice(0, 60));
      setNewIds(p => new Set([...p, n.id]));
      setTimeout(() => setNewIds(p => { const s = new Set(p); s.delete(n.id); return s; }), 2000);
    };
    const id = setInterval(tick, 60000 + Math.random() * 30000);
    return () => clearInterval(id);
  }, [wsUrl]);

  const dismiss = useCallback((id) => setAll(p => p.filter(n => n.id !== id)), []);
  const dismissAll = useCallback(() => setAll([]), []);

  /* Close drawer on outside click */
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (!drawerRef.current?.contains(e.target) && !barRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const criticals = all.filter(n => TYPE[n.type]?.tier === 'critical');
  const warnings  = all.filter(n => TYPE[n.type]?.tier === 'warning');

  /* Ticker animation duration — scales with content count */
  const animDuration = Math.max(20, all.length * 3);

  return (
    <div style={bar.wrapper}>
      {/* ── Ticker bar ── */}
      <div ref={barRef} style={{ ...bar.root, borderBottomColor: open ? 'rgba(79,195,247,0.4)' : 'rgba(255,255,255,0.06)' }}>

        {/* Left: LIVE badge + severity counts */}
        <div style={bar.left}>
          <div style={bar.livePill}>
            <span style={bar.liveDot} />
            <span style={bar.liveText}>LIVE</span>
          </div>
          {criticals.length > 0 && (
            <div style={bar.severityChip}>
              <span style={{ ...bar.severityDot, backgroundColor: '#EF4444', boxShadow: '0 0 6px #EF4444' }} />
              <span style={{ ...bar.severityCount, color: '#EF4444' }}>{criticals.length}</span>
            </div>
          )}
          {warnings.length > 0 && (
            <div style={bar.severityChip}>
              <span style={{ ...bar.severityDot, backgroundColor: '#F59E0B' }} />
              <span style={{ ...bar.severityCount, color: '#F59E0B' }}>{warnings.length}</span>
            </div>
          )}
          <div style={bar.divider} />
        </div>

        {/* Center: scrolling ticker */}
        <div
          style={bar.tickerWrap}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-label="Live alert ticker"
          role="marquee"
        >
          {all.length === 0 ? (
            <span style={bar.emptyTicker}>No active alerts — all systems operational</span>
          ) : (
            <div
              style={{
                ...bar.tickerTrack,
                animation: `ticker-left ${animDuration}s linear infinite`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
            >
              {/* Render twice for seamless loop */}
              {[...all, ...all].map((n, i) => (
                <TickerItem key={`${n.id}-${i}`} notif={n} isNew={newIds.has(n.id) && i < all.length} />
              ))}
            </div>
          )}
        </div>

        {/* Right: expand button */}
        <button
          ref={barRef}
          style={{ ...bar.viewAllBtn, ...(open ? bar.viewAllBtnActive : {}) }}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label="View all alerts"
        >
          <span style={bar.viewAllCount}>{all.length}</span>
          <span style={bar.viewAllLabel}>alerts</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      {/* ── Expanded drawer ── */}
      {open && (
        <div ref={drawerRef} style={dr.drawer} role="region" aria-label="All alerts">
          <div style={dr.header}>
            <div style={dr.headerLeft}>
              <span style={dr.title}>Alert Feed</span>
              {criticals.length > 0 && <span style={dr.critBadge}>{criticals.length} critical</span>}
            </div>
            <div style={dr.headerRight}>
              {all.length > 0 && <button style={dr.clearBtn} onClick={dismissAll}>Clear all</button>}
              <button style={dr.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div style={dr.list}>
            {all.length === 0 && <div style={dr.empty}>No active alerts</div>}
            {all.map(n => <DrawerRow key={n.id} notif={n} onDismiss={dismiss} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Bar styles ──────────────────────────────────────────────────── */
const bar = {
  wrapper: { position: 'relative', flexShrink: 0, zIndex: 'var(--z-dropdown,40)' },
  root: {
    height: '40px', display: 'flex', alignItems: 'center', gap: '0',
    backgroundColor: 'rgba(10,15,24,0.96)',
    borderBottom: '1px solid', backdropFilter: 'blur(8px)',
    transition: 'border-bottom-color 150ms ease-out',
    overflow: 'hidden',
  },
  left: { display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', flexShrink: 0 },
  livePill: {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '3px 8px', borderRadius: '4px',
    backgroundColor: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.25)',
  },
  liveDot: {
    width: '6px', height: '6px', borderRadius: '50%',
    backgroundColor: '#22C55E', animation: 'pulse 1.5s infinite',
    boxShadow: '0 0 8px #22C55E99', display: 'inline-block',
  },
  liveText: {
    fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em',
    color: '#22C55E', fontFamily: 'var(--font-mono)',
  },
  severityChip: { display: 'flex', alignItems: 'center', gap: '4px' },
  severityDot: { width: '7px', height: '7px', borderRadius: '50%', animation: 'pulse 2s infinite' },
  severityCount: { fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)' },
  divider: { width: '1px', height: '20px', backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: '4px' },

  /* Ticker */
  tickerWrap: {
    flex: 1, overflow: 'hidden', position: 'relative', height: '100%',
    display: 'flex', alignItems: 'center',
    maskImage: 'linear-gradient(to right, transparent 0%, black 60px, black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 60px, black calc(100% - 40px), transparent 100%)',
  },
  tickerTrack: {
    display: 'flex', alignItems: 'center', gap: '0',
    whiteSpace: 'nowrap', willChange: 'transform',
  },
  emptyTicker: {
    fontSize: '11px', color: 'rgba(148,163,184,0.5)',
    fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
    paddingLeft: '20px',
  },

  /* View all button */
  viewAllBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '0 14px', height: '100%', flexShrink: 0,
    border: 'none', borderLeft: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'transparent', cursor: 'pointer',
    transition: 'background-color 150ms ease-out',
  },
  viewAllBtnActive: { backgroundColor: 'rgba(79,195,247,0.08)' },
  viewAllCount: { fontSize: '13px', fontWeight: 700, color: '#4FC3F7', fontFamily: 'var(--font-mono)' },
  viewAllLabel: { fontSize: '10px', color: 'rgba(148,163,184,0.6)', letterSpacing: '0.04em' },
};

/* ── Ticker item styles ───────────────────────────────────────────── */
const tk = {
  item: {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '4px 12px', margin: '0 8px',
    borderRadius: '4px', border: '1px solid', borderLeftWidth: '3px',
    fontSize: '11px', cursor: 'default',
    fontFamily: 'var(--font-body)',
  },
  glyph: { fontSize: '10px', fontWeight: 800, flexShrink: 0 },
  typeTag: { fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0, fontFamily: 'var(--font-mono)' },
  msg: { color: 'rgba(248,250,252,0.85)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis' },
  ts: { fontSize: '9px', color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
};

/* ── Drawer styles ───────────────────────────────────────────────── */
const dr = {
  drawer: {
    position: 'absolute', top: '40px', left: 0, right: 0,
    backgroundColor: 'rgba(10,15,24,0.98)', backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    maxHeight: '360px', display: 'flex', flexDirection: 'column',
    animation: 'toastSlideIn 150ms ease-out',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  title: { fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' },
  critBadge: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', backgroundColor: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' },
  clearBtn: { fontSize: '11px', color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: 'var(--font-body)' },
  closeBtn: { width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '5px', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' },
  list: { overflowY: 'auto', flex: 1 },
  empty: { padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)' },
  row: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: '3px solid' },
  glyph: { fontSize: '13px', fontWeight: 700, flexShrink: 0, marginTop: '1px' },
  body: { flex: 1, minWidth: 0 },
  tag: { fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' },
  ts: { fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginLeft: '4px' },
  msg: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 },
  dismiss: { flexShrink: 0, width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '4px', backgroundColor: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', marginTop: '2px' },
};
