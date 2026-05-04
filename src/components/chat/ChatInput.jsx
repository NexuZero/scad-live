import React, { useState, useRef } from 'react';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.inputRow}>
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          placeholder={disabled ? 'Select a conversation to send a message' : 'Type a message... (Enter to send, Shift+Enter for new line)'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          aria-label="Message input"
        />
        <button
          style={{ ...styles.sendBtn, opacity: (!text.trim() || disabled) ? 0.4 : 1 }}
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <div style={styles.hint}>Press Enter to send · Shift+Enter for new line</div>
    </div>
  );
}

const styles = {
  root: { borderTop: '1px solid var(--border-default)', padding: '12px 16px', backgroundColor: 'var(--bg-secondary)' },
  inputRow: { display: 'flex', alignItems: 'flex-end', gap: '10px' },
  textarea: {
    flex: 1,
    padding: '10px 14px',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: '12px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'none',
    lineHeight: 1.5,
    minHeight: '40px',
    maxHeight: '120px',
    overflowY: 'auto',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  sendBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: '#4fc3f7',
    border: 'none',
    color: '#0a0f18',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'opacity 0.15s, transform 0.1s',
  },
  hint: { fontSize: '10px', color: 'var(--text-faint)', marginTop: '6px', paddingLeft: '2px' },
};
