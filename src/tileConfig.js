/**
 * Tile server configuration — Phase 10: Map Fidelity, Terrain, Dark Mode
 *
 * Internal tile server proxied through Nginx at /tiles/.
 * Falls back to OpenFreeMap + AWS Terrarium if internal tiles are unavailable.
 */
import maplibregl from 'maplibre-gl';

// Patch MapLibre's internal task queue to silently skip re-entrant run() calls
// instead of throwing "Attempting to run(), but is already running."
// This is a known issue: ResizeObserver triggers redraw() during an active frame.
try {
  const mapProto = maplibregl.Map.prototype;
  const origRedraw = mapProto.redraw;
  mapProto.redraw = function () {
    try { return origRedraw.call(this); } catch (e) {
      if (e.message && e.message.includes('already running')) return this;
      throw e;
    }
  };
} catch { /* patch failed — non-critical */ }

// ── URLs ──────────────────────────────────────────────────────────────────────

const TILE_SERVER_BASE = process.env.REACT_APP_TILE_SERVER_URL || '/tiles';
const TILE_FALLBACK_URL = process.env.REACT_APP_TILE_FALLBACK_URL || 'https://tiles.openfreemap.org/styles/liberty';

export const SCAD_STYLE_URL = `${TILE_SERVER_BASE}/styles/scad-map/style.json`;
export const SCAD_DARK_STYLE_URL = `${TILE_SERVER_BASE}/styles/scad-map-dark/style.json`;
export const FALLBACK_STYLE_URL = TILE_FALLBACK_URL;

// RTL text plugin for Arabic label rendering
export const RTL_PLUGIN_URL = '/lib/mapbox-gl-rtl-text.min.js';
export const RTL_PLUGIN_FALLBACK_URL =
  'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/mapbox-gl-rtl-text.min.js';

// ESRI World Imagery — free satellite base layer
export const SATELLITE_TILES_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// AWS Terrarium terrain tiles — free, public domain, no API key
export const FALLBACK_TERRAIN_URL =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

// Building heights patch URL (relative — served as static asset)
const BUILDING_HEIGHTS_URL = '/data/building_heights_patch.json';

// Abu Dhabi coordinates for sun position calculations
const AD_LAT = 24.4539;
const AD_LNG = 54.3773;

// ── Style & Terrain Resolution ───────────────────────────────────────────────

/**
 * Resolves both the map style URL and terrain source.
 * Returns { styleUrl, darkStyleUrl, terrainUrl, isInternal }
 */
export async function resolveMapResources() {
  let isInternal = false;
  let styleUrl = FALLBACK_STYLE_URL;
  let darkStyleUrl = null;

  try {
    const res = await fetch(SCAD_STYLE_URL, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      styleUrl = SCAD_STYLE_URL;
      darkStyleUrl = SCAD_DARK_STYLE_URL;
      isInternal = true;
    }
  } catch { /* tile server unavailable */ }

  // Terrain: internal if tile server available, else AWS Terrarium
  const terrainUrl = isInternal
    ? `${TILE_SERVER_BASE}/data/uae-terrain.json`
    : null; // AWS tiles added directly as source, not via TileJSON

  return { styleUrl, darkStyleUrl, terrainUrl, isInternal };
}

// Keep legacy export for backward compat
export async function resolveStyleURL() {
  const { styleUrl } = await resolveMapResources();
  return styleUrl;
}

// ── RTL Plugin ────────────────────────────────────────────────────────────────

