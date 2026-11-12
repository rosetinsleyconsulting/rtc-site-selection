import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  GripVertical,
  Layers3,
  List,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Plus,
  RotateCcw,
  House,
  Search,
  Settings2,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import Grainient from './Grainient.jsx';
import Topography from './Topography.jsx';
import ReportBuilderRoute from './ReportBuilder.jsx';
import '../index.css';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;
let currentSession = null;
if (supabase) {
  supabase.auth.getSession().then(({ data }) => { currentSession = data.session; });
  supabase.auth.onAuthStateChange((_event, session) => { currentSession = session; });
}
// Required by the INSPIRE conditions of use (01 Data Register). The year is the release year we serve.
const INSPIRE_ATTRIBUTION = `Parcels: information subject to Crown copyright and database rights ${new Date().getFullYear()} and reproduced with the permission of HM Land Registry. The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights ${new Date().getFullYear()} Ordnance Survey AC0000851063. <a href="https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions" target="_blank" rel="noopener">Conditions</a>`;
// Map layer slots. Which tile source fills each slot is set per workspace (workspace_layers), and tiles
// come through the app's own /api route, which checks the user's access first.
const CONTEXT_LAYERS = [
  { key: 'parcels', label: 'Parcels', mapLayerIds: ['context-parcels'] },
  { key: 'buildings', label: 'Buildings', mapLayerIds: ['context-buildings-fill', 'context-buildings-outline'] },
];
const FALLBACK_MAP_CONFIG = {
  contextLayerDefaultOn: true,
  layerOrder: ['parcels', 'buildings'],
  symbology: {
    parcels: { color: '#5E7A8C', width: 1, opacity: 0.6 },
    buildingsFill: { color: '#6F8443', opacity: 0.5 },
    buildingsOutline: { color: '#454E3A', width: 1 },
    markers: { new: '#A67C7C', accepted: '#517C78', dismissed: '#9D9D91' },
  },
  zoomRanges: {
    parcels: { minZoom: 15, maxZoom: 24 },
    buildings: { minZoom: 0, maxZoom: 24 },
  },
};
export const numberValue = value => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
export const area = value => {
  const parsed = numberValue(value);
  return parsed === null ? 'Not recorded' : `${parsed.toLocaleString('en-GB', { maximumFractionDigits: 0 })} m²`;
};
export const normalize = value => (value || '').toLowerCase();
const REVIEW_FLAG_COLORS = {
  'Good Candidate': '#6F8443',
  'Public Park Caution': '#C9A227',
  'Limited/Shared Space': '#8C7851',
  'False Positive': '#B33A3A',
  'No Usable Space': '#6B6B6B',
};
const reviewFlagColor = flag => REVIEW_FLAG_COLORS[flag] || '#999999';

export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {}),
      ...(options.headers || {}),
    },
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
      <h1>Connect the client login</h1>
      <p>Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to the environment, then restart the app to enable the private workspace.</p>
      <p className="config-note">The shortlist UI and server health check are ready; no site data is exposed until Supabase is configured.</p>
    </div>
  </div>;
}

const AuthContext = createContext({ session: null, loading: true });
function useSession() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function SignOutButton() {
  return <button type="button" className="sign-out-button" onClick={() => supabase.auth.signOut()} aria-label="Sign out" title="Sign out"><LogOut size={14}/></button>;
}

// Sign-in and sign-up match the website hero: brand moss contour lines (React Bits topography) on
// charcoal, kept low-glow, with the hero's grain and bottom fade over the top.
// Still for reduced motion; the lines are skipped where WebGL2 is missing (charcoal and grain remain).
function AuthBackground() {
  const webgl = Boolean(document.createElement('canvas').getContext('webgl2'));
  const still = prefersReducedMotion();
  return <>
    {webgl && <div className="auth-topography" aria-hidden="true">
      {/* detail 0 and morph 0 keep the contours clean and smooth: no fine-noise jitter, no shape warping */}
      <Topography color="#6F8443" lineCount={18} lineWidth={1} majorLines glow={0.18} fog={0.55} brightness={0.62} tilt={30}
        detail={0} morph={0} scale={0.8} mouseStrength={0.3} trail={0.1}
        speed={still ? 0 : 0.08} intro={!still} mouseInteraction={!still} dpr={Math.min(window.devicePixelRatio || 1, 1.5)}/>
    </div>}
    <div className="auth-grain" aria-hidden="true"/>
    <div className="auth-vignette" aria-hidden="true"/>
  </>;
}

function AuthShell({ children }) {
  return <div className="auth-screen">
    <AuthBackground/>
    {/* Same type-set logo as the website nav (GitHub/website/src/components/Nav.astro) */}
    <a href="https://rosetinsleyconsulting.com" className="rtc-logo" aria-label="Rose Tinsley Consulting – website">
      <span className="rtc-logo-name">ROSE TINSLEY</span>
      <span className="rtc-logo-descriptor">C O N S U L T I N G</span>
    </a>
    <main className="auth-main">{children}</main>
  </div>;
}

function AuthForm({ title, error, busy, onSubmit, children, footer }) {
  return <AuthShell><form className="auth-card" onSubmit={onSubmit}>
    <h1 className="auth-title">{title}</h1>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {children}
    <button className="auth-primary decision accept" disabled={busy}>{busy && <LoaderCircle className="spin" size={14}/>}Continue</button>
    {footer}
  </form></AuthShell>;
}

function SignInRoute() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) return setError(signInError.message);
    navigate('/');
  };

  return <AuthForm
    title="Sign in"
    error={error}
    busy={busy}
    onSubmit={submit}
    footer={<p className="auth-note">Access is by invitation. Your invite email has a link to set up your account.</p>}
  >
    <label>Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
  </AuthForm>;
}

function SignUpRoute() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  if (loading) return <LoadingScreen label="Loading" />;

  if (session) {
    const finishInvite = async event => {
      event.preventDefault();
      setBusy(true);
      setError('');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (updateError) return setError(updateError.message);
      navigate('/');
    };
    return <AuthForm title="Set your password" error={error} busy={busy} onSubmit={finishInvite}>
      <label>New password<input type="password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} /></label>
    </AuthForm>;
  }

  if (confirmSent) {
    return <AuthShell><div className="auth-card">
      <h1 className="auth-title">Check your email</h1>
      <p>We've sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.</p>
      <Link className="auth-link" to="/sign-in">Back to sign in</Link>
    </div></AuthShell>;
  }

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (signUpError) return setError(signUpError.message);
    if (!data.session) return setConfirmSent(true);
    navigate('/');
  };

  return <AuthForm
    title="Create an account"
    error={error}
    busy={busy}
    onSubmit={submit}
    footer={<Link className="auth-link" to="/sign-in">Already have an account? Sign in</Link>}
  >
    <label>Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} /></label>
  </AuthForm>;
}

function ProtectedRoute({ children }) {
  const { session, loading } = useSession();
  if (loading) return <LoadingScreen label="Checking your session" />;
  return session ? children : <Navigate to="/sign-in" replace />;
}

function HomeRoute() {
  const { session, loading } = useSession();
  if (loading) return <LoadingScreen label="Checking your session" />;
  // Signed-out visitors (e.g. from the website's Client Login button) go straight to sign-in
  return session ? <Home /> : <Navigate to="/sign-in" replace />;
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
  // Falls back to the pre-Nov 2026 key so people keep their last workspace after the rename
  const [workspaceId, setWorkspaceId] = useState(() => Number(localStorage.getItem('site-selection-workspace-id') || localStorage.getItem('lowlu-workspace-id')) || null);

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
    if (workspaceId) localStorage.setItem('site-selection-workspace-id', String(workspaceId));
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

export function LoadingScreen({ label }) {
  return <div className="center-screen"><LoaderCircle className="spin" size={20}/><span>{label}</span></div>;
}

export function ErrorScreen({ message, onRetry }) {
  return <div className="center-screen"><div className="center-card"><h1>We couldn’t load this view.</h1><p>{message}</p><div className="decision-row"><button className="decision accept" onClick={onRetry}>Try again</button><button className="decision" onClick={() => supabase.auth.signOut()}>Sign out</button></div></div></div>;
}

function NoAccessState() {
  return <div className="center-screen"><div className="center-card"><h1>No workspace access yet.</h1><p>Your account is active, but an administrator has not granted access to a client workspace.</p><div className="center-account"><SignOutButton/><span>Signed in — switch account or sign out</span></div><div className="center-signature">ROSE TINSLEY Consulting</div></div></div>;
}

const THEME_KEY = 'rtc-site-selection-theme';
const BASEMAP_KEY = 'rtc-site-selection-basemap';

// Panel theme shared by the map workspace and Admin: dark by default, remembered per browser.
// Storage can be blocked, so fall back quietly.
export function usePanelTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* not persisted */ }
  }, [theme]);
  return [theme, setTheme];
}

export function ThemeToggle({ theme, setTheme, className }) {
  return <button type="button" className={className} onClick={() => setTheme(current => (current === 'dark' ? 'light' : 'dark'))} aria-label={theme === 'dark' ? 'Switch to light panels' : 'Switch to dark panels'} title={theme === 'dark' ? 'Light panels' : 'Dark panels'}>
    {theme === 'dark' ? <Sun size={15}/> : <Moon size={15}/>}
  </button>;
}

// Raster basemaps from OpenStreetMap and OpenTopoMap (free with attribution). Greys are made in the renderer:
// saturation -1 removes colour, and brightness-min above brightness-max inverts the tiles for the dark map.
const BASEMAPS = {
  light: { label: 'Light grey', source: 'osm', paint: { 'raster-saturation': -1, 'raster-contrast': -0.15, 'raster-brightness-min': 0.12, 'raster-brightness-max': 1, 'raster-opacity': 1 } },
  dark: { label: 'Dark grey', source: 'osm', paint: { 'raster-saturation': -1, 'raster-contrast': -0.1, 'raster-brightness-min': 0.86, 'raster-brightness-max': 0.24, 'raster-opacity': 1 } },
  streets: { label: 'Streets', source: 'osm', paint: { 'raster-saturation': 0, 'raster-contrast': 0, 'raster-brightness-min': 0, 'raster-brightness-max': 1, 'raster-opacity': 1 } },
  topo: { label: 'Topographic', source: 'topo', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0, 'raster-brightness-min': 0, 'raster-brightness-max': 1, 'raster-opacity': 1 } },
};
const BASEMAP_CHOICES = [
  { key: 'auto', label: 'Match theme', note: 'Light grey or dark grey' },
  { key: 'light', label: 'Light grey' },
  { key: 'dark', label: 'Dark grey' },
  { key: 'streets', label: 'Streets', note: 'Full colour' },
  { key: 'topo', label: 'Topographic', note: 'Contours and terrain' },
];

