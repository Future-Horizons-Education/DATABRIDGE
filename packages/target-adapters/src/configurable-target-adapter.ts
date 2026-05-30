/**
 * ConfigurableTargetAdapter — a {@link BaseTargetAdapter} whose identity,
 * capabilities, and per-entity required fields are supplied at construction
 * rather than hard-coded. Phase C cloud target adapters (Azure / Oracle
 * families) extend this with a fixed spec so each package stays thin while
 * the validate→stage→commit→rollback lifecycle remains shared.
 */
import type { TargetAdapterCapabilities } from "@databridge/adapter-spec";
import { BaseTargetAdapter } from "./base-target-adapter.js";
import type { TargetTransport } from "./transport.js";

export interface ConfigurableTargetAdapterSpec {
  id: string;
  displayName: string;
  capabilities: TargetAdapterCapabilities;
  /** Per-entity must-be-non-null fields enforced by validate(). */
  requiredFieldsByEntity?: Record<string, readonly string[]>;
}

export class ConfigurableTargetAdapter extends BaseTargetAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: TargetAdapterCapabilities;
  private readonly requiredByEntity: Record<string, readonly string[]>;

  constructor(transport: TargetTransport, spec: ConfigurableTargetAdapterSpec) {
    super(transport);
    this.id = spec.id;
    this.displayName = spec.displayName;
    this.capabilities = spec.capabilities;
    this.requiredByEntity = spec.requiredFieldsByEntity ?? {};
  }

  protected requiredFields(entity: string): readonly string[] {
    return this.requiredByEntity[entity] ?? [];
  }
}
