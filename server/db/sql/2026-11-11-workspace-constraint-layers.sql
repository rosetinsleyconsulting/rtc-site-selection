-- Constraint layers (SSSI, conservation areas, green belt...) a workspace can switch on over its map.
-- Unlike workspace_layers (one source per fixed slot), a workspace can have any number of these.
-- Tiles come through /api/workspaces/:id/constraints/:sourceId/..., which refuses any source not listed here.
-- Run as postgres against site_selection_portal (live) or site_selection_portal_dev. Mirrored in server/db/schema.js.
BEGIN;

CREATE TABLE IF NOT EXISTS workspace_constraint_layers (
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id    text    NOT NULL CHECK (source_id ~ '^[a-z0-9_]+$'),       -- Martin source id, e.g. env_sssi
  label        text    NOT NULL,
  colour       text    NOT NULL DEFAULT '#8C7851' CHECK (colour ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_id)
);
-- Heading the layer is grouped under in the Layers panel (matches meta.layer_registry.report_section)
ALTER TABLE workspace_constraint_layers ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'Other';

-- Same access pattern as workspace_layers: the app reads it, admins may manage it later
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_selection_app') AND current_database() = 'site_selection_portal' THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_constraint_layers TO site_selection_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_selection_dev') AND current_database() = 'site_selection_portal_dev' THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_constraint_layers TO site_selection_dev;
  END IF;
END $$;

COMMIT;
