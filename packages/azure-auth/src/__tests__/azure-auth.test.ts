import { describe, it, expect, vi } from "vitest";
import type { AdapterContext } from "@databridge/adapter-spec";
import {
  resolveAzureCredential,
  AZURE_ARM_SCOPE,
  AZURE_SQL_SCOPE,
  type AzureAuthConfig,
  type AzureTokenProvider,
} from "../index.js";

function makeCtx(secrets: Record<string, string> = {}): AdapterContext {
  return {
    tenantId: "test",
    connectionId: "conn",
    secrets: {
      async get(k: string) {
        return secrets[k] ?? "";
      },
    },
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

describe("resolveAzureCredential", () => {
  it("returns a credential when the token provider yields a token", async () => {
    const cfg: AzureAuthConfig = {
      mode: "service-principal",
      tenantId: "t-1",
      clientId: "c-1",
      clientSecretKey: "azure.sp.secret",
    };
    const cred = await resolveAzureCredential(makeCtx(), cfg, {
      tokenProvider: async () => "tok-abc",
    });
    expect(cred).toEqual({
      mode: "service-principal",
      token: "tok-abc",
      tenantId: "t-1",
      clientId: "c-1",
    });
  });

  it("returns undefined when the provider yields no token (stub fallback)", async () => {
    const cred = await resolveAzureCredential(
      makeCtx(),
      { mode: "az-cli" },
      { tokenProvider: async () => undefined }
    );
    expect(cred).toBeUndefined();
  });

  it("returns undefined and warns when the provider throws", async () => {
    const ctx = makeCtx();
    const warn = vi.spyOn(ctx.logger, "warn");
    const cred = await resolveAzureCredential(
      ctx,
      { mode: "managed-identity" },
      {
        tokenProvider: async () => {
          throw new Error("boom");
        },
      }
    );
    expect(cred).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("defaults to the ARM scope and forwards a custom scope", async () => {
    const seen: string[] = [];
    const provider: AzureTokenProvider = async (_cfg, _ctx, scope) => {
      seen.push(scope);
      return "tok";
    };
    await resolveAzureCredential(makeCtx(), { mode: "az-cli" }, { tokenProvider: provider });
    await resolveAzureCredential(
      makeCtx(),
      { mode: "az-cli" },
      {
        tokenProvider: provider,
        scope: AZURE_SQL_SCOPE,
      }
    );
    expect(seen).toEqual([AZURE_ARM_SCOPE, AZURE_SQL_SCOPE]);
  });

  it("carries managed-identity mode and omits absent tenant/client ids", async () => {
    const cred = await resolveAzureCredential(
      makeCtx(),
      { mode: "managed-identity" },
      { tokenProvider: async () => "tok" }
    );
    expect(cred?.mode).toBe("managed-identity");
    expect(cred && "tenantId" in cred).toBe(false);
    expect(cred && "clientId" in cred).toBe(false);
  });

  it("passes the auth config and context through to the provider", async () => {
    const provider = vi.fn<Parameters<AzureTokenProvider>, ReturnType<AzureTokenProvider>>(
      async () => "tok"
    );
    const cfg: AzureAuthConfig = { mode: "az-cli" };
    const ctx = makeCtx();
    await resolveAzureCredential(ctx, cfg, { tokenProvider: provider });
    expect(provider).toHaveBeenCalledWith(cfg, ctx, AZURE_ARM_SCOPE);
  });

  it("falls back to stub mode when @azure/identity is not installed (default provider)", async () => {
    // No tokenProvider injected → default path lazy-loads @azure/identity,
    // which is not installed in this workspace → undefined (stub).
    const cred = await resolveAzureCredential(makeCtx(), { mode: "az-cli" });
    expect(cred).toBeUndefined();
  });
});