export async function resolveRTLPluginURL() {
  try {
    const res = await fetch(RTL_PLUGIN_URL, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    if (res.ok) return RTL_PLUGIN_URL;
  } catch { /* local unavailable */ }
  return RTL_PLUGIN_FALLBACK_URL;
}

let rtlInitPromise = null;
export function initRTLPlugin(mgl) {
  if (!mgl) mgl = maplibregl;
  if (rtlInitPromise) return rtlInitPromise;
  const status = mgl.getRTLTextPluginStatus();
  if (status === 'loaded' || status === 'loading') {
    rtlInitPromise = Promise.resolve();
    return rtlInitPromise;
  }
  rtlInitPromise = resolveRTLPluginURL().then((url) => {
    if (mgl.getRTLTextPluginStatus() === 'unavailable') {
      mgl.setRTLTextPlugin(url, true);
    }
  });
  return rtlInitPromise;
}

// ── Satellite Imagery ─────────────────────────────────────────────────────────

export function addSatelliteImagery(map) {
  if (map.getSource('satellite-imagery')) return;

  map.addSource('satellite-imagery', {
    type: 'raster',
    tiles: [SATELLITE_TILES_URL],
    tileSize: 256,
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
  });

  const style = map.getStyle();
  const layers = style.layers || [];

  layers.forEach((l) => {
    try {
      const id = l.id;
      const t = l.type;

      // Skip building layers entirely — enable3DBuildings handles them
      if (id.toLowerCase().includes('building')) return;
      // Keep text/symbol labels visible
      if (t === 'symbol') return;
      // Keep fill-extrusion layers (buildings)
      if (t === 'fill-extrusion') return;

      if (id === 'background') { map.setPaintProperty(id, 'background-opacity', 0); return; }
      if (id === 'natural_earth') { map.setPaintProperty(id, 'raster-opacity', 0); return; }

      // Hide vector fill layers (landuse, water, etc) since satellite replaces them
      if (t === 'fill') { map.setPaintProperty(id, 'fill-opacity', 0); return; }

      // Dim roads to subtle white overlay on satellite
      if (t === 'line' && (id.startsWith('road') || id.startsWith('bridge') || id.startsWith('tunnel'))) {
        if (id.includes('_casing') || id.includes('_hatching')) {
          map.setPaintProperty(id, 'line-opacity', 0);
        } else {
          map.setPaintProperty(id, 'line-opacity', 0.35);
          map.setPaintProperty(id, 'line-color', 'rgba(255,255,255,0.7)');
          map.setPaintProperty(id, 'line-width', 0.8);
        }
        return;
      }

      // Hide waterway/boundary lines
      if (t === 'line' && (id.startsWith('waterway') || id.startsWith('aeroway') || id.startsWith('boundary'))) {
        map.setPaintProperty(id, 'line-opacity', 0);
        return;
      }

      if (t === 'line') { map.setPaintProperty(id, 'line-opacity', 0.2); }
    } catch { /* skip */ }
  });

  const insertBefore = layers.find((l) => l.id !== 'background' && l.id !== 'natural_earth');
  map.addLayer({
    id: 'satellite-imagery-layer',
    type: 'raster',
    source: 'satellite-imagery',
    paint: {
      'raster-opacity': 1,
      'raster-brightness-min': 0.04,
      'raster-contrast': 0.12,
      'raster-saturation': 0.18,
    },
  }, insertBefore ? insertBefore.id : undefined);
}

// ── 3D Buildings ─────────────────────────────────────────────────────────────

export function enable3DBuildings(map) {
  const style = map.getStyle();
  if (!style) return;

  const hasSatellite = !!map.getSource('satellite-imagery');
  const heightExpr = ['coalesce', ['get', 'render_height'], ['get', 'height'], 30];

  // Strategy: enhance the existing built-in building layers from the style
  // OpenFreeMap liberty has: 'building' (fill, z13-14) and 'building-3d' (fill-extrusion, z14+)
  const layers = style.layers || [];
  let hasBuiltIn3D = false;

  layers.forEach((layer) => {
    if (!layer.id) return;
    const id = layer.id;

    try {
      // Enhance existing fill-extrusion building layer
      if (id === 'building-3d' || (id.includes('building') && layer.type === 'fill-extrusion')) {
        hasBuiltIn3D = true;
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'fill-extrusion-height', heightExpr);
        map.setPaintProperty(id, 'fill-extrusion-base', ['coalesce', ['get', 'render_min_height'], 0]);
        map.setPaintProperty(id, 'fill-extrusion-opacity', 0.85);
        // Lower minzoom so buildings appear earlier
        map.setLayerZoomRange(id, 13, 24);

        if (hasSatellite) {
          map.setPaintProperty(id, 'fill-extrusion-color', [
            'interpolate', ['linear'], heightExpr,
            0, '#8a9bae',
            30, '#7a8fa5',
            60, '#6a82a0',
            120, '#5a7599',
            250, '#4a6890',
            400, '#3a5a85',
          ]);
        }
        return;
      }

      // Enhance existing flat building layer — keep it visible for z13
      if (id === 'building' || (id.includes('building') && layer.type === 'fill')) {
        if (hasSatellite) {
          map.setPaintProperty(id, 'fill-color', 'rgba(100,120,150,0.3)');
        }
        map.setPaintProperty(id, 'fill-opacity', 0.6);
        return;
      }
    } catch { /* skip */ }
  });

  // Fallback: if no built-in 3D layer found, create one
  if (!hasBuiltIn3D && !map.getLayer('scad-3d-buildings')) {
    const sources = style.sources || {};
    const vectorSrc = Object.keys(sources).find((id) => sources[id].type === 'vector');
    if (!vectorSrc) return;

    try {
      map.addLayer({
        id: 'scad-3d-buildings',
        source: vectorSrc,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': hasSatellite ? '#7a8fa5' : '#ddd8d2',
          'fill-extrusion-height': heightExpr,
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.85,
        },
      });
    } catch { /* skip */ }
  }
}

