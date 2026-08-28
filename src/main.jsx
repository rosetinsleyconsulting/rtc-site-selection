import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Map, List, Check, X, RotateCcw, MapPin, ExternalLink, Layers3 } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import csvText from '../attached_assets/0_lowlu_final_sites_export_1787904911415.csv?raw';
import '../index.css';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const fields = ['type','borough','site_name','category','priority','footprint_m2','spare_land_on_title_m2','voa_rateable_value','voa_match_confidence','nearby_planning_applications','nearby_parking','data_confidence_notes','spare_area_comments','lat','lon'];
function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++) { const c=text[i];
    if (c === '"') { if (quoted && text[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell=''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); if (row.length) rows.push(row); row=[]; cell=''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header,...data] = rows;
  return data.filter(r=>r.length > 1).map((r, i) => ({ id: i + 1, ...Object.fromEntries(fields.map((f,j)=>[f,r[j] ?? ''])) }));
}
const seed = parseCSV(csvText);
const num = value => value && !value.toLowerCase().includes('n/a') ? Number(value) : null;
const money = value => {
  const parsed = num(value);
  return Number.isFinite(parsed) ? `£${parsed.toLocaleString('en-GB')}` : 'Not available';
};
const area = value => {
  const parsed = num(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString('en-GB', {maximumFractionDigits: 0})} m²` : 'Not recorded';
};
const normalize = value => (value || '').toLowerCase();

function App() {
  const [statusMap, setStatusMap] = useState(() => JSON.parse(localStorage.getItem('lowlu-statuses') || '{}'));
  const [selectedId, setSelectedId] = useState(1);
  const [view, setView] = useState('split');
  const [query, setQuery] = useState('');
  const [borough, setBorough] = useState('All boroughs');
  const [category, setCategory] = useState('All categories');
  const [statusFilter, setStatusFilter] = useState('all');
  useEffect(() => localStorage.setItem('lowlu-statuses', JSON.stringify(statusMap)), [statusMap]);
  const sites = useMemo(() => seed.map(s => ({...s, status: statusMap[s.id] || 'new'})), [statusMap]);
  const boroughs = useMemo(() => [...new Set(seed.map(s=>s.borough))].sort(), []);
  const categories = useMemo(() => [...new Set(seed.map(s=>s.category))].sort(), []);
  const filtered = useMemo(() => sites.filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    (borough === 'All boroughs' || s.borough === borough) &&
    (category === 'All categories' || s.category === category) &&
    (!query || normalize(`${s.site_name} ${s.borough} ${s.category}`).includes(normalize(query)))
  ), [sites, statusFilter, borough, category, query]);
  const selected = filtered.find(s=>s.id===selectedId) || filtered[0] || null;
  const setStatus = (id, status) => setStatusMap(prev => ({...prev, [id]: status}));
  const counts = { all: sites.length, new: sites.filter(s=>s.status==='new').length, accepted: sites.filter(s=>s.status==='accepted').length, dismissed: sites.filter(s=>s.status==='dismissed').length };
  const shown = view === 'list' ? 'list-only' : view === 'map' ? 'map-only' : 'split';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-kicker">Private shortlist workspace</div>
      <div className="brand-name">Lowlu</div>
      <div className="brand-sub">London site selection</div>
      <div className="side-rule" />
      <div className="side-label">Review status</div>
      <nav className="side-nav">
        {['all','new','accepted','dismissed'].map(key => <button key={key} className={statusFilter===key?'active':''} onClick={()=>setStatusFilter(key)}>
          <span>{key === 'all' ? 'All sites' : key[0].toUpperCase()+key.slice(1)}</span><span className="side-count">{counts[key]}</span>
        </button>)}
      </nav>
      <div className="filter-block">
        <div className="side-label">Borough</div>
        <select className="filter-select" value={borough} onChange={e=>setBorough(e.target.value)}><option>All boroughs</option>{boroughs.map(x=><option key={x}>{x}</option>)}</select>
      </div>
      <div className="filter-block">
        <div className="side-label">Site category</div>
        <select className="filter-select" value={category} onChange={e=>setCategory(e.target.value)}><option>All categories</option>{categories.map(x=><option key={x}>{x}</option>)}</select>
      </div>
      <div className="side-footer"><div className="signature">Prepared for Lowlu<br/>ROSE TINSLEY Consulting</div></div>
    </aside>
    <main className="main">
      <header className="topline">
        <div><div className="eyebrow">London / candidate sites</div><h1>Shortlist review</h1><p className="intro">A considered view of places worth a closer look.</p></div>
        <div className="view-switch">
          <button className={view==='split'?'active':''} onClick={()=>setView('split')}><MapPin size={13}/> Split view</button>
          <button className={view==='list'?'active':''} onClick={()=>setView('list')}><List size={13}/> List</button>
          <button className={view==='map'?'active':''} onClick={()=>setView('map')}><Map size={13}/> Map</button>
        </div>
      </header>
      <div className="summary-row">
        <div className="summary-item"><span className="summary-number">{counts.all}</span><span className="summary-caption">sites in shortlist</span></div>
        <div className="summary-item"><span className="summary-number">{counts.accepted}</span><span className="summary-caption">accepted</span></div>
        <div className="summary-item"><span className="summary-number">{counts.new}</span><span className="summary-caption">to review</span></div>
      </div>
      <div className={`workspace ${shown}`}>
        {view !== 'map' && <section className="list-panel">
          <div className="search-row"><div className="search-wrap"><Search size={15}/><input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search site, borough or category" /></div></div>
          <div className="result-note">{filtered.length} {filtered.length===1?'site':'sites'} shown</div>
          <div className="site-list">{filtered.length ? filtered.map(site=><button className={`site-card ${selected?.id===site.id?'selected':''}`} key={site.id} onClick={()=>setSelectedId(site.id)}>
            <div className="card-top"><div className="site-title">{site.site_name}</div><span className={`badge badge-${site.status}`}>{site.status}</span></div>
            <div className="site-meta">{site.borough} · {site.category}</div>
            <div className="card-bottom"><span><strong>{area(site.footprint_m2)}</strong> footprint</span><span><strong>{area(site.spare_land_on_title_m2)}</strong> spare title</span></div>
          </button>) : <div className="empty"><h2>No sites match</h2><p>Try clearing a filter or searching a different part of the shortlist.</p></div>}</div>
        </section>}
        {view !== 'list' && <MapPanel sites={filtered} selected={selected} onSelect={setSelectedId}/>}
        {view !== 'map' && selected && <Detail site={selected} onStatus={setStatus}/>}
      </div>
    </main>
  </div>;
}

function MapPanel({sites, selected, onSelect}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [mapFailed, setMapFailed] = useState(false);
  onSelectRef.current = onSelect;

  const geoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: sites.map(site => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(site.lon), Number(site.lat)] },
      properties: {
        id: site.id,
        status: site.status,
        selected: selected?.id === site.id,
        name: site.site_name,
      },
    })),
  }), [sites, selected]);

  const fallbackPoints = useMemo(() => {
    if (!sites.length) return [];
    const lons = sites.map(site => Number(site.lon));
    const lats = sites.map(site => Number(site.lat));
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const lonRange = Math.max(maxLon - minLon, 0.01);
    const latRange = Math.max(maxLat - minLat, 0.01);
    return sites.map(site => ({
      ...site,
      left: `${8 + ((Number(site.lon) - minLon) / lonRange) * 84}%`,
      top: `${8 + ((maxLat - Number(site.lat)) / latRange) * 84}%`,
    }));
  }, [sites]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2')) {
      setMapFailed(true);
      return;
    }
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [-0.18, 51.53],
      zoom: 10.4,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.72, 'raster-saturation': -0.72, 'raster-contrast': -0.08 } }],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      map.addSource('sites', { type: 'geojson', data: geoJson });
      map.addLayer({
        id: 'site-points',
        type: 'circle',
        source: 'sites',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 10, 7],
          'circle-color': ['match', ['get', 'status'], 'accepted', '#517C78', 'dismissed', '#9D9D91', '#A67C7C'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
          'circle-stroke-color': ['case', ['get', 'selected'], '#2D2D2A', '#FEFFF8'],
          'circle-opacity': ['case', ['==', ['get', 'status'], 'dismissed'], 0.68, 1],
        },
      });
      map.on('mouseenter', 'site-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'site-points', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'site-points', event => {
        const id = Number(event.features?.[0]?.properties?.id);
        if (id) onSelectRef.current(id);
      });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const source = map.getSource('sites');
      if (source) source.setData(geoJson);
    };
    if (map.loaded()) update();
    else map.once('load', update);
  }, [geoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    map.easeTo({ center: [Number(selected.lon), Number(selected.lat)], duration: 650, essential: true });
  }, [selected?.id]);

  return <section className="map-panel">
    <div ref={containerRef} className="map-canvas" aria-label="Map of shortlisted sites" />
    {mapFailed && <div className="fallback-map" aria-label="Coordinate map of shortlisted sites">
      <div className="fallback-river" />
      <span className="fallback-place place-north">North London</span>
      <span className="fallback-place place-west">West London</span>
      <span className="fallback-place place-central">Central London</span>
      {fallbackPoints.map(site => <button
        aria-label={site.site_name}
        title={site.site_name}
        key={site.id}
        className={`fallback-point ${site.status} ${selected?.id === site.id ? 'selected' : ''}`}
        style={{ left: site.left, top: site.top }}
        onClick={() => onSelect(site.id)}
      />)}
      <div className="fallback-note">Interactive coordinate view · live basemap available with WebGL2</div>
    </div>}
    <div className="map-head">
      <span className="map-chip">Site geography · live map</span>
      <span className="map-chip">{sites.length} points</span>
    </div>
    <div className="context-layer" title="Galahad endpoint required before this layer can be enabled">
      <Layers3 size={13}/><span>Parcels & buildings</span><span className="coming-soon">Awaiting connection</span>
    </div>
    <div className="map-legend"><span><i className="legend-dot" style={{background:'var(--rose)'}}/> New</span><span><i className="legend-dot" style={{background:'var(--teal)'}}/> Accepted</span><span><i className="legend-dot" style={{background:'#9d9d91'}}/> Dismissed</span></div>
  </section>;
}

function Detail({site, onStatus}) {
  const confidence = site.voa_match_confidence && site.voa_match_confidence !== 'no match' ? 78 : 22;
  const siteQuery = encodeURIComponent(`${site.site_name}, ${site.borough}, London`);
  return <section className="detail-panel"><div className="detail-head"><div className="detail-type">{site.type} · {site.priority}</div><h2 className="detail-title">{site.site_name}</h2><div className="detail-location">{site.borough}, London</div><div className="decision-row"><button className={`decision ${site.status==='accepted'?'accept':''}`} onClick={()=>onStatus(site.id, site.status==='accepted'?'new':'accepted')}>{site.status==='accepted'?<Check size={12}/>:null} {site.status==='accepted'?'Accepted':'Accept site'}</button><button className="decision dismiss" onClick={()=>onStatus(site.id, site.status==='dismissed'?'new':'dismissed')}>{site.status==='dismissed'?<RotateCcw size={12}/>:<X size={12}/>} {site.status==='dismissed'?'Restore':'Dismiss'}</button></div></div>
    <div className="detail-body"><div className="detail-grid"><div className="detail-stat"><label>Footprint</label><span>{area(site.footprint_m2)}</span></div><div className="detail-stat"><label>Spare land on title</label><span>{area(site.spare_land_on_title_m2)}</span></div><div className="detail-stat"><label>VOA rateable value</label><span>{money(site.voa_rateable_value)}</span></div><div className="detail-stat"><label>Nearby parking</label><span>{site.nearby_parking || 'Not recorded'}</span></div></div>
      <div className="research-links">
        <a href={`https://www.google.com/maps/search/?api=1&query=${siteQuery}`} target="_blank" rel="noreferrer">Google Maps <ExternalLink size={12}/></a>
        <a href={`https://www.google.com/search?q=${siteQuery}+official+website`} target="_blank" rel="noreferrer">Find website <ExternalLink size={12}/></a>
        <a href="https://search-property-information.service.gov.uk/search/search-by-address" target="_blank" rel="noreferrer">HM Land Registry <ExternalLink size={12}/></a>
      </div>
      <div className="detail-section"><h3>VOA match confidence</h3><p>{site.voa_match_confidence || 'No match recorded'}</p><div className="confidence"><i style={{width:`${confidence}%`}}/></div></div>
      <div className="detail-section"><h3>Planning context</h3><p>{site.nearby_planning_applications || 'No planning information recorded.'}</p></div>
      {(site.data_confidence_notes || site.spare_area_comments) && <div className="detail-section"><h3>Field notes</h3><p>{site.data_confidence_notes || site.spare_area_comments}</p>{site.data_confidence_notes && site.spare_area_comments && <p style={{marginTop:8}}>{site.spare_area_comments}</p>}</div>}
    </div></section>;
}

createRoot(document.getElementById('root')).render(<App />);