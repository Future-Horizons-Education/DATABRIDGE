import { describe, it, expect, vi } from "vitest";
import type { AdapterContext, SampledRow, TargetAdapter } from "@databridge/adapter-spec";
import {
  buildAzureSynapseTarget,
  renderSynapseCopyInto,
  type AzureSynapseConfig,
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

const baseCfg: AzureSynapseConfig = {
  auth: { mode: "managed-identity" },
  stagingUrl: "https://acct.blob.core.windows.net/stage/",
};

describe("AzureSynapseTargetAdapter", () => {
  it("exposes the synapse id and stub default", async () => {
    const { adapter, transport, authMode } = await buildAzureSynapseTarget(makeCtx(), baseCfg);
    expect(adapter.id).toBe("azure-synapse");
    expect(transport.mode).toBe("stub");
    expect(authMode).toBe("stub");
  });

  it("commits rows into the buffer", async () => {
    const { adapter, transport } = await buildAzureSynapseTarget(makeCtx(), baseCfg);
    const commit = await commitEntity(adapter, makeCtx(), "stu", [
      { stu_code: "S1" },
      { stu_code: "S2" },
    ]);
    expect(commit.committed).toBe(2);
    expect(transport.size).toBe(2);
  });

  it("renders a COPY INTO statement per entity for a dedicated pool", async () => {
    const { adapter, transport } = await buildAzureSynapseTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    await commitEntity(adapter, makeCtx(), "sce", [{ sce_stuc: "S1" }]);
    const artifact = renderSynapseCopyInto(baseCfg, transport);
    expect(artifact.kind).toBe("synapse-copy-into");
    expect(artifact.contentType).toBe("application/sql");
    expect(artifact.body).toContain("COPY INTO [dbo].[stu]");
    expect(artifact.body).toContain("COPY INTO [dbo].[sce]");
    expect(artifact.body).toContain("FROM 'https://acct.blob.core.windows.net/stage/stu/'");
    expect(artifact.body).toContain("AUTO_CREATE_TABLE = 'ON'");
  });

  it("omits AUTO_CREATE_TABLE for a serverless pool and honours schema", async () => {
    const cfg: AzureSynapseConfig = { ...baseCfg, poolType: "serverless", schema: "audit" };
    const { adapter, transport } = await buildAzureSynapseTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    const artifact = renderSynapseCopyInto(cfg, transport);
    expect(artifact.filename).toBe("audit_copy_into.sql");
    expect(artifact.body).toContain("COPY INTO [audit].[stu]");
    expect(artifact.body).not.toContain("AUTO_CREATE_TABLE");
    expect(artifact.body).toContain("serverless pool");
  });

  it("respects a custom file type", async () => {
    const cfg: AzureSynapseConfig = { ...baseCfg, fileType: "CSV" };
    const { adapter, transport } = await buildAzureSynapseTarget(makeCtx(), cfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }]);
    expect(renderSynapseCopyInto(cfg, transport).body).toContain("FILE_TYPE = 'CSV'");
  });

  it("dry-run writes nothing", async () => {
    const { adapter, transport } = await buildAzureSynapseTarget(makeCtx(), baseCfg);
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }], true);
    expect(transport.size).toBe(0);
  });

  it("forwards rows to a live sink", async () => {
    const sink = vi.fn(async () => undefined);
    const { adapter, transport } = await buildAzureSynapseTarget(makeCtx(), baseCfg, { sink });
    expect(transport.mode).toBe("live");
    await commitEntity(adapter, makeCtx(), "stu", [{ stu_code: "S1" }, { stu_code: "S2" }]);
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("validates required fields", async () => {
    const { adapter } = await buildAzureSynapseTarget(makeCtx(), baseCfg, {
      requiredFieldsByEntity: { stu: ["stu_code"] },
    });
    const result = await adapter.validate(makeCtx(), {
      entity: "stu",
      rows: [{ name: "x" }],
    });
    expect(result.invalid).toBe(1);
  });

  it("reflects auth mode from a token provider", async () => {
    const { authMode } = await buildAzureSynapseTarget(makeCtx(), baseCfg, {
      tokenProvider: async () => "tok",
    });
    expect(authMode).toBe("managed-identity");
  });
});
