import React, { useState, useEffect } from 'react';
import { getTheme, setTheme } from '../../tileConfig';
import { getStoredRole, getStoredName } from '../../api';

const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

const MAP_STYLES = [
  { value: 'dark', label: 'Dark (Default)', desc: 'Dark background optimised for operations rooms' },
  { value: 'light', label: 'Light', desc: 'Light background for daytime use' },
];

function Section({ title, children }) {
  return (
    <div style={sStyles.section}>
      <h3 style={sStyles.sectionTitle}>{title}</h3>
      <div style={sStyles.sectionBody}>{children}</div>
    </div>
  );
}

function SettingRow({ label, desc, children }) {
  return (
    <div style={sStyles.row}>
      <div style={sStyles.rowText}>
        <span style={sStyles.rowLabel}>{label}</span>
        {desc && <span style={sStyles.rowDesc}>{desc}</span>}
      </div>
      <div style={sStyles.rowControl}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, ariaLabel }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      style={{ ...sStyles.toggle, backgroundColor: value ? '#4fc3f7' : 'var(--border-strong)' }}
      onClick={() => onChange(!value)}
    >
      <span style={{ ...sStyles.knob, transform: value ? 'translateX(18px)' : 'translateX(2px)' }} />
    </button>
  );
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('scad_settings') || '{}'); } catch { return {}; }
}

function savePrefs(prefs) { localStorage.setItem('scad_settings', JSON.stringify(prefs)); }

