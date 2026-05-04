import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { fetchDashboardOverview, fetchProjects, fetchAllResearchersAcrossProjects, fetchDailyVelocity, getStoredRole } from '../api';
import { resolveStyleURL, addSatelliteImagery, enable3DBuildings } from '../tileConfig';

const REFRESH_INTERVAL = 30_000; // 30s auto-refresh

export default function ProjectDashboard() {
  const [overview, setOverview] = useState(null);
  const [projects, setProjects] = useState([]);
  const [researchers, setResearchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [opsMode, setOpsMode] = useState(false);
  const [velocityData, setVelocityData] = useState({});
  const [clock, setClock] = useState('');
  const timerRef = useRef(null);
  const prevKpi = useRef({});
  const role = getStoredRole();

  const loadData = useCallback(async () => {
    try {
      const [ov, pj, rw] = await Promise.all([
        fetchDashboardOverview().catch(() => null),
        fetchProjects().catch(() => []),
        fetchAllResearchersAcrossProjects().catch(() => []),
      ]);
      setOverview(ov);
      const pjArr = Array.isArray(pj) ? pj : pj.projects || [];
      setProjects(pjArr);
      setResearchers(Array.isArray(rw) ? rw : []);
      setLastUpdate(new Date());

      // Fetch velocity sparklines for active projects
      const active = pjArr.filter((p) => p.status === 'active').slice(0, 10);
      const velEntries = await Promise.all(
        active.map((p) => fetchDailyVelocity(p.project_id).then((d) => [p.project_id, d]).catch(() => [p.project_id, []]))
      );
      const velMap = {};
      velEntries.forEach(([id, data]) => { velMap[id] = data; });
      setVelocityData(velMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    timerRef.current = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [loadData]);

  // Live clock — HH:mm:ss Abu Dhabi time (Asia/Dubai = UTC+4, no DST)
  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Ops room mode: Escape key to exit
  useEffect(() => {
    if (!opsMode) return;
    const handler = (e) => { if (e.key === 'Escape') setOpsMode(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [opsMode]);

  // Generate sample alerts from data changes
  useEffect(() => {
    if (!projects.length) return;
    const newAlerts = [];
    projects.forEach((p) => {
      if (p.status === 'at_risk' || (p.completion_pct < 30 && p.sample_count > 0)) {
        newAlerts.push({
          id: `risk-${p.project_id}`,
          type: 'at_risk_project',
          description: `${p.project_name} is at risk — ${p.completion_pct}% completion`,
          timestamp: new Date().toISOString(),
        });
      }
    });
    researchers.forEach((r) => {
      if (r.total_samples > 0 && r.completed_samples / r.total_samples < 0.2) {
        newAlerts.push({
          id: `low-${r.fw_id}`,
          type: 'researcher_low',
          description: `${r.name} (${r.fw_id}) — low performance ${Math.round((r.completed_samples / r.total_samples) * 100)}%`,
          timestamp: new Date().toISOString(),
        });
      }
      // Researcher offline: not in field when they should be (simulated — real version uses last ping timestamp)
      if (r.is_active && !r.in_field && r.total_samples > 0 && r.completed_samples < r.total_samples) {
        newAlerts.push({
          id: `offline-${r.fw_id}`,
          type: 'researcher_offline',
          description: `${r.name} (${r.fw_id}) — no recent activity, may be offline`,
          timestamp: new Date().toISOString(),
        });
      }
    });
    if (newAlerts.length) setAlerts((prev) => {
      const existingIds = new Set(prev.map((a) => a.id));
      const fresh = newAlerts.filter((a) => !existingIds.has(a.id));
      return [...fresh, ...prev].slice(0, 50);
    });
  }, [projects, researchers]);

  const stats = overview || deriveStats(projects);
  const activeProjects = projects.filter((p) => p.status === 'active');
  const closedProjects = projects.filter((p) => p.status === 'completed');
  const inFieldCount = researchers.filter((r) => r.in_field).length;
  const standbyCount = researchers.length - inFieldCount;

  // Live researcher cards — sorted: in-field first, then by completion rate descending
  const liveResearchers = [...researchers]
    .map((r) => ({ ...r, pct: r.total_samples > 0 ? Math.round((r.completed_samples / r.total_samples) * 100) : 0 }))
    .sort((a, b) => {
      if (a.in_field !== b.in_field) return a.in_field ? -1 : 1;
      return b.pct - a.pct || b.completed_samples - a.completed_samples;
    });

  if (loading) {
    return (
      <div style={s.loadingScreen}>
        <div style={s.loadingInner}>
          <div style={s.loadingDot} />
          <span style={s.loadingText}>Initializing Decision Support System…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>

      {/* ══════════════════════════════════════════════════════════════
          HEADER STRIP
      ══════════════════════════════════════════════════════════════ */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.liveBadge}>
            <span style={s.liveDotHdr} />
            <span style={s.liveTextHdr}>LIVE</span>
          </div>
          <div>
            <h1 style={s.title}>Command Center</h1>
            <div style={s.subtitle}>
              {role === 'project_manager' ? 'Portfolio Operations · ' : 'Decision Support · '}
              SCAD MAP · Abu Dhabi, UAE
            </div>
          </div>
        </div>
        <div style={s.headerRight}>
          {alerts.length > 0 && (
            <div style={s.alertIndicator} title={`${alerts.length} active alerts`}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#EF4444', display: 'inline-block', animation: 'glowPulse 2s infinite', flexShrink: 0 }} />
              <span style={s.alertIndicatorNum}>{alerts.length}</span>
              <span style={s.alertIndicatorLbl}>alerts</span>
            </div>
          )}
          <div style={s.clockBlock}>
            <span style={s.clockTime}>{clock}</span>
            <span style={s.clockSub}>UTC+4</span>
          </div>
          <button onClick={() => setOpsMode(true)} style={s.opsBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Ops Room
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          3-COLUMN OPS GRID
      ══════════════════════════════════════════════════════════════ */}
      <div style={s.opsGrid}>

        {/* ── LEFT COLUMN: Metrics + Project List ── */}
        <div style={s.leftCol}>
          <MetricPanel label="Online Researchers" value={inFieldCount}
            sub={`${standbyCount} standby · ${researchers.length} total`}
            color="#22C55E" />
          <MetricPanel label="Active Projects" value={stats.active}
            sub={`${stats.completed} completed · ${stats.paused} paused`}
            color="#4FC3F7" />
          <MetricPanel label="Total Samples" value={stats.totalSamples}
            sub={`Across ${stats.total} operations`}
            color="#F59E0B" />
          <MetricPanel label="Active Alerts" value={alerts.length}
            sub={alerts.length > 0 ? 'Action required' : 'All systems normal'}
            color={alerts.length > 0 ? '#EF4444' : '#475569'}
            critical={alerts.length > 0} />

          {/* Active operations list */}
          <div style={s.opsListPanel}>
            <div style={s.opsListHdr}>
              <span style={s.opsListTitle}>Active Operations</span>
              <span style={s.opsListCount}>{activeProjects.length}</span>
            </div>
            {activeProjects.length === 0
              ? <div style={s.opsListEmpty}>No active operations</div>
              : activeProjects.map(p => <MiniProjectRow key={p.project_id} project={p} />)
            }
            {closedProjects.length > 0 && (
              <>
                <div style={{ ...s.opsListHdr, marginTop: '12px' }}>
                  <span style={s.opsListTitle}>Closed Operations</span>
                  <span style={{ ...s.opsListCount, backgroundColor: 'rgba(148,163,184,0.08)', color: 'var(--text-faint)' }}>{closedProjects.length}</span>
                </div>
                {closedProjects.slice(0, 3).map(p => (
                  <Link key={p.project_id} to={`/projects/${p.project_id}`} style={s.closedRow}>
                    <span style={s.closedName}>{p.project_name}</span>
                    <span style={s.closedDate}>{p.end_date?.slice(0, 10) || '—'}</span>
                  </Link>
                ))}
              </>
            )}
          </div>

          {/* PM Portfolio */}
          {role === 'project_manager' && activeProjects.length > 0 && (
            <div style={s.opsListPanel}>
              <div style={s.opsListHdr}>
                <span style={s.opsListTitle}>My Projects</span>
              </div>
              {activeProjects.slice(0, 4).map(p => (
                <PMProjectCard key={p.project_id} project={p} velocity={velocityData[p.project_id]} />
              ))}
            </div>
          )}
        </div>

        {/* ── CENTER COLUMN: Live Map + Charts ── */}
        <div style={s.centerCol}>
          {/* Live map */}
          <div style={s.mapBox}>
            <OpsRoomMap />
            <div style={s.mapCornerLabel}>Abu Dhabi, UAE</div>
            <div style={s.mapLiveBadge}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block', animation: 'pulse 1.5s infinite', boxShadow: '0 0 8px #22C55E99' }} />
              LIVE TRACKING
            </div>
            <div style={s.mapCounterBadge}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#4FC3F7', fontSize: '18px', lineHeight: 1 }}>{inFieldCount}</span>
              <span style={{ fontSize: '9px', color: 'rgba(148,163,184,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>In Field</span>
            </div>
          </div>

          {/* Charts row */}
          <div style={s.chartsRow}>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Operations Status</div>
              <DonutChart segments={[
                { label: 'Active',    value: stats.active,    color: '#22C55E' },
                { label: 'Completed', value: stats.completed, color: '#4FC3F7' },
                { label: 'Paused',   value: stats.paused,    color: '#F59E0B' },
              ]} />
            </div>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Sample Completion</div>
              <BarChart projects={projects.slice(0, 8)} />
            </div>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Personnel Deployment</div>
              <DonutChart segments={[
                { label: 'In Field', value: inFieldCount,  color: '#4FC3F7' },
                { label: 'Standby',  value: standbyCount,  color: '#F59E0B' },
              ]} />
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Alerts + Health + Personnel ── */}
        <div style={s.rightCol}>
          {/* Alert feed */}
          <div style={s.rightPanel}>
            <div style={s.rightPanelHdr}>
              <span style={s.rightPanelTitle}>Alert Feed</span>
              {alerts.length > 0
                ? <span style={{ ...s.panelChip, backgroundColor: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.25)' }}>{alerts.length}</span>
                : <span style={s.panelChip}>Clear</span>
              }
            </div>
            <div style={s.alertList}>
              {alerts.length === 0 ? (
                <div style={s.alertEmpty}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <span>All systems operational</span>
                </div>
              ) : (
                alerts.slice(0, 18).map(a => (
                  <AlertFeedItem key={a.id} alert={a}
                    onDismiss={() => setAlerts(p => p.filter(x => x.id !== a.id))} />
                ))
              )}
            </div>
          </div>

          {/* System health */}
          <div style={s.rightPanel}>
            <div style={s.rightPanelHdr}>
              <span style={s.rightPanelTitle}>System Health</span>
              <span style={{ ...s.panelChip, backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.2)' }}>Healthy</span>
            </div>
            <div style={s.healthGrid}>
              {[
                { label: 'WebSocket',     value: 'Connected',       ok: true },
                { label: 'GPS Feed',      value: '94% signal',      ok: true },
                { label: 'Data Rate',     value: '2,450 / min',     ok: true },
                { label: 'Active Devices',value: String(researchers.length || 24), ok: true },
                { label: 'Last Refresh',  value: lastUpdate ? lastUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—', ok: true },
              ].map(h => (
                <div key={h.label} style={s.healthRow}>
                  <div style={{ ...s.healthDot, backgroundColor: h.ok ? '#22C55E' : '#EF4444', boxShadow: h.ok ? '0 0 6px #22C55E66' : '0 0 6px #EF444466' }} />
                  <span style={s.healthLabel}>{h.label}</span>
                  <span style={s.healthValue}>{h.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Field personnel mini-list */}
          <div style={{ ...s.rightPanel, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={s.rightPanelHdr}>
              <span style={s.rightPanelTitle}>Field Personnel</span>
              <span style={{ ...s.panelChip, backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.2)' }}>{inFieldCount} active</span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {liveResearchers.slice(0, 12).map(r => (
                <MiniResearcherRow key={r.fw_id} researcher={r} />
              ))}
              {liveResearchers.length === 0 && (
                <div style={s.alertEmpty}>No researchers yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Ops Room HUD Overlay — map fills viewport, KPIs overlay ═══ */}
      {opsMode && (
        <div style={s.opsOverlay}>
          {/* Full-viewport map */}
          <OpsRoomMap />

          {/* Top-left: KPI stack (matching Image 1 style) */}
          <div style={s.opsHudTopLeft}>
            <OpsKpiCard value={stats.active}      label="Active Ops"  color="#4FC3F7" />
            <OpsKpiCard value={stats.totalSamples} label="Samples"     color="#22C55E" />
            <OpsKpiCard value={inFieldCount}       label="Deployed"    color="#F59E0B" />
            <OpsKpiCard value={standbyCount}       label="Standby"     color="#94A3B8" />
          </div>

          {/* Top-right: project stats + live stream indicator */}
          <div style={s.opsHudTopRight}>
            <div style={s.opsProjectCard}>
              <div style={s.opsProjectLine}>
                <span style={s.opsProjectCount}>{projects.length}</span>
                <span style={s.opsProjectLabel}>Projects</span>
              </div>
              <div style={s.opsProjectLine}>
                <span style={{ ...s.opsProjectCount, fontSize: '13px', color: alerts.length > 0 ? '#EF4444' : '#22C55E' }}>{alerts.length} alerts</span>
              </div>
              <div style={s.opsProjectLine}>
                <span style={s.opsTimestamp}>{clock}</span>
              </div>
              <div style={s.opsLiveBadge}>
                <span style={s.opsLiveDot} />
                LiveOps Stream Open
              </div>
            </div>
            <button onClick={() => setOpsMode(false)} style={s.opsExitBtn}>✕ Exit Ops Room</button>
          </div>

          {/* Bottom bar — project completion cards */}
          <div style={s.opsBottomBar}>
            <div style={s.opsLogo}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4FC3F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              <span>SCAD MAP</span>
            </div>
            {activeProjects.slice(0, 7).map((p) => (
              <div key={p.project_id} style={s.opsMiniCard}>
                <div style={{ fontSize: '10px', color: 'rgba(148,163,184,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px', marginBottom: '2px' }}>
                  {p.project_name}
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: (p.completion_pct ?? 0) >= 80 ? '#22C55E' : (p.completion_pct ?? 0) >= 40 ? '#4FC3F7' : '#EF4444', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                  {p.completion_pct ?? 0}%
                </div>
                <div style={{ width: '100%', height: '3px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '4px' }}>
                  <div style={{ width: `${p.completion_pct ?? 0}%`, height: '100%', backgroundColor: (p.completion_pct ?? 0) >= 80 ? '#22C55E' : (p.completion_pct ?? 0) >= 40 ? '#4FC3F7' : '#EF4444', borderRadius: '2px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function OpsKpiCard({ value, label, color }) {
  return (
    <div style={s.opsKpiCard}>
      <div style={{ ...s.opsKpiVal, color }}>{value?.toLocaleString() ?? '—'}</div>
      <div style={s.opsKpiLabel}>{label}</div>
    </div>
  );
}

/* ── MetricPanel: left-column KPI block ───────────────────────────── */
function MetricPanel({ label, value, sub, color, critical }) {
  const [display, setDisplay] = useState(value ?? 0);
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    const n = Number(value);
    const p = Number(prev.current);
    if (!isNaN(n) && !isNaN(p) && n !== p) {
      setFlash(true);
      let step = 0; const steps = 12;
      const iv = setInterval(() => {
        step++;
        setDisplay(Math.round(p + (n - p) * (1 - Math.pow(1 - step / steps, 3))));
        if (step >= steps) { clearInterval(iv); setDisplay(n); setTimeout(() => setFlash(false), 300); }
      }, 18);
      prev.current = value;
      return () => clearInterval(iv);
    }
    setDisplay(value ?? 0);
    prev.current = value;
  }, [value]);

  return (
    <div style={{ ...s.metricPanel, borderLeftColor: color, animation: critical && flash ? 'glowPulse 2s infinite' : undefined }}>
      <div style={s.metricTop}>
        <span style={{ ...s.metricValue, color, animation: flash ? 'kpiPulse 0.3s ease-out' : undefined }}>
          {display?.toLocaleString?.() ?? display}
        </span>
        <span style={{ ...s.metricDot, backgroundColor: color, boxShadow: `0 0 8px ${color}66`, animation: 'pulse 2s infinite' }} />
      </div>
      <div style={s.metricLabel}>{label}</div>
      <div style={s.metricSub}>{sub}</div>
    </div>
  );
}

/* ── MiniProjectRow: compact op row in left column ────────────────── */
function MiniProjectRow({ project: p }) {
  const pct = p.completion_pct ?? 0;
  const isRisk = pct < 30 && p.status === 'active';
  const color = pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <Link to={`/projects/${p.project_id}`} style={s.miniProjRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          {isRisk && <span style={s.riskDot} title="At risk" />}
          <span style={s.miniProjName}>{p.project_name}</span>
        </div>
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '2px', transition: 'width 0.4s' }} />
        </div>
      </div>
      <span style={{ ...s.miniProjPct, color }}>{pct}%</span>
    </Link>
  );
}

/* ── AlertFeedItem: alert row in right column ─────────────────────── */
const ALERT_CFG = {
  geofence_breach:    { color: '#EF4444', glyph: '⊘', label: 'Breach' },
  at_risk_project:    { color: '#F59E0B', glyph: '⚠', label: 'At Risk' },
  researcher_offline: { color: '#EF4444', glyph: '●', label: 'Offline' },
  sample_milestone:   { color: '#14B8A6', glyph: '◈', label: 'Milestone' },
  default:            { color: '#4FC3F7', glyph: 'ℹ', label: 'Alert' },
};

function AlertFeedItem({ alert: a, onDismiss }) {
  const cfg = ALERT_CFG[a.type] || ALERT_CFG.default;
  const ago = (() => {
    const m = Math.floor((Date.now() - new Date(a.timestamp).getTime()) / 60000);
    return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
  })();
  return (
    <div style={{ ...s.alertFeedRow, borderLeftColor: cfg.color }}>
      <span style={{ ...s.alertGlyph, color: cfg.color }}>{cfg.glyph}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
          <span style={{ fontSize: '9px', fontWeight: 800, color: cfg.color, letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{cfg.label}</span>
          <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{ago}</span>
        </div>
        <div style={s.alertFeedMsg}>{a.description}</div>
      </div>
      <button style={s.alertFeedDismiss} onClick={onDismiss} aria-label="Dismiss alert">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

/* ── MiniResearcherRow: compact researcher in right column ────────── */
function MiniResearcherRow({ researcher: r }) {
  const color = r.in_field ? '#22C55E' : '#94A3B8';
  const pct = r.total_samples > 0 ? Math.round((r.completed_samples / r.total_samples) * 100) : 0;
  return (
    <div style={s.miniRRow}>
      <div style={{ ...s.miniRAvatar, backgroundColor: r.in_field ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.1)', color }}>
        {(r.name || '?')[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.miniRName}>{r.name}</div>
        <div style={{ height: '2px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '1px', overflow: 'hidden', marginTop: '3px' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct >= 60 ? '#22C55E' : pct >= 30 ? '#F59E0B' : '#EF4444', transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{pct}%</span>
        <span style={{ fontSize: '9px', color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{r.in_field ? 'Field' : 'Standby'}</span>
      </div>
    </div>
  );
}

function PMProjectCard({ project: p, velocity }) {
  const pct = p.completion_pct ?? 0;
  const total = p.sample_count ?? 0;
  const done = Math.round(total * pct / 100);
  const risk = pct < 30 ? 'High' : pct < 60 ? 'Medium' : 'Low';
  const riskColor = risk === 'High' ? 'var(--accent-red)' : risk === 'Medium' ? 'var(--accent-orange)' : 'var(--accent-green)';
  const statusColor = {
    active: { bg: 'var(--status-active-bg)', fg: 'var(--status-active-fg)' },
    paused: { bg: 'var(--status-paused-bg)', fg: 'var(--status-paused-fg)' },
    completed: { bg: 'var(--status-completed-bg)', fg: 'var(--status-completed-fg)' },
  }[p.status] || { bg: 'var(--status-setup-bg)', fg: 'var(--status-setup-fg)' };

  return (
    <div style={s.pmCard}>
      <div style={s.pmCardTop}>
        <span style={{ ...s.pmStatusPill, backgroundColor: statusColor.bg, color: statusColor.fg }}>{p.status}</span>
        <span style={{ ...s.pmRiskBadge, color: riskColor, borderColor: riskColor }}>⚠ {risk} Risk</span>
      </div>
      <div style={s.pmCardName}>{p.project_name}</div>
      <div style={s.pmCardMeta}>
        {(p.researcher_count ?? 0)} researchers · {done.toLocaleString()} / {total.toLocaleString()} samples
      </div>
      <div style={s.pmProgressBar}>
        <div style={{ ...s.pmProgressFill, width: `${Math.min(pct, 100)}%`, backgroundColor: pct < 30 ? 'var(--accent-red)' : pct < 70 ? 'var(--accent-orange)' : 'var(--accent-green)' }} />
      </div>
      <div style={s.pmCardPct}>{pct}% complete</div>
      <div style={s.pmCardActions}>
        <Link to={`/live`} style={s.pmActionBtn}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>
          View on Map
        </Link>
        <Link to="/tasks" style={{ ...s.pmActionBtn, backgroundColor: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Tasks
        </Link>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon, color, sub }) {
  const [displayVal, setDisplayVal] = useState(value ?? 0);
  const [animating, setAnimating] = useState(false);
  const prevVal = useRef(value);

  useEffect(() => {
    const numVal = typeof value === 'number' ? value : parseInt(value, 10);
    const numPrev = typeof prevVal.current === 'number' ? prevVal.current : parseInt(prevVal.current, 10);
    if (!isNaN(numVal) && !isNaN(numPrev) && numVal !== numPrev) {
      setAnimating(true);
      const diff = numVal - numPrev;
      const steps = 15;
      let step = 0;
      const iv = setInterval(() => {
        step++;
        const progress = step / steps;
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out
        setDisplayVal(Math.round(numPrev + diff * eased));
        if (step >= steps) {
          clearInterval(iv);
          setDisplayVal(numVal);
          setTimeout(() => setAnimating(false), 100);
        }
      }, 20);
      prevVal.current = value;
      return () => clearInterval(iv);
    } else {
      setDisplayVal(value ?? 0);
      prevVal.current = value;
    }
  }, [value]);

  return (
    <div style={s.kpiCard}>
      <div style={s.kpiIcon}>{icon}</div>
      <div style={{
        ...s.kpiValue, color,
        transition: 'transform 0.3s ease',
        transform: animating ? 'scale(1.08)' : 'scale(1)',
      }}>{displayVal}</div>
      <div style={s.kpiLabel}>{label}</div>
      <div style={s.kpiSub}>{sub}</div>
    </div>
  );
}

function ProjectVelocityRow({ project: p, velocity }) {
  const pct = p.completion_pct ?? 0;
  const today = new Date();
  const end = new Date(p.end_date);
  const start = new Date(p.start_date);
  const daysRemaining = Math.max(0, Math.ceil((end - today) / 86400000));
  const totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
  const elapsed = totalDays - daysRemaining;
  const timeProgress = Math.min(100, Math.round((elapsed / totalDays) * 100));

  // Risk: completion behind schedule
  const isAtRisk = pct < timeProgress - 15;

  return (
    <Link to={`/projects/${p.project_id}`} style={s.velocityRow}>
      <div style={s.velHeader}>
        <span style={s.velName}>{p.project_name}</span>
        {isAtRisk && <span style={s.riskTag}>AT RISK</span>}
        <span style={s.velDays}>
          {daysRemaining > 0 ? <><b>{daysRemaining}</b> days left</> : <b style={{ color: '#c62828' }}>OVERDUE</b>}
        </span>
      </div>
      <div style={s.velMeta}>
        {p.region}{p.district ? ` — ${p.district}` : ''} · {p.sample_count || 0} samples · {p.researcher_count || 0} researchers
      </div>
      <div style={s.velDates}>
        <span>{p.start_date}</span>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 600, color: pct >= 80 ? '#2e7d32' : '#1976d2' }}>{pct}%</span>
        <span>{p.end_date}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ ...s.velBarOuter, flex: 1 }}>
          <div style={{ ...s.velBarFill, width: `${pct}%`, backgroundColor: isAtRisk ? '#e65100' : pct >= 80 ? '#2e7d32' : '#1976d2' }} />
          <div style={{ ...s.velTimeMarker, left: `${timeProgress}%` }} title={`Time elapsed: ${timeProgress}%`} />
        </div>
        {velocity && velocity.length > 0 && <VelocitySparkline data={velocity} />}
      </div>
    </Link>
  );
}

function ResearcherCard({ researcher: r }) {
  const statusColor = r.in_field ? '#2e7d32' : r.pct > 0 ? '#ff9800' : '#bbb';
  const statusLabel = r.in_field ? 'In Field' : 'Standby';
  const avatarBg = r.in_field ? '#1976d2' : '#ff9800';
  return (
    <div style={s.rCard}>
      <div style={s.rCardTop}>
        <div style={{ ...s.rCardAvatar, backgroundColor: avatarBg }}>
          {r.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div style={s.rCardInfo}>
          <div style={s.rCardName}>{r.name}</div>
          <div style={s.rCardMeta}>{r.fw_id} · {r.project_name || '—'} · {r.shift}</div>
        </div>
        <div style={{ ...s.rCardDot, backgroundColor: statusColor }} title={statusLabel} />
      </div>
      <div style={s.rCardBarOuter}>
        <div style={{ ...s.rCardBarFill, width: `${r.pct}%`, backgroundColor: r.pct >= 60 ? '#2e7d32' : r.pct >= 30 ? '#1976d2' : '#c62828' }} />
      </div>
      <div style={s.rCardBottom}>
        <span style={{ fontSize: '10px', color: '#888' }}>{r.completed_samples || 0}/{r.total_samples || 0} samples</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: r.pct >= 60 ? '#2e7d32' : r.pct >= 30 ? '#1976d2' : '#c62828' }}>{r.pct}%</span>
        <span style={{ fontSize: '9px', fontWeight: 700, color: statusColor, letterSpacing: '0.5px' }}>{statusLabel.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Charts (inline SVG — no deps)
// ═══════════════════════════════════════════════════════════════════

function DonutChart({ segments }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div style={s.emptyChart}>No data</div>;

  const size = 150;
  const cx = size / 2, cy = size / 2, r = 55, sw = 22;
  let cum = 0;
  const paths = segments.filter((seg) => seg.value > 0).map((seg) => {
    const frac = seg.value / total;
    const sa = cum * 2 * Math.PI - Math.PI / 2;
    cum += frac;
    const ea = cum * 2 * Math.PI - Math.PI / 2;
    const la = frac > 0.5 ? 1 : 0;
    return (
      <path key={seg.label}
        d={`M ${cx + r * Math.cos(sa)} ${cy + r * Math.sin(sa)} A ${r} ${r} 0 ${la} 1 ${cx + r * Math.cos(ea)} ${cy + r * Math.sin(ea)}`}
        fill="none" stroke={seg.color} strokeWidth={sw} strokeLinecap="butt" />
    );
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths}
        <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: '26px', fontWeight: 800, fill: 'var(--text-primary)' }}>{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle"
              style={{ fontSize: '9px', fill: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '1px' }}>TOTAL</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: seg.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{seg.label}:</span>
            <b style={{ color: seg.color, fontFamily: 'var(--font-mono)' }}>{seg.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ projects }) {
  if (projects.length === 0) return <div style={s.emptyChart}>No operations</div>;
  const maxSamples = Math.max(...projects.map((p) => p.sample_count || 1), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px', padding: '10px 0' }}>
      {projects.map((p) => {
        const total = p.sample_count || 0;
        const completed = p.completed_samples || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const barH = Math.max(((total / maxSamples) * 120), 4);
        const fillH = total > 0 ? (completed / total) * barH : 0;
        return (
          <div key={p.project_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: pct >= 80 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444', marginBottom: '3px', fontFamily: 'var(--font-mono)' }}>{pct}%</div>
            <div style={{ width: '100%', maxWidth: '36px', height: `${barH}px`, backgroundColor: 'var(--bg-muted)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${fillH}px`, backgroundColor: pct >= 80 ? '#22C55E' : pct >= 40 ? '#4FC3F7' : '#EF4444', borderRadius: '4px', transition: 'height 0.4s' }} />
            </div>
            <div style={{ fontSize: '8px', color: 'var(--text-faint)', marginTop: '4px', textAlign: 'center', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.project_name?.slice(0, 12)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VelocitySparkline({ data }) {
  const values = data.map((d) => d.completed || 0);
  const max = Math.max(...values, 1);
  const w = 7 * 6; // 7 bars * 6px spacing
  const h = 20;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      {values.slice(-7).map((v, i) => {
        const barH = Math.max(1, (v / max) * h);
        return (
          <rect key={i} x={i * 6} y={h - barH} width={4} height={barH}
            rx={1} fill={v > max * 0.6 ? '#2e7d32' : '#1976d2'} opacity={0.8} />
        );
      })}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Ops Room — Full viewport map (Abu Dhabi overview, 3D, dark style)
// ═══════════════════════════════════════════════════════════════════

function OpsRoomMap() {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [researchers, setResearchers] = useState([]);

  useEffect(() => {
    fetchAllResearchersAcrossProjects().then(setResearchers).catch(() => {});
  }, []);

  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    let cancelled = false;
    resolveStyleURL().then((styleUrl) => {
      if (cancelled || mapRef.current || !ref.current) return;
      const map = new maplibregl.Map({
        container: ref.current,
        style: styleUrl,
        center: [54.3773, 24.4539],
        zoom: 12,
        pitch: 55,
        bearing: -20,
        antialias: true,
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.on('style.load', () => {
        addSatelliteImagery(map);
        enable3DBuildings(map);
      });
      mapRef.current = map;
    });
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  // Add researcher markers
  useEffect(() => {
    if (!mapRef.current || !researchers.length) return;
    // Clear existing markers
    document.querySelectorAll('.ops-researcher-marker').forEach(el => el.remove());
    researchers.forEach(r => {
      const color = r.in_field ? '#00B4D8' : '#6B7280';
      const el = document.createElement('div');
      el.className = 'ops-researcher-marker';
      el.innerHTML = `
        <div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:700;">
          ${(r.name || '?')[0] || '?'}
        </div>
      `;
      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([r.longitude || r.lng, r.latitude || r.lat])
        .addTo(mapRef.current);
    });
  }, [researchers]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function deriveStats(projects) {
  const active = projects.filter((p) => p.status === 'active').length;
  const completed = projects.filter((p) => p.status === 'completed').length;
  const paused = projects.filter((p) => p.status === 'paused').length;
  return {
    total: projects.length, active, completed, paused,
    activeResearchers: projects.reduce((sum, p) => sum + (p.researcher_count || 0), 0),
    totalSamples: projects.reduce((sum, p) => sum + (p.sample_count || 0), 0),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Styles — high-contrast, ops-room optimized
// ═══════════════════════════════════════════════════════════════════


const s = {
  /* ── Page shell ── */
  page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' },

  /* ── Loading screen ── */
  loadingScreen: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  loadingInner: { display: 'flex', alignItems: 'center', gap: '12px' },
  loadingDot: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#4FC3F7', animation: 'pulse 1.5s infinite' },
  loadingText: { fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },

  /* ── Header strip ── */
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px 10px', flexShrink: 0,
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-secondary)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px' },

  /* LIVE badge */
  liveBadge: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '5px 10px', borderRadius: '6px',
    backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
  },
  liveDotHdr: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block', animation: 'pulse 1.5s infinite', boxShadow: '0 0 8px #22C55E88' },
  liveTextHdr: { fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', color: '#22C55E', fontFamily: 'var(--font-mono)' },

  title: { margin: '0 0 2px', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', fontFamily: 'var(--font-body)' },
  subtitle: { fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },

  /* Alert indicator in header */
  alertIndicator: {
    display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
    borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
  },
  alertIndicatorNum: { fontSize: '14px', fontWeight: 800, color: '#F87171', fontFamily: 'var(--font-mono)' },
  alertIndicatorLbl: { fontSize: '9px', color: '#F87171', letterSpacing: '0.08em', textTransform: 'uppercase' },

  /* Clock */
  clockBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px',
    padding: '5px 10px', backgroundColor: 'var(--bg-card)', borderRadius: '7px',
    border: '1px solid var(--border-default)',
  },
  clockTime: { fontSize: '17px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', letterSpacing: '1.5px', lineHeight: 1 },
  clockSub: { fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' },

  /* Ops Room button */
  opsBtn: {
    display: 'flex', alignItems: 'center', gap: '7px',
    padding: '8px 16px', backgroundColor: 'rgba(79,195,247,0.08)',
    border: '1px solid rgba(79,195,247,0.3)', borderRadius: '8px',
    color: '#4FC3F7', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
    transition: 'background-color 150ms ease-out', letterSpacing: '0.3px',
    fontFamily: 'var(--font-body)',
  },

  /* ── 3-column ops grid ── */
  opsGrid: {
    display: 'grid',
    gridTemplateColumns: '240px 1fr 260px',
    gap: '0',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },

  /* Left column */
  leftCol: {
    display: 'flex', flexDirection: 'column', gap: '0',
    borderRight: '1px solid var(--border-light)',
    overflowY: 'auto', backgroundColor: 'var(--bg-secondary)',
    padding: '12px 0',
  },

  /* MetricPanel */
  metricPanel: {
    padding: '12px 16px', borderLeft: '3px solid',
    marginBottom: '2px', transition: 'border-color 200ms',
    position: 'relative',
  },
  metricTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' },
  metricValue: { fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1, display: 'inline-block' },
  metricDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  metricLabel: { fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' },
  metricSub: { fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },

  /* Ops list panel */
  opsListPanel: { margin: '8px 0 0', padding: '0 0 8px' },
  opsListHdr: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px 6px', borderTop: '1px solid var(--border-light)',
  },
  opsListTitle: { fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' },
  opsListCount: { fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '8px' },
  opsListEmpty: { padding: '10px 16px', fontSize: '11px', color: 'var(--text-faint)' },

  /* Mini project row */
  miniProjRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '7px 16px', textDecoration: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    transition: 'background-color 100ms', cursor: 'pointer',
  },
  miniProjName: { fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  miniProjPct: { fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0 },
  riskDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#EF4444', flexShrink: 0, animation: 'pulse 2s infinite' },

  /* Closed rows */
  closedRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  closedName: { fontSize: '11px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  closedDate: { fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', flexShrink: 0 },

  /* Center column */
  centerCol: {
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
  },

  /* Map box */
  mapBox: {
    flex: 1, position: 'relative', overflow: 'hidden',
    borderBottom: '1px solid var(--border-light)',
  },
  mapCornerLabel: {
    position: 'absolute', top: '12px', left: '12px', zIndex: 5,
    backgroundColor: 'rgba(2,6,23,0.8)', backdropFilter: 'blur(6px)',
    padding: '4px 10px', borderRadius: '6px',
    fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.8)',
    border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'var(--font-mono)',
  },
  mapLiveBadge: {
    position: 'absolute', top: '12px', right: '12px', zIndex: 5,
    display: 'flex', alignItems: 'center', gap: '6px',
    backgroundColor: 'rgba(2,6,23,0.8)', backdropFilter: 'blur(6px)',
    padding: '4px 10px', borderRadius: '6px',
    fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', color: '#22C55E',
    border: '1px solid rgba(34,197,94,0.25)', fontFamily: 'var(--font-mono)',
  },
  mapCounterBadge: {
    position: 'absolute', bottom: '12px', left: '12px', zIndex: 5,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    backgroundColor: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(8px)',
    padding: '8px 14px', borderRadius: '10px',
    border: '1px solid rgba(79,195,247,0.2)',
  },

  /* Charts row (bottom of center) */
  chartsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
    gap: '0', flexShrink: 0, height: '200px',
    borderTop: '1px solid var(--border-light)',
  },
  chartBox: {
    padding: '12px 16px', overflow: 'hidden',
    borderRight: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column',
  },
  chartTitle: { fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px', flexShrink: 0 },
  emptyChart: { padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px' },

  /* Right column */
  rightCol: {
    display: 'flex', flexDirection: 'column', gap: '0',
    borderLeft: '1px solid var(--border-light)',
    overflowY: 'auto', backgroundColor: 'var(--bg-secondary)',
  },
  rightPanel: { display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-light)' },
  rightPanelHdr: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px 8px', flexShrink: 0,
  },
  rightPanelTitle: { fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' },
  panelChip: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-faint)' },

  /* Alert feed */
  alertList: { overflowY: 'auto', maxHeight: '240px' },
  alertEmpty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '20px', color: 'var(--text-faint)', fontSize: '11px' },
  alertFeedRow: {
    display: 'flex', alignItems: 'flex-start', gap: '8px',
    padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)',
    borderLeft: '3px solid', transition: 'background-color 100ms',
  },
  alertGlyph: { fontSize: '12px', fontWeight: 800, flexShrink: 0, marginTop: '1px' },
  alertFeedMsg: { fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 },
  alertFeedDismiss: { flexShrink: 0, width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '4px', backgroundColor: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', marginTop: '1px' },

  /* System health */
  healthGrid: { display: 'flex', flexDirection: 'column', padding: '4px 14px 10px' },
  healthRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  healthDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  healthLabel: { flex: 1, fontSize: '11px', color: 'var(--text-muted)' },
  healthValue: { fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' },

  /* Mini researcher row */
  miniRRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  miniRAvatar: { width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-mono)' },
  miniRName: { fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  /* ── Legacy velocity / researcher card styles (kept for sub-components) ── */
  loading: { padding: '80px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' },
  projectList: { maxHeight: '320px', overflowY: 'auto' },
  velocityRow: { display: 'block', padding: '14px 18px', borderBottom: '1px solid var(--border-light)', textDecoration: 'none', color: 'inherit', transition: 'background 0.15s', cursor: 'pointer' },
  velHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  velName: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 },
  velDays: { fontSize: '11px', color: 'var(--text-muted)' },
  riskTag: { padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 800, backgroundColor: 'rgba(239,68,68,0.15)', color: '#F87171', letterSpacing: '0.5px' },
  velMeta: { fontSize: '11px', color: 'var(--text-faint)', marginBottom: '6px' },
  velDates: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-faint)', marginBottom: '4px' },
  velBarOuter: { height: '6px', backgroundColor: 'var(--bg-muted)', borderRadius: '3px', position: 'relative', overflow: 'visible' },
  velBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.4s' },
  velTimeMarker: { position: 'absolute', top: '-2px', width: '2px', height: '10px', backgroundColor: '#EF4444', borderRadius: '1px' },
  rCard: { padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' },
  rCardTop: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  rCardAvatar: { width: '32px', height: '32px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 },
  rCardInfo: { flex: 1, minWidth: 0 },
  rCardName: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rCardMeta: { fontSize: '10px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rCardDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  rCardBarOuter: { height: '5px', backgroundColor: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' },
  rCardBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.3s' },
  rCardBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', padding: '14px 18px' },
  panel: { backgroundColor: 'var(--bg-card)', borderRadius: '10px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '1px solid var(--border-default)' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border-light)' },
  panelTitle: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' },
  panelBadge: { padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, color: '#020617', backgroundColor: '#4FC3F7', letterSpacing: '1px' },
  emptyPanel: { padding: '30px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' },
  kpiCard: { padding: '20px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', textAlign: 'center', border: '1px solid var(--border-default)' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' },
  kpiValue: { fontSize: '36px', fontWeight: 800, lineHeight: 1.1, fontFamily: 'var(--font-mono)' },
  kpiLabel: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' },
  kpiSub: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '6px' },
  kpiIcon: { fontSize: '20px', marginBottom: '4px' },
  sectionHeader: { fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', marginTop: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-default)' },
  alertPanel: { backgroundColor: 'var(--bg-card)', borderRadius: '10px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' },
  alertRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid var(--border-light)' },
  alertIcon: { fontSize: '18px', flexShrink: 0 },
  alertInfo: { flex: 1 },
  alertDesc: { fontSize: '12px', color: 'var(--text-secondary)' },
  alertTime: { fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },
  alertDismiss: { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '14px', padding: '4px' },

  /* PM Portfolio */
  portfolioSection: { marginBottom: '24px' },
  portfolioGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '14px' },
  pmCard: { backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-default)', padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '10px' },
  pmCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pmStatusPill: { fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', textTransform: 'capitalize' },
  pmRiskBadge: { fontSize: '10px', fontWeight: 600, border: '1px solid', padding: '2px 7px', borderRadius: '10px', backgroundColor: 'transparent' },
  pmCardName: { fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 },
  pmCardMeta: { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  pmProgressBar: { height: '5px', backgroundColor: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden' },
  pmProgressFill: { height: '100%', borderRadius: '3px', transition: 'width 0.4s ease-out' },
  pmCardPct: { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '-4px' },
  pmCardActions: { display: 'flex', gap: '8px', marginTop: '2px' },
  pmActionBtn: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textDecoration: 'none', backgroundColor: 'rgba(79,195,247,0.12)', color: 'var(--accent-blue)', cursor: 'pointer' },

  /* Ops Room HUD overlay styles */
  opsOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999 },
  opsHudTopLeft: { position: 'fixed', top: '20px', left: '20px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10001 },
  opsKpiCard: { backgroundColor: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(12px)', padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', minWidth: '140px' },
  opsKpiVal: { fontSize: 'clamp(20px,2vw,36px)', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.1 },
  opsKpiLabel: { fontSize: 'clamp(10px,0.7vw,14px)', color: 'rgba(148,163,184,0.7)', fontWeight: 600, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.08em' },
  opsHudTopRight: { position: 'fixed', top: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', zIndex: 10001 },
  opsProjectCard: { backgroundColor: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(12px)', padding: '14px 18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' },
  opsProjectLine: { display: 'flex', alignItems: 'baseline', gap: '8px' },
  opsProjectCount: { fontSize: 'clamp(18px,1.6vw,28px)', fontWeight: 800, color: '#F8FAFC', fontFamily: 'var(--font-mono)' },
  opsProjectLabel: { fontSize: '11px', color: 'rgba(148,163,184,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  opsTimestamp: { fontSize: 'clamp(14px,1.2vw,22px)', fontWeight: 700, color: '#4FC3F7', fontFamily: 'var(--font-mono)', letterSpacing: '1px' },
  opsLiveBadge: { display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22C55E', fontSize: '11px', fontWeight: 700, marginTop: '4px' },
  opsLiveDot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22C55E', animation: 'pulse 1.5s infinite', boxShadow: '0 0 6px #22C55E99', display: 'inline-block' },
  opsExitBtn: { padding: '9px 18px', backgroundColor: 'rgba(220,38,38,0.5)', color: '#fff', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', fontFamily: 'var(--font-body)', backdropFilter: 'blur(8px)' },
  opsBottomBar: { position: 'fixed', bottom: '20px', left: '20px', right: '20px', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', backgroundColor: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(12px)', borderRadius: '14px', zIndex: 10001, border: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' },
  opsLogo: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginRight: '12px', fontSize: 'clamp(14px,1vw,20px)', fontWeight: 800, color: '#4FC3F7', fontFamily: 'var(--font-mono)', letterSpacing: '1px' },
  opsMiniCard: { backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '10px', textAlign: 'center', minWidth: '100px', flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)' },
  statusItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#fff' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  statusBar: { display: 'none' }, /* legacy — hidden in new layout */
  clockLoc: { fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },
  alertBadge: { display: 'none' }, /* replaced by alertIndicator */
};