// Website-style grain gradient behind the side panels. Deep forest in dark, pale sage in light.
// Slow by design; still for reduced motion; skipped on phones, where panels are plain sheets.
// Dark is kept subtle: close colours, low contrast, broad soft shapes on a diagonal so it never reads as stripes.
const PANEL_GRADIENTS = {
  dark: { color1: '#2B3325', color2: '#232920', color3: '#1C2018', contrast: 0.9, saturation: 0.8, grainAmount: 0.03, blendAngle: 35, blendSoftness: 0.35, warpStrength: 0.4, rotationAmount: 90, zoom: 1.4 },
  light: { color1: '#E3E9D3', color2: '#EEF1E3', color3: '#FBFCF4', contrast: 1.0, saturation: 0.9, grainAmount: 0.035, warpStrength: 0.75, rotationAmount: 210, zoom: 0.85 },
};
const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const isPhone = () => Boolean(window.matchMedia?.('(max-width: 700px)').matches);

export function PanelBackground({ theme }) {
  if (isPhone() || !document.createElement('canvas').getContext('webgl2')) return null;
  return <div className="panel-bg" aria-hidden="true">
    <Grainient timeSpeed={0.05} warpSpeed={0.5} warpFrequency={3.5} warpAmplitude={75} noiseScale={1.8} {...PANEL_GRADIENTS[theme]} static={prefersReducedMotion()}/>
  </div>;
}

