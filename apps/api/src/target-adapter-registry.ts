/**
 * Target-adapter registry (Phase C) — cloud landing targets.
 *
 * Mirrors `adapter-registry.ts` (source adapters) for the write side. Each
 * entry knows how to build a {@link CloudTargetBundle} for a given target id
 * from a loosely-typed `targetConfig` (request-supplied). The migration
 * `:land` route resolves a target by id and drives validate→stage→commit
 * through {@link landWith}. All targets are dry-run / stub safe by default —
 * nothing touches a real tenant unless a live sink + credentials are wired.
 */
import type {
  AdapterContext,
  RowOutcome,
  SampledRow,
  TargetValidationError,
} from "@databridge/adapter-spec";
import type { CloudArtifact, CloudTargetBundle } from "@databridge/target-adapters";
import { buildAzureAdfTarget } from "@databridge/target-adapter-azure-adf";
import { buildAzureSynapseTarget } from "@databridge/target-adapter-azure-synapse";
import { buildAzureSqlTarget } from "@databridge/target-adapter-azure-sql";
import { buildMicrosoftFabricTarget } from "@databridge/target-adapter-microsoft-fabric";
import { buildOracleGoldenGateTarget } from "@databridge/target-adapter-oracle-goldengate";
import { buildOracleAdwTarget } from "@databridge/target-adapter-oracle-adw";
import { buildOracleOciDiTarget } from "@databridge/target-adapter-oracle-oci-di";
import type { AzureAuthConfig, AzureAuthMode } from "@databridge/azure-auth";
import type { OracleAuthConfig, OracleAuthMode } from "@databridge/oracle-auth";

export interface TargetAdapterRegistryEntry {
  id: string;
  displayName: string;
  family: "azure" | "oracle";
  authModes: readonly string[];
  build(
    ctx: AdapterContext,
    targetConfig: Record<string, unknown>,
  ): Promise<CloudTargetBundle>;
}

/* --------------------------- config coercion ------------------------------ */

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

const AZURE_MODES: readonly AzureAuthMode[] = [
  "managed-identity",
  "service-principal",
  "az-cli",
];

function asAzureAuth(v: unknown): AzureAuthConfig {
  const a = asRecord(v);
  const rawMode = a["mode"];
  const mode = AZURE_MODES.find((m) => m === rawMode) ?? "managed-identity";
  const cfg: AzureAuthConfig = { mode };
  if (typeof a["tenantId"] === "string") cfg.tenantId = a["tenantId"];
  if (typeof a["clientId"] === "string") cfg.clientId = a["clientId"];
  if (typeof a["clientSecretKey"] === "string") cfg.clientSecretKey = a["clientSecretKey"];
  return cfg;
}

