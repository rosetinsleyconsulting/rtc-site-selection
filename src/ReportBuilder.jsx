import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Globe, Printer, RotateCcw } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { api, area, currency, ErrorScreen, LoadingScreen, PanelBackground, SignOutButton, ThemeToggle, formatAdminDate, usePanelTheme } from './main.jsx';
import './report-builder.css';
import { CHECK_STATUS, assessLayer, defaultRadii, extendBounds, mapFeatures, metres, summarise } from './lib/siteCheck.js';

// One colour per section, reused for its buffer circle on the map and its legend swatch (mock / placeholder
// mode only; with real data the map colours by result instead). Hex values match the --teal/--rye/
// --slate-blue/--forest/--moss/--rose tokens in index.css, since maplibre paint can't read CSS variables.
const SECTION_COLORS = { env: '#638E83', hist: '#B6955B', transport: '#748894', lr: '#454E3A', planning: '#6F8443', comps: '#C58F84' };
const REPORT_BASEMAP = 'https://tiles.openfreemap.org/styles/positron';
const BASEMAP_CREDIT = 'Basemap: OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors';

// Destination-point circle approximation (equirectangular, fine at this scale), no turf dependency needed
// for a visual buffer ring. Returns a GeoJSON Polygon in [lon, lat] pairs.
function circlePolygon(lon, lat, radiusM, points = 64) {
  const earthRadius = 6371000;
  const coords = [];
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = (radiusM * Math.cos(angle)) / (earthRadius * Math.cos((lat * Math.PI) / 180));
    const dy = (radiusM * Math.sin(angle)) / earthRadius;
    coords.push([lon + (dx * 180) / Math.PI, lat + (dy * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

// Sections and the datasets planned for each. Layers that are loaded come from the constraint check
// (meta.layer_registry + meta.site_check() in the site_selection database) and are merged in by
// buildInitialSections. The layers listed here are datasets not loaded yet: they show as "not loaded"
// once real data is present, and stand in as the wireframe in ?mock=1 mode.
// urbanM/ruralM are placeholder defaults until the pilot site sets them (07 Data Methodology).
const SECTION_DEFS = [
  {
    key: 'env', title: 'Environment', question: 'Flood, ecology designations, contamination signals',
    layers: [
      { id: 'flood_zone', label: 'Flood zone proximity (EA Flood Map for Planning)', urbanM: 250, ruralM: 500 },
      { id: 'ancient_woodland', label: 'Ancient woodland', urbanM: 250, ruralM: 500 },
    ],
  },
  {
    key: 'hist', title: 'Heritage', question: 'Listed buildings, conservation areas, scheduled monuments',
    layers: [
      { id: 'listed_building', label: 'Listed buildings', urbanM: 250, ruralM: 250 },
    ],
  },
  {
    key: 'transport', title: 'Transport', question: 'Road access, public transport, drive-time catchment',
    layers: [
      { id: 'access_node', label: 'Bus stops and stations', urbanM: 400, ruralM: 1500 },
      { id: 'isochrone', label: 'Drive-time catchment', urbanM: 15, ruralM: 30, unit: 'min' },
    ],
  },
  {
    key: 'lr', title: 'Land Registry', question: 'Title extent, tenure, registered owner as quoted from the register',
    layers: [
      { id: 'parcel', label: 'Adjoining parcels and ownership', urbanM: 0, ruralM: 0, fixed: true },
    ],
  },
  {
    key: 'planning', title: 'Planning metrics', question: 'Local precedent, approval rates, policy allocations',
    layers: [
      { id: 'application', label: 'Nearby planning applications', urbanM: 500, ruralM: 1000 },
      { id: 'allocation', label: 'Site allocations and policy maps', urbanM: 500, ruralM: 1000 },
    ],
  },
  {
    key: 'comps', title: 'Land comps', question: 'Recent sales and listings nearby',
    layers: [
      { id: 'sale', label: 'Comparable sales', urbanM: 500, ruralM: 2000 },
      { id: 'listing', label: 'Live listings', urbanM: 500, ruralM: 2000 },
    ],
  },
];

const PRESETS = [
  { key: 'urban', label: 'Urban' },
  { key: 'rural', label: 'Rural' },
  { key: 'custom', label: 'Custom' },
];

// meta.layer_registry report_section -> builder section key
const REGISTRY_SECTIONS = { Environment: 'env', Heritage: 'hist', 'Planning metrics': 'planning', Transport: 'transport', 'Land Registry': 'lr', 'Land comps': 'comps' };


// siteCheck is the result of /api/admin/appraisal-requests/:id/site-check, or null (mock mode / check failed),
// in which case the builder behaves as the original wireframe.
const buildInitialSections = siteCheck => SECTION_DEFS.map(section => {
  const loaded = (siteCheck?.layers || [])
    .filter(check => REGISTRY_SECTIONS[check.report_section] === section.key)
    .map(check => ({ id: check.layer, label: check.title, ...defaultRadii(check), check: { ...check, max_m: siteCheck.max_m } }));
  const planned = section.layers.map(layer => ({ ...layer, pending: Boolean(siteCheck) }));
  return {
    ...section,
    narrative: '',
    layers: [...loaded, ...planned].map(layer => ({
      ...layer,
      // Loaded layers start ticked if they hold data; not-yet-loaded ones stay out of the report
      included: layer.check ? layer.check.has_data : !layer.pending,
      value: layer.fixed ? 0 : layer.urbanM,
    })),
  };
});

// Draft: the analyst's choices (ticks, radii, notes, preset) saved in this browser per request, so a reload or
// a slip of the back button doesn't lose an appraisal in progress. Only choices are stored, never site data;
// they are reapplied by layer id onto freshly checked data, so a re-run check is never overwritten.
const draftKey = requestId => `rtc-report-draft-${requestId}`;
const readDraft = requestId => {
  try { return JSON.parse(localStorage.getItem(draftKey(requestId)) || 'null'); } catch { return null; }
};
const applyDraft = (sections, draft) => (!draft?.sections ? sections : sections.map(section => {
  const saved = draft.sections.find(item => item.key === section.key);
  if (!saved) return section;
  return {
    ...section,
    narrative: saved.narrative || '',
    layers: section.layers.map(layer => {
      const choice = saved.layers?.find(item => item.id === layer.id);
      if (!choice || layer.pending) return layer;
      return { ...layer, included: layer.check && !layer.check.has_data ? false : Boolean(choice.included), value: layer.fixed ? 0 : Number(choice.value) || layer.value };
    }),
  };
}));
const draftFrom = (sections, preset) => ({
  savedAt: new Date().toISOString(),
  preset,
  sections: sections.map(section => ({ key: section.key, narrative: section.narrative, layers: section.layers.map(layer => ({ id: layer.id, included: layer.included, value: layer.value })) })),
});

// Result mark: a dot plus an uppercase label, the same pattern as a site's status in the shortlist.
// Solid for findings (on the site, within), hollow for clear, dashed for no data.
function CheckMark({ status, radius }) {
  const meta = CHECK_STATUS[status];
  const label = status === 'within' && radius ? `Within ${metres(radius)}` : status === 'clear' && radius ? `Clear to ${metres(radius)}` : meta.label;
  return <span className={`rb-check-mark is-${status}`} style={{ '--check': meta.colour }}><i aria-hidden="true"/>{label}</span>;
}

// Table pip: the mark without its label. The table's group headings ("On the site", "Within the search area")
// carry the meaning in words, so the result is never shown by colour alone.
function CheckPip({ status }) {
  return <span className={`rb-pip is-${status}`} style={{ '--check': CHECK_STATUS[status].colour }} aria-hidden="true"/>;
}

// Every named feature on the site, then each one inside the search area with its distance
const MAX_DETAIL = 5;
function FindingDetail({ result }) {
  const items = [
    ...result.onSite.map(feature => ({ name: feature.name || 'Unnamed area', note: result.pctCover !== null ? `${result.pctCover}% of site` : 'on the site', onSite: true })),
    ...result.within.map(feature => ({ name: feature.name || 'Unnamed area', note: metres(feature.distance_m) })),
  ];
  const shown = items.slice(0, MAX_DETAIL);
  return <ul className="rb-finding-list">
    {shown.map((item, index) => <li key={`${item.name}-${index}`} className={item.onSite ? 'is-on-site' : ''}><span>{item.name}</span><b>{item.note}</b></li>)}
    {items.length > shown.length && <li className="is-more">and {items.length - shown.length} more within {metres(result.radius)}</li>}
  </ul>;
}

// Layers clear of their search area, in the same grouped style as the findings: a heading that says the result,
// then the layers as pips in columns. Split by whether anything exists within the distance checked, because
// "nearest is 502 m away" and "nothing within 3 km" are different findings for the reader.
function ClearGroups({ rows }) {
  const checkedKm = `${((rows[0]?.layer.check.max_m) || 3000) / 1000} km`;
  const nearby = rows.filter(row => row.result.status === 'clear' && row.result.nearestOutside)
    .sort((a, b) => a.result.nearestOutside.distance_m - b.result.nearestOutside.distance_m);
  const none = rows.filter(row => row.result.status === 'clear' && !row.result.nearestOutside);
  const unknown = rows.filter(row => row.result.status === 'unknown');
  const groups = [
    { key: 'nearby', status: 'clear', title: 'Clear of the search area', note: 'nearest distance', items: nearby, detail: row => metres(row.result.nearestOutside.distance_m) },
    { key: 'none', status: 'clear', title: `Nothing within ${checkedKm}`, items: none },
    { key: 'unknown', status: 'unknown', title: 'No data loaded, so unknown', items: unknown },
  ].filter(group => group.items.length);
  return <div className="rb-clear-groups">
    {groups.map(group => <div key={group.key} className={`rb-clear-group is-${group.key}`}>
      <h4 className="rb-clear-head"><CheckPip status={group.status}/>{group.title}{group.note && <small>{group.note}</small>}</h4>
      <ul className="rb-clear-list">
        {group.items.map(row => <li key={row.layer.id}>
          <CheckPip status={group.status}/><span>{row.layer.label}</span>{group.detail && <b>{group.detail(row)}</b>}
        </li>)}
      </ul>
    </div>)}
  </div>;
}

const narrativePlaceholder = title => `What the data shows for this site's ${title.toLowerCase()} picture, set against the client's criteria. Write it as evidence ("the data indicates…"), not a verdict ("this site is suitable").`;

function PresetToggle({ preset, onChange }) {
  return <div className="rb-preset" role="radiogroup" aria-label="Search radius preset">
    {PRESETS.map(({ key, label }) => <button key={key} type="button" role="radio" aria-checked={preset === key}
      className={`rb-preset-btn ${preset === key ? 'active' : ''}`} onClick={() => key !== 'custom' && onChange(key)} disabled={key === 'custom'}
      title={key === 'custom' ? 'Set automatically when you change any radius' : undefined}>
      {label}
    </button>)}
  </div>;
}

function RadiusControl({ layer, onLayerValue }) {
  const minutes = layer.unit === 'min';
  const [min, max, step] = minutes ? [5, 60, 5] : [50, 3000, 50];
  const clamp = value => Math.min(max, Math.max(min, Math.round(value / step) * step));
  return <div className="rb-layer-range">
    <span>Search within</span>
    <input type="range" min={min} max={max} step={step} value={layer.value} disabled={!layer.included}
      aria-label={`Search radius for ${layer.label}`} onChange={event => onLayerValue(layer.id, Number(event.target.value))}/>
    <label className="rb-layer-number">
      <input type="number" min={min} max={max} step={step} value={layer.value} disabled={!layer.included}
        aria-label={`Search radius for ${layer.label}, in ${minutes ? 'minutes' : 'metres'}`}
        onChange={event => event.target.value !== '' && onLayerValue(layer.id, clamp(Number(event.target.value)))}/>
      <span>{minutes ? 'min' : 'm'}</span>
    </label>
  </div>;
}

function SectionEditor({ section, basis, onToggleLayer, onLayerValue, onNarrative }) {
  return <div className="rb-editor">
    <p className="rb-editor-question">{section.question}</p>
    <div className="rb-layers">
      {section.layers.map(layer => {
        const finding = layer.included ? assessLayer(layer, basis) : null;
        const noData = layer.check && !layer.check.has_data;
        return <div key={layer.id} className={`rb-layer ${layer.included ? '' : 'is-excluded'} ${layer.pending || noData ? 'is-pending' : ''}`}>
          <label className="rb-layer-check">
            <input type="checkbox" checked={layer.included} onChange={() => onToggleLayer(layer.id)} disabled={layer.fixed || layer.pending || noData}/>
            <span>{layer.label}</span>
          </label>
          {layer.pending && <span className="rb-layer-fixed">Not loaded yet, so it can't go in the report</span>}
          {noData && <span className="rb-layer-fixed">No data loaded for this layer</span>}
          {finding && finding.status !== 'unknown' && <p className="rb-layer-finding"><CheckMark status={finding.status} radius={finding.radius}/><span>{finding.headline}</span></p>}
          {!layer.fixed && !layer.pending && !noData && layer.included && <RadiusControl layer={layer} onLayerValue={onLayerValue}/>}
          {layer.fixed && !layer.pending && <span className="rb-layer-fixed">Site-level, no search radius</span>}
        </div>;
      })}
    </div>
    <label className="rb-narrative">
      <span>Analyst notes</span>
      <textarea rows={6} value={section.narrative} placeholder={narrativePlaceholder(section.title)} onChange={event => onNarrative(event.target.value)}/>
    </label>
  </div>;
}

// Read-only report map. The live map is what Playwright will eventually print for the PDF (see 08 Portal
// Appraisal Request Workflow.md), so this is the same component on screen and in print. With constraint data
// it draws the actual constraint shapes, coloured by result (on the site, within the search area, nearby
// outside it), under one labelled dashed ring per search radius. Without data (mock / placeholder layers) it
// falls back to one ring per layer, coloured by section.
const MAP_STATUS = {
  'on-site': { fill: CHECK_STATUS['on-site'].colour, fillOpacity: 0.34, line: CHECK_STATUS['on-site'].colour, text: '#8E2B2B', label: CHECK_STATUS['on-site'].label },
  within: { fill: CHECK_STATUS.within.colour, fillOpacity: 0.3, line: CHECK_STATUS.within.ink, text: '#6B5410', label: CHECK_STATUS.within.label },
  outside: { fill: '#74786D', fillOpacity: 0.2, line: '#5F6358', text: '#45493F', label: 'Nearby, outside the search area' },
};
// Nearest-outside features are framed on the map when they sit within this distance, so close context shows
// without every clear layer pulling the map out to the full 3 km checked
const contextLimit = widestRadius => Math.max(1000, 2 * widestRadius);

function ReportMap({ site, section, boundary }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const fitRef = useRef(() => {});
  const [ready, setReady] = useState(false);
  // Only layer ticks and radii change what the map draws; typing notes must not refit it
  const layerKey = section.layers.map(layer => `${layer.id}:${layer.included ? layer.value : '-'}`).join('|');
  const layers = useMemo(() => section.layers.filter(layer => layer.included && !layer.fixed), [layerKey]);
  const checked = useMemo(() => layers.filter(layer => layer.check), [layers]);
  const features = useMemo(() => mapFeatures(checked), [checked]);
  // A boundary is measured from its edge, so the ring sits further out by roughly the site's own radius
  const siteRadius = boundary?.area_m2 ? Math.sqrt(boundary.area_m2 / Math.PI) : 0;

  const circles = useMemo(() => {
    if (!site?.lat || !site?.lon) return [];
    if (checked.length) {
      // One neutral ring per distinct search radius, labelled with its distance on the map itself
      return [...new Set(checked.map(layer => layer.value))].sort((a, b) => a - b).map(value => ({
        id: `ring-${value}`, color: '#2D2D2A', value, ring: true,
        geometry: circlePolygon(site.lon, site.lat, value + siteRadius),
      }));
    }
    return layers.map(layer => ({
      id: `${section.key}-${layer.id}`,
      color: SECTION_COLORS[section.key],
      layerLabel: layer.label,
      value: layer.value,
      unit: layer.unit,
      // Isochrones are drive-time, not distance: shown as a rough 500 m/min stand-in, flagged in the legend
      geometry: circlePolygon(site.lon, site.lat, layer.unit === 'min' ? layer.value * 500 : layer.value),
    }));
  }, [site?.lat, site?.lon, layers, checked, siteRadius]);
  const statusCounts = features.reduce((counts, feature) => ({ ...counts, [feature.properties.status]: (counts[feature.properties.status] || 0) + 1 }), {});

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !site?.lat || !site?.lon) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [site.lon, site.lat],
      zoom: 13,
      attributionControl: false,
      // Without this, WebGL clears its buffer right after each frame, so print/PDF capture
      // (this page's window.print() and Playwright's later page.pdf()) gets a blank canvas.
      preserveDrawingBuffer: true,
      // OpenFreeMap Positron: a pale vector basemap, licensed for commercial use and print, so the
      // constraint colours carry the map. Its glyphs (Noto Sans) also draw our names and ring distances.
      style: REPORT_BASEMAP,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      const byStatus = key => ['match', ['get', 'status'], 'on-site', MAP_STATUS['on-site'][key], 'within', MAP_STATUS.within[key], MAP_STATUS.outside[key]];
      // Constraint shapes first, so the rings and the site sit on top of them
      map.addSource('constraint-features', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'constraint-fill', type: 'fill', source: 'constraint-features', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], paint: { 'fill-color': byStatus('fill'), 'fill-opacity': byStatus('fillOpacity') } });
      map.addLayer({ id: 'constraint-line', type: 'line', source: 'constraint-features', paint: { 'line-color': byStatus('line'), 'line-width': ['match', ['get', 'status'], 'outside', 1, 1.6], 'line-opacity': ['match', ['get', 'status'], 'outside', 0.85, 1] } });
      map.addSource('buffer-circles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'buffer-fill', type: 'fill', source: 'buffer-circles', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'ring'], 0, 0.12] } });
      map.addLayer({ id: 'buffer-line', type: 'line', source: 'buffer-circles', paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'ring'], 1.25, 1.5], 'line-dasharray': [3, 2] } });
      map.addLayer({
        id: 'buffer-labels', type: 'symbol', source: 'buffer-circles', filter: ['==', ['get', 'ring'], true],
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 400, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-keep-upright': true },
        paint: { 'text-color': '#2D2D2A', 'text-halo-color': '#FEFFF8', 'text-halo-width': 2 },
      });
      // The confirmed red line, when there is one, drawn over the search rings
      if (boundary?.geojson) {
        map.addSource('site-boundary', { type: 'geojson', data: boundary.geojson });
        map.addLayer({ id: 'site-boundary-fill', type: 'fill', source: 'site-boundary', paint: { 'fill-color': '#2D2D2A', 'fill-opacity': 0.06 } });
        map.addLayer({ id: 'site-boundary-line', type: 'line', source: 'site-boundary', paint: { 'line-color': '#2D2D2A', 'line-width': 2.5 } });
      }
      map.addSource('site-point', { type: 'geojson', data: { type: 'Point', coordinates: [site.lon, site.lat] } });
      map.addLayer({ id: 'site-point', type: 'circle', source: 'site-point', paint: { 'circle-radius': boundary?.geojson ? 0 : 7, 'circle-color': '#2D2D2A', 'circle-stroke-width': boundary?.geojson ? 0 : 2.5, 'circle-stroke-color': '#FEFFF8' } });
      // Names of the features the report mentions; on-site and within first, so they win any collision
      map.addLayer({
        id: 'constraint-labels', type: 'symbol', source: 'constraint-features', filter: ['==', ['get', 'labelled'], true],
        layout: {
          'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 10.5, 'text-max-width': 11,
          'text-padding': 3, 'symbol-sort-key': ['match', ['get', 'status'], 'on-site', 0, 'within', 1, 2],
        },
        paint: { 'text-color': byStatus('text'), 'text-halo-color': '#FEFFF8', 'text-halo-width': 1.6 },
      });
      setReady(true);
    });
    // The print page is a different width from the screen in some setups; resize and refit before the snapshot
    const onPrint = () => { map.resize(); fitRef.current(false); };
    window.addEventListener('beforeprint', onPrint);
    window.addEventListener('afterprint', onPrint);
    return () => {
      window.removeEventListener('beforeprint', onPrint);
      window.removeEventListener('afterprint', onPrint);
      map.remove(); mapRef.current = null; setReady(false);
    };
  }, [site?.lat, site?.lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const rings = circles.map(circle => ({ type: 'Feature', properties: { color: circle.color, ring: Boolean(circle.ring), label: metres(circle.value) }, geometry: circle.geometry }));
    map.getSource('buffer-circles')?.setData({ type: 'FeatureCollection', features: rings });
    map.getSource('constraint-features')?.setData({ type: 'FeatureCollection', features });
    fitRef.current = (animate = true) => {
      if (!circles.length) return;
      // Frame the widest search ring, then widen to take in each layer's nearest feature outside it when that's close
      const bounds = [site.lon, site.lat, site.lon, site.lat];
      rings.forEach(ring => extendBounds(bounds, ring.geometry));
      const limit = contextLimit(Math.max(...circles.map(circle => circle.value)));
      features.filter(feature => feature.properties.context && feature.properties.distance_m <= limit).forEach(feature => extendBounds(bounds, feature.geometry));
      // Clipped shapes can be very large (green belt); cap the frame at the context limit around the site
      const latSpan = (limit + siteRadius) / 111320;
      const lonSpan = latSpan / Math.cos((site.lat * Math.PI) / 180);
      map.fitBounds([[Math.max(bounds[0], site.lon - lonSpan), Math.max(bounds[1], site.lat - latSpan)], [Math.min(bounds[2], site.lon + lonSpan), Math.min(bounds[3], site.lat + latSpan)]], { padding: 24, duration: animate ? 400 : 0, maxZoom: 16 });
    };
    fitRef.current();
  }, [circles, features, ready]);

  if (!site?.lat || !site?.lon) return <div className="rb-map-missing">No coordinates recorded for this site, so the map can't be shown.</div>;
  return <figure className="rb-map-block">
    <div ref={containerRef} className="rb-map-canvas" role="img" aria-label={`Map of ${site.site_name || 'the site'} showing ${section.title.toLowerCase()} constraints and search areas`}/>
    <figcaption>
      {checked.length > 0
        ? <ul className="rb-map-legend">
            <li><i className={boundary?.geojson ? 'is-boundary' : 'is-site'}/>{boundary?.geojson ? 'Site boundary' : 'Site'}</li>
            <li><i className="is-ring"/>Search area{siteRadius ? ', measured from the boundary (approx.)' : ''}</li>
            {['on-site', 'within', 'outside'].map(status => <li key={status} className={statusCounts[status] ? '' : 'is-none'}>
              <i className="is-area" style={{ '--fill': MAP_STATUS[status].fill, '--line': MAP_STATUS[status].line, '--alpha': MAP_STATUS[status].fillOpacity }}/>
              {MAP_STATUS[status].label}
            </li>)}
          </ul>
        : circles.length > 0 && <ul className="rb-map-legend">
            {circles.map(circle => <li key={circle.id}><i style={{ background: circle.color }}/>{circle.layerLabel}: within {circle.value.toLocaleString('en-GB')} {circle.unit === 'min' ? 'min drive (approx.)' : 'm'}</li>)}
          </ul>}
      {/* The on-map attribution is a button, which prints as one; print shows this line instead */}
      <p className="rb-map-attribution">{BASEMAP_CREDIT}</p>
    </figcaption>
  </figure>;
}

