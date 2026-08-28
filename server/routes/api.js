import express from 'express';
import { sql } from 'drizzle-orm';
import { memberships, siteStatuses, sites, users, workspaces } from '../db/schema.js';
import { parseCSV, toNullableNumber } from '../../src/lib/parseCsv.js';
import { requirePlatformAdmin, requireUser, clerkClient } from '../auth.js';

const router = express.Router();
const validStatuses = new Set(['new', 'accepted', 'dismissed']);

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
      s.lat,
      s.lon,
      COALESCE(ss.status, 'new') AS status
    FROM sites s
    LEFT JOIN site_statuses ss ON ss.site_id = s.id
    WHERE s.workspace_id = ${workspaceId}
    ORDER BY s.id
  `);
  res.json({ sites: result.rows });
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
    if (error.code === '23505') return res.status(409).json({ error: 'That workspace slug already exists' });
    console.error('Workspace creation failed:', error);
    res.status(500).json({ error: 'Unable to create workspace' });
  }
});

router.get('/admin/users', requirePlatformAdmin, async (req, res) => {
  privateResponse(res);
  const [userResult, membershipResult] = await Promise.all([
    req.app.locals.db.execute(sql`
      SELECT id, email, name, is_platform_admin, created_at
      FROM users ORDER BY lower(name), lower(email)
    `),
    req.app.locals.db.execute(sql`
      SELECT m.user_id, w.id AS workspace_id, w.name, w.slug
      FROM memberships m INNER JOIN workspaces w ON w.id = m.workspace_id
      ORDER BY w.name
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
  });
});

router.post('/admin/users/invite', requirePlatformAdmin, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Provide a valid email address' });
  if (!clerkClient) return res.status(503).json({ error: 'Clerk is not configured' });

  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: '/sign-up',
    });
    res.status(201).json({ invitationId: invitation.id, email });
  } catch (error) {
    console.error('Invitation failed:', error);
    res.status(502).json({ error: 'Unable to send invitation' });
  }
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
  res.json(result[0]);
});

export default router;