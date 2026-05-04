import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { initSCADMap } from '../tileConfig';
import LiveMap from './LiveMap';
import {
  fetchEconomicProject, uploadEconomicSample, fetchSampleStats,
  fetchStaffingPlan, runAllocation, fetchAllocation,
  reassignCompanies, fetchCompanies, fetchEnumerators,
  updateEconomicProject, deleteEconomicProject,
  uploadSurveyTargets, fetchSurveyTargetStats, fetchSurveyTargets,
  runSocialAllocation, fetchSocialAllocation,
} from '../api';

const STRATUM_COLORS = { 1: '#9e9e9e', 2: '#42a5f5', 3: '#ff9800', 4: '#ef5350' };
const STRATUM_LABELS = { 1: 'Micro (1–9)', 2: 'Small (10–49)', 3: 'Medium (50–249)', 4: 'Large (250+)' };
const RESEARCHER_COLORS = [
  '#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#00acc1',
  '#6d4c41','#d81b60','#3949ab','#00897b','#f4511e','#7cb342',
  '#546e7a','#c0ca33','#5e35b1','#039be5','#c62828','#2e7d32','#ef6c00','#4527a0',
];

export default function EconomicProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [staffing, setStaffing] = useState(null);
  const [allocation, setAllocation] = useState(null);
  const [team, setTeam] = useState([]);
  const [controllers, setControllers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const p = await fetchEconomicProject(projectId);
      setProject(p);
      const saved = localStorage.getItem(`project_team_${projectId}`);
      if (saved) setTeam(JSON.parse(saved));
      const savedCtrl = localStorage.getItem(`project_controllers_${projectId}`);
      if (savedCtrl) setControllers(JSON.parse(savedCtrl));
      const st = await fetchStaffingPlan(projectId);
      setStaffing(st);
      if (p.company_count > 0) {
        const s = await fetchSampleStats(projectId);
        setStats(s);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  const isSocial = project?.project_type === 'social';

  const handleUpload = async (file) => {
    setUploading(true);
    setError('');
    try {
      const result = isSocial
        ? await uploadSurveyTargets(projectId, file)
        : await uploadEconomicSample(projectId, file);
      if (result.errors?.length > 0) {
        setError(`Uploaded ${result.inserted} rows. ${result.errors.length} errors.`);
      }
      await loadProject();
      setTab('stats');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAllocate = async () => {
    setAllocating(true);
    setError('');
    try {
      if (isSocial) {
        await runSocialAllocation(projectId);
        const alloc = await fetchSocialAllocation(projectId);
        setAllocation(alloc);
      } else {
        await runAllocation(projectId);
        const alloc = await fetchAllocation(projectId);
        setAllocation(alloc);
      }
      setTab('map');
      await loadProject();
    } catch (err) {
      setError(err.message);
    } finally {
      setAllocating(false);
    }
  };

  const handleTeamChange = (newTeam) => {
    setTeam(newTeam);
    localStorage.setItem(`project_team_${projectId}`, JSON.stringify(newTeam));
  };

  const handleControllersChange = (newCtrl) => {
    setControllers(newCtrl);
    localStorage.setItem(`project_controllers_${projectId}`, JSON.stringify(newCtrl));
  };

  const loadAllocation = async () => {
    try {
      const alloc = isSocial
        ? await fetchSocialAllocation(projectId)
        : await fetchAllocation(projectId);
      setAllocation(alloc);
    } catch { /* no allocation yet */ }
  };

  const handleHeaderEdit = () => {
    setEditingHeader(true);
    setHeaderForm({
      name: project.name,
      status: project.status,
      start_date: project.start_date || '',
      end_date: project.end_date || '',
    });
  };

  const handleHeaderSave = async () => {
    try {
      const updated = await updateEconomicProject(projectId, headerForm);
      setProject(updated);
      setEditingHeader(false);
    } catch (err) {
      setError('Failed to update: ' + err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEconomicProject(projectId);
      navigate('/surveys');
    } catch (err) {
      setError('Failed to delete: ' + err.message);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) return <div style={s.page}><div style={s.loading}>Loading project...</div></div>;
  if (!project) return <div style={s.page}><div style={s.error}>{error || 'Project not found'}</div></div>;

  const companyCount = project.company_count || 0;
  const targetCount = project.target_count || 0;
  const hasData = isSocial ? targetCount > 0 : companyCount > 0;
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'upload', label: isSocial ? 'Upload Targets' : 'Upload Sample' },
    { key: 'stats', label: 'Statistics', disabled: !hasData },
    { key: 'team', label: 'Research Team' },
    { key: 'review', label: 'Review', disabled: !hasData },
    { key: 'map', label: 'Allocation Map', disabled: !hasData },
    ...(isSocial ? [{ key: 'live', label: 'Live Map' }] : []),
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        {editingHeader ? (
          <div style={s.headerEditForm}>
            <input
              style={s.headerEditInput}
              value={headerForm.name}
              onChange={(e) => setHeaderForm({ ...headerForm, name: e.target.value })}
              placeholder="Project name"
            />
            <div style={s.headerEditRow}>
              <select
                style={s.headerEditSelect}
                value={headerForm.status}
                onChange={(e) => setHeaderForm({ ...headerForm, status: e.target.value })}
              >
                {['setup', 'active', 'in_progress', 'completed', 'paused'].map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <input style={s.headerEditDate} type="date" value={headerForm.start_date} onChange={(e) => setHeaderForm({ ...headerForm, start_date: e.target.value })} />
              <input style={s.headerEditDate} type="date" value={headerForm.end_date} onChange={(e) => setHeaderForm({ ...headerForm, end_date: e.target.value })} />
            </div>
            <div style={s.headerEditActions}>
              <button style={s.headerSaveBtn} onClick={handleHeaderSave}>Save Changes</button>
              <button style={s.headerCancelBtn} onClick={() => setEditingHeader(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 style={s.title}>{project.name}</h1>
              <div style={s.meta}>
                <span style={s.badge(project.project_type)}>{project.project_type}</span>
                <span style={s.badge(project.status)}>{project.status}</span>
                <span style={s.metaText}>{companyCount} companies</span>
                {project.start_date && <span style={s.metaText}>{project.start_date} → {project.end_date}</span>}
              </div>
            </div>
            <div style={s.headerActions}>
              <button style={s.editHeaderBtn} onClick={handleHeaderEdit}>Edit</button>
              <button style={s.deleteHeaderBtn} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={s.modalOverlay} onClick={() => setShowDeleteConfirm(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalTitle}>Delete Project</div>
            <div style={s.modalText}>
              Are you sure you want to delete <strong>{project.name}</strong>?
              This will permanently remove all companies, allocations, and data.
            </div>
            <div style={s.modalActions}>
              <button style={s.headerCancelBtn} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button style={s.deleteConfirmBtn} onClick={handleDelete}>Delete Project</button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {/* Tabs */}
      <div style={s.tabs}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key === 'map') loadAllocation(); }}
            disabled={t.disabled}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}), ...(t.disabled ? s.tabDisabled : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={tab === 'live' ? { flex: 1, overflow: 'hidden' } : s.content}>
        {tab === 'overview' && <OverviewTab project={project} stats={stats} staffing={staffing} team={team} controllers={controllers} />}
        {tab === 'upload' && <UploadTab onUpload={handleUpload} uploading={uploading} isSocial={isSocial} collectionMode={project.collection_mode} />}
        {tab === 'stats' && isSocial && <SocialStatsTab projectId={projectId} />}
        {tab === 'stats' && !isSocial && stats && <StatsTab stats={stats} />}
        {tab === 'team' && (
          <TeamTab
            project={project}
            staffing={staffing}
            team={team}
            onTeamChange={handleTeamChange}
            controllers={controllers}
            onControllersChange={handleControllersChange}
            projectId={projectId}
          />
        )}
        {tab === 'review' && (
          <ReviewTab projectId={projectId} team={team} controllers={controllers} isSocial={isSocial} allocation={allocation} project={project} />
        )}
        {tab === 'map' && (
          <MapTab
            projectId={projectId}
            allocation={allocation}
            onAllocate={handleAllocate}
            allocating={allocating}
            numResearchers={project.num_researchers}
            team={team}
            isSocial={isSocial}
          />
        )}
        {tab === 'live' && isSocial && (
          <div style={{ height: 'calc(100vh - 180px)' }}>
            <LiveMap projectId={projectId} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────

function OverviewTab({ project, stats, staffing, team, controllers }) {
  const companyCount = project.company_count || 0;
  const totalSamples = project.total_samples || companyCount;
  const workingDays = project.working_days || 0;
  const numResearchers = project.num_researchers || 0;
  const controllersNeeded = project.controllers_needed || staffing?.controllers_needed || 0;
  const dailyTarget = workingDays > 0 ? Math.ceil(totalSamples / workingDays) : 0;
  const perResearcher = numResearchers > 0 ? Math.ceil(dailyTarget / numResearchers) : 0;
  const completedCount = project.completed_count || 0;
  const pendingCount = companyCount - completedCount;
  const progress = companyCount > 0 ? Math.round((completedCount / companyCount) * 100) : 0;
  const workforceRoles = project.workforce_roles || null;
  const STANDARD_MONTH_DAYS = 22;
  const fmtAED = (v) => v != null ? Math.round(v).toLocaleString() : '—';

  return (
    <div style={s.tabContent}>
      {/* Primary KPIs */}
      {project.project_type === 'social' ? (
        <div style={s.kpiRow}>
          <KPI label="Enumeration Areas" value={project.target_count || 0} />
          <KPI label="Total Households" value={project.total_households || 0} color="#1976d2" />
          <KPI label="Reserves" value={project.total_reserves || 0} color="#ff9800" />
          <KPI label="Collection Mode" value={
            project.collection_mode === 'areas' ? 'Areas' :
            project.collection_mode === 'locations' ? 'Locations' : 'Mixed'
          } />
          <KPI label="Areas/Researcher" value={project.targets_per_researcher || 14} color="#1976d2" />
          <KPI label="HH/Area" value={project.households_per_area || 4} color="#43a047" />
        </div>
      ) : (
        <div style={s.kpiRow}>
          <KPI label="Total Samples" value={totalSamples} />
          <KPI label="Companies Uploaded" value={companyCount} />
          <KPI label="Completed" value={completedCount} color="#43a047" />
          <KPI label="Pending" value={pendingCount} color="#ff9800" />
          <KPI label="Progress" value={`${progress}%`} color={progress >= 80 ? '#43a047' : progress >= 40 ? '#ff9800' : '#e53935'} />
        </div>
      )}

      {/* Locked Staffing Plan — read-only from project creation */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Locked Staffing Plan</h3>
        <p style={{ fontSize: '11px', color: '#888', margin: '0 0 12px' }}>Set at project creation. To change, delete and recreate the project.</p>

        {workforceRoles ? (
          <>
            <div style={s.kpiRow}>
              <KPI label="Working Days" value={workingDays || '—'} />
              <KPI label="Daily Target" value={dailyTarget || '—'} color="#1976d2" />
              <KPI label="Per Researcher/Day" value={perResearcher || '—'} color="#1976d2" />
              {project.budget > 0 && <KPI label="Budget" value={`${fmtAED(project.budget)} AED`} color="#e65100" />}
            </div>
            <table style={{ ...s.table, marginTop: '14px' }}>
              <thead>
                <tr>
                  <th style={s.th}>Role</th>
                  <th style={s.th}>Monthly Salary</th>
                  <th style={s.th}>Headcount</th>
                  <th style={s.th}>Project Cost</th>
                  <th style={s.th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {workforceRoles.filter((r) => r.count > 0).map((r, i) => {
                  const dailyRate = r.monthly_salary / STANDARD_MONTH_DAYS;
                  const projectCost = Math.round(dailyRate * workingDays * r.count);
                  return (
                    <tr key={i}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{r.name}</td>
                      <td style={s.td}>{fmtAED(r.monthly_salary)} AED</td>
                      <td style={{ ...s.td, fontWeight: 700, color: r.is_field_worker ? '#1976d2' : '#e65100' }}>{r.count}</td>
                      <td style={s.td}>{fmtAED(projectCost)} AED</td>
                      <td style={s.td}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
                          backgroundColor: r.is_field_worker ? '#e3f2fd' : '#fff3e0',
                          color: r.is_field_worker ? '#1565c0' : '#e65100',
                        }}>
                          {r.is_field_worker ? 'Field Worker' : 'Staff'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ backgroundColor: '#f5f7fa' }}>
                  <td style={{ ...s.td, fontWeight: 700 }}>Total</td>
                  <td style={s.td}></td>
                  <td style={{ ...s.td, fontWeight: 700 }}>
                    {workforceRoles.reduce((sum, r) => sum + (r.count || 0), 0)}
                  </td>
                  <td style={{ ...s.td, fontWeight: 700 }}>
                    {fmtAED(workforceRoles.reduce((sum, r) => {
                      const cost = (r.monthly_salary / STANDARD_MONTH_DAYS) * workingDays * (r.count || 0);
                      return sum + cost;
                    }, 0))} AED
                  </td>
                  <td style={s.td}></td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <div style={s.kpiRow}>
            <KPI label="Working Days" value={workingDays || '—'} />
            <KPI label="Enumerators" value={numResearchers || '—'} color="#1976d2" />
            <KPI label="Controllers" value={controllersNeeded || '—'} color="#ff9800" />
            <KPI label="Daily Target" value={dailyTarget || '—'} color="#1976d2" />
            <KPI label="Per Researcher/Day" value={perResearcher || '—'} color="#1976d2" />
          </div>
        )}
      </div>

      {/* Optimal Plan */}
      {companyCount > 0 && numResearchers > 0 && workingDays > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Optimal Plan Summary</h3>
          <div style={s.formulaBox}>
            <div><strong>{totalSamples}</strong> samples ÷ <strong>{workingDays}</strong> days = <strong>{dailyTarget}</strong> samples/day</div>
            <div><strong>{dailyTarget}</strong> daily ÷ <strong>{numResearchers}</strong> researchers = <strong>{perResearcher}</strong> per researcher/day</div>
            {perResearcher > 8 && (
              <div style={{ color: '#e53935', marginTop: '6px' }}>
                High workload! Consider adding more researchers or extending project days.
              </div>
            )}
            {perResearcher > 0 && perResearcher <= 3 && (
              <div style={{ color: '#43a047', marginTop: '6px' }}>
                Workload is balanced — {perResearcher} companies per researcher per day is optimal.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Team summary */}
      {(team.length > 0 || controllers.length > 0) && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Team Assignment Status</h3>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
            <SummaryItem label="Enumerators" required={numResearchers} assigned={team.length} />
            <SummaryItem label="Controllers" required={controllersNeeded} assigned={controllers.length} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {team.map((r) => (
              <span key={r.id} style={s.teamChip}>{r.name}</span>
            ))}
            {controllers.map((c) => (
              <span key={c.id} style={{ ...s.teamChip, backgroundColor: '#fff3e0', color: '#e65100' }}>{c.name} (C)</span>
            ))}
          </div>
        </div>
      )}

      {/* Stratum distribution */}
      {stats && stats.stratum_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Stratum Distribution</h3>
          <div style={s.barChart}>
            {stats.stratum_breakdown.map((b) => (
              <div key={b.stratum} style={s.barRow}>
                <div style={s.barLabel}>{STRATUM_LABELS[b.stratum]}</div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${b.pct}%`, backgroundColor: STRATUM_COLORS[b.stratum] }} />
                </div>
                <div style={s.barValue}>{b.count} ({b.pct}%)</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, color }) {
  return (
    <div style={s.kpi}>
      <div style={{ ...s.kpiValue, color: color || '#333' }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
    </div>
  );
}

function SummaryItem({ label, required, assigned }) {
  const remaining = required - assigned;
  const color = assigned === 0 && required > 0 ? '#9e9e9e' : assigned === required ? '#43a047' : assigned > required ? '#e53935' : '#9e9e9e';

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={s.summaryLabel}>{label}</div>
      <div style={{ ...s.summaryNumber, color }}>
        {assigned} / {required}
      </div>
      <div style={s.summaryRemaining}>
        {remaining > 0 ? `Remaining: ${remaining}` : remaining === 0 ? 'Complete' : `Over by ${Math.abs(remaining)}`}
      </div>
    </div>
  );
}

// ── Upload Tab ───────────────────────────────────────────────────

function _generateTemplateCSV(count = 800) {
  const districts = {
    'AD-C': [
      ['AD-C-01', 24.469, 54.338, 'Al Khalidiya', '\u0627\u0644\u062e\u0627\u0644\u062f\u064a\u0629'],
      ['AD-C-02', 24.456, 54.348, 'Al Bateen', '\u0627\u0644\u0628\u0637\u064a\u0646'],
      ['AD-C-03', 24.453, 54.383, 'Al Mushrif', '\u0627\u0644\u0645\u0634\u0631\u0641'],
      ['AD-C-04', 24.451, 54.411, 'Al Muroor', '\u0627\u0644\u0645\u0631\u0648\u0631'],
      ['AD-C-05', 24.484, 54.368, 'Al Danah', '\u0627\u0644\u062f\u0627\u0646\u0629'],
      ['AD-C-06', 24.494, 54.381, 'Al Zahiyah', '\u0627\u0644\u0632\u0627\u0647\u064a\u0629'],
      ['AD-C-07', 24.478, 54.346, 'Al Hosn', '\u0627\u0644\u062d\u0635\u0646'],
      ['AD-C-08', 24.467, 54.384, 'Al Wahdah', '\u0627\u0644\u0648\u062d\u062f\u0629'],
      ['AD-C-09', 24.458, 54.364, 'Al Karama', '\u0627\u0644\u0643\u0631\u0627\u0645\u0629'],
      ['AD-C-10', 24.495, 54.406, 'Al Reem Island', '\u062c\u0632\u064a\u0631\u0629 \u0627\u0644\u0631\u064a\u0645'],
      ['AD-C-11', 24.502, 54.388, 'Al Maryah Island', '\u062c\u0632\u064a\u0631\u0629 \u0627\u0644\u0645\u0627\u0631\u064a\u0629'],
      ['AD-C-12', 24.542, 54.437, 'Saadiyat Island', '\u062c\u0632\u064a\u0631\u0629 \u0627\u0644\u0633\u0639\u062f\u064a\u0627\u062a'],
      ['AD-C-13', 24.496, 54.606, 'Yas Island', '\u062c\u0632\u064a\u0631\u0629 \u064a\u0627\u0633'],
    ],
    'AD-M': [
      ['AD-M-01', 24.418, 54.582, 'Khalifa City', '\u0645\u062f\u064a\u0646\u0629 \u062e\u0644\u064a\u0641\u0629'],
      ['AD-M-02', 24.336, 54.547, 'Mohammed Bin Zayed City', '\u0645\u062f\u064a\u0646\u0629 \u0645\u062d\u0645\u062f \u0628\u0646 \u0632\u0627\u064a\u062f'],
      ['AD-M-03', 24.409, 54.613, 'Shakhbout City', '\u0645\u062f\u064a\u0646\u0629 \u0634\u062e\u0628\u0648\u0637'],
      ['AD-M-04', 24.363, 54.505, 'Mussafah', '\u0627\u0644\u0645\u0635\u0641\u062d'],
      ['AD-M-05', 24.411, 54.512, 'Rabdan', '\u0631\u0628\u062f\u0627\u0646'],
      ['AD-M-06', 24.412, 54.488, 'Al Maqta', '\u0627\u0644\u0645\u0642\u0637\u0639'],
      ['AD-M-07', 24.437, 54.576, 'Al Raha Beach', '\u0634\u0627\u0637\u0626 \u0627\u0644\u0631\u0627\u062d\u0629'],
      ['AD-M-08', 24.438, 54.518, 'Sas Al Nakhl', '\u0633\u0627\u0633 \u0627\u0644\u0646\u062e\u0644'],
    ],
    'AD-W': [
      ['AD-W-01', 24.301, 54.636, 'Bani Yas', '\u0628\u0646\u064a \u064a\u0627\u0633'],
      ['AD-W-02', 24.385, 54.707, 'Al Shamkha', '\u0627\u0644\u0634\u0627\u0645\u062e\u0629'],
      ['AD-W-03', 24.331, 54.675, 'Al Shawamekh', '\u0627\u0644\u0634\u0648\u0627\u0645\u062e'],
      ['AD-W-04', 24.444, 54.698, 'Al Falah', '\u0627\u0644\u0641\u0644\u0627\u062d'],
      ['AD-W-05', 24.316, 54.729, 'Riyadh City', '\u0645\u062f\u064a\u0646\u0629 \u0627\u0644\u0631\u064a\u0627\u0636'],
      ['AD-W-06', 24.256, 54.718, 'Al Wathba', '\u0627\u0644\u0648\u062b\u0628\u0629'],
      ['AD-W-07', 24.288, 54.609, 'Al Mafraq', '\u0627\u0644\u0645\u0641\u0631\u0642'],
    ],
    'AD-S': [
      ['AD-S-01', 24.545, 54.686, 'Al Shahama', '\u0627\u0644\u0634\u0647\u0627\u0645\u0629'],
      ['AD-S-02', 24.551, 54.662, 'Al Bahyah', '\u0627\u0644\u0628\u0627\u0647\u064a\u0629'],
      ['AD-S-03', 24.591, 54.717, 'Al Rahbah', '\u0627\u0644\u0631\u062d\u0628\u0629'],
      ['AD-S-04', 24.646, 54.757, 'Al Samhah', '\u0627\u0644\u0633\u0645\u062d\u0629'],
      ['AD-S-05', 24.459, 54.664, 'Al Reef', '\u0627\u0644\u0631\u064a\u0641'],
      ['AD-S-06', 24.851, 54.881, 'Ghantoot', '\u063a\u0646\u062a\u0648\u062a'],
    ],
  };
  const weights = { 'AD-C': 0.38, 'AD-M': 0.28, 'AD-W': 0.20, 'AD-S': 0.14 };
  const rows = [];
  let eaNum = 1;

  for (const [center, weight] of Object.entries(weights)) {
    const dists = districts[center];
    const centerCount = Math.round(count * weight);
    const perDist = Math.floor(centerCount / dists.length);
    const rem = centerCount - perDist * dists.length;

    for (let di = 0; di < dists.length; di++) {
      const [dCode, baseLat, baseLon, nameEn, nameAr] = dists[di];
      const n = perDist + (di < rem ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const lat = (baseLat + (Math.random() - 0.5) * 0.03).toFixed(6);
        const lon = (baseLon + (Math.random() - 0.5) * 0.03).toFixed(6);
        const hh = Math.floor(Math.random() * 200) + 50;
        rows.push([
          `EA-${String(eaNum++).padStart(5, '0')}`,
          `${nameEn} Sector ${j + 1}`,
          `${nameAr} \u0642\u0637\u0627\u0639 ${j + 1}`,
          lat, lon, dCode, nameEn, nameAr, center, hh,
        ]);
      }
    }
  }

  const header = 'ea_code,name_en,name_ar,latitude,longitude,district_code,district_en,district_ar,municipal_center,household_count';
  // BOM for Excel Arabic support
  return '\uFEFF' + header + '\n' + rows.map((r) => r.join(',')).join('\n');
}

function _downloadCSV(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function UploadTab({ onUpload, uploading, isSocial, collectionMode }) {
  const [file, setFile] = useState(null);
  const handleDrop = (e) => { e.preventDefault(); setFile(e.dataTransfer?.files?.[0]); };

  const handleDownloadTemplate = () => {
    const csv = _generateTemplateCSV(800);
    _downloadCSV(csv, 'enumeration_areas_template_800.csv');
  };

  return (
    <div style={s.tabContent}>
      <div style={s.card}>
        <h3 style={s.cardTitle}>{isSocial ? 'Upload Survey Targets' : 'Upload Sample File'}</h3>
        {isSocial ? (
          <>
            <p style={s.hint}>Upload a CSV file with survey targets ({collectionMode === 'locations' ? 'fixed locations' : collectionMode === 'mixed' ? 'areas and locations' : 'enumeration areas'}).</p>
            {(collectionMode === 'areas' || collectionMode === 'mixed') && (
              <p style={s.hint}>
                <strong>Area columns:</strong> <code>ea_code</code>, <code>name_en</code>, <code>name_ar</code>, <code>latitude</code>, <code>longitude</code>,
                <code>district_code</code>, <code>district_en</code>, <code>district_ar</code>, <code>municipal_center</code>, <code>household_count</code>
              </p>
            )}
            {(collectionMode === 'locations' || collectionMode === 'mixed') && (
              <p style={s.hint}>
                <strong>Location columns:</strong> <code>code</code>, <code>name_en</code>, <code>name_ar</code>, <code>category</code>, <code>latitude</code>, <code>longitude</code>,
                <code>district_code</code>, <code>district_en</code>, <code>district_ar</code>, <code>municipal_center</code>
              </p>
            )}
            <p style={s.hint}>Households will be auto-generated for area targets based on your project settings.</p>

            {/* Download Template */}
            <div style={{ marginTop: '12px', padding: '12px 16px', backgroundColor: '#e8f5e9', borderRadius: '8px', border: '1px solid #c8e6c9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#2e7d32' }}>Template CSV (800 EAs)</div>
                <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Abu Dhabi — 4 municipal centers, 34 districts, bilingual</div>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                style={{ padding: '6px 16px', backgroundColor: '#43a047', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Download Template
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={s.hint}>Upload an Excel (.xlsx) or CSV file with company data.</p>
            <p style={s.hint}>
              Required columns: <code>company_id</code>, <code>company_name</code>, <code>latitude</code>, <code>longitude</code>,
              <code>isic_code</code>, <code>num_employees</code>
            </p>
            <p style={s.hint}>Optional: <code>stratum</code>, <code>region</code>, <code>address</code></p>
          </>
        )}

        <div style={s.dropZone} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          {file ? (
            <div style={s.fileName}>
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
              <button onClick={() => setFile(null)} style={s.removeFile}>Remove</button>
            </div>
          ) : (
            <>
              <label style={s.browseBtn}>
                Browse...
                <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0])} />
              </label>
              <div style={s.dropHint}>or drag & drop (.csv / .xlsx)</div>
            </>
          )}
        </div>

        {file && (
          <button onClick={() => onUpload(file)} disabled={uploading} style={s.submitBtn}>
            {uploading ? 'Uploading...' : 'Upload & Process'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Stats Tab ────────────────────────────────────────────────────

function StatsTab({ stats }) {
  return (
    <div style={s.tabContent}>
      <div style={s.kpiRow}>
        <KPI label="Total Companies" value={stats.total_companies} />
      </div>

      <div style={s.card}>
        <h3 style={s.cardTitle}>By Stratum (Employee Count)</h3>
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>Stratum</th><th style={s.th}>Label</th><th style={s.th}>Count</th><th style={s.th}>%</th></tr>
          </thead>
          <tbody>
            {stats.stratum_breakdown.map((b) => (
              <tr key={b.stratum}>
                <td style={s.td}><span style={{ ...s.dot, backgroundColor: STRATUM_COLORS[b.stratum] }} />{b.stratum}</td>
                <td style={s.td}>{b.label}</td>
                <td style={s.td}>{b.count}</td>
                <td style={s.td}>{b.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats.isic_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>By ISIC Section</h3>
          <table style={s.table}>
            <thead>
              <tr><th style={s.th}>Section</th><th style={s.th}>Description</th><th style={s.th}>Count</th><th style={s.th}>%</th></tr>
            </thead>
            <tbody>
              {stats.isic_breakdown.map((b) => (
                <tr key={b.section}>
                  <td style={s.td}><strong>{b.section}</strong></td>
                  <td style={s.td}>{b.name}</td>
                  <td style={s.td}>{b.count}</td>
                  <td style={s.td}>{b.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stats.cross_table?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>ISIC Section x Stratum Cross-Table</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>ISIC</th><th style={s.th}>Name</th>
                  <th style={s.th}>S1 (Micro)</th><th style={s.th}>S2 (Small)</th>
                  <th style={s.th}>S3 (Medium)</th><th style={s.th}>S4 (Large)</th>
                  <th style={s.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.cross_table.map((row) => (
                  <tr key={row.section}>
                    <td style={s.td}><strong>{row.section}</strong></td>
                    <td style={s.td}>{row.name}</td>
                    <td style={s.td}>{row.stratum_1}</td>
                    <td style={s.td}>{row.stratum_2}</td>
                    <td style={s.td}>{row.stratum_3}</td>
                    <td style={s.td}>{row.stratum_4}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.region_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>By Region</h3>
          {stats.region_breakdown.map((r) => (
            <div key={r.region} style={s.regionRow}>
              <span>{r.region}</span>
              <span style={s.regionCount}>{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Social Stats Tab ─────────────────────────────────────────────

function SocialStatsTab({ projectId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSurveyTargetStats(projectId)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div style={s.tabContent}><p style={s.hint}>Loading statistics...</p></div>;
  if (!stats) return <div style={s.tabContent}><p style={s.hint}>No data available.</p></div>;

  return (
    <div style={s.tabContent}>
      <div style={s.kpiRow}>
        <KPI label="Total Targets" value={stats.total_targets} />
        <KPI label="Areas" value={stats.total_areas} color="#1976d2" />
        <KPI label="Locations" value={stats.total_locations} color="#7b1fa2" />
        <KPI label="Households" value={stats.total_households} color="#43a047" />
        <KPI label="Reserves" value={stats.total_reserves} color="#ff9800" />
      </div>

      {stats.center_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>By Municipal Center</h3>
          <div style={s.barChart}>
            {stats.center_breakdown.map((b) => (
              <div key={b.center} style={s.barRow}>
                <div style={s.barLabel}>{b.center}</div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${b.pct}%`, backgroundColor: '#e65100' }} />
                </div>
                <div style={s.barValue}>{b.count} ({b.pct}%)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.district_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>By District</h3>
          <div style={s.barChart}>
            {stats.district_breakdown.map((b) => (
              <div key={b.district} style={s.barRow}>
                <div style={s.barLabel}>{b.district}</div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${b.pct}%`, backgroundColor: '#1976d2' }} />
                </div>
                <div style={s.barValue}>{b.count} ({b.pct}%)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.stratum_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>By Stratum (Urban/Rural)</h3>
          <table style={s.table}>
            <thead>
              <tr><th style={s.th}>Stratum</th><th style={s.th}>Count</th><th style={s.th}>%</th></tr>
            </thead>
            <tbody>
              {stats.stratum_breakdown.map((b) => (
                <tr key={b.stratum}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{b.stratum}</td>
                  <td style={s.td}>{b.count}</td>
                  <td style={s.td}>{b.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stats.housing_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Household Types</h3>
          <div style={s.barChart}>
            {stats.housing_breakdown.map((b) => (
              <div key={b.type} style={s.barRow}>
                <div style={s.barLabel}>{b.type}</div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${b.pct}%`, backgroundColor: '#43a047' }} />
                </div>
                <div style={s.barValue}>{b.count} ({b.pct}%)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.category_breakdown?.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Location Categories</h3>
          <div style={s.barChart}>
            {stats.category_breakdown.map((b) => (
              <div key={b.category} style={s.barRow}>
                <div style={s.barLabel}>{b.category}</div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${b.pct}%`, backgroundColor: '#7b1fa2' }} />
                </div>
                <div style={s.barValue}>{b.count} ({b.pct}%)</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team Tab (researcher management) ─────────────────────────────

function TeamTab({ project, staffing, team, onTeamChange, controllers, onControllersChange, projectId }) {
  const [enumerators, setEnumerators] = useState([]);
  const [search, setSearch] = useState('');
  const [ctrlSearch, setCtrlSearch] = useState('');
  const [ctrlName, setCtrlName] = useState('');
  const [loadingEnum, setLoadingEnum] = useState(false);
  const [inlineError, setInlineError] = useState('');

  // Locked counts from project creation
  const requiredEnumerators = project.num_researchers || staffing?.num_researchers || 0;
  const requiredControllers = project.controllers_needed || staffing?.controllers_needed || 0;
  const assignedEnumerators = team.length;
  const assignedControllers = controllers.length;
  const remainingEnumSlots = requiredEnumerators - assignedEnumerators;
  const remainingCtrlSlots = requiredControllers - assignedControllers;

  useEffect(() => {
    setLoadingEnum(true);
    fetchEnumerators()
      .then(setEnumerators)
      .catch(() => {})
      .finally(() => setLoadingEnum(false));
  }, []);

  const teamIds = new Set(team.map((r) => r.id));
  const ctrlIds = new Set(controllers.map((c) => c.id));

  const filtered = enumerators.filter((e) => {
    if (teamIds.has(e.id) || ctrlIds.has(e.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.name || '').toLowerCase().includes(q) ||
           (e.asset_barcode || '').toLowerCase().includes(q) ||
           (e.region || '').toLowerCase().includes(q);
  });

  const ctrlFiltered = enumerators.filter((e) => {
    if (ctrlIds.has(e.id) || teamIds.has(e.id)) return false;
    if (!ctrlSearch) return true;
    const q = ctrlSearch.toLowerCase();
    return (e.name || '').toLowerCase().includes(q) ||
           (e.asset_barcode || '').toLowerCase().includes(q);
  });

  const showInlineError = (msg) => {
    setInlineError(msg);
    setTimeout(() => setInlineError(''), 4000);
  };

  const addToTeam = (enumerator) => {
    if (teamIds.has(enumerator.id)) {
      showInlineError('Already assigned');
      return;
    }
    if (assignedEnumerators >= requiredEnumerators) {
      showInlineError(`Enumerator limit reached (${assignedEnumerators}/${requiredEnumerators}) — adjust in project settings is not allowed`);
      return;
    }
    onTeamChange([...team, enumerator]);
  };

  const removeFromTeam = (id) => {
    onTeamChange(team.filter((r) => r.id !== id));
  };

  const addController = (person) => {
    if (ctrlIds.has(person.id)) {
      showInlineError('Already assigned');
      return;
    }
    if (assignedControllers >= requiredControllers) {
      showInlineError(`Controller limit reached (${assignedControllers}/${requiredControllers}) — adjust in project settings is not allowed`);
      return;
    }
    onControllersChange([...controllers, person]);
  };

  const addControllerManual = () => {
    if (assignedControllers >= requiredControllers) {
      showInlineError(`Controller limit reached (${assignedControllers}/${requiredControllers}) — adjust in project settings is not allowed`);
      return;
    }
    if (!ctrlName.trim()) return;
    const person = { id: crypto.randomUUID(), name: ctrlName.trim(), manual: true };
    onControllersChange([...controllers, person]);
    setCtrlName('');
  };

  const removeController = (id) => {
    onControllersChange(controllers.filter((c) => c.id !== id));
  };

  const handleCSVUpload = async (file, target) => {
    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return;

    const dataRows = lines.length - 1;
    const slots = target === 'controllers' ? remainingCtrlSlots : remainingEnumSlots;

    if (dataRows > slots) {
      showInlineError(`Upload contains ${dataRows} ${target} but only ${Math.max(0, slots)} slots remaining`);
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'researcher_name' || h === 'controller_name');
    const idIdx = headers.findIndex((h) => h === 'id' || h === 'asset_barcode' || h === 'barcode');

    let newMembers = [];
    let rowErrors = [];
    const existingIds = new Set(target === 'controllers' ? controllers.map((c) => c.id) : team.map((t) => t.id));

    for (let i = 1; i < lines.length; i++) {
      const currentSlots = target === 'controllers' ? (requiredControllers - controllers.length - newMembers.length) : (requiredEnumerators - team.length - newMembers.length);
      if (currentSlots <= 0) {
        rowErrors.push(`Row ${i + 1}: Limit reached, cannot add more.`);
        continue;
      }

      const cols = lines[i].split(',').map((c) => c.trim());
      const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
      if (!name) {
        rowErrors.push(`Row ${i + 1}: Name is missing.`);
        continue;
      }

      const barcode = idIdx >= 0 ? cols[idIdx] : '';
      const existing = enumerators.find((e) => (barcode && e.asset_barcode === barcode) || e.name.toLowerCase() === name.toLowerCase());

      if (existing) {
        if (existingIds.has(existing.id)) {
          rowErrors.push(`Row ${i + 1}: ${name} is already assigned.`);
        } else {
          newMembers.push(existing);
          existingIds.add(existing.id);
        }
      } else {
        const member = { id: crypto.randomUUID(), name, asset_barcode: barcode, manual: true };
        newMembers.push(member);
        existingIds.add(member.id);
      }
    }

    if (rowErrors.length > 0) {
      showInlineError(rowErrors.join(' | '));
    }

    if (newMembers.length > 0) {
      if (target === 'controllers') {
        onControllersChange([...controllers, ...newMembers]);
      } else {
        onTeamChange([...team, ...newMembers]);
      }
    }
  };

  return (
    <div style={s.tabContent}>
      {/* Allocation Summary Bar */}
      <div style={{ ...s.card, backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', marginBottom: '16px' }}>
        <h3 style={s.cardTitle}>Allocation Summary</h3>
        <div style={{ fontSize: '10px', color: 'var(--text-disabled)', marginBottom: '10px' }}>Set at creation — contact admin to modify</div>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '16px', flexWrap: 'wrap' }}>
          <SummaryItem label="Enumerators" required={requiredEnumerators} assigned={assignedEnumerators} />
          <SummaryItem label="Controllers" required={requiredControllers} assigned={assignedControllers} />
        </div>
      </div>

      {inlineError && <div style={{ ...s.error, marginBottom: '10px' }}>{inlineError}</div>}

      {/* ── Controllers Section ── */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Controllers ({controllers.length} / {requiredControllers})</h3>
        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 12px' }}>
          Add controllers manually by name, select from enumerators, or upload a CSV.
        </p>

        {controllers.length > 0 && (
          <div style={s.teamGrid}>
            {controllers.map((c, i) => (
              <div key={c.id} style={s.teamCard}>
                <div style={s.teamCardLeft}>
                  <span style={{ ...s.teamNum, backgroundColor: '#ff9800' }}>C{i + 1}</span>
                  <div>
                    <div style={s.teamName}>{c.name}</div>
                    <div style={s.teamMeta}>
                      {c.asset_barcode && <span>{c.asset_barcode}</span>}
                      {c.region && <span>{c.region}</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => removeController(c.id)} style={s.teamRemove}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Manual name entry */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input
            type="text"
            placeholder="Enter controller name..."
            value={ctrlName}
            onChange={(e) => setCtrlName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addControllerManual(); }}
            style={{ ...s.searchInput, flex: 1, marginBottom: 0 }}
            disabled={assignedControllers >= requiredControllers}
          />
          <button onClick={addControllerManual} style={s.addBtn} disabled={assignedControllers >= requiredControllers}>+ Add</button>
        </div>

        {/* Select from enumerators */}
        <div style={{ marginTop: '12px' }}>
          <input
            type="text"
            placeholder="Search enumerators to add as controller..."
            value={ctrlSearch}
            onChange={(e) => setCtrlSearch(e.target.value)}
            style={s.searchInput}
            disabled={assignedControllers >= requiredControllers}
          />
          {ctrlSearch && (
            <div style={s.enumList}>
              {ctrlFiltered.slice(0, 20).map((e) => (
                <div key={e.id} style={s.enumItem}>
                  <div>
                    <div style={s.enumName}>{e.name}</div>
                    <div style={s.enumMeta}>
                      {e.asset_barcode && <span>{e.asset_barcode}</span>}
                      {e.region && <span> · {e.region}</span>}
                    </div>
                  </div>
                  <button onClick={() => { addController(e); setCtrlSearch(''); }} style={s.addBtn}>+ Add</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CSV upload for controllers */}
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ ...s.browseBtn, ...(assignedControllers >= requiredControllers ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}>
            Upload CSV
            <input
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) handleCSVUpload(e.target.files[0], 'controllers'); }}
            />
          </label>
          <span style={{ fontSize: '11px', color: '#888' }}>CSV with name column to bulk-add controllers</span>
        </div>
      </div>

      {/* ── Researchers Section ── */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Assigned Researchers ({team.length} / {requiredEnumerators})</h3>
        {team.length === 0 ? (
          <p style={s.hint}>No researchers assigned yet. Select from the enumerators registry below or upload a CSV list.</p>
        ) : (
          <div style={s.teamGrid}>
            {team.map((r, i) => (
              <div key={r.id} style={s.teamCard}>
                <div style={s.teamCardLeft}>
                  <span style={{ ...s.teamNum, backgroundColor: RESEARCHER_COLORS[i % RESEARCHER_COLORS.length] }}>
                    R{i + 1}
                  </span>
                  <div>
                    <div style={s.teamName}>{r.name}</div>
                    <div style={s.teamMeta}>
                      {r.asset_barcode && <span>{r.asset_barcode}</span>}
                      {r.region && <span>{r.region}</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => removeFromTeam(r.id)} style={s.teamRemove}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* CSV upload */}
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ ...s.browseBtn, ...(assignedEnumerators >= requiredEnumerators ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}>
            Upload CSV
            <input
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) handleCSVUpload(e.target.files[0], 'researchers'); }}
            />
          </label>
          <span style={s.hint}>Upload a CSV with name, asset_barcode columns to bulk-add researchers</span>
        </div>
      </div>

      {/* Select from enumerators registry */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Select from Enumerators Registry</h3>
        {assignedEnumerators >= requiredEnumerators && (
          <div style={s.successBox}>All enumerator slots filled ({assignedEnumerators}/{requiredEnumerators}).</div>
        )}
        <input
          type="text"
          placeholder="Search by name, barcode, or region..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={s.searchInput}
          disabled={assignedEnumerators >= requiredEnumerators}
        />

        {loadingEnum ? (
          <p style={s.hint}>Loading enumerators...</p>
        ) : filtered.length === 0 ? (
          <p style={s.hint}>
            {enumerators.length === 0
              ? 'No enumerators in registry. Add enumerators first from the Enumerators page.'
              : search ? 'No matching enumerators found.' : 'All enumerators are already assigned.'}
          </p>
        ) : (
          <div style={s.enumList}>
            {filtered.slice(0, 50).map((e) => (
              <div key={e.id} style={s.enumItem}>
                <div>
                  <div style={s.enumName}>{e.name}</div>
                  <div style={s.enumMeta}>
                    {e.asset_barcode && <span>{e.asset_barcode}</span>}
                    {e.region && <span> · {e.region}</span>}
                    {e.shift && <span> · {e.shift}</span>}
                  </div>
                </div>
                <button onClick={() => addToTeam(e)} style={s.addBtn} disabled={assignedEnumerators >= requiredEnumerators}>+ Add</button>
              </div>
            ))}
            {filtered.length > 50 && (
              <div style={s.hint}>Showing first 50 of {filtered.length} — use search to narrow down.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Review Tab (per-enumerator company breakdown) ────────────────

function ReviewTab({ projectId, team, controllers, isSocial, allocation, project }) {
  const [companies, setCompanies] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedResearcher, setExpandedResearcher] = useState(null);

  useEffect(() => {
    if (isSocial) {
      fetchSurveyTargets(projectId)
        .then((res) => setTargets(res || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      fetchCompanies(projectId)
        .then((res) => setCompanies(res.companies || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [projectId, isSocial]);

  if (loading) return <div style={s.tabContent}><div style={{ padding: '20px', color: '#888' }}>Loading review data...</div></div>;

  // ── Social Survey Review ──
  if (isSocial) {
    const allocResearchers = allocation?.researchers || [];
    const ctrlRatio = allocResearchers.length > 0 && controllers.length > 0
      ? Math.ceil(allocResearchers.length / controllers.length) : 0;

    // Build researcher data from allocation + targets
    const researcherData = allocResearchers.map((r) => {
      const rTargets = targets.filter((t) => t.assigned_researcher_id === r.researcher_id);
      const completed = rTargets.filter((t) => t.status === 'completed').length;
      const inProgress = rTargets.filter((t) => t.status === 'in_progress').length;
      const pending = rTargets.filter((t) => !t.status || t.status === 'pending').length;
      const totalHH = rTargets.reduce((s, t) => s + (t.household_count || 0), 0);
      const teamMember = team[r.researcher_id - 1] || { name: `Researcher ${r.researcher_id}` };
      return {
        ...r,
        teamName: teamMember.name,
        barcode: teamMember.asset_barcode,
        targets: rTargets,
        completed,
        inProgress,
        pending,
        totalHH,
        progress: rTargets.length > 0 ? Math.round(completed / rTargets.length * 100) : 0,
        color: RESEARCHER_COLORS[(r.researcher_id - 1) % RESEARCHER_COLORS.length],
      };
    });

    const totalCompleted = targets.filter((t) => t.status === 'completed').length;
    const totalPending = targets.filter((t) => !t.status || t.status === 'pending').length;
    const totalInProgress = targets.filter((t) => t.status === 'in_progress').length;
    const unassigned = targets.filter((t) => !t.assigned_researcher_id);

    return (
      <div style={s.tabContent}>
        {/* Summary KPIs */}
        <div style={s.kpiRow}>
          <KPI label="Total EAs" value={targets.length} />
          <KPI label="Completed" value={totalCompleted} color="#43a047" />
          <KPI label="In Progress" value={totalInProgress} color="#ff9800" />
          <KPI label="Pending" value={totalPending} color="#e53935" />
          <KPI label="Researchers" value={researcherData.length} color="#1976d2" />
          <KPI label="Controllers" value={controllers.length} color="#ff9800" />
        </div>

        {/* Overall progress bar */}
        <div style={{ ...s.card, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Overall Progress</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1976d2' }}>
              {targets.length > 0 ? Math.round(totalCompleted / targets.length * 100) : 0}%
            </span>
          </div>
          <div style={{ height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: '4px', display: 'flex' }}>
              <div style={{ width: `${targets.length > 0 ? totalCompleted / targets.length * 100 : 0}%`, backgroundColor: '#43a047' }} />
              <div style={{ width: `${targets.length > 0 ? totalInProgress / targets.length * 100 : 0}%`, backgroundColor: '#ff9800' }} />
            </div>
          </div>
        </div>

        {/* Controller → Researcher Hierarchy */}
        {controllers.length > 0 && (
          <div style={s.card}>
            <h3 style={s.cardTitle}>Controller — Researcher Hierarchy</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {controllers.map((ctrl, ci) => {
                const startIdx = ci * ctrlRatio;
                const supervised = researcherData.slice(startIdx, startIdx + ctrlRatio);
                const ctrlTotalEA = supervised.reduce((s, r) => s + r.count, 0);
                const ctrlTotalHH = supervised.reduce((s, r) => s + r.totalHH, 0);
                const ctrlCompleted = supervised.reduce((s, r) => s + r.completed, 0);
                return (
                  <div key={ctrl.id} style={{ borderRadius: '8px', border: '1px solid #ffe082', overflow: 'hidden' }}>
                    {/* Controller header */}
                    <div style={{ padding: '12px 16px', backgroundColor: '#fff8e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ ...s.teamNum, backgroundColor: '#ff9800', width: '30px', height: '30px', fontSize: '11px' }}>C{ci + 1}</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>{ctrl.name}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>
                            {supervised.length} researcher{supervised.length !== 1 ? 's' : ''} · {ctrlTotalEA} EAs · {ctrlTotalHH.toLocaleString()} HH
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: ctrlCompleted > 0 ? '#43a047' : '#888' }}>
                          {ctrlTotalEA > 0 ? Math.round(ctrlCompleted / ctrlTotalEA * 100) : 0}%
                        </div>
                        <div style={{ fontSize: '10px', color: '#888' }}>completion</div>
                      </div>
                    </div>
                    {/* Supervised researchers */}
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {supervised.map((r) => (
                        <div key={r.researcher_id} style={{ padding: '8px 12px', backgroundColor: '#f9f9f9', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ ...s.rDot, backgroundColor: r.color, width: '10px', height: '10px', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.teamName}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>
                              {r.count} EAs · {r.totalHH.toLocaleString()} HH · {r.municipal_center}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#43a047' }}>{r.completed}</div>
                              <div style={{ fontSize: '8px', color: '#888' }}>done</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ff9800' }}>{r.inProgress}</div>
                              <div style={{ fontSize: '8px', color: '#888' }}>active</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#e53935' }}>{r.pending}</div>
                              <div style={{ fontSize: '8px', color: '#888' }}>left</div>
                            </div>
                            <div style={{ width: '50px', height: '6px', backgroundColor: '#e0e0e0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${r.progress}%`, backgroundColor: r.progress >= 80 ? '#43a047' : r.progress >= 40 ? '#ff9800' : '#e53935', borderRadius: '3px' }} />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#555', width: '30px', textAlign: 'right' }}>{r.progress}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Field Data Feed — per researcher */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Field Data Feed</h3>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 12px' }}>
            Live status of each enumerator's assigned EAs, households completed, and remaining workload.
          </p>
          {researcherData.map((r) => {
            const isExpanded = expandedResearcher === r.researcher_id;
            return (
              <div key={r.researcher_id} style={{ marginBottom: '8px', borderRadius: '6px', border: `1px solid ${r.color}33`, overflow: 'hidden' }}>
                <div
                  style={{ padding: '10px 14px', backgroundColor: `${r.color}08`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedResearcher(isExpanded ? null : r.researcher_id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ ...s.teamNum, backgroundColor: r.color }}>R{r.researcher_id}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.teamName}</div>
                      <div style={{ fontSize: '10px', color: '#888' }}>
                        {r.municipal_center} · {Object.keys(r.districts || {}).length} district{Object.keys(r.districts || {}).length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#1976d2' }}>{r.count}</div>
                      <div style={{ fontSize: '9px', color: '#888' }}>EAs</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#43a047' }}>{r.totalHH.toLocaleString()}</div>
                      <div style={{ fontSize: '9px', color: '#888' }}>Households</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#43a047' }}>{r.completed}</div>
                      <div style={{ fontSize: '9px', color: '#888' }}>Done</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#e53935' }}>{r.pending}</div>
                      <div style={{ fontSize: '9px', color: '#888' }}>Remaining</div>
                    </div>
                    <div style={{ width: '60px', height: '6px', backgroundColor: '#e0e0e0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${r.progress}%`, backgroundColor: r.progress >= 80 ? '#43a047' : '#ff9800', borderRadius: '3px' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: r.progress >= 80 ? '#43a047' : '#ff9800' }}>{r.progress}%</span>
                    <span style={{ fontSize: '14px', color: '#bbb' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                  </div>
                </div>

                {isExpanded && r.targets.length > 0 && (
                  <div style={{ padding: '8px 14px', maxHeight: '350px', overflowY: 'auto' }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Order</th>
                          <th style={s.th}>EA Code</th>
                          <th style={s.th}>Name</th>
                          <th style={s.th}>District</th>
                          <th style={s.th}>Center</th>
                          <th style={s.th}>HH</th>
                          <th style={s.th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.targets.sort((a, b) => (a.assignment_order || 999) - (b.assignment_order || 999)).map((t) => (
                          <tr key={t.id}>
                            <td style={s.td}>#{t.assignment_order || '—'}</td>
                            <td style={{ ...s.td, fontWeight: 500, fontFamily: 'monospace', fontSize: '11px' }}>{t.code}</td>
                            <td style={s.td}>
                              <div style={{ fontSize: '11px' }}>{t.name_en || t.name}</div>
                              {t.name_ar && <div style={{ fontSize: '10px', color: '#888', direction: 'rtl' }}>{t.name_ar}</div>}
                            </td>
                            <td style={s.td}>
                              <div style={{ fontSize: '11px' }}>{t.district_en || t.district}</div>
                              {t.district_ar && <div style={{ fontSize: '10px', color: '#888', direction: 'rtl' }}>{t.district_ar}</div>}
                            </td>
                            <td style={{ ...s.td, fontWeight: 600, fontSize: '11px' }}>{t.municipal_center}</td>
                            <td style={s.td}>{t.household_count}</td>
                            <td style={s.td}>
                              <span style={{
                                padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
                                backgroundColor: t.status === 'completed' ? '#e8f5e9' : t.status === 'in_progress' ? '#fff3e0' : '#f5f5f5',
                                color: t.status === 'completed' ? '#2e7d32' : t.status === 'in_progress' ? '#e65100' : '#666',
                              }}>
                                {t.status || 'pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Unassigned EAs */}
        {unassigned.length > 0 && (
          <div style={{ ...s.card, borderLeft: '3px solid #e53935' }}>
            <h3 style={s.cardTitle}>Unassigned EAs ({unassigned.length})</h3>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
              Run the allocation engine to assign these enumeration areas to researchers.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Economic Survey Review (original) ──
  const grouped = {};
  companies.forEach((c) => {
    const rid = c.assigned_researcher_id || 0;
    if (!grouped[rid]) grouped[rid] = [];
    grouped[rid].push(c);
  });

  const unassigned = grouped[0] || [];
  delete grouped[0];

  const researcherSummaries = Object.entries(grouped).map(([rid, comps]) => {
    const idx = parseInt(rid) - 1;
    const researcher = team[idx] || { name: `Researcher ${rid}` };
    const strata = {};
    const isicSections = {};
    comps.forEach((c) => {
      strata[c.stratum] = (strata[c.stratum] || 0) + 1;
      const sec = c.isic_section || '?';
      isicSections[sec] = (isicSections[sec] || 0) + 1;
    });
    return {
      rid: parseInt(rid),
      name: researcher.name,
      barcode: researcher.asset_barcode,
      companies: comps,
      total: comps.length,
      strata,
      isicSections,
      color: RESEARCHER_COLORS[idx % RESEARCHER_COLORS.length],
    };
  }).sort((a, b) => a.rid - b.rid);

  const ctrlRatio = team.length > 0 && controllers.length > 0
    ? Math.ceil(team.length / controllers.length) : 0;

  return (
    <div style={s.tabContent}>
      <div style={s.kpiRow}>
        <KPI label="Total Companies" value={companies.length} />
        <KPI label="Assigned" value={companies.length - unassigned.length} color="#43a047" />
        <KPI label="Unassigned" value={unassigned.length} color={unassigned.length > 0 ? '#e53935' : '#43a047'} />
        <KPI label="Researchers" value={researcherSummaries.length} color="#1976d2" />
        <KPI label="Controllers" value={controllers.length} color="#ff9800" />
      </div>

      {controllers.length > 0 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Controller Assignments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {controllers.map((ctrl, ci) => {
              const startIdx = ci * ctrlRatio;
              const supervised = researcherSummaries.slice(startIdx, startIdx + ctrlRatio);
              return (
                <div key={ctrl.id} style={{ padding: '10px 14px', backgroundColor: '#fff8e1', borderRadius: '6px', border: '1px solid #ffe082' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ ...s.teamNum, backgroundColor: '#ff9800', width: '26px', height: '26px', fontSize: '10px' }}>C{ci + 1}</span>
                      <strong style={{ fontSize: '13px' }}>{ctrl.name}</strong>
                    </div>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      Supervising {supervised.length} researcher{supervised.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {supervised.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {supervised.map((r) => (
                        <span key={r.rid} style={{ padding: '2px 8px', backgroundColor: '#fff', borderRadius: '10px', fontSize: '11px', border: '1px solid #ddd' }}>
                          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: r.color, marginRight: '4px' }}></span>
                          {r.name} ({r.total})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {researcherSummaries.map((r) => {
        const isExpanded = expandedResearcher === r.rid;
        return (
          <div key={r.rid} style={s.card}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setExpandedResearcher(isExpanded ? null : r.rid)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ ...s.teamNum, backgroundColor: r.color }}>R{r.rid}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{r.name}</div>
                  {r.barcode && <div style={{ fontSize: '11px', color: '#888' }}>{r.barcode}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#1976d2' }}>{r.total}</div>
                  <div style={{ fontSize: '10px', color: '#888' }}>companies</div>
                </div>
                <span style={{ fontSize: '16px', color: '#bbb' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </div>
            </div>
            {isExpanded && (
              <div style={{ marginTop: '14px', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={s.table}>
                  <thead><tr><th style={s.th}>#</th><th style={s.th}>Company</th><th style={s.th}>ISIC</th><th style={s.th}>Stratum</th><th style={s.th}>Employees</th><th style={s.th}>Status</th></tr></thead>
                  <tbody>
                    {r.companies.map((c, i) => (
                      <tr key={c.id}>
                        <td style={s.td}>{i + 1}</td>
                        <td style={s.td}>{c.company_name}</td>
                        <td style={s.td}>{c.isic_code || '—'}</td>
                        <td style={s.td}>S{c.stratum}</td>
                        <td style={s.td}>{c.num_employees}</td>
                        <td style={s.td}>
                          <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
                            backgroundColor: c.interview_status === 'completed' ? '#e8f5e9' : '#f5f5f5',
                            color: c.interview_status === 'completed' ? '#2e7d32' : '#666' }}>
                            {c.interview_status || 'pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div style={{ ...s.card, borderLeft: '3px solid #e53935' }}>
          <h3 style={s.cardTitle}>Unassigned Companies ({unassigned.length})</h3>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Company</th><th style={s.th}>ISIC</th><th style={s.th}>Stratum</th></tr></thead>
              <tbody>
                {unassigned.slice(0, 100).map((c) => (
                  <tr key={c.id}><td style={s.td}>{c.company_name}</td><td style={s.td}>{c.isic_code || '—'}</td><td style={s.td}>S{c.stratum}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Arabic Labels ────────────────────────────────────────────────
// ── Map Tab ──────────────────────────────────────────────────────

function MapTab({ projectId, allocation, onAllocate, allocating, numResearchers, team, isSocial }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [selectedResearcher, setSelectedResearcher] = useState(null);
  const [colorBy, setColorBy] = useState(isSocial ? 'researcher' : 'stratum');

  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;

    const { map, cleanup } = initSCADMap(mapRef.current, {
      satellite: true,
      maxPitch: 75,
      zoom: 14,
      pitch: 60,
      bearing: -30,
    });

    mapInstance.current = map;

    return () => { mapInstance.current = null; cleanup(); };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const dataItems = isSocial ? allocation?.targets : allocation?.companies;
    if (!map || !dataItems?.length) return;

    const onLoad = () => {
      ['companies-layer', 'companies-circle', 'zones-layer'].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      ['companies-src', 'zones-src'].forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });

      const features = dataItems.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
        properties: isSocial ? {
          id: c.id,
          code: c.code,
          name_en: c.name_en || c.name || '',
          name_ar: c.name_ar || '',
          target_type: c.target_type || 'area',
          category: c.category || '',
          district_en: c.district_en || c.district || '',
          district_ar: c.district_ar || '',
          district_code: c.district_code || '',
          municipal_center: c.municipal_center || '',
          researcher_id: c.assigned_researcher_id || 0,
          cluster_id: c.cluster_id ?? 0,
          household_count: c.household_count || 0,
          selected_households: c.selected_households || 0,
          order: c.assignment_order || 0,
        } : {
          id: c.id,
          company_id: c.company_id,
          company_name: c.company_name,
          stratum: c.stratum,
          isic_section: c.isic_section || '—',
          researcher_id: c.assigned_researcher_id || 0,
          cluster_id: c.cluster_id ?? 0,
          num_employees: c.num_employees,
        },
      }));

      map.addSource('companies-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      const stratumColor = ['match', ['get', 'stratum'],
        1, STRATUM_COLORS[1], 2, STRATUM_COLORS[2], 3, STRATUM_COLORS[3], 4, STRATUM_COLORS[4], '#999'];

      const researcherColor = ['match', ['get', 'researcher_id'],
        ...Array.from({ length: Math.max(numResearchers, 50) }, (_, i) => [i + 1, RESEARCHER_COLORS[i % RESEARCHER_COLORS.length]]).flat(),
        '#999'];

      const centerColor = ['match', ['get', 'municipal_center'],
        'AD-C', '#1976d2', 'AD-M', '#e65100', 'AD-W', '#43a047', 'AD-S', '#7b1fa2', '#999'];

      const circleRadius = isSocial
        ? ['interpolate', ['linear'], ['zoom'], 8, 4, 12, 8, 16, 14]
        : ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 8];
      const circleColor = isSocial
        ? (colorBy === 'center' ? centerColor : researcherColor)
        : (colorBy === 'stratum' ? stratumColor : researcherColor);

      map.addLayer({
        id: 'companies-circle',
        type: 'circle',
        source: 'companies-src',
        paint: {
          'circle-radius': circleRadius,
          'circle-color': circleColor,
          'circle-stroke-width': isSocial ? 2 : 1,
          'circle-stroke-color': '#fff',
          'circle-opacity': selectedResearcher
            ? ['case', ['==', ['get', 'researcher_id'], selectedResearcher], 1, 0.2]
            : 0.85,
        },
      });

      map.on('click', 'companies-circle', (e) => {
        const props = e.features[0].properties;
        const researcherName = team.length > 0 && props.researcher_id > 0
          ? (team[props.researcher_id - 1]?.name || `#${props.researcher_id}`)
          : `#${props.researcher_id}`;
        const html = isSocial
          ? `<div style="font-size:12px;line-height:1.6">
              <strong>${props.name_en || props.code}</strong>
              ${props.name_ar ? `<span style="float:right;direction:rtl;font-size:11px;color:#555">${props.name_ar}</span>` : ''}<br/>
              Type: ${props.target_type === 'area' ? 'Enumeration Area' : 'Fixed Location'}<br/>
              ${props.target_type === 'area' ? `Households: ${props.selected_households} (of ${props.household_count})<br/>` : ''}
              ${props.district_en ? `District: ${props.district_en} ${props.district_ar ? `(${props.district_ar})` : ''}<br/>` : ''}
              ${props.municipal_center ? `Center: ${props.municipal_center}<br/>` : ''}
              Route order: #${props.order}<br/>
              Researcher: ${researcherName}
            </div>`
          : `<div style="font-size:12px;line-height:1.6">
              <strong>${props.company_name || props.company_id}</strong><br/>
              ISIC: ${props.isic_section} | Stratum: ${props.stratum}<br/>
              Employees: ${props.num_employees}<br/>
              Researcher: ${researcherName}
            </div>`;
        new maplibregl.Popup({ offset: 12 })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      });

      map.on('mouseenter', 'companies-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'companies-circle', () => { map.getCanvas().style.cursor = ''; });

      if (features.length > 0) {
        const coords = features.map((f) => f.geometry.coordinates);
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0], coords[0]),
        );
        map.fitBounds(bounds, { padding: 60, pitch: 60, bearing: -30, maxZoom: 15 });
      }
    };

    if (map.isStyleLoaded()) onLoad();
    else map.on('load', onLoad);
  }, [allocation, colorBy, selectedResearcher, numResearchers, team, isSocial]);

  return (
    <div style={s.tabContent}>
      {!(isSocial ? allocation?.targets?.length : allocation?.companies?.length) ? (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Run Allocation Engine</h3>
          <p style={s.hint}>
            {isSocial
              ? 'Click below to distribute survey targets across researchers using spatial clustering with route optimization.'
              : 'Click below to distribute companies across researchers using K-means clustering with fairness balancing.'}
          </p>
          <button onClick={onAllocate} disabled={allocating} style={s.submitBtn}>
            {allocating ? 'Allocating...' : 'Run Distribution Engine'}
          </button>
        </div>
      ) : (
        <div style={s.mapLayout}>
          {/* Controls */}
          <div style={s.mapControls}>
            <div style={s.controlSection}>
              <div style={s.controlLabel}>Color by</div>
              <select value={colorBy} onChange={(e) => setColorBy(e.target.value)} style={s.controlSelect}>
                {isSocial ? (
                  <>
                    <option value="researcher">Researcher</option>
                    <option value="center">Municipal Center</option>
                  </>
                ) : (
                  <>
                    <option value="stratum">Stratum</option>
                    <option value="researcher">Researcher</option>
                  </>
                )}
              </select>
            </div>

            {/* Fairness Metrics Dashboard */}
            {allocation.fairness_metrics ? (
              <div style={s.fairnessCard}>
                <div style={s.fairnessScore}>{allocation.fairness_metrics.overall_score}</div>
                <div style={s.fairnessLabel}>Fairness Score / 100</div>
                <div style={s.metricsGrid}>
                  <MetricRow label={isSocial ? 'HH Workload CV' : 'Workload CV'}
                    value={`${(allocation.fairness_metrics.workload_cv * 100).toFixed(1)}%`}
                    good={allocation.fairness_metrics.workload_cv < 0.1} />
                  <MetricRow label="Min/Max Ratio" value={`${(allocation.fairness_metrics.min_max_ratio * 100).toFixed(0)}%`}
                    good={allocation.fairness_metrics.min_max_ratio > 0.8} />
                  {allocation.fairness_metrics.gini != null && (
                    <MetricRow label="Gini" value={allocation.fairness_metrics.gini.toFixed(3)}
                      good={allocation.fairness_metrics.gini < 0.03} />
                  )}
                  <MetricRow label={isSocial ? 'HH Range' : 'Volume Range'}
                    value={isSocial ? allocation.fairness_metrics.volume_range.toLocaleString() : `±${allocation.fairness_metrics.volume_range}`}
                    good={isSocial ? allocation.fairness_metrics.min_max_ratio > 0.8 : allocation.fairness_metrics.volume_range <= 2} />
                  <MetricRow label="Avg Spread" value={`${(allocation.fairness_metrics.mean_geo_spread_m / 1000).toFixed(1)} km`}
                    good={true} />
                </div>
              </div>
            ) : allocation.fairness_score != null ? (
              <div style={s.fairnessCard}>
                <div style={s.fairnessScore}>{(allocation.fairness_score * 100).toFixed(0)}%</div>
                <div style={s.fairnessLabel}>Fairness Score</div>
              </div>
            ) : null}

            <div style={s.controlSection}>
              <div style={s.controlLabel}>Researchers ({allocation.researchers?.length})</div>
              <div style={s.researcherList}>
                <div
                  onClick={() => setSelectedResearcher(null)}
                  style={{ ...s.researcherItem, ...(selectedResearcher === null ? s.researcherActive : {}) }}
                >
                  All ({allocation.total_companies})
                </div>
                {allocation.researchers?.map((r) => {
                  const name = team.length > 0 && team[r.researcher_id - 1]
                    ? team[r.researcher_id - 1].name
                    : `R${r.researcher_id}`;
                  return (
                    <div
                      key={r.researcher_id}
                      onClick={() => setSelectedResearcher(r.researcher_id === selectedResearcher ? null : r.researcher_id)}
                      style={{ ...s.researcherItem, ...(selectedResearcher === r.researcher_id ? s.researcherActive : {}) }}
                    >
                      <span style={{ ...s.rDot, backgroundColor: RESEARCHER_COLORS[(r.researcher_id - 1) % RESEARCHER_COLORS.length] }} />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '11px', fontWeight: 500 }}>{name}</div>
                        <div style={{ fontSize: '9px', color: '#888' }}>
                          {isSocial
                            ? `${r.count} EAs · ${(r.total_households || 0).toLocaleString()} HH · ${r.municipal_center || '?'}`
                            : `${r.count} co. · ${r.weighted_load}w`}
                          {r.avg_distance_m ? ` · ${(r.avg_distance_m / 1000).toFixed(1)}km` : ''}
                        </div>
                      </div>
                      <span style={{ ...s.rScore, color: r.overall_score > 0.8 ? '#43a047' : r.overall_score > 0.6 ? '#ff9800' : '#e53935' }}>
                        {(r.overall_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={onAllocate} disabled={allocating} style={s.rebalanceBtn}>
              {allocating ? 'Rebalancing...' : 'Rebalance'}
            </button>
          </div>

          {/* Map */}
          <div ref={mapRef} style={s.mapContainer} />

          {/* Legend */}
          <div style={s.legend}>
            {colorBy === 'stratum' ? (
              Object.entries(STRATUM_COLORS).map(([k, c]) => (
                <div key={k} style={s.legendItem}>
                  <span style={{ ...s.dot, backgroundColor: c }} />
                  {STRATUM_LABELS[k]}
                </div>
              ))
            ) : (
              Array.from({ length: Math.min(numResearchers, 10) }, (_, i) => {
                const name = team.length > 0 && team[i] ? team[i].name : `Researcher ${i + 1}`;
                return (
                  <div key={i} style={s.legendItem}>
                    <span style={{ ...s.dot, backgroundColor: RESEARCHER_COLORS[i] }} />
                    {name}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, good }) {
  return (
    <div style={s.metricRow}>
      <span style={s.metricLabel}>{label}</span>
      <span style={{ ...s.metricValue, color: good ? '#43a047' : '#e65100' }}>{value}</span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const s = {
  page: { padding: '16px 24px', height: 'calc(100vh - 52px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loading: { padding: '40px', textAlign: 'center', color: '#888', fontSize: '14px' },
  header: { marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { margin: 0, fontSize: '20px', color: '#1a1a2e' },
  meta: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' },
  headerActions: { display: 'flex', gap: '8px', flexShrink: 0 },
  editHeaderBtn: {
    padding: '6px 16px', backgroundColor: '#fff', color: '#1976d2', border: '1px solid #1976d2',
    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  deleteHeaderBtn: {
    padding: '6px 16px', backgroundColor: '#fff', color: '#c62828', border: '1px solid #c62828',
    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  headerEditForm: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
  headerEditInput: {
    padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '18px',
    fontWeight: 600, outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  headerEditRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  headerEditSelect: {
    padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none',
  },
  headerEditDate: {
    padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none',
  },
  headerEditActions: { display: 'flex', gap: '8px' },
  headerSaveBtn: {
    padding: '6px 18px', backgroundColor: '#1976d2', color: '#fff', border: 'none',
    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  headerCancelBtn: {
    padding: '6px 18px', backgroundColor: '#f5f5f5', color: '#666', border: '1px solid #ddd',
    borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 9999,
  },
  modal: {
    backgroundColor: '#fff', padding: '28px', borderRadius: '12px', maxWidth: '420px',
    width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  modalTitle: { fontSize: '18px', fontWeight: 700, color: '#c62828', marginBottom: '12px' },
  modalText: { fontSize: '13px', color: '#555', lineHeight: 1.6, marginBottom: '20px' },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  deleteConfirmBtn: {
    padding: '8px 20px', backgroundColor: '#c62828', color: '#fff', border: 'none',
    borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
  },
  metaText: { fontSize: '12px', color: '#888' },
  badge: (type) => ({
    padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
    backgroundColor: type === 'economic' ? '#e3f2fd' : type === 'social' ? '#f3e5f5' : type === 'active' ? '#e8f5e9' : type === 'in_progress' ? '#fff3e0' : '#f5f5f5',
    color: type === 'economic' ? '#1565c0' : type === 'social' ? '#7b1fa2' : type === 'active' ? '#2e7d32' : type === 'in_progress' ? '#e65100' : '#666',
  }),
  tabs: { display: 'flex', gap: '2px', marginBottom: '12px', borderBottom: '2px solid #e0e0e0', flexShrink: 0 },
  tab: {
    padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '13px', color: '#888', borderBottom: '2px solid transparent', marginBottom: '-2px',
  },
  tabActive: { color: '#1976d2', borderBottomColor: '#1976d2', fontWeight: 600 },
  tabDisabled: { color: '#ccc', cursor: 'default' },
  content: { flex: 1, overflow: 'auto' },
  tabContent: { display: 'flex', flexDirection: 'column', gap: '16px' },
  error: { padding: '10px 14px', backgroundColor: '#fce4ec', color: '#c62828', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' },

  // KPIs
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' },
  kpi: { backgroundColor: '#fff', padding: '16px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  kpiValue: { fontSize: '26px', fontWeight: 700 },
  kpiLabel: { fontSize: '11px', color: '#888', marginTop: '2px' },

  // Cards
  card: { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  cardTitle: { margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#333' },

  // Tables
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e0e0e0', color: '#555', fontWeight: 600, fontSize: '11px' },
  td: { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', color: '#333' },
  dot: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', marginRight: '6px' },

  // Bar chart
  barChart: { display: 'flex', flexDirection: 'column', gap: '8px' },
  barRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  barLabel: { width: '130px', fontSize: '12px', color: '#555' },
  barTrack: { flex: 1, height: '18px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '4px', transition: 'width 0.3s' },
  barValue: { width: '80px', fontSize: '12px', color: '#555', textAlign: 'right' },

  // Upload
  hint: { fontSize: '12px', color: '#888', marginBottom: '8px' },
  dropZone: { border: '2px dashed #ddd', borderRadius: '8px', padding: '30px', textAlign: 'center', marginBottom: '16px' },
  browseBtn: { display: 'inline-block', padding: '8px 20px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  dropHint: { fontSize: '11px', color: '#bbb', marginTop: '6px' },
  fileName: { fontSize: '13px', color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  removeFile: { padding: '2px 8px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', backgroundColor: '#fff', cursor: 'pointer', color: '#c62828' },
  submitBtn: { padding: '10px 24px', backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },

  // Staffing
  staffGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  staffField: { display: 'flex', flexDirection: 'column', gap: '4px' },
  staffFieldLabel: { fontSize: '12px', fontWeight: 600, color: '#555' },
  staffFieldValue: { padding: '8px 12px', backgroundColor: '#f5f7fa', borderRadius: '6px', fontSize: '14px', fontWeight: 600, color: '#333' },
  staffInput: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontWeight: 600 },
  divider: { height: '1px', backgroundColor: '#e0e0e0', margin: '20px 0' },
  formulaBox: { marginTop: '16px', padding: '14px', backgroundColor: '#f5f7fa', borderRadius: '6px', fontSize: '12px', color: '#555', lineHeight: 1.8, fontFamily: 'monospace' },
  warningBox: { marginTop: '12px', padding: '10px 14px', backgroundColor: '#fff3e0', color: '#e65100', borderRadius: '6px', fontSize: '12px' },
  successBox: { marginTop: '12px', padding: '10px 14px', backgroundColor: '#e8f5e9', color: '#2e7d32', borderRadius: '6px', fontSize: '12px' },

  // Region
  regionRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px' },
  regionCount: { fontWeight: 600, color: '#1976d2' },

  // Team
  teamGrid: { display: 'flex', flexDirection: 'column', gap: '6px' },
  teamCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#f8f9fa', borderRadius: '6px' },
  teamCardLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  teamNum: { width: '28px', height: '28px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 },
  teamName: { fontSize: '13px', fontWeight: 600, color: '#333' },
  teamMeta: { fontSize: '11px', color: '#888', display: 'flex', gap: '8px' },
  teamRemove: { width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #ddd', backgroundColor: '#fff', cursor: 'pointer', color: '#c62828', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  teamChip: { padding: '4px 12px', backgroundColor: '#e3f2fd', color: '#1565c0', borderRadius: '12px', fontSize: '11px', fontWeight: 600 },
  searchInput: { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' },
  enumList: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '400px', overflowY: 'auto' },
  enumItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f0f0f0' },
  enumName: { fontSize: '13px', fontWeight: 500, color: '#333' },
  enumMeta: { fontSize: '11px', color: '#888' },
  addBtn: { padding: '4px 12px', backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '4px', color: '#2e7d32', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' },

  // Map layout
  mapLayout: { display: 'flex', gap: '12px', height: 'calc(100vh - 220px)', position: 'relative' },
  mapControls: { width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' },
  mapContainer: { flex: 1, borderRadius: '8px', overflow: 'hidden', minHeight: '500px', backgroundColor: '#e8eaed' },
  controlSection: { backgroundColor: '#fff', padding: '12px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  controlLabel: { fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '6px' },
  controlSelect: { width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' },

  fairnessCard: { backgroundColor: '#fff', padding: '14px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  fairnessScore: { fontSize: '28px', fontWeight: 700, color: '#43a047' },
  fairnessLabel: { fontSize: '11px', color: '#888', marginBottom: '8px' },
  metricsGrid: { display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px', textAlign: 'left' },
  metricRow: { display: 'flex', justifyContent: 'space-between', fontSize: '10px' },
  metricLabel: { color: '#888' },
  metricValue: { fontWeight: 600 },

  researcherList: { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '300px', overflowY: 'auto' },
  researcherItem: { padding: '6px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#555' },
  researcherActive: { backgroundColor: '#e3f2fd', color: '#1565c0', fontWeight: 600 },
  rDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  rScore: { marginLeft: 'auto', fontSize: '10px', color: '#888' },

  rebalanceBtn: { padding: '8px', border: '1px solid #ff9800', borderRadius: '6px', backgroundColor: '#fff3e0', color: '#e65100', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },

  legend: { position: 'absolute', bottom: '12px', right: '12px', backgroundColor: 'rgba(255,255,255,0.95)', padding: '10px 14px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '11px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' },
  summaryNumber: { fontSize: '24px', fontWeight: 'bold' },
  summaryLabel: { fontSize: '12px', color: '#555' },
  summaryRemaining: { fontSize: '11px', color: '#888' },
};