// The site's recorded figures as ruled definition rows. The review flag is an internal shortlisting mark,
// so it stays out of the client report.
function ReportFigures({ site }) {
  const rateable = currency(site.voa_rateable_value);
  return <dl className="rb-figures">
    <div><dt>Footprint</dt><dd>{area(site.footprint_m2)}</dd></div>
    <div><dt>Spare land on title</dt><dd>{area(site.spare_land_on_title_m2)}</dd></div>
    <div><dt>Rateable value</dt><dd>{rateable || 'Not recorded'}{site.voa_match_confidence && <small>VOA match: {site.voa_match_confidence}</small>}</dd></div>
    {site.category && <div><dt>Category</dt><dd>{site.category}</dd></div>}
  </dl>;
}

// How the constraint figures were measured, and how current and how trustworthy the data is
function ReportBasis({ siteCheck, sections }) {
  if (!siteCheck) return null;
  const used = sections.flatMap(section => section.layers).filter(layer => layer.included && layer.check);
  const dates = used.map(layer => layer.check.data_as_at).filter(Boolean).sort();
  const boundary = siteCheck.boundary;
  return <div className="rb-basis">
    {used.some(layer => layer.check.is_test_data) && <p className="rb-test-banner">Test data. These constraint layers have not been licence-checked and must not go to a client.</p>}
    <p>{boundary
      ? `Measured from the site boundary (${area(boundary.area_m2)}, ${{ client_selection: 'parcels selected by the client', client_sketch: 'sketched by the client', rtc_drawn: 'drawn by RTC' }[boundary.source] || boundary.source}${boundary.confirmed_at ? `, confirmed ${formatAdminDate(boundary.confirmed_at)}` : ', not yet confirmed'}).`
      : 'Measured from the site\'s map point. No boundary has been recorded yet, so coverage of the site can\'t be calculated.'}
      {dates.length > 0 && ` Constraint data as at ${formatAdminDate(dates[0])}${dates[dates.length - 1] !== dates[0] ? ` to ${formatAdminDate(dates[dates.length - 1])}` : ''}.`}</p>
  </div>;
}

