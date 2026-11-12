import pg from 'pg';

// Read-only connection to the site_selection database, used for the appraisal constraint check.
// Its login (site_selection_reader) can only run meta.site_check(); it cannot read any table directly.
// Kept separate from the portal pool so a slow spatial query can never hold up sign-in or site lists.
const { Pool } = pg;
const connectionString = process.env.SPATIAL_DATABASE_URL;

export const spatialConfigured = Boolean(connectionString);
export const spatialPool = spatialConfigured
  ? new Pool({ connectionString, max: 4, statement_timeout: 20000 })
  : null;