// ── Dynamic Sun Position ──────────────────────────────────────────────────────

/**
 * Calculates solar position for Abu Dhabi at the current time.
 * Returns { altitude, azimuth, intensity } for map.setLight()
 */
export function calculateSunPosition() {
  const now = new Date();
  // Abu Dhabi is UTC+4
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const localHours = (utcHours + 4) % 24;

  // Day of year
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const dayOfYear = Math.floor(diff / 86400000);

  // Solar declination (approximation)
  const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
  const decRad = declination * Math.PI / 180;
  const latRad = AD_LAT * Math.PI / 180;

  // Hour angle (15° per hour from solar noon ~12:20 local)
  const solarNoon = 12 + (54.3773 - 54) / 15; // rough correction
  const hourAngle = (localHours - solarNoon) * 15;
  const haRad = hourAngle * Math.PI / 180;

  // Solar altitude
  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI;

  // Solar azimuth
  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(Math.asin(sinAlt)));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  // Intensity: 0.2 at night, ramp up with sun altitude, max 0.6
  const intensity = Math.max(0.2, Math.min(0.6, altitude / 90 * 0.6));

  return { altitude: Math.max(0, altitude), azimuth, intensity };
}

/**
 * Applies dynamic sun lighting to the map and sets up auto-refresh.
 * Returns a cleanup function to stop the interval.
 */
export function enableDynamicSun(map) {
  const apply = () => {
    try {
      const { altitude, azimuth, intensity } = calculateSunPosition();
      // MapLibre light position: [radial, azimuthal, polar]
      const polar = Math.max(10, 90 - altitude);
      map.setLight({
        anchor: 'viewport',
        color: altitude > 0 ? '#ffffff' : '#b0c4de',
        intensity,
        position: [1.5, azimuth, polar],
      });
    } catch { /* ignore */ }
  };

  apply();
  const interval = setInterval(apply, 10 * 60 * 1000); // every 10 minutes
  return () => clearInterval(interval);
}

// ── Building Height Patch Injector ────────────────────────────────────────────

let _heightPatchData = null;

async function _loadHeightPatch() {
  if (_heightPatchData) return _heightPatchData;
  try {
    const res = await fetch(BUILDING_HEIGHTS_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      _heightPatchData = await res.json();
      return _heightPatchData;
    }
  } catch { /* patch not available — use default heights */ }
  return [];
}

/**
 * Injects landmark building heights as a GeoJSON overlay source.
 * Buildings near patch coordinates get their heights overridden.
 */
