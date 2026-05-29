/**
 * Azure Synapse Analytics target adapter (Phase C1).
 *
 * Lands canonical rows via `COPY INTO` from a staging blob/ADLS container,
 * supporting both dedicated and serverless SQL pools. The adapter buffers
 * rows through the shared {@link BufferedTargetTransport}; a live `sink`
 * performs the real load, and {@link renderSynapseCopyInto} emits the
 * deployable COPY INTO script. Stub by default — no real pool is touched.
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

export type SynapsePoolType = "dedicated" | "serverless";

export interface AzureSynapseConfig {
  auth: AzureAuthConfig;
  /** Base staging URL (blob/ADLS) holding per-entity folders. */
  stagingUrl: string;
  /** Target SQL schema. Defaults to "dbo". */
  schema?: string;
  /** Pool type — affects the emitted COPY hints. Defaults to "dedicated". */
  poolType?: SynapsePoolType;
  /** Staged file type. Defaults to "PARQUET". */
  fileType?: string;
}

const SYNAPSE_CAPABILITIES: TargetAdapterCapabilities = {
  supportsRollback: false,
  supportsUpsert: false,
  supportsPartialUpdate: false,
  batchSizeLimit: 1_000_000,
};

export class AzureSynapseTargetAdapter extends ConfigurableTargetAdapter {
  constructor(
    transport: TargetTransport,
    opts: { requiredFieldsByEntity?: Record<string, readonly string[]> } = {},
  ) {
    const spec: ConfigurableTargetAdapterSpec = {
      id: "azure-synapse",
      displayName: "Azure Synapse Analytics",
      capabilities: SYNAPSE_CAPABILITIES,
    };
    if (opts.requiredFieldsByEntity) {
      spec.requiredFieldsByEntity = opts.requiredFieldsByEntity;
    }
    super(transport, spec);
  }
}

function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/** Render a COPY INTO script (one statement per entity). */
export function renderSynapseCopyInto(
  cfg: AzureSynapseConfig,
  transport: BufferedTargetTransport,
): CloudArtifact {
  const schema = cfg.schema ?? "dbo";
  const fileType = cfg.fileType ?? "PARQUET";
  const base = trimTrailingSlash(cfg.stagingUrl);
  const poolType = cfg.poolType ?? "dedicated";
  const serverless = poolType === "serverless";
  const statements = transport.entities().map((entity) => {
    const lines = [
      `COPY INTO [${schema}].[${entity}]`,
      `FROM '${base}/${entity}/'`,
      `WITH (`,
      `  FILE_TYPE = '${fileType}',`,
      `  CREDENTIAL = (IDENTITY = 'Managed Identity')${serverless ? "" : ","}`,
    ];
    if (!serverless) lines.push(`  AUTO_CREATE_TABLE = 'ON'`);
    lines.push(`);`);
    return lines.join("\n");
  });
  const header = `-- databridge land → Synapse (${poolType} pool)\n`;
  return {
    kind: "synapse-copy-into",
    filename: `${schema}_copy_into.sql`,
    contentType: "application/sql",
    body: header + statements.join("\n\n") + "\n",
  };
}

export interface BuildAzureSynapseOptions {
  sink?: CloudSink;
  tokenProvider?: AzureTokenProvider;
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export async function buildAzureSynapseTarget(
  ctx: AdapterContext,
  cfg: AzureSynapseConfig,
  opts: BuildAzureSynapseOptions = {},
): Promise<CloudTargetBundle> {
  const credential = await resolveAzureCredential(
    ctx,
    cfg.auth,
    opts.tokenProvider ? { tokenProvider: opts.tokenProvider } : {},
  );
  const transport = new BufferedTargetTransport(
    opts.sink ? { idPrefix: "synapse", sink: opts.sink } : { idPrefix: "synapse" },
  );
  const adapter = new AzureSynapseTargetAdapter(
    transport,
    opts.requiredFieldsByEntity
      ? { requiredFieldsByEntity: opts.requiredFieldsByEntity }
      : {},
  );
  return {
    adapter,
    transport,
    authMode: credential ? credential.mode : "stub",
    renderArtifact: () => renderSynapseCopyInto(cfg, transport),
  };
}
