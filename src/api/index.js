/**
 * API layer — all backend communication goes through here.
 * When no backend is available (REACT_APP_API_BASE_URL unset), falls back
 * to IndexedDB + localStorage demo mode so the UI is fully testable offline.
 */

const API_BASE = process.env.REACT_APP_API_BASE_URL || '';
const DEMO_MODE = !API_BASE;

// ── IndexedDB helpers for large demo data (targets, households, companies) ──
const IDB_NAME = 'scad_map_demo';
const IDB_VERSION = 1;
const IDB_STORE = 'bulk_data';

function _openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _idbGet(key) {
  try {
    const db = await _openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function _idbSet(key, value) {
  const db = await _openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _idbDelete(key) {
  try {
    const db = await _openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* noop */ }
}

function authHeaders() {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return request(path, options);
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

// --- Auth ---

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Login failed');
  }
  const data = await res.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user_role', data.role);
  localStorage.setItem('user_name', data.display_name);
  return data;
}

export async function refreshToken() {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    return true;
  } catch {
    return false;
  }
}

export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_name');
  window.location.href = '/login';
}

export function getStoredRole() {
  return localStorage.getItem('user_role') || 'viewer';
}

export function getStoredName() {
  return localStorage.getItem('user_name') || '';
}

export function isAuthenticated() {
  return !!localStorage.getItem('access_token');
}

// --- Researchers ---

export async function fetchResearchers() {
  return request('/api/researchers');
}

export async function fetchResearcherLocation(employeeId) {
  return request(`/api/researchers/${employeeId}/location`);
}

// --- Chat ---

export async function fetchChatHistory(employeeId) {
  return request(`/api/chat/${employeeId}/history`);
}

// ═══════════════════════════════════════════════════════════════════
// Projects API — with localStorage demo fallback
// ═══════════════════════════════════════════════════════════════════

function _demoProjects() {
  // Check existing data
  let projects = [];
  const stored = localStorage.getItem('demo_projects');
  if (stored) {
    try { projects = JSON.parse(stored); } catch {}
  }
  if (DEMO_MODE && projects.length < 3) {
    // Seed default data
    projects = [
      { project_id: 'proj-1', project_name: 'Abu Dhabi Residential Survey', status: 'active', start_date: '2026-01-15', end_date: '2026-06-30', completion_pct: 45, sample_count: 120, researcher_count: 10, region: 'Abu Dhabi' },
      { project_id: 'proj-2', project_name: 'Al Ain Agricultural Survey', status: 'completed', start_date: '2026-02-01', end_date: '2026-08-31', completion_pct: 100, sample_count: 80, researcher_count: 6, region: 'Al Ain' },
      { project_id: 'proj-3', project_name: 'Traffic Flow Analysis', status: 'paused', start_date: '2026-03-01', end_date: '2026-05-15', completion_pct: 30, sample_count: 60, researcher_count: 8, region: 'Abu Dhabi' },
    ];
    localStorage.setItem('demo_projects', JSON.stringify(projects));
    projects.forEach(p => {
      const researchers = [];
      for (let i = 1; i <= p.researcher_count; i++) {
        const fw_id = `FW-${p.project_id}-${i}`;
        researchers.push({
          id: crypto.randomUUID(),
          project_id: p.project_id,
          fw_id,
          name: `Researcher ${i} (${p.project_name})`,
          phone: '',
          email: '',
          region: p.region,
          shift: i % 2 === 0 ? 'morning' : 'evening',
          is_active: true,
          in_field: Math.random() > 0.3,
          total_samples: Math.floor(Math.random()*20)+5,
          completed_samples: Math.floor(Math.random()*15),
          latitude: 24.45 + (Math.random()-0.5)*0.1,
          longitude: 54.38 + (Math.random()-0.5)*0.1,
        });
      }
      _demoSaveResearchers(p.project_id, researchers);
      const samples = [];
      for (let i = 1; i <= p.sample_count; i++) {
        const status = SAMPLE_STATUSES[i % SAMPLE_STATUSES.length];
        samples.push({
          sample_id: crypto.randomUUID(),
          project_id: p.project_id,
          household_id: `HH-${i}`,
          latitude: 24.45 + (Math.random()-0.5)*0.1,
          longitude: 54.38 + (Math.random()-0.5)*0.1,
          status,
          assigned_fw_id: researchers[i % researchers.length]?.fw_id || null,
        });
      }
      _demoSaveSamples(p.project_id, samples);
    });
    const alerts = [
      { id: 'alert-1', type: 'geofence', description: 'Researcher left designated area', timestamp: new Date().toISOString() },
      { id: 'alert-2', type: 'battery', description: 'Low battery warning', timestamp: new Date().toISOString() },
      { id: 'alert-3', type: 'geofence', description: 'Geofence breach detected', timestamp: new Date().toISOString() },
    ];
    localStorage.setItem('demo_alerts', JSON.stringify(alerts));
  }
  return projects;
}
function _demoSave(projects) {
  localStorage.setItem('demo_projects', JSON.stringify(projects));
}
function _demoSamples(projectId) {
  try { return JSON.parse(localStorage.getItem(`demo_samples_${projectId}`) || '[]'); }
  catch { return []; }
}
function _demoSaveSamples(projectId, samples) {
  localStorage.setItem(`demo_samples_${projectId}`, JSON.stringify(samples));
}
function _demoResearchers(projectId) {
  try { return JSON.parse(localStorage.getItem(`demo_researchers_${projectId}`) || '[]'); }
  catch { return []; }
}
function _demoSaveResearchers(projectId, researchers) {
  localStorage.setItem(`demo_researchers_${projectId}`, JSON.stringify(researchers));
}

function _parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

const VALIDATION_STATUSES = ['valid', 'valid', 'valid', 'valid', 'warning', 'valid', 'valid', 'unchecked'];
const SAMPLE_STATUSES = ['completed', 'completed', 'completed', 'pending', 'pending', 'completed', 'pending', 'completed'];

export async function fetchProjects() {
  if (DEMO_MODE) return _demoProjects();
  return request('/api/projects');
}

export async function fetchProject(projectId) {
  if (DEMO_MODE) {
    const p = _demoProjects().find((p) => p.project_id === projectId);
    if (!p) throw new Error('Project not found');
    return p;
  }
  return request(`/api/projects/${projectId}`);
}

export async function createProject(data) {
  if (DEMO_MODE) {
    const projects = _demoProjects();
    const project = {
      project_id: data.project_id || crypto.randomUUID(),
      project_name: data.project_name,
      region: data.region || 'Abu Dhabi',
      district: data.district || null,
      start_date: data.start_date,
      end_date: data.end_date,
      status: 'active',
      created_at: new Date().toISOString(),
      sample_count: 0,
      researcher_count: 0,
      completion_pct: 0,
      completed_samples: 0,
    };
    projects.push(project);
    _demoSave(projects);
    return project;
  }
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchProjectStats(projectId) {
  if (DEMO_MODE) {
    const samples = _demoSamples(projectId);
    const researchers = _demoResearchers(projectId);
    const completed = samples.filter((s) => s.status === 'completed').length;
    return {
      total_samples: samples.length,
      completed_samples: completed,
      pending_samples: samples.length - completed,
      total_researchers: researchers.length,
      completion_pct: samples.length > 0 ? Math.round((completed / samples.length) * 100) : 0,
    };
  }
  return request(`/api/projects/${projectId}/stats`);
}

export async function fetchProjectSamples(projectId) {
  if (DEMO_MODE) return _demoSamples(projectId);
  return request(`/api/projects/${projectId}/samples`);
}

export async function fetchProjectResearchers(projectId) {
  if (DEMO_MODE) return _demoResearchers(projectId);
  return request(`/api/projects/${projectId}/researchers`);
}

export async function uploadSamplePoints(projectId, file) {
  if (DEMO_MODE) {
    const text = await file.text();
    const rows = _parseCSV(text);
    const researchers = _demoResearchers(projectId);
    const samples = rows.map((row, i) => {
      const status = SAMPLE_STATUSES[i % SAMPLE_STATUSES.length];
      const validation = VALIDATION_STATUSES[i % VALIDATION_STATUSES.length];
      return {
        sample_id: crypto.randomUUID(),
        project_id: projectId,
        household_id: row.household_id || `HH-${String(i + 1).padStart(3, '0')}`,
        latitude: parseFloat(row.latitude) || 0,
        longitude: parseFloat(row.longitude) || 0,
        district: row.district || '',
        region: row.region || '',
        notes: row.notes || '',
        status,
        validation_status: validation,
        validation_note: validation === 'warning' ? 'Commercial/industrial zone detected' : '',
        assigned_fw_id: researchers.length > 0 ? researchers[i % researchers.length].fw_id : null,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      };
    });
    _demoSaveSamples(projectId, samples);
    // Update project counts
    const projects = _demoProjects();
    const pIdx = projects.findIndex((p) => p.project_id === projectId);
    if (pIdx >= 0) {
      const completed = samples.filter((s) => s.status === 'completed').length;
      projects[pIdx].sample_count = samples.length;
      projects[pIdx].completed_samples = completed;
      projects[pIdx].completion_pct = Math.round((completed / samples.length) * 100);
      // Update researcher sample counts
      if (researchers.length > 0) {
        const fwSamples = {};
        const fwCompleted = {};
        samples.forEach((s) => {
          if (s.assigned_fw_id) {
            fwSamples[s.assigned_fw_id] = (fwSamples[s.assigned_fw_id] || 0) + 1;
            if (s.status === 'completed') fwCompleted[s.assigned_fw_id] = (fwCompleted[s.assigned_fw_id] || 0) + 1;
          }
        });
        const updatedRw = researchers.map((rw) => ({
          ...rw,
          total_samples: fwSamples[rw.fw_id] || 0,
          completed_samples: fwCompleted[rw.fw_id] || 0,
        }));
        _demoSaveResearchers(projectId, updatedRw);
        projects[pIdx].researcher_count = updatedRw.length;
      }
      _demoSave(projects);
    }
    return { inserted: samples.length };
  }
  const formData = new FormData();
  formData.append('file', file);
  const url = `${API_BASE}/api/projects/${projectId}/upload/samples`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadResearchers(projectId, file) {
  if (DEMO_MODE) {
    const text = await file.text();
    const rows = _parseCSV(text);
    // Random Abu Dhabi coordinates near their home_location
    const baseLat = 24.45;
    const baseLng = 54.38;
    const researchers = rows.map((row, i) => ({
      id: crypto.randomUUID(),
      project_id: projectId,
      fw_id: row.fw_id || `FW-${String(i + 1).padStart(3, '0')}`,
      name: row.name || `Researcher ${i + 1}`,
      phone: row.phone || '',
      email: row.email || '',
      home_location: row.home_location || '',
      region: row.region || 'Abu Dhabi',
      shift: row.shift || (i % 2 === 0 ? 'morning' : 'evening'),
      is_active: true,
      in_field: Math.random() > 0.3,
      total_samples: 0,
      completed_samples: 0,
      latitude: baseLat + (Math.random() - 0.5) * 0.08,
      longitude: baseLng + (Math.random() - 0.5) * 0.08,
    }));
    _demoSaveResearchers(projectId, researchers);
    // Update project
    const projects = _demoProjects();
    const pIdx = projects.findIndex((p) => p.project_id === projectId);
    if (pIdx >= 0) {
      projects[pIdx].researcher_count = researchers.length;
      _demoSave(projects);
    }
    // If samples already exist, re-assign
    const samples = _demoSamples(projectId);
    if (samples.length > 0) {
      const fwSamples = {};
      const fwCompleted = {};
      const updated = samples.map((s, i) => {
        const fwId = researchers[i % researchers.length].fw_id;
        fwSamples[fwId] = (fwSamples[fwId] || 0) + 1;
        if (s.status === 'completed') fwCompleted[fwId] = (fwCompleted[fwId] || 0) + 1;
        return { ...s, assigned_fw_id: fwId };
      });
      _demoSaveSamples(projectId, updated);
      const updatedRw = researchers.map((rw) => ({
        ...rw,
        total_samples: fwSamples[rw.fw_id] || 0,
        completed_samples: fwCompleted[rw.fw_id] || 0,
      }));
      _demoSaveResearchers(projectId, updatedRw);
    }
    return { inserted: researchers.length };
  }
  const formData = new FormData();
  formData.append('file', file);
  const url = `${API_BASE}/api/projects/${projectId}/upload/researchers`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function validateProjectSamples(projectId) {
  if (DEMO_MODE) {
    // Simulate validation — mark most as valid, a few as warning
    const samples = _demoSamples(projectId);
    const validated = samples.map((s, i) => ({
      ...s,
      validation_status: i % 7 === 0 ? 'warning' : 'valid',
      validation_note: i % 7 === 0 ? 'Commercial/industrial zone nearby' : 'Residential area confirmed',
    }));
    _demoSaveSamples(projectId, validated);
    return { validated: validated.length };
  }
  return request(`/api/projects/${projectId}/validate-samples`, { method: 'POST' });
}

export async function fetchDashboardOverview() {
  if (DEMO_MODE) {
    const projects = _demoProjects();
    const active = projects.filter((p) => p.status === 'active').length;
    const completed = projects.filter((p) => p.status === 'completed').length;
    const paused = projects.filter((p) => p.status === 'paused').length;
    return {
      total: projects.length,
      active,
      completed,
      paused,
      activeResearchers: projects.reduce((s, p) => s + (p.researcher_count || 0), 0),
      totalSamples: projects.reduce((s, p) => s + (p.sample_count || 0), 0),
    };
  }
  return request('/api/projects/dashboard/overview');
}

// --- Aggregated data for DSS dashboard ---

export async function fetchAllResearchersAcrossProjects() {
  if (DEMO_MODE) {
    const projects = _demoProjects();
    const all = [];
    projects.forEach((p) => {
      const rws = _demoResearchers(p.project_id);
      rws.forEach((rw) => all.push({ ...rw, project_name: p.project_name, project_id: p.project_id }));
    });
    return all;
  }
  return request('/api/projects/researchers/all');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 6 — Trajectory, Geofence, ETA, Risk APIs
// ═══════════════════════════════════════════════════════════════════

export async function fetchTrajectory(employeeId, date) {
  if (DEMO_MODE) {
    // Generate a demo trajectory path within Abu Dhabi
    const baseLat = 24.45 + (Math.random() - 0.5) * 0.04;
    const baseLng = 54.38 + (Math.random() - 0.5) * 0.04;
    const points = [];
    const count = 120;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      points.push([
        baseLng + Math.sin(t * Math.PI * 2) * 0.008 + (Math.random() - 0.5) * 0.001,
        baseLat + Math.cos(t * Math.PI * 3) * 0.005 + t * 0.01 + (Math.random() - 0.5) * 0.001,
      ]);
    }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: points },
        properties: {
          employee_id: employeeId,
          point_count: count,
          from: `${date}T08:00:00Z`,
          to: `${date}T17:00:00Z`,
        },
      }],
    };
  }
  return request(`/api/researchers/${employeeId}/trajectory?date=${date}`);
}

