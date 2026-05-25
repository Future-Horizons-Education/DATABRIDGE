/**
 * AuditEngine tests
 *
 * Exercises the orchestrator with a fake SqlExecutor and a fake SourceAdapter
 * so we don't need a real database or network. Verifies:
 *   - SQL-only rules path
 *   - Fn-only rules path (rows streamed from adapter)
 *   - Mixed rule list produces one combined report
 *   - tenantId stamping on Fn findings (Fn runner leaves it "")
 *   - rule partitioning correctness
 *   - subjectId fallback chain (PK map → id → subject_id → synthetic)
 *   - warnings when Fn rules are present without a source
 */

import { describe, expect, it } from "vitest";

import type {
  SourceAdapter,
  AdapterContext,
  StreamRowsArgs,
  StreamRowsPage,
  SampledRow,
} from "@databridge/adapter-spec";

import { AuditEngine } from "../audit-engine.js";
import type {
  AuditRule,
  FnAuditRule,
  RuleEvalContext,
} from "../types.js";
import type { SqlExecutor, FieldStats } from "../engine.js";

/* ------------------------------ fake SqlExecutor -------------------------- */

class FakeSqlExecutor implements SqlExecutor {
  public sqlCalls: Array<{ sql: string; params: Record<string, unknown> }> = [];
  constructor(
    private readonly rows: Record<string, unknown>[] = [],
  ) {}
  async query(sql: string, params: { tenantId: string } & Record<string, unknown>) {
    this.sqlCalls.push({ sql, params });
    return this.rows;
  }
  async queryCodelistViolations() {
    return [];
  }
  async queryFieldStats(): Promise<FieldStats> {
    return { nullPct: 0, cardinality: 0, topValues: [] };
  }
}

/* ----------------------------- fake SourceAdapter ------------------------- */

function makeFakeSource(byResource: Record<string, SampledRow[]>): SourceAdapter {
  return {
    id: "fake",
    displayName: "Fake",
    capabilities: {
      supportsIncremental: false,
      supportsDictionary: false,
      supportsSampling: true,
      supportsCodeLists: false,
      preferredAuth: "file",
    },
    async healthCheck() {
      return { healthy: true, latencyMs: 0 };
    },
    async discoverSchema() {
      return {
        adapter: "fake",
        generatedAt: new Date().toISOString(),
        resources: [],
      };
    },
    async sampleTable() {
      return [];
    },
    async *streamRows(
      _ctx: AdapterContext,
      args: StreamRowsArgs,
    ): AsyncIterable<StreamRowsPage> {
      const rows = byResource[args.resource] ?? [];
      yield { rows, totalRows: rows.length };
    },
    async getCodeLists() {
      return [];
    },
    async getDictionary() {
      return [];
    },
    async getRecordById() {
      return null;
    },
  };
}

function makeAdapterCtx(): AdapterContext {
  return {
    tenantId: "t1",
    connectionId: "c1",
    secrets: {
      async get() {
        return "";
      },
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
    signal: new AbortController().signal,
  };
}

function makeRuleCtx(): RuleEvalContext {
  return {
    tenantId: "t1",
    connectionId: "c1",
    codeLists: new Map(),
    signal: new AbortController().signal,
  };
}

/* ----------------------------- SQL-only path ------------------------------ */

describe("AuditEngine — SQL rules only", () => {
  it("runs SQL rules and stamps tenantId on findings", async () => {
    const sqlRule: AuditRule = {
      id: "F01-S1",
      name: "missing-id",
      severity: "ERROR",
      family: "F01",
      type: "sql",
      description: "rows missing id",
      enabledByDefault: true,
      sql: "SELECT subject_id FROM stu WHERE tenant = :tenantId",
      messageTemplate: "row {{subject_id}} missing id",
    };
    const exec = new FakeSqlExecutor([
      { subject_id: "s1" },
      { subject_id: "s2" },
    ]);
    const engine = new AuditEngine(exec);

    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [sqlRule],
      resourceMap: {},
      ctx: makeRuleCtx(),
    });

    expect(report.rulesSql).toBe(1);
    expect(report.rulesFn).toBe(0);
    expect(report.findingsTotal).toBe(2);
    expect(report.findings.every((f) => f.tenantId === "t1")).toBe(true);
    expect(report.sqlSummary?.rulesEvaluated).toBe(1);
  });
});

/* ------------------------------ Fn-only path ------------------------------ */

