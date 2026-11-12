import express from 'express';
import rateLimit from 'express-rate-limit';
import { sql } from 'drizzle-orm';
import { appraisalRequests, memberships, pendingInvites, siteStatuses, sites, users, workspaces } from '../db/schema.js';
import { parseCSV, toNullableNumber } from '../../src/lib/parseCsv.js';
import { clearSessionCache, requirePlatformAdmin, requireUser } from '../auth.js';
import { supabaseAdmin, supabaseConfigured } from '../supabase.js';
import { spatialConfigured, spatialPool } from '../db/spatial.js';

const router = express.Router();
const validStatuses = new Set(['new', 'accepted', 'dismissed']);
const appraisalStatuses = new Set(['requested', 'in_progress', 'delivered', 'cancelled']);
// Martin is only reachable inside Galahad (loopback, or the rtc-tiles Docker network from the container)
const MARTIN_URL = (process.env.MARTIN_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const layerRoles = new Set(['parcels', 'buildings']);
// Drizzle wraps driver errors, so the Postgres code may sit on error.cause
const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';
// Placeholder price (3 Nov 2026), not yet agreed. One place to change it; requests store the price they were made at.
const APPRAISAL_OFFER = { pricePence: 20000, vat: 'plus VAT' };
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const DEFAULT_MAP_CONFIG = {
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

function mergeMapConfig(stored) {
  const config = (stored && typeof stored === 'object') ? stored : {};
  const symbology = (config.symbology && typeof config.symbology === 'object') ? config.symbology : {};
  const zoomRanges = (config.zoomRanges && typeof config.zoomRanges === 'object') ? config.zoomRanges : {};
  const validOrder = Array.isArray(config.layerOrder)
    && config.layerOrder.length === 2
    && new Set(config.layerOrder).size === 2
    && config.layerOrder.every(key => key === 'parcels' || key === 'buildings');
  return {
    contextLayerDefaultOn: typeof config.contextLayerDefaultOn === 'boolean' ? config.contextLayerDefaultOn : DEFAULT_MAP_CONFIG.contextLayerDefaultOn,
    layerOrder: validOrder ? config.layerOrder : DEFAULT_MAP_CONFIG.layerOrder,
    symbology: {
      parcels: { ...DEFAULT_MAP_CONFIG.symbology.parcels, ...(symbology.parcels || {}) },
      buildingsFill: { ...DEFAULT_MAP_CONFIG.symbology.buildingsFill, ...(symbology.buildingsFill || {}) },
      buildingsOutline: { ...DEFAULT_MAP_CONFIG.symbology.buildingsOutline, ...(symbology.buildingsOutline || {}) },
      markers: { ...DEFAULT_MAP_CONFIG.symbology.markers, ...(symbology.markers || {}) },
    },
    zoomRanges: {
      parcels: { ...DEFAULT_MAP_CONFIG.zoomRanges.parcels, ...(zoomRanges.parcels || {}) },
      buildings: { ...DEFAULT_MAP_CONFIG.zoomRanges.buildings, ...(zoomRanges.buildings || {}) },
    },
  };
}

function clampNumber(value, min, max) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : null;
}

function validateMapConfig(input) {
  if (!input || typeof input !== 'object') return null;
  const layerOrder = input.layerOrder;
  if (!Array.isArray(layerOrder) || layerOrder.length !== 2 || new Set(layerOrder).size !== 2 || !layerOrder.every(key => key === 'parcels' || key === 'buildings')) return null;

  const symbology = input.symbology || {};
  const markers = symbology.markers || {};
  const colors = {
    parcels: symbology.parcels?.color,
    buildingsFill: symbology.buildingsFill?.color,
    buildingsOutline: symbology.buildingsOutline?.color,
    markerNew: markers.new,
    markerAccepted: markers.accepted,
    markerDismissed: markers.dismissed,
  };
  if (Object.values(colors).some(color => !HEX_COLOR.test(color || ''))) return null;

  const parcelsWidth = clampNumber(symbology.parcels?.width, 0.2, 6);
  const parcelsOpacity = clampNumber(symbology.parcels?.opacity, 0, 1);
  const buildingsFillOpacity = clampNumber(symbology.buildingsFill?.opacity, 0, 1);
  const buildingsOutlineWidth = clampNumber(symbology.buildingsOutline?.width, 0.2, 6);
  if ([parcelsWidth, parcelsOpacity, buildingsFillOpacity, buildingsOutlineWidth].some(value => value === null)) return null;

  const zoomRanges = input.zoomRanges || {};
  const parcelsMinZoom = clampNumber(zoomRanges.parcels?.minZoom, 0, 24);
  const parcelsMaxZoom = clampNumber(zoomRanges.parcels?.maxZoom, 0, 24);
  const buildingsMinZoom = clampNumber(zoomRanges.buildings?.minZoom, 0, 24);
  const buildingsMaxZoom = clampNumber(zoomRanges.buildings?.maxZoom, 0, 24);
  if ([parcelsMinZoom, parcelsMaxZoom, buildingsMinZoom, buildingsMaxZoom].some(value => value === null)) return null;
  if (parcelsMinZoom >= parcelsMaxZoom || buildingsMinZoom >= buildingsMaxZoom) return null;

  return {
    contextLayerDefaultOn: Boolean(input.contextLayerDefaultOn),
    layerOrder,
    symbology: {
      parcels: { color: colors.parcels, width: parcelsWidth, opacity: parcelsOpacity },
      buildingsFill: { color: colors.buildingsFill, opacity: buildingsFillOpacity },
      buildingsOutline: { color: colors.buildingsOutline, width: buildingsOutlineWidth },
      markers: { new: colors.markerNew, accepted: colors.markerAccepted, dismissed: colors.markerDismissed },
    },
    zoomRanges: {
      parcels: { minZoom: parcelsMinZoom, maxZoom: parcelsMaxZoom },
      buildings: { minZoom: buildingsMinZoom, maxZoom: buildingsMaxZoom },
    },
  };
}

function privateResponse(res) {
  res.set('Cache-Control', 'private, no-store');
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function siteInsertValues(workspaceId, row) {
  return {
    workspaceId,
    type: row.type || '',
    borough: row.borough || '',
    siteName: row.site_name || '',
    category: row.category || '',
    priority: row.priority || '',
    footprintM2: toNullableNumber(row.footprint_m2),
    spareLandOnTitleM2: toNullableNumber(row.spare_land_on_title_m2),
    voaRateableValue: toNullableNumber(row.voa_rateable_value),
    voaMatchConfidence: row.voa_match_confidence || null,
    nearbyPlanningApplications: row.nearby_planning_applications || null,
    nearbyParking: row.nearby_parking || null,
    dataConfidenceNotes: row.data_confidence_notes || null,
    spareAreaComments: row.spare_area_comments || null,
    lat: toNullableNumber(row.lat),
    lon: toNullableNumber(row.lon),
  };
}

async function hasWorkspaceAccess(db, user, workspaceId) {
  if (user.isPlatformAdmin) return true;
  const result = await db.execute(sql`
    SELECT 1 FROM memberships
    WHERE user_id = ${user.id} AND workspace_id = ${workspaceId}
    LIMIT 1
  `);
  return result.rows.length > 0;
}

router.use((req, res, next) => {
  if (req.method === 'GET') privateResponse(res);
  next();
});
router.use(requireUser);

router.get('/me', async (req, res) => {
  privateResponse(res);
  const workspaceQuery = req.localUser.isPlatformAdmin
    ? sql`SELECT id, name, slug FROM workspaces ORDER BY name`
    : sql`
      SELECT w.id, w.name, w.slug
      FROM workspaces w
      INNER JOIN memberships m ON m.workspace_id = w.id
      WHERE m.user_id = ${req.localUser.id}
      ORDER BY w.name
    `;
  const result = await req.app.locals.db.execute(workspaceQuery);
  res.json({
    user: req.localUser,
    isPlatformAdmin: req.localUser.isPlatformAdmin,
    workspaces: result.rows,
  });
});

router.get('/workspaces/:workspaceId/sites', async (req, res) => {
  privateResponse(res);
  const workspaceId = Number(req.params.workspaceId);
  if (!Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid workspace id' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }

  const result = await req.app.locals.db.execute(sql`
    SELECT
      s.id,
      s.type,
      s.borough,
      s.site_name,
      s.category,
      s.priority,
      s.footprint_m2,
      s.spare_land_on_title_m2,
      s.voa_rateable_value,
      s.voa_match_confidence,
      s.nearby_planning_applications,
      s.nearby_parking,
      s.data_confidence_notes,
      s.spare_area_comments,
      s.review_flag,
      s.lat,
      s.lon,
      COALESCE(ss.status, 'new') AS status,
      ar.id AS appraisal_id,
      ar.status AS appraisal_status,
      ar.created_at AS appraisal_requested_at,
      ar.price_pence AS appraisal_price_pence
    FROM sites s
    LEFT JOIN site_statuses ss ON ss.site_id = s.id
    -- Latest appraisal request per site, if any
    LEFT JOIN LATERAL (
      SELECT id, status, created_at, price_pence FROM appraisal_requests
      WHERE site_id = s.id ORDER BY created_at DESC LIMIT 1
    ) ar ON true
    WHERE s.workspace_id = ${workspaceId}
    ORDER BY s.id
  `);
  res.json({ sites: result.rows, appraisalOffer: APPRAISAL_OFFER });
});

// Appraisal requests are paid work, so cap how many one person can send in a short time
const appraisalRequestLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: req => `user-${req.localUser.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many appraisal requests in a short time. Please try again in a few minutes.' },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

router.post('/workspaces/:workspaceId/sites/:siteId/appraisal-requests', appraisalRequestLimit, async (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const siteId = Number(req.params.siteId);
  if (!Number.isInteger(workspaceId) || !Number.isInteger(siteId)) return res.status(400).json({ error: 'Invalid workspace or site' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }
  const site = await req.app.locals.db.execute(sql`
    SELECT id FROM sites WHERE id = ${siteId} AND workspace_id = ${workspaceId} LIMIT 1
  `);
  if (!site.rows.length) return res.status(404).json({ error: 'Site not found' });
  const notes = String(req.body?.notes || '').trim().slice(0, 2000) || null;

  try {
    const [request] = await req.app.locals.db
      .insert(appraisalRequests)
      .values({ workspaceId, siteId, requestedBy: req.localUser.id, pricePence: APPRAISAL_OFFER.pricePence, notes })
      .returning();
    // TODO: email RTC (hello@) about the new request once the app can send mail.
    res.status(201).json({ request });
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'An appraisal has already been requested for this site' });
    console.error('Appraisal request failed:', error);
    res.status(500).json({ error: 'Unable to request an appraisal' });
  }
});

// Clients can withdraw a request until RTC starts work on it
router.post('/workspaces/:workspaceId/appraisal-requests/:requestId/cancel', async (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(workspaceId) || !Number.isInteger(requestId)) return res.status(400).json({ error: 'Invalid workspace or request' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }
  const result = await req.app.locals.db.execute(sql`
    UPDATE appraisal_requests SET status = 'cancelled', updated_at = now()
    WHERE id = ${requestId} AND workspace_id = ${workspaceId} AND status = 'requested'
    RETURNING id, site_id, status
  `);
  if (!result.rows.length) return res.status(409).json({ error: 'This request can no longer be withdrawn' });
  res.json({ request: result.rows[0] });
});

router.get('/workspaces/:workspaceId/map-config', async (req, res) => {
  privateResponse(res);
  const workspaceId = Number(req.params.workspaceId);
  if (!Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid workspace id' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }
  const result = await req.app.locals.db.execute(sql`SELECT map_config FROM workspaces WHERE id = ${workspaceId} LIMIT 1`);
  if (!result.rows.length) return res.status(404).json({ error: 'Workspace not found' });
  res.json({ mapConfig: mergeMapConfig(result.rows[0].map_config) });
});

router.get('/workspaces/:workspaceId/layers', async (req, res) => {
  privateResponse(res);
  const workspaceId = Number(req.params.workspaceId);
  if (!Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid workspace id' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }
  const result = await req.app.locals.db.execute(sql`
    SELECT role, source_id, label FROM workspace_layers WHERE workspace_id = ${workspaceId} ORDER BY role
  `);
  res.json({ layers: result.rows, constraints: await workspaceConstraints(req.app.locals.db, workspaceId) });
});

async function workspaceConstraints(db, workspaceId) {
  try {
    const result = await db.execute(sql`
      SELECT source_id, label, colour, section FROM workspace_constraint_layers
      WHERE workspace_id = ${workspaceId} ORDER BY sort_order, label
    `);
    return result.rows;
  } catch (error) {
    // Table not created yet in this database (see server/db/sql): behave as if no constraints are assigned
    if ((error.cause?.code || error.code) === '42P01') return [];
    throw error;
  }
}

const parseTile = params => {
  const [z, x, y] = [params.z, params.x, params.y].map(Number);
  const ok = Number.isInteger(z) && z >= 0 && z <= 24 && [x, y].every(n => Number.isInteger(n) && n >= 0 && n < 2 ** z);
  return ok ? { z, x, y } : null;
};

// Vector tiles, only for layers assigned to a workspace the user belongs to. Martin itself is not public.
router.get('/workspaces/:workspaceId/tiles/:role/:z/:x/:y', async (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const tile = parseTile(req.params);
  const { role } = req.params;
  if (!Number.isInteger(workspaceId) || !layerRoles.has(role) || !tile) return res.status(400).json({ error: 'Invalid tile request' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }
  const layer = await req.app.locals.db.execute(sql`
    SELECT source_id FROM workspace_layers WHERE workspace_id = ${workspaceId} AND role = ${role} LIMIT 1
  `);
  if (!layer.rows.length) return res.status(404).json({ error: 'Layer not available for this workspace' });
  await proxyTile(res, layer.rows[0].source_id, tile);
});

// Constraint tiles: the source must be assigned to this workspace in workspace_constraint_layers
router.get('/workspaces/:workspaceId/constraints/:sourceId/:z/:x/:y', async (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const tile = parseTile(req.params);
  const { sourceId } = req.params;
  if (!Number.isInteger(workspaceId) || !/^[a-z0-9_]+$/.test(sourceId) || !tile) return res.status(400).json({ error: 'Invalid tile request' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }
  const assigned = (await workspaceConstraints(req.app.locals.db, workspaceId)).some(layer => layer.source_id === sourceId);
  if (!assigned) return res.status(404).json({ error: 'Layer not available for this workspace' });
  await proxyTile(res, sourceId, tile);
});

async function proxyTile(res, sourceId, { z, x, y }) {
  try {
    const upstream = await fetch(`${MARTIN_URL}/${encodeURIComponent(sourceId)}/${z}/${x}/${y}`);
    // Tiles change rarely, but they belong to one client, so only the browser may cache them
    res.set('Cache-Control', 'private, max-age=600');
    if (upstream.status === 204) return res.status(204).end();
    if (!upstream.ok) return res.status(502).json({ error: 'Tile server error' });
    // fetch has already decompressed the body, so the upstream Content-Encoding is not passed on
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/x-protobuf');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('Tile fetch failed:', error.message);
    res.status(502).json({ error: 'Tile server unavailable' });
  }
}

router.patch('/admin/workspaces/:workspaceId/map-config', requirePlatformAdmin, async (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  if (!Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid workspace id' });
  const validated = validateMapConfig(req.body?.mapConfig);
  if (!validated) return res.status(400).json({ error: 'Invalid map configuration' });
  const result = await req.app.locals.db
    .update(workspaces)
    .set({ mapConfig: validated })
    .where(sql`${workspaces.id} = ${workspaceId}`)
    .returning({ id: workspaces.id, mapConfig: workspaces.mapConfig });
  if (!result.length) return res.status(404).json({ error: 'Workspace not found' });
  res.json({ mapConfig: mergeMapConfig(result[0].mapConfig) });
});

router.patch('/workspaces/:workspaceId/sites/:siteId/status', async (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  const siteId = Number(req.params.siteId);
  const { status } = req.body || {};
  if (!Number.isInteger(workspaceId) || !Number.isInteger(siteId) || !validStatuses.has(status)) {
    return res.status(400).json({ error: 'Invalid workspace, site, or status' });
  }
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }

  const site = await req.app.locals.db.execute(sql`
    SELECT id FROM sites WHERE id = ${siteId} AND workspace_id = ${workspaceId} LIMIT 1
  `);
  if (!site.rows.length) return res.status(404).json({ error: 'Site not found' });

  await req.app.locals.db
    .insert(siteStatuses)
    .values({ siteId, status, updatedBy: req.localUser.id })
    .onConflictDoUpdate({
      target: siteStatuses.siteId,
      set: { status, updatedBy: req.localUser.id, updatedAt: new Date() },
    });

  res.json({ siteId, status });
});

router.post('/workspaces/:workspaceId/import-local-statuses', async (req, res) => {
  const workspaceId = Number(req.params.workspaceId);
  if (!Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid workspace id' });
  if (!(await hasWorkspaceAccess(req.app.locals.db, req.localUser, workspaceId))) {
    return res.status(403).json({ error: 'Workspace access required' });
  }
  const localStatuses = req.body?.statuses;
  if (!localStatuses || typeof localStatuses !== 'object' || Array.isArray(localStatuses)) {
    return res.status(400).json({ error: 'Statuses must be an object' });
  }

  const existing = await req.app.locals.db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM site_statuses ss
    INNER JOIN sites s ON s.id = ss.site_id
    WHERE s.workspace_id = ${workspaceId}
  `);
  if (Number(existing.rows[0]?.count || 0) > 0) return res.json({ migrated: false, reason: 'statuses-exist' });

  const siteRows = await req.app.locals.db.execute(sql`
    SELECT id FROM sites WHERE workspace_id = ${workspaceId} ORDER BY id
  `);
  const records = Object.entries(localStatuses)
    .filter(([, status]) => validStatuses.has(status))
    .map(([legacyId, status]) => {
      const index = Number(legacyId) - 1;
      const site = siteRows.rows[index];
      return site ? { siteId: site.id, status, updatedBy: req.localUser.id } : null;
    })
    .filter(Boolean);

  if (records.length) {
    await req.app.locals.db.insert(siteStatuses).values(records).onConflictDoNothing();
  }
  res.json({ migrated: records.length > 0, count: records.length });
});