// Closing block: every dataset the report relied on, by publisher, with its data date
// Licence, exact attribution and caveats per dataset, from the same catalogue as the portal's /data page
// (meta.data_catalogue). Keyed by layer (env.sssi). Empty map if it can't be loaded, so the report still renders.
function useCatalogue() {
  const [catalogue, setCatalogue] = useState(null);
  useEffect(() => {
    let live = true;
    api('/api/data-sources')
      .then(response => live && setCatalogue(new Map((response.layers || []).map(layer => [layer.layer, layer]))))
      .catch(() => live && setCatalogue(new Map()));
    return () => { live = false; };
  }, []);
  return catalogue;
}

function ReportSources({ sections }) {
  const catalogue = useCatalogue();
  const used = sections.flatMap(section => section.layers).filter(layer => layer.included && layer.check);
  if (!used.length) return null;
  const byPublisher = used.reduce((groups, layer) => {
    const publisher = layer.check.publisher || 'Unknown publisher';
    return groups.set(publisher, [...(groups.get(publisher) || []), layer]);
  }, new Map());
  const entries = used.map(layer => catalogue?.get(layer.check.layer)).filter(Boolean);
  // Several layers share one statement (all EA layers, say): print each statement once
  const attributions = [...new Set(entries.map(entry => entry.attribution).filter(Boolean))];
  const caveats = entries.filter(entry => entry.caveats);
  const missing = catalogue && entries.length < used.length;
  return <section className="rb-sources">
    <h2>Data sources</h2>
    <ul>
      {[...byPublisher].map(([publisher, layers]) => <li key={publisher}>
        <b>{publisher}</b>: {layers.map(layer => layer.label).join(', ')}
        {layers[0].check.data_as_at && <small> (as at {formatAdminDate(layers[0].check.data_as_at)})</small>}
      </li>)}
    </ul>
    {caveats.length > 0 && <>
      <h3>Reading the results</h3>
      <ul>{caveats.map(entry => <li key={entry.layer}><b>{entry.title}</b>: {entry.caveats}</li>)}</ul>
    </>}
    {attributions.length > 0 && <>
      <h3>Attribution</h3>
      {attributions.map(text => <p key={text}>{text}</p>)}
    </>}
    <p>{BASEMAP_CREDIT}.{missing || used.some(layer => layer.check.is_test_data) ? ' Licence and attribution statements for some datasets still to be confirmed before this report goes to a client.' : ''}</p>
  </section>;
}

