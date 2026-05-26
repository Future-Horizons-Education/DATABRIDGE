import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, loadAllFixtures } from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(here, "..", "..", "fixtures");

describe("parseArgs", () => {
  it("defaults to dry-run + human-readable + the bundled fixtures dir", () => {
    const opts = parseArgs([]);
    expect(opts.dryRun).toBe(true);
    expect(opts.json).toBe(false);
    expect(opts.fixturesDir.endsWith("fixtures")).toBe(true);
  });

  it("--commit flips dryRun off", () => {
    const opts = parseArgs(["--commit"]);
    expect(opts.dryRun).toBe(false);
  });

  it("--json switches to JSON output", () => {
    const opts = parseArgs(["--json"]);
    expect(opts.json).toBe(true);
  });

  it("--fixtures overrides the directory", () => {
    const opts = parseArgs(["--fixtures", "/tmp/fixtures"]);
    expect(opts.fixturesDir).toBe("/tmp/fixtures");
  });

  it("throws on unknown options", () => {
    expect(() => parseArgs(["--unknown"])).toThrow(/Unknown option/);
  });

  it("throws when --fixtures is missing its argument", () => {
    expect(() => parseArgs(["--fixtures"])).toThrow();
  });
});

describe("loadAllFixtures", () => {
  it("loads the four bundled fixtures with sane row counts", async () => {
    const fixtures = await loadAllFixtures(FIXTURES_DIR);
    expect(fixtures).toHaveLength(4);
    for (const f of fixtures) {
      expect(f.rows.length).toBeGreaterThanOrEqual(2000);
      expect(typeof f.source).toBe("string");
      expect(typeof f.name).toBe("string");
    }
  });

  it("includes one fixture per source system (banner, sits, salesforce-edu, dynamics365-edu)", async () => {
    const fixtures = await loadAllFixtures(FIXTURES_DIR);
    const sources = new Set(fixtures.map((f) => f.source));
    expect(sources.has("banner")).toBe(true);
    expect(sources.has("sits")).toBe(true);
    expect(sources.has("salesforce-edu")).toBe(true);
    expect(sources.has("dynamics365-edu")).toBe(true);
  });
});