function ShortlistWorkspace({ profile, workspaces, workspace, onWorkspaceChange }) {
  const [sites, setSites] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [borough, setBorough] = useState('All boroughs');
  const [category, setCategory] = useState('All categories');
  const [reviewFlag, setReviewFlag] = useState('All flags');
  const [sortOrder, setSortOrder] = useState('default');
  const [appraisalFilter, setAppraisalFilter] = useState('all');
  const [appraisalOffer, setAppraisalOffer] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // One docked tool panel at a time, opened from the action bar (Esri Map Viewer pattern)
  const [activePanel, setActivePanel] = useState(() => (window.matchMedia?.('(max-width: 700px)').matches ? null : 'sites'));
  // "View as client": an admin sees the workspace exactly as its members do. UI only: the server still treats
  // the user as an admin, so this is a preview, not impersonation. Kept in the URL (?view=client) so it survives
  // a reload and the back button exits it.
  const [searchParams, setSearchParams] = useSearchParams();
  const clientPreview = profile.isPlatformAdmin && searchParams.get('view') === 'client';
  const asAdmin = profile.isPlatformAdmin && !clientPreview;
  const setClientPreview = on => {
    const next = new URLSearchParams(searchParams);
    if (on) next.set('view', 'client'); else next.delete('view');
    setSearchParams(next);
    if (on) setActivePanel(current => (current === 'settings' ? null : current));
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapConfig, setMapConfig] = useState(null);
  // Tile layers this workspace is allowed, one per slot (parcels / buildings). Empty means sites only.
  const [contextLayers, setContextLayers] = useState([]);
  const [layerOverrides, setLayerOverrides] = useState(null);
  // Constraint layers (SSSI, green belt...) assigned to this workspace; any number, all off until switched on
  const [constraintLayers, setConstraintLayers] = useState([]);
  const [constraintsOn, setConstraintsOn] = useState({});
  const toggleConstraint = sourceId => setConstraintsOn(current => ({ ...current, [sourceId]: !current[sourceId] }));
  const [theme, setTheme] = usePanelTheme();
  const [basemapChoice, setBasemapChoice] = useState(() => {
    try { const stored = localStorage.getItem(BASEMAP_KEY); return BASEMAP_CHOICES.some(item => item.key === stored) ? stored : 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    try { localStorage.setItem(BASEMAP_KEY, basemapChoice); } catch { /* not persisted */ }
  }, [basemapChoice]);
  const basemap = basemapChoice === 'auto' ? (theme === 'dark' ? 'dark' : 'light') : basemapChoice;

  const loadSites = async () => {
    setLoading(true);
    setError('');
    try {
      const [sitesResponse, configResponse, layersResponse] = await Promise.all([
        api(`/api/workspaces/${workspace.id}/sites`),
        api(`/api/workspaces/${workspace.id}/map-config`),
        api(`/api/workspaces/${workspace.id}/layers`),
      ]);
      setSites(sitesResponse.sites || []);
      setAppraisalOffer(sitesResponse.appraisalOffer || null);
      setMapConfig(configResponse.mapConfig);
      setContextLayers(layersResponse.layers || []);
      setConstraintLayers(layersResponse.constraints || []);
      // Legacy: imports statuses saved in the browser by the old single-client Replit app. Key names must match what it wrote.
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
  const reviewFlags = useMemo(() => [...new Set(sites.map(site => site.review_flag).filter(Boolean))].sort(), [sites]);
  const filtered = useMemo(() => {
    const result = sites.filter(site =>
      (statusFilter === 'all' || site.status === statusFilter)
      && (borough === 'All boroughs' || site.borough === borough)
      && (category === 'All categories' || site.category === category)
      && (reviewFlag === 'All flags' || site.review_flag === reviewFlag)
      && (appraisalFilter === 'all' || (appraisalFilter === 'open') === isOpenAppraisal(site.appraisal_status))
      && (!query || normalize(`${site.site_name} ${site.borough} ${site.category}`).includes(normalize(query)))
    );
    if (sortOrder === 'az') result.sort((a, b) => a.site_name.localeCompare(b.site_name));
    return result;
  }, [sites, statusFilter, borough, category, reviewFlag, appraisalFilter, query, sortOrder]);
  const selected = filtered.find(site => site.id === selectedId) || null;
  const selectSite = id => { setSelectedId(id); setInspectorOpen(true); };
  const counts = {
    all: sites.length,
    new: sites.filter(site => site.status === 'new').length,
    accepted: sites.filter(site => site.status === 'accepted').length,
    dismissed: sites.filter(site => site.status === 'dismissed').length,
    appraisals: sites.filter(site => isOpenAppraisal(site.appraisal_status)).length,
  };

  // Request and withdraw throw on failure so the site panel can show the error beside the form
  const requestAppraisal = async (siteId, notes) => {
    const { request } = await api(`/api/workspaces/${workspace.id}/sites/${siteId}/appraisal-requests`, { method: 'POST', body: JSON.stringify({ notes }) });
    setSites(current => current.map(site => site.id === siteId ? { ...site, appraisal_id: request.id, appraisal_status: request.status, appraisal_requested_at: request.createdAt, appraisal_price_pence: request.pricePence } : site));
  };
  const cancelAppraisal = async site => {
    await api(`/api/workspaces/${workspace.id}/appraisal-requests/${site.appraisal_id}/cancel`, { method: 'POST' });
    setSites(current => current.map(item => item.id === site.id ? { ...item, appraisal_status: 'cancelled' } : item));
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

  const config = mapConfig || FALLBACK_MAP_CONFIG;
  const markerColors = config.symbology.markers;
  const statusInk = { '--st-new': markerColors.new, '--st-accepted': markerColors.accepted, '--st-dismissed': markerColors.dismissed };
  const availableLayers = Object.fromEntries(contextLayers.map(layer => [layer.role, layer]));
  const layerVisibility = layerOverrides || Object.fromEntries(CONTEXT_LAYERS.map(layer => [layer.key, Boolean(availableLayers[layer.key]) && Boolean(config.contextLayerDefaultOn)]));
  const toggleLayer = key => setLayerOverrides({ ...layerVisibility, [key]: !layerVisibility[key] });
  const orderedContextLayers = config.layerOrder.filter(key => availableLayers[key]).map(key => ({ key, label: availableLayers[key].label }));
  // Constraint layers grouped under their section heading, keeping the server's sort order
  const constraintSections = [...constraintLayers.reduce((groups, layer) => {
    const section = layer.section || 'Other';
    return groups.set(section, [...(groups.get(section) || []), layer]);
  }, new Map())];
  const filtersActive = statusFilter !== 'all' || borough !== 'All boroughs' || category !== 'All categories' || reviewFlag !== 'All flags' || appraisalFilter !== 'all';
  const resetFilters = () => { setStatusFilter('all'); setBorough('All boroughs'); setCategory('All categories'); setReviewFlag('All flags'); setAppraisalFilter('all'); setSortOrder('default'); };
  const togglePanel = key => setActivePanel(current => (current === key ? null : key));
  const tools = [
    { key: 'sites', label: 'Sites', icon: List },
    { key: 'filters', label: 'Filters', icon: SlidersHorizontal, badge: filtersActive },
    { key: 'layers', label: 'Layers', icon: Layers3 },
    { key: 'legend', label: 'Legend', icon: Shapes },
    ...(asAdmin ? [{ key: 'settings', label: 'Styling', icon: Settings2, admin: true }] : []),
  ];
  const panelTitles = { sites: 'Sites', filters: 'Filters', layers: 'Layers', legend: 'Legend', settings: 'Map styling' };

  return <div className="gis-shell" data-theme={theme} style={statusInk}>
    <div className={`gis-body ${activePanel ? 'has-panel' : ''}`}>
      <div className="left-dock">
      <PanelBackground theme={theme}/>
      <nav className="action-bar" aria-label="Map tools">
        {tools.map(({ key, label, icon: Icon, badge, admin }) => <button
          type="button"
          key={key}
          className={`action-button ${activePanel === key ? 'active' : ''} ${admin ? 'is-admin' : ''}`}
          aria-pressed={activePanel === key}
          onClick={() => togglePanel(key)}
          title={admin ? `${label} (admin only)` : label}>
          <Icon size={18}/>
          <span>{label}</span>
          {badge && <i className="action-badge" aria-label="Filters applied"/>}
        </button>)}
      </nav>
      {activePanel && <aside className="tool-panel" aria-label={panelTitles[activePanel]}>
        <header className="tool-panel-head">
          <h2>{panelTitles[activePanel]}{activePanel === 'settings' && <span className="admin-only-tag"><ShieldCheck size={12}/>Admin only</span>}</h2>
          <button type="button" className="inspector-close" onClick={() => setActivePanel(null)} aria-label={`Close ${panelTitles[activePanel]}`} title="Close"><X size={16}/></button>
        </header>
        {activePanel === 'sites' && <div className="tool-panel-body is-list">
            <label className="index-search"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search sites, boroughs, categories" aria-label="Search sites"/>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13}/></button>}</label>
            <div className="result-note">
              {filtered.length === sites.length ? `${sites.length.toLocaleString('en-GB')} sites` : `${filtered.length.toLocaleString('en-GB')} of ${sites.length.toLocaleString('en-GB')} sites`}
              {filtersActive && <button type="button" className="adm-link-button" onClick={resetFilters}>Clear filters</button>}
            </div>
            <div className="site-list" onMouseLeave={() => setHoveredId(null)}>{filtered.length ? filtered.map(site => <button
              className={`site-row is-${site.status} ${selected?.id === site.id ? 'selected' : ''} ${hoveredId === site.id ? 'hovered' : ''}`}
              key={site.id}
              aria-pressed={selected?.id === site.id}
              onClick={() => selectSite(site.id)}
              onMouseEnter={() => setHoveredId(site.id)}
              onFocus={() => setHoveredId(site.id)}
              onBlur={() => setHoveredId(null)}>
              <span className="site-row-head"><span className="site-row-title">{site.site_name}</span><StatusMark status={site.status}/></span>
              <span className="site-row-meta">{[site.borough, site.category].filter(Boolean).join(' · ')}</span>
              <span className="site-row-figures">
                <Figure value={site.footprint_m2} label="footprint"/>
                {site.review_flag
                  ? <span className="flag"><i style={{ background: reviewFlagColor(site.review_flag) }}/>{site.review_flag}</span>
                  : <Figure value={site.spare_land_on_title_m2} label="spare on title"/>}
                {isOpenAppraisal(site.appraisal_status) && <span className="appraisal-tag"><i aria-hidden="true"/>{APPRAISAL_LABELS[site.appraisal_status]}</span>}
              </span>
            </button>) : <div className="empty"><h2>No sites match</h2><p>Clear a filter or search a different part of the shortlist.</p></div>}</div>
        </div>}
        {activePanel === 'filters' && <div className="tool-panel-body">
          <div className="panel-group">
            <h3>Review status</h3>
            <div className="status-filter">
              {['all', 'new', 'accepted', 'dismissed'].map(key => <button type="button" key={key} className={statusFilter === key ? 'active' : ''} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)}>
                {key !== 'all' && <i style={{ background: markerColors[key] }} aria-hidden="true"/>}
                <span>{key === 'all' ? 'All sites' : STATUS_LABELS[key]}</span><b>{counts[key]}</b>
              </button>)}
            </div>
          </div>
          <label className="panel-field"><span>Borough</span><select value={borough} onChange={event => setBorough(event.target.value)}><option>All boroughs</option>{boroughs.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="panel-field"><span>Site category</span><select value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
          {reviewFlags.length > 0 && <label className="panel-field"><span>Review flag</span><select value={reviewFlag} onChange={event => setReviewFlag(event.target.value)}><option>All flags</option>{reviewFlags.map(item => <option key={item}>{item}</option>)}</select></label>}
          <label className="panel-field"><span>Site appraisal</span><select value={appraisalFilter} onChange={event => setAppraisalFilter(event.target.value)}><option value="all">All sites</option><option value="open">Appraisal requested or in progress</option><option value="none">No open appraisal</option></select></label>
          <label className="panel-field"><span>Sort list by</span><select value={sortOrder} onChange={event => setSortOrder(event.target.value)}><option value="default">Default order</option><option value="az">Name (A–Z)</option></select></label>
          <div className="panel-foot">
            <span>{filtered.length.toLocaleString('en-GB')} of {sites.length.toLocaleString('en-GB')} sites shown</span>
            <button type="button" className="decision" onClick={resetFilters} disabled={!filtersActive && sortOrder === 'default'}><RotateCcw size={13}/>Reset</button>
          </div>
        </div>}
        {activePanel === 'layers' && <div className="tool-panel-body">
          <div className="panel-group">
            <h3>Operational layers</h3>
            <label className="layer-toggle is-locked"><input type="checkbox" checked disabled/><span className="layer-toggle-swatch is-points" style={{ background: markerColors.new }}/>Shortlisted sites</label>
            {orderedContextLayers.length
              ? orderedContextLayers.map(layer => <label key={layer.key} className="layer-toggle">
                  <input type="checkbox" checked={Boolean(layerVisibility[layer.key])} onChange={() => toggleLayer(layer.key)}/>
                  <span className="layer-toggle-swatch" style={layer.key === 'parcels' ? { borderColor: config.symbology.parcels.color } : { background: config.symbology.buildingsFill.color, borderColor: config.symbology.buildingsOutline.color }}/>
                  {layer.label}
                  {layer.key === 'parcels' && <small>from zoom {config.zoomRanges.parcels.minZoom}</small>}
                </label>)
              : <p className="panel-note">No context layers have been added to this workspace yet.</p>}
          </div>
          {constraintSections.map(([section, layers]) => <div className="panel-group" key={section}>
            <h3>{section === 'Other' ? 'Constraints' : `${section} constraints`}</h3>
            {layers.map(layer => <label key={layer.source_id} className="layer-toggle">
              <input type="checkbox" checked={Boolean(constraintsOn[layer.source_id])} onChange={() => toggleConstraint(layer.source_id)}/>
              <span className="layer-toggle-swatch" style={{ background: `${layer.colour}59`, borderColor: layer.colour }}/>
              {layer.label}
            </label>)}
          </div>)}
          {constraintLayers.length > 0 && <p className="panel-note">Click a shaded area on the map to see its name.</p>}
          <div className="panel-group">
            <h3>Basemap</h3>
            <div className="basemap-choices" role="radiogroup" aria-label="Basemap">
              {BASEMAP_CHOICES.map(choice => <label key={choice.key} className={`basemap-choice ${basemapChoice === choice.key ? 'active' : ''}`}>
                <input type="radio" name="basemap" value={choice.key} checked={basemapChoice === choice.key} onChange={() => setBasemapChoice(choice.key)}/>
                <span className={`basemap-swatch is-${choice.key === 'auto' ? (theme === 'dark' ? 'dark' : 'light') : choice.key}`} aria-hidden="true"/>
                <span className="basemap-choice-text"><b>{choice.label}</b>{choice.note && <small>{choice.note}</small>}</span>
              </label>)}
            </div>
          </div>
        </div>}
        {activePanel === 'legend' && <div className="tool-panel-body">
          <div className="panel-group">
            <h3>Shortlisted sites</h3>
            <ul className="legend-list">
              {['new', 'accepted', 'dismissed'].map(status => <li key={status}><i className="is-point" style={{ background: markerColors[status] }}/>{STATUS_LABELS[status]}<b>{counts[status]}</b></li>)}
              <li><i className="is-point is-ring" style={{ borderColor: APPRAISAL_RING }}/>Appraisal requested<b>{counts.appraisals}</b></li>
            </ul>
          </div>
          {orderedContextLayers.length > 0 && <div className="panel-group">
            <h3>Context</h3>
            <ul className="legend-list">
              {availableLayers.parcels && <li><i className="is-line" style={{ borderColor: config.symbology.parcels.color }}/>{availableLayers.parcels.label}</li>}
              {availableLayers.buildings && <li><i className="is-fill" style={{ background: config.symbology.buildingsFill.color, borderColor: config.symbology.buildingsOutline.color }}/>{availableLayers.buildings.label}</li>}
            </ul>
          </div>}
          {constraintLayers.some(layer => constraintsOn[layer.source_id]) && <div className="panel-group">
            <h3>Constraints</h3>
            <ul className="legend-list">
              {constraintLayers.filter(layer => constraintsOn[layer.source_id]).map(layer => <li key={layer.source_id}><i className="is-fill" style={{ background: `${layer.colour}59`, borderColor: layer.colour }}/>{layer.label}</li>)}
            </ul>
          </div>}
          {reviewFlags.length > 0 && <div className="panel-group">
            <h3>Review flags</h3>
            <ul className="legend-list">{reviewFlags.map(flag => <li key={flag}><i className="is-point" style={{ background: reviewFlagColor(flag) }}/>{flag}</li>)}</ul>
          </div>}
        </div>}
        {activePanel === 'settings' && asAdmin && mapConfig && <div className="tool-panel-body">
          <AdminMapSettings workspace={workspace} mapConfig={mapConfig} onSaved={setMapConfig}/>
        </div>}
      </aside>}
      </div>
      <main className={`map-area ${selected && inspectorOpen ? 'inspector-open' : ''}`}>
        <MapPanel key={workspace.id} workspaceId={workspace.id} contextLayers={contextLayers} constraintLayers={constraintLayers} constraintsOn={constraintsOn} sites={filtered} selected={selected} onSelect={selectSite} hoveredId={hoveredId} onHover={setHoveredId} mapConfig={mapConfig} layerVisibility={layerVisibility} inspectorOpen={Boolean(selected && inspectorOpen)} basemap={basemap}/>
        {/* Floating over the map: workspace and site counts top centre (counts double as status filters), account tools top right */}
        <div className="map-pills" role="group" aria-label="Shortlist summary">
          {workspaces.length > 1
            ? <select className="map-pill is-workspace" value={workspace.id} onChange={event => onWorkspaceChange(Number(event.target.value))} aria-label="Client workspace">{workspaces.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
            : <span className="map-pill is-workspace">{workspace.name}</span>}
          {['all', 'new', 'accepted', 'dismissed'].map(key => <button type="button" key={key} className={`map-pill ${statusFilter === key && key !== 'all' ? 'active' : ''}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(current => (current === key ? 'all' : key))} title={key === 'all' ? 'Show all sites' : `Show only ${STATUS_LABELS[key].toLowerCase()}`}>
            {key !== 'all' && <i style={{ background: markerColors[key] }} aria-hidden="true"/>}
            <b>{counts[key].toLocaleString('en-GB')}</b><span className="map-pill-label">{key === 'all' ? 'sites' : STATUS_LABELS[key].toLowerCase()}</span>
          </button>)}
          {counts.appraisals > 0 && <button type="button" className={`map-pill ${appraisalFilter === 'open' ? 'active' : ''}`} aria-pressed={appraisalFilter === 'open'} onClick={() => setAppraisalFilter(current => (current === 'open' ? 'all' : 'open'))} title="Show only sites with an open appraisal">
            <i className="is-ring" style={{ borderColor: APPRAISAL_RING }} aria-hidden="true"/><b>{counts.appraisals}</b><span className="map-pill-label">{counts.appraisals === 1 ? 'appraisal' : 'appraisals'}</span>
          </button>}
        </div>
        <div className="map-account" role="group" aria-label="Account">
          {asAdmin && <button type="button" className="map-pill is-link" onClick={() => setClientPreview(true)} title={`See this workspace as ${workspace.name}'s members do`}><Eye size={14}/><span className="map-pill-label">View as client</span></button>}
          {asAdmin && <Link to="/admin" className="map-pill is-link" title="Admin overview"><ShieldCheck size={14}/><span className="map-pill-label">Admin</span></Link>}
          <ThemeToggle theme={theme} setTheme={setTheme} className="map-pill is-icon"/>
          <SignOutButton/>
        </div>
        {clientPreview && <div className="client-preview-bar" role="status">
          <Eye size={15} aria-hidden="true"/>
          <span><b>Client view.</b> You're seeing {workspace.name} as its members do. Admin tools are hidden.</span>
          <button type="button" onClick={() => setClientPreview(false)}><ShieldCheck size={13}/>Exit client view</button>
        </div>}
        <aside className={`inspector-panel ${selected && inspectorOpen ? 'open' : ''}`}>
          {selected && inspectorOpen && <PanelBackground theme={theme}/>}
          <div className="inspector-scroll">
            {selected && <Detail site={selected} onStatus={setStatus} onClose={() => setInspectorOpen(false)} appraisalOffer={appraisalOffer} onRequestAppraisal={requestAppraisal} onCancelAppraisal={cancelAppraisal}/>}
          </div>
        </aside>
      </main>
    </div>
  </div>;
}

function MapPanel({ workspaceId, contextLayers, constraintLayers = [], constraintsOn = {}, sites, selected, onSelect, hoveredId, onHover, mapConfig, layerVisibility, inspectorOpen, basemap }) {
  const basemapRef = useRef(basemap);
  basemapRef.current = basemap;
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const readyRef = useRef(false);
  const hoveredRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const configRef = useRef(mapConfig || FALLBACK_MAP_CONFIG);
  const [mapFailed, setMapFailed] = useState(false);
  const constraintsOnRef = useRef(constraintsOn);
  constraintsOnRef.current = constraintsOn;
  const inspectorOpenRef = useRef(inspectorOpen);
  inspectorOpenRef.current = inspectorOpen;
  onSelectRef.current = onSelect;
  onHoverRef.current = onHover;
  configRef.current = mapConfig || FALLBACK_MAP_CONFIG;
  const geoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: sites.map(site => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(site.lon), Number(site.lat)] },
      properties: { id: site.id, status: site.status, selected: selected?.id === site.id, appraisal: isOpenAppraisal(site.appraisal_status) },
      id: site.id,
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

  const geoJsonRef = useRef(geoJson);
  geoJsonRef.current = geoJson;
  const fitToSites = (duration = 600) => {
    const map = mapRef.current;
    const coords = geoJsonRef.current.features.map(feature => feature.geometry.coordinates).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
    if (!map || !coords.length) return;
    const bounds = coords.reduce((acc, point) => acc.extend(point), new maplibregl.LngLatBounds(coords[0], coords[0]));
    const width = containerRef.current?.clientWidth || 0;
    const right = inspectorOpenRef.current && width > 700 ? Math.min(460, Math.round(width * 0.5)) : 56;
    map.fitBounds(bounds, { padding: { top: 56, right, bottom: 56, left: 56 }, maxZoom: 14, duration });
  };

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
      // Our own tile route needs the signed-in user's token; third-party basemap requests are left alone
      transformRequest: url => (url.startsWith(`${window.location.origin}/api/`) && currentSession?.access_token
        ? { url, headers: { Authorization: `Bearer ${currentSession.access_token}` } }
        : { url }),
      style: {
        version: 8,
        sources: {
          osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
          topo: { type: 'raster', tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 17, attribution: 'Map style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), data © OpenStreetMap contributors' },
        },
        // Both basemap layers always exist; the chosen one is visible and the other hidden (see applyBasemap)
        layers: [
          { id: 'basemap-osm', type: 'raster', source: 'osm', layout: { visibility: BASEMAPS[basemapRef.current].source === 'osm' ? 'visible' : 'none' }, paint: BASEMAPS[basemapRef.current].paint },
          { id: 'basemap-topo', type: 'raster', source: 'topo', layout: { visibility: BASEMAPS[basemapRef.current].source === 'topo' ? 'visible' : 'none' }, paint: BASEMAPS.topo.paint },
        ],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      const config = configRef.current;
      // Tiles come from this app (same origin) with the user's token; see transformRequest
      const tileUrl = role => `${window.location.origin}/api/workspaces/${workspaceId}/tiles/${role}/{z}/{x}/{y}`;
      const sourceLayer = role => contextLayers.find(layer => layer.role === role)?.source_id;
      {
        const visibilityFor = key => (layerVisibility[key] ? 'visible' : 'none');
        const zoomRanges = config.zoomRanges || FALLBACK_MAP_CONFIG.zoomRanges;
        const { parcels, buildingsFill, buildingsOutline } = config.symbology;
        const addParcels = () => {
          if (!sourceLayer('parcels')) return;
          // HMLR INSPIRE Index Polygons (OGL): both statements are a licence condition wherever the parcels are shown
          map.addSource('context-parcels', { type: 'vector', tiles: [tileUrl('parcels')], attribution: INSPIRE_ATTRIBUTION });
          map.addLayer({ id: 'context-parcels', type: 'line', source: 'context-parcels', 'source-layer': sourceLayer('parcels'), minzoom: zoomRanges.parcels.minZoom, maxzoom: zoomRanges.parcels.maxZoom, layout: { visibility: visibilityFor('parcels') }, paint: { 'line-color': parcels.color, 'line-width': parcels.width, 'line-opacity': parcels.opacity } });
        };
        const addBuildings = () => {
          if (!sourceLayer('buildings')) return;
          map.addSource('context-buildings', { type: 'vector', tiles: [tileUrl('buildings')] });
          map.addLayer({ id: 'context-buildings-fill', type: 'fill', source: 'context-buildings', 'source-layer': sourceLayer('buildings'), minzoom: zoomRanges.buildings.minZoom, maxzoom: zoomRanges.buildings.maxZoom, layout: { visibility: visibilityFor('buildings') }, paint: { 'fill-color': buildingsFill.color, 'fill-opacity': buildingsFill.opacity } });
          map.addLayer({ id: 'context-buildings-outline', type: 'line', source: 'context-buildings', 'source-layer': sourceLayer('buildings'), minzoom: zoomRanges.buildings.minZoom, maxzoom: zoomRanges.buildings.maxZoom, layout: { visibility: visibilityFor('buildings') }, paint: { 'line-color': buildingsOutline.color, 'line-width': buildingsOutline.width } });
        };
        config.layerOrder.forEach(key => (key === 'parcels' ? addParcels : key === 'buildings' ? addBuildings : () => {})());
      }
      // Constraint layers sit above the context layers and below the site markers
      constraintLayers.forEach(layer => {
        const source = `constraint-${layer.source_id}`;
        const visibility = constraintsOnRef.current[layer.source_id] ? 'visible' : 'none';
        map.addSource(source, { type: 'vector', tiles: [`${window.location.origin}/api/workspaces/${workspaceId}/constraints/${layer.source_id}/{z}/{x}/{y}`] });
        map.addLayer({ id: `${source}-fill`, type: 'fill', source, 'source-layer': layer.source_id, layout: { visibility }, paint: { 'fill-color': layer.colour, 'fill-opacity': 0.25 } });
        map.addLayer({ id: `${source}-line`, type: 'line', source, 'source-layer': layer.source_id, layout: { visibility }, paint: { 'line-color': layer.colour, 'line-width': 1.2 } });
      });
      map.addSource('sites', { type: 'geojson', data: geoJson, promoteId: 'id' });
      map.addLayer({ id: 'site-points', type: 'circle', source: 'sites', paint: {
        'circle-radius': ['case', ['get', 'selected'], 10, ['boolean', ['feature-state', 'hover'], false], 9, 7],
        'circle-color': ['match', ['get', 'status'], 'accepted', config.symbology.markers.accepted, 'dismissed', config.symbology.markers.dismissed, config.symbology.markers.new],
        'circle-stroke-width': ['case', ['get', 'selected'], 3, ['boolean', ['feature-state', 'hover'], false], 2.5, ['get', 'appraisal'], 3, 2],
        // Sites with an open appraisal request carry a gold ring
        'circle-stroke-color': ['case', ['any', ['get', 'selected'], ['boolean', ['feature-state', 'hover'], false]], '#2D2D2A', ['get', 'appraisal'], APPRAISAL_RING, '#FEFFF8'],
        'circle-opacity': ['case', ['==', ['get', 'status'], 'dismissed'], 0.68, 1],
      } });
      map.on('mousemove', 'site-points', event => {
        map.getCanvas().style.cursor = 'pointer';
        const id = Number(event.features?.[0]?.properties?.id);
        if (id && id !== hoveredRef.current) onHoverRef.current?.(id);
      });
      map.on('mouseleave', 'site-points', () => { map.getCanvas().style.cursor = ''; onHoverRef.current?.(null); });
      // Open on the shortlist itself. Panels are docked beside the map, so no extra padding is needed for them.
      fitToSites(0);
      readyRef.current = true;
      map.on('click', 'site-points', event => {
        const id = Number(event.features?.[0]?.properties?.id);
        if (id) onSelectRef.current(id);
      });
      // Clicking a shaded constraint (not a site) names what's there
      const constraintFillIds = constraintLayers.map(layer => `constraint-${layer.source_id}-fill`);
      if (constraintFillIds.length) {
        const constraintPopup = new maplibregl.Popup({ closeButton: true, offset: 6, className: 'site-tip', maxWidth: '280px' });
        map.on('click', event => {
          if (map.queryRenderedFeatures(event.point, { layers: ['site-points'] }).length) return;
          const visibleIds = constraintFillIds.filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') === 'visible');
          const hits = visibleIds.length ? map.queryRenderedFeatures(event.point, { layers: visibleIds }) : [];
          if (!hits.length) { constraintPopup.remove(); return; }
          const content = document.createElement('div');
          hits.slice(0, 4).forEach(feature => {
            const layer = constraintLayers.find(item => feature.layer.id === `constraint-${item.source_id}-fill`);
            const name = document.createElement('strong');
            name.textContent = feature.properties.name || 'Unnamed area';
            const meta = document.createElement('span');
            meta.textContent = layer?.label || '';
            content.append(name, meta);
          });
          constraintPopup.setLngLat(event.lngLat).setDOMContent(content).addTo(map);
        });
      }
    });
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'site-tip', maxWidth: '260px' });
    return () => { popupRef.current?.remove(); map.remove(); mapRef.current = null; readyRef.current = false; };
  }, []);
  // The list and the map point at each other: hovering either one marks the site on the map and labels it.
  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !popup) return;
    const apply = () => {
      if (hoveredRef.current !== null && map.getSource('sites')) map.setFeatureState({ source: 'sites', id: hoveredRef.current }, { hover: false });
      hoveredRef.current = hoveredId ?? null;
      const site = hoveredId ? sites.find(item => item.id === hoveredId) : null;
      if (!site) { popup.remove(); return; }
      if (map.getSource('sites')) map.setFeatureState({ source: 'sites', id: site.id }, { hover: true });
      const content = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = site.site_name;
      const meta = document.createElement('span');
      meta.textContent = [site.borough, STATUS_LABELS[site.status]].filter(Boolean).join(' · ');
      content.append(name, meta);
      popup.setLngLat([Number(site.lon), Number(site.lat)]).setDOMContent(content).addTo(map);
    };
    if (readyRef.current) apply(); else map.once('load', apply);
  }, [hoveredId, sites]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => map.getSource('sites')?.setData(geoJson);
    if (readyRef.current) update(); else map.once('load', update);
  }, [geoJson]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyVisibility = () => CONTEXT_LAYERS.forEach(layer => {
      const visibility = layerVisibility[layer.key] ? 'visible' : 'none';
      layer.mapLayerIds.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility); });
    });
    if (readyRef.current) applyVisibility(); else map.once('load', applyVisibility);
  }, [layerVisibility]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyConstraints = () => constraintLayers.forEach(layer => {
      const visibility = constraintsOn[layer.source_id] ? 'visible' : 'none';
      ['fill', 'line'].forEach(kind => {
        const id = `constraint-${layer.source_id}-${kind}`;
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
      });
    });
    if (readyRef.current) applyConstraints(); else map.once('load', applyConstraints);
  }, [constraintsOn, constraintLayers]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapConfig) return;
    const applyStyle = () => {
      const { parcels, buildingsFill, buildingsOutline, markers } = mapConfig.symbology;
      if (map.getLayer('context-parcels')) {
        map.setPaintProperty('context-parcels', 'line-color', parcels.color);
        map.setPaintProperty('context-parcels', 'line-width', parcels.width);
        map.setPaintProperty('context-parcels', 'line-opacity', parcels.opacity);
      }
      if (map.getLayer('context-buildings-fill')) {
        map.setPaintProperty('context-buildings-fill', 'fill-color', buildingsFill.color);
        map.setPaintProperty('context-buildings-fill', 'fill-opacity', buildingsFill.opacity);
      }
      if (map.getLayer('context-buildings-outline')) {
        map.setPaintProperty('context-buildings-outline', 'line-color', buildingsOutline.color);
        map.setPaintProperty('context-buildings-outline', 'line-width', buildingsOutline.width);
      }
      if (map.getLayer('site-points')) {
        map.setPaintProperty('site-points', 'circle-color', ['match', ['get', 'status'], 'accepted', markers.accepted, 'dismissed', markers.dismissed, markers.new]);
      }
      if (mapConfig.zoomRanges) {
        CONTEXT_LAYERS.forEach(layer => {
          const range = mapConfig.zoomRanges[layer.key];
          if (!range) return;
          layer.mapLayerIds.forEach(id => { if (map.getLayer(id)) map.setLayerZoomRange(id, range.minZoom, range.maxZoom); });
        });
      }
      mapConfig.layerOrder.forEach(key => CONTEXT_LAYERS.find(layer => layer.key === key)?.mapLayerIds.forEach(id => { if (map.getLayer(id)) map.moveLayer(id); }));
      if (map.getLayer('site-points')) map.moveLayer('site-points');
    };
    if (readyRef.current) applyStyle(); else map.once('load', applyStyle);
  }, [mapConfig]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyBasemap = () => {
      const { source, paint } = BASEMAPS[basemap];
      ['osm', 'topo'].forEach(key => { if (map.getLayer(`basemap-${key}`)) map.setLayoutProperty(`basemap-${key}`, 'visibility', key === source ? 'visible' : 'none'); });
      Object.entries(paint).forEach(([property, value]) => map.setPaintProperty(`basemap-${source}`, property, value));
    };
    if (readyRef.current) applyBasemap(); else map.once('load', applyBasemap);
  }, [basemap]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    // Keep the site in the visible part of the map, clear of the details panel that docks on the right
    const width = containerRef.current?.clientWidth || 0;
    const offsetX = width > 700 ? -Math.min(210, Math.round(width * 0.25)) : 0;
    map.easeTo({ center: [Number(selected.lon), Number(selected.lat)], zoom: Math.max(map.getZoom(), 15), offset: [offsetX, 0], duration: 650, essential: true });
  }, [selected?.id]);

  return <section className={`map-panel basemap-${basemap}`}>
    <div ref={containerRef} className="map-canvas" aria-label="Map of shortlisted sites" />
    {mapFailed && <div className="fallback-map" aria-label="Coordinate map of shortlisted sites"><div className="fallback-river" /><span className="fallback-place place-north">North London</span><span className="fallback-place place-west">West London</span><span className="fallback-place place-central">Central London</span>{fallbackPoints.map(site => <button aria-label={site.site_name} title={site.site_name} key={site.id} className={`fallback-point ${site.status} ${selected?.id === site.id ? 'selected' : ''}`} style={{ left: site.left, top: site.top }} onClick={() => onSelect(site.id)} />)}<div className="fallback-note">Interactive coordinate view · live basemap available with WebGL2</div></div>}
    {!mapFailed && <button type="button" className="map-home" onClick={() => fitToSites()} aria-label="Zoom to all sites" title="Zoom to all sites"><House size={15}/></button>}
  </section>;
}

