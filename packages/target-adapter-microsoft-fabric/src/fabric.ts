/**
 * Microsoft Fabric target adapter (Phase C1).
 *
 * Lands canonical rows into a OneLake Lakehouse (Delta tables) — optionally
 * surfaced to a Warehouse. Buffers rows through the shared
 * {@link BufferedTargetTransport}; {@link renderFabricLoadPlan} emits a
 * OneLake load-plan JSON (one Delta table per entity). Stub by default.
 */
import type {
  AdapterContext,
  TargetAdapterCapabilities,
} from "@databridge/adapter-spec";
import {
  BufferedTargetTransport,
  ConfigurableTargetAdapter,
  type CloudArtifact,
  type CloudSink,
  type CloudTargetBundle,
  type ConfigurableTargetAdapterSpec,
  type TargetTransport,
} from "@databridge/target-adapters";
import {
  resolveAzureCredential,
  type AzureAuthConfig,
  type AzureTokenProvider,
} from "@databridge/azure-auth";

export type FabricLoadMode = "append" | "overwrite";

export interface MicrosoftFabricConfig {
  auth: AzureAuthConfig;
  /** Fabric workspace (capacity) name. */
  workspace: string;
  /** Target Lakehouse name. */
  lakehouse: string;
  /** Optional Warehouse to surface SQL views into. */
  warehouse?: string;
  /** Delta write mode. Defaults to "append". */
  mode?: FabricLoadMode;
}

const FABRIC_CAPABILITIES: TargetAdapterCapabilities = {
  supportsRollback: false,
  supportsUpsert: true,
  supportsPartialUpdate: false,
  batchSizeLimit: 1_000_000,
};

export class MicrosoftFabricTargetAdapter extends ConfigurableTargetAdapter {
  constructor(
    transport: TargetTransport,
    opts: { requiredFieldsByEntity?: Record<string, readonly string[]> } = {},
  ) {
    const spec: ConfigurableTargetAdapterSpec = {
      id: "azure-fabric",
      displayName: "Microsoft Fabric (OneLake)",
      capabilities: FABRIC_CAPABILITIES,
    };
    if (opts.requiredFieldsByEntity) {
      spec.requiredFieldsByEntity = opts.requiredFieldsByEntity;
    }
    super(transport, spec);
  }
}

/** Render a OneLake load plan (one Delta table per entity). */
export function renderFabricLoadPlan(
  cfg: MicrosoftFabricConfig,
  transport: BufferedTargetTransport,
): CloudArtifact {
  const plan = {
    workspace: cfg.workspace,
    lakehouse: cfg.lakehouse,
    ...(cfg.warehouse !== undefined ? { warehouse: cfg.warehouse } : {}),
    loadMode: cfg.mode ?? "append",
    tables: transport.entities().map((entity) => ({
      entity,
      path: `Tables/${entity}`,
      format: "delta",
      rowCount: transport.rowsFor(entity).length,
    })),
  };
  return {
    kind: "fabric-onelake-load",
    filename: `${cfg.lakehouse}_onelake_load.json`,
    contentType: "application/json",
    body: JSON.stringify(plan, null, 2),
  };
}

export interface BuildMicrosoftFabricOptions {
  sink?: CloudSink;
  tokenProvider?: AzureTokenProvider;
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export async function buildMicrosoftFabricTarget(
  ctx: AdapterContext,
  cfg: MicrosoftFabricConfig,
  opts: BuildMicrosoftFabricOptions = {},
): Promise<CloudTargetBundle> {
  const credential = await resolveAzureCredential(
    ctx,
    cfg.auth,
    opts.tokenProvider ? { tokenProvider: opts.tokenProvider } : {},
  );
  const transport = new BufferedTargetTransport(
    opts.sink ? { idPrefix: "fabric", sink: opts.sink } : { idPrefix: "fabric" },
  );
  const adapter = new MicrosoftFabricTargetAdapter(
    transport,
    opts.requiredFieldsByEntity
      ? { requiredFieldsByEntity: opts.requiredFieldsByEntity }
      : {},
  );
  return {
    adapter,
    transport,
    authMode: credential ? credential.mode : "stub",
    renderArtifact: () => renderFabricLoadPlan(cfg, transport),
  };
}
