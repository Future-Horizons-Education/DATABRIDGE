import { describe, it, expect, vi } from "vitest";
import { maybeLaunchWeb, type LaunchWebDeps } from "../launch-web.js";
import { parseArgs } from "../index.js";

function fakeDeps() {
  const logs: string[] = [];
  const spawn = vi.fn(() => ({ pid: 4242, unref: () => {} }));
  const deps: LaunchWebDeps = { spawn, log: (m: string) => logs.push(m) };
  return { deps, logs, spawn };
}

describe("maybeLaunchWeb", () => {
  it("does nothing when the flag is off", () => {
    const { deps, logs, spawn } = fakeDeps();
    const r = maybeLaunchWeb(
      { launchWeb: false, queryBarUrl: "http://localhost:3000/query" },
      deps
    );
    expect(r.launched).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("disabled");
  });

  it("spawns the web dev server when enabled", () => {
    const { deps, spawn } = fakeDeps();
    const r = maybeLaunchWeb({ launchWeb: true, queryBarUrl: "http://localhost:3000/query" }, deps);
    expect(r.launched).toBe(true);
    expect(r.url).toBe("http://localhost:3000/query");
    expect(r.pid).toBe(4242);
    expect(spawn).toHaveBeenCalledWith("pnpm", ["--filter", "@databridge/web", "dev"], {
      detached: true,
      stdio: "ignore",
    });
  });

  it("honours a custom web filter", () => {
    const { deps, spawn } = fakeDeps();
    maybeLaunchWeb({ launchWeb: true, queryBarUrl: "u", webFilter: "@x/web" }, deps);
    expect(spawn).toHaveBeenCalledWith("pnpm", ["--filter", "@x/web", "dev"], {
      detached: true,
      stdio: "ignore",
    });
  });
});

describe("parseArgs --launch-web", () => {
  it("defaults launchWeb to false", () => {
    expect(parseArgs([]).launchWeb).toBe(false);
  });

  it("sets launchWeb when --launch-web is passed", () => {
    expect(parseArgs(["--launch-web"]).launchWeb).toBe(true);
  });
});