function asStringRecord(v: unknown): Record<string, string> | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asStringArrayRecord(v: unknown): Record<string, string[]> | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, val] of Object.entries(v)) {
    if (Array.isArray(val)) out[k] = val.filter((x): x is string => typeof x === "string");
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const AZURE_MODE_LIST: readonly string[] = AZURE_MODES;

const ORACLE_MODES: readonly OracleAuthMode[] = [
  "wallet",
  "iam",
  "instance-principal",
];
const ORACLE_MODE_LIST: readonly string[] = ORACLE_MODES;

function asOracleAuth(v: unknown): OracleAuthConfig {
  const a = asRecord(v);
  const rawMode = a["mode"];
  const mode = ORACLE_MODES.find((m) => m === rawMode) ?? "wallet";
  const cfg: OracleAuthConfig = { mode };
  if (typeof a["secretKey"] === "string") cfg.secretKey = a["secretKey"];
  if (typeof a["region"] === "string") cfg.region = a["region"];
  if (typeof a["walletLocation"] === "string") cfg.walletLocation = a["walletLocation"];
  if (typeof a["connectString"] === "string") cfg.connectString = a["connectString"];
  return cfg;
}

/* ----------------------------- the registry ------------------------------- */

export const TARGET_ADAPTER_REGISTRY: ReadonlyArray<TargetAdapterRegistryEntry> = [
  {
    id: "azure-adf",
    displayName: "Azure Data Factory",
    family: "azure",
    authModes: AZURE_MODE_LIST,
    build: (ctx, cfg) => {
      const datasetByEntity = asStringRecord(cfg["datasetByEntity"]);
      return buildAzureAdfTarget(ctx, {
        auth: asAzureAuth(cfg["auth"]),
        dataFactoryName: asString(cfg["dataFactoryName"], "databridge"),
        ...(datasetByEntity ? { datasetByEntity } : {}),
      });
    },
  },
  {
    id: "azure-synapse",
    displayName: "Azure Synapse Analytics",
    family: "azure",
    authModes: AZURE_MODE_LIST,
    build: (ctx, cfg) =>
      buildAzureSynapseTarget(ctx, {
        auth: asAzureAuth(cfg["auth"]),
        stagingUrl: asString(cfg["stagingUrl"], "https://example.blob.core.windows.net/stage"),
        ...(typeof cfg["schema"] === "string" ? { schema: cfg["schema"] } : {}),
        ...(cfg["poolType"] === "serverless" || cfg["poolType"] === "dedicated"
          ? { poolType: cfg["poolType"] }
          : {}),
      }),
  },
  {
    id: "azure-sql",
    displayName: "Azure SQL Database",
    family: "azure",
    authModes: AZURE_MODE_LIST,
    build: (ctx, cfg) => {
      const mergeKeysByEntity = asStringArrayRecord(cfg["mergeKeysByEntity"]);
      return buildAzureSqlTarget(ctx, {
        auth: asAzureAuth(cfg["auth"]),
        database: asString(cfg["database"], "databridge"),
        ...(typeof cfg["schema"] === "string" ? { schema: cfg["schema"] } : {}),
        ...(mergeKeysByEntity ? { mergeKeysByEntity } : {}),
      });
    },
  },
  {
    id: "azure-fabric",
    displayName: "Microsoft Fabric (OneLake)",
    family: "azure",
    authModes: AZURE_MODE_LIST,
    build: (ctx, cfg) =>
      buildMicrosoftFabricTarget(ctx, {
        auth: asAzureAuth(cfg["auth"]),
        workspace: asString(cfg["workspace"], "databridge-ws"),
        lakehouse: asString(cfg["lakehouse"], "databridge_lh"),
        ...(typeof cfg["warehouse"] === "string" ? { warehouse: cfg["warehouse"] } : {}),
        ...(cfg["mode"] === "overwrite" || cfg["mode"] === "append" ? { mode: cfg["mode"] } : {}),
      }),
  },
  {
    id: "oracle-goldengate",
    displayName: "Oracle GoldenGate",
    family: "oracle",
    authModes: ORACLE_MODE_LIST,
    build: (ctx, cfg) =>
      buildOracleGoldenGateTarget(ctx, {
        auth: asOracleAuth(cfg["auth"]),
        ...(typeof cfg["replicatName"] === "string" ? { replicatName: cfg["replicatName"] } : {}),
        ...(typeof cfg["targetSchema"] === "string" ? { targetSchema: cfg["targetSchema"] } : {}),
        ...(typeof cfg["sourceSchema"] === "string" ? { sourceSchema: cfg["sourceSchema"] } : {}),
      }),
  },
  {
    id: "oracle-adw",
    displayName: "Oracle Autonomous Data Warehouse",
    family: "oracle",
    authModes: ORACLE_MODE_LIST,
    build: (ctx, cfg) => {
      const mergeKeysByEntity = asStringArrayRecord(cfg["mergeKeysByEntity"]);
      return buildOracleAdwTarget(ctx, {
        auth: asOracleAuth(cfg["auth"]),
        ...(typeof cfg["schema"] === "string" ? { schema: cfg["schema"] } : {}),
        ...(mergeKeysByEntity ? { mergeKeysByEntity } : {}),
      });
    },
  },
  {
    id: "oracle-oci-di",
    displayName: "Oracle OCI Data Integration",
    family: "oracle",
    authModes: ORACLE_MODE_LIST,
    build: (ctx, cfg) =>
      buildOracleOciDiTarget(ctx, {
        auth: asOracleAuth(cfg["auth"]),
        ...(typeof cfg["workspaceId"] === "string" ? { workspaceId: cfg["workspaceId"] } : {}),
        ...(typeof cfg["projectName"] === "string" ? { projectName: cfg["projectName"] } : {}),
        ...(typeof cfg["targetDataAssetKey"] === "string"
          ? { targetDataAssetKey: cfg["targetDataAssetKey"] }
          : {}),
      }),
  },
];

export function findTargetAdapter(
  id: string,
): TargetAdapterRegistryEntry | undefined {
  return TARGET_ADAPTER_REGISTRY.find((e) => e.id === id);
}

export function listTargetAdapters(): ReadonlyArray<
  Omit<TargetAdapterRegistryEntry, "build">
> {
  return TARGET_ADAPTER_REGISTRY.map(({ id, displayName, family, authModes }) => ({
    id,
    displayName,
    family,
    authModes,
  }));
}

/* --------------------------- land orchestration --------------------------- */

export interface LandRowInput {
  entity: string;
  data: SampledRow;
}

export interface LandEntityResult {
  entity: string;
  batchId: string;
  outcomes: RowOutcome[];
}

export interface LandSummary {
  authMode: string;
  mode: "live" | "stub";
  validation: { valid: number; invalid: number; errors: TargetValidationError[] };
  committed: number;
  failed: number;
  entities: LandEntityResult[];
  artifact: CloudArtifact;
}

/** Coerce an opaque record into the SampledRow value shape. */
export function coerceRow(record: Record<string, unknown>): SampledRow {
  const out: SampledRow = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = JSON.stringify(v);
  }
  return out;
}

/** Drive validate→stage→commit for a bundle, grouped by entity. */
export async function landWith(
  bundle: CloudTargetBundle,
  ctx: AdapterContext,
  rows: readonly LandRowInput[],
  opts: { migrationRunId: string; dryRun: boolean },
): Promise<LandSummary> {
  const groups = new Map<string, SampledRow[]>();
  const order: string[] = [];
  for (const r of rows) {
    let g = groups.get(r.entity);
    if (!g) {
      g = [];
      groups.set(r.entity, g);
      order.push(r.entity);
    }
    g.push(r.data);
  }

  let valid = 0;
  let invalid = 0;
  let committed = 0;
  let failed = 0;
  const errors: TargetValidationError[] = [];
  const entities: LandEntityResult[] = [];

  for (const entity of order) {
    const entRows = groups.get(entity) ?? [];
    const v = await bundle.adapter.validate(ctx, { entity, rows: entRows });
    valid += v.valid;
    invalid += v.invalid;
    errors.push(...v.errors);
    const staged = await bundle.adapter.stage(ctx, {
      migrationRunId: opts.migrationRunId,
      entity,
      rows: entRows,
      dryRun: opts.dryRun,
    });
    const c = await bundle.adapter.commit(ctx, {
      batchId: staged.batchId,
      approvedBy: "api",
      approvedAt: new Date(),
    });
    committed += c.committed;
    failed += c.failed;
    entities.push({ entity, batchId: staged.batchId, outcomes: c.outcomes });
  }

  return {
    authMode: bundle.authMode,
    mode: bundle.transport.mode,
    validation: { valid, invalid, errors },
    committed,
    failed,
    entities,
    artifact: bundle.renderArtifact(),
  };
}
