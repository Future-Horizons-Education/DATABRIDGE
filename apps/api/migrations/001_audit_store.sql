-- 001_audit_store.sql
--
-- Persistent storage for AuditReport records produced by /audits/run.
-- Kept narrow on purpose: one row per audit, with the full report stored
-- as JSONB. A flattened audit_findings view can be layered on later
-- without changing this surface.
--
-- This migration mirrors AUDIT_TABLE_DDL in apps/api/src/pg-audit-store.ts.
-- The store calls ensureSchema() at runtime for dev/test ergonomics; a
-- proper migration runner (Flyway/sqitch/dbmate) should apply this file
-- in production to keep the database schema in source control.

CREATE TABLE IF NOT EXISTS audits (
  audit_id     TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  profile_id   TEXT NOT NULL,
  status       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  report       JSONB,
  error        TEXT
);

CREATE INDEX IF NOT EXISTS audits_tenant_created_idx
  ON audits (tenant_id, created_at DESC);
