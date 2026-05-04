import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getStoredRole, getStoredName, logout } from '../../api';
import { getTheme, toggleTheme } from '../../tileConfig';

/* ── SVG Icon Library (Lucide-style 2px stroke) ───────────────────── */
const I = {
  Dashboard: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  Map: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
  Tasks: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/></svg>,
  Chat: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Users: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Settings: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Reports: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Surveys: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  Enumerators: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>,
  Sun: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  Logout: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  ChevronLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevronRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>,
};

/* ── Role-based nav definitions ───────────────────────────────────── */
const ALL_NAV = [
  // id, label, to, icon, roles (null = all), disabled, badge key, exact
  { id: 'dashboard',   label: 'Dashboard',   to: '/',            icon: I.Dashboard,   roles: null,                                              exact: true },
  { id: 'live',        label: 'Live Map',    to: '/live',        icon: I.Map,         roles: ['admin', 'project_manager', 'supervisor'] },
  { id: 'tasks',       label: 'Tasks',       to: '/tasks',       icon: I.Tasks,       roles: ['admin', 'project_manager', 'supervisor'],         badge: 'task_unread' },
  { id: 'chat',        label: 'Chat',        to: '/chat',        icon: I.Chat,        roles: ['admin', 'project_manager', 'supervisor'],         badge: 'chat_unread_count' },
  { id: 'surveys',     label: 'Surveys',     to: '/surveys',     icon: I.Surveys,     roles: ['admin', 'project_manager'] },
  { id: 'enumerators', label: 'Enumerators', to: '/enumerators', icon: I.Enumerators, roles: ['admin'] },
  { id: 'users',       label: 'Users',       to: '/users',       icon: I.Users,       roles: ['admin'] },
  { id: 'settings',    label: 'Settings',    to: '/settings',    icon: I.Settings,    roles: null },
  { id: 'reports',     label: 'Reports',     to: null,           icon: I.Reports,     roles: null,  disabled: true, tooltip: 'Coming soon' },
];

/* Role-based sections — group header labels */
const ROLE_SECTIONS = {
  admin:           { label: 'ADMIN OPS' },
  project_manager: { label: 'OPERATIONS' },
  supervisor:      { label: 'MY WORKSPACE' },
  viewer:          { label: 'VIEW ACCESS' },
};

/* Role badge — shown under user name */
const ROLE_META = {
  admin:           { label: 'Administrator', color: '#4FC3F7' },
  project_manager: { label: 'Project Manager', color: '#22C55E' },
  supervisor:      { label: 'Supervisor', color: '#F59E0B' },
  viewer:          { label: 'Viewer', color: '#94A3B8' },
};

