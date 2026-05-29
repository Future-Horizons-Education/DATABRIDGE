import { describe, it, expect, vi } from "vitest";
import type {
  AdapterContext,
  SampledRow,
  TargetAdapter,
} from "@databridge/adapter-spec";
import {
  buildOracleOciDiTarget,
  renderOciDiTasks,
  type OracleOciDiConfig,
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

interface OciDiPlan {
  workspaceId: string;
  project: string;
  tasks: Array<{ key: string; name: string; rowCount: number; target: { dataAsset: string } }>;
}

const baseCfg: OracleOciDiConfig = {
  auth: { mode: "instance-principal" },
};

describe("OracleOciDiTargetAdapter", () => {
  it("exposes the oracle-oci-di id", async () => {
    const { adapter } = await buildOracleOciDiTarget(makeCtx(), baseCfg);
    expect(adapter.id).toBe("oracle-oci-di");
    expect(adapter.displayName).toBe("Oracle OCI Data Integration");
  });

  it("renders a task definition per entity with row counts", async () => {
    const { adapter, transport } = await buildOracleOciDiTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }, { stu_code: "S2" }]);
    await commitEntity(adapter, makeCtx(), "sce", [{ sce_stuc: "S1" }]);
    const artifact = renderOciDiTasks(baseCfg, transport);
    expect(artifact.kind).toBe("oci-di-task");
    expect(artifact.filename).toBe("databridge_tasks.json");
    const plan = JSON.parse(artifact.body) as OciDiPlan;
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]?.key).toBe("task_stu");
    expect(plan.tasks[0]?.name).toBe("load_stu");
    expect(plan.tasks[0]?.rowCount).toBe(2);
  });

  it("honours workspace id, project, and data-asset overrides", async () => {
    const cfg: OracleOciDiConfig = {
      ...baseCfg,
      workspaceId: "ocid1.disworkspace.oc1..real",
      projectName: "he_returns",
      targetDataAssetKey: "DA_DWH",
    };
    const { adapter, transport } = await buildOracleOciDiTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    const plan = JSON.parse(renderOciDiTasks(cfg, transport).body) as OciDiPlan;
    expect(plan.workspaceId).toBe("ocid1.disworkspace.oc1..real");
    expect(plan.project).toBe("he_returns");
    expect(plan.tasks[0]?.target.dataAsset).toBe("DA_DWH");
  });

  it("commits rows and supports a live sink", async () => {
    const sink = vi.fn(async () => undefined);
    const { adapter, transport } = await buildOracleOciDiTarget(makeCtx(), baseCfg, { sink });
    expect(transport.mode).toBe("live");
    const commit = await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    expect(commit.committed).toBe(1);
    expect(sink).toHaveBeenCalledOnce();
  });

  it("dry-run writes nothing", async () => {
    const { adapter, transport } = await buildOracleOciDiTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }], true);
    expect(transport.size).toBe(0);
  });

  it("defaults to stub auth without a token provider", async () => {
    const { authMode } = await buildOracleOciDiTarget(makeCtx(), baseCfg);
    expect(authMode).toBe("stub");
  });
});
