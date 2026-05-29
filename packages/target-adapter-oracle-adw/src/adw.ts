/**
 * Oracle Autonomous Data Warehouse target adapter (Phase C2).
 *
 * Direct loader over a wallet-based connection. Buffers canonical rows
 * through the shared {@link BufferedTargetTransport}; {@link renderAdwLoad}
 * emits a deployable Oracle load script (MERGE when keys are configured,
 * otherwise INSERT). Stub by default — no real ADW instance is touched.
 */
import type {
  AdapterContext,
  SampledRow,
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

export interface OracleAdwConfig {
  auth: OracleAuthConfig;
  /** Target schema. Defaults to "ADMIN". */
  schema?: string;
  /** Merge key columns per entity; when absent the load is an INSERT. */
  mergeKeysByEntity?: Record<string, readonly string[]>;
}

const ADW_CAPABILITIES: TargetAdapterCapabilities = {
  supportsRollback: false,
  supportsUpsert: true,
  supportsPartialUpdate: true,
  batchSizeLimit: 50000,
};

export class OracleAdwTargetAdapter extends ConfigurableTargetAdapter {
  constructor(
    transport: TargetTransport,
    opts: { requiredFieldsByEntity?: Record<string, readonly string[]> } = {}
  ) {
    const spec: ConfigurableTargetAdapterSpec = {
      id: "oracle-adw",
      displayName: "Oracle Autonomous Data Warehouse",
      capabilities: ADW_CAPABILITIES,
    };
    if (opts.requiredFieldsByEntity) {
      spec.requiredFieldsByEntity = opts.requiredFieldsByEntity;
    }
    super(transport, spec);
  }
}

/** Distinct UPPER-CASE column names across rows, in first-seen order. */
function columnsFor(rows: readonly SampledRow[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      const u = k.toUpperCase();
      if (!seen.has(u)) {
        seen.add(u);
        cols.push(u);
      }
    }
  }
  return cols;
}

/** Render an Oracle ADW load script (MERGE/INSERT per entity). */
export function renderAdwLoad(
  cfg: OracleAdwConfig,
  transport: BufferedTargetTransport
): CloudArtifact {
  const schema = cfg.schema ?? "ADMIN";
  const blocks = transport.entities().map((entity) => {
    const e = entity.toUpperCase();
    const cols = columnsFor(transport.rowsFor(entity));
    const colList = cols.join(", ");
    const keys = (cfg.mergeKeysByEntity?.[entity] ?? []).map((k) => k.toUpperCase());
    if (keys.length > 0) {
      const on = keys.map((k) => `tgt.${k} = src.${k}`).join(" AND ");
      const nonKey = cols.filter((c) => !keys.includes(c));
      const insertVals = cols.map((c) => `src.${c}`).join(", ");
      const matched =
        nonKey.length > 0
          ? `WHEN MATCHED THEN UPDATE SET ${nonKey.map((c) => `tgt.${c} = src.${c}`).join(", ")}\n`
          : "";
      return [
        `MERGE INTO ${schema}.${e} tgt`,
        `USING (SELECT * FROM TABLE(:rows_${entity})) src`,
        `ON (${on})`,
        `${matched}WHEN NOT MATCHED THEN INSERT (${colList}) VALUES (${insertVals});`,
      ].join("\n");
    }
    return `INSERT INTO ${schema}.${e} (${colList})\nSELECT ${colList} FROM TABLE(:rows_${entity});`;
  });
  const header = `-- databridge land → Oracle Autonomous Data Warehouse [${schema}]\n`;
  return {
    kind: "adw-load-sql",
    filename: `${schema.toLowerCase()}_adw_load.sql`,
    contentType: "application/sql",
    body: header + blocks.join("\n\n") + "\n",
  };
}

export interface BuildOracleAdwOptions {
  sink?: CloudSink;
  tokenProvider?: OracleTokenProvider;
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export async function buildOracleAdwTarget(
  ctx: AdapterContext,
  cfg: OracleAdwConfig,
  opts: BuildOracleAdwOptions = {}
): Promise<CloudTargetBundle> {
  const credential = await resolveOracleCredential(
    ctx,
    cfg.auth,
    opts.tokenProvider ? { tokenProvider: opts.tokenProvider } : {}
  );
  const transport = new BufferedTargetTransport(
    opts.sink ? { idPrefix: "adw", sink: opts.sink } : { idPrefix: "adw" }
  );
  const adapter = new OracleAdwTargetAdapter(
    transport,
    opts.requiredFieldsByEntity ? { requiredFieldsByEntity: opts.requiredFieldsByEntity } : {}
  );
  return {
    adapter,
    transport,
    authMode: credential ? credential.mode : "stub",
    renderArtifact: () => renderAdwLoad(cfg, transport),
  };
}
