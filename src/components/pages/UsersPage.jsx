import React, { useState, useEffect, useCallback } from 'react';
import { fetchUsers, createUser, updateUser, deleteUser, getStoredRole } from '../../api';

const ROLES = ['admin', 'project_manager', 'supervisor', 'viewer'];
const ROLE_COLORS = {
  admin: { bg: 'var(--status-paused-bg)', fg: 'var(--status-paused-fg)' },
  project_manager: { bg: 'var(--status-completed-bg)', fg: 'var(--status-completed-fg)' },
  supervisor: { bg: 'var(--status-in-progress-bg)', fg: 'var(--status-in-progress-fg)' },
  viewer: { bg: 'var(--status-setup-bg)', fg: 'var(--status-setup-fg)' },
};

const COUNTRY_FLAGS = { AE: '🇦🇪', SA: '🇸🇦', EG: '🇪🇬', IN: '🇮🇳', PK: '🇵🇰', PH: '🇵🇭', BD: '🇧🇩', NP: '🇳🇵', LB: '🇱🇧', JO: '🇯🇴', GB: '🇬🇧', US: '🇺🇸' };
const COUNTRIES = Object.entries({ AE: 'UAE', SA: 'Saudi Arabia', EG: 'Egypt', IN: 'India', PK: 'Pakistan', PH: 'Philippines', BD: 'Bangladesh', NP: 'Nepal', LB: 'Lebanon', JO: 'Jordan', GB: 'UK', US: 'USA' });

function timeAgo(iso) {
  if (!iso) return 'Never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ name, size = 36 }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: `hsl(${hue},40%,35%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>;
}

function UserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', role: user?.role || 'viewer', country_code: user?.country_code || 'AE', is_active: user?.is_active ?? true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
    setSaving(true);
    try { await onSave(form); } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={uStyles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={uStyles.modal} role="dialog" aria-modal="true">
        <div style={uStyles.mHeader}>
          <h2 style={uStyles.mTitle}>{user ? 'Edit User' : 'Add User'}</h2>
          <button style={uStyles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSave} style={uStyles.mForm}>
          <div style={uStyles.field}><label style={uStyles.label}>Full Name *</label><input style={uStyles.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" required /></div>
          <div style={uStyles.field}><label style={uStyles.label}>Email *</label><input style={uStyles.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@scad.ae" required /></div>
          <div style={uStyles.row}>
            <div style={{ ...uStyles.field, flex: 1 }}>
              <label style={uStyles.label}>Role</label>
              <select style={uStyles.select} value={form.role} onChange={e => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div style={{ ...uStyles.field, flex: 1 }}>
              <label style={uStyles.label}>Country</label>
              <select style={uStyles.select} value={form.country_code} onChange={e => set('country_code', e.target.value)}>
                {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{COUNTRY_FLAGS[code]} {name}</option>)}
              </select>
            </div>
          </div>
          {user && (
            <div style={uStyles.toggleRow}>
              <span style={uStyles.label}>Account Active</span>
              <button type="button" style={{ ...uStyles.toggle, backgroundColor: form.is_active ? '#4fc3f7' : 'var(--border-default)' }} onClick={() => set('is_active', !form.is_active)} aria-pressed={form.is_active}>
                <span style={{ ...uStyles.toggleKnob, transform: form.is_active ? 'translateX(16px)' : 'translateX(0)' }} />
              </button>
            </div>
          )}
          {error && <div style={uStyles.errorMsg} role="alert">{error}</div>}
          <div style={uStyles.mFooter}>
            <button type="button" style={uStyles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={uStyles.saveBtn} disabled={saving}>{saving ? 'Saving...' : user ? 'Save Changes' : 'Add User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const currentRole = getStoredRole();

  if (currentRole !== 'admin') {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Access restricted to administrators.</div>;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await fetchUsers()); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (formData) => {
    if (editUser) {
      const updated = await updateUser(editUser.id, formData);
      setUsers(prev => prev.map(u => u.id === editUser.id ? updated : u));
    } else {
      const created = await createUser(formData);
      setUsers(prev => [...prev, created]);
    }
    setShowModal(false);
    setEditUser(null);
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user "${user.name}"? This cannot be undone.`)) return;
    await deleteUser(user.id);
    setUsers(prev => prev.filter(u => u.id !== user.id));
  };

  const handleToggleActive = async (user) => {
    const updated = await updateUser(user.id, { is_active: !user.is_active });
    setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = ROLES.reduce((acc, r) => { acc[r] = users.filter(u => u.role === r).length; return acc; }, {});

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>User Management</h1>
          <p style={styles.subtitle}>{users.length} users · {users.filter(u => u.is_active).length} active</p>
        </div>
        <button style={styles.addBtn} onClick={() => { setEditUser(null); setShowModal(true); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add User
        </button>
      </div>

      {/* Role KPI chips */}
      <div style={styles.chipRow}>
        {[['All', ''], ...ROLES.map(r => [r.replace('_', ' '), r])].map(([label, val]) => {
          const rc = ROLE_COLORS[val];
          return (
            <button key={val} style={{ ...styles.chip, ...(roleFilter === val ? { backgroundColor: rc?.bg || '#4fc3f7', color: rc?.fg || '#0a0f18', borderColor: 'transparent' } : {}) }} onClick={() => setRoleFilter(val)}>
              {label} {val ? <b style={{ marginLeft: 4 }}>{roleCounts[val]}</b> : <b style={{ marginLeft: 4 }}>{users.length}</b>}
            </button>
          );
        })}
      </div>

      <div style={styles.filterRow}>
        <div style={styles.searchWrap}>
          <svg style={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input style={styles.searchInput} placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.loading}>Loading users...</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>No users match your search.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Country</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Last Login</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => {
                const rc = ROLE_COLORS[user.role] || ROLE_COLORS.viewer;
                return (
                  <tr key={user.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={user.name} />
                        <div>
                          <div style={styles.userName}>{user.name}</div>
                          <div style={styles.userEmail}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, backgroundColor: rc.bg, color: rc.fg }}>{user.role.replace('_', ' ')}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.cellText}>{COUNTRY_FLAGS[user.country_code] || '🌐'} {user.country_code}</span>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={{ ...styles.activePill, backgroundColor: user.is_active ? 'var(--status-active-bg)' : 'var(--status-paused-bg)', color: user.is_active ? 'var(--status-active-fg)' : 'var(--status-paused-fg)', cursor: 'pointer' }}
                        onClick={() => handleToggleActive(user)}
                        title={`Click to ${user.is_active ? 'deactivate' : 'activate'}`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={styles.td}><span style={styles.cellText}>{timeAgo(user.last_login)}</span></td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={styles.actionBtn} onClick={() => { setEditUser(user); setShowModal(true); }} title="Edit user">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button style={{ ...styles.actionBtn, color: 'var(--accent-red)' }} onClick={() => handleDelete(user)} title="Delete user">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <UserModal
          user={editUser}
          onClose={() => { setShowModal(false); setEditUser(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

const styles = {
  root: { padding: '20px 24px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle: { fontSize: '12px', color: 'var(--text-muted)', margin: 0 },
  addBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#4fc3f7', color: '#0a0f18', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  chipRow: { display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' },
  chip: { padding: '5px 14px', borderRadius: '20px', border: '1px solid var(--border-default)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize' },
  filterRow: { marginBottom: '12px' },
  searchWrap: { position: 'relative', maxWidth: '360px' },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' },
  searchInput: { width: '100%', padding: '8px 10px 8px 30px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  tableWrap: { flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-default)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', zIndex: 1 },
  th: { padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-default)' },
  tr: { borderBottom: '1px solid var(--border-light)', transition: 'background 0.12s' },
  td: { padding: '12px 16px', verticalAlign: 'middle' },
  userName: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' },
  userEmail: { fontSize: '11px', color: 'var(--text-muted)' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' },
  cellText: { fontSize: '12px', color: 'var(--text-secondary)' },
  activePill: { display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, border: 'none', textAlign: 'center' },
  actionBtn: { padding: '5px', border: '1px solid var(--border-default)', borderRadius: '5px', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  loading: { padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' },
  empty: { padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' },
};

const uStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' },
  modal: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '14px', width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-lg)' },
  mHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)' },
  mTitle: { fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  closeBtn: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' },
  mForm: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' },
  field: { display: 'flex', flexDirection: 'column', gap: '5px' },
  row: { display: 'flex', gap: '12px' },
  label: { fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' },
  input: { padding: '9px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  select: { padding: '9px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', width: '100%' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  toggle: { width: '40px', height: '22px', borderRadius: '11px', border: 'none', position: 'relative', cursor: 'pointer', padding: 0, transition: 'background 0.2s', flexShrink: 0 },
  toggleKnob: { position: 'absolute', top: '3px', left: '3px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', transition: 'transform 0.2s', display: 'block' },
  errorMsg: { padding: '8px 12px', backgroundColor: 'var(--accent-red-light)', color: 'var(--accent-red)', borderRadius: '6px', fontSize: '12px' },
  mFooter: { display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-default)' },
  cancelBtn: { padding: '9px 18px', backgroundColor: 'transparent', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' },
  saveBtn: { padding: '9px 20px', backgroundColor: '#4fc3f7', border: 'none', borderRadius: '8px', color: '#0a0f18', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
};