export async function injectBuildingHeights(map) {
  const patches = await _loadHeightPatch();
  if (!patches.length) return;

  // Add landmark buildings as a separate GeoJSON source with accurate heights
  const features = patches.map((p) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [p.lng, p.lat],
    },
    properties: {
      name: p.name,
      name_ar: p.name_ar || '',
      height_m: p.height_m,
      radius_m: p.radius_m || 30,
    },
  }));

  if (!map.getSource('landmark-buildings')) {
    map.addSource('landmark-buildings', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });

    // Render landmark buildings as tall extruded circles
    map.addLayer({
      id: 'landmark-buildings-3d',
      source: 'landmark-buildings',
      type: 'circle',
      minzoom: 11,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          11, 2,
          14, ['get', 'radius_m'],
          16, ['*', ['get', 'radius_m'], 1.5],
        ],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'height_m'],
          100, '#4a90d9',
          200, '#3a7bd5',
          300, '#2563eb',
          400, '#1d4ed8',
        ],
        'circle-opacity': [
          'interpolate', ['linear'], ['zoom'],
          11, 0.3,
          14, 0.6,
          16, 0.8,
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.5,
      },
    });

    // Add landmark labels
    map.addLayer({
      id: 'landmark-labels',
      source: 'landmark-buildings',
      type: 'symbol',
      minzoom: 13,
      layout: {
        'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'height_m']], 'm'],
        'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 12],
        'text-anchor': 'top',
        'text-offset': [0, 1],
        'text-max-width': 10,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#1a1a2e',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    });
  }
}

// ── Terrain Injection ─────────────────────────────────────────────────────────

/**
 * Adds terrain to the map — uses internal tiles if available, else AWS Terrarium.
 */
export function enableTerrain(map, internalTerrainUrl) {
  try {
    if (map.getSource('terrain-src')) return;

    if (internalTerrainUrl) {
      // Self-hosted terrain via TileJSON
      map.addSource('terrain-src', {
        type: 'raster-dem',
        url: internalTerrainUrl,
        tileSize: 256,
      });
    } else {
      // AWS Terrarium fallback
      map.addSource('terrain-src', {
        type: 'raster-dem',
        tiles: [FALLBACK_TERRAIN_URL],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
      });
    }

    map.setTerrain({ source: 'terrain-src', exaggeration: 1.2 });
  } catch { /* terrain not supported or already set */ }
}

// ── Sky Layer Injection ───────────────────────────────────────────────────────

export function enableSkyLayer(map, isDark) {
  try {
    if (map.getLayer('scad-sky')) return;

    map.addLayer({
      id: 'scad-sky',
      type: 'sky',
      paint: {
        'sky-type': 'atmosphere',
        'sky-atmosphere-color': isDark ? '#1a2535' : '#6baed6',
        'sky-atmosphere-halo-color': isDark ? '#0f1923' : '#d4e4f0',
        'sky-atmosphere-sun': [0, 90],
        'sky-atmosphere-sun-intensity': isDark ? 2 : 5,
      },
    });
  } catch { /* sky layer not supported */ }
}

// ── Arabic Labels ─────────────────────────────────────────────────────────────

export function enableArabicLabels(map) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach((layer) => {
    if (layer.layout && layer.layout['text-field']) {
      try {
        map.setLayoutProperty(layer.id, 'text-field', [
          'coalesce', ['get', 'name:ar'], ['get', 'name'],
        ]);
      } catch { /* skip */ }
    }
  });
}

// ── Theme Management ──────────────────────────────────────────────────────────

export function getTheme() {
  const stored = localStorage.getItem('scad-theme');
  if (stored) return stored;
  // Default to dark for ops room
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'dark';
}

