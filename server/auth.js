import { sql } from 'drizzle-orm';
import { supabaseAdmin, supabaseConfigured } from './supabase.js';

const configuredAdminEmails = (process.env.PLATFORM_ADMIN_EMAILS || 'eilish@rosetinsleyconsulting.com')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

export async function ensureLocalUser(db, supabaseUser) {
  const email = (supabaseUser.email || '').toLowerCase();
  const name = supabaseUser.user_metadata?.name || '';
  const shouldBeAdmin = configuredAdminEmails.includes(email);

  const result = await db.execute(sql`
    INSERT INTO users (supabase_user_id, email, name, is_platform_admin)
    VALUES (${supabaseUser.id}, ${email}, ${name}, ${shouldBeAdmin})
    ON CONFLICT (supabase_user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      -- Supabase profiles usually carry no name; keep one set here rather than blanking it at every sign-in
      name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
      is_platform_admin = users.is_platform_admin OR EXCLUDED.is_platform_admin
    RETURNING id, supabase_user_id AS "supabaseUserId", email, name, is_platform_admin AS "isPlatformAdmin"
  `);
  const localUser = result.rows[0];

  const pending = await db.execute(sql`
    DELETE FROM pending_invites WHERE email = ${email} RETURNING workspace_id
  `);
  const invitedWorkspaceId = pending.rows[0]?.workspace_id;
  if (Number.isInteger(invitedWorkspaceId)) {
    await db.execute(sql`
      INSERT INTO memberships (user_id, workspace_id)
      VALUES (${localUser.id}, ${invitedWorkspaceId})
      ON CONFLICT DO NOTHING
    `);
  }

  return localUser;
}

// The map makes one request per tile, so checking every one with Supabase would be slow and costly.
// Verified sessions are remembered for a minute; a revoked login stops working within that window.
const SESSION_CACHE_MS = 60 * 1000;
const sessionCache = new Map();

async function resolveLocalUser(db, token) {
  const cached = sessionCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.localUser;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const localUser = await ensureLocalUser(db, data.user);
  if (sessionCache.size > 2000) sessionCache.clear();
  sessionCache.set(token, { localUser, expiresAt: Date.now() + SESSION_CACHE_MS });
  return localUser;
}

// Admin changes (role or memberships) should apply straight away rather than after the cache expires
export function clearSessionCache() {
  sessionCache.clear();
}

export async function requireUser(req, res, next) {
  if (!supabaseConfigured) {
    return res.status(503).json({
      error: 'Supabase is not configured',
      message: 'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable authentication.',
    });
  }

  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const localUser = await resolveLocalUser(req.app.locals.db, token);
    if (!localUser) return res.status(401).json({ error: 'Unauthorized' });
    req.localUser = localUser;
    return next();
  } catch (error) {
    console.error('Unable to provision local user:', error);
    return res.status(500).json({ error: 'Unable to provision local user' });
  }
}

export function requirePlatformAdmin(req, res, next) {
  if (!req.localUser?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  return next();
}