export async function fetchProjectETAs(projectId) {
  if (DEMO_MODE) {
    const researchers = _demoResearchers(projectId);
    const samples = _demoSamples(projectId);
    return researchers.map((rw) => {
      const pending = samples.filter((s) => s.assigned_fw_id === rw.fw_id && s.status === 'pending');
      const next = pending[0];
      if (!next || !rw.latitude) return { fw_id: rw.fw_id, name: rw.name, eta_seconds: null, next_sample_id: null, distance_m: null };
      const dist = _haversineM(rw.latitude, rw.longitude, next.latitude, next.longitude);
      const eta = Math.round(dist / 1.2);
      return { fw_id: rw.fw_id, name: rw.name, eta_seconds: eta, next_sample_id: next.sample_id, distance_m: Math.round(dist) };
    });
  }
  return request(`/api/projects/${projectId}/etas`);
}

export async function fetchProjectBreaches(projectId) {
  if (DEMO_MODE) return [];
  return request(`/api/projects/${projectId}/geofence-breaches`);
}

export async function fetchProjectRisk(projectId) {
  if (DEMO_MODE) {
    const project = _demoProjects().find((p) => p.project_id === projectId);
    if (!project) return null;
    const samples = _demoSamples(projectId);
    const completed = samples.filter((s) => s.status === 'completed').length;
    const remaining = samples.length - completed;
    const avgDaily = completed > 0 ? Math.max(1, Math.round(completed / 7)) : 0;
    const daysNeeded = avgDaily > 0 ? Math.ceil(remaining / avgDaily) : 999;
    const today = new Date();
    const projected = new Date(today.getTime() + daysNeeded * 86400000);
    const end = new Date(project.end_date);
    return {
      project_id: projectId,
      project_name: project.project_name,
      projected_completion_date: projected.toISOString().split('T')[0],
      days_remaining: daysNeeded,
      at_risk: projected > end,
      confidence_pct: Math.min(100, Math.round((Math.min(7, 5) / 7) * 100)),
      avg_daily_velocity: avgDaily,
      remaining_samples: remaining,
    };
  }
  return request(`/api/projects/${projectId}/risk`);
}

export async function fetchDailyVelocity(projectId) {
  if (DEMO_MODE) {
    // Generate 7-day velocity data
    return Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0],
      completed: Math.floor(Math.random() * 8) + 1,
    }));
  }
  return request(`/api/projects/${projectId}/daily_velocity`);
}

function _haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════════
// Enumerators — global personnel registry with Asset Barcode
// ═══════════════════════════════════════════════════════════════════

function _demoEnumerators() {
  try { return JSON.parse(localStorage.getItem('demo_enumerators') || '[]'); }
  catch { return []; }
}
function _demoSaveEnumerators(enumerators) {
  localStorage.setItem('demo_enumerators', JSON.stringify(enumerators));
}

export async function fetchEnumerators() {
  if (DEMO_MODE) return _demoEnumerators();
  return request('/api/enumerators');
}

export async function addEnumerator(data) {
  if (DEMO_MODE) {
    const enumerators = _demoEnumerators();
    if (enumerators.some((e) => e.asset_barcode === data.asset_barcode)) {
      throw new Error('An enumerator with this Asset Barcode already exists');
    }
    const enumerator = {
      id: crypto.randomUUID(),
      asset_barcode: data.asset_barcode,
      name: data.name,
      phone: data.phone || '',
      email: data.email || '',
      region: data.region || 'Abu Dhabi',
      shift: data.shift || 'morning',
      created_at: new Date().toISOString(),
    };
    enumerators.push(enumerator);
    _demoSaveEnumerators(enumerators);
    return enumerator;
  }
  return request('/api/enumerators', { method: 'POST', body: JSON.stringify(data) });
}