router.get('/admin/workspaces', requirePlatformAdmin, async (req, res) => {
  privateResponse(res);
  const result = await req.app.locals.db.execute(sql`
    SELECT
      w.id, w.name, w.slug, w.created_at,
      COUNT(DISTINCT s.id)::int AS site_count,
      COUNT(DISTINCT m.user_id)::int AS member_count
    FROM workspaces w
    LEFT JOIN sites s ON s.workspace_id = w.id
    LEFT JOIN memberships m ON m.workspace_id = w.id
    GROUP BY w.id
    ORDER BY w.name
  `);
  res.json({ workspaces: result.rows });
});

router.post('/admin/workspaces', requirePlatformAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const slug = normalizeSlug(req.body?.slug || name);
  const csvText = String(req.body?.csvText || '');
  if (!name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'Provide a valid workspace name and slug' });
  }
  const rows = parseCSV(csvText);
  if (!rows.length) return res.status(400).json({ error: 'Add a CSV with at least one site row' });

  try {
    const workspace = await req.app.locals.db.transaction(async tx => {
      const created = await tx
        .insert(workspaces)
        .values({ name, slug })
        .returning({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug });
      await tx.insert(sites).values(rows.map(row => siteInsertValues(created[0].id, row)));
      return created[0];
    });
    res.status(201).json({ workspace });
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'That workspace slug already exists' });
    console.error('Workspace creation failed:', error);
    res.status(500).json({ error: 'Unable to create workspace' });
  }
});

