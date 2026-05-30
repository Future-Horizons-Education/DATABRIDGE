/**
 * Oracle GoldenGate target adapter (Phase C2).
 *
 * GoldenGate is an **artefact emitter**: the adapter buffers canonical rows
 * and {@link renderGoldenGateParams} produces a deployable replicat
 * parameter file (one MAP per entity) for CDC into ADW or on-prem Oracle.
 * Stub by default — no real GoldenGate instance is touched.
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
  resolveOracleCredential,
  type OracleAuthConfig,
  type OracleTokenProvider,
} from "@databridge/oracle-auth";

export interface OracleGoldenGateConfig {
  auth: OracleAuthConfig;
  /** Replicat group name. Defaults to "DBRIDGE". */
  replicatName?: string;
  /** Target schema for the MAP statements. Defaults to "ADW". */
  targetSchema?: string;
  /** Source (canonical) schema. Defaults to "CANONICAL". */
  sourceSchema?: string;
}

const GG_CAPABILITIES: TargetAdapterCapabilities = {
  supportsRollback: false,
  supportsUpsert: true,
  supportsPartialUpdate: false,
  batchSizeLimit: 1_000_000,
};

export class OracleGoldenGateTargetAdapter extends ConfigurableTargetAdapter {
  constructor(
    transport: TargetTransport,
    opts: { requiredFieldsByEntity?: Record<string, readonly string[]> } = {}
  ) {
    const spec: ConfigurableTargetAdapterSpec = {
      id: "oracle-goldengate",
      displayName: "Oracle GoldenGate",
      capabilities: GG_CAPABILITIES,
    };
    if (opts.requiredFieldsByEntity) {
      spec.requiredFieldsByEntity = opts.requiredFieldsByEntity;
    }
    super(transport, spec);
  }
}

/** Render a GoldenGate replicat parameter file (.prm). */
export function renderGoldenGateParams(
  cfg: OracleGoldenGateConfig,
  transport: BufferedTargetTransport
): CloudArtifact {
  const replicat = cfg.replicatName ?? "DBRIDGE";
  const targetSchema = cfg.targetSchema ?? "ADW";
  const sourceSchema = cfg.sourceSchema ?? "CANONICAL";
  const lines = [
    "-- databridge → Oracle GoldenGate replicat parameter file",
    `REPLICAT ${replicat}`,
    `USERIDALIAS ${replicat.toLowerCase()}_alias`,
    "DBOPTIONS DEFERREFCONST",
    "HANDLECOLLISIONS",
  ];
  for (const entity of transport.entities()) {
    const rows = transport.rowsFor(entity).length;
    const e = entity.toUpperCase();
    lines.push(`MAP ${sourceSchema}.${e}, TARGET ${targetSchema}.${e}; -- ${rows} row(s)`);
  }
  return {
    kind: "gg-replicat-param",
    filename: `${replicat.toLowerCase()}.prm`,
    contentType: "text/plain",
    body: lines.join("\n") + "\n",
  };
}

export interface BuildOracleGoldenGateOptions {
  sink?: CloudSink;
  tokenProvider?: OracleTokenProvider;
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export async function buildOracleGoldenGateTarget(
  ctx: AdapterContext,
  cfg: OracleGoldenGateConfig,
  opts: BuildOracleGoldenGateOptions = {}
): Promise<CloudTargetBundle> {
  const credential = await resolveOracleCredential(
    ctx,
    cfg.auth,
    opts.tokenProvider ? { tokenProvider: opts.tokenProvider } : {}
  );
  const transport = new BufferedTargetTransport(
    opts.sink ? { idPrefix: "gg", sink: opts.sink } : { idPrefix: "gg" }
  );
  const adapter = new OracleGoldenGateTargetAdapter(
    transport,
    opts.requiredFieldsByEntity ? { requiredFieldsByEntity: opts.requiredFieldsByEntity } : {}
  );
  return {
    adapter,
    transport,
    authMode: credential ? credential.mode : "stub",
    renderArtifact: () => renderGoldenGateParams(cfg, transport),
  };
}