function ReportSection({ section, site, siteCheck }) {
  const basis = siteCheck?.basis;
  const included = section.layers.filter(layer => layer.included);
  // Checked layers, most serious result first
  const rows = included.map(layer => ({ layer, result: assessLayer(layer, basis) }));
  const checkedRows = rows.filter(row => row.result).sort((a, b) => CHECK_STATUS[a.result.status].rank - CHECK_STATUS[b.result.status].rank);
  const counts = summarise(checkedRows.map(row => row.result));
  const onSite = checkedRows.filter(row => row.result.status === 'on-site');
  const within = checkedRows.filter(row => row.result.status === 'within');
  const clear = checkedRows.filter(row => ['clear', 'unknown'].includes(row.result.status));
  const groups = [['on-site', onSite], ['within', within]].filter(([, items]) => items.length);

  return <section className="rb-report-section">
    <h2>{section.title}</h2>
    {checkedRows.length > 0 && <p className="rb-check-summary">
      {[['on-site', 'on the site'], ['within', 'within the search area'], ['clear', 'clear'], ['unknown', 'no data']]
        .filter(([key]) => counts[key])
        .map(([key, label], index) => <span key={key}>{index > 0 && ' · '}<b className={`is-${key}`}>{counts[key]}</b> {label}</span>)}
    </p>}
    {section.narrative
      ? <p className="rb-report-narrative">{section.narrative}</p>
      : <p className="rb-report-narrative is-empty">No analyst notes yet.</p>}
    {included.some(layer => !layer.fixed) && <ReportMap site={site} section={section} boundary={siteCheck?.boundary}/>}
    {checkedRows.length > 0
      ? <>
          {groups.length
            ? <table className="rb-check-table">
                <thead><tr><th scope="col">Constraint</th><th scope="col">What's there</th></tr></thead>
                {groups.map(([status, items]) => <tbody key={status}>
                  <tr className={`rb-group is-${status}`}><th scope="rowgroup" colSpan={2}><CheckPip status={status}/>{CHECK_STATUS[status].label}</th></tr>
                  {items.map(({ layer, result }) => <tr key={layer.id} className={`is-${result.status}`}>
                    <th scope="row"><span className="rb-constraint"><CheckPip status={result.status}/><span>{layer.label}<small>searched to {metres(layer.value)}</small></span></span></th>
                    <td><FindingDetail result={result}/></td>
                  </tr>)}
                </tbody>)}
              </table>
            : <p className="rb-check-nothing">Nothing on the site or within the search areas.</p>}
          {clear.length > 0 && <ClearGroups rows={clear}/>}
        </>
      : <ul className="rb-report-layers">
          {included.map(layer => <li key={layer.id}>
            <span>{layer.label}</span>
            {!layer.fixed && <b>within {layer.value.toLocaleString('en-GB')} {layer.unit === 'min' ? 'min drive' : 'm'}</b>}
          </li>)}
        </ul>}
  </section>;
}

