import { describe, it, expect } from "vitest";
import { createDefaultRegistry, translateCode } from "../index.js";

const BANNER_SITS_PAIRS = [
  ["BANNER.STVCAMP", "SITS.CAM"],
  ["BANNER.STVSTYP", "SITS.STYP"],
  ["BANNER.MODE", "SITS.MOA"],
  ["BANNER.STVLEVL", "SITS.LEVL"],
  ["BANNER.SPBPERS_SEX", "SITS.STU_GEND"],
  ["BANNER.GTVETCT", "SITS.STU_ETHN"],
] as const;

const SITS_BANNER_PAIRS = [
  ["SITS.CAM", "BANNER.STVCAMP"],
  ["SITS.STYP", "BANNER.STVSTYP"],
  ["SITS.MOA", "BANNER.MODE"],
  ["SITS.LEVL", "BANNER.STVLEVL"],
  ["SITS.STU_GEND", "BANNER.SPBPERS_SEX"],
  ["SITS.STU_ETHN", "BANNER.GTVETCT"],
] as const;

describe("Banner→SITS codeset seeds", () => {
  it.each(BANNER_SITS_PAIRS)("registers %s → %s", (src, tgt) => {
    const reg = createDefaultRegistry();
    const map = reg.resolve(src, tgt);
    expect(map).toBeDefined();
    expect(map?.entries.length).toBeGreaterThanOrEqual(4);
  });

  it("translates a known Banner campus code to SITS", () => {
    const reg = createDefaultRegistry();
    const r = translateCode(reg, {
      sourceCodelist: "BANNER.STVCAMP",
      targetCodelist: "SITS.CAM",
      sourceCode: "MAIN",
    });
    expect(r.ok).toBe(true);
    expect(r.targetCode).toBe("M");
  });

  it("marks synthetic-default maps with provenance flag", () => {
    const reg = createDefaultRegistry();
    const camMap = reg.resolve("BANNER.STVCAMP", "SITS.CAM");
    expect(camMap?.provenance).toBe("synthetic-default");
  });

  it("marks published-source maps explicitly when applicable", () => {
    const reg = createDefaultRegistry();
    const sex = reg.resolve("BANNER.SPBPERS_SEX", "SITS.STU_GEND");
    expect(sex?.provenance).toBe("published-source");
  });
});

describe("SITS→Banner codeset seeds (reverse direction)", () => {
  it.each(SITS_BANNER_PAIRS)("registers %s → %s", (src, tgt) => {
    const reg = createDefaultRegistry();
    const map = reg.resolve(src, tgt);
    expect(map).toBeDefined();
    expect(map?.entries.length).toBeGreaterThanOrEqual(4);
  });

  it("round-trips a campus code through both directions", () => {
    const reg = createDefaultRegistry();
    const fwd = translateCode(reg, {
      sourceCodelist: "BANNER.STVCAMP",
      targetCodelist: "SITS.CAM",
      sourceCode: "MAIN",
    });
    expect(fwd.ok).toBe(true);
    const rev = translateCode(reg, {
      sourceCodelist: "SITS.CAM",
      targetCodelist: "BANNER.STVCAMP",
      sourceCode: fwd.targetCode!,
    });
    expect(rev.ok).toBe(true);
    expect(rev.targetCode).toBe("MAIN");
  });

  it("round-trips a student-type code through both directions", () => {
    const reg = createDefaultRegistry();
    const fwd = translateCode(reg, {
      sourceCodelist: "BANNER.STVSTYP",
      targetCodelist: "SITS.STYP",
      sourceCode: "F",
    });
    expect(fwd.ok).toBe(true);
    const rev = translateCode(reg, {
      sourceCodelist: "SITS.STYP",
      targetCodelist: "BANNER.STVSTYP",
      sourceCode: fwd.targetCode!,
    });
    expect(rev.ok).toBe(true);
    expect(rev.targetCode).toBe("F");
  });
});
