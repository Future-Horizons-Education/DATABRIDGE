/**
 * Azure SQL Database target adapter (Phase C1).
 *
 * Direct loader for smaller universities. Buffers canonical rows through the
 * shared {@link BufferedTargetTransport}; {@link renderAzureSqlLoad} emits a
 * deployable T-SQL load script using table-valued parameters — a MERGE when
 * merge keys are configured, otherwise an INSERT. Stub by default.
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
  resolveAzureCredential,
  type AzureAuthConfig,
  type AzureTokenProvider,
} from "@databridge/azure-auth";

export interface AzureSqlConfig {
  auth: AzureAuthConfig;
  /** Target database name (embedded in the script header + filename). */
  database: string;
  /** Target SQL schema. Defaults to "dbo". */
  schema?: string;
  /** Merge key columns per entity; when absent the load is an INSERT. */
  mergeKeysByEntity?: Record<string, readonly string[]>;
}

const AZURE_SQL_CAPABILITIES: TargetAdapterCapabilities = {
  supportsRollback: false,
  supportsUpsert: true,
  supportsPartialUpdate: true,
  batchSizeLimit: 10000,
};

export class AzureSqlTargetAdapter extends ConfigurableTargetAdapter {
  constructor(
    transport: TargetTransport,
    opts: { requiredFieldsByEntity?: Record<string, readonly string[]> } = {},
  ) {
    const spec: ConfigurableTargetAdapterSpec = {
      id: "azure-sql",
      displayName: "Azure SQL Database",
      capabilities: AZURE_SQL_CAPABILITIES,
    };
    if (opts.requiredFieldsByEntity) {
      spec.requiredFieldsByEntity = opts.requiredFieldsByEntity;
    }
    super(transport, spec);
  }
}

/** Distinct column names across rows, in first-seen order. */
function columnsFor(rows: readonly SampledRow[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

/** Render a T-SQL load script (TVP MERGE/INSERT per entity). */
export function renderAzureSqlLoad(
  cfg: AzureSqlConfig,
  transport: BufferedTargetTransport,
): CloudArtifact {
  const schema = cfg.schema ?? "dbo";
  const blocks = transport.entities().map((entity) => {
    const cols = columnsFor(transport.rowsFor(entity));
    const keys = cfg.mergeKeysByEntity?.[entity] ?? [];
    const colList = cols.map((c) => `[${c}]`).join(", ");
    if (keys.length > 0) {
      const on = keys.map((k) => `tgt.[${k}] = src.[${k}]`).join(" AND ");
      const nonKey = cols.filter((c) => !keys.includes(c));
      const insertVals = cols.map((c) => `src.[${c}]`).join(", ");
      const matched =
        nonKey.length > 0
          ? `WHEN MATCHED THEN UPDATE SET ${nonKey.map((c) => `tgt.[${c}] = src.[${c}]`).join(", ")}\n`
          : "";
      return [
        `MERGE [${schema}].[${entity}] AS tgt`,
        `USING @rows_${entity} AS src`,
        `ON (${on})`,
        `${matched}WHEN NOT MATCHED THEN INSERT (${colList}) VALUES (${insertVals});`,
      ].join("\n");
    }
    return `INSERT INTO [${schema}].[${entity}] (${colList})\nSELECT ${colList} FROM @rows_${entity};`;
  });
  const header = `-- databridge land → Azure SQL [${cfg.database}] (table-valued parameters)\n`;
  return {
    kind: "azure-sql-load",
    filename: `${cfg.database}_load.sql`,
    contentType: "application/sql",
    body: header + blocks.join("\n\n") + "\n",
  };
}

export interface BuildAzureSqlOptions {
  sink?: CloudSink;
  tokenProvider?: AzureTokenProvider;
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export async function buildAzureSqlTarget(
  ctx: AdapterContext,
  cfg: AzureSqlConfig,
  opts: BuildAzureSqlOptions = {},
): Promise<CloudTargetBundle> {
  const credential = await resolveAzureCredential(
    ctx,
    cfg.auth,
    opts.tokenProvider ? { tokenProvider: opts.tokenProvider } : {},
  );
  const transport = new BufferedTargetTransport(
    opts.sink ? { idPrefix: "azsql", sink: opts.sink } : { idPrefix: "azsql" },
  );
  const adapter = new AzureSqlTargetAdapter(
    transport,
    opts.requiredFieldsByEntity
      ? { requiredFieldsByEntity: opts.requiredFieldsByEntity }
      : {},
  );
  return {
    adapter,
    transport,
    authMode: credential ? credential.mode : "stub",
    renderArtifact: () => renderAzureSqlLoad(cfg, transport),
  };
}
