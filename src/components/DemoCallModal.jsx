import React, { useState, useEffect, useRef } from 'react';

/* ── Demo Call Modal ─────────────────────────────────────────────────────────
   States: calling → connected → ended
   Usage:
     <DemoCallModal
       researcher={{ name, name_ar, id, role, color }}
       onClose={() => setCallTarget(null)}
     />
──────────────────────────────────────────────────────────────────────────── */

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function avatarColor(name = '') {
  const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue},45%,38%)`;
}

export default function DemoCallModal({ researcher, onClose }) {
  const [phase, setPhase]     = useState('calling'); // calling | connected | ended
  const [duration, setDuration] = useState(0);
  const [muted, setMuted]     = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const timerRef = useRef(null);

  // Auto-connect after 2.5 seconds
  useEffect(() => {
    const t = setTimeout(() => setPhase('connected'), 2500);
    return () => clearTimeout(t);
  }, []);

  // Duration counter while connected
  useEffect(() => {
    if (phase !== 'connected') return;
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleEnd = () => {
    clearInterval(timerRef.current);
    setPhase('ended');
    setTimeout(onClose, 1800);
  };

  const color = researcher?.color || avatarColor(researcher?.name || '');

  return (
    <div style={s.overlay} role="dialog" aria-modal="true" aria-label="Demo call">
      <div style={s.modal}>
        {/* Pulsing rings — only while calling */}
        {phase === 'calling' && (
          <>
            <div style={{ ...s.ring, animationDelay: '0s',   width: 120, height: 120 }} />
            <div style={{ ...s.ring, animationDelay: '0.6s', width: 150, height: 150 }} />
            <div style={{ ...s.ring, animationDelay: '1.2s', width: 180, height: 180 }} />
          </>
        )}

        {/* Avatar */}
        <div style={{ ...s.avatar, backgroundColor: color, boxShadow: `0 0 0 4px ${color}40` }}>
          {getInitials(researcher?.name)}
        </div>

        {/* Name */}
        <div style={s.name}>{researcher?.name || 'Unknown'}</div>
        {researcher?.name_ar && <div style={s.nameAr}>{researcher.name_ar}</div>}
        <div style={s.meta}>{researcher?.id} · {researcher?.role || 'Field Worker'}</div>

        {/* Status line */}
        <div style={{ ...s.status, color: phase === 'connected' ? 'var(--accent-green)' : phase === 'ended' ? 'var(--text-muted)' : 'var(--accent-blue)' }}>
          {phase === 'calling'   && <><span style={s.pulseDot} />Calling…</>}
          {phase === 'connected' && <><span style={{ ...s.pulseDot, backgroundColor: 'var(--accent-green)' }} />{formatDuration(duration)}</>}
          {phase === 'ended'     && 'Call ended'}
        </div>

        {/* Controls */}
        {phase !== 'ended' && (
          <div style={s.controls}>
            <button
              style={{ ...s.ctrlBtn, ...(muted ? s.ctrlBtnActive : {}) }}
              onClick={() => setMuted(v => !v)}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
              <span style={s.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              style={s.endBtn}
              onClick={handleEnd}
              aria-label="End call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.42 12 19.79 19.79 0 0 1 1.35 3.35 2 2 0 0 1 3.32 1.18l3 .01a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.3 8.9"/>
                <line x1="23" y1="1" x2="1" y2="23"/>
              </svg>
              <span style={s.ctrlLabel}>End</span>
            </button>

            <button
              style={{ ...s.ctrlBtn, ...(speaker ? {} : s.ctrlBtnActive) }}
              onClick={() => setSpeaker(v => !v)}
              aria-label={speaker ? 'Mute speaker' : 'Enable speaker'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {speaker ? (
                  <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>
                ) : (
                  <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>
                )}
              </svg>
              <span style={s.ctrlLabel}>{speaker ? 'Speaker' : 'Muted'}</span>
            </button>
          </div>
        )}

        {/* Demo label */}
        <div style={s.demoTag}>DEMO CALL — SIMULATION</div>
      </div>

      <style>{`
        @keyframes callRing {
          0%   { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(2,6,23,0.88)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 'var(--z-modal, 100)',
  },
  modal: {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '48px 40px 36px',
    background: 'linear-gradient(160deg, #0F172A 0%, #020617 100%)',
    borderRadius: '24px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
    minWidth: '320px',
    gap: '10px',
  },
  ring: {
    position: 'absolute',
    borderRadius: '50%',
    border: '2px solid rgba(79,195,247,0.35)',
    animation: 'callRing 2s ease-out infinite',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  avatar: {
    width: '80px', height: '80px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', fontWeight: 800, color: '#fff',
    fontFamily: 'var(--font-mono)',
    marginBottom: '8px',
    position: 'relative', zIndex: 1,
  },
  name: { fontSize: '20px', fontWeight: 700, color: '#F8FAFC', textAlign: 'center' },
  nameAr: { fontSize: '14px', color: 'rgba(148,163,184,0.7)', direction: 'rtl', textAlign: 'center' },
  meta: { fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '4px' },
  status: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-mono)',
    minHeight: '24px',
  },
  pulseDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    backgroundColor: 'var(--accent-blue)',
    display: 'inline-block',
    animation: 'pulse 1.5s infinite',
  },
  controls: {
    display: 'flex', gap: '16px', marginTop: '16px', alignItems: 'flex-end',
  },
  ctrlBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    width: '64px', height: '64px', borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#F8FAFC', cursor: 'pointer',
    justifyContent: 'center',
    transition: 'background-color 150ms ease-out',
    fontFamily: 'var(--font-body)',
  },
  ctrlBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.4)',
    color: '#F87171',
  },
  endBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    width: '72px', height: '72px', borderRadius: '50%',
    border: 'none',
    backgroundColor: '#DC2626',
    color: '#fff', cursor: 'pointer',
    justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(220,38,38,0.5)',
    transition: 'transform 100ms, box-shadow 100ms',
    fontFamily: 'var(--font-body)',
  },
  ctrlLabel: { fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', lineHeight: 1 },
  demoTag: {
    marginTop: '20px',
    fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
    color: 'rgba(148,163,184,0.3)', textTransform: 'uppercase',
    fontFamily: 'var(--font-mono)',
  },
};
