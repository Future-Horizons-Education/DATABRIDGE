import { describe, it, expect, vi } from "vitest";
import type { AdapterContext } from "@databridge/adapter-spec";
import {
  resolveOracleCredential,
  type OracleAuthConfig,
  type OracleTokenProvider,
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

describe("resolveOracleCredential", () => {
  it("resolves a wallet credential from the secrets accessor", async () => {
    const cfg: OracleAuthConfig = {
      mode: "wallet",
      secretKey: "adw.wallet.pw",
      connectString: "adw_high",
      region: "uk-london-1",
    };
    const cred = await resolveOracleCredential(makeCtx({ "adw.wallet.pw": "pw-123" }), cfg);
    expect(cred).toEqual({
      mode: "wallet",
      token: "pw-123",
      region: "uk-london-1",
      connectString: "adw_high",
    });
  });

  it("returns undefined for wallet mode when the secret is absent", async () => {
    const cred = await resolveOracleCredential(makeCtx(), {
      mode: "wallet",
      secretKey: "missing",
    });
    expect(cred).toBeUndefined();
  });

  it("resolves via an injected token provider (iam)", async () => {
    const cred = await resolveOracleCredential(
      makeCtx(),
      { mode: "iam", region: "uk-london-1" },
      { tokenProvider: async () => "oci-token" }
    );
    expect(cred?.mode).toBe("iam");
    expect(cred?.token).toBe("oci-token");
    expect(cred?.region).toBe("uk-london-1");
  });

  it("returns undefined and warns when the provider throws", async () => {
    const ctx = makeCtx();
    const warn = vi.spyOn(ctx.logger, "warn");
    const cred = await resolveOracleCredential(
      ctx,
      { mode: "instance-principal" },
      {
        tokenProvider: async () => {
          throw new Error("nope");
        },
      }
    );
    expect(cred).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("omits region/connectString when not configured", async () => {
    const cred = await resolveOracleCredential(
      makeCtx(),
      { mode: "iam" },
      { tokenProvider: async () => "tok" }
    );
    expect(cred && "region" in cred).toBe(false);
    expect(cred && "connectString" in cred).toBe(false);
  });

  it("passes config + context through to the provider", async () => {
    const provider = vi.fn<Parameters<OracleTokenProvider>, ReturnType<OracleTokenProvider>>(
      async () => "tok"
    );
    const cfg: OracleAuthConfig = { mode: "wallet", secretKey: "k" };
    const ctx = makeCtx({ k: "v" });
    await resolveOracleCredential(ctx, cfg, { tokenProvider: provider });
    expect(provider).toHaveBeenCalledWith(cfg, ctx);
  });

  it("falls back to stub for iam when the OCI SDK is not installed", async () => {
    const cred = await resolveOracleCredential(makeCtx(), { mode: "iam" });
    expect(cred).toBeUndefined();
  });

  it("falls back to stub for instance-principal by default", async () => {
    const cred = await resolveOracleCredential(makeCtx(), { mode: "instance-principal" });
    expect(cred).toBeUndefined();
  });
});
