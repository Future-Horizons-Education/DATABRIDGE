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

import type { FastifyInstance, FastifyRequest } from "fastify";
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
import type {
  SourceAdapter,
  AdapterContext,
} from "@databridge/adapter-spec";

import { findProfile } from "../profile-registry.js";
import { findAdapter } from "../adapter-registry.js";
import { auditStore, type AuditRecord } from "../audit-store.js";
import { requireRole } from "../middleware/auth.js";

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
  /**
   * Optional adapter wiring. When provided AND the profile has Fn rules,
   * AuditEngine will pull rows from this adapter so Fn rules can fire.
   */
  adapterId: z.string().min(1).optional(),
  adapterConfig: z.record(z.unknown()).optional(),
  /** Map source-system resource (table/endpoint) → canonical entity name. */
  resourceMap: z.record(z.string()).optional(),
  /** Optional PK column per resource (else id/subject_id/pk fallback). */
  primaryKeyMap: z.record(z.string()).optional(),
  /** Optional source-system page size hint passed to streamRows. */
  pageSize: z.number().int().positive().optional(),
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

/**
 * Best-effort AdapterContext for an audit run. Adapters that need real
 * secrets/logger should be wired via a more capable runtime later; for now
 * we use the apps/api logger and read straight from process.env via a
 * minimal SecretAccessor so credentials supplied via env still work.
 */
function makeAdapterContext(
  tenantId: string,
  connectionId: string,
  signal: AbortSignal,
  log: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
  },
): AdapterContext {
  return {
    tenantId,
    connectionId,
    secrets: {
      async get(key: string) {
        const v = process.env[key];
        if (v === undefined) throw new Error(`secret '${key}' not found in env`);
        return v;
      },
    },
    logger: log,
    signal,
  };
}

function instantiateAdapter(
  id: string,
  config: Record<string, unknown> | undefined,
): SourceAdapter | { error: string } {
  const entry = findAdapter(id);
  if (!entry) return { error: `adapter '${id}' not registered` };
  try {
    return new entry.Adapter(config ?? {});
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/* ------------------------- profile → rules extraction --------------------- */

function getRulesFromProfile(profile: unknown): (AuditRule | FnAuditRule)[] {
  const p = profile as { rules?: unknown };
  if (!Array.isArray(p.rules)) return [];
  return p.rules as (AuditRule | FnAuditRule)[];
}

/* ----------------------------- RBAC helpers ------------------------------- */

/**
 * Resolve the tenant id from the POST body for /audits/run. The body is
 * unparsed at preHandler time — we read it raw and let the route handler
 * re-validate with zod.
 */
function resolveTenantFromBody(req: FastifyRequest): string | undefined {
  const body = req.body as { tenantId?: unknown } | undefined;
  if (body && typeof body.tenantId === "string") return body.tenantId;
  return undefined;
}

/**
 * Resolve the tenant id from the querystring for GET /audits list. When
 * absent the requireRole helper returns 403 — we require callers to scope
 * list requests to a tenant so we don't accidentally fan out across tenants
 * for a non-superadmin principal.
 */
function resolveTenantFromQuery(req: FastifyRequest): string | undefined {
  const q = req.query as { tenantId?: unknown } | undefined;
  if (q && typeof q.tenantId === "string") return q.tenantId;
  return undefined;
}

/* ------------------------------- routes ----------------------------------- */

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // POST /audits/run — requires write authority. data:steward and
  // migration:operator are both legitimate — stewards run quality audits,
  // operators run pre-migration audits.
  const requireRunner = requireRole({
    resolveTenantId: resolveTenantFromBody,
    anyOf: ["data:steward", "migration:operator"],
  });
  const requireListReader = requireRole({
    resolveTenantId: resolveTenantFromQuery,
    anyOf: ["audit:viewer", "data:viewer", "data:steward"],
  });

  app.post<{ Body: RunAuditBody }>("/audits/run", { preHandler: requireRunner }, async (req, reply) => {
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
    const record: AuditRecord = await auditStore.create({
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
      ...(body.pageSize !== undefined ? { pageSize: body.pageSize } : {}),
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

    // If the caller wired an adapter, instantiate it here. We treat
    // adapter-construction failure as a 400 — the caller asked for a
    // specific adapter and we can't honour it.
    let source: SourceAdapter | undefined;
    let adapterCtx: AdapterContext | undefined;
    if (body.adapterId) {
      const made = instantiateAdapter(body.adapterId, body.adapterConfig);
      if ("error" in made) {
        await auditStore.update(record.auditId, {
          status: "failed",
          error: made.error,
        });
        return reply.code(400).send({
          error: "adapter_init_failed",
          auditId: record.auditId,
          message: made.error,
        });
      }
      source = made;
      const childLogger = app.log.child({
        adapterId: body.adapterId,
        auditId: record.auditId,
      });
      adapterCtx = makeAdapterContext(
        body.tenantId,
        `audit:${record.auditId}`,
        abort.signal,
        {
          info: (msg, meta) => childLogger.info(meta ?? {}, msg),
          warn: (msg, meta) => childLogger.warn(meta ?? {}, msg),
          error: (msg, meta) => childLogger.error(meta ?? {}, msg),
          debug: (msg, meta) => childLogger.debug(meta ?? {}, msg),
        },
      );
    }

    let report: AuditReport;
    try {
      report = await engine.runAudit({
        auditId: record.auditId,
        tenantId: body.tenantId,
        rules,
        resourceMap: body.resourceMap ?? {},
        ...(body.primaryKeyMap !== undefined
          ? { primaryKeyMap: body.primaryKeyMap }
          : {}),
        ...(source !== undefined ? { source } : {}),
        ...(adapterCtx !== undefined ? { adapterCtx } : {}),
        ctx,
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      await auditStore.update(record.auditId, { status: "failed", error: message });
      app.log.error({ err, auditId: record.auditId }, "audit run failed");
      return reply
        .code(500)
        .send({ error: "audit_run_failed", auditId: record.auditId, message });
    }

    const updated = await auditStore.update(record.auditId, {
      status: "succeeded",
      report,
    });
    return reply.code(200).send(updated);
  });

  app.get<{ Querystring: { tenantId?: string } }>(
    "/audits",
    { preHandler: requireListReader },
    async (req) => {
      const tenantId = req.query.tenantId;
      const filter = tenantId !== undefined ? { tenantId } : undefined;
      return { audits: await auditStore.list(filter) };
    },
  );

  // GET /audits/:id — we can't resolve the tenant until we've fetched the
  // record, so we apply auth at the handler level. Principals must either be
  // a system:superadmin or hold a viewer role in the record's tenant.
  app.get<{ Params: { id: string } }>("/audits/:id", async (req, reply) => {
    const rec = await auditStore.get(req.params.id);
    if (!rec) {
      return reply
        .code(404)
        .send({ error: "audit_not_found", id: req.params.id });
    }
    const principal = req.principal;
    if (principal) {
      const isSuper = principal.tenants.some((t) =>
        t.roles.includes("system:superadmin"),
      );
      if (!isSuper) {
        const membership = principal.tenants.find((t) => t.tenantId === rec.tenantId);
        const allowedRoles = ["audit:viewer", "data:viewer", "data:steward"];
        const ok =
          membership !== undefined &&
          allowedRoles.some((r) =>
            membership.roles.includes(r as (typeof membership.roles)[number]),
          );
        if (!ok) {
          return reply.code(403).send({
            error: "forbidden",
            message: `no viewer role in tenant ${rec.tenantId}`,
          });
        }
      }
    }
    return rec;
  });
}
