import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";

describe("/findings routes (Phase K)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });

  const baseFinding = {
    id: "f-1",
    tenantId: "t-1",
    ruleId: "rule-x",
    ruleName: "Rule X",
    severity: "ERROR",
    entityType: "Student",
    subjectId: "s-1",
    message: "broken",
    evidence: {},
    status: "open",
    detectedAt: "2026-05-26T18:00:00.000Z",
  };

  it("ack + list returns the active decision", async () => {
    const ackRes = await app.inject({
      method: "POST",
      url: "/findings/waivers/ack",
      payload: { findingId: "fk1-ack", actor: "alice", reason: "looked" },
    });
    expect(ackRes.statusCode).toBe(200);
    const ack = ackRes.json() as { decision: { kind: string } };
    expect(ack.decision.kind).toBe("ack");

    const list = await app.inject({ method: "GET", url: "/findings/waivers" });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { stats: { total: number } };
    expect(body.stats.total).toBeGreaterThanOrEqual(1);
  });

  it("waive requires reason and future date", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/findings/waivers/waive",
      payload: {
        findingId: "fk1-bad",
        actor: "alice",
        reason: "x",
        waivedUntil: "2000-01-01T00:00:00.000Z",
      },
    });
    expect(bad.statusCode).toBe(400);
    const err = bad.json() as { error: string };
    expect(err.error).toBe("invalid_until");
  });

  it("/findings/delta classifies new vs persistent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/findings/delta",
      payload: {
        previous: [{ ...baseFinding, id: "f-a", subjectId: "keep" }],
        current: [
          { ...baseFinding, id: "f-a", subjectId: "keep" },
          { ...baseFinding, id: "f-b", subjectId: "fresh" },
        ],
        emitMd: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      delta: { summary: { newCount: number; persistentCount: number } };
      md: string;
    };
    expect(body.delta.summary.newCount).toBe(1);
    expect(body.delta.summary.persistentCount).toBe(1);
    expect(body.md).toContain("new");
  });

  it("/findings/severity-by-surface aggregates", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/findings/severity-by-surface",
      payload: {
        findings: [
          { ...baseFinding, entityType: "Student", severity: "ERROR" },
          { ...baseFinding, entityType: "Mark", severity: "CRITICAL", id: "f-2" },
        ],
        emitMd: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      report: { totals: { findings: number } };
      md: string;
    };
    expect(body.report.totals.findings).toBe(2);
    expect(body.md).toContain("enrolments");
  });

  it("/findings/reproduce returns a bundle with inline providers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/findings/reproduce",
      payload: {
        finding: {
          ...baseFinding,
          sourceSystem: "banner-oracle",
          nativeKeys: { pidm: 7 },
          ruleProvenance: { kind: "sql", predicate: "x IS NULL" },
        },
        nativeRow: { SPRIDEN_ID: 7 },
        canonical: { id: "s-1" },
        target: {
          targetSystem: "sits",
          table: "SRA_STUDENT",
          payload: { STU_CODE: "s-1" },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      bundle: {
        predicate: { kind: string };
        nativeRow: { available: boolean };
        canonical: { available: boolean };
        target: { available: boolean };
      };
    };
    expect(body.bundle.predicate.kind).toBe("sql");
    expect(body.bundle.nativeRow.available).toBe(true);
    expect(body.bundle.canonical.available).toBe(true);
    expect(body.bundle.target.available).toBe(true);
  });

  it("/findings/waivers/apply projects a waiver onto findings", async () => {
    // First waive
    const waiveRes = await app.inject({
      method: "POST",
      url: "/findings/waivers/waive",
      payload: {
        findingId: "f-apply",
        actor: "alice",
        reason: "later",
        waivedUntil: "2099-01-01T00:00:00.000Z",
      },
    });
    expect(waiveRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "POST",
      url: "/findings/waivers/apply",
      payload: {
        findings: [{ ...baseFinding, id: "f-apply" }],
        at: "2026-06-01T00:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { findings: Array<{ status: string }> };
    expect(body.findings[0]?.status).toBe("waived");
  });

  it("server catalogue lists findings endpoints", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const body = res.json() as { routes: string[] };
    expect(body.routes).toContain("/findings/waivers/ack");
    expect(body.routes).toContain("/findings/reproduce");
  });
});