// A report may only leave RTC when every included layer is cleared data and the check actually ran.
// Anything else prints as a watermarked internal draft.
export function clientReadiness(sections, siteCheck) {
  if (!siteCheck) return { ready: false, reason: 'The constraint check hasn’t run, so the findings are placeholders.' };
  const testLayers = sections.flatMap(section => section.layers).filter(layer => layer.included && layer.check?.is_test_data);
  if (testLayers.length) {
    const names = testLayers.map(layer => layer.label);
    const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
    return { ready: false, reason: `${testLayers.length} included ${testLayers.length === 1 ? 'layer is' : 'layers are'} test data, not yet licence-checked: ${shown}.` };
  }
  return { ready: true, reason: '' };
}

function ReportPreview({ meta, site, sections, siteCheck, draft }) {
  const includedSections = sections.filter(section => section.layers.some(layer => layer.included));
  const reportDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return <div className={`rb-preview${draft ? ' is-draft' : ''}`}>
    <article className="rb-online" data-watermark={draft ? 'Draft · not for client' : undefined}>
      <header className="rb-report-head">
        <div className="rb-report-masthead">
          <span className="rtc-logo is-small"><span className="rtc-logo-name">ROSE TINSLEY</span><span className="rtc-logo-descriptor">C O N S U L T I N G</span></span>
          <span className="rb-report-doctype">Site appraisal</span>
        </div>
        <h1>{meta.siteName}</h1>
        {meta.borough && <p className="rb-report-location">{meta.borough}</p>}
        <dl className="rb-report-meta">
          <div><dt>Prepared for</dt><dd>{meta.workspaceName || 'Not recorded'}</dd></div>
          <div><dt>Prepared by</dt><dd>{meta.analyst || 'Rose Tinsley Consulting'}</dd></div>
          <div><dt>Date</dt><dd>{reportDate}</dd></div>
          <div><dt>Reference</dt><dd>{meta.reference || 'Not assigned'}</dd></div>
        </dl>
        <p className="rb-report-disclaimer">Evidence against the criteria you set, not a recommendation to buy, lease or develop.</p>
      </header>
      <ReportFigures site={site}/>
      <ReportBasis siteCheck={siteCheck} sections={sections}/>
      {includedSections.map(section => <ReportSection key={section.key} section={section} site={site} siteCheck={siteCheck}/>)}
      {!includedSections.length && <p className="rb-report-narrative is-empty">No sections included yet. Tick a layer on the left to add it to the report.</p>}
      <ReportSources sections={sections}/>
    </article>
  </div>;
}

