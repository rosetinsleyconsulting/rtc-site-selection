-- Audit trail of admin and client actions, and a log of server errors (12 Nov 2026).
-- Run as postgres against site_selection_portal (live) or site_selection_portal_dev. Safe to re-run.
-- Mirrored in server/db/schema.js. Written by server/audit.js; read by the admin Activity tab and Grafana.
--
-- Retention: audit_log 2 years, app_events 90 days. Pruned daily by rtc-data-loaders/loaders/host_status.py
-- as postgres, because the app's login can't delete from audit_log.
BEGIN;

CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  actor_email   text,                       -- kept as text so the entry still reads after the user is deleted
  action        text NOT NULL,              -- e.g. user.invited, membership.removed, appraisal.requested
  workspace_id  integer,                    -- no foreign key: entries outlive a deleted workspace
  target        text,
  detail        jsonb NOT NULL DEFAULT '{}',
  ip            text
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON audit_log (workspace_id, at DESC);

CREATE TABLE IF NOT EXISTS app_events (
  id       bigserial PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  level    text NOT NULL CHECK (level IN ('error', 'warn')),
  method   text,
  path     text,
  status   integer,
  message  text,
  user_id  integer
);
CREATE INDEX IF NOT EXISTS app_events_at_idx ON app_events (at DESC);

DO $$
DECLARE
  app_role text := CASE current_database() WHEN 'site_selection_portal' THEN 'site_selection_app'
                                           WHEN 'site_selection_portal_dev' THEN 'site_selection_dev' END;
BEGIN
  IF app_role IS NOT NULL AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    -- Append and read only: the app can't rewrite or remove its own audit trail
    EXECUTE format('REVOKE ALL ON audit_log, app_events FROM %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT ON audit_log, app_events TO %I', app_role);
    EXECUTE format('GRANT USAGE ON SEQUENCE audit_log_id_seq, app_events_id_seq TO %I', app_role);
  END IF;
  -- Grafana's read-only login sees the error log only (for the error-rate panel), not the audit trail
  IF current_database() = 'site_selection_portal' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_reader_ss') THEN
    GRANT CONNECT ON DATABASE site_selection_portal TO grafana_reader_ss;
    GRANT USAGE ON SCHEMA public TO grafana_reader_ss;
    GRANT SELECT ON app_events TO grafana_reader_ss;
  END IF;
END $$;

COMMIT;