function ColorField({ label, value, onChange }) {
  return <label className="color-field">{label}<span className="color-field-input"><input type="color" value={value} onChange={event => onChange(event.target.value)} aria-label={`${label} colour`}/><span className="color-field-hex">{value.toUpperCase()}</span></span></label>;
}

function RangeField({ label, value, onChange, min, max, step }) {
  return <label className="range-field">{label}<span className="range-field-input"><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))}/><span>{value}</span></span></label>;
}

function LayerRow({ title, swatches, defaultOpen, children, draggable, dragging, onDragStart, onDragOver, onDragEnd }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return <div className={`layer-row ${open ? 'open' : ''} ${dragging ? 'dragging' : ''}`} onDragOver={draggable ? onDragOver : undefined}>
    <div className="layer-row-head">
      {draggable && <span className="layer-row-grip" draggable="true" onDragStart={onDragStart} onDragEnd={onDragEnd} aria-label={`Drag to reorder ${title}`}><GripVertical size={14}/></span>}
      <button type="button" className="layer-row-toggle" onClick={() => setOpen(current => !current)} aria-expanded={open}>
        <span className="layer-row-swatches">{swatches.map((color, index) => <i key={index} className="layer-swatch" style={{ background: color }}/>)}</span>
        <span className="layer-row-title">{title}</span>
        <ChevronDown size={15} className="layer-row-chevron"/>
      </button>
    </div>
    {open && <div className="layer-row-body">{children}</div>}
  </div>;
}

