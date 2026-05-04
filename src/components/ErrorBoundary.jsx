import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.icon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={styles.title}>Something went wrong</h2>
          <p style={styles.msg}>{this.props.fallbackLabel || 'This section encountered an error and could not load.'}</p>
          <p style={styles.detail}>{this.state.error?.message}</p>
          <button style={styles.btn} onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      </div>
    );
  }
}

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    height: '100%',
  },
  card: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
  },
  icon: { marginBottom: '16px' },
  title: { fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' },
  msg: { fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 },
  detail: { fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'monospace', margin: '0 0 20px', wordBreak: 'break-all' },
  btn: {
    padding: '8px 20px',
    backgroundColor: '#4fc3f7',
    color: '#0a0f18',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
