import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  fetchProject, fetchProjectStats, fetchProjectSamples,
  fetchProjectResearchers, uploadSamplePoints, uploadResearchers,
  validateProjectSamples, fetchTrajectory, fetchProjectETAs,
} from '../api';
import { initSCADMap } from '../tileConfig';
import LiveMap from './LiveMap';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [stats, setStats] = useState(null);
  const [samples, setSamples] = useState([]);
  const [researchers, setResearchers] = useState([]);
  const [activeTab, setActiveTab] = useState('live');
  const [loading, setLoading] = useState(true);
  const [selectedResearcher, setSelectedResearcher] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [pj, st, sa, rw] = await Promise.all([
        fetchProject(projectId).catch(() => null),
        fetchProjectStats(projectId).catch(() => null),
        fetchProjectSamples(projectId).catch(() => []),
        fetchProjectResearchers(projectId).catch(() => []),
      ]);
      setProject(pj);
      setStats(st);
      setSamples(Array.isArray(sa) ? sa : sa.samples || []);
      setResearchers(Array.isArray(rw) ? rw : rw.researchers || []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div style={s.loading}>Loading project…</div>;
  if (!project) return <div style={s.loading}>Project not found. <Link to="/projects">Back to projects</Link></div>;

  const completedSamples = samples.filter((sp) => sp.status === 'completed').length;
  const completionPct = samples.length > 0 ? Math.round((completedSamples / samples.length) * 100) : 0;

  return (
    <div style={s.page}>
      {/* ── Professional Header ── */}
      <div style={s.headerBar}>
        <div style={s.headerLeft}>
          <Link to="/projects" style={s.back}>← Projects</Link>
          <div style={s.titleRow}>
            <h1 style={s.title}>{project.project_name}</h1>
            <span style={{ ...s.statusBadge, backgroundColor: statusColor(project.status) }}>{project.status}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaChip}>{project.region}{project.district ? ` — ${project.district}` : ''}</span>
            <span style={s.metaDivider} />
            <span style={s.metaDate}>{project.start_date} → {project.end_date}</span>
            <span style={s.metaDivider} />
            <span style={s.metaId}>ID: {project.project_id}</span>
          </div>
        </div>
        <div style={s.headerStats}>
          <MiniStat label="Samples" value={samples.length} />
          <MiniStat label="Completed" value={completedSamples} />
          <MiniStat label="Completion" value={`${completionPct}%`} accent={completionPct >= 80 ? '#2e7d32' : completionPct >= 40 ? '#1976d2' : '#c62828'} />
          <MiniStat label="Researchers" value={researchers.length} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs}>
        {['live', 'map', 'researchers', 'samples', 'upload'].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}) }}
          >
            {t === 'live' ? 'Live Map' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={(activeTab === 'map' || activeTab === 'live') ? s.contentMap : s.content}>
        {activeTab === 'live' && (
          <LiveMap projectId={projectId} samples={samples} researchers={researchers} />
        )}
        {activeTab === 'map' && (
          <ProjectMap
            samples={samples}
            researchers={researchers}
            boundary={project.boundary_geojson}
            selectedResearcher={selectedResearcher}
            onSelectResearcher={setSelectedResearcher}
            projectId={projectId}
          />
        )}
        {activeTab === 'researchers' && (
          <ResearchersTab researchers={researchers} />
        )}
        {activeTab === 'samples' && (
          <SamplesTab samples={samples} />
        )}
        {activeTab === 'upload' && (
          <UploadTab projectId={projectId} onUploaded={loadData} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Project-Scoped 3D Map — Arabic labels, 3D buildings, full view
// ═══════════════════════════════════════════════════════════════════

function ProjectMap({ samples, researchers, boundary, selectedResearcher, onSelectResearcher, projectId }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const sampleMarkersRef = useRef([]);
  const researcherMarkersRef = useRef([]);
  const etaMarkersRef = useRef([]);
  const distanceLinesRef = useRef(null);

  // Toggle states
  const [showSamples, setShowSamples] = useState(true);
  const [showResearchers, setShowResearchers] = useState(true);
  const [showFieldOnly, setShowFieldOnly] = useState(false);
  const [showDistances, setShowDistances] = useState(false);
  const [show3D, setShow3D] = useState(true);
  const [showTrail, setShowTrail] = useState(false);
  const [showBoundary, setShowBoundary] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showRouting, setShowRouting] = useState(false);

  // Trajectory state
  const [trajectoryData, setTrajectoryData] = useState(null);
  const [trailProgress, setTrailProgress] = useState(100);
  const [trailPlaying, setTrailPlaying] = useState(false);
  const trailAnimRef = useRef(null);

  // ETA state
  const [etas, setEtas] = useState([]);

  // Map ready flag — triggers marker effects after async map init
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const addOverlayLayers = (map) => {
      // Distance lines
      if (!map.getSource('distance-lines')) {
        map.addSource('distance-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'distance-lines-layer', type: 'line', source: 'distance-lines', paint: { 'line-color': '#1976d2', 'line-width': 1.5, 'line-dasharray': [4, 3], 'line-opacity': 0.7 } });
        map.addLayer({ id: 'distance-labels-layer', type: 'symbol', source: 'distance-lines', layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'distance'], 'text-size': 11, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'], 'text-allow-overlap': true }, paint: { 'text-color': '#1976d2', 'text-halo-color': '#fff', 'text-halo-width': 2 } });
        distanceLinesRef.current = 'distance-lines';
      }
      // Trajectory trail
      if (!map.getSource('trajectory-trail')) {
        map.addSource('trajectory-trail', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, lineMetrics: true });
        map.addLayer({ id: 'trajectory-trail-layer', type: 'line', source: 'trajectory-trail', paint: { 'line-color': '#60a5fa', 'line-width': 3, 'line-dasharray': [2, 2], 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(96,165,250,0.05)', 0.5, 'rgba(96,165,250,0.35)', 0.8, 'rgba(96,165,250,0.7)', 1, 'rgba(96,165,250,1.0)'] } });
        map.addSource('trail-head', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'trail-head-layer', type: 'circle', source: 'trail-head', paint: { 'circle-radius': 6, 'circle-color': '#3b82f6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
      }
      // Geofence boundary
      if (!map.getSource('geofence-boundary')) {
        map.addSource('geofence-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'geofence-fill', type: 'fill-extrusion', source: 'geofence-boundary', paint: { 'fill-extrusion-color': '#ff9800', 'fill-extrusion-height': 15, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.12 } });
        map.addLayer({ id: 'geofence-outline', type: 'line', source: 'geofence-boundary', paint: { 'line-color': '#ff9800', 'line-width': 2.5, 'line-dasharray': [4, 3], 'line-opacity': 0.8 } });
      }
      // Heatmap
      if (!map.getSource('coverage-heatmap')) {
        map.addSource('coverage-heatmap', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'coverage-heatmap-layer', type: 'heatmap', source: 'coverage-heatmap', maxzoom: 15, paint: { 'heatmap-weight': ['get', 'weight'], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3], 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, '#ffffb2', 0.4, '#fed976', 0.6, '#feb24c', 0.8, '#fd8d3c', 1, '#2e7d32'], 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 15, 15, 25], 'heatmap-opacity': 0.7 }, layout: { visibility: 'none' } });
      }
      // Routing lines
      if (!map.getSource('routing-line')) {
        map.addSource('routing-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'routing-line-layer', type: 'line', source: 'routing-line', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.8 } });
        map.addLayer({ id: 'routing-label-layer', type: 'symbol', source: 'routing-line', layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'label'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#fff', 'text-halo-width': 2 } });
      }
      // Sample clusters
      if (!map.getSource('sample-clusters')) {
        map.addSource('sample-clusters', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 40, clusterMaxZoom: 14 });
        map.addLayer({ id: 'cluster-circles', type: 'circle', source: 'sample-clusters', filter: ['has', 'point_count'], paint: { 'circle-color': '#1976d2', 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 32, 50, 40], 'circle-opacity': 0.85, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }, layout: { visibility: 'none' } });
        map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'sample-clusters', filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12, visibility: 'none' }, paint: { 'text-color': '#fff' } });
      }
    };

    const coords = samples.filter((sp) => sp.latitude && sp.longitude).map((sp) => [sp.longitude, sp.latitude]);

    const { map, cleanup } = initSCADMap(containerRef.current, {
      satellite: true,
      maxPitch: 85,
      zoom: 14,
      pitch: 60,
      onStyleLoad: addOverlayLayers,
      onLoad: (m) => {
        // Fit bounds
        if (coords.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          coords.forEach((c) => bounds.extend(c));
          researchers.forEach((rw) => {
            if (rw.latitude && rw.longitude) bounds.extend([rw.longitude, rw.latitude]);
          });
          m.fitBounds(bounds, { padding: 80, duration: 0, maxZoom: 16 });
          m.setPitch(60);
          m.setBearing(-17.6);
        }
        setMapReady(true);
      },
    });

    mapRef.current = map;

    return () => {
      sampleMarkersRef.current.forEach((m) => m.remove());
      researcherMarkersRef.current.forEach((m) => m.remove());
      etaMarkersRef.current.forEach((m) => m.remove());
      sampleMarkersRef.current = [];
      researcherMarkersRef.current = [];
      etaMarkersRef.current = [];
      if (trailAnimRef.current) cancelAnimationFrame(trailAnimRef.current);
      mapRef.current = null;
      cleanup();
    };
  }, []); // map instance init — runs once

  // ── Update sample markers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addSampleMarkers() {
      sampleMarkersRef.current.forEach((m) => m.remove());
      sampleMarkersRef.current = [];
      if (!showSamples) return;

      samples.forEach((sp) => {
        if (!sp.latitude || !sp.longitude) return;
        const color = validationColor(sp.validation_status, sp.status);
        const el = createSampleMarker(color, sp.status === 'completed');
        const popup = new maplibregl.Popup({ offset: 16, closeButton: true, maxWidth: '260px' })
          .setHTML(samplePopupHTML(sp, color));
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([sp.longitude, sp.latitude])
          .setPopup(popup)
          .addTo(map);
        sampleMarkersRef.current.push(marker);
      });
    }

    if (map.loaded()) addSampleMarkers();
    else map.once('load', addSampleMarkers);
  }, [samples, showSamples, mapReady]);

  // ── Update researcher markers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addResearcherMarkers() {
      researcherMarkersRef.current.forEach((m) => m.remove());
      researcherMarkersRef.current = [];
      if (!showResearchers) return;

      const filtered = showFieldOnly ? researchers.filter((r) => r.in_field) : researchers;

      filtered.forEach((rw) => {
        if (!rw.latitude || !rw.longitude) return;
        const isSelected = selectedResearcher?.fw_id === rw.fw_id;
        const el = createResearcherMarker(rw, isSelected);
        el.addEventListener('click', (e) => { e.stopPropagation(); onSelectResearcher(rw); });

        const popup = new maplibregl.Popup({ offset: 30, closeButton: true, maxWidth: '280px' })
          .setHTML(researcherPopupHTML(rw));
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([rw.longitude, rw.latitude])
          .setPopup(popup)
          .addTo(map);
        researcherMarkersRef.current.push(marker);
      });
    }

    if (map.loaded()) addResearcherMarkers();
    else map.once('load', addResearcherMarkers);
  }, [researchers, showResearchers, showFieldOnly, selectedResearcher, onSelectResearcher, mapReady]);

  // ── Distance lines between researchers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded() || !distanceLinesRef.current) return;

    const src = map.getSource(distanceLinesRef.current);
    if (!src) return;

    if (!showDistances) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const validRw = researchers.filter((r) => r.latitude && r.longitude);
    const features = [];
    for (let i = 0; i < validRw.length; i++) {
      for (let j = i + 1; j < validRw.length; j++) {
        const a = validRw[i], b = validRw[j];
        const dist = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
        if (dist < 10) { // Only show lines < 10km
          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]],
            },
            properties: { distance: `${dist.toFixed(1)} km` },
          });
        }
      }
    }
    src.setData({ type: 'FeatureCollection', features });
  }, [researchers, showDistances]);

  // ── Toggle 3D buildings ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    try {
      if (map.getLayer('scad-3d-buildings')) {
        map.setLayoutProperty('scad-3d-buildings', 'visibility', show3D ? 'visible' : 'none');
      }
    } catch { /* ignore */ }
  }, [show3D]);

  // ── Trajectory trail toggle ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    const src = map.getSource('trajectory-trail');
    if (!src) return;

    if (!showTrail || !selectedResearcher) {
      src.setData({ type: 'FeatureCollection', features: [] });
      setTrajectoryData(null);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    fetchTrajectory(selectedResearcher.fw_id, today).then((geojson) => {
      if (!geojson?.features?.length) return;
      setTrajectoryData(geojson);
      src.setData(geojson);
    }).catch(() => {});
  }, [showTrail, selectedResearcher]);

  // ── Trail scrubber — update line + head dot ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded() || !trajectoryData) return;
    const src = map.getSource('trajectory-trail');
    const headSrc = map.getSource('trail-head');
    if (!src) return;

    const coords = trajectoryData.features[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return;

    const endIdx = Math.max(2, Math.floor((trailProgress / 100) * coords.length));
    const sliced = coords.slice(0, endIdx);
    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: sliced },
        properties: trajectoryData.features[0].properties,
      }],
    });

    // Update trail head dot
    if (headSrc) {
      const tip = sliced[sliced.length - 1];
      headSrc.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: tip },
          properties: {},
        }],
      });
    }
  }, [trailProgress, trajectoryData]);

  // ── Auto-play animation at 10fps ──
  useEffect(() => {
    if (!trailPlaying || !trajectoryData) return;
    let raf;
    let lastTime = 0;
    const interval = 100; // 10fps = 100ms per frame
    const step = (timestamp) => {
      if (timestamp - lastTime >= interval) {
        lastTime = timestamp;
        setTrailProgress((prev) => {
          if (prev >= 100) { setTrailPlaying(false); return 100; }
          return Math.min(100, prev + 0.5);
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [trailPlaying, trajectoryData]);

  // ── Geofence boundary layer ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    const src = map.getSource('geofence-boundary');
    if (!src) return;

    if (!showBoundary || !boundary) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const geojson = typeof boundary === 'string' ? JSON.parse(boundary) : boundary;
    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: geojson, properties: {} }],
    });
  }, [showBoundary, boundary]);

  // ── Coverage heatmap ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    try {
      map.setLayoutProperty('coverage-heatmap-layer', 'visibility', showHeatmap ? 'visible' : 'none');
    } catch { /* */ }

    if (!showHeatmap) return;

    const src = map.getSource('coverage-heatmap');
    if (!src) return;

    const updateHeatmap = () => {
      const features = samples
        .filter((sp) => sp.latitude && sp.longitude)
        .map((sp) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [sp.longitude, sp.latitude] },
          properties: { weight: sp.status === 'completed' ? 1.0 : 0.3 },
        }));
      src.setData({ type: 'FeatureCollection', features });
    };
    updateHeatmap();

    // Auto-refresh every 30 seconds
    const iv = setInterval(updateHeatmap, 30000);
    return () => clearInterval(iv);
  }, [showHeatmap, samples]);

  // ── ETA badges on researcher pins ──
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const poll = () => {
      fetchProjectETAs(projectId).then((data) => {
        if (active && Array.isArray(data)) setEtas(data);
      }).catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => { active = false; clearInterval(iv); };
  }, [projectId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    etaMarkersRef.current.forEach((m) => m.remove());
    etaMarkersRef.current = [];

    if (!showResearchers || etas.length === 0) return;

    etas.forEach((eta) => {
      if (eta.eta_seconds == null || eta.distance_m == null) return;
      const rw = researchers.find((r) => r.fw_id === eta.fw_id);
      if (!rw || !rw.latitude || !rw.longitude) return;
      if (showFieldOnly && !rw.in_field) return;

      const mins = Math.floor(eta.eta_seconds / 60);
      const secs = eta.eta_seconds % 60;
      let color = '#2e7d32'; // green < 5min
      if (eta.eta_seconds > 900) color = '#c62828'; // red > 15min
      else if (eta.eta_seconds > 300) color = '#e65100'; // orange 5-15min

      const el = document.createElement('div');
      Object.assign(el.style, {
        backgroundColor: color, color: '#fff', padding: '1px 5px',
        borderRadius: '3px', fontSize: '9px', fontWeight: '700',
        whiteSpace: 'nowrap', pointerEvents: 'none',
        fontFamily: '-apple-system, sans-serif',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      });
      el.textContent = `ETA: ${mins}m ${secs}s · ${eta.distance_m}m`;

      const marker = new maplibregl.Marker({ element: el, anchor: 'top' })
        .setLngLat([rw.longitude, rw.latitude])
        .setOffset([0, 40])
        .addTo(map);
      etaMarkersRef.current.push(marker);
    });
  }, [etas, researchers, showResearchers, showFieldOnly, mapReady]);

  // ── Cluster markers — zoom-reactive visibility ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    const src = map.getSource('sample-clusters');
    if (!src || !showSamples) return;

    // Populate cluster source with sample data
    const features = samples
      .filter((sp) => sp.latitude && sp.longitude)
      .map((sp) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [sp.longitude, sp.latitude] },
        properties: { status: sp.status },
      }));
    src.setData({ type: 'FeatureCollection', features });

    // Update cluster visibility based on current zoom
    const updateClusterVisibility = () => {
      const useCluster = showSamples && map.getZoom() < 14;
      try {
        map.setLayoutProperty('cluster-circles', 'visibility', useCluster ? 'visible' : 'none');
        map.setLayoutProperty('cluster-count', 'visibility', useCluster ? 'visible' : 'none');
      } catch { /* */ }
    };
    updateClusterVisibility();

    // React to zoom changes dynamically
    map.on('zoom', updateClusterVisibility);
    return () => { map.off('zoom', updateClusterVisibility); };
  }, [samples, showSamples, mapReady]);

  // ── Predictive routing line ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    const src = map.getSource('routing-line');
    if (!src) return;

    if (!showRouting || !selectedResearcher || !selectedResearcher.latitude) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const eta = etas.find((e) => e.fw_id === selectedResearcher.fw_id);
    if (!eta || !eta.next_sample_id) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const nextSample = samples.find((s) => s.sample_id === eta.next_sample_id);
    if (!nextSample || !nextSample.latitude) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    let color = '#2e7d32';
    if (eta.eta_seconds > 900) color = '#c62828';
    else if (eta.eta_seconds > 300) color = '#e65100';

    const distKm = (eta.distance_m / 1000).toFixed(1);
    const mins = Math.floor(eta.eta_seconds / 60);

    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [selectedResearcher.longitude, selectedResearcher.latitude],
            [nextSample.longitude, nextSample.latitude],
          ],
        },
        properties: { color, label: `${distKm} km · ETA ${mins}m` },
      }],
    });
  }, [showRouting, selectedResearcher, etas, samples]);

  // Fly to selected researcher
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedResearcher?.latitude || !selectedResearcher?.longitude) return;
    map.flyTo({ center: [selectedResearcher.longitude, selectedResearcher.latitude], zoom: 17, pitch: 65, duration: 1200 });
  }, [selectedResearcher]);

  return (
    <div style={s.mapContainer}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Operational Toggle Panel ── */}
      <div style={s.togglePanel}>
        <div style={s.toggleTitle}>Layers / الطبقات</div>
        <ToggleSwitch label="Sample Points" labelAr="العينات" on={showSamples} onToggle={() => setShowSamples(!showSamples)} color="#2e7d32" />
        <ToggleSwitch label="Researchers" labelAr="الباحثون" on={showResearchers} onToggle={() => setShowResearchers(!showResearchers)} color="#1976d2" />
        <ToggleSwitch label="Field Only" labelAr="الميدان فقط" on={showFieldOnly} onToggle={() => setShowFieldOnly(!showFieldOnly)} color="#ff9800" disabled={!showResearchers} />
        <ToggleSwitch label="Distances" labelAr="المسافات" on={showDistances} onToggle={() => setShowDistances(!showDistances)} color="#9c27b0" />
        <ToggleSwitch label="3D Buildings" labelAr="المباني ثلاثية الأبعاد" on={show3D} onToggle={() => setShow3D(!show3D)} color="#607d8b" />
        <div style={{ borderTop: '1px solid #eee', margin: '4px 0', paddingTop: '4px' }} />
        <div style={{ ...s.toggleTitle, marginBottom: '4px' }}>Phase 6</div>
        <ToggleSwitch label="Trail" labelAr="المسار" on={showTrail} onToggle={() => setShowTrail(!showTrail)} color="#60a5fa" disabled={!selectedResearcher} />
        <ToggleSwitch label="Boundary" labelAr="الحدود" on={showBoundary} onToggle={() => setShowBoundary(!showBoundary)} color="#ff9800" disabled={!boundary} />
        <ToggleSwitch label="Heatmap" labelAr="خريطة حرارية" on={showHeatmap} onToggle={() => setShowHeatmap(!showHeatmap)} color="#f44336" />
        <ToggleSwitch label="Routing" labelAr="التوجيه" on={showRouting} onToggle={() => setShowRouting(!showRouting)} color="#4caf50" disabled={!selectedResearcher} />
      </div>

      {/* ── Trail Scrubber ── */}
      {showTrail && trajectoryData && (
        <div style={s.scrubberPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>Trail Replay</span>
            <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 700 }}>{Math.round(trailProgress)}%</span>
          </div>
          <input
            type="range" min="0" max="100" step="0.5" value={trailProgress}
            onChange={(e) => { setTrailProgress(Number(e.target.value)); setTrailPlaying(false); }}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#3b82f6' }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button
              onClick={() => { if (trailProgress >= 100) setTrailProgress(0); setTrailPlaying(!trailPlaying); }}
              style={s.scrubberBtn}
            >
              {trailPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => { setTrailPlaying(false); setTrailProgress(0); }}
              style={s.scrubberBtn}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ── Selected researcher info panel ── */}
      {selectedResearcher && (
        <div style={s.researcherPanel}>
          <div style={s.rpHeader}>
            <div style={{ ...s.rpAvatar, backgroundColor: selectedResearcher.in_field ? '#1976d2' : '#ff9800' }}>
              {selectedResearcher.name?.charAt(0) || 'R'}
            </div>
            <div>
              <div style={s.rpName}>{selectedResearcher.name}</div>
              <div style={s.rpId}>{selectedResearcher.fw_id} — {selectedResearcher.shift} shift</div>
            </div>
            <button onClick={() => onSelectResearcher(null)} style={s.rpClose}>✕</button>
          </div>
          <div style={s.rpBody}>
            <div style={s.rpRow}>
              <span style={s.rpLabel}>Status / الحالة</span>
              <span style={{ color: selectedResearcher.in_field ? '#2e7d32' : '#e65100', fontWeight: 600 }}>
                {selectedResearcher.in_field ? 'In Field / في الميدان' : 'Out / خارج'}
              </span>
            </div>
            <div style={s.rpRow}>
              <span style={s.rpLabel}>Phone / الهاتف</span>
              <span>{selectedResearcher.phone || '—'}</span>
            </div>
            <div style={s.rpRow}>
              <span style={s.rpLabel}>Region / المنطقة</span>
              <span>{selectedResearcher.region || '—'}</span>
            </div>
            <div style={s.rpRow}>
              <span style={s.rpLabel}>Samples / العينات</span>
              <span style={{ fontWeight: 600 }}>
                {selectedResearcher.completed_samples || 0} / {selectedResearcher.total_samples || 0}
              </span>
            </div>
            <div style={s.rpProgressOuter}>
              <div style={{
                ...s.rpProgressInner,
                width: `${selectedResearcher.total_samples > 0
                  ? Math.round((selectedResearcher.completed_samples / selectedResearcher.total_samples) * 100) : 0}%`,
              }} />
            </div>
            <div style={s.rpRow}>
              <span style={s.rpLabel}>Coordinates</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                {selectedResearcher.latitude?.toFixed(6)}, {selectedResearcher.longitude?.toFixed(6)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div style={s.legend}>
        <div style={s.legendTitle}>Legend / دليل الخريطة</div>
        <div style={s.legendSection}>Samples / العينات</div>
        <LegendItem color="#2e7d32" label="Valid / صالح" />
        <LegendItem color="#f9a825" label="Warning / تحذير" />
        <LegendItem color="#c62828" label="Invalid / غير صالح" />
        <LegendItem color="#78909c" label="Unchecked / لم يُفحص" />
        <div style={{ ...s.legendSection, marginTop: '6px' }}>Researchers / الباحثون</div>
        <LegendItem color="#1976d2" label="In field / في الميدان" shape="pin" />
        <LegendItem color="#ff9800" label="Out / خارج الميدان" shape="pin" />
      </div>
    </div>
  );
}

// ─── Toggle Switch Component ──────────────────────────────────────

function ToggleSwitch({ label, labelAr, on, onToggle, color, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        width: '32px', height: '16px', borderRadius: '8px',
        backgroundColor: on ? color : '#ccc', position: 'relative',
        transition: 'background 0.2s',
      }}>
        <div style={{
          width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#fff',
          position: 'absolute', top: '2px', left: on ? '18px' : '2px',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      <span style={{ fontSize: '11px', color: '#333', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '9px', color: '#aaa' }}>{labelAr}</span>
    </div>
  );
}

// ─── Haversine distance (km) ──────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Marker creation helpers ──────────────────────────────────────

function createSampleMarker(color, isCompleted) {
  const el = document.createElement('div');
  const size = isCompleted ? '18px' : '16px';
  Object.assign(el.style, {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: color,
    border: '3px solid #fff',
    boxShadow: `0 0 0 2px ${color}66, 0 2px 8px rgba(0,0,0,0.4)`,
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
  });
  if (isCompleted) {
    // Checkmark overlay for completed samples
    el.innerHTML = '<svg viewBox="0 0 12 12" style="width:10px;height:10px;display:block;margin:auto;"><path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
  }
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.4)'; el.style.zIndex = '10'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; el.style.zIndex = ''; });
  return el;
}

