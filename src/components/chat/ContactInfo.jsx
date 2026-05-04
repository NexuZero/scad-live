import React from 'react';

const STATUS_COLORS = {
  active: { bg: 'var(--status-active-bg)', fg: 'var(--status-active-fg)', label: 'Active' },
  idle: { bg: 'var(--status-in-progress-bg)', fg: 'var(--status-in-progress-fg)', label: 'Idle' },
  offline: { bg: 'var(--status-paused-bg)', fg: 'var(--status-paused-fg)', label: 'Offline' },
};

function Avatar({ name, size = 56 }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: `hsl(${hue},45%,35%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff' }}>
      {initials}
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoIcon}>{icon}</span>
      <div>
        <div style={styles.infoLabel}>{label}</div>
        <div style={styles.infoValue}>{value || '—'}</div>
      </div>
    </div>
  );
}

export default function ContactInfo({ conversation, onCall }) {
  if (!conversation) {
    return (
      <div style={styles.empty}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <p style={styles.emptyText}>Select a conversation to view contact details</p>
      </div>
    );
  }

  const status = STATUS_COLORS[conversation.status] || STATUS_COLORS.offline;

  return (
    <div style={styles.root}>
      <div style={styles.avatarSection}>
        <Avatar name={conversation.participant_name} />
        <h3 style={styles.name}>{conversation.participant_name}</h3>
        <span style={{ ...styles.statusBadge, backgroundColor: status.bg, color: status.fg }}>
          {status.label}
        </span>
        <span style={styles.role}>{conversation.participant_role}</span>
      </div>

      <div style={styles.callRow}>
        <button style={styles.callBtn} onClick={() => onCall?.(conversation)} aria-label="Start voice call">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6.08 6.08l1.18-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          Call
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>Assignment</h4>
        <InfoRow
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>}
          label="Project"
          value={conversation.project_name}
        />
        <InfoRow
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
          label="ID"
          value={conversation.participant_id}
        />
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>Quick Actions</h4>
        <button style={styles.actionBtn}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          View on Map
        </button>
        <button style={styles.actionBtn}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          View Trajectory
        </button>
        <button style={styles.actionBtn}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          Field Report
        </button>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-default)', overflowY: 'auto' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px', opacity: 0.5 },
  emptyText: { fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' },
  avatarSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 16px', gap: '8px' },
  name: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, textAlign: 'center' },
  statusBadge: { fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '12px' },
  role: { fontSize: '11px', color: 'var(--text-muted)' },
  callRow: { padding: '0 16px 12px' },
  callBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '9px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  divider: { height: '1px', backgroundColor: 'var(--border-default)', margin: '0 16px' },
  section: { padding: '14px 16px' },
  sectionTitle: { fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', margin: '0 0 10px' },
  infoRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' },
  infoIcon: { color: 'var(--text-muted)', marginTop: '2px', flexShrink: 0 },
  infoLabel: { fontSize: '10px', color: 'var(--text-muted)', marginBottom: '1px' },
  infoValue: { fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 },
  actionBtn: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', marginBottom: '6px', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left' },
};