router.get('/admin/appraisal-requests', requirePlatformAdmin, async (req, res) => {
  privateResponse(res);
  const result = await req.app.locals.db.execute(sql`
    SELECT
      ar.id, ar.status, ar.price_pence, ar.notes, ar.created_at, ar.updated_at,
      s.id AS site_id, s.site_name, s.borough, s.category, s.lat, s.lon,
      s.footprint_m2, s.spare_land_on_title_m2, s.voa_rateable_value, s.voa_match_confidence, s.review_flag,
      w.id AS workspace_id, w.name AS workspace_name,
      u.email AS requested_by_email, u.name AS requested_by_name
    FROM appraisal_requests ar
    INNER JOIN sites s ON s.id = ar.site_id
    INNER JOIN workspaces w ON w.id = ar.workspace_id
    INNER JOIN users u ON u.id = ar.requested_by
    ORDER BY (ar.status IN ('requested', 'in_progress')) DESC, ar.created_at DESC
  `);
  res.json({ requests: result.rows });
});

// Constraint check for the site behind an appraisal request: every registry layer, measured from the
// site's confirmed boundary if it has one, otherwise its point. Features out to SITE_CHECK_MAX_M come back
// with distances, so the report builder applies each layer's own search radius without asking again.
const SITE_CHECK_MAX_M = 3000;
router.get('/admin/appraisal-requests/:requestId/site-check', requirePlatformAdmin, async (req, res) => {
  privateResponse(res);
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId)) return res.status(400).json({ error: 'Invalid request' });
  if (!spatialConfigured) return res.status(503).json({ error: 'Constraint data is not configured (SPATIAL_DATABASE_URL)' });
  const found = await req.app.locals.db.execute(sql`
    SELECT ar.workspace_id, s.id AS site_id, s.lat, s.lon
    FROM appraisal_requests ar INNER JOIN sites s ON s.id = ar.site_id
    WHERE ar.id = ${requestId} LIMIT 1
  `);
  const site = found.rows[0];
  if (!site) return res.status(404).json({ error: 'Request not found' });
  try {
    const result = await spatialPool.query(
      'SELECT meta.site_check($1, $2, $3, $4, $5) AS check',
      [site.workspace_id, site.site_id, toNullableNumber(site.lon), toNullableNumber(site.lat), SITE_CHECK_MAX_M],
    );
    res.json({ siteCheck: result.rows[0].check });
  } catch (error) {
    console.error('Site check failed:', error.message);
    res.status(502).json({ error: 'Unable to run the constraint check for this site' });
  }
});

