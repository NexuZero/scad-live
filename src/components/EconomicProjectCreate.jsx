import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjectNames, addProjectName, createEconomicProject, getStoredRole } from '../api';

const STANDARD_MONTH_DAYS = 22;

function countWorkingDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (e <= s) return 0;
  let count = 0;
  const d = new Date(s);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Default roles — user can add/remove
const DEFAULT_ROLES = [
  { id: crypto.randomUUID(), name: 'Enumerator', monthly_salary: 6000, count: 0, is_field_worker: true },
  { id: crypto.randomUUID(), name: 'Controller', monthly_salary: 8000, count: 0, is_field_worker: false },
];

export default function EconomicProjectCreate() {
  const navigate = useNavigate();
  const role = getStoredRole();
  const [projectNames, setProjectNames] = useState([]);
  const [form, setForm] = useState({
    registry_id: '',
    name: '',
    project_type: 'economic',
    working_days: 0,
    start_date: '',
    end_date: '',
    total_samples: '',
    budget: '',
    samples_per_day: '8',
    // Social survey fields
    collection_mode: 'areas',       // 'locations' | 'areas' | 'mixed'
    targets_per_researcher: '14',
    households_per_area: '4',
  });
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleSalary, setNewRoleSalary] = useState('5000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddName, setShowAddName] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameType, setNewNameType] = useState('economic');

  useEffect(() => {
    fetchProjectNames().then(setProjectNames).catch(() => {});
  }, []);

  const filteredNames = projectNames.filter((n) => n.project_type === form.project_type);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'start_date' || name === 'end_date') {
        const sd = name === 'start_date' ? value : prev.start_date;
        const ed = name === 'end_date' ? value : prev.end_date;
        updated.working_days = countWorkingDays(sd, ed);
      }
      if (name === 'registry_id' && value) {
        const match = projectNames.find((n) => String(n.id) === String(value));
        if (match) updated.name = match.name;
      }
      return updated;
    });
  };

  const handleAddName = async () => {
    if (!newName.trim()) return;
    try {
      const added = await addProjectName({ name: newName.trim(), project_type: newNameType });
      setProjectNames((prev) => [...prev, added]);
      setForm((f) => ({ ...f, registry_id: added.id, name: added.name }));
      setNewName('');
      setShowAddName(false);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Role management ──
  const updateRole = (id, field, value) => {
    setRoles((prev) => prev.map((r) => r.id === id ? { ...r, [field]: field === 'name' ? value : (parseFloat(value) || 0) } : r));
  };

  const removeRole = (id) => {
    setRoles((prev) => prev.filter((r) => r.id !== id));
  };

  const addRole = () => {
    if (!newRoleName.trim()) return;
    setRoles((prev) => [...prev, {
      id: crypto.randomUUID(),
      name: newRoleName.trim(),
      monthly_salary: parseFloat(newRoleSalary) || 5000,
      count: 0,
      is_field_worker: false,
    }]);
    setNewRoleName('');
    setNewRoleSalary('5000');
  };

  const isSocial = form.project_type === 'social';
  const targetsPerResearcher = parseInt(form.targets_per_researcher) || 14;
  const householdsPerArea = parseInt(form.households_per_area) || 4;

  // ── Calculator ──
  const calc = useMemo(() => {
    const totalSamples = parseInt(form.total_samples) || 0;
    const workingDays = form.working_days || 0;
    const budget = parseFloat(form.budget) || 0;
    const samplesPerDay = parseInt(form.samples_per_day) || 1;

    if (workingDays <= 0) return null;

    // Prorate each role
    const roleCosts = roles.map((r) => {
      const dailyRate = r.monthly_salary / STANDARD_MONTH_DAYS;
      const projectCost = Math.round(dailyRate * workingDays * 100) / 100;
      return { ...r, daily_rate: Math.round(dailyRate * 100) / 100, project_cost: projectCost };
    });

    // Field workers are the ones who collect samples
    const fieldWorkerRole = roleCosts.find((r) => r.is_field_worker);

    // Workload-based: how many field workers needed
    let workload = null;
    const isSocialCalc = form.project_type === 'social';
    const tpr = parseInt(form.targets_per_researcher) || 14;
    const hpa = parseInt(form.households_per_area) || 4;

    if (isSocialCalc && totalSamples > 0 && fieldWorkerRole) {
      // Social: total_samples = total households/people to interview
      // areas = total_samples ÷ hpa, researchers = areas ÷ tpr (areas per researcher)
      const isLoc = form.collection_mode === 'locations';
      const totalHouseholds = totalSamples;
      const totalAreas = isLoc ? totalSamples : Math.ceil(totalSamples / hpa);
      const fieldWorkersNeeded = Math.ceil(totalAreas / tpr);
      workload = {
        daily_target: Math.ceil(totalHouseholds / workingDays),
        field_workers_needed: fieldWorkersNeeded,
        field_role_name: fieldWorkerRole.name,
        total_areas: totalAreas,
        total_households: totalHouseholds,
        areas_per_researcher: tpr,
        households_per_researcher: fieldWorkersNeeded > 0 ? Math.ceil(totalHouseholds / fieldWorkersNeeded) : 0,
        is_social: true,
      };
    } else if (totalSamples > 0 && fieldWorkerRole) {
      // Economic: standard samples ÷ days ÷ capacity
      const dailySamplesNeeded = Math.ceil(totalSamples / workingDays);
      const enumNeeded = Math.ceil(dailySamplesNeeded / samplesPerDay);
      workload = {
        daily_target: dailySamplesNeeded,
        field_workers_needed: enumNeeded,
        field_role_name: fieldWorkerRole.name,
      };
    }

    // Current total cost from all roles at their set counts
    const currentTotalCost = roleCosts.reduce((sum, r) => sum + r.count * r.project_cost, 0);

    // Budget-based: how many field workers can we afford after paying non-field roles
    let budgetCalc = null;
    if (budget > 0 && fieldWorkerRole) {
      const nonFieldCost = roleCosts.filter((r) => !r.is_field_worker).reduce((sum, r) => sum + r.count * r.project_cost, 0);
      const remainingForField = budget - nonFieldCost;
      const maxFieldWorkers = remainingForField > 0 ? Math.floor(remainingForField / fieldWorkerRole.project_cost) : 0;
      const fieldCost = maxFieldWorkers * fieldWorkerRole.project_cost;
      const totalUsed = nonFieldCost + fieldCost;

      // Social: each researcher covers tpr areas, each area has hpa households
      //   areas_capacity = workers × tpr, households_capacity = areas × hpa
      //   totalSamples = total households, so compare households_capacity vs totalSamples
      // Economic: capacity = workers × samples_per_day × working_days
      const canHandleAreas = isSocialCalc ? maxFieldWorkers * tpr : 0;
      const canHandleHH = isSocialCalc
        ? (form.collection_mode === 'locations' ? canHandleAreas : canHandleAreas * hpa)
        : maxFieldWorkers * samplesPerDay * workingDays;

      budgetCalc = {
        max_field_workers: maxFieldWorkers,
        field_role_name: fieldWorkerRole.name,
        non_field_cost: Math.round(nonFieldCost),
        field_cost: Math.round(fieldCost),
        total_cost: Math.round(totalUsed),
        remaining: Math.round(budget - totalUsed),
        samples_capacity: canHandleHH,
        areas_capacity: canHandleAreas,
        households_capacity: canHandleHH,
        sufficient: totalSamples > 0 ? canHandleHH >= totalSamples : true,
        is_social: isSocialCalc,
      };
    }

    return { roleCosts, workload, budgetCalc, currentTotalCost: Math.round(currentTotalCost) };
  }, [form.total_samples, form.working_days, form.budget, form.samples_per_day, form.project_type, form.collection_mode, form.targets_per_researcher, form.households_per_area, roles]);

  const fieldRole = roles.find((r) => r.is_field_worker);
  const totalHeadcount = roles.reduce((s, r) => s + r.count, 0);

  const applyWorkload = () => {
    if (calc?.workload && fieldRole) {
      setRoles((prev) => prev.map((r) => r.id === fieldRole.id ? { ...r, count: calc.workload.field_workers_needed } : r));
    }
  };

  const applyBudget = () => {
    if (calc?.budgetCalc && fieldRole) {
      setRoles((prev) => prev.map((r) => r.id === fieldRole.id ? { ...r, count: calc.budgetCalc.max_field_workers } : r));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Please select or enter a project name.'); return; }
    if (!form.start_date || !form.end_date) { setError('Start and end dates are required.'); return; }
    const enumRole = roles.find((r) => r.is_field_worker);
    if (!enumRole || enumRole.count < 1) { setError('At least 1 field worker (enumerator) is required.'); return; }

    setLoading(true);
    try {
      const controllersCount = roles.filter((r) => r.name.toLowerCase() === 'controller').reduce((s, r) => s + r.count, 0);
      const payload = {
        registry_id: form.registry_id || null,
        name: form.name.trim(),
        project_type: form.project_type,
        working_days: form.working_days,
        start_date: form.start_date,
        end_date: form.end_date,
        total_samples: parseInt(form.total_samples) || 0,
        budget: parseFloat(form.budget) || 0,
        samples_per_day: parseInt(form.samples_per_day) || 8,
        // Flatten primary roles for backward compatibility
        num_researchers: enumRole.count,
        controllers_needed: controllersCount,
        controller_ratio: 10,
        // Locked allocation fields — read-only after creation
        enumerators_count: enumRole.count,
        controllers_count: controllersCount,
        // Store full roles array
        workforce_roles: roles.map((r) => ({ name: r.name, monthly_salary: r.monthly_salary, count: r.count, is_field_worker: r.is_field_worker })),
        // Social survey parameters
        ...(form.project_type === 'social' && {
          collection_mode: form.collection_mode,
          targets_per_researcher: parseInt(form.targets_per_researcher) || 14,
          households_per_area: parseInt(form.households_per_area) || 4,
        }),
      };
      const created = await createEconomicProject(payload);
      navigate(`/surveys/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fmtAED = (v) => v != null ? Math.round(v).toLocaleString() : '—';

  return (
    <div style={s.page}>
      <h1 style={s.title}>New Survey Project</h1>

      <form onSubmit={handleSubmit} style={s.form}>
        {error && <div style={s.error}>{error}</div>}

        {/* Project Type */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Project Type</h3>
          <div style={s.typeRow}>
            {['economic', 'social', 'opinion_poll'].map((t) => (
              <label key={t} style={{ ...s.typeOption, ...(form.project_type === t ? s.typeActive : {}) }}>
                <input type="radio" name="project_type" value={t} checked={form.project_type === t} onChange={handleChange} style={{ display: 'none' }} />
                <div style={s.typeLabel}>{t === 'opinion_poll' ? 'Opinion Poll' : t.charAt(0).toUpperCase() + t.slice(1)}</div>
                <div style={s.typeDesc}>
                  {t === 'economic' ? 'Company survey (ISIC + Stratum)' :
                   t === 'social' ? 'Household survey (Region + Zone)' :
                   'Individual survey (Demographics)'}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Project Name Dropdown */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Project Name</h3>
          <select name="registry_id" value={form.registry_id} onChange={handleChange} style={s.select}>
            <option value="">— Select project name —</option>
            {filteredNames.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          {role === 'admin' && (
            <div style={s.addNameRow}>
              {showAddName ? (
                <div style={s.addNameForm}>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New project name..." style={s.input} />
                  <select value={newNameType} onChange={(e) => setNewNameType(e.target.value)} style={s.miniSelect}>
                    <option value="economic">Economic</option>
                    <option value="social">Social</option>
                    <option value="opinion_poll">Opinion Poll</option>
                  </select>
                  <button type="button" onClick={handleAddName} style={s.addBtn}>Add</button>
                  <button type="button" onClick={() => setShowAddName(false)} style={s.cancelSmall}>Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAddName(true)} style={s.addNameBtn}>+ Add new project name</button>
              )}
            </div>
          )}
        </div>

        {/* Schedule */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Schedule</h3>
          <div style={s.fieldGrid}>
            <Field label="Start Date *" name="start_date" type="date" value={form.start_date} onChange={handleChange} />
            <Field label="End Date *" name="end_date" type="date" value={form.end_date} onChange={handleChange} />
          </div>
          {form.working_days > 0 && (
            <div style={s.workingDaysInfo}>
              <strong>{form.working_days}</strong> working days (Mon–Fri, excluding Sat/Sun)
            </div>
          )}
        </div>

        {/* ── Social: Collection Mode ── */}
        {isSocial && (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Collection Mode</h3>
            <div style={s.typeRow}>
              {[
                { value: 'areas', label: 'Area Coverage', desc: 'Enumeration Areas with household sampling' },
                { value: 'locations', label: 'Fixed Locations', desc: 'Specific venues (malls, schools, hospitals)' },
                { value: 'mixed', label: 'Mixed', desc: 'Both areas and fixed locations' },
              ].map((m) => (
                <label key={m.value} style={{ ...s.typeOption, ...(form.collection_mode === m.value ? s.typeActive : {}) }}>
                  <input type="radio" name="collection_mode" value={m.value} checked={form.collection_mode === m.value} onChange={handleChange} style={{ display: 'none' }} />
                  <div style={s.typeLabel}>{m.label}</div>
                  <div style={s.typeDesc}>{m.desc}</div>
                </label>
              ))}
            </div>

            <div style={{ ...s.fieldGrid, marginTop: '16px' }}>
              <Field label="Total Sample Size (households/people to interview) *" name="total_samples" type="number" value={form.total_samples} onChange={handleChange} />
              <Field label="Areas per Researcher" name="targets_per_researcher" type="number" value={form.targets_per_researcher} onChange={handleChange} />
            </div>
            {(form.collection_mode === 'areas' || form.collection_mode === 'mixed') && (
              <div style={{ marginTop: '14px', maxWidth: '300px' }}>
                <Field label="Households per Area" name="households_per_area" type="number" value={form.households_per_area} onChange={handleChange} />
              </div>
            )}

            {/* Sample Calculation Summary */}
            {parseInt(form.total_samples) > 0 && form.working_days > 0 && (() => {
              const totalHouseholds = parseInt(form.total_samples);
              const isLoc = form.collection_mode === 'locations';
              const totalAreas = isLoc ? totalHouseholds : Math.ceil(totalHouseholds / householdsPerArea);
              const researchersNeeded = Math.ceil(totalAreas / targetsPerResearcher);
              const dailyInterviews = Math.ceil(totalHouseholds / form.working_days);
              const perResearcherDaily = researchersNeeded > 0 ? Math.ceil(dailyInterviews / researchersNeeded) : 0;
              const interviewsPerResearcher = researchersNeeded > 0 ? Math.ceil(totalHouseholds / researchersNeeded) : 0;
              return (
                <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f5f7fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#333', marginBottom: '12px' }}>Sample Calculation</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: '#1976d2' }}>{totalHouseholds.toLocaleString()}</div>
                      <div style={{ fontSize: '10px', color: '#888' }}>Total {isLoc ? 'Locations' : 'Households'}</div>
                    </div>
                    {!isLoc && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#43a047' }}>{totalAreas.toLocaleString()}</div>
                        <div style={{ fontSize: '10px', color: '#888' }}>Total Areas</div>
                        <div style={{ fontSize: '9px', color: '#aaa' }}>{totalHouseholds.toLocaleString()} ÷ {householdsPerArea}</div>
                      </div>
                    )}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: '#e65100' }}>{researchersNeeded}</div>
                      <div style={{ fontSize: '10px', color: '#888' }}>Researchers Needed</div>
                      <div style={{ fontSize: '9px', color: '#aaa' }}>{totalAreas} areas ÷ {targetsPerResearcher}/researcher</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: '#555' }}>{interviewsPerResearcher}</div>
                      <div style={{ fontSize: '10px', color: '#888' }}>Interviews / Researcher</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: perResearcherDaily > 5 ? '#e53935' : '#555' }}>{perResearcherDaily}</div>
                      <div style={{ fontSize: '10px', color: '#888' }}>Per Day / Researcher</div>
                    </div>
                  </div>
                  {perResearcherDaily > 5 && (
                    <div style={{ marginTop: '10px', padding: '6px 10px', backgroundColor: '#fff3e0', borderRadius: '4px', fontSize: '11px', color: '#e65100' }}>
                      High daily load — consider adding more researchers or extending project days.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Allocation rule */}
            {form.working_days > 0 && (
              <div style={{ marginTop: '12px', padding: '12px 14px', backgroundColor: '#e3f2fd', borderRadius: '6px', fontSize: '12px', color: '#1565c0' }}>
                <strong>Allocation Rule:</strong> Each researcher handles <strong>{targetsPerResearcher}</strong> areas
                {form.collection_mode !== 'locations' && <> × <strong>{householdsPerArea}</strong> households/area = <strong>{targetsPerResearcher * householdsPerArea}</strong> interviews/researcher</>}
                {' '}over <strong>{form.working_days}</strong> working days
                {' '}({Math.ceil((form.collection_mode === 'locations' ? targetsPerResearcher : targetsPerResearcher * householdsPerArea) / form.working_days)} interviews/day)
              </div>
            )}
          </div>
        )}

        {/* ── Budget & Workforce Calculator ── */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Budget & Workforce Calculator</h3>

          {isSocial ? (
            <div>
              <Field label="Total Budget (AED)" name="budget" type="number" value={form.budget} onChange={handleChange} />
            </div>
          ) : (
            <div style={s.fieldGrid}>
              <Field label="Total Samples *" name="total_samples" type="number" value={form.total_samples} onChange={handleChange} />
              <Field label="Total Budget (AED)" name="budget" type="number" value={form.budget} onChange={handleChange} />
            </div>
          )}

          {!isSocial && (
            <div style={{ marginTop: '14px' }}>
              <Field label="Samples per Field Worker per Day" name="samples_per_day" type="number" value={form.samples_per_day} onChange={handleChange} />
            </div>
          )}

          {/* ── Workforce Roles ── */}
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={s.rateTitle}>Workforce Roles</div>
            </div>

            {/* Roles table */}
            <table style={{ ...s.table, marginBottom: '12px' }}>
              <thead>
                <tr>
                  <th style={s.th}>Role</th>
                  <th style={s.th}>Monthly Salary (AED)</th>
                  <th style={{ ...s.th, width: '80px' }}>Headcount</th>
                  <th style={{ ...s.th, width: '100px' }}>Project Cost</th>
                  <th style={{ ...s.th, width: '60px' }}>Field</th>
                  <th style={{ ...s.th, width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const dailyRate = r.monthly_salary / STANDARD_MONTH_DAYS;
                  const projectCost = dailyRate * (form.working_days || 0);
                  const lineCost = projectCost * r.count;
                  return (
                    <tr key={r.id}>
                      <td style={s.td}>
                        <input
                          value={r.name}
                          onChange={(e) => updateRole(r.id, 'name', e.target.value)}
                          style={s.tableInput}
                        />
                      </td>
                      <td style={s.td}>
                        <input
                          type="number"
                          value={r.monthly_salary}
                          onChange={(e) => updateRole(r.id, 'monthly_salary', e.target.value)}
                          style={{ ...s.tableInput, width: '100px' }}
                          min={0}
                        />
                      </td>
                      <td style={s.td}>
                        <input
                          type="number"
                          value={r.count}
                          onChange={(e) => updateRole(r.id, 'count', e.target.value)}
                          style={{ ...s.tableInput, width: '60px', fontWeight: 700, color: '#1976d2' }}
                          min={0}
                        />
                      </td>
                      <td style={{ ...s.td, fontWeight: 500, color: '#333', fontSize: '12px' }}>
                        {form.working_days > 0 ? (
                          <>{fmtAED(lineCost)}</>
                        ) : '—'}
                      </td>
                      <td style={s.td}>
                        <input
                          type="checkbox"
                          checked={r.is_field_worker}
                          onChange={(e) => {
                            // Only one field worker role allowed
                            if (e.target.checked) {
                              setRoles((prev) => prev.map((pr) => ({ ...pr, is_field_worker: pr.id === r.id })));
                            } else {
                              updateRole(r.id, 'is_field_worker', false);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                          title="This role collects samples (field worker)"
                        />
                      </td>
                      <td style={s.td}>
                        <button
                          type="button"
                          onClick={() => removeRole(r.id)}
                          style={s.removeBtn}
                          title="Remove role"
                        >✕</button>
                      </td>
                    </tr>
                  );
                })}
                {/* Total row */}
                {form.working_days > 0 && (
                  <tr style={{ backgroundColor: '#f5f7fa' }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>Total</td>
                    <td style={s.td}></td>
                    <td style={{ ...s.td, fontWeight: 700, color: '#1976d2' }}>{totalHeadcount}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: '#333' }}>
                      {fmtAED(calc?.currentTotalCost || 0)} AED
                    </td>
                    <td style={s.td}></td>
                    <td style={s.td}></td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Add new role */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Role name (e.g. Auditor)..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRole(); } }}
                style={{ ...s.input, flex: 1 }}
              />
              <input
                type="number"
                placeholder="Salary"
                value={newRoleSalary}
                onChange={(e) => setNewRoleSalary(e.target.value)}
                style={{ ...s.input, width: '100px' }}
                min={0}
              />
              <button type="button" onClick={addRole} style={s.addRoleBtn}>+ Add Role</button>
            </div>
          </div>

          {/* Cost Breakdown */}
          {calc && form.working_days > 0 && (
            <div style={s.rateBreakdown}>
              <div style={s.rateTitle}>Cost Breakdown (prorated for {form.working_days} days from {STANDARD_MONTH_DAYS}-day month)</div>
              <div style={s.rateTable}>
                {calc.roleCosts.map((r) => (
                  <React.Fragment key={r.id}>
                    <div style={s.rateRow}>
                      <span style={s.rateLabel}>{r.name} daily rate</span>
                      <span style={s.rateValue}>{fmtAED(r.daily_rate)} AED/day</span>
                      <span style={s.rateSub}>{fmtAED(r.monthly_salary)} ÷ {STANDARD_MONTH_DAYS}</span>
                    </div>
                    <div style={s.rateRow}>
                      <span style={s.rateLabel}>{r.name} per-person project cost</span>
                      <span style={s.rateValue}>{fmtAED(r.project_cost)} AED</span>
                      <span style={s.rateSub}>× {form.working_days} days{r.count > 0 ? ` × ${r.count} = ${fmtAED(r.project_cost * r.count)} AED` : ''}</span>
                    </div>
                    <div style={s.rateDivider} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* ── Results: Workload vs Budget ── */}
          {calc && (calc.workload || calc.budgetCalc) && (
            <div style={{ display: 'grid', gridTemplateColumns: calc.workload && calc.budgetCalc ? '1fr 1fr' : '1fr', gap: '14px', marginTop: '16px' }}>

              {calc.workload && (
                <div style={s.resultCard}>
                  <div style={s.resultTitle}>By Workload</div>
                  <div style={s.resultSubtitle}>
                    {calc.workload.is_social ? (
                      <>{fmtAED(calc.workload.total_households)} households ÷ {householdsPerArea} HH/area = {fmtAED(calc.workload.total_areas)} areas
                        <br />{fmtAED(calc.workload.total_areas)} areas ÷ {calc.workload.areas_per_researcher}/researcher = <strong>{calc.workload.field_workers_needed}</strong> {calc.workload.field_role_name}s</>
                    ) : (
                      <>{fmtAED(parseInt(form.total_samples))} samples ÷ {form.working_days} days = {calc.workload.daily_target}/day
                        <br />{calc.workload.daily_target} ÷ {form.samples_per_day} capacity = <strong>{calc.workload.field_workers_needed}</strong> {calc.workload.field_role_name}s</>
                    )}
                  </div>
                  <div style={s.resultGrid}>
                    <div style={s.resultItem}>
                      <div style={s.resultBig}>{calc.workload.field_workers_needed}</div>
                      <div style={s.resultSmall}>{calc.workload.field_role_name}s</div>
                    </div>
                    {calc.workload.is_social && (
                      <>
                        <div style={s.resultItem}>
                          <div style={{ ...s.resultBig, fontSize: '16px' }}>{fmtAED(calc.workload.total_areas)}</div>
                          <div style={s.resultSmall}>Total Areas</div>
                        </div>
                        <div style={s.resultItem}>
                          <div style={{ ...s.resultBig, fontSize: '16px' }}>{calc.workload.households_per_researcher}</div>
                          <div style={s.resultSmall}>Interviews each</div>
                        </div>
                      </>
                    )}
                  </div>
                  {calc.budgetCalc && !calc.budgetCalc.sufficient && (
                    <div style={s.resultWarning}>Budget insufficient for this workload</div>
                  )}
                  <button type="button" onClick={applyWorkload} style={s.applyBtn}>
                    Apply to {calc.workload.field_role_name} count
                  </button>
                </div>
              )}

              {calc.budgetCalc && (
                <div style={{ ...s.resultCard, borderColor: '#e65100' }}>
                  <div style={{ ...s.resultTitle, color: '#e65100' }}>By Budget</div>
                  <div style={s.resultSubtitle}>
                    {fmtAED(parseFloat(form.budget))} AED budget
                    {calc.budgetCalc.non_field_cost > 0 && (
                      <><br />Non-field staff cost: {fmtAED(calc.budgetCalc.non_field_cost)} AED</>
                    )}
                  </div>
                  <div style={s.resultGrid}>
                    <div style={s.resultItem}>
                      <div style={{ ...s.resultBig, color: '#e65100' }}>{calc.budgetCalc.max_field_workers}</div>
                      <div style={s.resultSmall}>Max {calc.budgetCalc.field_role_name}s</div>
                    </div>
                    <div style={s.resultItem}>
                      <div style={{ ...s.resultBig, fontSize: '16px', color: '#e65100' }}>{fmtAED(calc.budgetCalc.total_cost)}</div>
                      <div style={s.resultSmall}>Total Cost</div>
                    </div>
                    <div style={s.resultItem}>
                      <div style={{ ...s.resultBig, fontSize: '16px', color: '#43a047' }}>{fmtAED(calc.budgetCalc.remaining)}</div>
                      <div style={s.resultSmall}>Remaining</div>
                    </div>
                  </div>
                  {parseInt(form.total_samples) > 0 && (
                    <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px' }}>
                      {calc.budgetCalc.is_social ? (
                        <>Can cover <strong>{fmtAED(calc.budgetCalc.households_capacity)}</strong> households
                          {form.collection_mode !== 'locations' && <> ({fmtAED(calc.budgetCalc.areas_capacity)} areas)</>}
                          {!calc.budgetCalc.sufficient && <span style={{ color: '#c62828', fontWeight: 600 }}> — short by {fmtAED(parseInt(form.total_samples) - calc.budgetCalc.households_capacity)} households</span>}
                        </>
                      ) : (
                        <>Can handle {fmtAED(calc.budgetCalc.samples_capacity)} samples
                          {!calc.budgetCalc.sufficient && <span style={{ color: '#c62828', fontWeight: 600 }}> (short by {fmtAED(parseInt(form.total_samples) - calc.budgetCalc.samples_capacity)})</span>}
                        </>
                      )}
                    </div>
                  )}
                  <button type="button" onClick={applyBudget} style={{ ...s.applyBtn, backgroundColor: '#e65100' }}>
                    Apply to {calc.budgetCalc.field_role_name} count
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Budget status bar */}
          {parseFloat(form.budget) > 0 && calc && (
            <div style={{
              marginTop: '14px', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
              backgroundColor: calc.currentTotalCost > parseFloat(form.budget) ? '#fce4ec' : '#e8f5e9',
              color: calc.currentTotalCost > parseFloat(form.budget) ? '#c62828' : '#2e7d32',
            }}>
              Workforce cost: {fmtAED(calc.currentTotalCost)} AED / {fmtAED(parseFloat(form.budget))} AED budget
              {calc.currentTotalCost > parseFloat(form.budget)
                ? ` — Over by ${fmtAED(calc.currentTotalCost - parseFloat(form.budget))} AED`
                : ` — ${fmtAED(parseFloat(form.budget) - calc.currentTotalCost)} AED remaining`}
            </div>
          )}
        </div>

        {/* ── Final Summary ── */}
        {totalHeadcount > 0 && (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Final Summary (locked on save)</h3>
            <div style={s.staffPreview}>
              {roles.filter((r) => r.count > 0).map((r) => (
                <div key={r.id} style={s.staffCard}>
                  <div style={{ ...s.staffValue, color: r.is_field_worker ? '#1976d2' : '#e65100' }}>{r.count}</div>
                  <div style={s.staffLabel}>{r.name}{r.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
              <div style={s.staffCard}>
                <div style={s.staffValue}>{totalHeadcount}</div>
                <div style={s.staffLabel}>Total Staff</div>
              </div>
              {calc && (
                <div style={s.staffCard}>
                  <div style={{ ...s.staffValue, fontSize: '18px', color: parseFloat(form.budget) > 0 && calc.currentTotalCost > parseFloat(form.budget) ? '#c62828' : '#43a047' }}>
                    {fmtAED(calc.currentTotalCost)} AED
                  </div>
                  <div style={s.staffLabel}>Total Project Cost</div>
                </div>
              )}
              {parseInt(form.total_samples) > 0 && fieldRole && fieldRole.count > 0 && (() => {
                const totalHouseholds = parseInt(form.total_samples);
                const isLoc = form.collection_mode === 'locations';
                const totalAreas = isSocial && !isLoc ? Math.ceil(totalHouseholds / householdsPerArea) : totalHouseholds;
                const perDay = Math.ceil(totalHouseholds / (form.working_days || 1) / fieldRole.count);
                return isSocial ? (
                  <>
                    <div style={s.staffCard}>
                      <div style={s.staffValue}>{totalHouseholds.toLocaleString()}</div>
                      <div style={s.staffLabel}>Total Households</div>
                    </div>
                    {!isLoc && (
                      <div style={s.staffCard}>
                        <div style={{ ...s.staffValue, color: '#43a047' }}>{totalAreas.toLocaleString()}</div>
                        <div style={s.staffLabel}>Total Areas</div>
                      </div>
                    )}
                    <div style={s.staffCard}>
                      <div style={s.staffValue}>{Math.ceil(totalHouseholds / fieldRole.count)}</div>
                      <div style={s.staffLabel}>Interviews / Researcher</div>
                    </div>
                    <div style={s.staffCard}>
                      <div style={{ ...s.staffValue, color: perDay > 5 ? '#c62828' : '#1976d2' }}>{perDay}</div>
                      <div style={s.staffLabel}>Per Day / Researcher</div>
                    </div>
                  </>
                ) : (
                  <div style={s.staffCard}>
                    <div style={s.staffValue}>{perDay}</div>
                    <div style={s.staffLabel}>Samples/Person/Day</div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div style={s.actions}>
          <button type="button" onClick={() => navigate(-1)} style={s.cancelBtn}>Cancel</button>
          <button type="submit" disabled={loading} style={s.submitBtn}>
            {loading ? 'Creating...' : 'Create Survey'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label style={s.fieldLabel}>
      <span style={s.labelText}>{label}</span>
      <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} style={s.input} min={type === 'number' ? 0 : undefined} />
    </label>
  );
}

const s = {
  page: { padding: '24px 32px', maxWidth: '820px', margin: '0 auto' },
  title: { margin: '0 0 24px', fontSize: '22px', color: '#1a1a2e' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  section: { backgroundColor: '#fff', padding: '24px', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  sectionTitle: { margin: '0 0 14px', fontSize: '15px', color: '#333', fontWeight: 600 },
  typeRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
  typeOption: { padding: '16px', border: '2px solid #e0e0e0', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' },
  typeActive: { borderColor: '#1976d2', backgroundColor: '#e3f2fd' },
  typeLabel: { fontSize: '14px', fontWeight: 700, color: '#333', marginBottom: '4px' },
  typeDesc: { fontSize: '11px', color: '#888' },
  select: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff' },
  addNameRow: { marginTop: '10px' },
  addNameBtn: { padding: '6px 14px', fontSize: '12px', border: '1px dashed #1976d2', borderRadius: '4px', backgroundColor: '#fff', color: '#1976d2', cursor: 'pointer' },
  addNameForm: { display: 'flex', gap: '8px', alignItems: 'center' },
  miniSelect: { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' },
  addBtn: { padding: '8px 14px', backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  cancelSmall: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', color: '#666' },
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: '4px' },
  labelText: { fontSize: '12px', fontWeight: 600, color: '#555' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none' },
  hint: { fontSize: '12px', color: '#888', marginBottom: '10px' },
  workingDaysInfo: { marginTop: '12px', padding: '10px 14px', backgroundColor: '#e8f5e9', borderRadius: '6px', fontSize: '13px', color: '#2e7d32' },
  // Table
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e0e0e0', color: '#555', fontWeight: 600, fontSize: '11px' },
  td: { padding: '6px 10px', borderBottom: '1px solid #f0f0f0', color: '#333', verticalAlign: 'middle' },
  tableInput: { padding: '6px 8px', border: '1px solid #e0e0e0', borderRadius: '4px', fontSize: '13px', outline: 'none', backgroundColor: '#fff' },
  removeBtn: { width: '22px', height: '22px', borderRadius: '50%', border: '1px solid #ddd', backgroundColor: '#fff', cursor: 'pointer', color: '#c62828', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  addRoleBtn: { padding: '8px 16px', backgroundColor: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '6px', color: '#1565c0', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' },
  // Rate breakdown
  rateBreakdown: { marginTop: '16px', padding: '14px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid #eee' },
  rateTitle: { fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '10px' },
  rateTable: { display: 'flex', flexDirection: 'column', gap: '4px' },
  rateRow: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' },
  rateLabel: { flex: '0 0 200px', color: '#666' },
  rateValue: { flex: '0 0 130px', color: '#333', fontWeight: 500 },
  rateSub: { color: '#aaa', fontSize: '11px' },
  rateDivider: { height: '1px', backgroundColor: '#e8e8e8', margin: '2px 0' },
  // Result cards
  resultCard: { padding: '16px', backgroundColor: '#f5f7fa', borderRadius: '8px', border: '2px solid #1976d2', textAlign: 'center' },
  resultTitle: { fontSize: '14px', fontWeight: 700, color: '#1976d2', marginBottom: '6px' },
  resultSubtitle: { fontSize: '11px', color: '#666', marginBottom: '12px', lineHeight: 1.5 },
  resultGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '8px', marginBottom: '10px' },
  resultItem: { textAlign: 'center' },
  resultBig: { fontSize: '24px', fontWeight: 700, color: '#1976d2' },
  resultSmall: { fontSize: '10px', color: '#888', marginTop: '2px' },
  resultWarning: { padding: '6px 10px', backgroundColor: '#fce4ec', color: '#c62828', borderRadius: '4px', fontSize: '11px', fontWeight: 600, marginBottom: '8px' },
  applyBtn: { padding: '8px 20px', backgroundColor: '#43a047', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  // Staffing
  staffPreview: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', padding: '16px', backgroundColor: '#f5f7fa', borderRadius: '8px' },
  staffCard: { textAlign: 'center' },
  staffValue: { fontSize: '24px', fontWeight: 700, color: '#1976d2' },
  staffLabel: { fontSize: '11px', color: '#555', marginTop: '2px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  cancelBtn: { padding: '8px 20px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', color: '#666' },
  submitBtn: { padding: '8px 24px', backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  error: { padding: '10px 14px', backgroundColor: '#fce4ec', color: '#c62828', borderRadius: '6px', fontSize: '13px' },
  readonlyField: { display: 'flex', flexDirection: 'column', gap: '4px' },
  readonlyValue: { padding: '8px 12px', backgroundColor: '#f5f7fa', borderRadius: '6px', fontSize: '14px', fontWeight: 600, color: '#333', border: '1px solid #e0e0e0' },
};