export function setTheme(theme) {
  localStorage.setItem('scad-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

// ── Unified Map Initialiser ───────────────────────────────────────────────────

/**
 * initSCADMap — single entry point for all map views.
 *
 * @param {HTMLElement} container — DOM element to render into
 * @param {Object} config
 *   @param {boolean} config.satellite — add ESRI satellite base layer
 *   @param {number}  config.maxPitch — max pitch (default 60)
 *   @param {number}  config.zoom — initial zoom (default 11)
 *   @param {number}  config.pitch — initial pitch (default 45)
 *   @param {number}  config.bearing — initial bearing (default -17.6)
 *   @param {boolean} config.terrain — enable terrain (default true)
 *   @param {boolean} config.dynamicSun — enable dynamic sun (default true)
 *   @param {boolean} config.buildings3D — enable 3D buildings (default true)
 *   @param {boolean} config.arabicLabels — enable Arabic labels (default true)
 *   @param {boolean} config.heightPatch — inject landmark heights (default true)
 *   @param {boolean} config.sky — add sky layer (default true)
 *   @param {string}  config.theme — 'light' or 'dark' (default from getTheme())
 *   @param {Function} config.onLoad — callback when map is fully loaded
 *   @param {Function} config.onStyleLoad — callback on each style.load event
 *
 * @returns {{ map, cleanup }}
 *   map — the maplibregl.Map instance
 *   cleanup — function to call on unmount (stops sun interval, removes map)
 */
export function initSCADMap(container, config = {}) {
  const {
    satellite = false,
    maxPitch = 60,
    zoom = 14,
    pitch = 55,
    bearing = -17.6,
    terrain = true,
    dynamicSun = true,
    buildings3D = true,
    arabicLabels = true,
    heightPatch = true,
    sky = true,
    theme = getTheme(),
    onLoad = null,
    onStyleLoad = null,
  } = config;

  const isDark = theme === 'dark';
  const cleanups = [];

  // Init RTL plugin
  initRTLPlugin(maplibregl).catch(() => {});

  // Create map immediately with fallback style
  const map = new maplibregl.Map({
    container,
    style: FALLBACK_STYLE_URL,
    center: [AD_LNG, AD_LAT],
    zoom,
    pitch,
    maxPitch,
    bearing,
    antialias: true,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');

  // On every style load — re-apply 3D buildings, labels, satellite, sky
  map.on('style.load', () => {
    try { if (satellite) addSatelliteImagery(map); } catch (e) { console.warn('satellite:', e); }
    try { if (buildings3D) enable3DBuildings(map); } catch (e) { console.warn('3D buildings:', e); }
    try { if (arabicLabels) enableArabicLabels(map); } catch (e) { console.warn('arabic:', e); }
    try { if (sky) enableSkyLayer(map, isDark); } catch (e) { console.warn('sky:', e); }
    try { if (onStyleLoad) onStyleLoad(map); } catch (e) { console.warn('onStyleLoad:', e); }
  });

  // On first load — terrain, sun, height patch, style upgrade
  map.on('load', () => {
    try {
      if (dynamicSun) {
        const stopSun = enableDynamicSun(map);
        cleanups.push(stopSun);
      }
    } catch (e) { console.warn('sun:', e); }

    if (heightPatch) {
      injectBuildingHeights(map).catch((e) => console.warn('heights:', e));
    }

    // Try to upgrade style + add terrain
    resolveMapResources().then(({ styleUrl, terrainUrl, isInternal }) => {
      // Upgrade to self-hosted style if available
      if (isInternal && styleUrl !== FALLBACK_STYLE_URL) {
        map.setStyle(styleUrl);
      }

      // Terrain — defer to avoid render conflict
      if (terrain) {
        setTimeout(() => {
          try { enableTerrain(map, terrainUrl); } catch (e) { console.warn('terrain:', e); }
        }, 500);
      }
    }).catch((e) => console.warn('resources:', e));

    try { if (onLoad) onLoad(map); } catch (e) { console.warn('onLoad:', e); }
  });

  // Error handler to prevent silent failures
  map.on('error', (e) => {
    console.warn('MapLibre error:', e.error?.message || e.message || e);
  });

  const cleanup = () => {
    cleanups.forEach((fn) => fn());
    if (map) map.remove();
  };

  return { map, cleanup };
}