export async function uploadEnumeratorsCSV(file) {
  if (DEMO_MODE) {
    const text = await file.text();
    const rows = _parseCSV(text);
    const existing = _demoEnumerators();
    const existingBarcodes = new Set(existing.map((e) => e.asset_barcode));
    let inserted = 0;
    let updated = 0;
    rows.forEach((row) => {
      const barcode = row.asset_barcode;
      if (!barcode) return;
      const record = {
        id: crypto.randomUUID(),
        asset_barcode: barcode,
        name: row.name || '',
        phone: row.phone || '',
        email: row.email || '',
        region: row.region || 'Abu Dhabi',
        shift: row.shift || 'morning',
        created_at: new Date().toISOString(),
      };
      if (existingBarcodes.has(barcode)) {
        const idx = existing.findIndex((e) => e.asset_barcode === barcode);
        if (idx >= 0) { record.id = existing[idx].id; record.created_at = existing[idx].created_at; existing[idx] = record; updated++; }
      } else {
        existing.push(record);
        existingBarcodes.add(barcode);
        inserted++;
      }
    });
    _demoSaveEnumerators(existing);
    return { inserted, updated, total: existing.length };
  }
  const formData = new FormData();
  formData.append('file', file);
  const url = `${API_BASE}/api/enumerators/upload`;
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteEnumerator(assetBarcode) {
  if (DEMO_MODE) {
    const enumerators = _demoEnumerators().filter((e) => e.asset_barcode !== assetBarcode);
    _demoSaveEnumerators(enumerators);
    return { deleted: true };
  }
  return request(`/api/enumerators/${encodeURIComponent(assetBarcode)}`, { method: 'DELETE' });
}

export async function updateEnumerator(assetBarcode, data) {
  if (DEMO_MODE) {
    const enumerators = _demoEnumerators();
    const idx = enumerators.findIndex((e) => e.asset_barcode === assetBarcode);
    if (idx < 0) throw new Error('Enumerator not found');
    enumerators[idx] = { ...enumerators[idx], ...data };
    _demoSaveEnumerators(enumerators);
    return enumerators[idx];
  }
  return request(`/api/enumerators/${encodeURIComponent(assetBarcode)}`, { method: 'PUT', body: JSON.stringify(data) });
}

// ═══════════════════════════════════════════════════════════════════
// Phase 9 — Sample Distribution, Stratification & Field Allocation
// ═══════════════════════════════════════════════════════════════════

// --- Demo data helpers ---
function _demoProjectNames() {
  const defaults = [
    { id: 1, name: 'Economic Survey — Manufacturing Sector 2026', project_type: 'economic' },
    { id: 2, name: 'Economic Survey — Retail & Trade 2026', project_type: 'economic' },
    { id: 3, name: 'Economic Survey — Construction Sector 2026', project_type: 'economic' },
    { id: 4, name: 'Economic Survey — Hospitality & Tourism 2026', project_type: 'economic' },
    { id: 5, name: 'Economic Survey — Financial Services 2026', project_type: 'economic' },
    { id: 6, name: 'Population & Housing Census — Abu Dhabi Island', project_type: 'social' },
    { id: 7, name: 'Labour Force Survey — Musaffah District', project_type: 'social' },
    { id: 8, name: 'Household Income Survey — Al Ain Region', project_type: 'social' },
    { id: 9, name: 'Social Welfare Survey — Al Dhafra Region', project_type: 'social' },
    { id: 10, name: 'Housing Conditions Survey — Eastern Region', project_type: 'social' },
  ];
  try {
    const stored = JSON.parse(localStorage.getItem('demo_project_names') || 'null');
    return stored || defaults;
  } catch { return defaults; }
}
function _demoSaveProjectNames(names) {
  localStorage.setItem('demo_project_names', JSON.stringify(names));
}

function _demoEconomicProjects() {
  try { return JSON.parse(localStorage.getItem('demo_economic_projects') || '[]'); }
  catch { return []; }
}
function _demoSaveEconomicProjects(projects) {
  localStorage.setItem('demo_economic_projects', JSON.stringify(projects));
}

// ── Template Social Project Seed ──
async function _seedTemplateSocialProject() {
  const TEMPLATE_ID = 'template-social-001';

  // Abu Dhabi district data with bilingual names
  const districtData = {
    'AD-C': [
      ['AD-C-01', 24.469, 54.338, 'Al Khalidiya', 'الخالدية'],
      ['AD-C-02', 24.456, 54.348, 'Al Bateen', 'البطين'],
      ['AD-C-03', 24.453, 54.383, 'Al Mushrif', 'المشرف'],
      ['AD-C-04', 24.451, 54.411, 'Al Muroor', 'المرور'],
      ['AD-C-05', 24.484, 54.368, 'Al Danah', 'الدانة'],
      ['AD-C-06', 24.494, 54.381, 'Al Zahiyah', 'الزاهية'],
      ['AD-C-07', 24.478, 54.346, 'Al Hosn', 'الحصن'],
      ['AD-C-08', 24.467, 54.384, 'Al Wahdah', 'الوحدة'],
      ['AD-C-09', 24.458, 54.364, 'Al Karama', 'الكرامة'],
      ['AD-C-10', 24.495, 54.406, 'Al Reem Island', 'جزيرة الريم'],
      ['AD-C-11', 24.502, 54.388, 'Al Maryah Island', 'جزيرة المارية'],
      ['AD-C-12', 24.542, 54.437, 'Saadiyat Island', 'جزيرة السعديات'],
      ['AD-C-13', 24.496, 54.606, 'Yas Island', 'جزيرة ياس'],
    ],
    'AD-M': [
      ['AD-M-01', 24.418, 54.582, 'Khalifa City', 'مدينة خليفة'],
      ['AD-M-02', 24.336, 54.547, 'Mohammed Bin Zayed City', 'مدينة محمد بن زايد'],
      ['AD-M-03', 24.409, 54.613, 'Shakhbout City', 'مدينة شخبوط'],
      ['AD-M-04', 24.363, 54.505, 'Mussafah', 'المصفح'],
      ['AD-M-05', 24.411, 54.512, 'Rabdan', 'ربدان'],
      ['AD-M-06', 24.412, 54.488, 'Al Maqta', 'المقطع'],
      ['AD-M-07', 24.437, 54.576, 'Al Raha Beach', 'شاطئ الراحة'],
      ['AD-M-08', 24.438, 54.518, 'Sas Al Nakhl', 'ساس النخل'],
    ],
    'AD-W': [
      ['AD-W-01', 24.301, 54.636, 'Bani Yas', 'بني ياس'],
      ['AD-W-02', 24.385, 54.707, 'Al Shamkha', 'الشامخة'],
      ['AD-W-03', 24.331, 54.675, 'Al Shawamekh', 'الشوامخ'],
      ['AD-W-04', 24.444, 54.698, 'Al Falah', 'الفلاح'],
      ['AD-W-05', 24.316, 54.729, 'Riyadh City', 'مدينة الرياض'],
      ['AD-W-06', 24.256, 54.718, 'Al Wathba', 'الوثبة'],
      ['AD-W-07', 24.288, 54.609, 'Al Mafraq', 'المفرق'],
    ],
    'AD-S': [
      ['AD-S-01', 24.545, 54.686, 'Al Shahama', 'الشهامة'],
      ['AD-S-02', 24.551, 54.662, 'Al Bahyah', 'الباهية'],
      ['AD-S-03', 24.591, 54.717, 'Al Rahbah', 'الرحبة'],
      ['AD-S-04', 24.646, 54.757, 'Al Samhah', 'السمحة'],
      ['AD-S-05', 24.459, 54.664, 'Al Reef', 'الريف'],
      ['AD-S-06', 24.851, 54.881, 'Ghantoot', 'غنتوت'],
    ],
  };

  const HPA = 4; // households per area
  const TPR = 14; // areas per researcher
  const TOTAL_EAS = 200; // manageable template size
  const weights = { 'AD-C': 0.38, 'AD-M': 0.28, 'AD-W': 0.20, 'AD-S': 0.14 };

  const targets = [];
  let eaNum = 1;

  for (const [center, weight] of Object.entries(weights)) {
    const dists = districtData[center];
    const centerCount = Math.round(TOTAL_EAS * weight);
    const perDist = Math.floor(centerCount / dists.length);
    const remainder = centerCount - perDist * dists.length;

    for (let di = 0; di < dists.length; di++) {
      const [dCode, baseLat, baseLon, nameEn, nameAr] = dists[di];
      const n = perDist + (di < remainder ? 1 : 0);
      for (let j = 0; j < n; j++) {
        targets.push({
          id: crypto.randomUUID(),
          target_type: 'area',
          code: `EA-${String(eaNum++).padStart(5, '0')}`,
          name_en: `${nameEn} Sector ${j + 1}`,
          name_ar: `${nameAr} قطاع ${j + 1}`,
          name: `${nameEn} Sector ${j + 1}`,
          category: 'enumeration_area',
          district_code: dCode,
          district_en: nameEn,
          district_ar: nameAr,
          district: nameEn,
          municipal_center: center,
          governorate: 'Abu Dhabi',
          stratum: 'urban',
          latitude: baseLat + (Math.random() - 0.5) * 0.03,
          longitude: baseLon + (Math.random() - 0.5) * 0.03,
          household_count: Math.floor(Math.random() * 200) + 50,
          selected_households: HPA,
          difficulty_factor: 1.0,
          assigned_researcher_id: null,
          cluster_id: null,
          assignment_order: null,
          status: 'pending',
        });
      }
    }
  }

  // Generate households
  const households = [];
  targets.forEach((target) => {
    for (let h = 0; h < target.selected_households; h++) {
      households.push({
        id: crypto.randomUUID(),
        target_id: target.id,
        household_code: `${target.code}-HH${String(h + 1).padStart(2, '0')}`,
        latitude: target.latitude + (Math.random() - 0.5) * 0.005,
        longitude: target.longitude + (Math.random() - 0.5) * 0.005,
        household_size: Math.floor(Math.random() * 6) + 2,
        housing_type: ['villa', 'apartment', 'traditional'][Math.floor(Math.random() * 3)],
        nationality_group: ['citizen', 'gcc', 'arab', 'asian', 'western'][Math.floor(Math.random() * 5)],
        is_reserve: false,
        visit_order: h + 1,
        visit_count: 0,
        interview_status: 'pending',
      });
    }
    for (let r = 0; r < 2; r++) {
      households.push({
        id: crypto.randomUUID(),
        target_id: target.id,
        household_code: `${target.code}-RES${String(r + 1).padStart(2, '0')}`,
        latitude: target.latitude + (Math.random() - 0.5) * 0.005,
        longitude: target.longitude + (Math.random() - 0.5) * 0.005,
        household_size: Math.floor(Math.random() * 6) + 2,
        housing_type: ['villa', 'apartment', 'traditional'][Math.floor(Math.random() * 3)],
        nationality_group: ['citizen', 'arab', 'asian'][Math.floor(Math.random() * 3)],
        is_reserve: true,
        visit_order: null,
        visit_count: 0,
        interview_status: 'reserve',
      });
    }
  });

  const totalHH = targets.length * HPA;
  const numResearchers = Math.ceil(targets.length / TPR);

  const project = {
    id: TEMPLATE_ID,
    registry_id: null,
    name: 'Housing Conditions Survey — Abu Dhabi Template',
    project_type: 'social',
    total_samples: totalHH,
    working_days: 21,
    start_date: '2026-03-23',
    end_date: '2026-04-30',
    controller_ratio: 10,
    num_researchers: numResearchers,
    controllers_needed: Math.ceil(numResearchers / 10),
    budget: 250000,
    enum_monthly_salary: 6000,
    ctrl_monthly_salary: 8003,
    samples_per_day: 8,
    workforce_roles: [
      { id: 1, name: 'Enumerator', monthly_salary: 6000, count: numResearchers, is_field_worker: true },
      { id: 2, name: 'Controller', monthly_salary: 8003, count: Math.ceil(numResearchers / 10), is_field_worker: false },
    ],
    collection_mode: 'areas',
    targets_per_researcher: TPR,
    households_per_area: HPA,
    status: 'active',
    created_at: new Date().toISOString(),
    company_count: 0,
    target_count: targets.length,
    total_sample: totalHH,
  };

  const projects = _demoEconomicProjects();
  projects.push(project);
  _demoSaveEconomicProjects(projects);
  await _demoSaveTargets(TEMPLATE_ID, targets);
  await _demoSaveHouseholds(TEMPLATE_ID, households);
}

async function _demoCompanies(projectId) {
  return _idbGet(`demo_companies_${projectId}`);
}
async function _demoSaveCompanies(projectId, companies) {
  return _idbSet(`demo_companies_${projectId}`, companies);
}

// --- Project Name Registry ---

export async function fetchProjectNames(projectType) {
  if (DEMO_MODE) {
    const names = _demoProjectNames();
    return projectType ? names.filter((n) => n.project_type === projectType) : names;
  }
  const params = projectType ? `?project_type=${projectType}` : '';
  return request(`/api/project-names${params}`);
}

export async function addProjectName(data) {
  if (DEMO_MODE) {
    const names = _demoProjectNames();
    const newName = { id: names.length + 1, ...data, created_at: new Date().toISOString() };
    names.push(newName);
    _demoSaveProjectNames(names);
    return newName;
  }
  return request('/api/project-names', { method: 'POST', body: JSON.stringify(data) });
}

// --- ISIC4 Lookup ---

export async function fetchISIC4Tree() {
  if (DEMO_MODE) {
    // Return simplified demo ISIC sections
    return [
      { section_code: 'C', section_name_en: 'Manufacturing', divisions: [{ division_code: '10', division_name_en: 'Manufacture of food products' }] },
      { section_code: 'F', section_name_en: 'Construction', divisions: [{ division_code: '41', division_name_en: 'Construction of buildings' }] },
      { section_code: 'G', section_name_en: 'Wholesale and retail trade', divisions: [{ division_code: '47', division_name_en: 'Retail trade' }] },
      { section_code: 'H', section_name_en: 'Transportation and storage', divisions: [{ division_code: '49', division_name_en: 'Land transport' }] },
      { section_code: 'I', section_name_en: 'Accommodation and food service', divisions: [{ division_code: '55', division_name_en: 'Accommodation' }] },
      { section_code: 'K', section_name_en: 'Financial and insurance', divisions: [{ division_code: '64', division_name_en: 'Financial service activities' }] },
    ];
  }
  return request('/api/isic4');
}

export async function searchISIC4(query) {
  if (DEMO_MODE) return [];
  return request(`/api/isic4/search?q=${encodeURIComponent(query)}`);
}

// ── Phase 10.1 Live Map Demo Seed ──────────────────────────────────────────

function _seedLiveMapDemo() {
  const LIVE_ID = 'livemap-demo-001';
  const project = {
    id: LIVE_ID,
    registry_id: null,
    name: 'Population & Housing Census — Abu Dhabi Island',
    project_type: 'social',
    total_samples: 30,
    working_days: 22,
    start_date: '2026-03-26',
    end_date: '2026-04-24',
    controller_ratio: 9,
    num_researchers: 26,
    controllers_needed: 3,
    budget: 180000,
    enum_monthly_salary: 6000,
    ctrl_monthly_salary: 8000,
    samples_per_day: 6,
    workforce_roles: [
      { id: 1, name: 'Enumerator', monthly_salary: 6000, count: 26, is_field_worker: true },
      { id: 2, name: 'Controller', monthly_salary: 8000, count: 3, is_field_worker: false },
      { id: 3, name: 'Supervisor', monthly_salary: 10000, count: 1, is_field_worker: false },
    ],
    enumerators_count: 26,
    controllers_count: 3,
    collection_mode: 'areas',
    targets_per_researcher: 2,
    households_per_area: 4,
    status: 'in_progress',
    created_at: '2026-03-26T08:00:00.000Z',
    company_count: 0,
    target_count: 30,
    total_sample: 30,
  };

  const projects = _demoEconomicProjects();
  projects.push(project);
  _demoSaveEconomicProjects(projects);
}

// --- Economic Projects ---

export async function fetchEconomicProjects(projectType) {
  if (DEMO_MODE) {
    let projects = _demoEconomicProjects();
    // Auto-seed a template social project only on first-ever use (not if user deleted it)
    if (!projects.some((p) => p.id === 'template-social-001') && !localStorage.getItem('template_social_dismissed')) {
      await _seedTemplateSocialProject();
      projects = _demoEconomicProjects();
    }
    // Auto-seed Phase 10.1 live map demo project
    if (!projects.some((p) => p.id === 'livemap-demo-001') && !localStorage.getItem('livemap_demo_dismissed')) {
      _seedLiveMapDemo();
      projects = _demoEconomicProjects();
    }
    return projectType ? projects.filter((p) => p.project_type === projectType) : projects;
  }
  const params = projectType ? `?project_type=${projectType}` : '';
  return request(`/api/economic-projects${params}`);
}

export async function fetchEconomicProject(projectId) {
  if (DEMO_MODE) {
    const proj = _demoEconomicProjects().find((p) => p.id === projectId);
    if (!proj) throw new Error('Project not found');
    const companies = await _demoCompanies(projectId);
    const targets = await _demoTargets(projectId);
    const completed = companies.filter((c) => c.interview_status === 'completed').length;
    const households = proj.project_type === 'social'
      ? await _demoHouseholds(projectId)
      : [];
    return {
      ...proj,
      company_count: companies.length,
      target_count: targets.length,
      completed_count: completed,
      pending_count: companies.length - completed,
      total_households: households.filter((h) => !h.is_reserve).length,
      total_reserves: households.filter((h) => h.is_reserve).length,
      staffing_plan: _computeStaffingPlan(proj.total_samples || companies.length || targets.length, proj.working_days, proj.num_researchers, proj.controller_ratio),
    };
  }
  return request(`/api/economic-projects/${projectId}`);
}

export async function createEconomicProject(data) {
  if (DEMO_MODE) {
    const projects = _demoEconomicProjects();
    const project = {
      id: crypto.randomUUID(),
      registry_id: data.registry_id || null,
      name: data.name,
      project_type: data.project_type || 'economic',
      total_samples: data.total_samples || 0,
      working_days: data.working_days || 80,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      controller_ratio: data.controller_ratio || 10,
      num_researchers: data.num_researchers || 10,
      controllers_needed: data.controllers_needed || Math.ceil((data.num_researchers || 10) / (data.controller_ratio || 10)),
      budget: data.budget || 0,
      enum_monthly_salary: data.enum_monthly_salary || 6000,
      ctrl_monthly_salary: data.ctrl_monthly_salary || 8000,
      samples_per_day: data.samples_per_day || 8,
      workforce_roles: data.workforce_roles || null,
      // Locked allocation fields (set at creation, read-only after)
      enumerators_count: data.enumerators_count || data.num_researchers || 0,
      controllers_count: data.controllers_count || data.controllers_needed || 0,
      // Social survey parameters
      collection_mode: data.collection_mode || null,
      targets_per_researcher: data.targets_per_researcher || null,
      households_per_area: data.households_per_area || null,
      status: 'setup',
      created_at: new Date().toISOString(),
      company_count: 0,
      target_count: 0,
    };
    projects.push(project);
    _demoSaveEconomicProjects(projects);
    return project;
  }
  return request('/api/economic-projects', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateEconomicProject(projectId, data) {
  if (DEMO_MODE) {
    const projects = _demoEconomicProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx < 0) throw new Error('Project not found');
    projects[idx] = { ...projects[idx], ...data };
    _demoSaveEconomicProjects(projects);
    return projects[idx];
  }
  return request(`/api/economic-projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteEconomicProject(projectId) {
  if (DEMO_MODE) {
    const projects = _demoEconomicProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx < 0) throw new Error('Project not found');
    if (projectId === 'template-social-001') localStorage.setItem('template_social_dismissed', '1');
    if (projectId === 'livemap-demo-001') localStorage.setItem('livemap_demo_dismissed', '1');
    projects.splice(idx, 1);
    _demoSaveEconomicProjects(projects);
    // Clean up related data
    await _idbDelete(`demo_companies_${projectId}`);
    await _idbDelete(`demo_targets_${projectId}`);
    await _idbDelete(`demo_households_${projectId}`);
    localStorage.removeItem(`demo_allocation_${projectId}`);
    localStorage.removeItem(`project_team_${projectId}`);
    localStorage.removeItem(`project_controllers_${projectId}`);
    return { status: 'deleted', id: projectId };
  }
  return request(`/api/economic-projects/${projectId}`, { method: 'DELETE' });
}

// --- Sample Upload ---

function _computeStratum(numEmployees) {
  if (numEmployees <= 9) return 1;
  if (numEmployees <= 49) return 2;
  if (numEmployees <= 249) return 3;
  return 4;
}

function _computeStaffingPlan(totalSample, workingDays, numResearchers, controllerRatio) {
  const dailyTarget = workingDays > 0 ? Math.ceil(totalSample / workingDays) : 0;
  const perResearcher = numResearchers > 0 ? Math.ceil(dailyTarget / numResearchers) : 0;
  const controllersNeeded = controllerRatio > 0 ? Math.ceil(numResearchers / controllerRatio) : 0;
  return {
    total_sample: totalSample,
    working_days: workingDays,
    num_researchers: numResearchers,
    controller_ratio: controllerRatio,
    daily_target: dailyTarget,
    per_researcher_daily: perResearcher,
    controllers_needed: controllersNeeded,
  };
}

export async function uploadEconomicSample(projectId, file) {
  if (DEMO_MODE) {
    const text = await file.text();
    const rows = _parseCSV(text);
    const companies = rows.map((row, i) => ({
      id: crypto.randomUUID(),
      company_id: row.company_id || `CO-${String(i + 1).padStart(4, '0')}`,
      company_name: row.company_name || `Company ${i + 1}`,
      latitude: parseFloat(row.latitude) || 24.4 + Math.random() * 0.15,
      longitude: parseFloat(row.longitude) || 54.3 + Math.random() * 0.25,
      isic_code: row.isic_code || '',
      isic_section: (row.isic_code || '')[0] === '0' ? 'A' : null,
      num_employees: parseInt(row.num_employees) || Math.floor(Math.random() * 500) + 1,
      stratum: null,
      region: row.region || 'Abu Dhabi',
      address: row.address || '',
      assigned_researcher_id: null,
      assigned_controller_id: null,
      cluster_id: null,
      interview_status: 'pending',
    }));
    companies.forEach((c) => { c.stratum = _computeStratum(c.num_employees); });
    await _demoSaveCompanies(projectId, companies);
    // Update project
    const projects = _demoEconomicProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx >= 0) {
      projects[idx].total_sample = companies.length;
      projects[idx].status = 'active';
      _demoSaveEconomicProjects(projects);
    }
    return { inserted: companies.length, errors: [], total_rows: companies.length, total_in_project: companies.length };
  }
  const formData = new FormData();
  formData.append('file', file);
  const url = `${API_BASE}/api/economic-projects/${projectId}/upload`;
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Sample Statistics ---

export async function fetchSampleStats(projectId) {
  if (DEMO_MODE) {
    const companies = await _demoCompanies(projectId);
    const total = companies.length;
    const stratumCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const isicCounts = {};
    companies.forEach((c) => {
      stratumCounts[c.stratum] = (stratumCounts[c.stratum] || 0) + 1;
      if (c.isic_section) isicCounts[c.isic_section] = (isicCounts[c.isic_section] || 0) + 1;
    });
    const labels = { 1: 'Micro', 2: 'Small', 3: 'Medium', 4: 'Large' };
    return {
      total_companies: total,
      stratum_breakdown: Object.entries(stratumCounts).map(([s, cnt]) => ({
        stratum: parseInt(s), label: labels[s], count: cnt, pct: total > 0 ? Math.round(cnt / total * 1000) / 10 : 0,
      })),
      isic_breakdown: Object.entries(isicCounts).map(([sec, cnt]) => ({
        section: sec, name: sec, count: cnt, pct: total > 0 ? Math.round(cnt / total * 1000) / 10 : 0,
      })),
      cross_table: [],
      region_breakdown: [{ region: 'Abu Dhabi', count: total }],
    };
  }
  return request(`/api/economic-projects/${projectId}/sample-stats`);
}

// --- Companies list ---

export async function fetchCompanies(projectId, params = {}) {
  if (DEMO_MODE) {
    let companies = await _demoCompanies(projectId);
    if (params.stratum) companies = companies.filter((c) => c.stratum === params.stratum);
    if (params.isic_section) companies = companies.filter((c) => c.isic_section === params.isic_section);
    if (params.researcher_id) companies = companies.filter((c) => c.assigned_researcher_id === params.researcher_id);
    return { total: companies.length, companies };
  }
  const qs = new URLSearchParams(params).toString();
  return request(`/api/economic-projects/${projectId}/companies?${qs}`);
}

// --- Staffing Plan ---

export async function fetchStaffingPlan(projectId) {
  if (DEMO_MODE) {
    const proj = _demoEconomicProjects().find((p) => p.id === projectId);
    if (!proj) throw new Error('Project not found');
    const companies = await _demoCompanies(projectId);
    return _computeStaffingPlan(companies.length || proj.total_sample, proj.working_days, proj.num_researchers, proj.controller_ratio);
  }
  return request(`/api/economic-projects/${projectId}/staffing-plan`);
}

export async function updateStaffingPlan(projectId, data) {
  if (DEMO_MODE) {
    const projects = _demoEconomicProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx < 0) throw new Error('Project not found');
    Object.assign(projects[idx], data);
    _demoSaveEconomicProjects(projects);
    const companies = await _demoCompanies(projectId);
    return _computeStaffingPlan(
      companies.length || projects[idx].total_sample,
      projects[idx].working_days,
      projects[idx].num_researchers,
      projects[idx].controller_ratio,
    );
  }
  return request(`/api/economic-projects/${projectId}/staffing-plan`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// --- Allocation Engine (4-phase fair distribution) ---

const STRATUM_W = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 2.5 };

function _haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _demoAllocate(companies, numR) {
  const k = Math.min(numR, companies.length);
  const totalW = companies.reduce((s, c) => s + (STRATUM_W[c.stratum] || 1), 0);
  const wTarget = totalW / k;
  const wMax = wTarget * 1.1;

  // Phase 1: K-means++ init + constrained assignment
  const centroids = [];
  const firstIdx = Math.floor(Math.random() * companies.length);
  centroids.push({ lat: companies[firstIdx].latitude, lon: companies[firstIdx].longitude });
  for (let ci = 1; ci < k; ci++) {
    let dists = companies.map((c) => {
      const minD = centroids.reduce((m, cx) => Math.min(m, _haversine(c.latitude, c.longitude, cx.lat, cx.lon)), Infinity);
      return minD * minD;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, cum = 0;
    for (let i = 0; i < dists.length; i++) { cum += dists[i]; if (cum >= r) { centroids.push({ lat: companies[i].latitude, lon: companies[i].longitude }); break; } }
    if (centroids.length <= ci) centroids.push({ lat: companies[0].latitude, lon: companies[0].longitude });
  }

  // Iterative constrained K-means (3 iterations for speed in demo)
  let labels = new Array(companies.length).fill(0);
  for (let iter = 0; iter < 3; iter++) {
    const pairs = [];
    companies.forEach((c, i) => {
      centroids.forEach((cx, ki) => {
        pairs.push({ dist: _haversine(c.latitude, c.longitude, cx.lat, cx.lon), ci: i, ki });
      });
    });
    pairs.sort((a, b) => a.dist - b.dist);

    const clusterW = new Array(k).fill(0);
    const assigned = new Array(companies.length).fill(false);
    const newLabels = new Array(companies.length).fill(0);

    for (const { ci: idx, ki } of pairs) {
      if (assigned[idx]) continue;
      const w = STRATUM_W[companies[idx].stratum] || 1;
      if (clusterW[ki] + w <= wMax) {
        newLabels[idx] = ki;
        clusterW[ki] += w;
        assigned[idx] = true;
      }
    }
    // Assign remaining to least loaded
    companies.forEach((c, i) => {
      if (!assigned[i]) {
        const best = clusterW.indexOf(Math.min(...clusterW));
        newLabels[i] = best;
        clusterW[best] += STRATUM_W[c.stratum] || 1;
      }
    });
    labels = newLabels;

    // Update centroids
    for (let ki = 0; ki < k; ki++) {
      const members = companies.filter((_, i) => labels[i] === ki);
      if (members.length > 0) {
        centroids[ki] = {
          lat: members.reduce((s, m) => s + m.latitude, 0) / members.length,
          lon: members.reduce((s, m) => s + m.longitude, 0) / members.length,
        };
      }
    }
  }

  // Phase 2: Stratum balancing (simplified swap pass)
  const globalDist = {};
  [1, 2, 3, 4].forEach((s) => { globalDist[s] = companies.filter((c) => c.stratum === s).length / companies.length; });

  for (let pass = 0; pass < 200; pass++) {
    const clusters = {};
    companies.forEach((c, i) => { if (!clusters[labels[i]]) clusters[labels[i]] = []; clusters[labels[i]].push(i); });

    let worst = -1, worstDev = 0;
    Object.entries(clusters).forEach(([ki, members]) => {
      const dist = {};
      [1, 2, 3, 4].forEach((s) => { dist[s] = members.filter((i) => companies[i].stratum === s).length / members.length; });
      const dev = [1, 2, 3, 4].reduce((s, st) => s + Math.abs((dist[st] || 0) - (globalDist[st] || 0)), 0);
      if (dev > worstDev) { worstDev = dev; worst = parseInt(ki); }
    });
    if (worstDev < 0.08 || worst < 0) break;

    // Try swap with a random other cluster
    const others = Object.keys(clusters).map(Number).filter((ki) => ki !== worst);
    if (!others.length) break;
    const other = others[Math.floor(Math.random() * others.length)];

    const a = clusters[worst][Math.floor(Math.random() * clusters[worst].length)];
    const b = clusters[other][Math.floor(Math.random() * clusters[other].length)];
    if (companies[a].stratum !== companies[b].stratum) {
      labels[a] = other;
      labels[b] = worst;
    }
  }

  // Phase 4: Workload leveling (transfer boundary)
  for (let pass = 0; pass < 100; pass++) {
    const clusterW = new Array(k).fill(0);
    companies.forEach((c, i) => { clusterW[labels[i]] += STRATUM_W[c.stratum] || 1; });
    const mean = clusterW.reduce((a, b) => a + b, 0) / k;
    const cv = Math.sqrt(clusterW.reduce((s, w) => s + (w - mean) ** 2, 0) / k) / mean;
    if (cv < 0.06) break;

    const over = clusterW.indexOf(Math.max(...clusterW));
    const under = clusterW.indexOf(Math.min(...clusterW));
    if (over === under) break;

    const underMembers = companies.filter((_, i) => labels[i] === under);
    if (!underMembers.length) break;
    const ucx = underMembers.reduce((s, m) => s + m.latitude, 0) / underMembers.length;
    const ucy = underMembers.reduce((s, m) => s + m.longitude, 0) / underMembers.length;

    let bestIdx = -1, bestDist = Infinity;
    companies.forEach((c, i) => {
      if (labels[i] === over) {
        const d = _haversine(c.latitude, c.longitude, ucx, ucy);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    });
    if (bestIdx >= 0) labels[bestIdx] = under;
  }

  // Apply assignments
  return companies.map((c, i) => ({ ...c, assigned_researcher_id: labels[i] + 1, cluster_id: labels[i] }));
}

function _computeAllocMetrics(companies, numR) {
  const k = Math.min(numR, companies.length);
  const clusters = {};
  companies.forEach((c) => {
    const ki = (c.assigned_researcher_id || 1) - 1;
    if (!clusters[ki]) clusters[ki] = [];
    clusters[ki].push(c);
  });
  const globalDist = {};
  [1, 2, 3, 4].forEach((s) => { globalDist[s] = companies.filter((c) => c.stratum === s).length / companies.length || 0; });

  const weights = [];
  const counts = [];
  const researchers = [];

  for (let ki = 0; ki < k; ki++) {
    const members = clusters[ki] || [];
    const count = members.length;
    const w = members.reduce((s, c) => s + (STRATUM_W[c.stratum] || 1), 0);
    weights.push(w);
    counts.push(count);

    const strata = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const isicCounts = {};
    members.forEach((c) => {
      strata[c.stratum] = (strata[c.stratum] || 0) + 1;
      const sec = c.isic_section || '?';
      isicCounts[sec] = (isicCounts[sec] || 0) + 1;
    });

    const target = companies.length / k;
    const wTarget = companies.reduce((s, c) => s + (STRATUM_W[c.stratum] || 1), 0) / k;
    const volumeScore = target > 0 ? Math.max(0, 1 - Math.abs(count - target) / target) : 1;
    const workloadScore = wTarget > 0 ? Math.max(0, 1 - Math.abs(w - wTarget) / wTarget) : 1;

    // Stratum JSD (simplified)
    let stratumDev = 0;
    [1, 2, 3, 4].forEach((s) => {
      const p = count > 0 ? (strata[s] || 0) / count : 0;
      stratumDev += Math.abs(p - (globalDist[s] || 0));
    });
    const stratumScore = Math.max(0, 1 - stratumDev / 0.5);

    // Geo spread
    let avgDist = 0;
    if (members.length > 1) {
      const cx = members.reduce((s, c) => s + c.latitude, 0) / count;
      const cy = members.reduce((s, c) => s + c.longitude, 0) / count;
      avgDist = members.reduce((s, c) => s + _haversine(c.latitude, c.longitude, cx, cy), 0) / count;
    }

    const overall = volumeScore * 0.2 + workloadScore * 0.3 + stratumScore * 0.3 + Math.max(0, 1 - avgDist / 10000) * 0.2;

    researchers.push({
      researcher_id: ki + 1, cluster_id: ki, count, weighted_load: Math.round(w * 10) / 10,
      stratum_1: strata[1], stratum_2: strata[2], stratum_3: strata[3], stratum_4: strata[4],
      isic_sections: isicCounts, avg_distance_m: Math.round(avgDist),
      volume_score: Math.round(volumeScore * 1000) / 1000,
      workload_score: Math.round(workloadScore * 1000) / 1000,
      stratum_score: Math.round(stratumScore * 1000) / 1000,
      overall_score: Math.round(overall * 1000) / 1000,
    });
  }

  // Aggregate metrics
  const meanW = weights.reduce((a, b) => a + b, 0) / weights.length || 1;
  const stdW = Math.sqrt(weights.reduce((s, w) => s + (w - meanW) ** 2, 0) / weights.length);
  const cv = meanW > 0 ? stdW / meanW : 0;
  const mmr = weights.length > 0 ? Math.min(...weights) / Math.max(...weights) : 1;
  const volRange = counts.length > 0 ? Math.max(...counts) - Math.min(...counts) : 0;

  // Gini
  const sorted = [...weights].sort((a, b) => a - b);
  const n = sorted.length;
  const gini = n > 0 && meanW > 0
    ? (2 * sorted.reduce((s, w, i) => s + (i + 1) * w, 0)) / (n * sorted.reduce((a, b) => a + b, 0)) - (n + 1) / n
    : 0;

  const overallScore = Math.min(100, Math.round(
    Math.max(0, 25 * (1 - cv / 0.15)) +
    Math.max(0, 25 * (mmr - 0.7) / 0.3) +
    Math.max(0, 25 * (1 - Math.max(gini, 0) / 0.1)) +
    25 * 0.8 // stratum JSD placeholder
  ));

  return {
    researchers,
    fairness_metrics: {
      workload_cv: Math.round(cv * 10000) / 10000,
      min_max_ratio: Math.round(mmr * 10000) / 10000,
      gini: Math.round(Math.max(gini, 0) * 10000) / 10000,
      volume_range: volRange,
      mean_geo_spread_m: Math.round(researchers.reduce((s, r) => s + r.avg_distance_m, 0) / researchers.length),
      overall_score: overallScore,
    },
  };
}

export async function runAllocation(projectId) {
  if (DEMO_MODE) {
    const companies = await _demoCompanies(projectId);
    const proj = _demoEconomicProjects().find((p) => p.id === projectId);
    if (!proj || !companies.length) throw new Error('No companies to allocate');
    const numR = proj.num_researchers || 10;

    // Run 4-phase allocation
    const allocated = _demoAllocate(companies, numR);
    await _demoSaveCompanies(projectId, allocated);

    const projects = _demoEconomicProjects();
    const pidx = projects.findIndex((p) => p.id === projectId);
    if (pidx >= 0) { projects[pidx].status = 'in_progress'; _demoSaveEconomicProjects(projects); }

    const { researchers, fairness_metrics } = _computeAllocMetrics(allocated, numR);
    return {
      plan_id: crypto.randomUUID(),
      total_companies: companies.length,
      num_researchers: numR,
      overall_fairness: fairness_metrics.overall_score / 100,
      researcher_scores: researchers,
      fairness_metrics,
    };
  }
  return request(`/api/economic-projects/${projectId}/allocate`, { method: 'POST' });
}

export async function fetchAllocation(projectId) {
  if (DEMO_MODE) {
    const companies = await _demoCompanies(projectId);
    const proj = _demoEconomicProjects().find((p) => p.id === projectId);
    const numR = proj?.num_researchers || 10;
    const { researchers, fairness_metrics } = _computeAllocMetrics(companies, numR);
    return {
      plan_id: null,
      fairness_score: fairness_metrics.overall_score / 100,
      total_companies: companies.length,
      researchers,
      fairness_metrics,
      companies,
    };
  }
  return request(`/api/economic-projects/${projectId}/allocation`);
}

export async function reassignCompanies(projectId, companyIds, toResearcherId, reason) {
  if (DEMO_MODE) {
    const companies = await _demoCompanies(projectId);
    const updated = companies.map((c) =>
      companyIds.includes(c.id) ? { ...c, assigned_researcher_id: toResearcherId } : c
    );
    await _demoSaveCompanies(projectId, updated);
    return { moved: companyIds.length, to_researcher_id: toResearcherId };
  }
  return request(`/api/economic-projects/${projectId}/allocation/reassign`, {
    method: 'PATCH',
    body: JSON.stringify({ company_ids: companyIds, to_researcher_id: toResearcherId, reason }),
  });
}

// ═══════════════════════════════════════════════════════════════════
// Social Survey — Targets, Areas, Households & Spatial Allocation
// ═══════════════════════════════════════════════════════════════════

async function _demoTargets(projectId) {
  return _idbGet(`demo_targets_${projectId}`);
}
async function _demoSaveTargets(projectId, targets) {
  return _idbSet(`demo_targets_${projectId}`, targets);
}
async function _demoHouseholds(projectId) {
  return _idbGet(`demo_households_${projectId}`);
}
async function _demoSaveHouseholds(projectId, households) {
  return _idbSet(`demo_households_${projectId}`, households);
}

/**
 * Upload survey targets for a social project.
 * CSV format for areas: ea_code, name, district, governorate, household_count, latitude, longitude
 * CSV format for locations: code, name, category, district, governorate, latitude, longitude
 */
export async function uploadSurveyTargets(projectId, file) {
  if (DEMO_MODE) {
    const text = await file.text();
    const rows = _parseCSV(text);
    const proj = _demoEconomicProjects().find((p) => p.id === projectId);
    const mode = proj?.collection_mode || 'areas';
    const hpa = proj?.households_per_area || 4;

    const targets = rows.map((row, i) => {
      const isArea = mode === 'areas' || (mode === 'mixed' && (row.household_count || row.ea_code));
      const lat = parseFloat(row.latitude || row.center_lat) || (24.40 + Math.random() * 0.15);
      const lon = parseFloat(row.longitude || row.center_lon) || (54.30 + Math.random() * 0.25);
      const hhCount = parseInt(row.household_count) || (isArea ? Math.floor(Math.random() * 150) + 50 : 0);

      return {
        id: crypto.randomUUID(),
        target_type: isArea ? 'area' : 'location',
        code: row.ea_code || row.code || row.target_code || `T-${String(i + 1).padStart(3, '0')}`,
        name_en: row.name_en || row.name || row.area_name || row.location_name || `Target ${i + 1}`,
        name_ar: row.name_ar || '',
        name: row.name_en || row.name || row.area_name || row.location_name || `Target ${i + 1}`,
        category: row.category || (isArea ? 'enumeration_area' : 'venue'),
        district_code: row.district_code || '',
        district_en: row.district_en || row.district || '',
        district_ar: row.district_ar || '',
        district: row.district_en || row.district || '',
        municipal_center: row.municipal_center || '',
        governorate: row.governorate || 'Abu Dhabi',
        stratum: row.stratum || (isArea ? 'urban' : null),
        latitude: lat,
        longitude: lon,
        household_count: hhCount,
        selected_households: isArea ? hpa : 1,
        difficulty_factor: parseFloat(row.difficulty_factor) || 1.0,
        assigned_researcher_id: null,
        cluster_id: null,
        assignment_order: null,
        status: 'pending',
      };
    });

    await _demoSaveTargets(projectId, targets);

    // Generate demo households for area targets
    const households = [];
    targets.filter((t) => t.target_type === 'area').forEach((target) => {
      for (let h = 0; h < target.selected_households; h++) {
        households.push({
          id: crypto.randomUUID(),
          target_id: target.id,
          household_code: `${target.code}-HH${String(h + 1).padStart(2, '0')}`,
          latitude: target.latitude + (Math.random() - 0.5) * 0.005,
          longitude: target.longitude + (Math.random() - 0.5) * 0.005,
          household_size: Math.floor(Math.random() * 6) + 2,
          housing_type: ['villa', 'apartment', 'traditional', 'labor_camp'][Math.floor(Math.random() * 4)],
          nationality_group: ['citizen', 'gcc', 'arab', 'asian', 'western'][Math.floor(Math.random() * 5)],
          is_reserve: false,
          visit_order: h + 1,
          visit_count: 0,
          interview_status: 'pending',
        });
      }
      // Add 2 reserve households per area
      for (let r = 0; r < 2; r++) {
        households.push({
          id: crypto.randomUUID(),
          target_id: target.id,
          household_code: `${target.code}-RES${String(r + 1).padStart(2, '0')}`,
          latitude: target.latitude + (Math.random() - 0.5) * 0.005,
          longitude: target.longitude + (Math.random() - 0.5) * 0.005,
          household_size: Math.floor(Math.random() * 6) + 2,
          housing_type: ['villa', 'apartment', 'traditional'][Math.floor(Math.random() * 3)],
          nationality_group: ['citizen', 'arab', 'asian'][Math.floor(Math.random() * 3)],
          is_reserve: true,
          visit_order: null,
          visit_count: 0,
          interview_status: 'reserve',
        });
      }
    });
    await _demoSaveHouseholds(projectId, households);

    // Update project
    const projects = _demoEconomicProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx >= 0) {
      projects[idx].target_count = targets.length;
      projects[idx].total_sample = targets.length;
      projects[idx].status = 'active';
      _demoSaveEconomicProjects(projects);
    }

    const areaCount = targets.filter((t) => t.target_type === 'area').length;
    const locCount = targets.filter((t) => t.target_type === 'location').length;
    return {
      inserted: targets.length,
      areas: areaCount,
      locations: locCount,
      households_generated: households.filter((h) => !h.is_reserve).length,
      reserves_generated: households.filter((h) => h.is_reserve).length,
    };
  }
  const formData = new FormData();
  formData.append('file', file);
  const url = `${API_BASE}/api/economic-projects/${projectId}/upload-targets`;
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSurveyTargets(projectId) {
  if (DEMO_MODE) {
    return await _demoTargets(projectId);
  }
  return request(`/api/economic-projects/${projectId}/targets`);
}

export async function fetchSurveyHouseholds(projectId) {
  if (DEMO_MODE) {
    return await _demoHouseholds(projectId);
  }
  return request(`/api/economic-projects/${projectId}/households`);
}

export async function fetchSurveyTargetStats(projectId) {
  if (DEMO_MODE) {
    const targets = await _demoTargets(projectId);
    const households = await _demoHouseholds(projectId);
    const total = targets.length;
    const areas = targets.filter((t) => t.target_type === 'area');
    const locations = targets.filter((t) => t.target_type === 'location');

    // District breakdown (bilingual)
    const districtCounts = {};
    targets.forEach((t) => {
      const en = t.district_en || t.district || 'Unknown';
      const ar = t.district_ar || '';
      const label = ar ? `${en} (${ar})` : en;
      districtCounts[label] = (districtCounts[label] || 0) + 1;
    });

    // Municipal center breakdown
    const centerCounts = {};
    targets.forEach((t) => {
      const mc = t.municipal_center || 'Unknown';
      centerCounts[mc] = (centerCounts[mc] || 0) + 1;
    });

    // Stratum breakdown (urban/rural for areas)
    const stratumCounts = {};
    areas.forEach((a) => {
      const s = a.stratum || 'urban';
      stratumCounts[s] = (stratumCounts[s] || 0) + 1;
    });

    // Housing type breakdown
    const housingCounts = {};
    households.filter((h) => !h.is_reserve).forEach((h) => {
      const t = h.housing_type || 'unknown';
      housingCounts[t] = (housingCounts[t] || 0) + 1;
    });

    // Category breakdown (for locations)
    const categoryCounts = {};
    locations.forEach((l) => {
      const c = l.category || 'venue';
      categoryCounts[c] = (categoryCounts[c] || 0) + 1;
    });

    return {
      total_targets: total,
      total_areas: areas.length,
      total_locations: locations.length,
      total_households: households.filter((h) => !h.is_reserve).length,
      total_reserves: households.filter((h) => h.is_reserve).length,
      district_breakdown: Object.entries(districtCounts).map(([d, cnt]) => ({
        district: d, count: cnt, pct: total > 0 ? Math.round(cnt / total * 1000) / 10 : 0,
      })),
      stratum_breakdown: Object.entries(stratumCounts).map(([s, cnt]) => ({
        stratum: s, count: cnt, pct: areas.length > 0 ? Math.round(cnt / areas.length * 1000) / 10 : 0,
      })),
      housing_breakdown: Object.entries(housingCounts).map(([h, cnt]) => ({
        type: h, count: cnt, pct: households.length > 0 ? Math.round(cnt / households.length * 1000) / 10 : 0,
      })),
      category_breakdown: Object.entries(categoryCounts).map(([c, cnt]) => ({
        category: c, count: cnt, pct: locations.length > 0 ? Math.round(cnt / locations.length * 1000) / 10 : 0,
      })),
      center_breakdown: Object.entries(centerCounts).map(([mc, cnt]) => ({
        center: mc, count: cnt, pct: total > 0 ? Math.round(cnt / total * 1000) / 10 : 0,
      })).sort((a, b) => b.count - a.count),
    };
  }
  return request(`/api/economic-projects/${projectId}/target-stats`);
}

// ══════════════════════════════════════════════════════════════════
// ── Social Survey Allocation Engine ──
// 3 Core Pillars:
//   1. PSU = Enumeration Areas (EAs), not companies
//   2. Geographic Fencing: strict municipal_center boundary (HARD RULE)
//   3. Workload Weighting: balance by household_count, not just EA count
// ══════════════════════════════════════════════════════════════════

function _demoSocialAllocate(targets, numR, areasPerResearcher) {
  if (targets.length === 0) return targets;

  // ── Pillar 2: Group by municipal_center (HARD CONSTRAINT) ──
  const centerGroups = {};
  targets.forEach((t, i) => {
    const mc = t.municipal_center || 'UNKNOWN';
    if (!centerGroups[mc]) centerGroups[mc] = [];
    centerGroups[mc].push(i);
  });
  const centerKeys = Object.keys(centerGroups);

  // ── Distribute researchers proportionally by total household_count per center ──
  const centerHH = {};
  const totalHH = targets.reduce((s, t) => s + (t.household_count || 1), 0);
  for (const ck of centerKeys) {
    centerHH[ck] = centerGroups[ck].reduce((s, i) => s + (targets[i].household_count || 1), 0);
  }

  const centerResearchers = {};
  for (const ck of centerKeys) {
    centerResearchers[ck] = Math.max(1, Math.round(numR * centerHH[ck] / totalHH));
  }

  // Adjust total to exactly match numR
  let totalAssigned = Object.values(centerResearchers).reduce((a, b) => a + b, 0);
  const sortedByHH = [...centerKeys].sort((a, b) => centerHH[b] - centerHH[a]);
  while (totalAssigned > numR) {
    for (const ck of sortedByHH) {
      if (totalAssigned <= numR) break;
      if (centerResearchers[ck] > 1) { centerResearchers[ck]--; totalAssigned--; }
    }
    if (totalAssigned > numR) break; // safety
  }
  while (totalAssigned < numR) {
    for (const ck of sortedByHH) {
      if (totalAssigned >= numR) break;
      centerResearchers[ck]++; totalAssigned++;
    }
  }

  // ── Allocate within each center ──
  let globalResearcherId = 0;
  const labels = new Array(targets.length).fill(0);

  for (const ck of centerKeys) {
    const memberIndices = centerGroups[ck];
    const k = centerResearchers[ck];
    const localTargets = memberIndices.map((i) => targets[i]);

    if (k <= 1) {
      memberIndices.forEach((idx) => { labels[idx] = globalResearcherId; });
      _nnRouteOrder(localTargets, memberIndices, targets);
      globalResearcherId++;
      continue;
    }

    // Phase 1: K-Means++ seeded by geographic spread
    const centroids = [];
    const firstLocal = Math.floor(Math.random() * localTargets.length);
    centroids.push({ lat: localTargets[firstLocal].latitude, lon: localTargets[firstLocal].longitude });

    for (let ci = 1; ci < k; ci++) {
      const dists = localTargets.map((t) => {
        const minD = centroids.reduce((m, cx) => Math.min(m, _haversine(t.latitude, t.longitude, cx.lat, cx.lon)), Infinity);
        return minD * minD;
      });
      const total = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * total, cum = 0;
      for (let i = 0; i < dists.length; i++) {
        cum += dists[i];
        if (cum >= r) { centroids.push({ lat: localTargets[i].latitude, lon: localTargets[i].longitude }); break; }
      }
      if (centroids.length <= ci) centroids.push({ lat: localTargets[0].latitude, lon: localTargets[0].longitude });
    }

    // Phase 2: Iterative K-Means with HH-weighted capacity constraint
    const totalLocalHH = localTargets.reduce((s, t) => s + (t.household_count || 1), 0);
    const avgHHPerCluster = totalLocalHH / k;
    let localLabels = new Array(localTargets.length).fill(0);

    for (let iter = 0; iter < 8; iter++) {
      const pairs = [];
      localTargets.forEach((t, i) => {
        centroids.forEach((cx, ki) => {
          const dist = _haversine(t.latitude, t.longitude, cx.lat, cx.lon);
          pairs.push({ dist, ci: i, ki });
        });
      });
      pairs.sort((a, b) => a.dist - b.dist);

      const clusterHH = new Array(k).fill(0);
      const localAssigned = new Array(localTargets.length).fill(false);
      const newLabels = new Array(localTargets.length).fill(0);
      const maxHH = avgHHPerCluster * 1.3; // allow 30% overload

      for (const { ci: idx, ki } of pairs) {
        if (localAssigned[idx]) continue;
        const hhWeight = localTargets[idx].household_count || 1;
        if (clusterHH[ki] + hhWeight <= maxHH || clusterHH[ki] === 0) {
          newLabels[idx] = ki;
          clusterHH[ki] += hhWeight;
          localAssigned[idx] = true;
        }
      }
      // Assign unassigned to least-loaded cluster (by HH)
      localTargets.forEach((t, i) => {
        if (!localAssigned[i]) {
          const best = clusterHH.indexOf(Math.min(...clusterHH));
          newLabels[i] = best;
          clusterHH[best] += (t.household_count || 1);
        }
      });
      localLabels = newLabels;

      // Recompute centroids
      for (let ki = 0; ki < k; ki++) {
        const members = localTargets.filter((_, i) => localLabels[i] === ki);
        if (members.length > 0) {
          centroids[ki] = {
            lat: members.reduce((s, m) => s + m.latitude, 0) / members.length,
            lon: members.reduce((s, m) => s + m.longitude, 0) / members.length,
          };
        }
      }
    }

    // Phase 3: Balance by household_count — swap border EAs between overloaded and underloaded
    for (let pass = 0; pass < 300; pass++) {
      const clusterHH = new Array(k).fill(0);
      const clusterMembers = {};
      localTargets.forEach((t, i) => {
        const ki = localLabels[i];
        clusterHH[ki] += (t.household_count || 1);
        if (!clusterMembers[ki]) clusterMembers[ki] = [];
        clusterMembers[ki].push(i);
      });

      const overIdx = clusterHH.indexOf(Math.max(...clusterHH));
      const underIdx = clusterHH.indexOf(Math.min(...clusterHH));
      if (clusterHH[overIdx] - clusterHH[underIdx] < avgHHPerCluster * 0.15) break; // balanced enough

      const overMembers = clusterMembers[overIdx] || [];
      const underCentroid = centroids[underIdx];

      // Find closest EA in overloaded cluster to underloaded centroid
      let bestIdx = -1, bestDist = Infinity;
      for (const idx of overMembers) {
        const d = _haversine(localTargets[idx].latitude, localTargets[idx].longitude, underCentroid.lat, underCentroid.lon);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      }
      if (bestIdx >= 0) localLabels[bestIdx] = underIdx;
    }

    // Phase 4: Nearest-neighbor route ordering within each cluster
    const localClusterMap = {};
    localTargets.forEach((_, i) => {
      if (!localClusterMap[localLabels[i]]) localClusterMap[localLabels[i]] = [];
      localClusterMap[localLabels[i]].push(i);
    });

    for (const [, members] of Object.entries(localClusterMap)) {
      const globalIndices = members.map((li) => memberIndices[li]);
      const subTargets = members.map((li) => localTargets[li]);
      _nnRouteOrder(subTargets, globalIndices, targets);
    }

    // Map local cluster IDs → global researcher IDs
    memberIndices.forEach((globalIdx, li) => {
      labels[globalIdx] = globalResearcherId + localLabels[li];
    });
    globalResearcherId += k;
  }

  return targets.map((t, i) => ({
    ...t,
    assigned_researcher_id: labels[i] + 1,
    cluster_id: labels[i],
  }));
}

/** Nearest-neighbor route ordering helper */
function _nnRouteOrder(subTargets, globalIndices, allTargets) {
  if (subTargets.length <= 1) {
    if (subTargets.length === 1) allTargets[globalIndices[0]].assignment_order = 1;
    return;
  }
  const cx = {
    lat: subTargets.reduce((s, t) => s + t.latitude, 0) / subTargets.length,
    lon: subTargets.reduce((s, t) => s + t.longitude, 0) / subTargets.length,
  };
  const unvisited = subTargets.map((_, i) => i);
  let current = unvisited.reduce((best, i) =>
    _haversine(subTargets[i].latitude, subTargets[i].longitude, cx.lat, cx.lon) <
    _haversine(subTargets[best].latitude, subTargets[best].longitude, cx.lat, cx.lon) ? i : best
  );
  let order = 1;
  while (unvisited.length > 0) {
    const ci = unvisited.indexOf(current);
    if (ci >= 0) unvisited.splice(ci, 1);
    allTargets[globalIndices[current]].assignment_order = order++;
    if (unvisited.length === 0) break;
    let nearest = unvisited[0], nearDist = Infinity;
    for (const idx of unvisited) {
      const d = _haversine(subTargets[current].latitude, subTargets[current].longitude, subTargets[idx].latitude, subTargets[idx].longitude);
      if (d < nearDist) { nearDist = d; nearest = idx; }
    }
    current = nearest;
  }
}

// ── Metrics: weighted by household_count, grouped by actual researcher IDs ──
function _computeSocialAllocMetrics(targets, numR) {
  // Group by actual assigned researcher_id (not sequential 0..k-1)
  const clusters = {};
  targets.forEach((t) => {
    const rid = t.assigned_researcher_id || 1;
    if (!clusters[rid]) clusters[rid] = [];
    clusters[rid].push(t);
  });

  const researcherIds = Object.keys(clusters).map(Number).sort((a, b) => a - b);
  const researchers = [];
  const hhLoads = []; // household-weighted workload per researcher

  for (const rid of researcherIds) {
    const members = clusters[rid];
    const count = members.length;
    const totalHH = members.reduce((s, t) => s + (t.household_count || 1), 0);
    const selectedHH = members.reduce((s, t) => s + (t.selected_households || 0), 0);
    hhLoads.push(totalHH);

    // Geo spread
    let avgDist = 0;
    if (members.length > 1) {
      const cxLat = members.reduce((s, t) => s + t.latitude, 0) / count;
      const cxLon = members.reduce((s, t) => s + t.longitude, 0) / count;
      avgDist = members.reduce((s, t) => s + _haversine(t.latitude, t.longitude, cxLat, cxLon), 0) / count;
    }

    const districtCounts = {};
    members.forEach((t) => {
      const dLabel = t.district_en || t.district || '?';
      districtCounts[dLabel] = (districtCounts[dLabel] || 0) + 1;
    });

    // Municipal center — should be uniform per researcher (hard rule)
    const mcSet = new Set(members.map((t) => t.municipal_center || '?'));
    const municipal_center = mcSet.size === 1 ? [...mcSet][0] : [...mcSet].join('+');

    const targetHH = targets.reduce((s, t) => s + (t.household_count || 1), 0) / researcherIds.length;
    const hhScore = targetHH > 0 ? Math.max(0, 1 - Math.abs(totalHH - targetHH) / targetHH) : 1;
    const geoScore = Math.max(0, 1 - avgDist / 15000);
    const overall = hhScore * 0.5 + geoScore * 0.3 + 0.2;

    researchers.push({
      researcher_id: rid,
      cluster_id: rid - 1,
      count,
      areas: members.filter((t) => t.target_type === 'area').length,
      locations: members.filter((t) => t.target_type === 'location').length,
      total_households: totalHH,
      selected_households: selectedHH,
      districts: districtCounts,
      municipal_center,
      avg_distance_m: Math.round(avgDist),
      volume_score: Math.round(hhScore * 1000) / 1000,
      geo_score: Math.round(geoScore * 1000) / 1000,
      overall_score: Math.round(overall * 1000) / 1000,
    });
  }

  // Fairness based on household_count distribution
  const meanHH = hhLoads.reduce((a, b) => a + b, 0) / hhLoads.length || 1;
  const stdHH = Math.sqrt(hhLoads.reduce((s, h) => s + (h - meanHH) ** 2, 0) / hhLoads.length);
  const cv = meanHH > 0 ? stdHH / meanHH : 0;
  const mmr = hhLoads.length > 0 ? Math.min(...hhLoads) / Math.max(...hhLoads) : 1;
  const volRange = hhLoads.length > 0 ? Math.max(...hhLoads) - Math.min(...hhLoads) : 0;

  const overallScore = Math.min(100, Math.round(
    Math.max(0, 30 * (1 - cv / 0.15)) +
    Math.max(0, 30 * (mmr - 0.7) / 0.3) +
    40 * (researchers.reduce((s, r) => s + r.geo_score, 0) / researchers.length)
  ));

  return {
    researchers,
    fairness_metrics: {
      workload_cv: Math.round(cv * 10000) / 10000,
      min_max_ratio: Math.round(mmr * 10000) / 10000,
      volume_range: volRange,
      mean_geo_spread_m: Math.round(researchers.reduce((s, r) => s + r.avg_distance_m, 0) / researchers.length),
      overall_score: overallScore,
    },
  };
}

export async function runSocialAllocation(projectId) {
  if (DEMO_MODE) {
    const targets = await _demoTargets(projectId);
    const proj = _demoEconomicProjects().find((p) => p.id === projectId);
    if (!proj || !targets.length) throw new Error('No targets to allocate');
    const numR = proj.num_researchers || 10;
    const tpr = proj.targets_per_researcher || 14;

    const allocated = _demoSocialAllocate(targets, numR, tpr);
    await _demoSaveTargets(projectId, allocated);

    // Update household assignments to match target researcher
    const households = await _demoHouseholds(projectId);
    const targetMap = {};
    allocated.forEach((t) => { targetMap[t.id] = t.assigned_researcher_id; });
    const updatedHH = households.map((h) => ({
      ...h,
      assigned_researcher_id: targetMap[h.target_id] || null,
    }));
    await _demoSaveHouseholds(projectId, updatedHH);

    const projects = _demoEconomicProjects();
    const pidx = projects.findIndex((p) => p.id === projectId);
    if (pidx >= 0) { projects[pidx].status = 'in_progress'; _demoSaveEconomicProjects(projects); }

    const { researchers, fairness_metrics } = _computeSocialAllocMetrics(allocated, numR);
    return {
      plan_id: crypto.randomUUID(),
      total_targets: targets.length,
      num_researchers: numR,
      targets_per_researcher: tpr,
      overall_fairness: fairness_metrics.overall_score / 100,
      researcher_scores: researchers,
      fairness_metrics,
    };
  }
  return request(`/api/economic-projects/${projectId}/allocate-social`, { method: 'POST' });
}

export async function fetchSocialAllocation(projectId) {
  if (DEMO_MODE) {
    const targets = await _demoTargets(projectId);
    const proj = _demoEconomicProjects().find((p) => p.id === projectId);
    const numR = proj?.num_researchers || 10;
    const { researchers, fairness_metrics } = _computeSocialAllocMetrics(targets, numR);
    return {
      plan_id: null,
      fairness_score: fairness_metrics.overall_score / 100,
      total_targets: targets.length,
      researchers,
      fairness_metrics,
      targets,
    };
  }
  return request(`/api/economic-projects/${projectId}/allocation-social`);
}

// --- Phase 10.1: Sample Full Record (sensitive fields) ---

const SENSITIVE_FIELDS = ['eid', 'age', 'education', 'marital_status'];

/**
 * Fetch sample list WITHOUT sensitive fields (safe for list views).
 */
export function stripSensitiveFields(samples) {
  return (samples || []).map(s => {
    const clean = { ...s };
    SENSITIVE_FIELDS.forEach(f => delete clean[f]);
    return clean;
  });
}

/**
 * Fetch full sample record INCLUDING sensitive fields.
 * Requires operator or admin role. Returns 403 for viewers.
 */
export async function fetchSampleFullRecord(sampleId) {
  const role = getStoredRole();
  if (role === 'viewer') throw new Error('Access denied: operator or admin role required');
  if (DEMO_MODE) {
    // In demo mode, return the sample as-is (including sensitive fields)
    return { detail: 'Full record available in demo mode' };
  }
  return request(`/api/samples/${sampleId}/full`);
}

/**
 * Fetch building households list WITHOUT sensitive fields.
 */
export async function fetchBuildingHouseholds(buildingId) {
  if (DEMO_MODE) {
    return { building_id: buildingId, households: [] };
  }
  return request(`/api/buildings/${buildingId}/households`);
}

// ═══════════════════════════════════════════════════════════════════
// Tasks API — with localStorage demo fallback
// ═══════════════════════════════════════════════════════════════════

function _demoTasks() {
  const stored = localStorage.getItem('demo_tasks');
  if (stored) try { return JSON.parse(stored); } catch {}
  const tasks = [
    { id: crypto.randomUUID(), title: 'Review Al Reem Survey Progress', description: 'Check completion rates and flag delayed areas for follow-up.', project_id: 'proj-1', project_name: 'Abu Dhabi Residential Survey', assigned_to: 'usr-2', assigned_to_name: 'Fatima Al Zaabi', due_date: new Date(Date.now() + 2 * 86400000).toISOString(), priority: 'high', status: 'open', created_at: new Date().toISOString() },
    { id: crypto.randomUUID(), title: 'Upload Weekly Researcher Reports', description: 'Compile and upload all researcher daily logs to the project portal.', project_id: 'proj-1', project_name: 'Abu Dhabi Residential Survey', assigned_to: 'usr-3', assigned_to_name: 'Mohammed Al Hammadi', due_date: new Date(Date.now() + 1 * 86400000).toISOString(), priority: 'medium', status: 'in-progress', created_at: new Date().toISOString() },
    { id: crypto.randomUUID(), title: 'Validate Geofence Boundaries - Al Ain', description: 'Confirm geofence for Al Ain Agricultural Survey matches the planned area.', project_id: 'proj-2', project_name: 'Al Ain Agricultural Survey', assigned_to: 'usr-3', assigned_to_name: 'Mohammed Al Hammadi', due_date: new Date(Date.now() - 1 * 86400000).toISOString(), priority: 'high', status: 'done', created_at: new Date().toISOString() },
    { id: crypto.randomUUID(), title: 'Brief New Field Workers', description: 'Conduct orientation for 4 new field workers joining Traffic Flow Analysis.', project_id: 'proj-3', project_name: 'Traffic Flow Analysis', assigned_to: 'usr-2', assigned_to_name: 'Fatima Al Zaabi', due_date: new Date(Date.now() + 4 * 86400000).toISOString(), priority: 'low', status: 'open', created_at: new Date().toISOString() },
    { id: crypto.randomUUID(), title: 'Coordinate Battery Swap for FW-012', description: 'FW-012 flagged low battery. Arrange handoff point in Sector C.', project_id: 'proj-1', project_name: 'Abu Dhabi Residential Survey', assigned_to: 'usr-2', assigned_to_name: 'Fatima Al Zaabi', due_date: new Date(Date.now() + 0.5 * 86400000).toISOString(), priority: 'high', status: 'in-progress', created_at: new Date().toISOString() },
  ];
  localStorage.setItem('demo_tasks', JSON.stringify(tasks));
  return tasks;
}

function _demoSaveTasks(tasks) {
  localStorage.setItem('demo_tasks', JSON.stringify(tasks));
}

export async function fetchTasks(filters = {}) {
  if (DEMO_MODE) {
    let tasks = _demoTasks();
    if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
    if (filters.priority) tasks = tasks.filter(t => t.priority === filters.priority);
    if (filters.project_id) tasks = tasks.filter(t => t.project_id === filters.project_id);
    return tasks;
  }
  const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString();
  return request(`/api/tasks${params ? '?' + params : ''}`);
}

export async function fetchTask(taskId) {
  if (DEMO_MODE) {
    const task = _demoTasks().find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');
    return task;
  }
  return request(`/api/tasks/${taskId}`);
}

export async function createTask(data) {
  if (DEMO_MODE) {
    const task = { id: crypto.randomUUID(), ...data, status: data.status || 'open', created_at: new Date().toISOString() };
    const tasks = _demoTasks();
    tasks.unshift(task);
    _demoSaveTasks(tasks);
    return task;
  }
  return request('/api/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTask(taskId, updates) {
  if (DEMO_MODE) {
    const tasks = _demoTasks();
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], ...updates, updated_at: new Date().toISOString() };
      _demoSaveTasks(tasks);
      return tasks[idx];
    }
    throw new Error('Task not found');
  }
  return request(`/api/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteTask(taskId) {
  if (DEMO_MODE) {
    _demoSaveTasks(_demoTasks().filter(t => t.id !== taskId));
    return { success: true };
  }
  return request(`/api/tasks/${taskId}`, { method: 'DELETE' });
}

// ═══════════════════════════════════════════════════════════════════
// Users API — admin only, with localStorage demo fallback
// ═══════════════════════════════════════════════════════════════════

function _demoUsers() {
  const stored = localStorage.getItem('demo_users');
  if (stored) try { return JSON.parse(stored); } catch {}
  const users = [
    { id: 'usr-1', name: 'Ahmed Al Mansoori', email: 'ahmed@scad.ae', role: 'admin', country_code: 'AE', is_active: true, last_login: new Date(Date.now() - 3600000).toISOString(), created_at: '2026-01-01T00:00:00Z' },
    { id: 'usr-2', name: 'Fatima Al Zaabi', email: 'fatima@scad.ae', role: 'project_manager', country_code: 'AE', is_active: true, last_login: new Date(Date.now() - 7200000).toISOString(), created_at: '2026-01-05T00:00:00Z' },
    { id: 'usr-3', name: 'Mohammed Al Hammadi', email: 'mohammed@scad.ae', role: 'supervisor', country_code: 'AE', is_active: true, last_login: new Date(Date.now() - 86400000).toISOString(), created_at: '2026-01-10T00:00:00Z' },
    { id: 'usr-4', name: 'Sara Al Dhaheri', email: 'sara@scad.ae', role: 'supervisor', country_code: 'AE', is_active: false, last_login: new Date(Date.now() - 172800000).toISOString(), created_at: '2026-01-12T00:00:00Z' },
    { id: 'usr-5', name: 'Ravi Kumar', email: 'ravi@scad.ae', role: 'viewer', country_code: 'IN', is_active: true, last_login: new Date(Date.now() - 3600000).toISOString(), created_at: '2026-02-01T00:00:00Z' },
    { id: 'usr-6', name: 'Ali Hassan', email: 'ali@scad.ae', role: 'project_manager', country_code: 'EG', is_active: true, last_login: new Date(Date.now() - 14400000).toISOString(), created_at: '2026-02-10T00:00:00Z' },
  ];
  localStorage.setItem('demo_users', JSON.stringify(users));
  return users;
}

function _demoSaveUsers(users) { localStorage.setItem('demo_users', JSON.stringify(users)); }

export async function fetchUsers() {
  if (DEMO_MODE) return _demoUsers();
  return request('/api/users');
}

export async function createUser(data) {
  if (DEMO_MODE) {
    const user = { id: crypto.randomUUID(), ...data, is_active: true, last_login: null, created_at: new Date().toISOString() };
    const users = _demoUsers();
    users.push(user);
    _demoSaveUsers(users);
    return user;
  }
  return request('/api/users', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateUser(userId, updates) {
  if (DEMO_MODE) {
    const users = _demoUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) { users[idx] = { ...users[idx], ...updates }; _demoSaveUsers(users); return users[idx]; }
    throw new Error('User not found');
  }
  return request(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteUser(userId) {
  if (DEMO_MODE) {
    _demoSaveUsers(_demoUsers().filter(u => u.id !== userId));
    return { success: true };
  }
  return request(`/api/users/${userId}`, { method: 'DELETE' });
}

// ═══════════════════════════════════════════════════════════════════
// Chat Conversations API — with localStorage demo fallback
// ═══════════════════════════════════════════════════════════════════

function _demoConversations() {
  return [
    { id: 'conv-1', participant_id: 'FW-001', participant_name: 'Ahmed Al Mansoori', participant_role: 'Field Worker', project_name: 'Abu Dhabi Residential Survey', status: 'active', last_message: 'Completed 3 households in sector B.', last_message_at: new Date(Date.now() - 600000).toISOString(), unread_count: 2 },
    { id: 'conv-2', participant_id: 'FW-002', participant_name: 'Fatima Al Zaabi', participant_role: 'Field Worker', project_name: 'Abu Dhabi Residential Survey', status: 'active', last_message: 'On the way to the next location.', last_message_at: new Date(Date.now() - 1800000).toISOString(), unread_count: 0 },
    { id: 'conv-3', participant_id: 'FW-003', participant_name: 'Mohammed Al Hammadi', participant_role: 'Supervisor', project_name: 'Al Ain Agricultural Survey', status: 'offline', last_message: 'Battery low, charging soon.', last_message_at: new Date(Date.now() - 7200000).toISOString(), unread_count: 1 },
    { id: 'conv-4', participant_id: 'FW-004', participant_name: 'Sara Al Dhaheri', participant_role: 'Field Worker', project_name: 'Traffic Flow Analysis', status: 'active', last_message: 'Area blocked, using alternate route.', last_message_at: new Date(Date.now() - 3600000).toISOString(), unread_count: 0 },
    { id: 'conv-5', participant_id: 'FW-005', participant_name: 'Khalid Al Mazrouei', participant_role: 'Field Worker', project_name: 'Abu Dhabi Residential Survey', status: 'idle', last_message: 'Break time, back in 20 mins.', last_message_at: new Date(Date.now() - 900000).toISOString(), unread_count: 0 },
  ];
}

function _demoMessages(conversationId) {
  const key = `demo_messages_${conversationId}`;
  const stored = localStorage.getItem(key);
  if (stored) try { return JSON.parse(stored); } catch {}
  return [
    { id: '1', sender_id: 'participant', sender_name: 'Field Worker', content: 'Good morning. Starting fieldwork now.', timestamp: new Date(Date.now() - 3 * 3600000).toISOString() },
    { id: '2', sender_id: 'admin', sender_name: 'Operations', content: 'Good morning! Please confirm your starting location.', timestamp: new Date(Date.now() - 2.9 * 3600000).toISOString() },
    { id: '3', sender_id: 'participant', sender_name: 'Field Worker', content: 'At Khalifa City A, near the water tower. Ready to begin.', timestamp: new Date(Date.now() - 2.8 * 3600000).toISOString() },
    { id: '4', sender_id: 'admin', sender_name: 'Operations', content: 'Great. You have 8 households assigned in that sector.', timestamp: new Date(Date.now() - 2.7 * 3600000).toISOString() },
    { id: '5', sender_id: 'participant', sender_name: 'Field Worker', content: 'Completed 3 households in sector B.', timestamp: new Date(Date.now() - 600000).toISOString() },
  ];
}

export async function fetchConversations() {
  if (DEMO_MODE) return _demoConversations();
  return request('/api/chat/conversations');
}

export async function fetchMessages(conversationId) {
  if (DEMO_MODE) return _demoMessages(conversationId);
  return request(`/api/chat/conversations/${conversationId}/messages`);
}

export async function sendChatMessage(conversationId, content) {
  if (DEMO_MODE) {
    const key = `demo_messages_${conversationId}`;
    const msgs = _demoMessages(conversationId);
    const msg = { id: crypto.randomUUID(), sender_id: 'admin', sender_name: getStoredName() || 'Operations', content, timestamp: new Date().toISOString() };
    msgs.push(msg);
    localStorage.setItem(key, JSON.stringify(msgs));
    return msg;
  }
  return request(`/api/chat/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
}

// --- Map ---
// MapLibre GL uses OpenFreeMap vector tiles (free, no API key required).
// Style URL is configured directly in the Map component.
// If a custom tile server is needed, the backend proxies it server-side
// so no API key is ever exposed in the frontend bundle.
