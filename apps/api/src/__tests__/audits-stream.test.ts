/**
 * Tests for GET /audits/:id/stream (F3 — SSE progress streaming).
 *
 * Approach: we seed the AuditStore directly so we control the record state at
 * connection time, then exercise the endpoint via app.inject. For
 * already-terminal audits the handler writes a snapshot + 'end' frame and
 * calls reply.raw.end() synchronously, so inject resolves with the full body
 * captured. For mid-flight audits we publish events to the singleton emitter
 * *before* injecting; the subscribe callback drains buffered history
 * synchronously and the 'end' frame fires inside that same tick, allowing
 * inject to resolve cleanly with the entire transcript in res.body.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { build } from "../server.js";
import { auditStore } from "../audit-store.js";
import { auditProgress } from "../audit-progress.js";
import { _resetAuthActiveForTests } from "../middleware/auth.js";

function parseSse(body: string): {
  events: Array<{ event: string; data: string }>;
  heartbeats: number;
} {
  const events: Array<{ event: string; data: string }> = [];
  let heartbeats = 0;
  const frames = body.split("\n\n");
  for (const frame of frames) {
    const trimmed = frame.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(":")) {
      heartbeats++;
      continue;
    }
    let evName = "message";
    const dataLines: string[] = [];
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("event:")) evName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    events.push({ event: evName, data: dataLines.join("\n") });
  }
  return { events, heartbeats };
}

describe("apps/api GET /audits/:id/stream (F3)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    _resetAuthActiveForTests();
    // No DATABRIDGE_API_TOKENS / OIDC_* set → auth disabled, RBAC no-op.
    app = await build();
  });
  afterAll(async () => {
    await app.close();
    auditProgress._clearAll();
  });
  beforeEach(async () => {
    await auditStore.clear();
    auditProgress._clearAll();
  });

  it("returns 404 for an unknown audit id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audits/does-not-exist/stream",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "audit_not_found" });
  });

  it("sends snapshot + end frame and closes when the audit is already terminal", async () => {
    await auditStore.create({
      auditId: "a-done",
      tenantId: "t1",
      profileId: "sits",
      status: "succeeded",
    });

    const res = await app.inject({
      method: "GET",
      url: "/audits/a-done/stream",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(res.headers["x-accel-buffering"]).toBe("no");

    const { events } = parseSse(res.body);
    // First frame is the snapshot (event: progress).
    expect(events[0]?.event).toBe("progress");
    const snap = JSON.parse(events[0]!.data) as {
      auditId: string;
      status: string;
    };
    expect(snap).toMatchObject({ auditId: "a-done", status: "succeeded" });
    // Last frame is the end marker.
    expect(events.at(-1)?.event).toBe("end");
  });

  it("includes the error message in the snapshot for failed audits", async () => {
    await auditStore.create({
      auditId: "a-fail",
      tenantId: "t1",
      profileId: "sits",
      status: "failed",
      error: "boom",
    });

    const res = await app.inject({
      method: "GET",
      url: "/audits/a-fail/stream",
    });
    expect(res.statusCode).toBe(200);
    const { events } = parseSse(res.body);
    const snap = JSON.parse(events[0]!.data) as {
      status: string;
      message?: string;
    };
    expect(snap.status).toBe("failed");
    expect(snap.message).toBe("boom");
    expect(events.at(-1)?.event).toBe("end");
  });

  it("replays buffered history and terminates when a terminal event is replayed", async () => {
    await auditStore.create({
      auditId: "a-replay",
      tenantId: "t1",
      profileId: "sits",
      status: "running",
    });
    // Pre-publish a transcript so subscribe() replays it synchronously.
    auditProgress.publish({
      auditId: "a-replay",
      ts: new Date().toISOString(),
      status: "running",
    });
    auditProgress.publish({
      auditId: "a-replay",
      ts: new Date().toISOString(),
      status: "succeeded",
    });

    const res = await app.inject({
      method: "GET",
      url: "/audits/a-replay/stream",
    });
    expect(res.statusCode).toBe(200);
    const { events } = parseSse(res.body);
    // Snapshot first, then replayed running + succeeded, then end.
    const statuses = events
      .filter((e) => e.event === "progress")
      .map((e) => (JSON.parse(e.data) as { status: string }).status);
    expect(statuses[0]).toBe("running"); // snapshot
    expect(statuses).toContain("succeeded");
    expect(events.at(-1)?.event).toBe("end");
  });
});

describe("apps/api GET /audits/:id/stream RBAC (F3)", () => {
  let app: FastifyInstance;
  let savedTokens: string | undefined;

  const TOKEN_ENV = [
    "tok-viewer=v1,t1:audit:viewer",
    "tok-outsider=o1,t2:data:viewer",
    "tok-super=s1,*:system:superadmin",
  ].join(";");

  beforeAll(async () => {
    savedTokens = process.env["DATABRIDGE_API_TOKENS"];
    process.env["DATABRIDGE_API_TOKENS"] = TOKEN_ENV;
    _resetAuthActiveForTests();
    app = await build();
  });
  afterAll(async () => {
    await app.close();
    if (savedTokens === undefined) delete process.env["DATABRIDGE_API_TOKENS"];
    else process.env["DATABRIDGE_API_TOKENS"] = savedTokens;
    _resetAuthActiveForTests();
    auditProgress._clearAll();
  });
  beforeEach(async () => {
    await auditStore.clear();
    auditProgress._clearAll();
  });

  it("denies a principal with no viewer role in the audit's tenant", async () => {
    await auditStore.create({
      auditId: "rbac-1",
      tenantId: "t1",
      profileId: "sits",
      status: "succeeded",
    });
    const res = await app.inject({
      method: "GET",
      url: "/audits/rbac-1/stream",
      headers: { authorization: "Bearer tok-outsider" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows a viewer in the audit's tenant", async () => {
    await auditStore.create({
      auditId: "rbac-2",
      tenantId: "t1",
      profileId: "sits",
      status: "succeeded",
    });
    const res = await app.inject({
      method: "GET",
      url: "/audits/rbac-2/stream",
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
  });

  it("superadmin bypasses tenant scoping", async () => {
    await auditStore.create({
      auditId: "rbac-3",
      tenantId: "t-other",
      profileId: "sits",
      status: "succeeded",
    });
    const res = await app.inject({
      method: "GET",
      url: "/audits/rbac-3/stream",
      headers: { authorization: "Bearer tok-super" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 when auth is on and no token is provided", async () => {
    await auditStore.create({
      auditId: "rbac-4",
      tenantId: "t1",
      profileId: "sits",
      status: "succeeded",
    });
    const res = await app.inject({
      method: "GET",
      url: "/audits/rbac-4/stream",
    });
    expect(res.statusCode).toBe(401);
  });
});
