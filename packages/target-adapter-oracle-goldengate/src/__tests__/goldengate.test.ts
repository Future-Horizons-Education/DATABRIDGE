import { describe, it, expect, vi } from "vitest";
import type { AdapterContext, SampledRow, TargetAdapter } from "@databridge/adapter-spec";
import {
  buildOracleGoldenGateTarget,
  renderGoldenGateParams,
  type OracleGoldenGateConfig,
} from "../index.js";

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

const baseCfg: OracleGoldenGateConfig = {
  auth: { mode: "wallet", secretKey: "gg.pw" },
};

describe("OracleGoldenGateTargetAdapter", () => {
  it("exposes the oracle-goldengate id", async () => {
    const { adapter } = await buildOracleGoldenGateTarget(makeCtx(), baseCfg);
    expect(adapter.id).toBe("oracle-goldengate");
    expect(adapter.displayName).toBe("Oracle GoldenGate");
  });

  it("renders a replicat parameter file with a MAP per entity", async () => {
    const { adapter, transport } = await buildOracleGoldenGateTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }, { stu_code: "S2" }]);
    await commitEntity(adapter, makeCtx(), "sce", [{ sce_stuc: "S1" }]);
    const artifact = renderGoldenGateParams(baseCfg, transport);
    expect(artifact.kind).toBe("gg-replicat-param");
    expect(artifact.filename).toBe("dbridge.prm");
    expect(artifact.contentType).toBe("text/plain");
    expect(artifact.body).toContain("REPLICAT DBRIDGE");
    expect(artifact.body).toContain("MAP CANONICAL.STU, TARGET ADW.STU; -- 2 row(s)");
    expect(artifact.body).toContain("MAP CANONICAL.SCE, TARGET ADW.SCE; -- 1 row(s)");
  });

  it("honours replicat name and target/source schema overrides", async () => {
    const cfg: OracleGoldenGateConfig = {
      ...baseCfg,
      replicatName: "RPLHE",
      targetSchema: "DWH",
      sourceSchema: "STG",
    };
    const { adapter, transport } = await buildOracleGoldenGateTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    const artifact = renderGoldenGateParams(cfg, transport);
    expect(artifact.filename).toBe("rplhe.prm");
    expect(artifact.body).toContain("REPLICAT RPLHE");
    expect(artifact.body).toContain("MAP STG.STU, TARGET DWH.STU;");
  });

  it("resolves a wallet credential from secrets", async () => {
    const { authMode } = await buildOracleGoldenGateTarget(makeCtx({ "gg.pw": "secret" }), baseCfg);
    expect(authMode).toBe("wallet");
  });

  it("falls back to stub when the wallet secret is absent", async () => {
    const { authMode, transport } = await buildOracleGoldenGateTarget(makeCtx(), baseCfg);
    expect(authMode).toBe("stub");
    expect(transport.mode).toBe("stub");
  });

  it("commits rows and supports a live sink", async () => {
    const sink = vi.fn(async () => undefined);
    const { adapter, transport } = await buildOracleGoldenGateTarget(makeCtx(), baseCfg, { sink });
    expect(transport.mode).toBe("live");
    const commit = await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    expect(commit.committed).toBe(1);
    expect(sink).toHaveBeenCalledOnce();
  });

  it("dry-run writes nothing", async () => {
    const { adapter, transport } = await buildOracleGoldenGateTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }], true);
    expect(transport.size).toBe(0);
  });
});
