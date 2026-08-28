import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ExternalLink,
  Layers3,
  List,
  LoaderCircle,
  LogOut,
  Map,
  MapPin,
  Menu,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  ClerkProvider,
  RedirectToSignIn,
  SignIn,
  SignUp,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../index.css';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const tileServerUrl = import.meta.env.VITE_TILE_SERVER_URL?.replace(/\/+$/, '');
const CONTEXT_LAYER_IDS = ['context-parcels', 'context-buildings-fill', 'context-buildings-outline'];
const numberValue = value => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const area = value => {
  const parsed = numberValue(value);
  return parsed === null ? 'Not recorded' : `${parsed.toLocaleString('en-GB', { maximumFractionDigits: 0 })} m²`;
};
const money = value => {
  const parsed = numberValue(value);
  return parsed === null ? 'Not available' : `£${parsed.toLocaleString('en-GB')}`;
};
const normalize = value => (value || '').toLowerCase();

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || 'Something went wrong');
    error.status = response.status;
    throw error;
  }
  return body;
}

function ConfigurationNotice() {
  return <div className="config-screen">
    <div className="config-card">
      <div className="config-mark">Site Selection</div>
      <div className="eyebrow">Authentication setup</div>
      <h1>Connect the client login</h1>
      <p>Add <strong>VITE_CLERK_PUBLISHABLE_KEY</strong> and <strong>CLERK_SECRET_KEY</strong> as Replit Secrets, then restart the app to enable the private workspace.</p>
      <p className="config-note">The shortlist UI and server health check are ready; no site data is exposed until Clerk is configured.</p>
    </div>
  </div>;
}

function AuthAppearance() {
  return {
    variables: {
      colorPrimary: '#6F8443',
      colorText: '#2D2D2A',
      colorBackground: '#FEFFF8',
      fontFamily: 'Montserrat, sans-serif',
      borderRadius: '4px',
    },
    elements: {
      card: 'auth-card',
      headerTitle: 'auth-title',
      headerSubtitle: 'auth-subtitle',
      formButtonPrimary: 'auth-primary',
      footerActionLink: 'auth-link',
    },
  };
}

function SignInRoute() {
  return <div className="auth-screen"><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/" appearance={AuthAppearance()} /></div>;
}

function SignUpRoute() {
  return <div className="auth-screen"><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/" appearance={AuthAppearance()} /></div>;
}

function ProtectedRoute({ children }) {
  return <><SignedIn>{children}</SignedIn><SignedOut><RedirectToSignIn /></SignedOut></>;
}

function HomeRoute() {
  return <><SignedIn><Home /></SignedIn><SignedOut><LandingPage /></SignedOut></>;
}

function LandingPage() {
  return <div className="landing-screen"><div className="landing-content"><div className="brand-kicker">ROSE TINSLEY Consulting</div><div className="landing-wordmark">Site Selection</div><div className="landing-rule"/><div className="eyebrow">Private client site-selection workspace</div><h1>Make the next<br/><em>place</em> worth finding.</h1><p>Review curated venues and vacant plots, share a considered shortlist, and move from map to decision with clarity.</p><div className="landing-actions"><Link to="/sign-in" className="decision accept">Sign in <ArrowRight size={13}/></Link><Link to="/sign-up" className="landing-secondary">Create an account</Link></div></div><div className="landing-aside"><div className="landing-coordinate">One shortlist.<br/>Every client.</div><div className="landing-note">A private tool for<br/>thoughtful site selection.</div></div></div>;
}

function AdminRoute() {
  return <ProtectedRoute><AdminOverview /></ProtectedRoute>;
}

function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    setLoading(true);
    try {
      setProfile(await api('/api/me'));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);

  if (loading) return <LoadingScreen label="Loading workspace" />;
  if (error) return <ErrorScreen message={error} onRetry={loadProfile} />;
  const workspace = profile.workspaces.find(item => item.id === Number(workspaceId));
  if (!workspace) return <NoAccessState />;

  return <ShortlistWorkspace
    key={workspace.id}
    profile={profile}
    workspaces={[workspace]}
    workspace={workspace}
    onWorkspaceChange={() => {}}
  />;
}