router.patch('/admin/appraisal-requests/:requestId', requirePlatformAdmin, async (req, res) => {
  const requestId = Number(req.params.requestId);
  const status = req.body?.status;
  if (!Number.isInteger(requestId) || !appraisalStatuses.has(status)) return res.status(400).json({ error: 'Invalid request or status' });
  try {
    const result = await req.app.locals.db.execute(sql`
      UPDATE appraisal_requests SET status = ${status}, updated_at = now()
      WHERE id = ${requestId}
      RETURNING id, status
    `);
    if (!result.rows.length) return res.status(404).json({ error: 'Request not found' });
    res.json({ request: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'This site already has another open request' });
    console.error('Appraisal status update failed:', error);
    res.status(500).json({ error: 'Unable to update the request' });
  }
});

router.get('/admin/users', requirePlatformAdmin, async (req, res) => {
  privateResponse(res);
  const [userResult, membershipResult, inviteResult] = await Promise.all([
    req.app.locals.db.execute(sql`
      SELECT id, email, name, is_platform_admin, created_at
      FROM users ORDER BY lower(name), lower(email)
    `),
    req.app.locals.db.execute(sql`
      SELECT m.user_id, w.id AS workspace_id, w.name, w.slug
      FROM memberships m INNER JOIN workspaces w ON w.id = m.workspace_id
      ORDER BY w.name
    `),
    // Invited people who haven't signed in yet (the row is removed on their first sign-in)
    req.app.locals.db.execute(sql`
      SELECT p.email, p.workspace_id, w.name AS workspace_name, p.created_at
      FROM pending_invites p LEFT JOIN workspaces w ON w.id = p.workspace_id
      ORDER BY p.created_at DESC
    `),
  ]);
  const membershipMap = new Map();
  for (const membership of membershipResult.rows) {
    const list = membershipMap.get(membership.user_id) || [];
    list.push({ id: membership.workspace_id, name: membership.name, slug: membership.slug });
    membershipMap.set(membership.user_id, list);
  }
  res.json({
    users: userResult.rows.map(user => ({
      ...user,
      memberships: membershipMap.get(user.id) || [],
    })),
    pendingInvites: inviteResult.rows,
  });
});

