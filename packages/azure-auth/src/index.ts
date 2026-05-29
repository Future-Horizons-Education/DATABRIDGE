/**
 * @databridge/azure-auth — shared Azure authentication for cloud target
 * adapters (ADF, Synapse, Azure SQL, Microsoft Fabric).
 *
 * Resolves a bearer token for the requested scope from one of three auth
 * modes. `@azure/identity` is an **optional peer dependency**, lazy-loaded
 * only when a real token is requested (mirrors the `pg` lazy-load in
 * `@databridge/schema-mapper`). When the peer is absent, required inputs
 * are missing, or acquisition fails, the resolver returns `undefined` and
 * callers fall back to a deterministic stub path — no real tenant calls.
 */
import type { AdapterContext } from "@databridge/adapter-spec";

export type AzureAuthMode =
  | "managed-identity"
  | "service-principal"
  | "az-cli";

export interface AzureAuthConfig {
  mode: AzureAuthMode;
  /** Directory (tenant) id — required for service-principal. */
  tenantId?: string;
  /** App / user-assigned-identity client id. */
  clientId?: string;
  /** Platform-secrets key holding the service-principal client secret. */
  clientSecretKey?: string;
}

export interface AzureCredential {
  mode: AzureAuthMode;
  /** Bearer token for the requested scope. */
  token: string;
  tenantId?: string;
  clientId?: string;
}

/** Minimal `@azure/identity` surface — avoids a hard dep on its types. */
export interface AzureAccessTokenLike {
  token: string;
  expiresOnTimestamp: number;
}
export interface AzureTokenCredentialLike {
  getToken(scopes: string | string[]): Promise<AzureAccessTokenLike | null>;
}

/** Injectable token provider; default lazy-loads `@azure/identity`. */
export type AzureTokenProvider = (
  cfg: AzureAuthConfig,
  ctx: AdapterContext,
  scope: string,
) => Promise<string | undefined>;

export interface ResolveAzureOptions {
  /** Test seam — substitute a fake token provider. */
  tokenProvider?: AzureTokenProvider;
  /** Token scope; defaults to {@link AZURE_ARM_SCOPE}. */
  scope?: string;
}

export const AZURE_ARM_SCOPE = "https://management.azure.com/.default";
export const AZURE_SQL_SCOPE = "https://database.windows.net/.default";
export const AZURE_STORAGE_SCOPE = "https://storage.azure.com/.default";

/**
 * Resolve an Azure credential (bearer token) for the given auth config.
 * Returns `undefined` when no token can be obtained — callers then fall
 * back to the deterministic stub path.
 */
export async function resolveAzureCredential(
  ctx: AdapterContext,
  cfg: AzureAuthConfig,
  opts: ResolveAzureOptions = {},
): Promise<AzureCredential | undefined> {
  const scope = opts.scope ?? AZURE_ARM_SCOPE;
  const provider = opts.tokenProvider ?? defaultAzureTokenProvider;
  let token: string | undefined;
  try {
    token = await provider(cfg, ctx, scope);
  } catch (err) {
    ctx.logger.warn("azure-auth: token acquisition failed; using stub mode", {
      mode: cfg.mode,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
  if (!token) return undefined;
  const cred: AzureCredential = { mode: cfg.mode, token };
  if (cfg.tenantId !== undefined) cred.tenantId = cfg.tenantId;
  if (cfg.clientId !== undefined) cred.clientId = cfg.clientId;
  return cred;
}

const defaultAzureTokenProvider: AzureTokenProvider = async (
  cfg,
  ctx,
  scope,
) => {
  const credential = await loadAzureCredential(cfg, ctx);
  if (!credential) return undefined;
  const tok = await credential.getToken(scope);
  return tok?.token;
};

interface AzureIdentityModuleLike {
  ManagedIdentityCredential: new (clientId?: string) => AzureTokenCredentialLike;
  AzureCliCredential: new () => AzureTokenCredentialLike;
  ClientSecretCredential: new (
    tenantId: string,
    clientId: string,
    clientSecret: string,
  ) => AzureTokenCredentialLike;
}

/**
 * Lazy-load `@azure/identity` and construct the right TokenCredential.
 * Returns `undefined` when the optional peer is not installed or required
 * inputs are missing.
 */
async function loadAzureCredential(
  cfg: AzureAuthConfig,
  ctx: AdapterContext,
): Promise<AzureTokenCredentialLike | undefined> {
  let mod: AzureIdentityModuleLike;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mod = (await import("@azure/identity" as any)) as AzureIdentityModuleLike;
  } catch {
    ctx.logger.warn(
      "azure-auth: optional peer '@azure/identity' is not installed — " +
        "run `pnpm add @azure/identity` for live Azure auth; using stub mode",
    );
    return undefined;
  }
  switch (cfg.mode) {
    case "managed-identity":
      return cfg.clientId !== undefined
        ? new mod.ManagedIdentityCredential(cfg.clientId)
        : new mod.ManagedIdentityCredential();
    case "az-cli":
      return new mod.AzureCliCredential();
    case "service-principal": {
      const secret = cfg.clientSecretKey
        ? await ctx.secrets.get(cfg.clientSecretKey)
        : undefined;
      if (!cfg.tenantId || !cfg.clientId || !secret) return undefined;
      return new mod.ClientSecretCredential(cfg.tenantId, cfg.clientId, secret);
    }
  }
}
