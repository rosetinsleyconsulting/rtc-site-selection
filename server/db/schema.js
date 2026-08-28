import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const siteStatusEnum = pgEnum('site_status', ['new', 'accepted', 'dismissed']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  clerkUserIdUnique: uniqueIndex('users_clerk_user_id_idx').on(table.clerkUserId),
}));

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
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
});

export const siteStatuses = pgTable('site_statuses', {
  siteId: integer('site_id').primaryKey().references(() => sites.id, { onDelete: 'cascade' }),
  status: siteStatusEnum('status').notNull().default('new'),
  updatedBy: integer('updated_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});