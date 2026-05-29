import { describe, it, expect, vi } from "vitest";
import type {
  AdapterContext,
  SampledRow,
  TargetAdapter,
} from "@databridge/adapter-spec";
import {
  buildMicrosoftFabricTarget,
  renderFabricLoadPlan,
  type MicrosoftFabricConfig,
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

const baseCfg: MicrosoftFabricConfig = {
  auth: { mode: "az-cli" },
  workspace: "uni-ws",
  lakehouse: "student_lh",
};

interface FabricPlan {
  workspace: string;
  lakehouse: string;
  warehouse?: string;
  loadMode: string;
  tables: Array<{ entity: string; path: string; format: string; rowCount: number }>;
}

describe("MicrosoftFabricTargetAdapter", () => {
  it("exposes the azure-fabric id", async () => {
    const { adapter } = await buildMicrosoftFabricTarget(makeCtx(), baseCfg);
    expect(adapter.id).toBe("azure-fabric");
    expect(adapter.displayName).toBe("Microsoft Fabric (OneLake)");
  });

  it("renders a OneLake load plan with a Delta table per entity", async () => {
    const { adapter, transport } = await buildMicrosoftFabricTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }, { stu_code: "S2" }]);
    await commitEntity(adapter, makeCtx(), "sce", [{ sce_stuc: "S1" }]);
    const artifact = renderFabricLoadPlan(baseCfg, transport);
    expect(artifact.kind).toBe("fabric-onelake-load");
    expect(artifact.filename).toBe("student_lh_onelake_load.json");
    const plan = JSON.parse(artifact.body) as FabricPlan;
    expect(plan.workspace).toBe("uni-ws");
    expect(plan.loadMode).toBe("append");
    expect(plan.tables).toHaveLength(2);
    expect(plan.tables[0]).toEqual({
      entity: "stu",
      path: "Tables/stu",
      format: "delta",
      rowCount: 2,
    });
  });

  it("includes a warehouse and honours overwrite mode when configured", async () => {
    const cfg: MicrosoftFabricConfig = {
      ...baseCfg,
      warehouse: "student_wh",
      mode: "overwrite",
    };
    const { adapter, transport } = await buildMicrosoftFabricTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    const plan = JSON.parse(renderFabricLoadPlan(cfg, transport).body) as FabricPlan;
    expect(plan.warehouse).toBe("student_wh");
    expect(plan.loadMode).toBe("overwrite");
  });

  it("omits the warehouse key when not configured", async () => {
    const { adapter, transport } = await buildMicrosoftFabricTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    const plan = JSON.parse(renderFabricLoadPlan(baseCfg, transport).body) as FabricPlan;
    expect("warehouse" in plan).toBe(false);
  });

  it("commits rows and supports a live sink", async () => {
    const sink = vi.fn(async () => undefined);
    const { adapter, transport } = await buildMicrosoftFabricTarget(makeCtx(), baseCfg, { sink });
    expect(transport.mode).toBe("live");
    const commit = await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    expect(commit.committed).toBe(1);
    expect(sink).toHaveBeenCalledOnce();
  });

  it("dry-run writes nothing", async () => {
    const { adapter, transport } = await buildMicrosoftFabricTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }], true);
    expect(transport.size).toBe(0);
  });

  it("supports upsert (Delta merge) but not rollback", async () => {
    const { adapter } = await buildMicrosoftFabricTarget(makeCtx(), baseCfg);
    expect(adapter.capabilities.supportsUpsert).toBe(true);
    expect(adapter.capabilities.supportsRollback).toBe(false);
  });
});