function createResearcherMarker(rw, isSelected) {
  const color = rw.in_field ? '#1565c0' : '#e65100';
  const glowColor = rw.in_field ? 'rgba(21,101,192,0.5)' : 'rgba(230,81,0,0.5)';
  const el = document.createElement('div');
  Object.assign(el.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
    filter: isSelected ? `drop-shadow(0 0 12px ${glowColor})` : 'drop-shadow(0 3px 6px rgba(0,0,0,0.45))',
    transition: 'filter 0.2s, transform 0.2s',
    transform: isSelected ? 'scale(1.2)' : 'scale(1)',
    zIndex: isSelected ? '10' : '5',
  });

  // Name label above pin
  const label = document.createElement('div');
  Object.assign(label.style, {
    backgroundColor: color,
    color: '#fff',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: '-apple-system, sans-serif',
    whiteSpace: 'nowrap',
    marginBottom: '3px',
    maxWidth: '140px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'center',
    letterSpacing: '0.3px',
    lineHeight: '18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
  });
  label.textContent = rw.name?.split(' ').slice(0, 2).join(' ') || rw.fw_id;
  el.appendChild(label);

  // Pin SVG — larger
  const pin = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pin.setAttribute('width', '36');
  pin.setAttribute('height', '46');
  pin.setAttribute('viewBox', '0 0 36 46');
  pin.innerHTML = `
    <defs>
      <filter id="pin-shadow-${rw.fw_id}" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
      </filter>
    </defs>
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z"
          fill="${color}" stroke="#fff" stroke-width="2.5" filter="url(#pin-shadow-${rw.fw_id})"/>
    <circle cx="18" cy="16" r="8" fill="#fff"/>
    <text x="18" y="20" text-anchor="middle" font-size="12" font-weight="800"
          fill="${color}" font-family="-apple-system,sans-serif">${rw.fw_id?.replace('FW-', '') || '?'}</text>
  `;
  el.appendChild(pin);

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.25)';
    el.style.filter = `drop-shadow(0 0 14px ${glowColor})`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = isSelected ? 'scale(1.2)' : 'scale(1)';
    el.style.filter = isSelected
      ? `drop-shadow(0 0 12px ${glowColor})`
      : 'drop-shadow(0 3px 6px rgba(0,0,0,0.45))';
  });

  return el;
}