/* Viewer only gets Dashboard + Settings */
const VIEWER_NAV = ['dashboard', 'settings'];

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
function avatarHue(name = '') {
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

export default function Sidebar({ onCollapseChange }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [theme, setThemeState] = useState(getTheme());
  const [badges, setBadges] = useState({});
  const location = useLocation();
  const role = getStoredRole() || 'viewer';
  const name = getStoredName() || 'User';
  const roleMeta = ROLE_META[role] || ROLE_META.viewer;
  const sectionLabel = ROLE_SECTIONS[role]?.label || 'NAVIGATION';

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed));
    onCollapseChange?.(collapsed);
  }, [collapsed, onCollapseChange]);

  /* Poll badge counts every 5s */
  useEffect(() => {
    const read = () => setBadges({
      chat_unread_count: parseInt(localStorage.getItem('chat_unread_count') || '0', 10),
      task_unread: parseInt(localStorage.getItem('task_unread_count') || '0', 10),
    });
    read();
    const id = setInterval(read, 5000);
    return () => clearInterval(id);
  }, []);

  const handleToggleTheme = () => setThemeState(toggleTheme());
  const handleLogout = () => logout();

  /* Filter nav items by role */
  const visibleItems = ALL_NAV.filter(item => {
    if (role === 'viewer') return VIEWER_NAV.includes(item.id);
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  const w = collapsed ? 60 : 220;

  return (
    <aside style={{ ...s.sidebar, width: w }} aria-label="Main navigation">
      {/* ── Logo row ── */}
      <div style={s.logoRow}>
        <Link to="/" style={s.logoLink} aria-label="SCAD MAP Live — Home">
          <div style={s.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4FC3F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
          </div>
          {!collapsed && (
            <div style={s.logoText}>
              <span style={s.logoScad}>SCAD</span>
              <span style={s.logoMap}>MAP</span>
            </div>
          )}
        </Link>
        <button style={s.collapseBtn} onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expand' : 'Collapse'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <I.ChevronRight /> : <I.ChevronLeft />}
        </button>
      </div>

      <div style={s.divider} />

      {/* ── Role badge strip (expanded only) ── */}
      {!collapsed && (
        <div style={{ ...s.roleBadgeStrip, borderLeftColor: roleMeta.color }}>
          <span style={{ ...s.roleBadgeText, color: roleMeta.color }}>{roleMeta.label}</span>
        </div>
      )}

      {/* ── Nav group ── */}
      <nav style={s.nav} aria-label="Primary navigation">
        {!collapsed && <div style={s.groupLabel}>{sectionLabel}</div>}

        {visibleItems.map(item => {
          const badge = item.badge ? (badges[item.badge] || 0) : 0;
          const isActive = item.exact
            ? location.pathname === item.to
            : item.to && (location.pathname === item.to || location.pathname.startsWith(item.to + '/'));

          if (item.disabled) {
            return (
              <div key={item.id} style={s.navDisabled} title={collapsed ? item.tooltip : undefined} role="menuitem" aria-disabled="true">
                <span style={s.navIcon}><item.icon /></span>
                {!collapsed && <span style={s.navLbl}>{item.label}</span>}
                {!collapsed && <span style={s.soonBadge}>Soon</span>}
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              to={item.to}
              style={{ ...s.navItem, ...(isActive ? s.navActive : {}) }}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              <span style={{ ...s.navIcon, color: isActive ? '#4FC3F7' : undefined }}><item.icon /></span>
              {!collapsed && <span style={{ ...s.navLbl, ...(isActive ? s.navLblActive : {}) }}>{item.label}</span>}
              {badge > 0 && !collapsed && (
                <span style={s.badge}>{badge > 99 ? '99+' : badge}</span>
              )}
              {badge > 0 && collapsed && <span style={s.badgeDot} />}
              {isActive && <span style={s.activeBar} />}
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />
      <div style={s.divider} />

      {/* ── User card ── */}
      <div style={{ ...s.userCard, flexDirection: collapsed ? 'column' : 'row', gap: collapsed ? '6px' : '10px', padding: collapsed ? '12px 0 14px' : '12px 10px 14px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <div style={{ ...s.avatar, backgroundColor: `hsl(${avatarHue(name)},40%,32%)` }} aria-hidden="true">
          {initials(name)}
        </div>
        {!collapsed && (
          <div style={s.userInfo}>
            <span style={s.userName}>{name}</span>
            <span style={{ ...s.userRole, color: roleMeta.color }}>{roleMeta.label}</span>
          </div>
        )}
        <div style={{ ...s.userActions, flexDirection: collapsed ? 'column' : 'row' }}>
          <button style={s.iconBtn} onClick={handleToggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
            {theme === 'dark' ? <I.Sun /> : <I.Moon />}
          </button>
          <button style={{ ...s.iconBtn, color: 'var(--accent-red)' }} onClick={handleLogout}
            title="Log out" aria-label="Log out">
            <I.Logout />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */
const s = {
  sidebar: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    backgroundColor: 'var(--bg-sidebar)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0, overflow: 'hidden',
    transition: 'width 200ms cubic-bezier(0.0,0.0,0.2,1)',
    position: 'relative', zIndex: 'var(--z-sidebar,20)',
  },
  logoRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 12px 12px', gap: '8px', minHeight: '52px', flexShrink: 0,
  },
  logoLink: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', minWidth: 0, flex: 1 },
  logoIcon: {
    width: '32px', height: '32px', borderRadius: '8px',
    backgroundColor: 'rgba(79,195,247,0.1)', border: '1px solid rgba(79,195,247,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  logoText: { display: 'flex', alignItems: 'baseline', gap: '3px', overflow: 'hidden' },
  logoScad: { fontSize: '15px', fontWeight: 800, color: '#4FC3F7', letterSpacing: '1px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' },
  logoMap:  { fontSize: '13px', fontWeight: 500, color: 'rgba(148,163,184,0.6)', letterSpacing: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' },
  collapseBtn: {
    width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent',
    color: 'rgba(148,163,184,0.6)', cursor: 'pointer', flexShrink: 0,
    transition: 'background-color 150ms ease-out, color 150ms ease-out',
  },
  divider: { height: '1px', backgroundColor: 'rgba(255,255,255,0.05)', flexShrink: 0 },
  roleBadgeStrip: {
    margin: '8px 10px 2px', padding: '5px 10px', borderRadius: '6px',
    backgroundColor: 'rgba(255,255,255,0.03)', borderLeft: '2px solid',
    flexShrink: 0,
  },
  roleBadgeText: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' },
  nav: { display: 'flex', flexDirection: 'column', padding: '6px 8px 4px', gap: '2px', flex: 0 },
  groupLabel: {
    fontSize: '9px', fontWeight: 700, color: 'rgba(148,163,184,0.35)',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    padding: '8px 8px 4px', height: '28px', display: 'flex', alignItems: 'center',
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px',
    borderRadius: '7px', textDecoration: 'none', color: 'rgba(148,163,184,0.75)',
    fontSize: '13px', fontWeight: 500, transition: 'background-color 150ms ease-out, color 150ms ease-out',
    position: 'relative', cursor: 'pointer', minHeight: '40px', whiteSpace: 'nowrap', overflow: 'hidden',
  },
  navActive: { backgroundColor: 'rgba(79,195,247,0.1)', color: '#4FC3F7', paddingLeft: '7.5px' },
  activeBar: {
    position: 'absolute', left: 0, top: '6px', bottom: '6px',
    width: '3px', borderRadius: '0 2px 2px 0', backgroundColor: '#4FC3F7',
  },
  navDisabled: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px',
    borderRadius: '7px', color: 'rgba(148,163,184,0.28)', fontSize: '13px',
    fontWeight: 500, cursor: 'not-allowed', minHeight: '40px', whiteSpace: 'nowrap', userSelect: 'none',
  },
  navIcon: {
    width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, color: 'rgba(148,163,184,0.55)', transition: 'color 150ms ease-out',
  },
  navLbl: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' },
  navLblActive: { color: '#4FC3F7', fontWeight: 600 },
  soonBadge: {
    fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(255,255,255,0.04)', padding: '2px 5px', borderRadius: '4px', textTransform: 'uppercase',
  },
  badge: {
    minWidth: '18px', height: '18px', borderRadius: '9px', backgroundColor: 'var(--accent-red)',
    color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '0 4px', fontFamily: 'var(--font-mono)',
  },
  badgeDot: {
    position: 'absolute', top: '7px', right: '7px', width: '7px', height: '7px',
    borderRadius: '50%', backgroundColor: 'var(--accent-red)',
  },
  userCard: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  avatar: {
    width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0,
    fontFamily: 'var(--font-mono)',
  },
  userInfo: { display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0, overflow: 'hidden' },
  userName: { fontSize: '12px', fontWeight: 600, color: 'rgba(248,250,252,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRole: { fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' },
  userActions: { display: 'flex', gap: '4px', flexShrink: 0 },
  iconBtn: {
    width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent',
    color: 'rgba(148,163,184,0.7)', cursor: 'pointer', transition: 'background-color 150ms ease-out',
  },
};
