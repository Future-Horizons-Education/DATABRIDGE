import { describe, it, expect, vi } from "vitest";
import type {
  AdapterContext,
  SampledRow,
  TargetAdapter,
} from "@databridge/adapter-spec";
import {
  buildAzureSqlTarget,
  renderAzureSqlLoad,
  type AzureSqlConfig,
} from "../index.js";

function makeCtx(secrets: Record<string, string> = {}): AdapterContext {
  return {
    tenantId: "t",
    connectionId: "c",
    secrets: { async get(k: string) { return secrets[k] ?? ""; } },
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

async function commitEntity(
  adapter: TargetAdapter,
  ctx: AdapterContext,
  entity: string,
  rows: SampledRow[],
  dryRun = false,
) {
  await adapter.validate(ctx, { entity, rows });
  const staged = await adapter.stage(ctx, {
    migrationRunId: "run-1",
    entity,
    rows,
    dryRun,
  });
  return adapter.commit(ctx, {
    batchId: staged.batchId,
    approvedBy: "tester",
    approvedAt: new Date(),
  });
}

const baseCfg: AzureSqlConfig = {
  auth: { mode: "service-principal", tenantId: "t", clientId: "c", clientSecretKey: "k" },
  database: "uni_dw",
};

describe("AzureSqlTargetAdapter", () => {
  it("exposes the azure-sql id and upsert capability", async () => {
    const { adapter } = await buildAzureSqlTarget(makeCtx(), baseCfg);
    expect(adapter.id).toBe("azure-sql");
    expect(adapter.capabilities.supportsUpsert).toBe(true);
    expect(adapter.capabilities.supportsPartialUpdate).toBe(true);
  });

  it("renders an INSERT when no merge keys are configured", async () => {
    const { adapter, transport } = await buildAzureSqlTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [
      { stu_code: "S1", surname: "A" },
      { stu_code: "S2", surname: "B" },
    ]);
    const artifact = renderAzureSqlLoad(baseCfg, transport);
    expect(artifact.kind).toBe("azure-sql-load");
    expect(artifact.filename).toBe("uni_dw_load.sql");
    expect(artifact.body).toContain("INSERT INTO [dbo].[stu] ([stu_code], [surname])");
    expect(artifact.body).toContain("FROM @rows_stu");
    expect(artifact.body).not.toContain("MERGE");
  });

  it("renders a MERGE when merge keys are configured", async () => {
    const cfg: AzureSqlConfig = { ...baseCfg, mergeKeysByEntity: { stu: ["stu_code"] }, schema: "stg" };
    const { adapter, transport } = await buildAzureSqlTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1", surname: "A" }]);
    const body = renderAzureSqlLoad(cfg, transport).body;
    expect(body).toContain("MERGE [stg].[stu] AS tgt");
    expect(body).toContain("ON (tgt.[stu_code] = src.[stu_code])");
    expect(body).toContain("WHEN MATCHED THEN UPDATE SET tgt.[surname] = src.[surname]");
    expect(body).toContain("WHEN NOT MATCHED THEN INSERT ([stu_code], [surname])");
  });

  it("omits the UPDATE clause when every column is a key", async () => {
    const cfg: AzureSqlConfig = { ...baseCfg, mergeKeysByEntity: { link: ["a", "b"] } };
    const { adapter, transport } = await buildAzureSqlTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "link", [{ a: "1", b: "2" }]);
    const body = renderAzureSqlLoad(cfg, transport).body;
    expect(body).toContain("WHEN NOT MATCHED THEN INSERT");
    expect(body).not.toContain("WHEN MATCHED THEN UPDATE");
  });

  it("commits rows and supports a live sink", async () => {
    const sink = vi.fn(async (_e: string, _r: SampledRow, seq: number) => `db-${seq}`);
    const { adapter, transport } = await buildAzureSqlTarget(makeCtx(), baseCfg, { sink });
    expect(transport.mode).toBe("live");
    const commit = await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    expect(commit.outcomes[0]?.targetId).toBe("db-0");
    expect(sink).toHaveBeenCalledOnce();
  });

  it("dry-run writes nothing", async () => {
    const { adapter, transport } = await buildAzureSqlTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }], true);
    expect(transport.size).toBe(0);
  });

  it("resolves a service-principal credential via secrets + token provider", async () => {
    const { authMode } = await buildAzureSqlTarget(
      makeCtx({ k: "the-secret" }),
      baseCfg,
      { tokenProvider: async () => "tok" },
    );
    expect(authMode).toBe("service-principal");
  });

  it("falls back to stub when validation has no required fields", async () => {
    const { adapter } = await buildAzureSqlTarget(makeCtx(), baseCfg);
    const result = await adapter.validate(makeCtx(), { entity: "stu", rows: [{ x: "1" }] });
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(0);
  });
});