// ─── Popup HTML builders ──────────────────────────────────────────

function samplePopupHTML(sp, color) {
  const pct = sp.status === 'completed' ? 100 : 0;
  return `
    <div style="font-family:-apple-system,'Segoe UI',sans-serif;min-width:200px;direction:ltr;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:14px;color:#1a1a2e;">${sp.household_id}</strong>
        <span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:#fff;
              background:${sampleStatusColor(sp.status)};">${sp.status}</span>
      </div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <tr><td style="color:#888;padding:3px 8px 3px 0;white-space:nowrap;">District / المنطقة</td>
            <td style="padding:3px 0;">${sp.district || '—'}</td></tr>
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Region / المنطقة</td>
            <td>${sp.region || '—'}</td></tr>
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Coordinates / الإحداثيات</td>
            <td style="font-family:monospace;font-size:11px;">${sp.latitude?.toFixed(6)}, ${sp.longitude?.toFixed(6)}</td></tr>
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Validation / التحقق</td>
            <td><b style="color:${color};">${sp.validation_status || 'unchecked'}</b></td></tr>
        ${sp.assigned_fw_id ? `<tr><td style="color:#888;padding:3px 8px 3px 0;">Assigned / مُعيَّن إلى</td><td>${sp.assigned_fw_id}</td></tr>` : ''}
        ${sp.notes ? `<tr><td style="color:#888;padding:3px 8px 3px 0;">Notes / ملاحظات</td><td>${sp.notes}</td></tr>` : ''}
      </table>
      ${sp.validation_note ? `<div style="margin-top:6px;padding:4px 8px;background:#fff8e1;border-radius:4px;font-size:11px;color:#e65100;">${sp.validation_note}</div>` : ''}
    </div>
  `;
}

