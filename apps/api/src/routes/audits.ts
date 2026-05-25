/**
 * Audit routes
 *
 *   POST   /audits/run    — start a new audit run for a given profile/tenant
 *   GET    /audits        — list audit records (newest first; tenant filter)
 *   GET    /audits/:id    — fetch a single audit record (with report when done)
 *
 * Phase E1 scope:
 *   - Synchronous run. The route awaits AuditEngine.runAudit() and returns
 *     the full report. This is fine for moderate audit volumes and keeps
 *     the surface simple; a future phase will hand off via QueueAdapter.
 *   - SQL executor is wired to PgSqlExecutor when DATABASE_URL is set; if
 *     absent we degrade to a noop executor that returns no rows, so Fn-only
 *     profiles still work without a Postgres.
 *   - Source adapter wiring is left to a follow-up — Fn rules without a
 *     source are skipped with a warning (AuditEngine handles this).
 *
 * No persistence yet — see audit-store.ts for in-memory storage.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AuditEngine,
  PgSqlExecutor,
  type AuditRule,
  type FnAuditRule,
  type RuleEvalContext,
  type SqlExecutor,
  type FieldStats,
  type AuditReport,
} from "@databridge/rule-core";

import { findProfile } from "../profile-registry.js";
import { auditStore, type AuditRecord } from "../audit-store.js";

/* ---------------------------- request schema ------------------------------ */

const RunAuditBodyZ = z.object({
  profileId: z.string().min(1),
  tenantId: z.string().min(1),
  /** Optional caller-supplied audit id (must be unique). */
  auditId: z.string().min(1).optional(),
  /** Optional cap on findings per rule. */
  maxFindingsPerRule: z.number().int().positive().optional(),
  /** Optional cap on total findings emitted by Fn runner. */
  maxFindingsTotal: z.number().int().positive().optional(),
});

type RunAuditBody = z.infer<typeof RunAuditBodyZ>;

/* ---------------------------- executor factory ---------------------------- */

/**
 * Fallback SqlExecutor used when DATABASE_URL is not set. Every method
 * returns empty / zero so SQL-family rules become no-ops without crashing.
 */
class NoopSqlExecutor implements SqlExecutor {
  async query(): Promise<Record<string, unknown>[]> {
    return [];
  }
  async queryCodelistViolations(): Promise<Record<string, unknown>[]> {
    return [];
  }
  async queryFieldStats(): Promise<FieldStats> {
    return { nullPct: 0, cardinality: 0, topValues: [] };
  }
}

function makeExecutor(): SqlExecutor {
  const url = process.env["DATABASE_URL"];
  if (url) return new PgSqlExecutor({ connectionString: url });
  return new NoopSqlExecutor();
}

/* ------------------------- profile → rules extraction --------------------- */

function getRulesFromProfile(profile: unknown): (AuditRule | FnAuditRule)[] {
  const p = profile as { rules?: unknown };
  if (!Array.isArray(p.rules)) return [];
  return p.rules as (AuditRule | FnAuditRule)[];
}

/* ------------------------------- routes ----------------------------------- */

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RunAuditBody }>("/audits/run", async (req, reply) => {
    const parsed = RunAuditBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    const profileEntry = findProfile(body.profileId);
    if (!profileEntry) {
      return reply
        .code(404)
        .send({ error: "profile_not_found", id: body.profileId });
    }
    const rules = getRulesFromProfile(profileEntry.profile);

    // Pre-register the audit so GET /audits/:id is visible from the moment
    // the POST returns. We mark it as 'running' until runAudit() resolves.
    const provisionalId =
      body.auditId ??
      // Avoid pulling in another uuid lib — Node 20+ has crypto.randomUUID.
      (await import("node:crypto")).randomUUID();
    const record: AuditRecord = auditStore.create({
      auditId: provisionalId,
      tenantId: body.tenantId,
      profileId: body.profileId,
      status: "running",
    });

    const engineOpts = {
      ...(body.maxFindingsPerRule !== undefined
        ? { maxFindingsPerRule: body.maxFindingsPerRule }
        : {}),
      ...(body.maxFindingsTotal !== undefined
        ? { maxFindingsTotal: body.maxFindingsTotal }
        : {}),
    };
    const engine = new AuditEngine(makeExecutor(), engineOpts);

    // Fastify's req.raw is a Node IncomingMessage; an AbortSignal hangs off
    // the underlying socket in Node 18+ but the typings don't carry it. We
    // mint a fresh controller per audit so the rule engine has a non-null
    // signal and we can wire cancellation in later.
    const abort = new AbortController();
    req.raw.on("close", () => abort.abort());
    const ctx: RuleEvalContext = {
      tenantId: body.tenantId,
      connectionId: `api:${body.profileId}`,
      codeLists: new Map(),
      signal: abort.signal,
    };

    let report: AuditReport;
    try {
      report = await engine.runAudit({
        auditId: record.auditId,
        tenantId: body.tenantId,
        rules,
        resourceMap: {},
        ctx,
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      auditStore.update(record.auditId, { status: "failed", error: message });
      app.log.error({ err, auditId: record.auditId }, "audit run failed");
      return reply
        .code(500)
        .send({ error: "audit_run_failed", auditId: record.auditId, message });
    }

    const updated = auditStore.update(record.auditId, {
      status: "succeeded",
      report,
    });
    return reply.code(200).send(updated);
  });

  app.get<{ Querystring: { tenantId?: string } }>("/audits", async (req) => {
    const tenantId = req.query.tenantId;
    const filter = tenantId !== undefined ? { tenantId } : undefined;
    return { audits: auditStore.list(filter) };
  });

  app.get<{ Params: { id: string } }>("/audits/:id", async (req, reply) => {
    const rec = auditStore.get(req.params.id);
    if (!rec) {
      return reply
        .code(404)
        .send({ error: "audit_not_found", id: req.params.id });
    }
    return rec;
  });
}