// Email links must point at the fixed public address, never one built from the request's Host header
const appUrl = req => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
const setPasswordUrl = req => `${appUrl(req)}/set-password`;

// Every email the app asks Supabase to send costs Resend quota and lands in someone's inbox: cap them per admin
const authEmailLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: req => `auth-email-${req.localUser.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many emails sent in a short time. Try again in a few minutes.' },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Supabase refuses a second invite to an address it already knows (invited but never finished, or a
// past user). A recovery email gives them a fresh set-password link instead, and confirms the address.
async function sendInviteOrFreshLink(email, req) {
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: setPasswordUrl(req) });
  if (!error) return 'invited';
  if (!/already (been )?registered|already exists/i.test(error.message || '')) throw error;
  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: setPasswordUrl(req) });
  if (resetError) throw resetError;
  return 'link-resent';
}

router.post('/admin/users/invite', requirePlatformAdmin, authEmailLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Provide a valid email address' });
  if (!supabaseConfigured) return res.status(503).json({ error: 'Supabase is not configured' });

  let workspaceId = null;
  if (req.body?.workspaceId !== undefined && req.body?.workspaceId !== null && req.body?.workspaceId !== '') {
    workspaceId = Number(req.body.workspaceId);
    if (!Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid workspace id' });
    const workspaceExists = await req.app.locals.db.execute(sql`SELECT 1 FROM workspaces WHERE id = ${workspaceId} LIMIT 1`);
    if (!workspaceExists.rows.length) return res.status(404).json({ error: 'Workspace not found' });
  }

  try {
    await req.app.locals.db.insert(pendingInvites).values({ email, workspaceId }).onConflictDoUpdate({
      target: pendingInvites.email,
      set: { workspaceId },
    });
    const outcome = await sendInviteOrFreshLink(email, req);
    res.status(201).json({ email, workspaceId, outcome });
  } catch (error) {
    console.error('Invitation failed:', error);
    res.status(502).json({ error: 'Unable to send invitation' });
  }
});

router.delete('/admin/pending-invites/:email', requirePlatformAdmin, async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  await req.app.locals.db.delete(pendingInvites).where(sql`${pendingInvites.email} = ${email}`);
  res.status(204).end();
});

// Sends the person a link to choose a new password. Works for anyone with an account, including
// invited people who never finished setting up.
router.post('/admin/users/:userId/password-reset', requirePlatformAdmin, authEmailLimit, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });
  if (!supabaseConfigured) return res.status(503).json({ error: 'Supabase is not configured' });
  const result = await req.app.locals.db.execute(sql`SELECT email FROM users WHERE id = ${userId}`);
  const email = result.rows[0]?.email;
  if (!email) return res.status(404).json({ error: 'User not found' });
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: setPasswordUrl(req) });
  if (error) {
    console.error('Password reset email failed:', error);
    return res.status(502).json({ error: 'Unable to send the reset email' });
  }
  res.status(202).json({ email });
});

router.post('/admin/users/:userId/memberships', requirePlatformAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const workspaceId = Number(req.body?.workspaceId);
  if (!Number.isInteger(userId) || !Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid user or workspace id' });
  const result = await req.app.locals.db.execute(sql`
    SELECT
      (SELECT id FROM users WHERE id = ${userId}) AS user_id,
      (SELECT id FROM workspaces WHERE id = ${workspaceId}) AS workspace_id
  `);
  if (!result.rows[0]?.user_id || !result.rows[0]?.workspace_id) return res.status(404).json({ error: 'User or workspace not found' });
  await req.app.locals.db.insert(memberships).values({ userId, workspaceId }).onConflictDoNothing();
  res.status(201).json({ userId, workspaceId });
});

router.delete('/admin/users/:userId/memberships/:workspaceId', requirePlatformAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const workspaceId = Number(req.params.workspaceId);
  if (!Number.isInteger(userId) || !Number.isInteger(workspaceId)) return res.status(400).json({ error: 'Invalid user or workspace id' });
  await req.app.locals.db.delete(memberships).where(sql`${memberships.userId} = ${userId} AND ${memberships.workspaceId} = ${workspaceId}`);
  res.status(204).end();
});

router.patch('/admin/users/:userId', requirePlatformAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || typeof req.body?.isPlatformAdmin !== 'boolean') return res.status(400).json({ error: 'Invalid admin setting' });
  if (userId === req.localUser.id && !req.body.isPlatformAdmin) return res.status(400).json({ error: 'You cannot remove your own platform-admin access' });
  const result = await req.app.locals.db
    .update(users)
    .set({ isPlatformAdmin: req.body.isPlatformAdmin })
    .where(sql`${users.id} = ${userId}`)
    .returning({ id: users.id, isPlatformAdmin: users.isPlatformAdmin });
  if (!result.length) return res.status(404).json({ error: 'User not found' });
  clearSessionCache();
  res.json(result[0]);
});

export default router;