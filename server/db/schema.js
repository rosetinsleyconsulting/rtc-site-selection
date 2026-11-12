import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const siteStatusEnum = pgEnum('site_status', ['new', 'accepted', 'dismissed']);
export const appraisalStatusEnum = pgEnum('appraisal_status', ['requested', 'in_progress', 'delivered', 'cancelled']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  supabaseUserId: uuid('supabase_user_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  supabaseUserIdUnique: uniqueIndex('users_supabase_user_id_idx').on(table.supabaseUserId),
}));

export const pendingInvites = pgTable('pending_invites', {
  email: text('email').primaryKey(),
  workspaceId: integer('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable('workspaces', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  mapConfig: jsonb('map_config'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  slugUnique: uniqueIndex('workspaces_slug_idx').on(table.slug),
}));

export const memberships = pgTable('memberships', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  membershipPrimaryKey: primaryKey({ columns: [table.userId, table.workspaceId] }),
}));

export const sites = pgTable('sites', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default(''),
  borough: text('borough').notNull().default(''),
  siteName: text('site_name').notNull().default(''),
  category: text('category').notNull().default(''),
  priority: text('priority').notNull().default(''),
  footprintM2: doublePrecision('footprint_m2'),
  spareLandOnTitleM2: doublePrecision('spare_land_on_title_m2'),
  voaRateableValue: doublePrecision('voa_rateable_value'),
  voaMatchConfidence: text('voa_match_confidence'),
  nearbyPlanningApplications: text('nearby_planning_applications'),
  nearbyParking: text('nearby_parking'),
  dataConfidenceNotes: text('data_confidence_notes'),
  spareAreaComments: text('spare_area_comments'),
  reviewFlag: text('review_flag'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
});

export const contextLayerRoleEnum = pgEnum('context_layer_role', ['parcels', 'buildings']);

// Which Martin tile source fills each map layer slot for a workspace. The tile route refuses anything not listed.
export const workspaceLayers = pgTable('workspace_layers', {
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  role: contextLayerRoleEnum('role').notNull(),
  sourceId: text('source_id').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  workspaceRolePrimaryKey: primaryKey({ columns: [table.workspaceId, table.role] }),
}));

// Constraint layers (SSSI, green belt...) a workspace can switch on; any number per workspace.
// Created by server/db/sql/2026-11-11-workspace-constraint-layers.sql. The constraint tile route refuses anything not listed.
export const workspaceConstraintLayers = pgTable('workspace_constraint_layers', {
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  label: text('label').notNull(),
  colour: text('colour').notNull().default('#8C7851'),
  sortOrder: integer('sort_order').notNull().default(0),
  section: text('section').notNull().default('Other'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  workspaceSourcePrimaryKey: primaryKey({ columns: [table.workspaceId, table.sourceId] }),
}));

export const appraisalRequests = pgTable('appraisal_requests', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  requestedBy: integer('requested_by').notNull().references(() => users.id),
  status: appraisalStatusEnum('status').notNull().default('requested'),
  // Captured at request time so later price changes don't rewrite old requests
  pricePence: integer('price_pence').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  // At most one open request per site
  openSiteUnique: uniqueIndex('appraisal_requests_open_site_idx').on(table.siteId).where(sql`status IN ('requested', 'in_progress')`),
  workspaceIdx: index('appraisal_requests_workspace_idx').on(table.workspaceId),
}));

// Append-only trail of admin and client actions. Created by server/db/sql/2026-11-12-audit-log.sql.
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),
  workspaceId: integer('workspace_id'),
  target: text('target'),
  detail: jsonb('detail').notNull().default({}),
  ip: text('ip'),
}, table => ({
  atIdx: index('audit_log_at_idx').on(table.at.desc()),
  workspaceIdx: index('audit_log_workspace_idx').on(table.workspaceId, table.at.desc()),
}));

// Server errors (every 5xx the API sends). Same SQL file as audit_log.
export const appEvents = pgTable('app_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  level: text('level').notNull(),
  method: text('method'),
  path: text('path'),
  status: integer('status'),
  message: text('message'),
  userId: integer('user_id'),
}, table => ({
  atIdx: index('app_events_at_idx').on(table.at.desc()),
}));

export const siteStatuses = pgTable('site_statuses', {
  siteId: integer('site_id').primaryKey().references(() => sites.id, { onDelete: 'cascade' }),
  status: siteStatusEnum('status').notNull().default('new'),
  updatedBy: integer('updated_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});