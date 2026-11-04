import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseConfigured = Boolean(url && serviceRoleKey);

export const supabaseAdmin = supabaseConfigured
  ? createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
