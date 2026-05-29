import { describe, it, expect, vi } from "vitest";
import type { AdapterContext, SampledRow, TargetAdapter } from "@databridge/adapter-spec";
import { BufferedTargetTransport } from "@databridge/target-adapters";
import {
  buildAzureAdfTarget,
  AzureAdfTargetAdapter,
  renderAdfPipeline,
  type AzureAdfConfig,
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
  const validation = await adapter.validate(ctx, { entity, rows });
  const staged = await adapter.stage(ctx, {
    migrationRunId: "run-1",
    entity,
    rows,
    dryRun,
  });
  const commit = await adapter.commit(ctx, {
    batchId: staged.batchId,
    approvedBy: "tester",
    approvedAt: new Date(),
  });
  return { validation, staged, commit };
}

const baseCfg: AzureAdfConfig = {
  auth: { mode: "az-cli" },
  dataFactoryName: "uni-adf",
};

describe("AzureAdfTargetAdapter", () => {
  it("builds in deterministic stub mode by default", async () => {
    const { adapter, transport, authMode } = await buildAzureAdfTarget(makeCtx(), baseCfg);
    expect(adapter.id).toBe("azure-adf");
    expect(transport.mode).toBe("stub");
    expect(authMode).toBe("stub");
  });

  it("commits rows into the buffer with created outcomes", async () => {
    const { adapter, transport } = await buildAzureAdfTarget(makeCtx(), baseCfg);
    const { commit } = await commitEntity(adapter, makeCtx(), "stu", [
      { stu_code: "S1" },
      { stu_code: "S2" },
    ]);
    expect(commit.committed).toBe(2);
    expect(commit.failed).toBe(0);
    expect(commit.outcomes.every((o) => o.status === "created")).toBe(true);
    expect(transport.size).toBe(2);
  });

  it("dry-run commit skips every row and writes nothing", async () => {
    const { adapter, transport } = await buildAzureAdfTarget(makeCtx(), baseCfg);
    const { commit } = await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }], true);
    expect(commit.committed).toBe(0);
    expect(commit.outcomes[0]?.status).toBe("skipped");
    expect(transport.size).toBe(0);
  });

  it("renders an ADF pipeline with one Copy activity per entity", async () => {
    const { adapter, renderArtifact } = await buildAzureAdfTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    await commitEntity(adapter, makeCtx(), "sce", [{ sce_stuc: "S1" }]);
    const artifact = renderArtifact();
    expect(artifact.kind).toBe("adf-pipeline");
    expect(artifact.filename).toBe("uni-adf.pipeline.json");
    expect(artifact.contentType).toBe("application/json");
    const pipeline = JSON.parse(artifact.body) as {
      name: string;
      properties: { activities: Array<{ name: string }> };
    };
    expect(pipeline.name).toBe("databridge_land_uni-adf");
    expect(pipeline.properties.activities.map((a) => a.name)).toEqual(["Copy_stu", "Copy_sce"]);
  });

  it("honours datasetByEntity overrides in the emitted pipeline", async () => {
    const cfg: AzureAdfConfig = {
      ...baseCfg,
      datasetByEntity: { stu: "dbo_Student" },
    };
    const { adapter, transport } = await buildAzureAdfTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    const artifact = renderAdfPipeline(cfg, transport);
    const pipeline = JSON.parse(artifact.body) as {
      properties: { activities: Array<{ outputs: Array<{ referenceName: string }> }> };
    };
    expect(pipeline.properties.activities[0]?.outputs[0]?.referenceName).toBe("dbo_Student");
  });

  it("flags rows missing required fields during validate", async () => {
    const { adapter } = await buildAzureAdfTarget(makeCtx(), baseCfg, {
      requiredFieldsByEntity: { stu: ["stu_code"] },
    });
    const result = await adapter.validate(makeCtx(), {
      entity: "stu",
      rows: [{ stu_code: "S1" }, { name: "no-code" }],
    });
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.errors[0]?.field).toBe("stu_code");
  });

  it("forwards each row to a live sink and uses its surrogate ids", async () => {
    const sink = vi.fn(async (_e: string, _r: SampledRow, seq: number) => `gen-${seq}`);
    const { adapter, transport } = await buildAzureAdfTarget(makeCtx(), baseCfg, { sink });
    expect(transport.mode).toBe("live");
    const { commit } = await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(commit.outcomes[0]?.targetId).toBe("gen-0");
  });

  it("reflects the resolved auth mode when a token provider yields a token", async () => {
    const { authMode } = await buildAzureAdfTarget(
      makeCtx(),
      {
        auth: { mode: "service-principal", tenantId: "t", clientId: "c", clientSecretKey: "k" },
        dataFactoryName: "x",
      },
      { tokenProvider: async () => "tok" }
    );
    expect(authMode).toBe("service-principal");
  });

  it("does not support rollback", async () => {
    const { adapter } = await buildAzureAdfTarget(makeCtx(), baseCfg);
    expect(adapter.capabilities.supportsRollback).toBe(false);
    await expect(adapter.rollback(makeCtx(), { batchId: "x", reason: "r" })).rejects.toThrow(
      /does not support rollback/
    );
  });

  it("constructs the adapter class directly with an injected transport", () => {
    const transport = new BufferedTargetTransport({ idPrefix: "adf" });
    const adapter = new AzureAdfTargetAdapter(transport, {
      requiredFieldsByEntity: { stu: ["stu_code"] },
    });
    expect(adapter.id).toBe("azure-adf");
    expect(adapter.displayName).toBe("Azure Data Factory");
  });
});
