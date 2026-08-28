import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db, pool } from './db/index.js';
import { sites, workspaces } from './db/schema.js';
import { parseCSV } from '../src/lib/parseCsv.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(root, 'attached_assets', '0_lowlu_final_sites_export_1787904911415.csv');
const csvText = await fs.readFile(csvPath, 'utf8');
const rows = parseCSV(csvText);

const existing = await db.execute(sql`SELECT id FROM workspaces WHERE slug = 'lowlu' LIMIT 1`);
let workspaceId = existing.rows[0]?.id;

if (!workspaceId) {
  const created = await db.insert(workspaces).values({ name: 'Lowlu', slug: 'lowlu' }).returning({ id: workspaces.id });
  workspaceId = created[0].id;
}

const siteCount = await db.execute(sql`SELECT COUNT(*)::int AS count FROM sites WHERE workspace_id = ${workspaceId}`);
if (Number(siteCount.rows[0]?.count || 0) === 0) {
  const values = rows.map(row => ({
    workspaceId,
    type: row.type || '',
    borough: row.borough || '',
    siteName: row.site_name || '',
    category: row.category || '',
    priority: row.priority || '',
    footprintM2: row.footprint_m2 && !row.footprint_m2.toLowerCase().includes('n/a') ? Number(row.footprint_m2) : null,
    spareLandOnTitleM2: row.spare_land_on_title_m2 && !row.spare_land_on_title_m2.toLowerCase().includes('n/a') ? Number(row.spare_land_on_title_m2) : null,
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
  console.log(`Seeded ${values.length} Lowlu sites.`);
} else {
  console.log('Lowlu workspace already contains sites; seed skipped.');
}

await pool.end();