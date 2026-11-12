// Signed-in reference pages: /data (data sources), /methodology (how the site check works) and /policies.
// They share the admin rail and theme so they read as part of the portal, not a separate site. The data page
// reads the live catalogue (GET /api/data-sources, filtered to the user's workspaces); the other two render
// copy from src/content/*.js. A ?workspace=<id> query keeps the "Back to the map" link pointing at the right map.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, BookOpen, Database, FileText, Menu, Ruler, Search, X } from 'lucide-react';
import { api, ErrorScreen, LoadingScreen, PanelBackground, SignOutButton, ThemeToggle, normalize, usePanelTheme } from './main.jsx';
import { CHECK_STATUS, RADIUS_RULES, metres } from './lib/siteCheck.js';
import { METHOD_INTRO, METHOD_SECTIONS, RESULT_MEANINGS } from './content/methodology.js';
import { POLICIES_APPROVED, POLICIES_UPDATED, POLICY_SECTIONS } from './content/policies.js';
import './info.css';

const PAGES = [
  { path: '/data', label: 'Data sources', icon: Database },
  { path: '/methodology', label: 'Methodology', icon: Ruler },
  { path: '/policies', label: 'Policies', icon: FileText },
];

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatDay = value => (value ? dayFormat.format(new Date(value)) : null);
const count = value => (value === null || value === undefined ? null : Number(value).toLocaleString('en-GB'));

function cadenceLabel(days) {
  if (!days) return 'Not on a schedule';
  if (days <= 1) return 'Daily';
  if (days <= 7) return 'Weekly';
  if (days <= 31) return 'Monthly';
  if (days <= 92) return 'Every three months';
  if (days <= 183) return 'Twice a year';
  return 'Yearly';
}

// **bold** and [label](url). Internal links (/data) stay in the app and keep the workspace query.
function Rich({ text }) {
  const [params] = useSearchParams();
  const workspace = params.get('workspace');
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return parts.map((part, index) => {
    const bold = part.match(/^\*\*(.+)\*\*$/);
    if (bold) return <strong key={index}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith('/')) return <Link key={index} to={workspace ? `${href}?workspace=${workspace}` : href}>{label}</Link>;
      const external = href.startsWith('http');
      return <a key={index} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function Blocks({ blocks = [] }) {
  return blocks.map((block, index) => {
    if (block.h) return <h3 key={index}>{block.h}</h3>;
    if (block.p) return <p key={index}><Rich text={block.p}/></p>;
    if (block.ul) return <ul key={index}>{block.ul.map((item, i) => <li key={i}><Rich text={item}/></li>)}</ul>;
    if (block.table) return <div key={index} className="info-table-wrap"><table className="info-table">
      <thead><tr>{block.table.head.map(cell => <th key={cell}>{cell}</th>)}</tr></thead>
      <tbody>{block.table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}><Rich text={cell}/></td>)}</tr>)}</tbody>
    </table></div>;
    return null;
  });
}

// "On this page": sticky beside the article on wide screens, hidden on narrow ones (the headings carry the page)
function Contents({ items }) {
  if (items.length < 2) return null;
  return <nav className="info-contents" aria-label="On this page">
    <h2>On this page</h2>
    <ol>{items.map(item => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ol>
  </nav>;
}

function InfoLayout({ title, standfirst, contents = [], toolbar, children }) {
  const [theme, setTheme] = usePanelTheme();
  const [mobileMenu, setMobileMenu] = useState(false);
  const { pathname, hash } = useLocation();
  const [params] = useSearchParams();
  const workspace = params.get('workspace');
  const query = workspace ? `?workspace=${workspace}` : '';

  useEffect(() => { document.title = `${title} · RTC Site Selection`; }, [title]);
  // Deep links (/data#env_sssi) land on their entry once the content has rendered
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView({ block: 'start' });
  }, [hash, children]);

  return <div className="app-shell adm-shell info-shell" data-theme={theme}>
    <aside className={`sidebar adm-rail ${mobileMenu ? 'mobile-open' : ''}`}>
      <PanelBackground theme={theme}/>
      <div className="adm-rail-inner">
        <div className="mobile-sidebar-close"><button onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18}/></button></div>
        <div className="adm-rail-brand">
          <span className="rtc-logo is-small"><span className="rtc-logo-name">ROSE TINSLEY</span><span className="rtc-logo-descriptor">C O N S U L T I N G</span></span>
          <span className="adm-rail-label"><BookOpen size={12}/>Reference</span>
        </div>
        <nav className="adm-nav info-nav" aria-label="Reference pages">
          {PAGES.map(({ path, label, icon: Icon }) => <Link key={path} to={`${path}${query}`} className={pathname === path ? 'active' : ''} aria-current={pathname === path ? 'page' : undefined} onClick={() => setMobileMenu(false)}>
            <Icon size={16}/><span>{label}</span>
          </Link>)}
        </nav>
        <Link className="info-back" to={workspace ? `/workspace/${workspace}` : '/'}><ArrowLeft size={14}/>Back to the map</Link>
      </div>
    </aside>
    <main className="main adm-main info-main">
      <div className="adm-account" role="group" aria-label="Account">
        <ThemeToggle theme={theme} setTheme={setTheme} className="map-pill is-icon"/>
        <SignOutButton/>
      </div>
      <header className="adm-head">
        <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20}/></button>
        <div className="adm-title">
          <h1>{title}</h1>
          {standfirst && <p className="standfirst">{standfirst}</p>}
        </div>
      </header>
      {toolbar}
      <div className={`info-body ${contents.length > 1 ? 'has-contents' : ''}`}>
        <div className="info-article">{children}</div>
        <Contents items={contents}/>
      </div>
    </main>
  </div>;
}

