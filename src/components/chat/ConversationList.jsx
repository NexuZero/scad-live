import React, { useState } from 'react';

const STATUS_DOT = {
  active: '#66bb6a',
  idle: '#ffa726',
  offline: '#ef5350',
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ name, size = 36 }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: `hsl(${hue},45%,35%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

export default function ConversationList({ conversations, selectedId, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = (conversations || []).filter(c =>
    c.participant_name.toLowerCase().includes(search.toLowerCase()) ||
    c.project_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Messages</span>
        {conversations && <span style={styles.headerCount}>{conversations.length}</span>}
      </div>

      <div style={styles.searchWrap}>
        <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          style={styles.searchInput}
          placeholder="Search conversations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search conversations"
        />
      </div>

      <div style={styles.list}>
        {filtered.length === 0 && (
          <div style={styles.empty}>No conversations found</div>
        )}
        {filtered.map(conv => (
          <button
            key={conv.id}
            style={{ ...styles.item, ...(selectedId === conv.id ? styles.itemActive : {}) }}
            onClick={() => onSelect(conv)}
            aria-pressed={selectedId === conv.id}
          >
            <div style={styles.avatarWrap}>
              <Avatar name={conv.participant_name} />
              <span style={{ ...styles.statusDot, backgroundColor: STATUS_DOT[conv.status] || '#667788' }} />
            </div>
            <div style={styles.itemBody}>
              <div style={styles.itemTop}>
                <span style={styles.itemName}>{conv.participant_name}</span>
                <span style={styles.itemTime}>{timeAgo(conv.last_message_at)}</span>
              </div>
              <div style={styles.itemBottom}>
                <span style={styles.itemPreview}>{conv.last_message}</span>
                {conv.unread_count > 0 && (
                  <span style={styles.unreadBadge}>{conv.unread_count}</span>
                )}
              </div>
              <span style={styles.itemProject}>{conv.project_name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border-default)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', borderBottom: '1px solid var(--border-default)' },
  headerTitle: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' },
  headerCount: { fontSize: '11px', color: 'var(--text-muted)', backgroundColor: 'var(--bg-hover)', padding: '2px 8px', borderRadius: '10px' },
  searchWrap: { position: 'relative', padding: '10px 12px' },
  searchIcon: { position: 'absolute', left: '22px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' },
  searchInput: { width: '100%', padding: '7px 10px 7px 32px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  list: { flex: 1, overflowY: 'auto' },
  empty: { padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' },
  item: { display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s', borderBottom: '1px solid var(--border-light)' },
  itemActive: { backgroundColor: 'rgba(79,195,247,0.08)', borderLeft: '3px solid #4fc3f7' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  statusDot: { position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', border: '2px solid var(--bg-secondary)' },
  itemBody: { flex: 1, minWidth: 0 },
  itemTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' },
  itemName: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemTime: { fontSize: '10px', color: 'var(--text-faint)', flexShrink: 0, marginLeft: '6px' },
  itemBottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  itemPreview: { fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  unreadBadge: { flexShrink: 0, marginLeft: '6px', backgroundColor: '#4fc3f7', color: '#0a0f18', fontSize: '10px', fontWeight: 700, borderRadius: '10px', padding: '1px 6px' },
  itemProject: { fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