describe("AuditEngine — Fn rules only", () => {
  it("streams rows from source and runs Fn rules", async () => {
    const fnRule: FnAuditRule = {
      id: "H01-1",
      family: "CODING",
      severity: "ERROR",
      entity: "Student",
      field: "code",
      description: "code must be A",
      evaluate: ({ value }: { value: unknown }) =>
        value === "A" ? { pass: true } : { pass: false, message: "bad" },
    };
    const source = makeFakeSource({
      STU: [
        { id: "s1", code: "A" },
        { id: "s2", code: "B" },
        { id: "s3", code: "C" },
      ],
    });
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      primaryKeyMap: { STU: "id" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });

    expect(report.rowsScanned).toBe(3);
    expect(report.findingsTotal).toBe(2);
    expect(report.findings.map((f) => f.subjectId).sort()).toEqual([
      "s2",
      "s3",
    ]);
    expect(report.findings.every((f) => f.tenantId === "t1")).toBe(true);
    expect(report.fnSummary?.rowsProcessed).toBe(3);
  });

  it("uses subjectId fallback chain when no PK map provided", async () => {
    const fnRule: FnAuditRule = {
      id: "X-1",
      family: "X",
      severity: "WARN",
      entity: "Student",
      description: "always fail",
      evaluate: () => ({ pass: false, message: "f" }),
    };
    // No 'id'/'subject_id'/'pk' columns → falls back to synthetic id.
    const source = makeFakeSource({ STU: [{ code: "X" }, { code: "Y" }] });
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });
    expect(report.findings.map((f) => f.subjectId)).toEqual([
      "STU:0",
      "STU:1",
    ]);
  });
});

/* ------------------------------- mixed path ------------------------------- */

describe("AuditEngine — mixed SQL + Fn rules", () => {
  it("runs both runners and aggregates", async () => {
    const sqlRule: AuditRule = {
      id: "S-1",
      name: "s1",
      severity: "ERROR",
      family: "F01",
      type: "sql",
      description: "s1",
      enabledByDefault: true,
      sql: "SELECT subject_id FROM stu WHERE 1=1",
      messageTemplate: "{{subject_id}}",
    };
    const fnRule: FnAuditRule = {
      id: "F-1",
      family: "CODING",
      severity: "WARN",
      entity: "Student",
      description: "code A only",
      evaluate: ({ value }: { value: unknown }) =>
        value === "A" ? { pass: true } : { pass: false, message: "x" },
      field: "code",
    };
    const exec = new FakeSqlExecutor([{ subject_id: "sql1" }]);
    const source = makeFakeSource({
      STU: [
        { id: "s1", code: "A" },
        { id: "s2", code: "B" },
      ],
    });

    const engine = new AuditEngine(exec);
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [sqlRule, fnRule],
      resourceMap: { STU: "Student" },
      primaryKeyMap: { STU: "id" },
      source,
      adapterCtx: makeAdapterCtx(),
      ctx: makeRuleCtx(),
    });

    expect(report.rulesTotal).toBe(2);
    expect(report.rulesSql).toBe(1);
    expect(report.rulesFn).toBe(1);
    expect(report.findingsTotal).toBe(2); // 1 SQL + 1 Fn
    expect(report.findingsBySeverity["ERROR"]).toBe(1);
    expect(report.findingsBySeverity["WARN"]).toBe(1);
    expect(report.sqlSummary).toBeDefined();
    expect(report.fnSummary).toBeDefined();
  });

  it("warns when Fn rules are present without a source", async () => {
    const fnRule: FnAuditRule = {
      id: "F-1",
      family: "X",
      severity: "ERROR",
      entity: "Student",
      description: "x",
      evaluate: () => ({ pass: true }),
    };
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [fnRule],
      resourceMap: { STU: "Student" },
      ctx: makeRuleCtx(),
    });
    expect(report.findingsTotal).toBe(0);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/Fn rule\(s\) but no source/);
  });
});

/* ------------------------------ auditId / metadata ------------------------ */

describe("AuditEngine — report metadata", () => {
  it("generates auditId when not supplied and emits ISO timestamps", async () => {
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      tenantId: "t1",
      rules: [],
      resourceMap: {},
      ctx: makeRuleCtx(),
    });
    expect(report.auditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(report.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("honours a caller-supplied auditId", async () => {
    const engine = new AuditEngine(new FakeSqlExecutor());
    const report = await engine.runAudit({
      auditId: "audit-123",
      tenantId: "t1",
      rules: [],
      resourceMap: {},
      ctx: makeRuleCtx(),
    });
    expect(report.auditId).toBe("audit-123");
  });
});