// ---------- /data ----------

function Dataset({ layer }) {
  const facts = [
    ['Last checked', layer.last_verified_at ? timeFormat.format(new Date(layer.last_verified_at)) : null],
    ['Last updated', formatDay(layer.last_success_at)],
    ['Publisher’s date', formatDay(layer.last_source_published)],
    ['Publisher updates', cadenceLabel(layer.cadence_days)],
    ['Features', count(layer.last_rows_loaded)],
  ];
  return <article className="info-dataset" id={layer.source_id}>
    <header>
      <h3>{layer.title}</h3>
      <p className="info-meta">{layer.publisher}</p>
    </header>
    {layer.is_test_data && <p className="info-flag"><AlertCircle size={14}/>Test data. Not yet cleared for client reports.</p>}
    {layer.description && <p className="info-lede">{layer.description}</p>}
    {layer.caveats && <div className="info-caveat">
      <h4>Reading a result</h4>
      <p>{layer.caveats}</p>
    </div>}
    <dl className="info-facts">
      {facts.map(([label, value]) => <div key={label}>
        <dt>{label}</dt>
        <dd className={value ? '' : 'is-missing'}>{value || 'Not recorded'}</dd>
      </div>)}
      <div className="is-wide">
        <dt>Licence</dt>
        <dd>{layer.licence_url ? <a href={layer.licence_url} target="_blank" rel="noopener noreferrer">{layer.licence}</a> : (layer.licence || <span className="is-missing">Not recorded</span>)}</dd>
      </div>
    </dl>
    {layer.attribution && <p className="info-attribution"><span>Attribution</span>{layer.attribution}</p>}
  </article>;
}

function changeLabel(entry) {
  if (entry.first_load) return `First load: ${count(entry.rows_loaded)} features`;
  if (!entry.rows_change) return `New release, ${count(entry.rows_loaded)} features`;
  const sign = entry.rows_change > 0 ? '+' : '−';
  return `${sign}${count(Math.abs(entry.rows_change))} features (now ${count(entry.rows_loaded)})`;
}

