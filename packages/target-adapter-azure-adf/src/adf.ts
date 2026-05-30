/**
 * Azure Data Factory target adapter (Phase C1).
 *
 * ADF is an **artefact emitter**: the adapter buffers canonical rows through
 * the shared {@link BufferedTargetTransport} and {@link renderAdfPipeline}
 * produces a deployable pipeline JSON (one Copy activity per entity). Live
 * execution via the ADF management API is out of scope for this phase — a
 * bearer token is resolved through `@databridge/azure-auth`, and when no
 * credential is available the adapter runs in deterministic stub mode.
 */
import type { AdapterContext, TargetAdapterCapabilities } from "@databridge/adapter-spec";
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

export interface AzureAdfConfig {
  auth: AzureAuthConfig;
  /** Target Data Factory name (embedded in the emitted pipeline). */
  dataFactoryName: string;
  /** Optional sink dataset name per entity (defaults to the entity name). */
  datasetByEntity?: Record<string, string>;
}

const ADF_CAPABILITIES: TargetAdapterCapabilities = {
  supportsRollback: false,
  supportsUpsert: true,
  supportsPartialUpdate: false,
  batchSizeLimit: 10000,
};

export class AzureAdfTargetAdapter extends ConfigurableTargetAdapter {
  constructor(
    transport: TargetTransport,
    opts: { requiredFieldsByEntity?: Record<string, readonly string[]> } = {}
  ) {
    const spec: ConfigurableTargetAdapterSpec = {
      id: "azure-adf",
      displayName: "Azure Data Factory",
      capabilities: ADF_CAPABILITIES,
    };
    if (opts.requiredFieldsByEntity) {
      spec.requiredFieldsByEntity = opts.requiredFieldsByEntity;
    }
    super(transport, spec);
  }
}

/** Render a deployable ADF pipeline JSON from the buffered rows. */
export function renderAdfPipeline(
  cfg: AzureAdfConfig,
  transport: BufferedTargetTransport
): CloudArtifact {
  const activities = transport.entities().map((entity) => ({
    name: `Copy_${entity}`,
    type: "Copy",
    typeProperties: {
      source: { type: "JsonSource" },
      sink: {
        type: "AzureSqlSink",
        writeBehavior: "upsert",
        tableOption: "autoCreate",
      },
    },
    inputs: [{ referenceName: `databridge_src_${entity}`, type: "DatasetReference" }],
    outputs: [
      {
        referenceName: cfg.datasetByEntity?.[entity] ?? entity,
        type: "DatasetReference",
      },
    ],
  }));
  const pipeline = {
    name: `databridge_land_${cfg.dataFactoryName}`,
    properties: {
      activities,
      annotations: ["databridge", "phase-c"],
    },
  };
  return {
    kind: "adf-pipeline",
    filename: `${cfg.dataFactoryName}.pipeline.json`,
    contentType: "application/json",
    body: JSON.stringify(pipeline, null, 2),
  };
}

export interface BuildAzureAdfOptions {
  /** Live write sink; omit for deterministic stub mode. */
  sink?: CloudSink;
  /** Test seam for credential resolution. */
  tokenProvider?: AzureTokenProvider;
  /** Per-entity required fields enforced by validate(). */
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export async function buildAzureAdfTarget(
  ctx: AdapterContext,
  cfg: AzureAdfConfig,
  opts: BuildAzureAdfOptions = {}
): Promise<CloudTargetBundle> {
  const credential = await resolveAzureCredential(
    ctx,
    cfg.auth,
    opts.tokenProvider ? { tokenProvider: opts.tokenProvider } : {}
  );
  const transport = new BufferedTargetTransport(
    opts.sink ? { idPrefix: "adf", sink: opts.sink } : { idPrefix: "adf" }
  );
  const adapter = new AzureAdfTargetAdapter(
    transport,
    opts.requiredFieldsByEntity ? { requiredFieldsByEntity: opts.requiredFieldsByEntity } : {}
  );
  return {
    adapter,
    transport,
    authMode: credential ? credential.mode : "stub",
    renderArtifact: () => renderAdfPipeline(cfg, transport),
  };
}
