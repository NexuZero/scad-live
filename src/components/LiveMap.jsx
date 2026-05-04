/**
 * LiveMap — Phase 10.1 real-time field research map
 *
 * Features:
 * - 30 researcher pins with initials, progress arcs, pulsing glow, status dots
 * - Realistic movement simulation toward assigned samples
 * - Household/sample markers (standalone + multi-HH buildings)
 * - Building footprints with household count badges
 * - Toggle layers, live clock, completion counter
 * - Left panel: enumerator summary + researcher list
 * - Right panel: researcher detail / household detail / building detail
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { initSCADMap } from '../tileConfig';
import DemoCallModal from './DemoCallModal';

// ── Color constants ──────────────────────────────────────────────────────────
const STATUS_COLORS = { 'in-field': '#1e88e5', behind: '#fb8c00', completed: '#43a047', pending: '#9e9e9e' };
const SAMPLE_COLORS = { completed: '#43a047', 'in-progress': '#fb8c00', pending: '#9e9e9e', invalid: '#e53935' };
const RESEARCHER_COLORS = [
  '#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#00acc1',
  '#6d4c41','#d81b60','#3949ab','#00897b','#f4511e','#7cb342',
  '#546e7a','#c0ca33','#5e35b1','#039be5','#c62828','#2e7d32',
  '#ef6c00','#4527a0','#0097a7','#558b2f','#ad1457','#4e342e',
  '#283593','#00695c','#bf360c','#1565c0','#6a1b9a','#33691e',
];

// ── Utility: initials from name ──────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

// ── Utility: Abu Dhabi time ──────────────────────────────────────────────────
function getAbuDhabiTime() {
  return new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ── Utility: distance between two coords ─────────────────────────────────────
function dist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Load demo data from CSV files ────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

async function loadCSV(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return parseCSV(await res.text());
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function LiveMap({ projectId, samples: externalSamples, researchers: externalResearchers }) {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const popupsRef = useRef([]);
  const simInterval = useRef(null);

  const [researchers, setResearchers] = useState([]);
  const [samples, setSamples] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [clock, setClock] = useState(getAbuDhabiTime());
  const [selectedResearcher, setSelectedResearcher] = useState(null);
  const [selectedSample, setSelectedSample] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [rightPanel, setRightPanel] = useState(null); // 'researcher' | 'sample' | 'building'
  const [callTarget, setCallTarget] = useState(null);
  const [fieldReportTarget, setFieldReportTarget] = useState(null);
  const [showTrajectory, setShowTrajectory] = useState(null); // researcher id

  // Toggle states
  const [showResearchers, setShowResearchers] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // Simulation state stored in ref for performance
  const simState = useRef({ researchers: [], samples: [], tick: 0 });

  // ── Clock tick ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(getAbuDhabiTime()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // Try external props first, fallback to CSV templates
      let rData = externalResearchers;
      let sData = externalSamples;

      if (!rData || rData.length === 0) {
        rData = await loadCSV('/data/researchers_template.csv');
      }
      if (!sData || sData.length === 0) {
        sData = await loadCSV('/data/sample_points_template.csv');
      }

      // Load buildings
      const bData = await loadCSV('/data/buildings_template.csv');

      // Enrich researchers with simulation state
      const enrichedR = (rData || []).map((r, i) => ({
        ...r,
        id: r.Asset_Barcode || r.asset_barcode || `FW-${String(i + 1).padStart(3, '0')}`,
        name: r.Name_EN || r.name_en || r.name || `Researcher ${i + 1}`,
        name_ar: r.Name_AR || r.name_ar || '',
        role: r.Role || r.role || 'Enumerator',
        shift: r.Shift || r.shift || 'Morning',
        region: r.Region || r.region || '',
        phone: r.Phone || r.phone || '',
        email: r.Email || r.email || '',
        color: RESEARCHER_COLORS[i % RESEARCHER_COLORS.length],
        status: 'in-field',
        transport_mode: Math.random() > 0.4 ? 'walking' : 'driving',
        lng: 54.3600 + (Math.random() - 0.5) * 0.02,
        lat: 24.4600 + (Math.random() - 0.5) * 0.01,
        trail: [],
        completedCount: 0,
        totalAssigned: 0,
        inProgressId: null,
      }));

      // Enrich samples
      const enrichedS = (sData || []).map((sp, i) => ({
        ...sp,
        id: sp.household_id || sp.H_ID || `H-${String(i + 1).padStart(3, '0')}`,
        lat: parseFloat(sp.latitude || sp.lat) || (24.4600 + (Math.random() - 0.5) * 0.015),
        lng: parseFloat(sp.longitude || sp.lng) || (54.3640 + (Math.random() - 0.5) * 0.02),
        status: sp.status || 'pending',
        name_en: sp.name_en || '',
        name_ar: sp.name_ar || '',
        phone: sp.phone || '',
        eid: sp.eid || '',
        age: sp.age ? parseInt(sp.age) : null,
        education: sp.education || '',
        marital_status: sp.marital_status || '',
        building_id: sp.building_id || null,
        floor_number: sp.floor_number ? parseInt(sp.floor_number) : null,
        unit_number: sp.unit_number || null,
        assigned_to: sp.assigned_to || null,
      }));

      // Enrich buildings
      const enrichedB = (bData || []).map(b => ({
        ...b,
        id: b.building_id,
        lat: parseFloat(b.latitude),
        lng: parseFloat(b.longitude),
        height_m: parseFloat(b.height_m) || 30,
        floors: parseInt(b.floors) || 1,
        households: enrichedS.filter(s => s.building_id === b.building_id),
      }));

      // Assign sample counts to researchers
      enrichedR.forEach(r => {
        const assigned = enrichedS.filter(s => s.assigned_to === r.id);
        r.totalAssigned = assigned.length;
        // Start researcher near their first assigned sample
        if (assigned.length > 0) {
          r.lat = assigned[0].lat + (Math.random() - 0.5) * 0.002;
          r.lng = assigned[0].lng + (Math.random() - 0.5) * 0.002;
        }
      });

      setResearchers(enrichedR);
      setSamples(enrichedS);
      setBuildings(enrichedB);

      simState.current = { researchers: enrichedR, samples: enrichedS, tick: 0 };
    }
    load();
  }, [externalResearchers, externalSamples]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const completedCount = useMemo(() => samples.filter(s => s.status === 'completed').length, [samples]);
  const inProgressCount = useMemo(() => samples.filter(s => s.status === 'in-progress').length, [samples]);
  const enumerators = useMemo(() => researchers.filter(r => r.role === 'Enumerator'), [researchers]);
  const controllers = useMemo(() => researchers.filter(r => r.role === 'Controller'), [researchers]);
  const supervisors = useMemo(() => researchers.filter(r => r.role === 'Supervisor'), [researchers]);
  const morningCount = useMemo(() => researchers.filter(r => r.shift === 'Morning').length, [researchers]);
  const eveningCount = useMemo(() => researchers.filter(r => r.shift === 'Evening').length, [researchers]);

  // ── Initialize map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;

    const { map, cleanup } = initSCADMap(mapRef.current, {
      satellite: true,
      maxPitch: 70,
      zoom: 14,
      pitch: 55,
      bearing: -20,
      onLoad: (m) => {
        renderSampleLayers(m);
        renderBuildingLayers(m);
      },
    });

    mapInstance.current = map;
    return () => {
      Object.values(markersRef.current).forEach(m => m.remove());
      markersRef.current = {};
      mapInstance.current = null;
      cleanup();
    };
  }, []); // eslint-disable-line

  // ── Render sample GeoJSON layers ────────────────────────────────────────────
  const renderSampleLayers = useCallback((map) => {
    if (!map || samples.length === 0) return;

    const standaloneSamples = samples.filter(s => !s.building_id);
    const geojson = {
      type: 'FeatureCollection',
      features: standaloneSamples.map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: { id: s.id, status: s.status, name_en: s.name_en, assigned_to: s.assigned_to },
      })),
    };

    if (map.getSource('samples-src')) {
      map.getSource('samples-src').setData(geojson);
    } else {
      map.addSource('samples-src', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'samples-circle',
        source: 'samples-src',
        type: 'circle',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 15, 8, 18, 14],
          'circle-color': ['match', ['get', 'status'],
            'completed', SAMPLE_COLORS.completed,
            'in-progress', SAMPLE_COLORS['in-progress'],
            'invalid', SAMPLE_COLORS.invalid,
            SAMPLE_COLORS.pending,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.9,
        },
      });

      // Sample labels
      map.addLayer({
        id: 'samples-label',
        source: 'samples-src',
        type: 'symbol',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'id'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, -1.5],
          'text-anchor': 'bottom',
        },
        paint: {
          'text-color': '#1a1a2e',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5,
        },
      });

      // Click handler for samples
      map.on('click', 'samples-circle', (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties.id;
          const sample = samples.find(s => s.id === id);
          if (sample) {
            setSelectedSample(sample);
            setSelectedResearcher(null);
            setSelectedBuilding(null);
            setRightPanel('sample');
          }
        }
      });
      map.on('mouseenter', 'samples-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'samples-circle', () => { map.getCanvas().style.cursor = ''; });
    }
  }, [samples]);

  // ── Render building GeoJSON layers ──────────────────────────────────────────
  const renderBuildingLayers = useCallback((map) => {
    if (!map || buildings.length === 0) return;

    const geojson = {
      type: 'FeatureCollection',
      features: buildings.map(b => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
        properties: {
          id: b.id,
          name_en: b.name_en,
          name_ar: b.name_ar,
          height_m: b.height_m,
          floors: b.floors,
          hh_count: b.households.length,
        },
      })),
    };

    if (map.getSource('buildings-src')) {
      map.getSource('buildings-src').setData(geojson);
    } else {
      map.addSource('buildings-src', { type: 'geojson', data: geojson });

      // Building footprint circle
      map.addLayer({
        id: 'buildings-footprint',
        source: 'buildings-src',
        type: 'circle',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 15, 18, 18, 30],
          'circle-color': '#1a237e',
          'circle-opacity': 0.6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#7c4dff',
        },
      });

      // HH count badge
      map.addLayer({
        id: 'buildings-badge',
        source: 'buildings-src',
        type: 'symbol',
        layout: {
          'text-field': ['to-string', ['get', 'hh_count']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#7c4dff',
          'text-halo-width': 1,
        },
      });

      // Building click
      map.on('click', 'buildings-footprint', (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties.id;
          const bld = buildings.find(b => b.id === id);
          if (bld) {
            setSelectedBuilding(bld);
            setSelectedSample(null);
            setSelectedResearcher(null);
            setRightPanel('building');
          }
        }
      });
      map.on('mouseenter', 'buildings-footprint', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'buildings-footprint', () => { map.getCanvas().style.cursor = ''; });
    }
  }, [buildings]);

  // ── Update map when data or toggles change ──────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    renderSampleLayers(map);
    renderBuildingLayers(map);
  }, [samples, buildings, renderSampleLayers, renderBuildingLayers]);

  // ── Toggle layer visibility ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      if (map.getLayer('samples-circle')) map.setLayoutProperty('samples-circle', 'visibility', showSamples ? 'visible' : 'none');
      if (map.getLayer('samples-label')) map.setLayoutProperty('samples-label', 'visibility', (showSamples && showLabels) ? 'visible' : 'none');
      if (map.getLayer('buildings-footprint')) map.setLayoutProperty('buildings-footprint', 'visibility', showBuildings ? 'visible' : 'none');
      if (map.getLayer('buildings-badge')) map.setLayoutProperty('buildings-badge', 'visibility', showBuildings ? 'visible' : 'none');
    } catch { /* layer not ready */ }
  }, [showSamples, showBuildings, showLabels]);

  // ── Researcher markers (DOM-based for rich styling) ─────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || researchers.length === 0) return;

    // Remove old markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    if (!showResearchers) return;

    researchers.forEach((r, idx) => {
      const el = document.createElement('div');
      el.className = 'scad-researcher-pin';

      const pct = r.totalAssigned > 0 ? Math.round((r.completedCount / r.totalAssigned) * 100) : 0;
      const statusColor = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
      const bgColor = r.color;

      el.innerHTML = `
        <div class="rpin-wrap" style="position:relative;width:40px;height:40px;">
          <svg width="40" height="40" viewBox="0 0 40 40" class="rpin-arc">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
            <circle cx="20" cy="20" r="18" fill="none" stroke="${statusColor}" stroke-width="3"
              stroke-dasharray="${(pct / 100) * 113} 113"
              stroke-linecap="round" transform="rotate(-90 20 20)"/>
          </svg>
          <div style="position:absolute;top:4px;left:4px;width:32px;height:32px;border-radius:50%;
            background:${bgColor};display:flex;align-items:center;justify-content:center;
            color:#fff;font-size:11px;font-weight:700;letter-spacing:0.5px;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);">${getInitials(r.name)}</div>
          <div style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;
            background:${statusColor};border:2px solid #fff;"></div>
          ${r.status === 'in-field' ? '<div class="rpin-pulse" style="position:absolute;top:0;left:0;width:40px;height:40px;border-radius:50%;border:2px solid ' + bgColor + ';animation:rpinPulse 2s infinite;opacity:0;"></div>' : ''}
        </div>
      `;

      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        setSelectedResearcher(r);
        setSelectedSample(null);
        setSelectedBuilding(null);
        setRightPanel('researcher');
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([r.lng, r.lat])
        .addTo(map);

      markersRef.current[r.id] = marker;
    });
  }, [researchers, showResearchers]);

  // ── Movement simulation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (researchers.length === 0 || samples.length === 0) return;

    simInterval.current = setInterval(() => {
      const sim = simState.current;
      sim.tick++;

      let changed = false;
      const updatedR = [...sim.researchers];
      const updatedS = [...sim.samples];

      updatedR.forEach((r, ri) => {
        if (r.status === 'completed') return;
        if (r.role !== 'Enumerator') return; // Only enumerators move

        // Find next pending sample assigned to this researcher
        const myPending = updatedS.filter(s => s.assigned_to === r.id && s.status === 'pending');
        const myInProgress = updatedS.find(s => s.assigned_to === r.id && s.status === 'in-progress');

        let target = null;

        if (myInProgress) {
          // Working on current sample — wait
          if (sim.tick - (r._arrivalTick || 0) >= 6) { // ~3 seconds at 500ms interval
            const idx = updatedS.findIndex(s => s.id === myInProgress.id);
            if (idx >= 0) {
              updatedS[idx] = { ...updatedS[idx], status: 'completed' };
              updatedR[ri] = { ...r, completedCount: r.completedCount + 1, inProgressId: null };
              changed = true;
            }
          }
          return;
        }

        if (myPending.length === 0) {
          // All done
          if (r.status !== 'completed') {
            updatedR[ri] = { ...r, status: 'completed' };
            changed = true;
          }
          return;
        }

        // Move toward nearest pending
        target = myPending.reduce((closest, s) => {
          const d = dist([r.lng, r.lat], [s.lng, s.lat]);
          return d < closest.dist ? { sample: s, dist: d } : closest;
        }, { sample: myPending[0], dist: Infinity }).sample;

        const dx = target.lng - r.lng;
        const dy = target.lat - r.lat;
        const d = Math.sqrt(dx * dx + dy * dy);
        // walking ~0.00008, driving ~0.0004 (5x faster)
        const baseSpeed = r.transport_mode === 'driving' ? 0.0004 : 0.00008;
        const speed = baseSpeed + Math.random() * baseSpeed * 0.3;

        if (d < speed * 2) {
          // Arrived — mark in-progress
          const sIdx = updatedS.findIndex(s => s.id === target.id);
          if (sIdx >= 0) {
            updatedS[sIdx] = { ...updatedS[sIdx], status: 'in-progress' };
            updatedR[ri] = { ...r, lng: target.lng, lat: target.lat, inProgressId: target.id, _arrivalTick: sim.tick, status: 'in-field',
              trail: [...(r.trail || []).slice(-39), [r.lng, r.lat]] };
            changed = true;
          }
        } else {
          // Move toward target
          const newLng = r.lng + (dx / d) * speed;
          const newLat = r.lat + (dy / d) * speed;
          updatedR[ri] = { ...r, lng: newLng, lat: newLat, status: d > 0.003 ? 'behind' : 'in-field',
            trail: [...(r.trail || []).slice(-39), [r.lng, r.lat]] };
          changed = true;
        }
      });

      if (changed) {
        sim.researchers = updatedR;
        sim.samples = updatedS;
        setResearchers([...updatedR]);
        setSamples([...updatedS]);
      }
    }, 500);

    return () => { if (simInterval.current) clearInterval(simInterval.current); };
  }, [researchers.length, samples.length]);

  // ── Update marker positions ─────────────────────────────────────────────────
  useEffect(() => {
    researchers.forEach(r => {
      const marker = markersRef.current[r.id];
      if (marker) {
        marker.setLngLat([r.lng, r.lat]);
      }
    });
  }, [researchers]);

  // ── Trail rendering ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    researchers.forEach(r => {
      const trailId = `trail-${r.id}`;
      const trailData = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: r.trail && r.trail.length > 1 ? r.trail : [[r.lng, r.lat], [r.lng, r.lat]],
        },
      };

      try {
        if (map.getSource(trailId)) {
          map.getSource(trailId).setData(trailData);
        } else {
          map.addSource(trailId, { type: 'geojson', data: trailData });
          const isDriving = r.transport_mode === 'driving';
          map.addLayer({
            id: trailId,
            source: trailId,
            type: 'line',
            paint: {
              'line-color': isDriving ? '#4FC3F7' : '#22C55E',
              'line-width': isDriving ? 3 : 2,
              'line-dasharray': isDriving ? [1, 0] : [2, 3],
              'line-opacity': 0.8,
            },
          });
        }
        map.setLayoutProperty(trailId, 'visibility', showTrails ? 'visible' : 'none');
      } catch { /* skip */ }
    });
  }, [researchers, showTrails]);

  // ── Reset view ──────────────────────────────────────────────────────────────
  const handleResetView = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.flyTo({ center: [54.3640, 24.4610], zoom: 14, pitch: 55, bearing: -20, duration: 1500 });
  }, []);

  // ── Close right panel ───────────────────────────────────────────────────────
  const closePanel = () => { setRightPanel(null); setSelectedResearcher(null); setSelectedSample(null); setSelectedBuilding(null); };

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleViewOnMap = useCallback((r) => {
    mapInstance.current?.flyTo({ center: [r.lng, r.lat], zoom: 17, pitch: 55, bearing: -20, duration: 1200 });
  }, []);

  const handleViewTrajectory = useCallback((r) => {
    setShowTrajectory(prev => prev === r.id ? null : r.id);
    mapInstance.current?.flyTo({ center: [r.lng, r.lat], zoom: 16, duration: 800 });
  }, []);

  return (
    <div style={st.root}>
      {/* ── Demo Call Modal ── */}
      {callTarget && (
        <DemoCallModal researcher={callTarget} onClose={() => setCallTarget(null)} />
      )}

      {/* ── Field Report Modal ── */}
      {fieldReportTarget && (
        <FieldReportModal
          researcher={fieldReportTarget}
          samples={samples.filter(s => s.assigned_to === fieldReportTarget.id)}
          onClose={() => setFieldReportTarget(null)}
        />
      )}

      {/* ── Inject pulse animation ── */}
      <style>{`
        @keyframes rpinPulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div style={st.topbar}>
        <div style={st.topLeft}>
          <span style={st.clockIcon}>🕐</span>
          <span style={st.clock}>{clock} GST</span>
        </div>
        <div style={st.topCenter}>
          <span style={st.counterDone}>{completedCount}</span>
          <span style={st.counterSlash}>/</span>
          <span style={st.counterTotal}>{samples.length}</span>
          <span style={st.counterLabel}>samples complete</span>
          {inProgressCount > 0 && <span style={st.counterInProgress}>({inProgressCount} in-progress)</span>}
        </div>
        <div style={st.topRight}>
          {/* Toggles */}
          {[
            { label: 'Researchers / الباحثون', on: showResearchers, set: setShowResearchers },
            { label: 'Samples / العينات', on: showSamples, set: setShowSamples },
            { label: 'Buildings / المباني', on: showBuildings, set: setShowBuildings },
            { label: 'Trails / المسارات', on: showTrails, set: setShowTrails },
            { label: 'Labels / التسميات', on: showLabels, set: setShowLabels },
          ].map(t => (
            <button key={t.label} onClick={() => t.set(!t.on)}
              style={{ ...st.toggleBtn, ...(t.on ? st.toggleOn : st.toggleOff) }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={st.body}>
        {/* ── Left panel: summary + researcher list ── */}
        <div style={st.leftPanel}>
          {/* Summary strip */}
          <div style={st.summaryCard}>
            <div style={st.summaryTitle}>Field Team</div>
            <div style={st.summaryRow}>
              <span style={st.summaryLabel2}>Enumerators</span>
              <span style={{ ...st.summaryVal, color: enumerators.length >= 26 ? '#43a047' : '#e65100' }}>{enumerators.length}/26</span>
            </div>
            <div style={st.summaryRow}>
              <span style={st.summaryLabel2}>Controllers</span>
              <span style={{ ...st.summaryVal, color: controllers.length >= 3 ? '#43a047' : '#e65100' }}>{controllers.length}/3</span>
            </div>
            <div style={st.summaryRow}>
              <span style={st.summaryLabel2}>Supervisors</span>
              <span style={{ ...st.summaryVal, color: supervisors.length >= 1 ? '#43a047' : '#e65100' }}>{supervisors.length}/1</span>
            </div>
            <div style={st.summaryDivider} />
            <div style={st.summaryRow}>
              <span style={st.summaryLabel2}>Morning</span>
              <span style={st.summaryVal}>{morningCount}</span>
            </div>
            <div style={st.summaryRow}>
              <span style={st.summaryLabel2}>Evening</span>
              <span style={st.summaryVal}>{eveningCount}</span>
            </div>
            <div style={st.summaryDivider} />
            <div style={st.summaryRow}>
              <span style={st.summaryLabel2}>Samples</span>
              <span style={st.summaryVal}>{completedCount}/{samples.length}</span>
            </div>
          </div>

          {/* Researcher list */}
          <div style={st.rListTitle}>Researchers ({researchers.length})</div>
          <div style={st.rList}>
            {researchers.map((r, i) => {
              const pct = r.totalAssigned > 0 ? Math.round((r.completedCount / r.totalAssigned) * 100) : 0;
              const isActive = selectedResearcher?.id === r.id;
              return (
                <div key={r.id} onClick={() => {
                  setSelectedResearcher(r); setSelectedSample(null); setSelectedBuilding(null); setRightPanel('researcher');
                  mapInstance.current?.flyTo({ center: [r.lng, r.lat], zoom: 16, duration: 800 });
                }} style={{ ...st.rItem, ...(isActive ? st.rItemActive : {}) }}>
                  <div style={{ ...st.rAvatar, backgroundColor: r.color }}>{getInitials(r.name)}</div>
                  <div style={st.rInfo}>
                    <div style={st.rName}>{r.name}</div>
                    <div style={st.rMeta}>{r.id} · {r.shift} · {r.region}</div>
                    <div style={st.rBarTrack}>
                      <div style={{ ...st.rBarFill, width: `${pct}%`, backgroundColor: r.color }} />
                    </div>
                  </div>
                  <div style={{ ...st.rStatusDot, backgroundColor: STATUS_COLORS[r.status] || '#9e9e9e' }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Map container ── */}
        <div style={st.mapWrap}>
          <div ref={mapRef} style={st.map} />
          <button onClick={handleResetView} style={st.resetBtn} title="Reset view">⟳</button>
        </div>

        {/* ── Right panel: detail view ── */}
        {rightPanel && (
          <div style={st.rightPanel}>
            <button onClick={closePanel} style={st.panelClose}>✕</button>

            {rightPanel === 'researcher' && selectedResearcher && (
              <ResearcherDetailPanel
                r={selectedResearcher}
                samples={samples}
                onCall={() => setCallTarget(selectedResearcher)}
                onChat={() => navigate('/chat')}
                onViewOnMap={() => handleViewOnMap(selectedResearcher)}
                onViewTrajectory={() => handleViewTrajectory(selectedResearcher)}
                onFieldReport={() => setFieldReportTarget(selectedResearcher)}
                showTrajectory={showTrajectory === selectedResearcher.id}
              />
            )}

            {rightPanel === 'sample' && selectedSample && (
              <SampleDetailPanel sample={selectedSample} researchers={researchers} buildings={buildings}
                onSelectResearcher={(r) => { setSelectedResearcher(r); setRightPanel('researcher'); }}
                onSelectBuilding={(b) => { setSelectedBuilding(b); setRightPanel('building'); }} />
            )}

            {rightPanel === 'building' && selectedBuilding && (
              <BuildingDetailPanel building={selectedBuilding}
                onSelectSample={(s) => { setSelectedSample(s); setRightPanel('sample'); }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function ResearcherDetailPanel({ r, samples, onCall, onChat, onViewOnMap, onViewTrajectory, onFieldReport, showTrajectory }) {
  const assigned = samples.filter(s => s.assigned_to === r.id);
  const done    = assigned.filter(s => s.status === 'completed').length;
  const inProg  = assigned.filter(s => s.status === 'in-progress').length;
  const pending = assigned.filter(s => s.status === 'pending').length;
  const pct = assigned.length > 0 ? Math.round((done / assigned.length) * 100) : 0;
  const isDriving = r.transport_mode === 'driving';

  return (
    <div>
      {/* Header */}
      <div style={st.panelBadge}>
        <div style={{ ...st.panelAvatar, backgroundColor: r.color }}>{getInitials(r.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.panelName}>{r.name}</div>
          {r.name_ar && <div style={st.panelNameAr}>{r.name_ar}</div>}
        </div>
      </div>

      {/* Status + transport */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ ...st.statusPill, backgroundColor: STATUS_COLORS[r.status] || '#9e9e9e', margin: 0 }}>{r.status}</span>
        <span style={{ ...st.statusPill, margin: 0, backgroundColor: isDriving ? 'rgba(79,195,247,0.15)' : 'rgba(34,197,94,0.15)', color: isDriving ? '#4FC3F7' : '#22C55E' }}>
          {isDriving ? '🚗 Driving' : '🚶 Walking'}
        </span>
      </div>

      {/* Fields */}
      <div style={st.panelField}><span style={st.panelLabel}>FW-ID</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.id}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Phone</span><span>{r.phone || '—'}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Email</span><span style={{ fontSize: '11px' }}>{r.email || '—'}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Region</span><span>{r.region || '—'}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Shift</span><span>{r.shift}</span></div>
      <div style={st.panelField}>
        <span style={st.panelLabel}>Location</span>
        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>{r.lat?.toFixed(5)}, {r.lng?.toFixed(5)}</span>
      </div>

      {/* Progress */}
      <div style={st.panelSection}>Sample Progress</div>
      <div style={st.progressRow}>
        <div style={{ ...st.progressChip, backgroundColor: 'var(--status-active-bg)', color: 'var(--status-active-fg)' }}>✓ {done}</div>
        <div style={{ ...st.progressChip, backgroundColor: 'var(--status-in-progress-bg)', color: 'var(--status-in-progress-fg)' }}>◉ {inProg}</div>
        <div style={{ ...st.progressChip, backgroundColor: 'var(--status-setup-bg)', color: 'var(--status-setup-fg)' }}>○ {pending}</div>
      </div>
      <div style={{ height: '4px', backgroundColor: 'var(--border-default)', borderRadius: '2px', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: pct >= 80 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444', borderRadius: '2px', transition: 'width 0.4s' }} />
      </div>

      {/* Primary actions */}
      <div style={st.panelSection}>Actions</div>
      <div style={st.actionRow}>
        <button style={{ ...st.actionBtn, backgroundColor: 'rgba(79,195,247,0.15)', color: '#4FC3F7', borderColor: 'rgba(79,195,247,0.3)' }} onClick={onChat}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Chat
        </button>
        <button style={{ ...st.actionBtn, backgroundColor: 'rgba(34,197,94,0.15)', color: '#22C55E', borderColor: 'rgba(34,197,94,0.3)' }} onClick={onCall}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.36 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.1 2.18l3-.01a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z"/></svg>
          Call
        </button>
        <button style={{ ...st.actionBtn, backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', borderColor: 'rgba(245,158,11,0.3)' }} onClick={onViewOnMap}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>
          Map
        </button>
      </div>

      {/* Secondary actions */}
      <div style={{ ...st.actionRow, marginTop: '6px' }}>
        <button
          style={{ ...st.actionBtn, flex: 1, backgroundColor: showTrajectory ? 'rgba(20,184,166,0.2)' : 'rgba(20,184,166,0.08)', color: '#14B8A6', borderColor: 'rgba(20,184,166,0.3)' }}
          onClick={onViewTrajectory}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          {showTrajectory ? 'Hide Trajectory' : 'View Trajectory'}
        </button>
        <button style={{ ...st.actionBtn, flex: 1, backgroundColor: 'rgba(168,85,247,0.1)', color: '#A855F7', borderColor: 'rgba(168,85,247,0.3)' }} onClick={onFieldReport}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Field Report
        </button>
      </div>

      {/* Assigned Households */}
      <div style={st.panelSection}>Assigned Households ({assigned.length})</div>
      <div style={st.hhList}>
        {assigned.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-faint)', padding: '8px 0' }}>No households assigned</div>}
        {assigned.map(s => (
          <div key={s.id} style={st.hhItem}>
            <span style={{ ...st.hhDot, backgroundColor: SAMPLE_COLORS[s.status] || '#9e9e9e' }} />
            <span style={st.hhId}>{s.id}</span>
            <span style={st.hhName}>{s.name_en || '—'}</span>
            <span style={{ ...st.hhStatus, color: SAMPLE_COLORS[s.status] || '#999' }}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldReportModal({ researcher: r, samples, onClose }) {
  const done    = samples.filter(s => s.status === 'completed').length;
  const inProg  = samples.filter(s => s.status === 'in-progress').length;
  const pending = samples.filter(s => s.status === 'pending').length;
  const pct     = samples.length > 0 ? Math.round((done / samples.length) * 100) : 0;
  const now     = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dubai', hour12: false });

  return (
    <div style={frS.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={frS.modal}>
        <div style={frS.header}>
          <div>
            <div style={frS.title}>Field Report</div>
            <div style={frS.subtitle}>{now} · Abu Dhabi, UAE</div>
          </div>
          <button style={frS.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={frS.body}>
          {/* Researcher info */}
          <div style={frS.section}>
            <div style={frS.avatarRow}>
              <div style={{ ...frS.avatar, backgroundColor: r.color }}>{getInitials(r.name)}</div>
              <div>
                <div style={frS.rName}>{r.name}</div>
                {r.name_ar && <div style={frS.rNameAr}>{r.name_ar}</div>}
                <div style={frS.rMeta}>{r.id} · {r.role} · {r.shift} Shift · {r.region}</div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={frS.statsGrid}>
            <div style={frS.statCard}>
              <div style={{ ...frS.statVal, color: '#22C55E' }}>{done}</div>
              <div style={frS.statLabel}>Completed</div>
            </div>
            <div style={frS.statCard}>
              <div style={{ ...frS.statVal, color: '#F59E0B' }}>{inProg}</div>
              <div style={frS.statLabel}>In Progress</div>
            </div>
            <div style={frS.statCard}>
              <div style={{ ...frS.statVal, color: 'var(--text-muted)' }}>{pending}</div>
              <div style={frS.statLabel}>Pending</div>
            </div>
            <div style={frS.statCard}>
              <div style={{ ...frS.statVal, color: pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444' }}>{pct}%</div>
              <div style={frS.statLabel}>Completion</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={frS.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              <span>Overall Progress</span><span>{done}/{samples.length} households</span>
            </div>
            <div style={frS.progressTrack}>
              <div style={{ ...frS.progressFill, width: `${pct}%`, backgroundColor: pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444' }} />
            </div>
          </div>

          {/* Transport */}
          <div style={frS.section}>
            <div style={frS.fieldRow}><span style={frS.fieldLabel}>Transport</span><span style={{ color: r.transport_mode === 'driving' ? '#4FC3F7' : '#22C55E', fontWeight: 600 }}>{r.transport_mode === 'driving' ? '🚗 Driving' : '🚶 Walking'}</span></div>
            <div style={frS.fieldRow}><span style={frS.fieldLabel}>Current Location</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{r.lat?.toFixed(5)}, {r.lng?.toFixed(5)}</span></div>
            <div style={frS.fieldRow}><span style={frS.fieldLabel}>Status</span><span style={{ color: STATUS_COLORS[r.status], fontWeight: 600, textTransform: 'capitalize' }}>{r.status}</span></div>
          </div>

          {/* Household table */}
          <div style={frS.section}>
            <div style={frS.sectionTitle}>Household Log</div>
            <div style={frS.tableWrap}>
              <table style={frS.table}>
                <thead>
                  <tr style={frS.thead}>
                    <th style={frS.th}>H-ID</th>
                    <th style={frS.th}>Name</th>
                    <th style={frS.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px' }}>No households assigned</td></tr>
                  )}
                  {samples.map(s => (
                    <tr key={s.id} style={frS.tr}>
                      <td style={{ ...frS.td, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.id}</td>
                      <td style={frS.td}>{s.name_en || '—'}</td>
                      <td style={{ ...frS.td }}>
                        <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', backgroundColor: SAMPLE_COLORS[s.status] || '#9e9e9e', marginRight: '5px' }} />
                        {s.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={frS.footer}>
          <span style={frS.demoTag}>DEMO REPORT · SIMULATION DATA</span>
          <button style={frS.printBtn} onClick={() => window.print()} aria-label="Print report">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

const frS = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(2,6,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal, 100)', padding: '24px' },
  modal: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)' },
  title: { fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' },
  subtitle: { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  closeBtn: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' },
  body: { flex: 1, overflowY: 'auto', padding: '0 24px' },
  section: { paddingTop: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' },
  sectionTitle: { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  avatarRow: { display: 'flex', gap: '12px', alignItems: 'center' },
  avatar: { width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0, fontFamily: 'var(--font-mono)' },
  rName: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' },
  rNameAr: { fontSize: '12px', color: 'var(--text-muted)', direction: 'rtl' },
  rMeta: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', padding: '16px 0' },
  statCard: { backgroundColor: 'var(--bg-muted)', borderRadius: '10px', padding: '12px', textAlign: 'center' },
  statVal: { fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.1 },
  statLabel: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' },
  progressTrack: { height: '6px', backgroundColor: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '3px', transition: 'width 0.4s ease-out' },
  fieldRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border-light)' },
  fieldLabel: { color: 'var(--text-muted)', fontWeight: 500 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  thead: { backgroundColor: 'var(--bg-muted)' },
  th: { padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  tr: { borderBottom: '1px solid var(--border-light)' },
  td: { padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '12px', verticalAlign: 'middle' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid var(--border-default)', flexShrink: 0 },
  demoTag: { fontSize: '9px', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' },
  printBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', backgroundColor: 'var(--bg-muted)', border: '1px solid var(--border-default)', borderRadius: '7px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' },
};

function SampleDetailPanel({ sample, researchers, buildings, onSelectResearcher, onSelectBuilding }) {
  const [showSensitive, setShowSensitive] = useState(false);
  const assignedR = researchers.find(r => r.id === sample.assigned_to);
  const building = sample.building_id ? buildings.find(b => b.id === sample.building_id) : null;

  return (
    <div>
      <div style={st.panelSection}>Household</div>
      <div style={{ ...st.statusPill, backgroundColor: SAMPLE_COLORS[sample.status] || '#9e9e9e' }}>{sample.status}</div>

      <div style={st.panelField}><span style={st.panelLabel}>H-ID</span><span style={{ fontWeight: 600 }}>{sample.id}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Name EN</span><span>{sample.name_en}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Name AR</span><span>{sample.name_ar}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Phone</span><span>{sample.phone}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Coordinates</span><span style={{ fontSize: '11px' }}>{sample.lat?.toFixed(6)}, {sample.lng?.toFixed(6)}</span></div>

      {building && (
        <div style={st.panelField}>
          <span style={st.panelLabel}>Building</span>
          <span style={{ color: '#1976d2', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => onSelectBuilding(building)}>{building.name_en}</span>
        </div>
      )}
      {sample.floor_number && (
        <div style={st.panelField}><span style={st.panelLabel}>Floor / Unit</span><span>{sample.floor_number}F — {sample.unit_number}</span></div>
      )}

      {assignedR && (
        <div style={st.panelField}>
          <span style={st.panelLabel}>Researcher</span>
          <span style={{ color: '#1976d2', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => onSelectResearcher(assignedR)}>{assignedR.name} ({assignedR.id})</span>
        </div>
      )}

      {/* Sensitive data — click to reveal */}
      <div style={st.panelSection}>
        <span onClick={() => setShowSensitive(!showSensitive)} style={{ cursor: 'pointer', color: '#1976d2' }}>
          {showSensitive ? '▼' : '▶'} Full record — click to reveal
        </span>
      </div>
      {showSensitive && (
        <div style={st.sensitiveBox}>
          <div style={st.panelField}><span style={st.panelLabel}>Emirates ID</span><span>{sample.eid || '—'}</span></div>
          <div style={st.panelField}><span style={st.panelLabel}>Age</span><span>{sample.age || '—'}</span></div>
          <div style={st.panelField}><span style={st.panelLabel}>Education</span><span>{sample.education || '—'}</span></div>
          <div style={st.panelField}><span style={st.panelLabel}>Marital Status</span><span>{sample.marital_status || '—'}</span></div>
        </div>
      )}
    </div>
  );
}

function BuildingDetailPanel({ building, onSelectSample }) {
  const completed = building.households.filter(h => h.status === 'completed').length;

  // Group by floor
  const byFloor = {};
  building.households.forEach(h => {
    const f = h.floor_number || 0;
    if (!byFloor[f]) byFloor[f] = [];
    byFloor[f].push(h);
  });

  return (
    <div>
      <div style={st.panelSection}>Building</div>
      <div style={st.panelField}><span style={st.panelLabel}>Name EN</span><span style={{ fontWeight: 600 }}>{building.name_en}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Name AR</span><span>{building.name_ar}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Height</span><span>{building.height_m}m</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Floors</span><span>{building.floors}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Households</span><span>{building.households.length}</span></div>
      <div style={st.panelField}><span style={st.panelLabel}>Surveyed</span><span>{completed} / {building.households.length}</span></div>

      {Object.keys(byFloor).sort((a, b) => b - a).map(floor => (
        <div key={floor}>
          <div style={st.floorHeader}>Floor {floor}</div>
          {byFloor[floor].map(h => (
            <div key={h.id} style={st.hhItem} onClick={() => onSelectSample(h)}>
              <span style={{ ...st.hhDot, backgroundColor: SAMPLE_COLORS[h.status] || '#9e9e9e' }} />
              <span style={st.hhId}>{h.id}</span>
              <span style={st.hhName}>{h.name_en}</span>
              <span style={st.hhStatus}>Unit {h.unit_number}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════════
const st = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px',
    backgroundColor: 'var(--bg-secondary, #f8f9fa)', borderRadius: '8px', marginBottom: '8px', flexShrink: 0, flexWrap: 'wrap', gap: '6px' },
  topLeft: { display: 'flex', alignItems: 'center', gap: '6px' },
  clockIcon: { fontSize: '14px' },
  clock: { fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary, #333)' },
  topCenter: { display: 'flex', alignItems: 'baseline', gap: '3px' },
  counterDone: { fontSize: '20px', fontWeight: 700, color: '#43a047' },
  counterSlash: { fontSize: '14px', color: '#999' },
  counterTotal: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary, #333)' },
  counterLabel: { fontSize: '11px', color: '#888', marginLeft: '4px' },
  counterInProgress: { fontSize: '11px', color: '#fb8c00', marginLeft: '4px' },
  topRight: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  toggleBtn: { padding: '4px 10px', borderRadius: '12px', fontSize: '10px', cursor: 'pointer', border: 'none', fontWeight: 500, transition: 'all 0.2s' },
  toggleOn: { backgroundColor: '#1976d2', color: '#fff' },
  toggleOff: { backgroundColor: '#e0e0e0', color: '#666' },

  body: { display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' },

  // Left panel
  leftPanel: { width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' },
  summaryCard: { backgroundColor: 'var(--bg-card, #fff)', padding: '12px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  summaryTitle: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #333)', marginBottom: '8px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' },
  summaryLabel2: { color: 'var(--text-secondary, #888)' },
  summaryVal: { fontWeight: 600 },
  summaryDivider: { height: '1px', backgroundColor: '#e0e0e0', margin: '6px 0' },

  rListTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #333)', padding: '4px 0' },
  rList: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflowY: 'auto' },
  rItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
    backgroundColor: 'var(--bg-card, #fff)', transition: 'background 0.15s' },
  rItemActive: { backgroundColor: '#e3f2fd', boxShadow: '0 0 0 1px #1976d2' },
  rAvatar: { width: '28px', height: '28px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 },
  rInfo: { flex: 1, minWidth: 0 },
  rName: { fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #333)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rMeta: { fontSize: '10px', color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rBarTrack: { height: '3px', backgroundColor: '#e0e0e0', borderRadius: '2px', marginTop: '3px' },
  rBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.3s' },
  rStatusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },

  // Map
  mapWrap: { flex: 1, position: 'relative', borderRadius: '8px', overflow: 'hidden', minHeight: '400px' },
  map: { width: '100%', height: '100%' },
  resetBtn: { position: 'absolute', top: '60px', right: '10px', width: '30px', height: '30px', borderRadius: '4px',
    border: 'none', backgroundColor: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontSize: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 5 },

  // Right panel
  rightPanel: { width: '280px', flexShrink: 0, backgroundColor: 'var(--bg-card, #fff)', borderRadius: '8px', padding: '14px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.08)', overflowY: 'auto', position: 'relative' },
  panelClose: { position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', fontSize: '16px',
    cursor: 'pointer', color: '#999', padding: '4px' },

  panelBadge: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  panelAvatar: { width: '40px', height: '40px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '14px', fontWeight: 700 },
  panelName: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #333)' },
  panelNameAr: { fontSize: '13px', color: '#888', direction: 'rtl' },
  panelField: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f0f0f0' },
  panelLabel: { color: '#888', fontWeight: 500, flexShrink: 0, marginRight: '8px' },
  panelSection: { fontSize: '12px', fontWeight: 700, color: 'var(--text-primary, #333)', marginTop: '12px', marginBottom: '6px', borderBottom: '1px solid #e0e0e0', paddingBottom: '4px' },

  statusPill: { display: 'inline-block', padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, color: '#fff', marginBottom: '8px' },

  progressRow: { display: 'flex', gap: '6px', marginBottom: '8px' },
  progressChip: { padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 },

  actionRow: { display: 'flex', gap: '6px' },
  actionBtn: {
    flex: 1, padding: '7px 6px', border: '1px solid', borderRadius: '7px',
    cursor: 'pointer', fontSize: '11px', fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
    transition: 'opacity 150ms', fontFamily: 'var(--font-body)',
  },

  hhList: { display: 'flex', flexDirection: 'column', gap: '2px' },
  hhItem: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer',
    fontSize: '11px', backgroundColor: '#f8f9fa' },
  hhDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  hhId: { fontWeight: 600, color: '#333', width: '44px', flexShrink: 0 },
  hhName: { flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hhStatus: { fontSize: '10px', color: '#999', flexShrink: 0 },

  sensitiveBox: { backgroundColor: '#fff8e1', padding: '8px', borderRadius: '6px', border: '1px solid #ffe082' },

  floorHeader: { fontSize: '11px', fontWeight: 700, color: '#1976d2', padding: '6px 0 2px', borderBottom: '1px solid #e3f2fd' },
};