export function DataSourcesRoute() {
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = () => {
    setError('');
    api('/api/data-sources').then(setCatalogue).catch(loadError => setError(loadError.message));
  };
  useEffect(load, []);

  const needle = normalize(query.trim());
  const layers = catalogue?.layers || [];
  const visible = useMemo(() => layers.filter(layer => !needle
    || normalize(`${layer.title} ${layer.publisher} ${layer.description} ${layer.section}`).includes(needle)), [layers, needle]);
  const sections = useMemo(() => visible.reduce((groups, layer) => groups.set(layer.section, [...(groups.get(layer.section) || []), layer]), new Map()), [visible]);
  const changelog = (catalogue?.changelog || []).slice(0, 20);

  if (error && !catalogue) return <ErrorScreen message={error} onRetry={load}/>;
  if (!catalogue) return <LoadingScreen label="Loading data sources"/>;

  const sectionId = section => `section-${normalize(section).replace(/[^a-z0-9]+/g, '-')}`;
  const contents = [...sections.keys()].map(section => ({ id: sectionId(section), label: section }));
  if (changelog.length) contents.push({ id: 'updates', label: 'Recent updates' });
  const lastChecked = catalogue.last_checked ? timeFormat.format(new Date(catalogue.last_checked)) : null;

  return <InfoLayout
    title="Data sources"
    standfirst={layers.length
      ? <><b>{layers.length}</b> published {layers.length === 1 ? 'dataset sits' : 'datasets sit'} behind your map and reports. We check each publisher for updates every night{lastChecked ? <>, most recently on <b>{lastChecked}</b></> : null}.</>
      : 'No datasets are assigned to your workspace yet.'}
    contents={contents}
    toolbar={layers.length > 6 && <div className="adm-toolbar">
      <label className="adm-search">
        <Search size={14}/>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search datasets or publishers" aria-label="Search datasets"/>
        {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13}/></button>}
      </label>
      <span className="adm-count">{visible.length} of {layers.length}</span>
    </div>}
  >
    {!visible.length && layers.length > 0 && <p className="info-empty">No datasets match “{query}”.</p>}
    {[...sections].map(([section, items]) => <section key={section} className="info-section" id={sectionId(section)}>
      <h2 className="info-section-head">{section}<span>{items.length} {items.length === 1 ? 'dataset' : 'datasets'}</span></h2>
      {items.map(layer => <Dataset key={layer.layer} layer={layer}/>)}
    </section>)}
    {changelog.length > 0 && !needle && <section className="info-section" id="updates">
      <h2 className="info-section-head">Recent updates</h2>
      <p className="info-note">Each time a publisher releases new data, we load it and record the change here.</p>
      <div className="info-table-wrap"><table className="info-table">
        <thead><tr><th>Loaded</th><th>Dataset</th><th>Change</th></tr></thead>
        <tbody>{changelog.map((entry, index) => <tr key={`${entry.layer}-${index}`}>
          <td className="is-date">{formatDay(entry.loaded_at)}</td>
          <td>{entry.title}</td>
          <td className="is-figure">{changeLabel(entry)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </InfoLayout>;
}

// ---------- /methodology ----------

function ResultKey() {
  return <dl className="info-results">
    {Object.entries(CHECK_STATUS).map(([key, status]) => <div key={key}>
      <dt><i className={`info-pip is-${key}`} style={{ '--pip': status.colour }} aria-hidden="true"/>{status.label}</dt>
      <dd>{RESULT_MEANINGS[key]}</dd>
    </div>)}
  </dl>;
}

function DistanceTable() {
  return <div className="info-table-wrap"><table className="info-table">
    <thead><tr><th>Datasets</th><th className="is-figure">Urban</th><th className="is-figure">Rural</th></tr></thead>
    <tbody>{RADIUS_RULES.map(rule => <tr key={rule.label}>
      <td>{rule.label}</td><td className="is-figure">{metres(rule.urbanM)}</td><td className="is-figure">{metres(rule.ruralM)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function MethodologyRoute() {
  return <InfoLayout title="How the site check works" standfirst={METHOD_INTRO}
    contents={METHOD_SECTIONS.map(section => ({ id: section.id, label: section.title }))}>
    {METHOD_SECTIONS.map(section => <section key={section.id} className="info-section info-prose" id={section.id}>
      <h2 className="info-section-head">{section.title}</h2>
      <Blocks blocks={section.blocks}/>
      {section.results && <ResultKey/>}
      {section.distances && <DistanceTable/>}
      <Blocks blocks={section.after}/>
    </section>)}
    <p className="info-note info-sign-off">Questions about a result in one of your reports? Email <a href="mailto:hello@rosetinsleyconsulting.com">hello@rosetinsleyconsulting.com</a>.</p>
  </InfoLayout>;
}

// ---------- /policies ----------

export function PoliciesRoute() {
  return <InfoLayout title="Policies" standfirst={`How we handle your data, the rules for using the portal, and how the data is licensed. Last updated ${POLICIES_UPDATED}.`}
    contents={POLICY_SECTIONS.map(section => ({ id: section.id, label: section.title }))}>
    {!POLICIES_APPROVED && <p className="info-flag is-block"><AlertCircle size={15}/>Draft wording, under review. Until it’s final, your organisation’s engagement contract with RTC sets the terms.</p>}
    {POLICY_SECTIONS.map(section => <section key={section.id} className="info-section info-prose" id={section.id}>
      <h2 className="info-section-head">{section.title}</h2>
      <Blocks blocks={section.blocks}/>
    </section>)}
  </InfoLayout>;
}
