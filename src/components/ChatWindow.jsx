import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchChatHistory } from '../api';

/**
 * Chat window bound to a specific researcher.
 * Sends and receives messages via the useWebSocket hook passed as ws prop.
 *
 * Props:
 *  - researcher: { employee_id, researcher_name }
 *  - ws: { isConnected, lastMessage, sendMessage } from useWebSocket
 */
export default function ChatWindow({ researcher, ws }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const prevResearcherRef = useRef(null);

  // Load chat history when researcher changes
  useEffect(() => {
    if (!researcher?.employee_id) return;
    if (prevResearcherRef.current === researcher.employee_id) return;
    prevResearcherRef.current = researcher.employee_id;

    let cancelled = false;
    setLoadingHistory(true);
    fetchChatHistory(researcher.employee_id)
      .then((history) => {
        if (!cancelled) setMessages(history || []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => { cancelled = true; };
  }, [researcher?.employee_id]);

  // Append incoming messages
  useEffect(() => {
    if (!ws.lastMessage) return;
    const msg = ws.lastMessage;
    if (msg.type === 'chat_message' && msg.from === researcher?.employee_id) {
      setMessages((prev) => [...prev, {
        sender_id: msg.from,
        message: msg.message,
        timestamp: msg.timestamp || new Date().toISOString(),
      }]);
    }
  }, [ws.lastMessage, researcher?.employee_id]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !researcher?.employee_id) return;

    const sent = ws.sendMessage({
      type: 'chat_message',
      to: researcher.employee_id,
      message: text,
      timestamp: new Date().toISOString(),
    });

    if (sent) {
      setMessages((prev) => [...prev, {
        sender_id: 'me',
        message: text,
        timestamp: new Date().toISOString(),
      }]);
      setDraft('');
    }
  }, [draft, researcher?.employee_id, ws]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <strong>Chat</strong>
        <span style={styles.status}>
          {ws.isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div style={styles.messages}>
        {loadingHistory && <div style={styles.loading}>Loading history...</div>}
        {messages.map((msg, i) => {
          const isMe = msg.sender_id === 'me';
          return (
            <div key={i} style={isMe ? styles.msgRight : styles.msgLeft}>
              <div style={isMe ? styles.bubbleRight : styles.bubbleLeft}>
                {msg.message}
              </div>
              <div style={styles.timestamp}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputRow}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          style={styles.textarea}
          disabled={!ws.isConnected}
        />
        <button
          onClick={handleSend}
          disabled={!ws.isConnected || !draft.trim()}
          style={styles.sendBtn}
        >
          Send
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    borderTop: '1px solid #eee',
    flex: 1,
    minHeight: '200px',
    maxHeight: '350px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    fontSize: '13px',
    borderBottom: '1px solid #f0f0f0',
  },
  status: { fontSize: '11px', color: '#888' },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  loading: {
    textAlign: 'center',
    color: '#999',
    fontSize: '12px',
    padding: '12px',
  },
  msgLeft: { alignSelf: 'flex-start', maxWidth: '75%' },
  msgRight: { alignSelf: 'flex-end', maxWidth: '75%' },
  bubbleLeft: {
    padding: '6px 10px',
    backgroundColor: '#f0f0f0',
    borderRadius: '12px 12px 12px 2px',
    fontSize: '13px',
    wordBreak: 'break-word',
  },
  bubbleRight: {
    padding: '6px 10px',
    backgroundColor: '#1976d2',
    color: '#fff',
    borderRadius: '12px 12px 2px 12px',
    fontSize: '13px',
    wordBreak: 'break-word',
  },
  timestamp: {
    fontSize: '10px',
    color: '#aaa',
    marginTop: '2px',
    paddingLeft: '4px',
  },
  inputRow: {
    display: 'flex',
    padding: '8px 12px',
    gap: '8px',
    borderTop: '1px solid #f0f0f0',
  },
  textarea: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '13px',
    resize: 'none',
    fontFamily: 'inherit',
  },
  sendBtn: {
    padding: '6px 16px',
    backgroundColor: '#1976d2',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 600,
  },
};
