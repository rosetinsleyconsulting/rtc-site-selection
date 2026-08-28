import { createClerkClient } from '@clerk/backend';
import { sql } from 'drizzle-orm';

const secretKey = process.env.CLERK_SECRET_KEY;
export const clerkConfigured = Boolean(secretKey);
export const clerkClient = clerkConfigured ? createClerkClient({ secretKey }) : null;

const configuredAdminEmails = (process.env.PLATFORM_ADMIN_EMAILS || 'eilish@rosetinsleyconsulting.com')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

function clerkEmail(clerkUser) {
  return clerkUser.primaryEmailAddress?.emailAddress
    || clerkUser.emailAddresses?.[0]?.emailAddress
    || '';
}

function clerkName(clerkUser) {
  return [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim();
}

export async function ensureLocalUser(db, userId) {
  const clerkUser = await clerkClient.users.getUser(userId);
  const email = clerkEmail(clerkUser).toLowerCase();
  const name = clerkName(clerkUser);
  const shouldBeAdmin = configuredAdminEmails.includes(email);

  const result = await db.execute(sql`
    INSERT INTO users (clerk_user_id, email, name, is_platform_admin)
    VALUES (${userId}, ${email}, ${name}, ${shouldBeAdmin})
    ON CONFLICT (clerk_user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      is_platform_admin = users.is_platform_admin OR EXCLUDED.is_platform_admin
    RETURNING id, clerk_user_id AS "clerkUserId", email, name, is_platform_admin AS "isPlatformAdmin"
  `);

  return result.rows[0];
}

export async function requireUser(req, res, next) {
  if (!clerkConfigured) {
    return res.status(503).json({
      error: 'Clerk is not configured',
      message: 'Add CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY to enable authentication.',
    });
  }

  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.localUser = await ensureLocalUser(req.app.locals.db, userId);
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