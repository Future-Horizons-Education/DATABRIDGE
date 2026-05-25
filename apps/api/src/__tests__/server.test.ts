import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { build } from "../server.js";

describe("apps/api server", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET / returns the route catalogue", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string; routes: string[] };
    expect(body.name).toBe("@databridge/api");
    expect(body.routes).toContain("/adapters");
    expect(body.routes).toContain("/profiles");
    expect(body.routes).toContain("/canonical/entities");
  });

  it("GET /healthz returns ok=true", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
  });

  it("GET /adapters lists all 6 source adapters", async () => {
    const res = await app.inject({ method: "GET", url: "/adapters" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { adapters: Array<{ id: string }> };
    const ids = body.adapters.map((a) => a.id).sort();
    expect(ids).toEqual([
      "banner-ethos",
      "banner-oracle",
      "sits-api",
      "sits-file",
      "sjms5",
      "workday-raas",
    ]);
  });

  it("GET /adapters/sits-api returns capabilities", async () => {
    const res = await app.inject({ method: "GET", url: "/adapters/sits-api" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      id: string;
      preferredAuth: string;
      capabilities: { supportsSampling: boolean };
    };
    expect(body.id).toBe("sits-api");
    expect(body.preferredAuth).toBe("bearer");
    expect(body.capabilities.supportsSampling).toBe(true);
  });

  it("GET /adapters/does-not-exist returns 404", async () => {
    const res = await app.inject({ method: "GET", url: "/adapters/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /profiles lists at least the HESA TDP profile", async () => {
    const res = await app.inject({ method: "GET", url: "/profiles" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { profiles: Array<{ id: string }> };
    const ids = body.profiles.map((p) => p.id);
    expect(ids).toContain("hesa-tdp");
  });

  it("GET /profiles/hesa-tdp returns summary with non-zero rule count", async () => {
    const res = await app.inject({ method: "GET", url: "/profiles/hesa-tdp" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; ruleCount: number };
    expect(body.id).toBe("hesa-tdp");
    expect(body.ruleCount).toBeGreaterThan(0);
  });

  it("GET /canonical/entities lists all canonical entity names", async () => {
    const res = await app.inject({ method: "GET", url: "/canonical/entities" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { entities: string[] };
    expect(body.entities.length).toBeGreaterThan(0);
  });

  it("GET /canonical/entities/Student returns a descriptor", async () => {
    const res = await app.inject({ method: "GET", url: "/canonical/entities/Student" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string; hasSchema: boolean };
    expect(body.name).toBe("Student");
    expect(body.hasSchema).toBe(true);
  });

  it("GET /canonical/entities/Bogus returns 404", async () => {
    const res = await app.inject({ method: "GET", url: "/canonical/entities/Bogus" });
    expect(res.statusCode).toBe(404);
  });
});
