import React, { useEffect, useRef } from 'react';
import { getStoredName } from '../../api';

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateSeparator(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function shouldShowDateSeparator(messages, index) {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].timestamp).toDateString();
  const cur = new Date(messages[index].timestamp).toDateString();
  return prev !== cur;
}

export default function MessageThread({ messages, loading }) {
  const bottomRef = useRef(null);
  const myName = getStoredName() || 'Operations';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.loadingDots}>
          <span style={{ ...styles.dot, animationDelay: '0s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
        </div>
        <p style={styles.loadingText}>Loading messages...</p>
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div style={styles.empty}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p style={styles.emptyText}>No messages yet. Start the conversation.</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {messages.map((msg, idx) => {
        const isMine = msg.sender_id === 'admin';
        return (
          <React.Fragment key={msg.id}>
            {shouldShowDateSeparator(messages, idx) && (
              <div style={styles.dateSep}>
                <div style={styles.dateLine} />
                <span style={styles.dateLabel}>{dateSeparator(msg.timestamp)}</span>
                <div style={styles.dateLine} />
              </div>
            )}
            <div style={{ ...styles.msgRow, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...styles.bubble, ...(isMine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                {!isMine && <span style={styles.senderName}>{msg.sender_name}</span>}
                <p style={styles.msgText}>{msg.content}</p>
                <span style={styles.msgTime}>{timeLabel(msg.timestamp)}</span>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

const styles = {
  root: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' },
  loading: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  loadingDots: { display: 'flex', gap: '6px' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4fc3f7', animation: 'pulse 1.2s ease-in-out infinite' },
  loadingText: { fontSize: '13px', color: 'var(--text-muted)' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.5 },
  emptyText: { fontSize: '13px', color: 'var(--text-muted)' },
  dateSep: { display: 'flex', alignItems: 'center', gap: '12px', margin: '12px 0' },
  dateLine: { flex: 1, height: '1px', backgroundColor: 'var(--border-default)' },
  dateLabel: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', padding: '0 4px' },
  msgRow: { display: 'flex', marginBottom: '6px' },
  bubble: { maxWidth: '70%', padding: '8px 12px', borderRadius: '14px', position: 'relative' },
  bubbleMine: { backgroundColor: '#1565c0', color: '#e8eaf0', borderBottomRightRadius: '4px' },
  bubbleTheirs: { backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderBottomLeftRadius: '4px' },
  senderName: { display: 'block', fontSize: '10px', fontWeight: 600, color: '#4fc3f7', marginBottom: '3px' },
  msgText: { fontSize: '13px', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  msgTime: { display: 'block', fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right' },
};
