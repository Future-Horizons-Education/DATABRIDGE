/**
 * Phase C — apps/api cloud landing (`/migration/land`, `/migration/targets`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";

interface LandResponse {
  runId: string;
  target: string;
  summary: {
    authMode: string;
    mode: string;
    validation: { valid: number; invalid: number };
    committed: number;
    failed: number;
    entities: Array<{ entity: string; batchId: string; outcomes: unknown[] }>;
    artifact: { kind: string; filename: string; contentType: string; body: string };
  };
}

const rows = [
  { entity: "stu", data: { stu_code: "S1", surname: "Alpha" } },
  { entity: "stu", data: { stu_code: "S2", surname: "Bravo" } },
  { entity: "sce", data: { sce_stuc: "S1", sce_crsc: "C1" } },
];

describe("apps/api Phase C — cloud landing", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app.close();
  });

  it("advertises the land + targets routes", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const body = res.json() as { routes: string[] };
    expect(body.routes).toContain("/migration/land");
    expect(body.routes).toContain("/migration/targets");
  });

  it("lists the four Azure cloud targets", async () => {
    const res = await app.inject({ method: "GET", url: "/migration/targets" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      targets: Array<{ id: string; family: string; authModes: string[] }>;
    };
    const ids = body.targets.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "azure-adf",
        "azure-synapse",
        "azure-sql",
        "azure-fabric",
        "oracle-goldengate",
        "oracle-adw",
        "oracle-oci-di",
      ]),
    );
    const adf = body.targets.find((t) => t.id === "azure-adf");
    expect(adf?.family).toBe("azure");
    expect(adf?.authModes).toContain("managed-identity");
    const gg = body.targets.find((t) => t.id === "oracle-goldengate");
    expect(gg?.family).toBe("oracle");
    expect(gg?.authModes).toContain("wallet");
  });

  it("lands rows onto ADF via the ?target= query param", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land?target=azure-adf",
      payload: { runId: "run-c", rows },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as LandResponse;
    expect(body.target).toBe("azure-adf");
    expect(body.summary.committed).toBe(3);
    expect(body.summary.authMode).toBe("stub");
    expect(body.summary.mode).toBe("stub");
    expect(body.summary.artifact.kind).toBe("adf-pipeline");
    const pipeline = JSON.parse(body.summary.artifact.body) as {
      properties: { activities: unknown[] };
    };
    expect(pipeline.properties.activities).toHaveLength(2); // stu + sce
  });

  it("lands rows onto Synapse via the request body target", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land",
      payload: { target: "azure-synapse", rows, targetConfig: { schema: "stg" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as LandResponse;
    expect(body.summary.artifact.kind).toBe("synapse-copy-into");
    expect(body.summary.artifact.body).toContain("COPY INTO [stg].[stu]");
  });

  it("lands rows onto Azure SQL with a MERGE when keys are configured", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land",
      payload: {
        target: "azure-sql",
        rows,
        targetConfig: { database: "dw", mergeKeysByEntity: { stu: ["stu_code"] } },
      },
    });
    const body = res.json() as LandResponse;
    expect(body.summary.artifact.kind).toBe("azure-sql-load");
    expect(body.summary.artifact.body).toContain("MERGE [dbo].[stu] AS tgt");
  });

  it("lands rows onto Fabric and reports per-table row counts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land",
      payload: { target: "azure-fabric", rows },
    });
    const body = res.json() as LandResponse;
    expect(body.summary.artifact.kind).toBe("fabric-onelake-load");
    const plan = JSON.parse(body.summary.artifact.body) as {
      tables: Array<{ entity: string; rowCount: number }>;
    };
    expect(plan.tables.find((t) => t.entity === "stu")?.rowCount).toBe(2);
  });

  it("lands rows onto Oracle GoldenGate (replicat param file)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land?target=oracle-goldengate",
      payload: { rows, targetConfig: { targetSchema: "DWH" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as LandResponse;
    expect(body.summary.artifact.kind).toBe("gg-replicat-param");
    expect(body.summary.artifact.body).toContain("MAP CANONICAL.STU, TARGET DWH.STU");
  });

  it("lands rows onto Oracle ADW with a MERGE", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land?target=oracle-adw",
      payload: { rows, targetConfig: { schema: "DWH", mergeKeysByEntity: { stu: ["stu_code"] } } },
    });
    const body = res.json() as LandResponse;
    expect(body.summary.artifact.kind).toBe("adw-load-sql");
    expect(body.summary.artifact.body).toContain("MERGE INTO DWH.STU tgt");
  });

  it("lands rows onto OCI Data Integration (task definitions)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land?target=oracle-oci-di",
      payload: { rows },
    });
    const body = res.json() as LandResponse;
    expect(body.summary.artifact.kind).toBe("oci-di-task");
    const plan = JSON.parse(body.summary.artifact.body) as { tasks: unknown[] };
    expect(plan.tasks).toHaveLength(2);
  });

  it("dry-run commits nothing but still renders an artefact", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land?target=azure-adf",
      payload: { rows, dryRun: true },
    });
    const body = res.json() as LandResponse;
    expect(body.summary.committed).toBe(0);
    expect(body.summary.artifact.kind).toBe("adf-pipeline");
  });

  it("rejects an unknown target with the known list", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land?target=gcp-bigquery",
      payload: { rows },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; known: string[] };
    expect(body.error).toBe("unknown_target");
    expect(body.known).toContain("azure-adf");
  });

  it("rejects a request with no target", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/migration/land",
      payload: { rows },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("missing_target");
  });
});
