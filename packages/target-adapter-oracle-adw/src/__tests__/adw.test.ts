import { describe, it, expect, vi } from "vitest";
import type { AdapterContext, SampledRow, TargetAdapter } from "@databridge/adapter-spec";
import { buildOracleAdwTarget, renderAdwLoad, type OracleAdwConfig } from "../index.js";

function makeCtx(secrets: Record<string, string> = {}): AdapterContext {
  return {
    tenantId: "t",
    connectionId: "c",
    secrets: {
      async get(k: string) {
        return secrets[k] ?? "";
      },
    },
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

async function commitEntity(
  adapter: TargetAdapter,
  ctx: AdapterContext,
  entity: string,
  rows: SampledRow[],
  dryRun = false
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

const baseCfg: OracleAdwConfig = {
  auth: { mode: "wallet", secretKey: "adw.pw" },
};

describe("OracleAdwTargetAdapter", () => {
  it("exposes the oracle-adw id and upsert capability", async () => {
    const { adapter } = await buildOracleAdwTarget(makeCtx(), baseCfg);
    expect(adapter.id).toBe("oracle-adw");
    expect(adapter.capabilities.supportsUpsert).toBe(true);
  });

  it("renders an INSERT (upper-cased identifiers) without merge keys", async () => {
    const { adapter, transport } = await buildOracleAdwTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1", surname: "A" }]);
    const artifact = renderAdwLoad(baseCfg, transport);
    expect(artifact.kind).toBe("adw-load-sql");
    expect(artifact.filename).toBe("admin_adw_load.sql");
    expect(artifact.body).toContain("INSERT INTO ADMIN.STU (STU_CODE, SURNAME)");
    expect(artifact.body).toContain("FROM TABLE(:rows_stu)");
    expect(artifact.body).not.toContain("MERGE");
  });

  it("renders a MERGE when keys are configured and honours schema", async () => {
    const cfg: OracleAdwConfig = {
      ...baseCfg,
      schema: "DWH",
      mergeKeysByEntity: { stu: ["stu_code"] },
    };
    const { adapter, transport } = await buildOracleAdwTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1", surname: "A" }]);
    const body = renderAdwLoad(cfg, transport).body;
    expect(body).toContain("MERGE INTO DWH.STU tgt");
    expect(body).toContain("ON (tgt.STU_CODE = src.STU_CODE)");
    expect(body).toContain("WHEN MATCHED THEN UPDATE SET tgt.SURNAME = src.SURNAME");
    expect(body).toContain("WHEN NOT MATCHED THEN INSERT (STU_CODE, SURNAME)");
  });

  it("commits rows and supports a live sink", async () => {
    const sink = vi.fn(async (_e: string, _r: SampledRow, seq: number) => `adw-${seq}`);
    const { adapter, transport } = await buildOracleAdwTarget(makeCtx(), baseCfg, { sink });
    expect(transport.mode).toBe("live");
    const commit = await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    expect(commit.outcomes[0]?.targetId).toBe("adw-0");
  });

  it("dry-run writes nothing", async () => {
    const { adapter, transport } = await buildOracleAdwTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }], true);
    expect(transport.size).toBe(0);
  });

  it("resolves a wallet credential from secrets", async () => {
    const { authMode } = await buildOracleAdwTarget(makeCtx({ "adw.pw": "x" }), baseCfg);
    expect(authMode).toBe("wallet");
  });
});
