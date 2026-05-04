import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';

const DEMO_ACCOUNTS = [
  {
    label: 'Admin',
    name: 'Admin User',
    email: 'admin@scad.ae',
    role: 'admin',
    description: 'Full system access · User management · All projects',
    color: '#4FC3F7',
  },
  {
    label: 'Project Manager',
    name: 'Fatima Al Zaabi',
    email: 'fatima@scad.ae',
    role: 'project_manager',
    description: 'Portfolio view · Project tracking · Team chat',
    color: '#22C55E',
  },
  {
    label: 'Supervisor',
    name: 'Mohammed Al Hammadi',
    email: 'mohammed@scad.ae',
    role: 'supervisor',
    description: 'Tasks · Chat · Field researcher monitoring',
    color: '#F59E0B',
  },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const isDev = !process.env.REACT_APP_API_BASE_URL;

  const quickLogin = (account) => {
    localStorage.setItem('access_token', 'dev_token');
    localStorage.setItem('user_role', account.role);
    localStorage.setItem('user_name', account.name);
    localStorage.setItem('user_email', account.email);
    navigate('/', { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.wrapper}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoRow}>
          <div style={s.logoIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4FC3F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
            </svg>
          </div>
          <div>
            <div style={s.logoTitle}><span style={s.logoScad}>SCAD</span><span style={s.logoMap}>MAP</span></div>
            <div style={s.logoSub}>Field Operations Center</div>
          </div>
        </div>

        {/* Demo quick login — only in dev/demo mode */}
        {isDev && (
          <div style={s.demoSection}>
            <div style={s.demoLabel}>Quick Demo Access</div>
            <div style={s.demoGrid}>
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.role}
                  style={{ ...s.demoBtn, borderColor: acc.color }}
                  onClick={() => quickLogin(acc)}
                  type="button"
                >
                  <div style={{ ...s.demoBtnRole, color: acc.color }}>{acc.label}</div>
                  <div style={s.demoBtnName}>{acc.name}</div>
                  <div style={s.demoBtnDesc}>{acc.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        {isDev && <div style={s.orRow}><span style={s.orLine} /><span style={s.orText}>or sign in manually</span><span style={s.orLine} /></div>}

        {/* Manual login form */}
        <form onSubmit={handleSubmit} style={s.form}>
          <h2 style={s.heading}>Sign In</h2>

          {error && (
            <div style={s.error} role="alert">{error}</div>
          )}

          <label style={s.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required={!isDev}
              autoComplete="email"
              style={s.input}
              placeholder="user@scad.ae"
            />
          </label>

          <label style={s.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!isDev}
              autoComplete="current-password"
              style={s.input}
              placeholder="••••••••"
            />
          </label>

          <button type="submit" disabled={loading} style={{ ...s.button, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={s.footer}>Abu Dhabi Statistics Centre · Secure Operations Platform</div>
      </div>
    </div>
  );
}

const s = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#020617',
    padding: '24px',
    fontFamily: 'var(--font-body)',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: '#0F172A',
    borderRadius: '16px',
    border: '1px solid #334155',
    padding: '32px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  },

  /* Logo */
  logoRow: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' },
  logoIcon: {
    width: '44px', height: '44px', borderRadius: '12px',
    backgroundColor: 'rgba(79,195,247,0.1)', border: '1px solid rgba(79,195,247,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  logoTitle: { display: 'flex', alignItems: 'baseline', gap: '4px' },
  logoScad: { fontSize: '20px', fontWeight: 800, color: '#4FC3F7', letterSpacing: '1px', fontFamily: 'var(--font-mono)' },
  logoMap:  { fontSize: '16px', fontWeight: 500, color: 'rgba(148,163,184,0.6)', letterSpacing: '2px', fontFamily: 'var(--font-mono)' },
  logoSub:  { fontSize: '11px', color: '#475569', marginTop: '2px', letterSpacing: '0.5px' },

  /* Demo section */
  demoSection: { marginBottom: '20px' },
  demoLabel: {
    fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: '10px',
  },
  demoGrid: { display: 'flex', flexDirection: 'column', gap: '8px' },
  demoBtn: {
    textAlign: 'left', padding: '12px 14px', borderRadius: '10px',
    border: '1px solid', backgroundColor: 'rgba(255,255,255,0.03)',
    cursor: 'pointer', transition: 'background-color 150ms ease-out',
    fontFamily: 'var(--font-body)',
  },
  demoBtnRole: { fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '2px' },
  demoBtnName: { fontSize: '13px', fontWeight: 600, color: '#F8FAFC', marginBottom: '2px' },
  demoBtnDesc: { fontSize: '11px', color: '#64748B' },

  /* Or divider */
  orRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' },
  orLine: { flex: 1, height: '1px', backgroundColor: '#1E293B' },
  orText: { fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', letterSpacing: '0.05em' },

  /* Form */
  form: { display: 'flex', flexDirection: 'column', gap: '0' },
  heading: { margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: '#F8FAFC' },
  label: {
    display: 'flex', flexDirection: 'column', gap: '5px',
    fontSize: '12px', fontWeight: 600, color: '#94A3B8',
    marginBottom: '14px',
  },
  input: {
    padding: '10px 12px', backgroundColor: '#020617',
    border: '1px solid #334155', borderRadius: '8px',
    fontSize: '14px', color: '#F8FAFC', outline: 'none',
    fontFamily: 'var(--font-body)',
    transition: 'border-color 150ms ease-out',
  },
  button: {
    padding: '11px', backgroundColor: '#4FC3F7', color: '#020617',
    border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', marginTop: '4px', fontFamily: 'var(--font-body)',
    transition: 'opacity 150ms ease-out',
  },
  error: {
    padding: '10px 12px', marginBottom: '14px',
    backgroundColor: 'rgba(239,68,68,0.1)', color: '#F87171',
    border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px',
    fontSize: '12px',
  },
  footer: {
    marginTop: '24px', fontSize: '10px', color: '#334155',
    textAlign: 'center', letterSpacing: '0.05em',
  },
};
