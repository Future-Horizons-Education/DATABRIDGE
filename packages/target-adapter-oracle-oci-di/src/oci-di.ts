/**
 * Oracle Cloud Infrastructure Data Integration target adapter (Phase C2).
 *
 * OCI-DI is an **artefact emitter**: the adapter buffers canonical rows and
 * {@link renderOciDiTasks} produces an OCI Data Integration task-definition
 * document (one integration task per entity) for import into a DI workspace.
 * Stub by default — no real workspace is touched.
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
  resolveOracleCredential,
  type OracleAuthConfig,
  type OracleTokenProvider,
} from "@databridge/oracle-auth";

export interface OracleOciDiConfig {
  auth: OracleAuthConfig;
  /** OCI Data Integration workspace OCID. */
  workspaceId?: string;
  /** DI project name. Defaults to "databridge". */
  projectName?: string;
  /** Target data-asset key referenced by each task. */
  targetDataAssetKey?: string;
}

const OCI_DI_CAPABILITIES: TargetAdapterCapabilities = {
  supportsRollback: false,
  supportsUpsert: false,
  supportsPartialUpdate: false,
  batchSizeLimit: 1_000_000,
};

export class OracleOciDiTargetAdapter extends ConfigurableTargetAdapter {
  constructor(
    transport: TargetTransport,
    opts: { requiredFieldsByEntity?: Record<string, readonly string[]> } = {},
  ) {
    const spec: ConfigurableTargetAdapterSpec = {
      id: "oracle-oci-di",
      displayName: "Oracle OCI Data Integration",
      capabilities: OCI_DI_CAPABILITIES,
    };
    if (opts.requiredFieldsByEntity) {
      spec.requiredFieldsByEntity = opts.requiredFieldsByEntity;
    }
    super(transport, spec);
  }
}

/** Render an OCI Data Integration task-definition document. */
export function renderOciDiTasks(
  cfg: OracleOciDiConfig,
  transport: BufferedTargetTransport,
): CloudArtifact {
  const project = cfg.projectName ?? "databridge";
  const dataAsset = cfg.targetDataAssetKey ?? "DATAASSET_ADW";
  const plan = {
    workspaceId: cfg.workspaceId ?? "ocid1.disworkspace.oc1..databridge",
    project,
    tasks: transport.entities().map((entity) => ({
      key: `task_${entity}`,
      modelType: "INTEGRATION_TASK",
      name: `load_${entity}`,
      source: { entity },
      target: { dataAsset, entity },
      rowCount: transport.rowsFor(entity).length,
    })),
  };
  return {
    kind: "oci-di-task",
    filename: `${project}_tasks.json`,
    contentType: "application/json",
    body: JSON.stringify(plan, null, 2),
  };
}

export interface BuildOracleOciDiOptions {
  sink?: CloudSink;
  tokenProvider?: OracleTokenProvider;
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export async function buildOracleOciDiTarget(
  ctx: AdapterContext,
  cfg: OracleOciDiConfig,
  opts: BuildOracleOciDiOptions = {},
): Promise<CloudTargetBundle> {
  const credential = await resolveOracleCredential(
    ctx,
    cfg.auth,
    opts.tokenProvider ? { tokenProvider: opts.tokenProvider } : {},
  );
  const transport = new BufferedTargetTransport(
    opts.sink ? { idPrefix: "ocidi", sink: opts.sink } : { idPrefix: "ocidi" },
  );
  const adapter = new OracleOciDiTargetAdapter(
    transport,
    opts.requiredFieldsByEntity
      ? { requiredFieldsByEntity: opts.requiredFieldsByEntity }
      : {},
  );
  return {
    adapter,
    transport,
    authMode: credential ? credential.mode : "stub",
    renderArtifact: () => renderOciDiTasks(cfg, transport),
  };
}