function Home() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState(() => Number(localStorage.getItem('lowlu-workspace-id')) || null);

  const loadProfile = async () => {
    try {
      const nextProfile = await api('/api/me');
      setProfile(nextProfile);
      if (!workspaceId && nextProfile.workspaces.length) {
        setWorkspaceId(nextProfile.workspaces[0].id);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => {
    if (workspaceId) localStorage.setItem('lowlu-workspace-id', String(workspaceId));
  }, [workspaceId]);

  if (loading) return <LoadingScreen label="Loading your workspace" />;
  if (error) return <ErrorScreen message={error} onRetry={loadProfile} />;
  if (profile.isPlatformAdmin) return <AdminOverview profile={profile} />;
  if (!profile.workspaces.length) return <NoAccessState />;

  const activeWorkspace = profile.workspaces.find(workspace => workspace.id === workspaceId) || profile.workspaces[0];
  return <ShortlistWorkspace
    key={activeWorkspace.id}
    profile={profile}
    workspaces={profile.workspaces}
    workspace={activeWorkspace}
    onWorkspaceChange={setWorkspaceId}
  />;
}

function LoadingScreen({ label }) {
  return <div className="center-screen"><LoaderCircle className="spin" size={20}/><span>{label}</span></div>;
}

function ErrorScreen({ message, onRetry }) {
  return <div className="center-screen"><div className="center-card"><div className="eyebrow">Workspace unavailable</div><h1>We couldn’t load this view.</h1><p>{message}</p><button className="decision accept" onClick={onRetry}>Try again</button></div></div>;
}

function NoAccessState() {
  return <div className="center-screen"><div className="center-card"><div className="eyebrow">Private shortlist workspace</div><h1>No workspace access yet.</h1><p>Your account is active, but an administrator has not granted access to a client workspace.</p><div className="center-signature">ROSE TINSLEY Consulting</div></div></div>;
}

function ShortlistWorkspace({ profile, workspaces, workspace, onWorkspaceChange }) {
  const [sites, setSites] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [borough, setBorough] = useState('All boroughs');
  const [category, setCategory] = useState('All categories');
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('split');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  const loadSites = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api(`/api/workspaces/${workspace.id}/sites`);
      setSites(response.sites || []);
      if (response.sites?.length) setSelectedId(current => current || response.sites[0].id);
      const migrationKey = `lowlu-statuses-migrated-${workspace.id}`;
      const oldStatuses = localStorage.getItem('lowlu-statuses');
      if (oldStatuses && !localStorage.getItem(migrationKey)) {
        await api(`/api/workspaces/${workspace.id}/import-local-statuses`, { method: 'POST', body: JSON.stringify({ statuses: JSON.parse(oldStatuses) }) });
        localStorage.setItem(migrationKey, 'true');
        const refreshed = await api(`/api/workspaces/${workspace.id}/sites`);
        setSites(refreshed.sites || []);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSites(); }, [workspace.id]);

  const boroughs = useMemo(() => [...new Set(sites.map(site => site.borough).filter(Boolean))].sort(), [sites]);
  const categories = useMemo(() => [...new Set(sites.map(site => site.category).filter(Boolean))].sort(), [sites]);
  const filtered = useMemo(() => sites.filter(site =>
    (statusFilter === 'all' || site.status === statusFilter)
    && (borough === 'All boroughs' || site.borough === borough)
    && (category === 'All categories' || site.category === category)
    && (!query || normalize(`${site.site_name} ${site.borough} ${site.category}`).includes(normalize(query)))
  ), [sites, statusFilter, borough, category, query]);
  const selected = filtered.find(site => site.id === selectedId) || filtered[0] || null;
  const counts = {
    all: sites.length,
    new: sites.filter(site => site.status === 'new').length,
    accepted: sites.filter(site => site.status === 'accepted').length,
    dismissed: sites.filter(site => site.status === 'dismissed').length,
  };

  const setStatus = async (id, status) => {
    const previous = sites;
    setSites(current => current.map(site => site.id === id ? { ...site, status } : site));
    try {
      await api(`/api/workspaces/${workspace.id}/sites/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (statusError) {
      setSites(previous);
      setError(statusError.message);
    }
  };

  if (loading) return <LoadingScreen label={`Loading ${workspace.name}`} />;
  if (error) return <ErrorScreen message={error} onRetry={loadSites} />;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
      <div className="mobile-sidebar-close"><button onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="brand-kicker">Private shortlist workspace</div>
      <div className="brand-name">Site Selection</div>
      <div className="brand-sub">Client map workspace</div>
      <div className="side-rule" />
      <div className="side-label">Client workspace</div>
      {workspaces.length > 1 ? <select className="filter-select workspace-select" value={workspace.id} onChange={event => onWorkspaceChange(Number(event.target.value))}>{workspaces.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select> : <div className="workspace-name">{workspace.name}</div>}
      <div className="side-label side-status-label">Review status</div>
      <nav className="side-nav">
        {['all', 'new', 'accepted', 'dismissed'].map(key => <button key={key} className={statusFilter === key ? 'active' : ''} onClick={() => { setStatusFilter(key); setMobileMenu(false); }}>
          <span>{key === 'all' ? 'All sites' : key[0].toUpperCase() + key.slice(1)}</span><span className="side-count">{counts[key]}</span>
        </button>)}
      </nav>
      <div className="filter-block">
        <div className="side-label">Borough</div>
        <select className="filter-select" value={borough} onChange={event => setBorough(event.target.value)}><option>All boroughs</option>{boroughs.map(item => <option key={item}>{item}</option>)}</select>
      </div>
      <div className="filter-block">
        <div className="side-label">Site category</div>
        <select className="filter-select" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
      </div>
      <div className="side-footer"><div className="signature">Prepared for {workspace.name}<br/>ROSE TINSLEY Consulting</div><div className="side-account"><UserButton afterSignOutUrl="/sign-in"/></div>{profile.isPlatformAdmin && <Link className="admin-link" to="/admin"><ShieldCheck size={13}/> Back to admin overview</Link>}</div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20}/></button>
        <div className="topbar-title">
          <h1>{workspace.name}</h1>
          <div className="topbar-stats">
            <span><strong>{counts.all}</strong> sites</span>
            <span><strong>{counts.accepted}</strong> accepted</span>
            <span><strong>{counts.new}</strong> to review</span>
          </div>
        </div>
        <div className="topline-actions">
          {profile.isPlatformAdmin && <Link to="/admin" className="back-to-admin"><ShieldCheck size={13}/> Admin overview</Link>}
          <div className="view-switch">
            <button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')}><MapPin size={13}/> Split view</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={13}/> List</button>
            <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><Map size={13}/> Map</button>
          </div>
        </div>
      </header>
      <div className={`workspace ${view === 'list' ? 'list-only' : view === 'map' ? 'map-only' : 'split'}`}>
        {view !== 'map' && <section className="list-panel">
          {view === 'split' && selected && <Detail site={selected} onStatus={setStatus}/>}
          <div className="search-row"><div className="search-wrap"><Search size={15}/><input className="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search site, borough or category" /></div></div>
          <div className="result-note">{filtered.length} {filtered.length === 1 ? 'site' : 'sites'} shown</div>
          <div className="site-list">{filtered.length ? filtered.map(site => <button className={`site-card ${selected?.id === site.id ? 'selected' : ''}`} key={site.id} onClick={() => setSelectedId(site.id)}>
            <div className="card-top"><div className="site-title">{site.site_name}</div><span className={`badge badge-${site.status}`}>{site.status}</span></div>
            <div className="site-meta">{site.borough} · {site.category}</div>
            <div className="card-bottom"><span><strong>{area(site.footprint_m2)}</strong> footprint</span><span><strong>{area(site.spare_land_on_title_m2)}</strong> spare title</span></div>
          </button>) : <div className="empty"><h2>No sites match</h2><p>Try clearing a filter or searching a different part of the shortlist.</p></div>}</div>
        </section>}
        {view === 'map'
          ? <MapPanel sites={filtered} selected={selected} onSelect={setSelectedId}/>
          : <div className="map-column">
              {view !== 'list' && <MapPanel sites={filtered} selected={selected} onSelect={setSelectedId}/>}
              {view === 'list' && selected && <Detail site={selected} onStatus={setStatus}/>}
            </div>}
      </div>
    </main>
  </div>;
}

function MapPanel({ sites, selected, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [mapFailed, setMapFailed] = useState(false);
  const [contextLayerOn, setContextLayerOn] = useState(Boolean(tileServerUrl));
  onSelectRef.current = onSelect;
  const geoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: sites.map(site => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(site.lon), Number(site.lat)] },
      properties: { id: site.id, status: site.status, selected: selected?.id === site.id },
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
    return sites.map(site => ({ ...site, left: `${8 + ((Number(site.lon) - minLon) / lonRange) * 84}%`, top: `${8 + ((maxLat - Number(site.lat)) / latRange) * 84}%` }));
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
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.72, 'raster-saturation': -0.72, 'raster-contrast': -0.08 } }],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      if (tileServerUrl) {
        const contextVisibility = contextLayerOn ? 'visible' : 'none';
        map.addSource('lowlu-parcels', { type: 'vector', tiles: [`${tileServerUrl}/lowlu_final_parcels/{z}/{x}/{y}`] });
        map.addLayer({ id: 'context-parcels', type: 'line', source: 'lowlu-parcels', 'source-layer': 'lowlu_final_parcels', layout: { visibility: contextVisibility }, paint: { 'line-color': '#748894', 'line-width': 1, 'line-opacity': 0.55 } });
        map.addSource('lowlu-buildings', { type: 'vector', tiles: [`${tileServerUrl}/lowlu_final_buildings/{z}/{x}/{y}`] });
        map.addLayer({ id: 'context-buildings-fill', type: 'fill', source: 'lowlu-buildings', 'source-layer': 'lowlu_final_buildings', layout: { visibility: contextVisibility }, paint: { 'fill-color': '#6F8443', 'fill-opacity': 0.5 } });
        map.addLayer({ id: 'context-buildings-outline', type: 'line', source: 'lowlu-buildings', 'source-layer': 'lowlu_final_buildings', layout: { visibility: contextVisibility }, paint: { 'line-color': '#454E3A', 'line-width': 1 } });
      }
      map.addSource('sites', { type: 'geojson', data: geoJson });
      map.addLayer({ id: 'site-points', type: 'circle', source: 'sites', paint: {
        'circle-radius': ['case', ['get', 'selected'], 10, 7],
        'circle-color': ['match', ['get', 'status'], 'accepted', '#517C78', 'dismissed', '#9D9D91', '#A67C7C'],
        'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
        'circle-stroke-color': ['case', ['get', 'selected'], '#2D2D2A', '#FEFFF8'],
        'circle-opacity': ['case', ['==', ['get', 'status'], 'dismissed'], 0.68, 1],
      } });
      map.on('mouseenter', 'site-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'site-points', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'site-points', event => {
        const id = Number(event.features?.[0]?.properties?.id);
        if (id) onSelectRef.current(id);
      });
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => map.getSource('sites')?.setData(geoJson);
    if (map.loaded()) update(); else map.once('load', update);
  }, [geoJson]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileServerUrl) return;
    const applyVisibility = () => CONTEXT_LAYER_IDS.forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', contextLayerOn ? 'visible' : 'none');
    });
    if (map.loaded()) applyVisibility(); else map.once('load', applyVisibility);
  }, [contextLayerOn]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    map.easeTo({ center: [Number(selected.lon), Number(selected.lat)], zoom: Math.max(map.getZoom(), 15), duration: 650, essential: true });
  }, [selected?.id]);

  return <section className="map-panel">
    <div ref={containerRef} className="map-canvas" aria-label="Map of shortlisted sites" />
    {mapFailed && <div className="fallback-map" aria-label="Coordinate map of shortlisted sites"><div className="fallback-river" /><span className="fallback-place place-north">North London</span><span className="fallback-place place-west">West London</span><span className="fallback-place place-central">Central London</span>{fallbackPoints.map(site => <button aria-label={site.site_name} title={site.site_name} key={site.id} className={`fallback-point ${site.status} ${selected?.id === site.id ? 'selected' : ''}`} style={{ left: site.left, top: site.top }} onClick={() => onSelect(site.id)} />)}<div className="fallback-note">Interactive coordinate view · live basemap available with WebGL2</div></div>}
    <div className="map-head"><span className="map-chip">Site geography · live map</span><span className="map-chip">{sites.length} points</span></div>
    {tileServerUrl
      ? <button type="button" className={`context-layer ${contextLayerOn ? 'active' : ''}`} aria-pressed={contextLayerOn} onClick={() => setContextLayerOn(on => !on)}><Layers3 size={13}/><span>Parcels & buildings</span></button>
      : <div className="context-layer" title="Tile server endpoint required before this layer can be enabled"><Layers3 size={13}/><span>Parcels & buildings</span><span className="coming-soon">Awaiting connection</span></div>}
    <div className="map-legend"><span><i className="legend-dot" style={{ background: 'var(--rose)' }}/> New</span><span><i className="legend-dot" style={{ background: 'var(--teal)' }}/> Accepted</span><span><i className="legend-dot" style={{ background: '#9d9d91' }}/> Dismissed</span></div>
  </section>;
}

function Detail({ site, onStatus }) {
  const confidence = site.voa_match_confidence && site.voa_match_confidence !== 'no match' ? 78 : 22;
  const siteQuery = encodeURIComponent(`${site.site_name}, ${site.borough}, London`);
  return <section className="detail-panel"><div className="detail-head">
      <div className="detail-head-top">
        <div className="detail-type">{site.type} · {site.priority}</div>
        <div className="decision-row"><button className={`decision ${site.status === 'accepted' ? 'accept' : ''}`} onClick={() => onStatus(site.id, site.status === 'accepted' ? 'new' : 'accepted')}>{site.status === 'accepted' ? <Check size={12}/> : null} {site.status === 'accepted' ? 'Accepted' : 'Accept site'}</button><button className="decision dismiss" onClick={() => onStatus(site.id, site.status === 'dismissed' ? 'new' : 'dismissed')}>{site.status === 'dismissed' ? <RotateCcw size={12}/> : <X size={12}/>} {site.status === 'dismissed' ? 'Restore' : 'Dismiss'}</button></div>
      </div>
      <div className="detail-head-title-row">
        <h2 className="detail-title">{site.site_name}</h2>
        <div className="detail-head-meta">
          <span className="detail-location">{site.borough}, London</span>
          <div className="research-links"><a href={`https://www.google.com/maps/search/?api=1&query=${siteQuery}`} target="_blank" rel="noreferrer">Google Maps <ExternalLink size={12}/></a><a href={`https://www.google.com/search?q=${siteQuery}+official+website`} target="_blank" rel="noreferrer">Find website <ExternalLink size={12}/></a><a href="https://search-property-information.service.gov.uk/search/search-by-address" target="_blank" rel="noreferrer">HM Land Registry <ExternalLink size={12}/></a></div>
        </div>
      </div>
    </div>
    <div className="detail-body"><div className="detail-grid"><div className="detail-stat"><label>Footprint</label><span>{area(site.footprint_m2)}</span></div><div className="detail-stat"><label>Spare land on title</label><span>{area(site.spare_land_on_title_m2)}</span></div><div className="detail-stat"><label>VOA rateable value</label><span>{money(site.voa_rateable_value)}</span></div><div className="detail-stat"><label>Nearby parking</label><span>{site.nearby_parking || 'Not recorded'}</span></div></div>
      <div className="detail-section detail-flag-row">
        <div className="detail-flag"><h3>VOA match confidence</h3><p>{site.voa_match_confidence || 'No match recorded'}</p><div className="confidence"><i style={{ width: `${confidence}%` }}/></div></div>
        <div className="detail-flag"><h3>Planning context</h3><p>{site.nearby_planning_applications || 'No planning information recorded.'}</p></div>
      </div>
      {(site.data_confidence_notes || site.spare_area_comments) && <div className="detail-section"><h3>Field notes</h3><p>{site.data_confidence_notes || site.spare_area_comments}</p>{site.data_confidence_notes && site.spare_area_comments && <p style={{ marginTop: 8 }}>{site.spare_area_comments}</p>}</div>}
    </div></section>;
}

function AdminOverview() {
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [section, setSection] = useState('clients');
  const [form, setForm] = useState({ name: '', slug: '', csvText: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [workspaceResponse, userResponse] = await Promise.all([api('/api/admin/workspaces'), api('/api/admin/users')]);
      setWorkspaces(workspaceResponse.workspaces || []);
      setUsers(userResponse.users || []);
    } catch (loadError) {
      setError(loadError.status === 403 ? 'Your account does not have platform-admin access.' : loadError.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadAdminData(); }, []);

  const updateUser = async (userId, body, message) => {
    setBusy(`user-${userId}`);
    try {
      await api(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
      setNotice(message);
      await loadAdminData();
    } catch (updateError) { setError(updateError.message); } finally { setBusy(''); }
  };
  const toggleMembership = async (userId, workspaceId, hasMembership) => {
    setBusy(`membership-${userId}-${workspaceId}`);
    try {
      await api(`/api/admin/users/${userId}/memberships${hasMembership ? `/${workspaceId}` : ''}`, {
        method: hasMembership ? 'DELETE' : 'POST',
        body: hasMembership ? undefined : JSON.stringify({ workspaceId }),
      });
      await loadAdminData();
    } catch (membershipError) { setError(membershipError.message); } finally { setBusy(''); }
  };
  const createWorkspace = async event => {
    event.preventDefault();
    setBusy('workspace');
    setError('');
    try {
      await api('/api/admin/workspaces', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', slug: '', csvText: '' });
      setFileName('');
      setNotice('Workspace created and site shortlist imported.');
      await loadAdminData();
    } catch (createError) { setError(createError.message); } finally { setBusy(''); }
  };
  const invite = async event => {
    event.preventDefault();
    setBusy('invite');
    try {
      await api('/api/admin/users/invite', { method: 'POST', body: JSON.stringify({ email: inviteEmail }) });
      setInviteEmail('');
      setNotice('Invitation sent. The recipient will land on the sign-up route.');
    } catch (inviteError) { setError(inviteError.message); } finally { setBusy(''); }
  };
  const readFile = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = loadEvent => setForm(current => ({ ...current, csvText: String(loadEvent.target.result || '') }));
    reader.readAsText(file);
  };

  if (loading) return <LoadingScreen label="Loading admin overview" />;
  if (error && !workspaces.length && !users.length) return <ErrorScreen message={error} onRetry={loadAdminData} />;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
      <div className="mobile-sidebar-close"><button onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="brand-kicker">Platform admin</div>
      <div className="brand-name">Site Selection</div>
      <div className="brand-sub">Admin overview</div>
      <div className="side-rule" />
      <div className="side-label">Manage</div>
      <nav className="side-nav">
        <button className={section === 'clients' ? 'active' : ''} onClick={() => { setSection('clients'); setMobileMenu(false); }}><span>Client workspaces</span><span className="side-count">{workspaces.length}</span></button>
        <button className={section === 'people' ? 'active' : ''} onClick={() => { setSection('people'); setMobileMenu(false); }}><span>People &amp; access</span><span className="side-count">{users.length}</span></button>
      </nav>
      <div className="side-footer"><div className="signature">ROSE TINSLEY Consulting<br/>Platform overview</div><div className="side-account"><UserButton afterSignOutUrl="/sign-in"/></div></div>
    </aside>
    <main className="main">
      <header className="topline">
        <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20}/></button>
        <div><div className="eyebrow">Platform admin</div><h1>{section === 'clients' ? 'Client workspaces' : 'People & access'}</h1><p className="intro">{section === 'clients' ? 'Create isolated client workspaces and open their shortlist.' : 'Invite users and control who can see each workspace.'}</p></div>
      </header>
      {(notice || error) && <div className={`admin-notice ${error ? 'is-error' : ''}`}>{error || notice}<button onClick={() => { setNotice(''); setError(''); }} aria-label="Dismiss notification"><X size={14}/></button></div>}
      {section === 'clients' ? <div className="admin-grid">
        <section className="admin-card create-card"><div className="admin-card-kicker">New client</div><h2>Create a workspace</h2><p>Import a separate site shortlist for a client. Their data will be isolated from every other workspace.</p><form onSubmit={createWorkspace}><label>Workspace name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Example: Acme Property Group"/></label><label>Workspace slug<input required value={form.slug} onChange={event => setForm({ ...form, slug: event.target.value })} placeholder="acme-property-group"/></label><label>Site shortlist CSV<textarea required value={form.csvText} onChange={event => setForm({ ...form, csvText: event.target.value })} placeholder="Paste the CSV export here, or upload it below." rows={6}/></label><label className="file-input">Upload CSV<input type="file" accept=".csv,text/csv" onChange={readFile}/><span>{fileName || 'Choose a file'}</span></label><button className="decision accept" disabled={busy === 'workspace'}>{busy === 'workspace' ? <LoaderCircle className="spin" size={13}/> : <ArrowRight size={13}/>} Create workspace</button></form></section>
        <section className="admin-card"><div className="admin-card-kicker">Client workspaces</div><h2>{workspaces.length} workspaces</h2><div className="workspace-table">{workspaces.map(workspace => <div className="workspace-row" key={workspace.id}><div><strong>{workspace.name}</strong><span>/{workspace.slug}</span></div><div className="row-metrics"><span>{workspace.site_count} sites</span><span>{workspace.member_count} members</span><Link className="quiet-link" to={`/workspace/${workspace.id}`}>View shortlist <ArrowRight size={12}/></Link></div></div>)}{!workspaces.length && <div className="admin-empty">Create the first workspace to begin.</div>}</div></section>
      </div> : <div className="admin-grid">
        <section className="admin-card invite-card"><div className="admin-card-kicker">Access</div><h2>Invite a user</h2><p>Send a Clerk invitation that routes through the dedicated sign-up page.</p><form onSubmit={invite} className="invite-form"><input required type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="name@company.com"/><button className="decision accept" disabled={busy === 'invite'}>{busy === 'invite' ? <LoaderCircle className="spin" size={13}/> : <Users size={13}/>} Send invite</button></form></section>
        <section className="admin-card users-card"><div className="admin-card-kicker">People</div><h2>{users.length} local users</h2><div className="users-list">{users.map(user => <UserRow key={user.id} user={user} workspaces={workspaces} busy={busy} onToggleAdmin={isPlatformAdmin => updateUser(user.id, { isPlatformAdmin }, `${user.email} admin access updated.`)} onToggleMembership={toggleMembership}/>) }{!users.length && <div className="admin-empty">Users appear here after their first authenticated request.</div>}</div></section>
      </div>}
    </main>
  </div>;
}

function UserRow({ user, workspaces, busy, onToggleAdmin, onToggleMembership }) {
  return <div className="user-row"><div className="user-row-top"><div><strong>{user.name || user.email}</strong><span>{user.name ? user.email : 'No display name set'}</span></div><button className={`admin-toggle ${user.is_platform_admin ? 'enabled' : ''}`} disabled={busy === `user-${user.id}`} onClick={() => onToggleAdmin(!user.is_platform_admin)}>{user.is_platform_admin ? <ShieldCheck size={13}/> : <ShieldCheck size={13}/>} {user.is_platform_admin ? 'Platform admin' : 'Make admin'}</button></div><div className="membership-list">{workspaces.map(workspace => { const active = user.memberships.some(item => item.id === workspace.id); const key = `membership-${user.id}-${workspace.id}`; return <button className={`membership-chip ${active ? 'active' : ''}`} disabled={busy === key} key={workspace.id} onClick={() => onToggleMembership(user.id, workspace.id, active)}>{active ? <Check size={11}/> : <PlusIcon/>}{workspace.name}</button>; })}</div></div>;
}

function PlusIcon() {
  return <span className="plus-icon">+</span>;
}

function App() {
  if (!clerkPublishableKey) return <ConfigurationNotice />;
  return <ClerkProvider publishableKey={clerkPublishableKey} proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL} appearance={AuthAppearance()}><BrowserRouter><Routes><Route path="/sign-in/*" element={<SignInRoute/>}/><Route path="/sign-up/*" element={<SignUpRoute/>}/><Route path="/admin/*" element={<AdminRoute/>}/><Route path="/workspace/:workspaceId" element={<ProtectedRoute><WorkspaceRoute/></ProtectedRoute>}/><Route path="*" element={<HomeRoute/>}/></Routes></BrowserRouter></ClerkProvider>;
}

createRoot(document.getElementById('root')).render(<App />);