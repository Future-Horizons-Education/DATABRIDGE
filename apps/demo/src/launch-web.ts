/**
 * Optional auto-launch of apps/web from the demo orchestrator (Phase C / C3).
 *
 * Off by default — hermetic CI and presenters who bring the stack up
 * themselves are unaffected. With `--launch-web`, the orchestrator spawns the
 * web dev server detached and prints the query-bar URL. The spawn function
 * and logger are injected so the flag logic is unit-tested without starting a
 * real process.
 */
export interface SpawnedProcessLike {
  pid?: number | undefined;
  unref?: (() => void) | undefined;
}

export interface LaunchWebDeps {
  spawn: (
    command: string,
    args: readonly string[],
    options: { detached: boolean; stdio: "ignore" | "inherit" }
  ) => SpawnedProcessLike;
  log: (message: string) => void;
}

export interface LaunchWebOptions {
  launchWeb: boolean;
  queryBarUrl: string;
  /** pnpm workspace filter for the web app. Defaults to "@databridge/web". */
  webFilter?: string;
}

export interface LaunchWebResult {
  launched: boolean;
  url?: string;
  pid?: number;
}

export function maybeLaunchWeb(opts: LaunchWebOptions, deps: LaunchWebDeps): LaunchWebResult {
  if (!opts.launchWeb) {
    deps.log(
      "web auto-launch disabled — pass --launch-web to start apps/web and open the query bar"
    );
    return { launched: false };
  }
  const filter = opts.webFilter ?? "@databridge/web";
  const child = deps.spawn("pnpm", ["--filter", filter, "dev"], {
    detached: true,
    stdio: "ignore",
  });
  if (child.unref) child.unref();
  deps.log(`apps/web launching — open the query bar at ${opts.queryBarUrl}`);
  const result: LaunchWebResult = { launched: true, url: opts.queryBarUrl };
  if (child.pid !== undefined) result.pid = child.pid;
  return result;
}

/** Default deps wired to node:child_process + stdout. */
export async function defaultLaunchWebDeps(): Promise<LaunchWebDeps> {
  const { spawn } = await import("node:child_process");
  return {
    spawn: (command, args, options) =>
      spawn(command, [...args], {
        detached: options.detached,
        stdio: options.stdio,
      }),
    log: (message) => process.stdout.write(`${message}\n`),
  };
}
