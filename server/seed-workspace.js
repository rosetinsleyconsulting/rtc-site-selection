// One-off: create a workspace (if missing) and load its site list from a CSV export.
// Skips the insert if the workspace already has sites.
//   npm run seed:workspace -- <path/to/sites.csv> <slug> "<Workspace name>"
// Client CSVs live in the client's folder in OneDrive, never in this repo.
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db, pool } from './db/index.js';
import { sites, workspaces } from './db/schema.js';
import { parseCSV } from '../src/lib/parseCsv.js';

const [csvArg, slug, name] = process.argv.slice(2);
if (!csvArg || !slug || !name) {
  console.error('Usage: npm run seed:workspace -- <path/to/sites.csv> <slug> "<Workspace name>"');
  process.exit(1);
}

const csvText = await fs.readFile(path.resolve(csvArg), 'utf8');
const rows = parseCSV(csvText);

const existing = await db.execute(sql`SELECT id FROM workspaces WHERE slug = ${slug} LIMIT 1`);
let workspaceId = existing.rows[0]?.id;

if (!workspaceId) {
  const created = await db.insert(workspaces).values({ name, slug }).returning({ id: workspaces.id });
  workspaceId = created[0].id;
}

const toArea = value => (value && !value.toLowerCase().includes('n/a') ? Number(value) : null);

const siteCount = await db.execute(sql`SELECT COUNT(*)::int AS count FROM sites WHERE workspace_id = ${workspaceId}`);
if (Number(siteCount.rows[0]?.count || 0) === 0) {
  const values = rows.map(row => ({
    workspaceId,
    type: row.type || '',
    borough: row.borough || '',
    siteName: row.site_name || '',
    category: row.category || '',
    priority: row.priority || '',
    footprintM2: toArea(row.footprint_m2),
    spareLandOnTitleM2: toArea(row.spare_land_on_title_m2),
    voaRateableValue: row.voa_rateable_value ? Number(row.voa_rateable_value) || null : null,
    voaMatchConfidence: row.voa_match_confidence || null,
    nearbyPlanningApplications: row.nearby_planning_applications || null,
    nearbyParking: row.nearby_parking || null,
    dataConfidenceNotes: row.data_confidence_notes || null,
    spareAreaComments: row.spare_area_comments || null,
    lat: Number(row.lat) || null,
    lon: Number(row.lon) || null,
  }));
  await db.insert(sites).values(values);
  console.log(`Seeded ${values.length} sites into workspace "${slug}" (id ${workspaceId}).`);
} else {
  console.log(`Workspace "${slug}" already contains sites; seed skipped.`);
}

await pool.end();