function researcherPopupHTML(rw) {
  const pct = rw.total_samples > 0 ? Math.round((rw.completed_samples / rw.total_samples) * 100) : 0;
  const barColor = rw.in_field ? '#1976d2' : '#ff9800';
  return `
    <div style="font-family:-apple-system,'Segoe UI',sans-serif;min-width:220px;direction:ltr;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:${barColor};color:#fff;
                    display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;">
          ${rw.name?.charAt(0) || '?'}
        </div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#1a1a2e;">${rw.name}</div>
          <div style="font-size:11px;color:#888;">${rw.fw_id}</div>
        </div>
      </div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Status / الحالة</td>
            <td><b style="color:${rw.in_field ? '#2e7d32' : '#e65100'};">
              ${rw.in_field ? 'In Field / في الميدان' : 'Out / خارج الميدان'}</b></td></tr>
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Shift / الوردية</td>
            <td>${rw.shift === 'morning' ? 'Morning / صباحية' : 'Evening / مسائية'}</td></tr>
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Phone / الهاتف</td>
            <td>${rw.phone || '—'}</td></tr>
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Region / المنطقة</td>
            <td>${rw.region || '—'}</td></tr>
        <tr><td style="color:#888;padding:3px 8px 3px 0;">Samples / العينات</td>
            <td><b>${rw.completed_samples || 0}</b> / ${rw.total_samples || 0} (${pct}%)</td></tr>
      </table>
      <div style="margin-top:8px;height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width 0.3s;"></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#999;font-family:monospace;">
        ${rw.latitude?.toFixed(6) || '—'}, ${rw.longitude?.toFixed(6) || '—'}
      </div>
    </div>
  `;
}

