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

  if (loading) return <div style={s.loading}>Initializing Decision Support System…</div>;

  return (
    <div style={s.page}>
      {/* Title bar */}
      <div style={s.topBar}>
        <div>
          <h1 style={s.title}>Command Center</h1>
          <div style={s.subtitle}>
            {role === 'project_manager' ? 'Portfolio Overview — SCAD MAP Operations' : 'Decision Support System — SCAD MAP Operations'}
            {lastUpdate && (
              <span style={s.liveIndicator}>
                <span style={s.liveDot} />
                LIVE
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={s.clockBlock}>
            <span style={s.clockTime}>{clock}</span>
            <span style={s.clockLoc}>Abu Dhabi, UAE · UTC+4</span>
          </div>
          <button onClick={() => setOpsMode(true)} style={s.opsBtn}>Ops Room</button>
          {alerts.length > 0 && <span style={s.alertBadge}>{alerts.length}</span>}
        </div>
      </div>

      {/* PM Portfolio View — visible only for project_manager role */}
      {role === 'project_manager' && activeProjects.length > 0 && (
        <div style={s.portfolioSection}>
          <div style={s.sectionHeader}>My Projects</div>
          <div style={s.portfolioGrid}>
            {activeProjects.slice(0, 6).map(p => (
              <PMProjectCard key={p.project_id} project={p} velocity={velocityData[p.project_id]} />
            ))}
          </div>
        </div>
      )}

      {/* ═══ Section I: Macro KPIs ═══ */}
      <div style={s.kpiRow}>
        <KPICard label="Total Operations" value={stats.total} icon="📊" color="#1976d2" sub={`${stats.active} active · ${stats.completed} closed · ${stats.paused} paused`} />
        <KPICard label="Active Operations" value={stats.active} icon="🟢" color="#2e7d32" sub={`${closedProjects.length} finalized`} />
        <KPICard label="Field Personnel" value={researchers.length} icon="👥" color="#00838f"
          sub={<><b style={{ color: '#2e7d32' }}>{inFieldCount}</b> deployed · <b style={{ color: '#e65100' }}>{standbyCount}</b> standby</>} />
        <KPICard label="Total Samples" value={stats.totalSamples} icon="📍" color="#4527a0"
          sub={`Across ${stats.total} operations`} />
      </div>

      {/* ═══ Section II: Project Lifecycle + Velocity ═══ */}
      <div style={s.sectionHeader}>Project Lifecycle Tracking</div>
      <div style={s.lifecycleGrid}>
        {/* Active operations with velocity bars */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Active Operations ({activeProjects.length})</span>
            <span style={s.panelBadge}>LIVE</span>
          </div>
          {activeProjects.length === 0 ? (
            <div style={s.emptyPanel}>No active operations</div>
          ) : (
            <div style={s.projectList}>
              {activeProjects.map((p) => <ProjectVelocityRow key={p.project_id} project={p} velocity={velocityData[p.project_id]} />)}
            </div>
          )}
        </div>

        {/* Closed operations */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Closed Operations ({closedProjects.length})</span>
          </div>
          {closedProjects.length === 0 ? (
            <div style={s.emptyPanel}>No closed operations</div>
          ) : (
            <div style={s.projectList}>
              {closedProjects.map((p) => (
                <Link key={p.project_id} to={`/projects/${p.project_id}`} style={s.closedRow}>
                  <span style={s.closedName}>{p.project_name}</span>
                  <span style={s.closedMeta}>{p.region} — {p.end_date}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section III: Charts ═══ */}
      <div style={s.chartsRow}>
        <div style={s.chartPanel}>
          <div style={s.panelTitle}>Operations Status</div>
          <DonutChart
            segments={[
              { label: 'Active', value: stats.active, color: '#2e7d32' },
              { label: 'Completed', value: stats.completed, color: '#6a1b9a' },
              { label: 'Paused', value: stats.paused, color: '#e65100' },
            ]}
          />
        </div>
        <div style={s.chartPanel}>
          <div style={s.panelTitle}>Sample Completion by Operation</div>
          <BarChart projects={projects.slice(0, 10)} />
        </div>
        <div style={s.chartPanel}>
          <div style={s.panelTitle}>Personnel Deployment</div>
          <DonutChart
            segments={[
              { label: 'In Field', value: inFieldCount, color: '#1976d2' },
              { label: 'Standby', value: standbyCount, color: '#ff9800' },
            ]}
          />
        </div>
      </div>

      {/* ═══ Section IV: Live Researcher Cards ═══ */}
      <div style={s.sectionHeader}>Field Personnel — Live Status</div>
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <span style={s.panelTitle}>Researcher Cards ({liveResearchers.length})</span>
          <span style={s.panelBadge}>LIVE</span>
        </div>
        {liveResearchers.length === 0 ? (
          <div style={s.emptyPanel}>No researchers assigned yet</div>
        ) : (
          <div style={s.cardGrid}>
            {liveResearchers.map((r) => (
              <ResearcherCard key={r.fw_id} researcher={r} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ Section V: Alert Feed ═══ */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={s.sectionHeader}>Real-Time Alert Feed ({alerts.length})</div>
          <div style={s.alertPanel}>
            {alerts.slice(0, 12).map((a) => (
              <div key={a.id} style={s.alertRow}>
                <span style={s.alertIcon}>
                  {a.type === 'geofence_breach' ? '🚨' : a.type === 'at_risk_project' ? '⚠️' : a.type === 'researcher_offline' ? '📡' : a.type === 'sample_invalid_cluster' ? '🔴' : '🔔'}
                </span>
                <div style={s.alertInfo}>
                  <div style={s.alertDesc}>{a.description}</div>
                  <div style={s.alertTime}>{new Date(a.timestamp).toLocaleTimeString()}</div>
                </div>
                <button
                  onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                  style={s.alertDismiss}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Section VI: Live Status Bar ═══ */}
      <div style={s.statusBar}>
        <div style={s.statusItem}>
          <span style={{ ...s.statusDot, backgroundColor: '#2e7d32' }} />
          <b>{inFieldCount}</b> Deployed
        </div>
        <div style={s.statusItem}>
          <span style={{ ...s.statusDot, backgroundColor: '#ff9800' }} />
          <b>{standbyCount}</b> Standby
        </div>
        <div style={s.statusItem}>
          <span style={{ ...s.statusDot, backgroundColor: '#1976d2' }} />
          <b>{stats.active}</b> Active Ops
        </div>
        <div style={s.statusItem}>
          <span style={{ ...s.statusDot, backgroundColor: '#6a1b9a' }} />
          <b>{stats.completed}</b> Closed
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>
          Auto-refresh: {REFRESH_INTERVAL / 1000}s
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
              style={{ fontSize: '26px', fontWeight: 800, fill: '#1a1a2e' }}>{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle"
              style={{ fontSize: '9px', fill: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>TOTAL</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: seg.color }} />
            <span style={{ color: '#555' }}>{seg.label}: <b>{seg.value}</b></span>
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
            <div style={{ fontSize: '10px', fontWeight: 700, color: pct >= 80 ? '#2e7d32' : '#666', marginBottom: '3px' }}>{pct}%</div>
            <div style={{ width: '100%', maxWidth: '36px', height: `${barH}px`, backgroundColor: '#e8eaf6', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${fillH}px`, backgroundColor: pct >= 80 ? '#2e7d32' : '#1976d2', borderRadius: '4px', transition: 'height 0.4s' }} />
            </div>
            <div style={{ fontSize: '8px', color: '#999', marginTop: '4px', textAlign: 'center', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
  page: { padding: '20px 28px', maxWidth: '1440px', margin: '0 auto' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { margin: 0, fontSize: '24px', fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.5px' },
  subtitle: { fontSize: '12px', color: '#888', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '12px' },
  liveIndicator: { display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#2e7d32', fontWeight: 600, fontSize: '11px' },
  liveDot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#2e7d32', animation: 'pulse 2s infinite', boxShadow: '0 0 6px #2e7d3266' },
  createBtn: {
    padding: '10px 24px', backgroundColor: '#1976d2', color: '#fff', borderRadius: '8px',
    textDecoration: 'none', fontSize: '13px', fontWeight: 700, letterSpacing: '0.3px',
    boxShadow: '0 2px 8px rgba(25,118,210,0.25)',
  },
  loading: { padding: '80px', textAlign: 'center', color: '#888', fontSize: '14px' },

  // KPI cards
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' },
  kpiCard: {
    padding: '20px', backgroundColor: '#fff', borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center',
    borderTop: '3px solid transparent', position: 'relative',
  },
  kpiIcon: { fontSize: '20px', marginBottom: '4px' },
  kpiValue: { fontSize: '36px', fontWeight: 800, lineHeight: 1.1 },
  kpiLabel: { fontSize: '11px', color: '#888', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' },
  kpiSub: { fontSize: '11px', color: '#aaa', marginTop: '6px' },

  // Section headers
  sectionHeader: {
    fontSize: '13px', fontWeight: 700, color: '#1a1a2e', textTransform: 'uppercase',
    letterSpacing: '1px', marginBottom: '12px', marginTop: '8px',
    paddingBottom: '8px', borderBottom: '2px solid #eee',
  },

  // Panels
  lifecycleGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '24px' },
  performanceGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' },
  panel: { backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f0f0f0' },
  panelTitle: { fontSize: '13px', fontWeight: 700, color: '#333' },
  panelBadge: { padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, color: '#fff', backgroundColor: '#1976d2', letterSpacing: '1px' },
  emptyPanel: { padding: '30px', textAlign: 'center', color: '#bbb', fontSize: '13px' },

  // Project velocity rows
  projectList: { maxHeight: '320px', overflowY: 'auto' },
  velocityRow: {
    display: 'block', padding: '14px 18px', borderBottom: '1px solid #f5f5f5',
    textDecoration: 'none', color: 'inherit', transition: 'background 0.15s', cursor: 'pointer',
  },
  velHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  velName: { fontSize: '14px', fontWeight: 600, color: '#1a1a2e', flex: 1 },
  velDays: { fontSize: '11px', color: '#888' },
  riskTag: { padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 800, backgroundColor: '#fce4ec', color: '#c62828', letterSpacing: '0.5px' },
  velMeta: { fontSize: '11px', color: '#999', marginBottom: '6px' },
  velDates: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', marginBottom: '4px' },
  velBarOuter: { height: '6px', backgroundColor: '#e8eaf6', borderRadius: '3px', position: 'relative', overflow: 'visible' },
  velBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.4s' },
  velTimeMarker: { position: 'absolute', top: '-2px', width: '2px', height: '10px', backgroundColor: '#c62828', borderRadius: '1px' },

  // Closed rows
  closedRow: {
    display: 'flex', justifyContent: 'space-between', padding: '10px 18px',
    borderBottom: '1px solid #f5f5f5', textDecoration: 'none', color: 'inherit', fontSize: '13px',
  },
  closedName: { fontWeight: 500, color: '#666' },
  closedMeta: { fontSize: '11px', color: '#aaa' },

  // Researcher live cards
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', padding: '14px 18px', maxHeight: '420px', overflowY: 'auto' },
  rCard: {
    padding: '12px 14px', borderRadius: '8px', border: '1px solid #f0f0f0',
    backgroundColor: '#fafbfc', transition: 'box-shadow 0.15s',
  },
  rCardTop: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  rCardAvatar: {
    width: '32px', height: '32px', borderRadius: '50%', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '14px', flexShrink: 0,
  },
  rCardInfo: { flex: 1, minWidth: 0 },
  rCardName: { fontSize: '13px', fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rCardMeta: { fontSize: '10px', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rCardDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, boxShadow: '0 0 0 2px #fff, 0 0 0 3px currentColor' },
  rCardBarOuter: { height: '5px', backgroundColor: '#e8eaf6', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' },
  rCardBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.3s' },
  rCardBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },

  // Charts
  chartsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' },
  chartPanel: { backgroundColor: '#fff', borderRadius: '10px', padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  emptyChart: { padding: '40px', textAlign: 'center', color: '#bbb', fontSize: '13px' },

  // Status bar (bottom)
  statusBar: {
    display: 'flex', alignItems: 'center', gap: '20px', padding: '12px 20px',
    backgroundColor: '#1a1a2e', borderRadius: '10px', color: '#fff', fontSize: '12px',
  },
  statusItem: { display: 'flex', alignItems: 'center', gap: '6px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },

  // Ops Room button + badge
  opsBtn: {
    padding: '10px 20px', backgroundColor: '#1a1a2e', color: '#4fc3f7', borderRadius: '8px',
    border: '1px solid #4fc3f7', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
    letterSpacing: '0.5px',
  },
  alertBadge: {
    backgroundColor: '#c62828', color: '#fff', borderRadius: '50%',
    width: '22px', height: '22px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '10px', fontWeight: 800,
  },

  // Alert feed
  alertPanel: { backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' },
  alertRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f5f5f5' },
  alertIcon: { fontSize: '18px', flexShrink: 0 },
  alertInfo: { flex: 1 },
  alertDesc: { fontSize: '12px', color: '#333' },
  alertTime: { fontSize: '10px', color: '#aaa' },
  alertDismiss: { border: 'none', background: 'none', cursor: 'pointer', color: '#ccc', fontSize: '14px', padding: '4px' },

  // Ops Room overlay — map fills viewport, KPIs overlay on top
  opsOverlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    zIndex: 9999,
  },
  opsHudTopLeft: {
    position: 'fixed', top: '20px', left: '20px',
    display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10001,
  },
  opsKpiCard: {
    backgroundColor: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(12px)',
    padding: '10px 20px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    minWidth: '140px',
  },
  opsKpiVal: {
    fontSize: 'clamp(20px, 2vw, 36px)', fontWeight: 800,
    fontFamily: 'var(--font-mono)', lineHeight: 1.1,
  },
  opsKpiLabel: {
    fontSize: 'clamp(10px, 0.7vw, 14px)', color: 'rgba(148,163,184,0.7)',
    fontWeight: 600, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  opsHudTopRight: {
    position: 'fixed', top: '20px', right: '20px',
    display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', zIndex: 10001,
  },
  opsProjectCard: {
    backgroundColor: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(12px)',
    padding: '14px 18px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px',
  },
  opsProjectLine: { display: 'flex', alignItems: 'baseline', gap: '8px' },
  opsProjectCount: { fontSize: 'clamp(18px, 1.6vw, 28px)', fontWeight: 800, color: '#F8FAFC', fontFamily: 'var(--font-mono)' },
  opsProjectLabel: { fontSize: '11px', color: 'rgba(148,163,184,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  opsTimestamp: { fontSize: 'clamp(14px, 1.2vw, 22px)', fontWeight: 700, color: '#4FC3F7', fontFamily: 'var(--font-mono)', letterSpacing: '1px' },
  opsLiveBadge: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '5px 10px', borderRadius: '6px',
    backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
    color: '#22C55E', fontSize: '11px', fontWeight: 700, marginTop: '4px',
  },
  opsLiveDot: {
    width: '7px', height: '7px', borderRadius: '50%',
    backgroundColor: '#22C55E', animation: 'pulse 1.5s infinite',
    boxShadow: '0 0 6px #22C55E99', display: 'inline-block',
  },
  opsExitBtn: {
    padding: '9px 18px', backgroundColor: 'rgba(220,38,38,0.5)', color: '#fff',
    border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', cursor: 'pointer',
    fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px',
    fontFamily: 'var(--font-body)',
    backdropFilter: 'blur(8px)',
  },
  opsBottomBar: {
    position: 'fixed', bottom: '20px', left: '20px', right: '20px',
    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px',
    backgroundColor: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(12px)',
    borderRadius: '14px', zIndex: 10001, border: '1px solid rgba(255,255,255,0.08)',
    overflowX: 'auto',
  },
  opsLogo: {
    display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginRight: '12px',
    fontSize: 'clamp(14px, 1vw, 20px)', fontWeight: 800, color: '#4FC3F7',
    fontFamily: 'var(--font-mono)', letterSpacing: '1px',
  },
  opsMiniCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: '10px 16px', borderRadius: '10px', textAlign: 'center', minWidth: '100px',
    flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)',
  },

  // Live clock block in top bar
  clockBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px',
    padding: '6px 12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px',
    border: '1px solid var(--border-default)',
  },
  clockTime: {
    fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)', letterSpacing: '1px', lineHeight: 1.1,
  },
  clockLoc: {
    fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
    letterSpacing: '0.5px',
  },

  // PM Portfolio section
  portfolioSection: { marginBottom: '24px' },
  portfolioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '14px',
  },
  pmCard: {
    backgroundColor: 'var(--bg-card)', borderRadius: '12px',
    border: '1px solid var(--border-default)', padding: '16px',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex', flexDirection: 'column', gap: '10px',
    transition: 'box-shadow 150ms ease-out',
  },
  pmCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pmStatusPill: {
    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
    textTransform: 'capitalize', letterSpacing: '0.05em',
  },
  pmRiskBadge: {
    fontSize: '10px', fontWeight: 600, border: '1px solid', padding: '2px 7px',
    borderRadius: '10px', backgroundColor: 'transparent',
  },
  pmCardName: {
    fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
    lineHeight: 1.3, fontFamily: 'var(--font-body)',
  },
  pmCardMeta: {
    fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
  },
  pmProgressBar: {
    height: '5px', backgroundColor: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden',
  },
  pmProgressFill: { height: '100%', borderRadius: '3px', transition: 'width 0.4s ease-out' },
  pmCardPct: {
    fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
    marginTop: '-4px',
  },
  pmCardActions: { display: 'flex', gap: '8px', marginTop: '2px' },
  pmActionBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
    textDecoration: 'none', backgroundColor: 'rgba(79,195,247,0.12)',
    color: 'var(--accent-blue)', transition: 'background-color 150ms ease-out',
    cursor: 'pointer',
  },
};
