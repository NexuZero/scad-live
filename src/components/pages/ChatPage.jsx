import React, { useState, useEffect, useCallback } from 'react';
import ConversationList from '../chat/ConversationList';
import MessageThread from '../chat/MessageThread';
import ChatInput from '../chat/ChatInput';
import ContactInfo from '../chat/ContactInfo';
import DemoCallModal from '../DemoCallModal';
import { fetchConversations, fetchMessages, sendChatMessage } from '../../api';

export default function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [callTarget, setCallTarget] = useState(null);

  useEffect(() => {
    fetchConversations()
      .then(data => { setConversations(data || []); setLoadingConvs(false); })
      .catch(() => setLoadingConvs(false));
  }, []);

  const handleSelectConv = useCallback(async (conv) => {
    setSelectedConv(conv);
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const data = await fetchMessages(conv.id);
      setMessages(data || []);
      // Clear unread count
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const handleSend = useCallback(async (text) => {
    if (!selectedConv || sending) return;
    setSending(true);
    const optimistic = { id: `opt-${Date.now()}`, sender_id: 'admin', sender_name: 'Operations', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    try {
      const saved = await sendChatMessage(selectedConv.id, text);
      setMessages(prev => prev.map(m => m.id === optimistic.id ? saved : m));
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, last_message: text, last_message_at: new Date().toISOString() } : c));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }, [selectedConv, sending]);

  if (loadingConvs) {
    return <div style={styles.loadingWrap}><span style={styles.loadingText}>Loading conversations...</span></div>;
  }

  return (
    <div style={styles.root}>
      {/* Demo call modal */}
      {callTarget && (
        <DemoCallModal
          researcher={{ name: callTarget.participant_name, name_ar: callTarget.participant_name_ar, id: callTarget.participant_id, role: callTarget.participant_role }}
          onClose={() => setCallTarget(null)}
        />
      )}

      <div style={styles.leftCol}>
        <ConversationList
          conversations={conversations}
          selectedId={selectedConv?.id}
          onSelect={handleSelectConv}
        />
      </div>

      <div style={styles.centerCol}>
        {selectedConv ? (
          <>
            <div style={styles.chatHeader}>
              <div style={styles.chatHeaderInfo}>
                <span style={styles.chatHeaderName}>{selectedConv.participant_name}</span>
                <span style={styles.chatHeaderSub}>{selectedConv.participant_role} · {selectedConv.project_name}</span>
              </div>
              <div style={styles.chatHeaderActions}>
                <button
                  style={styles.callBtn}
                  onClick={() => setCallTarget(selectedConv)}
                  aria-label="Start call"
                  title="Start demo call"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.36 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.1 2.18l3-.01a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z"/>
                  </svg>
                  Call
                </button>
                <div style={{ ...styles.onlinePill, backgroundColor: selectedConv.status === 'active' ? 'var(--status-active-bg)' : 'var(--status-paused-bg)', color: selectedConv.status === 'active' ? 'var(--status-active-fg)' : 'var(--status-paused-fg)' }}>
                  {selectedConv.status === 'active' ? 'Online' : selectedConv.status}
                </div>
              </div>
            </div>
            <div style={styles.threadWrap}>
              <MessageThread messages={messages} loading={loadingMsgs} />
            </div>
            <ChatInput onSend={handleSend} disabled={sending} />
          </>
        ) : (
          <div style={styles.noConv}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={styles.noConvText}>Select a conversation to start messaging</p>
          </div>
        )}
      </div>

      <div style={styles.rightCol}>
        <ContactInfo conversation={selectedConv} />
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'grid', gridTemplateColumns: '280px 1fr 260px', height: 'calc(100vh - 52px)', overflow: 'hidden' },
  leftCol: { overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  centerCol: { display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' },
  rightCol: { overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  loadingWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  loadingText: { color: 'var(--text-muted)', fontSize: '14px' },
  chatHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-secondary)', flexShrink: 0 },
  chatHeaderInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  chatHeaderName: { fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' },
  chatHeaderSub: { fontSize: '11px', color: 'var(--text-muted)' },
  chatHeaderActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  callBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '7px 14px', backgroundColor: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px',
    color: '#22C55E', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    transition: 'background-color 150ms ease-out',
    fontFamily: 'var(--font-body)',
  },
  onlinePill: { fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', textTransform: 'capitalize' },
  threadWrap: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  noConv: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', opacity: 0.5 },
  noConvText: { fontSize: '14px', color: 'var(--text-muted)' },
};
