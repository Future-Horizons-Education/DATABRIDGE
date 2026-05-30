import { describe, it, expect, vi } from "vitest";
import type { AdapterContext, SampledRow } from "@databridge/adapter-spec";
import {
  BufferedTargetTransport,
  ConfigurableTargetAdapter,
  type ConfigurableTargetAdapterSpec,
} from "../index.js";

function makeCtx(): AdapterContext {
  return {
    tenantId: "t",
    connectionId: "c",
    secrets: {
      async get() {
        return "";
      },
    },
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

describe("BufferedTargetTransport", () => {
  it("buffers writes in order with prefixed synthetic ids", async () => {
    const t = new BufferedTargetTransport({ idPrefix: "x" });
    const id0 = await t.write("stu", { a: "1" });
    const id1 = await t.write("stu", { a: "2" });
    expect(id0).toBe("x-stu-0");
    expect(id1).toBe("x-stu-1");
    expect(t.size).toBe(2);
    expect(t.collected().map((w) => w.row["a"])).toEqual(["1", "2"]);
  });

  it("is in stub mode without a sink and live mode with one", () => {
    expect(new BufferedTargetTransport().mode).toBe("stub");
    expect(new BufferedTargetTransport({ sink: async () => undefined }).mode).toBe("live");
  });

  it("forwards writes to the sink and uses its id when returned", async () => {
    const sink = vi.fn(async (_e: string, _r: SampledRow, seq: number) => `srv-${seq}`);
    const t = new BufferedTargetTransport({ sink });
    const id = await t.write("stu", { a: "1" });
    expect(sink).toHaveBeenCalledOnce();
    expect(id).toBe("srv-0");
  });

  it("keeps the synthetic id when the sink returns void", async () => {
    const t = new BufferedTargetTransport({ idPrefix: "y", sink: async () => undefined });
    expect(await t.write("stu", { a: "1" })).toBe("y-stu-0");
  });

  it("removes a row by id", async () => {
    const t = new BufferedTargetTransport();
    const id = await t.write("stu", { a: "1" });
    await t.write("stu", { a: "2" });
    await t.remove("stu", id);
    expect(t.size).toBe(1);
    expect(t.rowsFor("stu").map((r) => r["a"])).toEqual(["2"]);
  });

  it("reports distinct entities in first-seen order", async () => {
    const t = new BufferedTargetTransport();
    await t.write("stu", { a: "1" });
    await t.write("sce", { a: "2" });
    await t.write("stu", { a: "3" });
    expect(t.entities()).toEqual(["stu", "sce"]);
  });
});

describe("ConfigurableTargetAdapter", () => {
  const spec: ConfigurableTargetAdapterSpec = {
    id: "demo-target",
    displayName: "Demo Target",
    capabilities: {
      supportsRollback: true,
      supportsUpsert: true,
      supportsPartialUpdate: false,
      batchSizeLimit: 2,
    },
    requiredFieldsByEntity: { stu: ["stu_code"] },
  };

  function build() {
    const transport = new BufferedTargetTransport({ idPrefix: "d" });
    return { transport, adapter: new ConfigurableTargetAdapter(transport, spec) };
  }

  it("exposes the spec identity + capabilities", () => {
    const { adapter } = build();
    expect(adapter.id).toBe("demo-target");
    expect(adapter.displayName).toBe("Demo Target");
    expect(adapter.capabilities.batchSizeLimit).toBe(2);
  });

  it("validates required fields per entity", async () => {
    const { adapter } = build();
    const r = await adapter.validate(makeCtx(), {
      entity: "stu",
      rows: [{ stu_code: "S1" }, { other: "x" }],
    });
    expect(r.valid).toBe(1);
    expect(r.invalid).toBe(1);
    expect(r.errors[0]?.field).toBe("stu_code");
  });

  it("stages + commits, writing rows through the transport", async () => {
    const { adapter, transport } = build();
    const staged = await adapter.stage(makeCtx(), {
      migrationRunId: "r1",
      entity: "stu",
      rows: [{ stu_code: "S1" }, { stu_code: "S2" }],
      dryRun: false,
    });
    const commit = await adapter.commit(makeCtx(), {
      batchId: staged.batchId,
      approvedBy: "t",
      approvedAt: new Date(),
    });
    expect(commit.committed).toBe(2);
    expect(transport.size).toBe(2);
  });

  it("dry-run commit skips and writes nothing", async () => {
    const { adapter, transport } = build();
    const staged = await adapter.stage(makeCtx(), {
      migrationRunId: "r1",
      entity: "stu",
      rows: [{ stu_code: "S1" }],
      dryRun: true,
    });
    const commit = await adapter.commit(makeCtx(), {
      batchId: staged.batchId,
      approvedBy: "t",
      approvedAt: new Date(),
    });
    expect(commit.committed).toBe(0);
    expect(commit.outcomes[0]?.status).toBe("skipped");
    expect(transport.size).toBe(0);
  });

  it("rolls back a committed batch via the transport", async () => {
    const { adapter, transport } = build();
    const staged = await adapter.stage(makeCtx(), {
      migrationRunId: "r1",
      entity: "stu",
      rows: [{ stu_code: "S1" }, { stu_code: "S2" }],
      dryRun: false,
    });
    await adapter.commit(makeCtx(), {
      batchId: staged.batchId,
      approvedBy: "t",
      approvedAt: new Date(),
    });
    expect(transport.size).toBe(2);
    await adapter.rollback(makeCtx(), { batchId: staged.batchId, reason: "undo" });
    expect(transport.size).toBe(0);
  });

  it("throws when a staged batch exceeds the size limit", async () => {
    const { adapter } = build();
    await expect(
      adapter.stage(makeCtx(), {
        migrationRunId: "r1",
        entity: "stu",
        rows: [{ stu_code: "S1" }, { stu_code: "S2" }, { stu_code: "S3" }],
        dryRun: false,
      })
    ).rejects.toThrow(/exceeds adapter limit/);
  });
});