export default function SettingsPage() {
  const role = getStoredRole();
  const userName = getStoredName();
  const [theme, setThemeState] = useState(getTheme());
  const [prefs, setPrefs] = useState({ language: 'en', alertSound: true, desktopNotifs: false, emailDigest: false, autoRefreshInterval: 30, mapStyle: 'dark', ...loadPrefs() });
  const [saved, setSaved] = useState(false);

  const updatePref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    setThemeState(newTheme);
    updatePref('mapStyle', newTheme);
  };

  return (
    <div style={sStyles.root}>
      <div style={sStyles.content}>
        <div style={sStyles.header}>
          <h1 style={sStyles.title}>Settings</h1>
          {saved && <span style={sStyles.savedPill}>✓ Saved</span>}
        </div>

        {/* Profile */}
        <Section title="Profile">
          <div style={sStyles.profileCard}>
            <div style={sStyles.profileAvatar}>
              {userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A'}
            </div>
            <div>
              <div style={sStyles.profileName}>{userName || 'Admin User'}</div>
              <div style={sStyles.profileRole}>{role} · SCAD Operations</div>
            </div>
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <SettingRow label="Theme" desc="Choose between dark and light interface">
            <div style={sStyles.themeGroup}>
              {MAP_STYLES.map(s => (
                <button
                  key={s.value}
                  style={{ ...sStyles.themeBtn, ...(theme === s.value ? sStyles.themeBtnActive : {}) }}
                  onClick={() => handleThemeChange(s.value)}
                  aria-pressed={theme === s.value}
                >
                  <span style={sStyles.themeDot} style={{ ...sStyles.themeDot, backgroundColor: s.value === 'dark' ? '#1a1a2e' : '#f5f5f5', border: '1px solid var(--border-default)' }} />
                  {s.label}
                </button>
              ))}
            </div>
          </SettingRow>
        </Section>

        {/* Language */}
        <Section title="Language & Region">
          <SettingRow label="Interface Language" desc="Sets the display language for the dashboard">
            <div style={sStyles.langGroup}>
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  style={{ ...sStyles.langBtn, ...(prefs.language === lang.code ? sStyles.langBtnActive : {}) }}
                  onClick={() => updatePref('language', lang.code)}
                  aria-pressed={prefs.language === lang.code}
                  dir={lang.dir}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Time Format" desc="Clock display format">
            <select style={sStyles.select} value={prefs.timeFormat || '24h'} onChange={e => updatePref('timeFormat', e.target.value)}>
              <option value="24h">24-hour (15:30)</option>
              <option value="12h">12-hour (3:30 PM)</option>
            </select>
          </SettingRow>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <SettingRow label="Alert Sound" desc="Play a sound when high-priority alerts arrive">
            <Toggle value={prefs.alertSound} onChange={v => updatePref('alertSound', v)} ariaLabel="Alert sound" />
          </SettingRow>
          <SettingRow label="Desktop Notifications" desc="Browser push notifications for critical alerts">
            <Toggle value={prefs.desktopNotifs} onChange={v => updatePref('desktopNotifs', v)} ariaLabel="Desktop notifications" />
          </SettingRow>
          <SettingRow label="Email Digest" desc="Daily summary of project status sent to your email">
            <Toggle value={prefs.emailDigest} onChange={v => updatePref('emailDigest', v)} ariaLabel="Email digest" />
          </SettingRow>
          <SettingRow label="Notification Types" desc="Which alert categories to show in the notification bar">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
              {[['geofence_breach', 'Geofence Breaches'], ['researcher_offline', 'Researcher Offline'], ['project_ending', 'Project Deadlines'], ['sample_milestone', 'Sample Milestones']].map(([key, label]) => (
                <label key={key} style={sStyles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={(prefs.notifTypes || {})[key] !== false}
                    onChange={e => updatePref('notifTypes', { ...(prefs.notifTypes || {}), [key]: e.target.checked })}
                    style={{ accentColor: '#4fc3f7', marginRight: '8px' }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </SettingRow>
        </Section>

        {/* Dashboard */}
        <Section title="Dashboard">
          <SettingRow label="Auto-Refresh Interval" desc="How often the dashboard fetches new data (seconds)">
            <select style={sStyles.select} value={prefs.autoRefreshInterval} onChange={e => updatePref('autoRefreshInterval', Number(e.target.value))}>
              {[15, 30, 60, 120, 300].map(s => <option key={s} value={s}>{s}s{s >= 60 ? ` (${s/60}min)` : ''}</option>)}
            </select>
          </SettingRow>
          <SettingRow label="Show Velocity Sparklines" desc="Display 7-day completion trend charts on the dashboard">
            <Toggle value={prefs.showSparklines !== false} onChange={v => updatePref('showSparklines', v)} ariaLabel="Velocity sparklines" />
          </SettingRow>
        </Section>

        {/* Map */}
        <Section title="Map Options">
          <SettingRow label="3D Buildings" desc="Render buildings in 3D on the map">
            <Toggle value={prefs.map3DBuildings !== false} onChange={v => updatePref('map3DBuildings', v)} ariaLabel="3D Buildings" />
          </SettingRow>
          <SettingRow label="Dynamic Sun Lighting" desc="Simulate sun position based on Abu Dhabi time of day">
            <Toggle value={prefs.mapDynamicSun !== false} onChange={v => updatePref('mapDynamicSun', v)} ariaLabel="Dynamic sun" />
          </SettingRow>
          <SettingRow label="Satellite Imagery" desc="Show satellite imagery layer on the map">
            <Toggle value={prefs.mapSatellite === true} onChange={v => updatePref('mapSatellite', v)} ariaLabel="Satellite imagery" />
          </SettingRow>
        </Section>

        {role === 'admin' && (
          <Section title="System">
            <SettingRow label="Clear Demo Data" desc="Reset all localStorage demo data to factory defaults">
              <button
                style={sStyles.dangerBtn}
                onClick={() => {
                  if (!window.confirm('This will delete all demo data and refresh the page. Continue?')) return;
                  ['demo_tasks', 'demo_users', 'demo_projects', 'demo_enumerators', 'demo_economic_projects'].forEach(k => localStorage.removeItem(k));
                  window.location.reload();
                }}
              >
                Reset Demo Data
              </button>
            </SettingRow>
          </Section>
        )}

        <div style={sStyles.versionNote}>SCAD MAP Command Center · v1.0.0 · Built for Abu Dhabi Statistics Centre</div>
      </div>
    </div>
  );
}

const sStyles = {
  root: { height: 'calc(100vh - 52px)', overflowY: 'auto', backgroundColor: 'var(--bg-primary)' },
  content: { maxWidth: '720px', margin: '0 auto', padding: '24px 24px 48px' },
  header: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  savedPill: { fontSize: '12px', backgroundColor: 'var(--status-active-bg)', color: 'var(--status-active-fg)', padding: '4px 12px', borderRadius: '12px', fontWeight: 600 },
  section: { marginBottom: '24px' },
  sectionTitle: { fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', margin: '0 0 10px' },
  sectionBody: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '12px', overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-light)' },
  rowText: { flex: 1, marginRight: '16px' },
  rowLabel: { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' },
  rowDesc: { display: 'block', fontSize: '11px', color: 'var(--text-muted)' },
  rowControl: { flexShrink: 0 },
  toggle: { width: '42px', height: '24px', borderRadius: '12px', border: 'none', position: 'relative', cursor: 'pointer', padding: 0, transition: 'background 0.2s' },
  knob: { position: 'absolute', top: '3px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', transition: 'transform 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  profileCard: { display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 18px' },
  profileAvatar: { width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#1565c0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#fff', flexShrink: 0 },
  profileName: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' },
  profileRole: { fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' },
  themeGroup: { display: 'flex', gap: '8px' },
  themeBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', border: '1px solid var(--border-default)', borderRadius: '8px', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s' },
  themeBtnActive: { borderColor: '#4fc3f7', backgroundColor: 'rgba(79,195,247,0.1)', color: '#4fc3f7', fontWeight: 600 },
  themeDot: { width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0 },
  langGroup: { display: 'flex', gap: '8px' },
  langBtn: { padding: '7px 16px', border: '1px solid var(--border-default)', borderRadius: '8px', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' },
  langBtnActive: { borderColor: '#4fc3f7', backgroundColor: 'rgba(79,195,247,0.1)', color: '#4fc3f7', fontWeight: 600 },
  select: { padding: '7px 12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' },
  checkLabel: { display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' },
  dangerBtn: { padding: '7px 14px', backgroundColor: 'transparent', border: '1px solid var(--accent-red)', borderRadius: '8px', color: 'var(--accent-red)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  versionNote: { fontSize: '11px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '32px' },
};