function AdminMapSettings({ workspace, mapConfig, onSaved }) {
  const [draft, setDraft] = useState(mapConfig);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dragKey, setDragKey] = useState(null);

  useEffect(() => { setDraft(mapConfig); }, [mapConfig]);

  const setField = (group, key, value) => setDraft(current => ({ ...current, symbology: { ...current.symbology, [group]: { ...current.symbology[group], [key]: value } } }));

  const setZoomField = (layerKey, field, value) => setDraft(current => {
    const range = { ...current.zoomRanges[layerKey], [field]: value };
    if (field === 'minZoom' && range.minZoom >= range.maxZoom) range.maxZoom = Math.min(24, range.minZoom + 1);
    if (field === 'maxZoom' && range.maxZoom <= range.minZoom) range.minZoom = Math.max(0, range.maxZoom - 1);
    return { ...current, zoomRanges: { ...current.zoomRanges, [layerKey]: range } };
  });

  const reorderTo = targetKey => setDraft(current => {
    if (!dragKey || dragKey === targetKey) return current;
    const order = [...current.layerOrder];
    const from = order.indexOf(dragKey);
    const to = order.indexOf(targetKey);
    if (from === -1 || to === -1) return current;
    order.splice(from, 1);
    order.splice(to, 0, dragKey);
    return { ...current, layerOrder: order };
  });

  const save = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await api(`/api/admin/workspaces/${workspace.id}/map-config`, { method: 'PATCH', body: JSON.stringify({ mapConfig: draft }) });
      onSaved(response.mapConfig);
      setNotice('Map appearance updated for this client.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const orderableLayers = {
    parcels: {
      title: 'Parcels',
      swatches: [draft.symbology.parcels.color],
      body: <>
        <ColorField label="Line colour" value={draft.symbology.parcels.color} onChange={value => setField('parcels', 'color', value)}/>
        <RangeField label="Line width" min={0.2} max={4} step={0.1} value={draft.symbology.parcels.width} onChange={value => setField('parcels', 'width', value)}/>
        <RangeField label="Opacity" min={0} max={1} step={0.05} value={draft.symbology.parcels.opacity} onChange={value => setField('parcels', 'opacity', value)}/>
        <RangeField label="Visible from zoom" min={0} max={24} step={1} value={draft.zoomRanges.parcels.minZoom} onChange={value => setZoomField('parcels', 'minZoom', value)}/>
        <RangeField label="Visible up to zoom" min={0} max={24} step={1} value={draft.zoomRanges.parcels.maxZoom} onChange={value => setZoomField('parcels', 'maxZoom', value)}/>
      </>,
    },
    buildings: {
      title: 'Buildings',
      swatches: [draft.symbology.buildingsFill.color, draft.symbology.buildingsOutline.color],
      body: <>
        <ColorField label="Fill colour" value={draft.symbology.buildingsFill.color} onChange={value => setField('buildingsFill', 'color', value)}/>
        <RangeField label="Fill opacity" min={0} max={1} step={0.05} value={draft.symbology.buildingsFill.opacity} onChange={value => setField('buildingsFill', 'opacity', value)}/>
        <ColorField label="Outline colour" value={draft.symbology.buildingsOutline.color} onChange={value => setField('buildingsOutline', 'color', value)}/>
        <RangeField label="Outline width" min={0.2} max={4} step={0.1} value={draft.symbology.buildingsOutline.width} onChange={value => setField('buildingsOutline', 'width', value)}/>
        <RangeField label="Visible from zoom" min={0} max={24} step={1} value={draft.zoomRanges.buildings.minZoom} onChange={value => setZoomField('buildings', 'minZoom', value)}/>
        <RangeField label="Visible up to zoom" min={0} max={24} step={1} value={draft.zoomRanges.buildings.maxZoom} onChange={value => setZoomField('buildings', 'maxZoom', value)}/>
      </>,
    },
  };

  return <section className="map-settings-panel">
    <div className="map-settings-head">
      <p>Controls how the map renders for everyone in {workspace.name}&rsquo;s workspace. Clients never see these settings.</p>
    </div>
    {(notice || error) && <div className={`admin-notice ${error ? 'is-error' : ''}`}>{error || notice}<button type="button" onClick={() => { setNotice(''); setError(''); }} aria-label="Dismiss notification"><X size={14}/></button></div>}
    <form onSubmit={save} className="map-settings-form">
      <div className="map-settings-row">
        <label className="map-settings-toggle"><input type="checkbox" checked={draft.contextLayerDefaultOn} onChange={event => setDraft(current => ({ ...current, contextLayerDefaultOn: event.target.checked }))}/> Show map layers by default</label>
      </div>
      <div className="layer-list">
        <p className="layer-list-hint"><GripVertical size={12}/> Drag to set draw order — top layer sits above the rest</p>
        {draft.layerOrder.map(key => {
          const layer = orderableLayers[key];
          if (!layer) return null;
          return <LayerRow key={key} title={layer.title} swatches={layer.swatches} draggable dragging={dragKey === key}
            onDragStart={() => setDragKey(key)}
            onDragOver={event => { event.preventDefault(); reorderTo(key); }}
            onDragEnd={() => setDragKey(null)}
          >{layer.body}</LayerRow>;
        })}
        <LayerRow title="Site markers" swatches={[draft.symbology.markers.new, draft.symbology.markers.accepted, draft.symbology.markers.dismissed]}>
          <ColorField label="New" value={draft.symbology.markers.new} onChange={value => setField('markers', 'new', value)}/>
          <ColorField label="Accepted" value={draft.symbology.markers.accepted} onChange={value => setField('markers', 'accepted', value)}/>
          <ColorField label="Dismissed" value={draft.symbology.markers.dismissed} onChange={value => setField('markers', 'dismissed', value)}/>
        </LayerRow>
      </div>
      <div className="map-settings-actions">
        <button type="button" className="decision" onClick={() => setDraft(mapConfig)} disabled={busy}>Discard changes</button>
        <button className="decision accept" disabled={busy}>{busy ? <LoaderCircle className="spin" size={13}/> : <Check size={13}/>} Save for this client</button>
      </div>
    </form>
  </section>;
}

