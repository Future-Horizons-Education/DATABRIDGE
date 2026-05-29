import { describe, it, expect } from "vitest";
import {
  DeterministicHashEmbedding,
  EmbeddingIndex,
  OnnxEmbedding,
  HashingTokeniser,
  meanPool,
  cosine,
  selectEmbeddingBackendFromEnv,
  type OnnxSessionLike,
  type OnnxTokeniser,
} from "../embedding.js";

describe("DeterministicHashEmbedding", () => {
  it("returns a vector of the configured dimension", async () => {
    const e = new DeterministicHashEmbedding(128);
    const v = await e.embed("hello");
    expect(v).toHaveLength(128);
  });

  it("produces the same vector for the same input", async () => {
    const e = new DeterministicHashEmbedding();
    const a = await e.embed("Student.lastName");
    const b = await e.embed("Student.lastName");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("L2-normalises the vector (or yields zero)", async () => {
    const e = new DeterministicHashEmbedding();
    const v = await e.embed("Student.lastName");
    let sumSq = 0;
    for (const x of v) sumSq += x * x;
    // Allow zero (empty input) but otherwise should be ~1.
    if (sumSq > 0) {
      expect(Math.sqrt(sumSq)).toBeCloseTo(1, 5);
    }
  });

  it("rejects out-of-range dimensions", () => {
    expect(() => new DeterministicHashEmbedding(8)).toThrow();
    expect(() => new DeterministicHashEmbedding(5000)).toThrow();
  });
});

describe("cosine similarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    expect(cosine(v, v)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosine(a, b)).toBeCloseTo(0);
  });

  it("returns 0 when either vector is all zeros", () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosine(a, b)).toBe(0);
  });
});

describe("EmbeddingIndex", () => {
  it("finds the nearest neighbour for a known item", async () => {
    const idx = new EmbeddingIndex(new DeterministicHashEmbedding());
    await idx.addAll([
      { id: "Student.lastName", text: "Student lastName surname family name" },
      { id: "Student.firstName", text: "Student firstName given name forename" },
      { id: "Student.husid", text: "HESA Unique Student Identifier" },
    ]);
    const hits = await idx.nearest("surname", 2);
    expect(hits[0]?.id).toBe("Student.lastName");
    expect(hits[0]?.score).toBeGreaterThan(0);
  });

  it("reports the index size", async () => {
    const idx = new EmbeddingIndex(new DeterministicHashEmbedding());
    await idx.add("a", "x");
    await idx.add("b", "y");
    expect(idx.size()).toBe(2);
  });
});

describe("meanPool", () => {
  it("averages over tokens then L2-normalises", () => {
    // 2 tokens × 3 hidden: [[2,0,0],[0,2,0]] → mean [1,1,0] → normalise.
    const v = meanPool([2, 0, 0, 0, 2, 0], [1, 2, 3], [1, 1]);
    expect(v[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(v[2]).toBeCloseTo(0, 5);
  });

  it("ignores masked-out tokens", () => {
    const v = meanPool([3, 0, 0, 9, 9, 9], [1, 2, 3], [1, 0]);
    expect(Array.from(v)).toEqual([1, 0, 0]);
  });
});

describe("HashingTokeniser", () => {
  it("wraps tokens with CLS/SEP and an all-ones mask", () => {
    const enc = new HashingTokeniser().encode("student surname");
    expect(enc.inputIds[0]).toBe(101);
    expect(enc.inputIds[enc.inputIds.length - 1]).toBe(102);
    expect(enc.attentionMask).toHaveLength(enc.inputIds.length);
    expect(enc.attentionMask.every((m) => m === 1)).toBe(true);
  });

  it("is deterministic", () => {
    const a = new HashingTokeniser().encode("Student.lastName");
    const b = new HashingTokeniser().encode("Student.lastName");
    expect(a.inputIds).toEqual(b.inputIds);
  });
});

describe("OnnxEmbedding", () => {
  it("falls back to the deterministic hash backend when the model is missing", async () => {
    const e = new OnnxEmbedding({ modelPath: "/does/not/exist.onnx" });
    const v = await e.embed("hello");
    expect(v).toHaveLength(384);
  });

  it("runs the real pipeline (tokenise → run → mean-pool) with an injected session", async () => {
    const tokeniser: OnnxTokeniser = {
      encode: () => ({ inputIds: [101, 7, 102], attentionMask: [1, 1, 1] }),
    };
    const data = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]); // 3×4
    const session: OnnxSessionLike = {
      run: async () => ({ last_hidden_state: { data, dims: [1, 3, 4] } }),
    };
    const e = new OnnxEmbedding({
      modelPath: "x.onnx",
      dimensions: 16,
      tokeniser,
      sessionFactory: async () => session,
    });
    const v = await e.embed("anything");
    expect(Array.from(v)).toEqual(Array.from(meanPool(data, [1, 3, 4], [1, 1, 1])));
  });

  it("uses the first output tensor when the named output is absent", async () => {
    const data = Float32Array.from([4, 0, 0, 4]); // 1 token × 4
    const session: OnnxSessionLike = {
      run: async () => ({ embeddings: { data, dims: [1, 1, 4] } }),
    };
    const e = new OnnxEmbedding({
      modelPath: "x.onnx",
      dimensions: 16,
      tokeniser: { encode: () => ({ inputIds: [1], attentionMask: [1] }) },
      sessionFactory: async () => session,
    });
    const v = await e.embed("q");
    expect(v[0]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("falls back when the session factory yields nothing", async () => {
    const e = new OnnxEmbedding({
      modelPath: "x.onnx",
      dimensions: 16,
      sessionFactory: async () => undefined,
    });
    expect(await e.embed("q")).toHaveLength(16);
  });

  it("degrades to the deterministic path when inference throws", async () => {
    const e = new OnnxEmbedding({
      modelPath: "x.onnx",
      dimensions: 16,
      sessionFactory: async () => ({
        run: async () => {
          throw new Error("bad shape");
        },
      }),
    });
    expect(await e.embed("q")).toHaveLength(16);
  });
});

describe("selectEmbeddingBackendFromEnv", () => {
  it("returns the deterministic variant when no env var is set", () => {
    const b = selectEmbeddingBackendFromEnv({});
    expect(b.id).toBe("deterministic-hash");
  });

  it("returns the ONNX variant when DATABRIDGE_EMBEDDINGS_ONNX_PATH is set", () => {
    const b = selectEmbeddingBackendFromEnv({ DATABRIDGE_EMBEDDINGS_ONNX_PATH: "/x.onnx" });
    expect(b.id).toBe("onnx");
  });
});
