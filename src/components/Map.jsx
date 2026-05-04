import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';

// Abu Dhabi center coordinates
const ABU_DHABI_CENTER = [54.3773, 24.4539]; // [lng, lat]
const DEFAULT_ZOOM = 12;
const DEFAULT_PITCH = 45; // Tilted view for 3D perspective
const DEFAULT_BEARING = -17.6;

// Free 3D vector tile style with buildings — OpenFreeMap
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * 3D MapLibre GL map centered on Abu Dhabi, UAE.
 * Shows researcher locations as markers updated in real-time.
 * Supports 3D buildings visible when zooming in, top-down view when zooming out.
 *
 * Props:
 *  - researchers: { [employee_id]: { employee_id, researcher_name, latitude, longitude, ... } }
 *  - selectedResearcher: researcher object or null
 *  - onSelectResearcher: (researcher) => void
 */
export default function Map({ researchers, selectedResearcher, onSelectResearcher }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({}); // employee_id -> maplibregl.Marker
  const popupRef = useRef(null);

  // Initialize the map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: ABU_DHABI_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      antialias: true,
      maxBounds: [
        [51.5, 22.5],  // SW corner — UAE region
        [56.5, 26.5],  // NE corner — UAE region
      ],
    });

    // Navigation controls (zoom, rotate, pitch)
    map.addControl(new maplibregl.NavigationControl({
      visualizePitch: true,
    }), 'top-right');

    // Scale bar
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Add 3D building extrusions when style loads
    map.on('style.load', () => {
      add3DBuildings(map);
    });

    // Adjust pitch dynamically based on zoom for best 3D experience:
    // - Zoomed in (>15): high pitch (60°) — see buildings from the side
    // - Mid zoom (10-15): moderate pitch (45°) — overview with 3D depth
    // - Zoomed out (<10): low pitch (20°) — more top-down
    map.on('zoom', () => {
      const zoom = map.getZoom();
      let targetPitch;
      if (zoom >= 15) {
        targetPitch = 60;
      } else if (zoom >= 10) {
        targetPitch = 45;
      } else {
        targetPitch = 20;
      }
      // Only auto-adjust if user hasn't manually set pitch
      if (Math.abs(map.getPitch() - targetPitch) > 15) {
        map.easeTo({ pitch: targetPitch, duration: 300 });
      }
    });

    mapRef.current = map;

    return () => {
      // Cleanup markers
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when researchers change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const researcherList = Object.values(researchers);
    const currentIds = new Set(researcherList.map((r) => r.employee_id));

    // Remove markers for researchers no longer in the list
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add or update markers
    researcherList.forEach((r) => {
      if (!r.latitude || !r.longitude) return;

      const isSelected = selectedResearcher?.employee_id === r.employee_id;

      if (markersRef.current[r.employee_id]) {
        // Update existing marker position
        markersRef.current[r.employee_id].setLngLat([r.longitude, r.latitude]);
        // Update marker element style for selection
        const el = markersRef.current[r.employee_id].getElement();
        el.style.background = isSelected ? '#1976d2' : '#4caf50';
        el.style.width = isSelected ? '18px' : '14px';
        el.style.height = isSelected ? '18px' : '14px';
        el.style.boxShadow = isSelected
          ? '0 0 0 4px rgba(25,118,210,0.3), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 0 0 3px rgba(76,175,80,0.3), 0 2px 6px rgba(0,0,0,0.2)';
      } else {
        // Create new marker
        const el = document.createElement('div');
        Object.assign(el.style, {
          width: isSelected ? '18px' : '14px',
          height: isSelected ? '18px' : '14px',
          borderRadius: '50%',
          background: isSelected ? '#1976d2' : '#4caf50',
          border: '2px solid #fff',
          cursor: 'pointer',
          boxShadow: isSelected
            ? '0 0 0 4px rgba(25,118,210,0.3), 0 2px 8px rgba(0,0,0,0.3)'
            : '0 0 0 3px rgba(76,175,80,0.3), 0 2px 6px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease',
        });

        // Pulse animation for active researchers
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.3)';
        });
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
        });

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectResearcher(r);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([r.longitude, r.latitude])
          .addTo(map);

        markersRef.current[r.employee_id] = marker;
      }
    });
  }, [researchers, selectedResearcher, onSelectResearcher]);

  // Fly to selected researcher
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedResearcher?.latitude || !selectedResearcher?.longitude) return;

    map.flyTo({
      center: [selectedResearcher.longitude, selectedResearcher.latitude],
      zoom: 16,
      pitch: 60,
      bearing: map.getBearing(),
      duration: 1500,
      essential: true,
    });

    // Show popup for selected researcher
    if (popupRef.current) {
      popupRef.current.remove();
    }

    popupRef.current = new maplibregl.Popup({
      offset: 20,
      closeButton: true,
      closeOnClick: false,
      className: 'researcher-popup',
    })
      .setLngLat([selectedResearcher.longitude, selectedResearcher.latitude])
      .setHTML(`
        <div style="font-family: -apple-system, sans-serif; min-width: 160px;">
          <strong style="font-size: 13px;">${selectedResearcher.researcher_name || selectedResearcher.employee_id}</strong>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">
            ${selectedResearcher.latitude.toFixed(6)}, ${selectedResearcher.longitude.toFixed(6)}
          </div>
          <div style="font-size: 10px; color: #999; margin-top: 2px;">
            Updated: ${selectedResearcher.last_update || 'N/A'}
          </div>
        </div>
      `)
      .addTo(map);
  }, [selectedResearcher]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

/**
 * Adds 3D building extrusions to the map.
 * Buildings become visible at zoom >= 14 and grow taller as you zoom in.
 */
function add3DBuildings(map) {
  // Check if the style already has a building layer we can extrude
  const layers = map.getStyle().layers || [];
  const buildingLayer = layers.find(
    (l) => l.id && (l.id.includes('building') || l.id.includes('Building'))
  );

  if (buildingLayer) {
    // If the style has a building layer, modify it for 3D
    try {
      map.setPaintProperty(buildingLayer.id, 'fill-extrusion-height', [
        'interpolate', ['linear'], ['zoom'],
        14, 0,
        16, ['get', 'render_height'],
      ]);
      map.setPaintProperty(buildingLayer.id, 'fill-extrusion-opacity', 0.7);
    } catch {
      // Style may not support these properties — add our own layer
      addCustomBuildingLayer(map);
    }
  } else {
    addCustomBuildingLayer(map);
  }
}

function addCustomBuildingLayer(map) {
  // Add a 3D buildings layer from OpenMapTiles-compatible source
  const sources = map.getStyle().sources || {};
  const vectorSourceId = Object.keys(sources).find(
    (id) => sources[id].type === 'vector'
  );

  if (!vectorSourceId) return;

  try {
    map.addLayer({
      id: '3d-buildings',
      source: vectorSourceId,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'render_height'],
          0, '#e0e0e0',
          50, '#c0c0c0',
          100, '#a0a0a0',
          200, '#808080',
        ],
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          15.5, ['get', 'render_height'],
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          15.5, ['get', 'render_min_height'],
        ],
        'fill-extrusion-opacity': 0.7,
      },
    });
  } catch {
    // Layer or source-layer may not exist in this tileset — fail silently
  }
}
