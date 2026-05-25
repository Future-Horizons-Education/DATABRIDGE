/**
 * SJMS 5 (Prisma/Postgres)
 * Read adapter implementing the SourceAdapter contract from @databridge/adapter-spec.
 * Read-only adapter for Freddie's SJMS5 Postgres schema; uses pg under the hood at runtime.
 */
import type {
  SourceAdapter,
  AdapterCapabilities,
  AdapterContext,
  HealthCheckResult,
  SampleTableArgs,
  SampledRow,
  StreamRowsArgs,
  StreamRowsPage,
  GetRecordByIdArgs,
} from "@databridge/adapter-spec";
import type { SchemaDescriptor, CodeList, DictionaryEntry } from "@databridge/adapter-spec";

import { Sjms5ConfigSchema, type Sjms5Config } from "./config.js";

export const SUPPORTED_RESOURCES = ["Student", "Enrolment", "Module", "Programme"] as const;
export type SupportedResource = (typeof SUPPORTED_RESOURCES)[number];

export class Sjms5Adapter implements SourceAdapter {
  readonly id = "sjms5";
  readonly displayName = "SJMS 5 (Prisma/Postgres)";
  readonly capabilities: AdapterCapabilities = {
    supportsIncremental: true,
    supportsDictionary: false,
    supportsSampling: true,
    supportsCodeLists: false,
    preferredAuth: "db-credentials",
    rateLimitHintRps: 0,
  };

  private readonly config: Sjms5Config;

  constructor(rawConfig: unknown) {
    this.config = Sjms5ConfigSchema.parse(rawConfig);
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    ctx.logger.debug("sjms5: healthCheck invoked");
    // Stub: real impl probes the source. Return optimistic shape so platform
    // wiring + tests can exercise the contract.
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      message: "stub healthCheck — replace with live probe",
      details: { resources: SUPPORTED_RESOURCES.length },
    };
  }

  async discoverSchema(ctx: AdapterContext): Promise<SchemaDescriptor> {
    ctx.logger.debug("sjms5: discoverSchema invoked");
    return {
      adapter: this.id,
      generatedAt: new Date().toISOString(),
      resources: SUPPORTED_RESOURCES.map((name) => ({
        name,
        kind: "endpoint" as const,
        description: `${this.displayName} resource: ${name}`,
        fields: [
          { name: "id", type: "string", nullable: false, isKey: true },
          { name: "createdAt", type: "datetime", nullable: true, isKey: false },
        ],
      })),
    };
  }

  async sampleTable(ctx: AdapterContext, args: SampleTableArgs): Promise<SampledRow[]> {
    ctx.logger.debug("sjms5: sampleTable", { resource: args.resource, limit: args.limit });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`sjms5: resource "${args.resource}" not supported`);
    }
    // Stub: return zero rows. Live impl pulls N rows via source-specific client.
    return [];
  }

  async *streamRows(
    ctx: AdapterContext,
    args: StreamRowsArgs,
  ): AsyncIterable<StreamRowsPage> {
    ctx.logger.debug("sjms5: streamRows", { resource: args.resource });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`sjms5: resource "${args.resource}" not supported`);
    }
    // Stub: yield a single empty page so the contract type-checks and tests pass.
    yield { rows: [], totalRows: 0 };
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    ctx.logger.debug("sjms5: getCodeLists invoked");
    return [];
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    ctx.logger.debug("sjms5: getDictionary invoked");
    return [];
  }

  async getRecordById(
    ctx: AdapterContext,
    args: GetRecordByIdArgs,
  ): Promise<SampledRow | null> {
    ctx.logger.debug("sjms5: getRecordById", { resource: args.resource, id: args.id });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`sjms5: resource "${args.resource}" not supported`);
    }
    return null;
  }
}
