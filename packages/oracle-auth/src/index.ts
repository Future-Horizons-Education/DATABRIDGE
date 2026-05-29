/**
 * @databridge/oracle-auth — shared Oracle / OCI authentication for cloud
 * target adapters (GoldenGate, Autonomous Data Warehouse, OCI Data
 * Integration).
 *
 * Resolves a credential from one of three modes. `oracledb` / `oci-common`
 * are **optional peer dependencies**, lazy-loaded only for live connections
 * (mirrors the `pg` lazy-load in `@databridge/schema-mapper`). Wallet mode
 * resolves a password from the platform secrets accessor; IAM and
 * instance-principal need the OCI SDK. When inputs are missing or the peer
 * is absent the resolver returns `undefined` and callers fall back to a
 * deterministic stub path — no real tenant calls.
 */
import type { AdapterContext } from "@databridge/adapter-spec";

export type OracleAuthMode = "wallet" | "iam" | "instance-principal";

export interface OracleAuthConfig {
  mode: OracleAuthMode;
  /** Platform-secrets key for the wallet password (wallet) or API key (iam). */
  secretKey?: string;
  /** OCI region (iam / instance-principal). */
  region?: string;
  /** Wallet directory (wallet mode). */
  walletLocation?: string;
  /** TNS connect string / alias. */
  connectString?: string;
}

export interface OracleCredential {
  mode: OracleAuthMode;
  /** Opaque secret/token proving auth (wallet password or OCI token). */
  token: string;
  region?: string;
  connectString?: string;
}

export type OracleTokenProvider = (
  cfg: OracleAuthConfig,
  ctx: AdapterContext
) => Promise<string | undefined>;

export interface ResolveOracleOptions {
  /** Test seam — substitute a fake token provider. */
  tokenProvider?: OracleTokenProvider;
}

/**
 * Resolve an Oracle/OCI credential for the given auth config. Returns
 * `undefined` when no credential can be obtained — callers then fall back to
 * the deterministic stub path.
 */
export async function resolveOracleCredential(
  ctx: AdapterContext,
  cfg: OracleAuthConfig,
  opts: ResolveOracleOptions = {}
): Promise<OracleCredential | undefined> {
  const provider = opts.tokenProvider ?? defaultOracleTokenProvider;
  let token: string | undefined;
  try {
    token = await provider(cfg, ctx);
  } catch (err) {
    ctx.logger.warn("oracle-auth: credential resolution failed; using stub mode", {
      mode: cfg.mode,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
  if (!token) return undefined;
  const cred: OracleCredential = { mode: cfg.mode, token };
  if (cfg.region !== undefined) cred.region = cfg.region;
  if (cfg.connectString !== undefined) cred.connectString = cfg.connectString;
  return cred;
}

const defaultOracleTokenProvider: OracleTokenProvider = async (cfg, ctx) => {
  if (cfg.mode === "wallet") {
    const secret = cfg.secretKey ? await ctx.secrets.get(cfg.secretKey) : undefined;
    return secret && secret.length > 0 ? secret : undefined;
  }
  return loadOciToken(ctx);
};

/**
 * Lazy-load the OCI SDK for IAM / instance-principal auth. Live token
 * acquisition against a real tenancy is out of scope for Phase C, so this
 * returns `undefined` (stub) — but it still surfaces an actionable install
 * hint when the optional peer is absent.
 */
async function loadOciToken(ctx: AdapterContext): Promise<string | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await import("oci-common" as any);
  } catch {
    ctx.logger.warn(
      "oracle-auth: optional peer 'oci-common' is not installed — " +
        "run `pnpm add oci-common oci-sdk` for live OCI auth; using stub mode"
    );
    return undefined;
  }
  ctx.logger.debug(
    "oracle-auth: oci-common present; live OCI token acquisition is not wired in this phase"
  );
  return undefined;
}