// No database reachable (e.g. Galahad unreachable over Tailscale): ?mock=1 skips /api/me and
// /api/admin/appraisal-requests entirely so the builder UI can still be clicked through and tested.
const MOCK_REQUEST = {
  id: 'mock', site_name: 'Land opposite Alands Farm', workspace_name: 'Test workspace', borough: 'East Hanningfield',
  lat: 51.672, lon: 0.573, category: 'Vacant plot', footprint_m2: 2850, spare_land_on_title_m2: 1200,
  voa_rateable_value: 18500, voa_match_confidence: 'High', review_flag: 'Good Candidate',
};

// "Eilish Tinsley" -> "E. Tinsley"; a single name is shown as it is
const preparedByName = fullName => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`;
};

const reportReference = request => (Number.isInteger(Number(request.id)) ? `A-${String(request.id).padStart(4, '0')}` : null);

function ReportBuilder({ request, mock, siteCheck, siteCheckError, onRetry, analyst }) {
  const [initialDraft] = useState(() => readDraft(request.id));
  const [sections, setSections] = useState(() => applyDraft(buildInitialSections(siteCheck), initialDraft));
  const [preset, setPreset] = useState(initialDraft?.preset || 'urban');
  const [activeKey, setActiveKey] = useState(SECTION_DEFS[0].key);
  const [savedAt, setSavedAt] = useState(initialDraft?.savedAt || null);
  const [theme, setTheme] = usePanelTheme();
  const basis = siteCheck?.basis;

  // Save the draft shortly after each change
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return undefined; }
    const timer = setTimeout(() => {
      const draft = draftFrom(sections, preset);
      try { localStorage.setItem(draftKey(request.id), JSON.stringify(draft)); setSavedAt(draft.savedAt); } catch { /* storage full or blocked */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [sections, preset]);

  const discardDraft = () => {
    if (!window.confirm('Discard this draft and start the report again from the default radii? Your notes will be lost.')) return;
    try { localStorage.removeItem(draftKey(request.id)); } catch { /* nothing to remove */ }
    firstRender.current = true;
    setSections(buildInitialSections(siteCheck));
    setPreset('urban');
    setSavedAt(null);
  };

  // One view on screen, always. The browser's print engine handles pagination for the same content via
  // @media print rules. document.fonts.ready guards against printing before webfonts have painted.
  const printReport = () => {
    const ready = document.fonts?.ready ?? Promise.resolve();
    ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => window.print())));
  };

  const applyPreset = nextPreset => {
    if (preset === 'custom' && !window.confirm(`Switch every search radius to the ${nextPreset} defaults? Radii you've set by hand will be replaced.`)) return;
    setPreset(nextPreset);
    setSections(current => current.map(section => ({
      ...section,
      layers: section.layers.map(layer => (layer.fixed ? layer : { ...layer, value: layer[`${nextPreset}M`] })),
    })));
  };

  const toggleLayer = (sectionKey, layerId) => setSections(current => current.map(section => (section.key !== sectionKey ? section : {
    ...section, layers: section.layers.map(layer => (layer.id !== layerId ? layer : { ...layer, included: !layer.included })),
  })));
  const setLayerValue = (sectionKey, layerId, value) => {
    setPreset('custom');
    setSections(current => current.map(section => (section.key !== sectionKey ? section : {
      ...section, layers: section.layers.map(layer => (layer.id !== layerId ? layer : { ...layer, value })),
    })));
  };
  const setNarrative = (sectionKey, narrative) => setSections(current => current.map(section => (section.key !== sectionKey ? section : { ...section, narrative })));

  const activeSection = sections.find(section => section.key === activeKey);
  const meta = { siteName: request.site_name, workspaceName: request.workspace_name, borough: request.borough, reference: reportReference(request), analyst: preparedByName(analyst) };
  // Nav shows where the findings are, not how many boxes are ticked
  const readiness = clientReadiness(sections, siteCheck);
  const navFindings = section => summarise(section.layers.filter(layer => layer.included).map(layer => assessLayer(layer, basis)));

  return <div className="app-shell adm-shell rb-shell" data-theme={theme}>
    <aside className="sidebar adm-rail rb-rail">
      <PanelBackground theme={theme}/>
      <div className="adm-rail-inner">
        <div className="adm-rail-brand">
          <span className="rtc-logo is-small"><span className="rtc-logo-name">ROSE TINSLEY</span><span className="rtc-logo-descriptor">C O N S U L T I N G</span></span>
        </div>
        <Link to="/admin" className="rb-back-link"><ArrowLeft size={13}/>Back to admin</Link>
        <nav className="rb-section-nav" aria-label="Report sections">
          {sections.map(section => {
            const found = navFindings(section);
            const includedCount = section.layers.filter(layer => layer.included).length;
            const hasFindings = found['on-site'] || found.within;
            return <button type="button" key={section.key} className={activeKey === section.key ? 'active' : ''} aria-pressed={activeKey === section.key} onClick={() => setActiveKey(section.key)}>
              <span>{section.title}</span>
              {hasFindings
                ? <span className="rb-nav-findings" aria-label={`${found['on-site']} on the site, ${found.within} within the search area`}>
                    {found['on-site'] > 0 && <b className="is-on-site"><CheckPip status="on-site"/>{found['on-site']}</b>}
                    {found.within > 0 && <b className="is-within"><CheckPip status="within"/>{found.within}</b>}
                  </span>
                : <b className="rb-nav-count">{includedCount ? 'clear' : 'not included'}</b>}
            </button>;
          })}
        </nav>
      </div>
    </aside>
    <main className="main rb-main">
      <div className="adm-account" role="group" aria-label="Account">
        <ThemeToggle theme={theme} setTheme={setTheme} className="map-pill is-icon"/>
        <SignOutButton/>
      </div>
      <header className="adm-head rb-head">
        <div className="adm-title">
          <h1>Report builder{mock && <span className="rb-mock-tag">Mock data, no database</span>}</h1>
          <p className="standfirst">{request.site_name} · {request.workspace_name}. {siteCheck
            ? `Constraint layers checked against the site ${siteCheck.basis === 'boundary' ? 'boundary' : 'point (no boundary recorded yet)'}. Sections without loaded data are placeholders.`
            : siteCheckError
              ? 'The constraint check could not run, so only placeholder layers are shown.'
              : 'Wireframe with placeholder layers, no constraint data.'}
            {siteCheckError && !siteCheck && <button type="button" className="rb-retry" onClick={onRetry}>Try again</button>}</p>
        </div>
      </header>
      <div className="rb-body">
        <div className="rb-build-col">
          <div className="rb-build-toolbar">
            <span className="rb-build-toolbar-label">Search radius preset</span>
            <PresetToggle preset={preset} onChange={applyPreset}/>
          </div>
          <div className="rb-section-head">
            <h2>{activeSection.title}</h2>
          </div>
          <SectionEditor
            section={activeSection}
            basis={basis}
            onToggleLayer={layerId => toggleLayer(activeKey, layerId)}
            onLayerValue={(layerId, value) => setLayerValue(activeKey, layerId, value)}
            onNarrative={value => setNarrative(activeKey, value)}
          />
        </div>
        <div className="rb-preview-col">
          <div className="rb-preview-toolbar">
            <span className="rb-preview-label"><Globe size={13}/>Preview at A4 width</span>
            <span className="rb-draft-status" aria-live="polite">{savedAt ? `Draft saved in this browser, ${new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not saved yet'}</span>
            {savedAt && <button type="button" className="rb-text-button" onClick={discardDraft}><RotateCcw size={12}/>Discard draft</button>}
            <button type="button" className={`rb-print-trigger${readiness.ready ? '' : ' is-draft'}`} onClick={printReport} title={readiness.ready ? 'Print or save as PDF' : `Prints with a DRAFT watermark. ${readiness.reason}`}>
              <Printer size={13}/>{readiness.ready ? 'Print' : 'Print draft'}
            </button>
          </div>
          {!readiness.ready && <p className="rb-not-ready" role="status"><strong>Not ready for a client.</strong> {readiness.reason} It prints with a draft watermark.</p>}
          <ReportPreview meta={meta} site={request} sections={sections} siteCheck={siteCheck} draft={!readiness.ready}/>
        </div>
      </div>
    </main>
  </div>;
}

export default function ReportBuilderRoute() {
  const { requestId } = useParams();
  const [searchParams] = useSearchParams();
  const mock = searchParams.get('mock') === '1';
  const [profile, setProfile] = useState(mock ? { isPlatformAdmin: true } : null);
  const [request, setRequest] = useState(mock ? MOCK_REQUEST : null);
  const [siteCheck, setSiteCheck] = useState(null);
  const [siteCheckError, setSiteCheckError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!mock);

  const load = async () => {
    if (mock) return;
    setLoading(true);
    setError('');
    setSiteCheckError('');
    try {
      const [profileResponse, requestsResponse] = await Promise.all([api('/api/me'), api('/api/admin/appraisal-requests')]);
      setProfile(profileResponse);
      const match = requestsResponse.requests?.find(item => String(item.id) === requestId);
      if (!match) throw new Error('That appraisal request could not be found.');
      // The constraint check is slower and can fail on its own; the builder still opens without it
      try {
        const checkResponse = await api(`/api/admin/appraisal-requests/${requestId}/site-check`);
        setSiteCheck(checkResponse.siteCheck);
      } catch (checkError) {
        setSiteCheck(null);
        setSiteCheckError(checkError.message || 'unknown error');
      }
      setRequest(match);
    } catch (loadError) {
      setError(loadError.status === 403 ? 'Your account does not have platform-admin access.' : loadError.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [requestId, mock]);

  if (loading) return <LoadingScreen label="Loading report builder"/>;
  if (error) return <ErrorScreen message={error} onRetry={load}/>;
  if (!profile?.isPlatformAdmin) return <ErrorScreen message="Your account does not have platform-admin access." onRetry={load}/>;
  // key: rebuild the builder's state if the check result arrives or changes on retry (the draft is reapplied)
  return <ReportBuilder key={siteCheck ? 'checked' : 'unchecked'} request={request} mock={mock} siteCheck={siteCheck} siteCheckError={siteCheckError} onRetry={load} analyst={profile?.user?.name?.trim()}/>;
}