const STATUS_LABELS = { new: 'To review', accepted: 'Accepted', dismissed: 'Dismissed' };
// What a site appraisal (Site Check) covers, shown before a client confirms a request
const APPRAISAL_SECTIONS = [
  ['Environment', 'Flood zones, ecological designations, contamination signals'],
  ['Heritage', 'Listed buildings, conservation areas, scheduled monuments'],
  ['Transport', 'Road access, public transport, drive-time catchment'],
  ['Land Registry', 'Title extent and tenure, quoted from the register'],
  ['Planning', 'Local plan status, nearby applications and decisions'],
  ['Land comps', 'Recent sales and listings nearby'],
];
const APPRAISAL_LABELS = { requested: 'Appraisal requested', in_progress: 'Appraisal in progress', delivered: 'Appraisal delivered', cancelled: 'Appraisal withdrawn' };
const APPRAISAL_RING = '#B6955B';
const APPRAISAL_ADMIN_LABELS = { requested: 'Requested', in_progress: 'In progress', delivered: 'Delivered', cancelled: 'Cancelled' };
const isOpenAppraisal = status => status === 'requested' || status === 'in_progress';
export const formatPence = pence => `£${(Number(pence) / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
export const currency = value => {
  const parsed = numberValue(value);
  return parsed === null ? null : `£${parsed.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
};

function StatusMark({ status }) {
  return <span className={`status-mark is-${status}`}><i aria-hidden="true"/>{STATUS_LABELS[status] || status}</span>;
}

function Figure({ value, label }) {
  const parsed = numberValue(value);
  if (parsed === null) return <span className="figure is-missing">{label[0].toUpperCase() + label.slice(1)} not recorded</span>;
  return <span className="figure"><b>{parsed.toLocaleString('en-GB', { maximumFractionDigits: 0 })} m²</b> {label}</span>;
}

function FactRow({ label, value, note, missing }) {
  return <div className={`fact-row ${missing ? 'is-missing' : ''}`}>
    <dt>{label}</dt>
    <dd><span className="fact-value">{missing ? 'Not recorded' : value}</span>{note && <span className="fact-note">{note}</span>}</dd>
  </div>;
}

function AppraisalPanel({ site, offer, onRequest, onCancel }) {
  const [formOpen, setFormOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setFormOpen(false); setNotes(''); setError(''); }, [site.id]);

  const run = async action => {
    setBusy(true);
    setError('');
    try { await action(); setFormOpen(false); setNotes(''); } catch (actionError) { setError(actionError.message); } finally { setBusy(false); }
  };
  const status = site.appraisal_status;
  const priceText = pence => `${formatPence(pence)} ${offer?.vat || ''}`.trim();
  const errorNote = error && <p className="appraisal-error" role="alert">{error}</p>;

  if (isOpenAppraisal(status)) {
    return <section className="appraisal-panel is-open" aria-live="polite">
      <div className="appraisal-state"><i aria-hidden="true"/>{APPRAISAL_LABELS[status]}</div>
      <p>Requested {formatAdminDate(site.appraisal_requested_at)} at {priceText(site.appraisal_price_pence)}. RTC will be in touch before work starts.</p>
      {status === 'requested' && <button type="button" className="adm-link-button" disabled={busy} onClick={() => run(() => onCancel(site))}>{busy ? 'Withdrawing…' : 'Withdraw request'}</button>}
      {errorNote}
    </section>;
  }
  if (!offer) return null;
  if (!formOpen) {
    return <div className="appraisal-cta-wrap">
      {status === 'delivered' && <p className="appraisal-note">Appraisal delivered {formatAdminDate(site.appraisal_requested_at)}.</p>}
      <button type="button" className="appraisal-cta" onClick={() => setFormOpen(true)}>
        <FileText size={16}/><span>{status === 'delivered' ? 'Request a new appraisal' : 'Request site appraisal'}</span><b>{priceText(offer.pricePence)}</b>
      </button>
    </div>;
  }
  return <form className="appraisal-panel" onSubmit={event => { event.preventDefault(); run(() => onRequest(site.id, notes)); }}>
    <h3>Site appraisal</h3>
    <p>A desktop report on {site.site_name}, set out against your criteria. It presents the evidence and flags risks. It is not a recommendation to buy or develop.</p>
    <ul className="appraisal-sections">
      {APPRAISAL_SECTIONS.map(([title, detail]) => <li key={title}><Check size={13} aria-hidden="true"/><span><b>{title}</b>{detail}</span></li>)}
    </ul>
    <div className="appraisal-price"><span>Fixed fee</span><b>{priceText(offer.pricePence)}</b></div>
    <label className="appraisal-notes"><span>Anything we should know? <em>Optional</em></span>
      <textarea rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Intended use, deadlines, known issues"/>
    </label>
    {errorNote}
    <div className="appraisal-actions">
      <button type="button" className="decision" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
      <button type="submit" className="decision accept" disabled={busy}>{busy ? <LoaderCircle className="spin" size={13}/> : <Check size={13}/>}Send request</button>
    </div>
  </form>;
}

function Detail({ site, onStatus, onClose, appraisalOffer, onRequestAppraisal, onCancelAppraisal }) {
  const siteQuery = encodeURIComponent([site.site_name, site.borough].filter(Boolean).join(', '));
  const footprint = numberValue(site.footprint_m2);
  const spare = numberValue(site.spare_land_on_title_m2);
  const rateable = currency(site.voa_rateable_value);
  const accepted = site.status === 'accepted';
  const dismissed = site.status === 'dismissed';
  return <article className="detail-panel" aria-labelledby="detail-title">
    <header className="detail-head">
      <div className="detail-head-top">
        <StatusMark status={site.status}/>
        {onClose && <button type="button" className="inspector-close" onClick={onClose} aria-label="Close site details" title="Close"><X size={16}/></button>}
      </div>
      <h2 className="detail-title" id="detail-title">{site.site_name}</h2>
      <p className="detail-dek">{[site.category, site.borough].filter(Boolean).join(' in ')}</p>
      <div className="decision-row">
        <button className={`decision ${accepted ? 'is-done' : 'accept'}`} aria-pressed={accepted} onClick={() => onStatus(site.id, accepted ? 'new' : 'accepted')}>
          {accepted ? <><Check size={14}/>Accepted</> : 'Accept site'}
        </button>
        <button className="decision" aria-pressed={dismissed} onClick={() => onStatus(site.id, dismissed ? 'new' : 'dismissed')}>
          {dismissed ? <><RotateCcw size={13}/>Restore</> : 'Dismiss'}
        </button>
      </div>
      <AppraisalPanel site={site} offer={appraisalOffer} onRequest={onRequestAppraisal} onCancel={onCancelAppraisal}/>
    </header>
    <div className="detail-body">
      <section className="detail-section">
        <h3>The figures</h3>
        <dl className="fact-list">
          <FactRow label="Footprint" value={footprint !== null && `${footprint.toLocaleString('en-GB', { maximumFractionDigits: 0 })} m²`} missing={footprint === null}/>
          <FactRow label="Spare land on title" value={spare !== null && `${spare.toLocaleString('en-GB', { maximumFractionDigits: 0 })} m²`} missing={spare === null}/>
          <FactRow label="Rateable value" value={rateable} note={site.voa_match_confidence ? `VOA match: ${site.voa_match_confidence}` : rateable ? 'VOA match confidence not recorded' : null} missing={!rateable}/>
          {site.type && <FactRow label="Type" value={site.type}/>}
          {site.priority && <FactRow label="Priority" value={site.priority}/>}
          {site.review_flag && <FactRow label="Review flag" value={<span className="flag"><i style={{ background: reviewFlagColor(site.review_flag) }}/>{site.review_flag}</span>}/>}
        </dl>
      </section>
      <section className="detail-section">
        <h3>Data confidence</h3>
        <p className={site.data_confidence_notes ? '' : 'is-missing'}>{site.data_confidence_notes || 'No data confidence notes recorded for this site.'}</p>
      </section>
      {site.spare_area_comments && <section className="detail-section"><h3>Field notes</h3><p>{site.spare_area_comments}</p></section>}
      {(site.nearby_planning_applications || site.nearby_parking) && <section className="detail-section">
        <h3>Nearby</h3>
        <dl className="fact-list is-prose">
          {site.nearby_planning_applications && <FactRow label="Planning applications" value={site.nearby_planning_applications}/>}
          {site.nearby_parking && <FactRow label="Parking" value={site.nearby_parking}/>}
        </dl>
      </section>}
      <section className="detail-section">
        <h3>Look further</h3>
        <ul className="research-links">
          <li><a href={`https://www.google.com/maps/search/?api=1&query=${siteQuery}`} target="_blank" rel="noreferrer">Open in Google Maps<ExternalLink size={13}/></a></li>
          <li><a href={`https://www.google.com/search?q=${siteQuery}+official+website`} target="_blank" rel="noreferrer">Search for the site’s website<ExternalLink size={13}/></a></li>
          <li><a href="https://search-property-information.service.gov.uk/search/search-by-address" target="_blank" rel="noreferrer">Search HM Land Registry title records<ExternalLink size={13}/></a></li>
        </ul>
      </section>
    </div>
  </article>;
}

const adminDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatAdminDate = value => (value ? adminDate.format(new Date(value)) : '—');
const slugify = value => value.toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const countCsvRows = text => Math.max(0, String(text || '').split(/\r?\n/).filter(line => line.trim()).length - 1);

function AdminOverview() {
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [section, setSection] = useState('clients');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(null); // 'workspace' | 'invite' | { userId }
  const [form, setForm] = useState({ name: '', slug: '', csvText: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [theme, setTheme] = usePanelTheme();

  // Only the first load shows the loading screen; refreshes after an action happen in place.
  const loadAdminData = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [workspaceResponse, userResponse, requestResponse] = await Promise.all([api('/api/admin/workspaces'), api('/api/admin/users'), api('/api/admin/appraisal-requests')]);
      setWorkspaces(workspaceResponse.workspaces || []);
      setUsers(userResponse.users || []);
      setRequests(requestResponse.requests || []);
    } catch (loadError) {
      setError(loadError.status === 403 ? 'Your account does not have platform-admin access.' : loadError.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  };
  useEffect(() => { loadAdminData(); }, []);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const showSection = next => { setSection(next); setQuery(''); setMobileMenu(false); };
  const openSheet = next => { setError(''); setSheet(next); };
  const closeSheet = () => setSheet(null);

  const updateUser = async (userId, body, message) => {
    setBusy(`user-${userId}`);
    setError('');
    try {
      await api(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
      setNotice(message);
      await loadAdminData({ quiet: true });
    } catch (updateError) { setError(updateError.message); } finally { setBusy(''); }
  };
  const updateAppraisal = async (requestId, status) => {
    setBusy(`appraisal-${requestId}`);
    setError('');
    try {
      await api(`/api/admin/appraisal-requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`Request marked as ${APPRAISAL_ADMIN_LABELS[status].toLowerCase()}.`);
      await loadAdminData({ quiet: true });
    } catch (updateError) { setError(updateError.message); } finally { setBusy(''); }
  };
  const toggleMembership = async (userId, workspaceId, hasMembership) => {
    setBusy(`membership-${userId}-${workspaceId}`);
    setError('');
    try {
      await api(`/api/admin/users/${userId}/memberships${hasMembership ? `/${workspaceId}` : ''}`, {
        method: hasMembership ? 'DELETE' : 'POST',
        body: hasMembership ? undefined : JSON.stringify({ workspaceId }),
      });
      await loadAdminData({ quiet: true });
    } catch (membershipError) { setError(membershipError.message); } finally { setBusy(''); }
  };
  const createWorkspace = async event => {
    event.preventDefault();
    setBusy('workspace');
    setError('');
    try {
      await api('/api/admin/workspaces', { method: 'POST', body: JSON.stringify(form) });
      setNotice(`${form.name} created with ${countCsvRows(form.csvText)} sites.`);
      setForm({ name: '', slug: '', csvText: '' });
      setSlugEdited(false);
      setFileName('');
      closeSheet();
      await loadAdminData({ quiet: true });
    } catch (createError) { setError(createError.message); } finally { setBusy(''); }
  };
  const invite = async event => {
    event.preventDefault();
    setBusy('invite');
    setError('');
    try {
      const workspaceId = inviteWorkspaceId ? Number(inviteWorkspaceId) : null;
      await api('/api/admin/users/invite', { method: 'POST', body: JSON.stringify({ email: inviteEmail, workspaceId }) });
      const grantedWorkspace = workspaces.find(item => item.id === workspaceId);
      setNotice(grantedWorkspace ? `Invite sent to ${inviteEmail}. They'll see ${grantedWorkspace.name} once they sign up.` : `Invite sent to ${inviteEmail}.`);
      setInviteEmail('');
      setInviteWorkspaceId('');
      closeSheet();
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
  const setWorkspaceName = name => setForm(current => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }));

  const needle = normalize(query.trim());
  const visibleWorkspaces = useMemo(() => workspaces.filter(item => !needle || normalize(`${item.name} ${item.slug}`).includes(needle)), [workspaces, needle]);
  const visibleUsers = useMemo(() => users.filter(item => !needle || normalize(`${item.name} ${item.email} ${item.memberships.map(m => m.name).join(' ')}`).includes(needle)), [users, needle]);
  const visibleRequests = useMemo(() => requests.filter(item => !needle || normalize(`${item.site_name} ${item.workspace_name} ${item.requested_by_email} ${item.borough}`).includes(needle)), [requests, needle]);
  const openRequests = requests.filter(item => isOpenAppraisal(item.status)).length;
  const totalSites = workspaces.reduce((sum, item) => sum + (item.site_count || 0), 0);
  const accessUser = sheet?.userId ? users.find(item => item.id === sheet.userId) : null;
  const csvRows = countCsvRows(form.csvText);

  if (loading) return <LoadingScreen label="Loading admin overview" />;
  if (error && !workspaces.length && !users.length) return <ErrorScreen message={error} onRetry={loadAdminData} />;

  const isClients = section === 'clients';
  const isAppraisals = section === 'appraisals';
  const sectionTitle = { clients: 'Client workspaces', people: 'People & access', appraisals: 'Site appraisals' }[section];
  const sheetError = error && <div className="adm-notice is-error" role="alert"><AlertCircle size={15}/><span>{error}</span></div>;

  const navItems = [
    { key: 'clients', label: 'Client workspaces', icon: Building2, count: workspaces.length },
    { key: 'people', label: 'People & access', icon: Users, count: users.length },
    { key: 'appraisals', label: 'Site appraisals', icon: ClipboardList, count: openRequests ? `${openRequests} open` : requests.length, highlight: openRequests > 0 },
  ];

  return <div className="app-shell adm-shell" data-theme={theme}>
    <aside className={`sidebar adm-rail ${mobileMenu ? 'mobile-open' : ''}`}>
      <PanelBackground theme={theme}/>
      <div className="adm-rail-inner">
        <div className="mobile-sidebar-close"><button onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18}/></button></div>
        <div className="adm-rail-brand">
          <span className="rtc-logo is-small"><span className="rtc-logo-name">ROSE TINSLEY</span><span className="rtc-logo-descriptor">C O N S U L T I N G</span></span>
          <span className="adm-rail-label"><ShieldCheck size={12}/>Admin</span>
        </div>
        <nav className="adm-nav" aria-label="Admin sections">
          {navItems.map(({ key, label, icon: Icon, count, highlight }) => <button type="button" key={key} className={section === key ? 'active' : ''} aria-current={section === key ? 'page' : undefined} onClick={() => showSection(key)}>
            <Icon size={16}/><span>{label}</span><b className={highlight ? 'is-highlight' : ''}>{count}</b>
          </button>)}
        </nav>
      </div>
    </aside>
    <main className="main adm-main">
      <div className="adm-account" role="group" aria-label="Account">
        <ThemeToggle theme={theme} setTheme={setTheme} className="map-pill is-icon"/>
        <SignOutButton/>
      </div>
      <header className="adm-head">
        <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20}/></button>
        <div className="adm-title">
          <h1>{sectionTitle}</h1>
          {isAppraisals
            ? <p className="standfirst"><b>{openRequests}</b> open {openRequests === 1 ? 'request' : 'requests'} out of <b>{requests.length}</b> in total. Clients request these from the site panel on the map.</p>
            : <p className="standfirst"><b>{workspaces.length}</b> client {workspaces.length === 1 ? 'workspace' : 'workspaces'} holding <b>{totalSites.toLocaleString('en-GB')}</b> sites, with <b>{users.length}</b> {users.length === 1 ? 'person' : 'people'} who can sign in.</p>}
        </div>
        {!isAppraisals && <button className="adm-btn adm-btn-primary" onClick={() => openSheet(isClients ? 'workspace' : 'invite')}>
          <Plus size={14} strokeWidth={2.25}/>{isClients ? 'New workspace' : 'Invite person'}
        </button>}
      </header>

      {(notice || (error && !sheet)) && <div className={`adm-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>
        {error ? <AlertCircle size={15}/> : <Check size={15}/>}<span>{error || notice}</span>
        <button onClick={() => { setNotice(''); setError(''); }} aria-label="Dismiss"><X size={14}/></button>
      </div>}

      <div className="adm-toolbar">
        <label className="adm-search">
          <Search size={14}/>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={isClients ? 'Search workspaces' : isAppraisals ? 'Search sites, clients or people' : 'Search people or workspaces'} aria-label="Search"/>
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13}/></button>}
        </label>
        <span className="adm-count">{isClients ? `${visibleWorkspaces.length} of ${workspaces.length}` : isAppraisals ? `${visibleRequests.length} of ${requests.length}` : `${visibleUsers.length} of ${users.length}`}</span>
      </div>

      {isAppraisals ? <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr><th>Site</th><th className="col-access">Requested by</th><th className="col-created">Requested</th><th className="num">Fee</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          {visibleRequests.map(request => <tr key={request.id} className={isOpenAppraisal(request.status) ? '' : 'is-closed'}>
            <td><Link className="adm-primary-cell" to={`/workspace/${request.workspace_id}`}><strong>{request.site_name}</strong><span>{[request.workspace_name, request.borough].filter(Boolean).join(' · ')}</span></Link>
              {request.notes && <p className="adm-request-notes">“{request.notes}”</p>}</td>
            <td className="col-access">{request.requested_by_name || request.requested_by_email}</td>
            <td className="col-created">{formatAdminDate(request.created_at)}</td>
            <td className="num">{formatPence(request.price_pence)}</td>
            <td><select className="adm-status-select" aria-label={`Status for ${request.site_name}`} value={request.status} disabled={busy === `appraisal-${request.id}`} onChange={event => updateAppraisal(request.id, event.target.value)}>
              {Object.entries(APPRAISAL_ADMIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></td>
            <td className="adm-actions"><Link className="adm-btn adm-btn-ghost" to={`/admin/appraisal-requests/${request.id}/report`}><FileText size={13}/>Build report</Link></td>
          </tr>)}
          {!visibleRequests.length && <tr className="adm-empty-row"><td colSpan={6}>
            {requests.length ? <>No requests match “{query}”.</> : <>No appraisal requests yet. They appear here when a client requests one from the map.</>}
          </td></tr>}
        </tbody>
      </table></div> : isClients ? <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr><th>Workspace</th><th className="num">Sites</th><th className="num col-members">Members</th><th className="col-created">Created</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          {visibleWorkspaces.map(workspace => <tr key={workspace.id}>
            <td><Link className="adm-primary-cell" to={`/workspace/${workspace.id}`}><strong>{workspace.name}</strong><span>/{workspace.slug}</span></Link></td>
            <td className="num">{(workspace.site_count || 0).toLocaleString('en-GB')}</td>
            <td className="num col-members">{workspace.member_count || 0}</td>
            <td className="col-created">{formatAdminDate(workspace.created_at)}</td>
            <td className="adm-actions">
              <Link className="adm-btn adm-btn-ghost" to={`/workspace/${workspace.id}?view=client`} title={`See ${workspace.name} as its members do`}><Eye size={13}/>View as client</Link>
              <Link className="adm-btn adm-btn-ghost" to={`/workspace/${workspace.id}`}>Open<ArrowRight size={13}/></Link>
            </td>
          </tr>)}
          {!visibleWorkspaces.length && <tr className="adm-empty-row"><td colSpan={5}>
            {workspaces.length ? <>No workspaces match “{query}”.</> : <>No client workspaces yet. <button className="adm-link-button" onClick={() => openSheet('workspace')}>Create the first one</button></>}
          </td></tr>}
        </tbody>
      </table></div> : <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr><th>Person</th><th>Role</th><th className="col-access">Workspace access</th><th className="col-created">Added</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          {visibleUsers.map(user => <tr key={user.id}>
            <td><button className="adm-primary-cell" onClick={() => openSheet({ userId: user.id })}><strong>{user.name || user.email}</strong><span>{user.name ? user.email : 'No display name'}</span></button></td>
            <td>{user.is_platform_admin ? <span className="adm-badge is-admin"><ShieldCheck size={12}/>Admin</span> : <span className="adm-badge">Member</span>}</td>
            <td className="col-access"><AccessSummary memberships={user.memberships} isAdmin={user.is_platform_admin}/></td>
            <td className="col-created">{formatAdminDate(user.created_at)}</td>
            <td className="adm-actions"><button className="adm-btn adm-btn-ghost" onClick={() => openSheet({ userId: user.id })}>Manage</button></td>
          </tr>)}
          {!visibleUsers.length && <tr className="adm-empty-row"><td colSpan={5}>
            {users.length ? <>No people match “{query}”.</> : <>People appear here after they first sign in. <button className="adm-link-button" onClick={() => openSheet('invite')}>Invite someone</button></>}
          </td></tr>}
        </tbody>
      </table></div>}
    </main>

    {sheet === 'workspace' && <AdminSheet title="New workspace" description="Each workspace holds one client's site shortlist, kept separate from every other client." onClose={closeSheet}
      footer={<><button type="button" className="adm-btn adm-btn-ghost" onClick={closeSheet}>Cancel</button><button type="submit" form="adm-workspace-form" className="adm-btn adm-btn-primary" disabled={busy === 'workspace' || !csvRows}>{busy === 'workspace' && <LoaderCircle className="spin" size={14}/>}Create workspace</button></>}>
      <form id="adm-workspace-form" className="adm-form" onSubmit={createWorkspace}>
        {sheetError}
        <label className="adm-field"><span>Client name</span><input autoFocus required value={form.name} onChange={event => setWorkspaceName(event.target.value)} placeholder="Acme Property Group"/></label>
        <label className="adm-field"><span>URL slug</span><span className="adm-prefixed"><em>/</em><input required pattern="[a-z0-9-]+" value={form.slug} onChange={event => { setSlugEdited(true); setForm({ ...form, slug: slugify(event.target.value) }); }} placeholder="acme-property-group"/></span><small>Filled in from the name. Lowercase letters, numbers and hyphens.</small></label>
        <div className="adm-field">
          <span>Site shortlist</span>
          <label className={`adm-drop ${fileName ? 'has-file' : ''}`}>
            <input type="file" accept=".csv,text/csv" onChange={readFile}/>
            {fileName ? <FileText size={18}/> : <Upload size={18}/>}
            <span><strong>{fileName || 'Upload a CSV file'}</strong><small>{fileName ? `${csvRows} sites detected · choose another file` : 'or paste the CSV below'}</small></span>
          </label>
          <textarea required aria-label="CSV contents" value={form.csvText} onChange={event => { setFileName(''); setForm({ ...form, csvText: event.target.value }); }} placeholder="Paste CSV here, including the header row" rows={fileName ? 3 : 7} spellCheck={false}/>
          {!fileName && csvRows > 0 && <small>{csvRows} sites detected</small>}
        </div>
      </form>
    </AdminSheet>}

    {sheet === 'invite' && <AdminSheet title="Invite person" description="They'll get an email with a link to set their password." onClose={closeSheet}
      footer={<><button type="button" className="adm-btn adm-btn-ghost" onClick={closeSheet}>Cancel</button><button type="submit" form="adm-invite-form" className="adm-btn adm-btn-primary" disabled={busy === 'invite'}>{busy === 'invite' && <LoaderCircle className="spin" size={14}/>}Send invite</button></>}>
      <form id="adm-invite-form" className="adm-form" onSubmit={invite}>
        {sheetError}
        <label className="adm-field"><span>Email address</span><input autoFocus required type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="name@company.com"/></label>
        <label className="adm-field"><span>Workspace access</span>
          <select value={inviteWorkspaceId} onChange={event => setInviteWorkspaceId(event.target.value)}>
            <option value="">None for now</option>
            {workspaces.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <small>Granted as soon as they sign up. You can change it later.</small>
        </label>
      </form>
    </AdminSheet>}

    {accessUser && <AdminSheet title={accessUser.name || accessUser.email} description={accessUser.name ? accessUser.email : 'Role and workspace access'} onClose={closeSheet}
      footer={<button type="button" className="adm-btn adm-btn-primary" onClick={closeSheet}>Done</button>}>
      <div className="adm-form">
        {sheetError}
        <section className="adm-group">
          <h3>Role</h3>
          <AdminSwitch checked={accessUser.is_platform_admin} busy={busy === `user-${accessUser.id}`}
            label="Platform admin" hint="Sees every workspace and can manage people."
            onChange={value => updateUser(accessUser.id, { isPlatformAdmin: value }, `${accessUser.email} ${value ? 'is now a platform admin' : 'is no longer a platform admin'}.`)}/>
        </section>
        <section className="adm-group">
          <h3>Workspace access</h3>
          {workspaces.length ? <div className="adm-checklist">
            {workspaces.map(workspace => {
              const active = accessUser.memberships.some(item => item.id === workspace.id);
              return <AdminSwitch key={workspace.id} checked={active} busy={busy === `membership-${accessUser.id}-${workspace.id}`} label={workspace.name} hint={`${(workspace.site_count || 0).toLocaleString('en-GB')} sites`} onChange={() => toggleMembership(accessUser.id, workspace.id, active)}/>;
            })}
          </div> : <p className="adm-muted">No workspaces yet.</p>}
        </section>
      </div>
    </AdminSheet>}
  </div>;
}

function AccessSummary({ memberships, isAdmin }) {
  if (!memberships.length) return <span className="adm-muted">{isAdmin ? 'All, as admin' : 'No access'}</span>;
  const shown = memberships.slice(0, 2);
  const rest = memberships.length - shown.length;
  return <span className="adm-access">{shown.map(item => <span key={item.id} className="adm-tag">{item.name}</span>)}{rest > 0 && <span className="adm-tag is-more">+{rest}</span>}</span>;
}

function AdminSwitch({ checked, busy, label, hint, onChange }) {
  return <button type="button" role="switch" aria-checked={checked} className={`adm-switch ${checked ? 'is-on' : ''}`} disabled={busy} onClick={() => onChange(!checked)}>
    <span className="adm-switch-text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
    {busy ? <LoaderCircle className="spin" size={16}/> : <span className="adm-switch-track" aria-hidden="true"><span/></span>}
  </button>;
}

function AdminSheet({ title, description, onClose, footer, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const onKey = event => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return <div className="adm-sheet-layer">
    <div className="adm-sheet-scrim" onClick={onClose}/>
    <aside className="adm-sheet" role="dialog" aria-modal="true" aria-labelledby="adm-sheet-title" ref={panelRef} tabIndex={-1}>
      <header className="adm-sheet-head">
        <div><h2 id="adm-sheet-title">{title}</h2>{description && <p>{description}</p>}</div>
        <button className="adm-icon-btn" onClick={onClose} aria-label="Close"><X size={16}/></button>
      </header>
      <div className="adm-sheet-body">{children}</div>
      {footer && <footer className="adm-sheet-foot">{footer}</footer>}
    </aside>
  </div>;
}

function App() {
  if (!supabase) return <ConfigurationNotice />;
  return <AuthProvider><BrowserRouter><Routes><Route path="/sign-in" element={<SignInRoute/>}/><Route path="/sign-up" element={<SignUpRoute/>}/><Route path="/admin/appraisal-requests/:requestId/report" element={<ProtectedRoute><ReportBuilderRoute/></ProtectedRoute>}/><Route path="/admin/*" element={<AdminRoute/>}/><Route path="/workspace/:workspaceId" element={<ProtectedRoute><WorkspaceRoute/></ProtectedRoute>}/><Route path="*" element={<HomeRoute/>}/></Routes></BrowserRouter></AuthProvider>;
}

createRoot(document.getElementById('root')).render(<App />);