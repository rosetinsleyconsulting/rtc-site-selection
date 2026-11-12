import { sql } from 'drizzle-orm';

// Audit trail and error log, both in the portal database (server/db/sql/2026-11-12-audit-log.sql).
// audit_log is append-only for the app's login: the app can add rows but never edit or delete them.
// Neither write may break the request it describes, so failures are logged to the console and swallowed.

const clientIp = req => req?.get?.('cf-connecting-ip') || req?.ip || null;

// action: dotted name, e.g. 'user.invited'. target: what it was done to, in words (an email, "site 12").
export async function audit(req, action, { workspaceId = null, target = null, detail = {}, actor = req?.localUser } = {}) {
  try {
    await req.app.locals.db.execute(sql`
      INSERT INTO audit_log (actor_user_id, actor_email, action, workspace_id, target, detail, ip)
      VALUES (${actor?.id ?? null}, ${actor?.email ?? null}, ${action}, ${workspaceId}, ${target},
              ${JSON.stringify(detail)}::jsonb, ${clientIp(req)})
    `);
  } catch (error) {
    console.error(`Audit log write failed (${action}):`, error.message);
  }
}

// Same insert for code that runs outside a request handler (sign-in provisioning has the db but no req)
export async function auditWithDb(db, action, { actor = null, workspaceId = null, target = null, detail = {} } = {}) {
  return audit({ app: { locals: { db } } }, action, { actor, workspaceId, target, detail });
}

// Records every 5xx the API sends, with the route and who asked. Route handlers that catch their own errors
// can set res.locals.errorMessage so the log says what went wrong, not just the status.
export function recordServerErrors(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode < 500) return;
    const message = String(res.locals.errorMessage || '').slice(0, 1000) || null;
    req.app.locals.db.execute(sql`
      INSERT INTO app_events (level, method, path, status, message, user_id)
      VALUES ('error', ${req.method}, ${req.originalUrl.split('?')[0].slice(0, 300)}, ${res.statusCode}, ${message},
              ${req.localUser?.id ?? null})
    `).catch(error => console.error('Error log write failed:', error.message));
  });
  next();
}

// Last-resort handler for errors thrown inside API routes (Express 5 passes rejected promises here)
export function apiErrorHandler(error, req, res, next) {
  console.error(`Unhandled error on ${req.method} ${req.originalUrl.split('?')[0]}:`, error);
  if (res.headersSent) return next(error);
  res.locals.errorMessage = error?.message || String(error);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