// ─── Legend ────────────────────────────────────────────────────────

function LegendItem({ color, label, shape }) {
  const isPin = shape === 'pin';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#444' }}>
      {isPin ? (
        <svg width="10" height="14" viewBox="0 0 10 14">
          <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 9 5 9s5-5.25 5-9C10 2.24 7.76 0 5 0z" fill={color}/>
        </svg>
      ) : (
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, border: '1.5px solid #fff', boxShadow: `0 0 0 1px ${color}66` }} />
      )}
      {label}
    </div>
  );
}

function validationColor(validationStatus, sampleStatus) {
  if (sampleStatus === 'completed') return '#2e7d32';
  if (validationStatus === 'valid') return '#2e7d32';
  if (validationStatus === 'warning') return '#f9a825';
  if (validationStatus === 'invalid') return '#c62828';
  return '#78909c';
}

function sampleStatusColor(status) {
  if (status === 'completed') return '#2e7d32';
  if (status === 'pending') return '#1976d2';
  if (status === 'invalid') return '#c62828';
  return '#78909c';
}

// ═══════════════════════════════════════════════════════════════════
// Researchers Tab
// ═══════════════════════════════════════════════════════════════════

function ResearchersTab({ researchers }) {
  if (researchers.length === 0) {
    return <div style={s.emptyTab}>No researchers assigned. Upload a CSV in the Upload tab.</div>;
  }

  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>FW ID</th>
            <th style={s.th}>Name</th>
            <th style={s.th}>Phone</th>
            <th style={s.th}>Region</th>
            <th style={s.th}>Shift</th>
            <th style={s.th}>Field Status</th>
            <th style={s.th}>Samples</th>
            <th style={s.th}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {researchers.map((rw) => {
            const pct = rw.total_samples > 0 ? Math.round((rw.completed_samples / rw.total_samples) * 100) : 0;
            return (
              <tr key={rw.fw_id || rw.id} style={s.tr}>
                <td style={s.td}><span style={s.mono}>{rw.fw_id}</span></td>
                <td style={s.td}>{rw.name}</td>
                <td style={s.td}>{rw.phone || '—'}</td>
                <td style={s.td}>{rw.region || '—'}</td>
                <td style={s.td}>
                  <span style={{ ...s.shiftBadge, backgroundColor: rw.shift === 'morning' ? '#fff3e0' : '#e8eaf6', color: rw.shift === 'morning' ? '#e65100' : '#283593' }}>
                    {rw.shift}
                  </span>
                </td>
                <td style={s.td}>
                  <span style={{ color: rw.in_field ? '#2e7d32' : '#999', fontWeight: 600, fontSize: '12px' }}>
                    {rw.in_field ? 'In Field' : 'Out'}
                  </span>
                </td>
                <td style={s.td}>{rw.completed_samples || 0} / {rw.total_samples || 0}</td>
                <td style={s.td}>
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${pct}%` }} />
                  </div>
                  <span style={{ fontSize: '10px', color: '#888' }}>{pct}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Samples Tab
// ═══════════════════════════════════════════════════════════════════

function SamplesTab({ samples }) {
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = statusFilter === 'all' ? samples : samples.filter((sp) => sp.status === statusFilter);

  if (samples.length === 0) {
    return <div style={s.emptyTab}>No sample points. Upload a CSV in the Upload tab.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '4px' }}>
        {['all', 'pending', 'completed', 'invalid', 'skipped'].map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            style={{ ...s.filterBtn, ...(statusFilter === f ? s.filterActive : {}) }}
          >
            {f === 'all' ? `All (${samples.length})` : `${f} (${samples.filter((sp) => sp.status === f).length})`}
          </button>
        ))}
      </div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Household ID</th>
              <th style={s.th}>Latitude</th>
              <th style={s.th}>Longitude</th>
              <th style={s.th}>District</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Validation</th>
              <th style={s.th}>Assigned To</th>
              <th style={s.th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((sp) => (
              <tr key={sp.sample_id || sp.household_id} style={s.tr}>
                <td style={s.td}><span style={s.mono}>{sp.household_id}</span></td>
                <td style={s.td}>{sp.latitude?.toFixed(6)}</td>
                <td style={s.td}>{sp.longitude?.toFixed(6)}</td>
                <td style={s.td}>{sp.district || '—'}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, backgroundColor: sampleStatusColor(sp.status) }}>{sp.status}</span>
                </td>
                <td style={s.td}>
                  <span style={{ color: validationColor(sp.validation_status, 'pending'), fontWeight: 600, fontSize: '12px' }}>
                    {sp.validation_status || 'unchecked'}
                  </span>
                </td>
                <td style={s.td}>{sp.assigned_fw_id || '—'}</td>
                <td style={s.td} title={sp.validation_note || sp.notes || ''}>{(sp.notes || '').slice(0, 30)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Upload Tab
// ═══════════════════════════════════════════════════════════════════

function UploadTab({ projectId, onUploaded }) {
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUploadSamples = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setError(''); setMsg('');
    try {
      const result = await uploadSamplePoints(projectId, file);
      setMsg(`Uploaded ${result.inserted ?? '?'} sample points`);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleUploadResearchers = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setError(''); setMsg('');
    try {
      const result = await uploadResearchers(projectId, file);
      setMsg(`Uploaded ${result.inserted ?? '?'} researchers`);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleValidate = async () => {
    setUploading(true); setError(''); setMsg('');
    try {
      await validateProjectSamples(projectId);
      setMsg('Validation complete');
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '500px' }}>
      {msg && <div style={s.successMsg}>{msg}</div>}
      {error && <div style={s.errorMsg}>{error}</div>}

      <div style={s.uploadSection}>
        <h4 style={s.uploadTitle}>Sample Points CSV</h4>
        <p style={s.uploadHint}>
          Columns: household_id, latitude, longitude, district, region, notes.{' '}
          <a href="/api/projects/templates/sample-points" download style={s.link}>Download template</a>
        </p>
        <label style={s.uploadBtn}>
          {uploading ? 'Uploading…' : 'Choose file'}
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUploadSamples} disabled={uploading} />
        </label>
      </div>

      <div style={s.uploadSection}>
        <h4 style={s.uploadTitle}>Researchers CSV</h4>
        <p style={s.uploadHint}>
          Columns: fw_id, name, phone, email, home_location, region, shift.{' '}
          <a href="/api/projects/templates/researchers" download style={s.link}>Download template</a>
        </p>
        <label style={s.uploadBtn}>
          {uploading ? 'Uploading…' : 'Choose file'}
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUploadResearchers} disabled={uploading} />
        </label>
      </div>

      <div style={s.uploadSection}>
        <h4 style={s.uploadTitle}>Validate Coordinates</h4>
        <p style={s.uploadHint}>Run smart validation on all sample points using reverse geocoding (Nominatim).</p>
        <button onClick={handleValidate} disabled={uploading} style={s.validateBtn}>
          {uploading ? 'Validating…' : 'Run Validation'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════════════

function MiniStat({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '60px' }}>
      <div style={{ fontSize: '24px', fontWeight: 800, color: accent || '#1a1a2e', lineHeight: 1.1, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function statusColor(status) {
  if (status === 'active') return '#2e7d32';
  if (status === 'completed') return '#6a1b9a';
  return '#e65100';
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const s = {
  page: { padding: '16px 24px 24px', maxWidth: '1600px', margin: '0 auto', backgroundColor: '#f5f6fa', minHeight: '100vh' },
  loading: { padding: '80px', textAlign: 'center', color: '#888', fontSize: '14px' },

  // Header
  headerBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 24px', marginBottom: '0',
    backgroundColor: '#fff', borderRadius: '12px 12px 0 0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    flexWrap: 'wrap', gap: '12px',
  },
  headerLeft: { flex: 1, minWidth: '280px' },
  back: { color: '#1976d2', textDecoration: 'none', fontSize: '12px', fontWeight: 600, letterSpacing: '0.3px' },
  titleRow: { display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0 6px' },
  title: { margin: 0, fontSize: '20px', fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.5px' },
  statusBadge: { padding: '3px 12px', borderRadius: '12px', color: '#fff', fontSize: '11px', fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.3px' },
  metaRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  metaChip: { fontSize: '12px', color: '#555', fontWeight: 500 },
  metaDate: { fontSize: '12px', color: '#888', fontFamily: 'monospace' },
  metaId: { fontSize: '11px', color: '#aaa', fontFamily: 'monospace' },
  metaDivider: { width: '1px', height: '12px', backgroundColor: '#ddd', display: 'inline-block' },
  headerStats: { display: 'flex', gap: '24px', alignItems: 'center' },

  // Tabs
  tabs: { display: 'flex', gap: '0', backgroundColor: '#fff', borderBottom: '2px solid #e8eaef' },
  tab: {
    padding: '12px 28px', border: 'none', backgroundColor: 'transparent',
    cursor: 'pointer', fontSize: '13px', color: '#888', borderBottom: '2px solid transparent',
    marginBottom: '-2px', fontWeight: 600, letterSpacing: '0.3px',
    transition: 'color 0.2s, border-color 0.2s',
  },
  tabActive: { color: '#1565c0', borderBottomColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.03)' },

  // Content areas
  content: { backgroundColor: '#fff', borderRadius: '0 0 12px 12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  contentMap: { backgroundColor: '#fff', borderRadius: '0 0 12px 12px', padding: '0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' },

  // Map container — maximized viewport
  mapContainer: {
    position: 'relative',
    height: 'calc(100vh - 200px)',
    minHeight: '600px',
    borderRadius: '0 0 12px 12px',
    overflow: 'hidden',
  },

  // Toggle panel
  togglePanel: {
    position: 'absolute', top: '12px', right: '56px', backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: '10px', padding: '14px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)',
    zIndex: 5, backdropFilter: 'blur(8px)', minWidth: '200px',
    border: '1px solid rgba(255,255,255,0.6)',
  },
  toggleTitle: { fontSize: '10px', fontWeight: 800, color: '#1a1a2e', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1.2px' },
  scrubberPanel: {
    position: 'absolute', bottom: '12px', right: '12px', backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: '8px', padding: '10px 14px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    zIndex: 5, width: '220px',
  },
  scrubberBtn: {
    padding: '4px 12px', fontSize: '10px', fontWeight: 700, border: '1px solid #d0d5dd',
    borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer', color: '#333',
    letterSpacing: '0.3px',
  },

  // Researcher info panel (floating on map)
  researcherPanel: {
    position: 'absolute', top: '12px', left: '12px', width: '300px',
    backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08)', overflow: 'hidden', zIndex: 5,
    backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.6)',
  },
  rpHeader: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px',
    borderBottom: '1px solid #eee', position: 'relative',
  },
  rpAvatar: {
    width: '38px', height: '38px', borderRadius: '50%', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '16px', flexShrink: 0,
  },
  rpName: { fontSize: '14px', fontWeight: 700, color: '#1a1a2e' },
  rpId: { fontSize: '11px', color: '#888' },
  rpClose: {
    position: 'absolute', top: '10px', right: '10px', border: 'none',
    background: 'none', cursor: 'pointer', fontSize: '16px', color: '#aaa',
    padding: '2px 6px', borderRadius: '4px',
  },
  rpBody: { padding: '12px 16px' },
  rpRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' },
  rpLabel: { color: '#888' },
  rpProgressOuter: { height: '5px', backgroundColor: '#e0e0e0', borderRadius: '3px', overflow: 'hidden', margin: '6px 0' },
  rpProgressInner: { height: '100%', backgroundColor: '#1976d2', borderRadius: '3px', transition: 'width 0.3s' },

  // Legend
  legend: {
    position: 'absolute', bottom: '12px', left: '12px', backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: '10px', padding: '14px 18px', fontSize: '11px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: '5px',
    zIndex: 4, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.6)',
  },
  legendTitle: { fontWeight: 800, fontSize: '12px', color: '#1a1a2e', marginBottom: '4px', letterSpacing: '-0.3px' },
  legendSection: { fontWeight: 700, fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' },

  // Tables
  emptyTab: { padding: '40px', textAlign: 'center', color: '#999', fontSize: '13px' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #eee', color: '#666', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '8px 10px', whiteSpace: 'nowrap' },
  mono: { fontFamily: 'monospace', fontSize: '12px' },
  shiftBadge: { padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' },
  progressBar: { width: '60px', height: '6px', backgroundColor: '#e0e0e0', borderRadius: '3px', display: 'inline-block', overflow: 'hidden', marginRight: '6px', verticalAlign: 'middle' },
  progressFill: { height: '100%', backgroundColor: '#1976d2', borderRadius: '3px', transition: 'width 0.3s' },
  filterBtn: {
    padding: '4px 12px', border: '1px solid #ddd', borderRadius: '4px',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: '11px', color: '#666', textTransform: 'capitalize',
  },
  filterActive: { backgroundColor: '#1976d2', color: '#fff', borderColor: '#1976d2' },

  // Upload
  uploadSection: { marginBottom: '24px', padding: '16px', border: '1px solid #eee', borderRadius: '8px' },
  uploadTitle: { margin: '0 0 6px', fontSize: '14px', color: '#333' },
  uploadHint: { fontSize: '12px', color: '#888', margin: '0 0 12px' },
  uploadBtn: {
    display: 'inline-block', padding: '6px 18px', backgroundColor: '#f5f5f5',
    border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer',
    fontSize: '12px', color: '#555',
  },
  validateBtn: {
    padding: '6px 18px', backgroundColor: '#1976d2', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
  },
  link: { color: '#1976d2' },
  successMsg: { padding: '10px 14px', backgroundColor: '#e8f5e9', color: '#2e7d32', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' },
  errorMsg: { padding: '10px 14px', backgroundColor: '#fce4ec', color: '#c62828', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' },
};
