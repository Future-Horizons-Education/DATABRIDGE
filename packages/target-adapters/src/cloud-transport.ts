/**
 * BufferedTargetTransport — a {@link TargetTransport} that records every
 * write in insertion order. Cloud target adapters (Phase C) use it two ways:
 *
 *   - **Artefact emitters** (ADF / GoldenGate / OCI Data Integration) buffer
 *     rows and then render a deployable artefact (pipeline JSON, GG trail,
 *     task definition) from {@link BufferedTargetTransport.collected}.
 *   - **Loaders** (Synapse / Azure SQL / Fabric / ADW) pass a `sink` that
 *     performs the real load through a lazily-loaded cloud SDK client. With
 *     no `sink` the transport runs in deterministic **stub mode** — nothing
 *     touches a real tenant, so contract tests and the demo stay hermetic.
 *
 * This mirrors the source-adapter stub-fallback pattern (`tryBuildClient`
 * returns undefined → deterministic stub) at the write-side seam.
 */
import type { SampledRow, TargetAdapter } from "@databridge/adapter-spec";
import type { TargetTransport } from "./transport.js";

/**
 * A rendered, deployable artefact produced by an artefact-emitting cloud
 * target (ADF pipeline JSON, GoldenGate trail, OCI-DI task definition).
 */
export interface CloudArtifact {
  /** Stable kind discriminator, e.g. "adf-pipeline" | "gg-trail" | "oci-di-task". */
  kind: string;
  /** Suggested filename for the operator to deploy. */
  filename: string;
  /** MIME type of {@link CloudArtifact.body}. */
  contentType: string;
  /** The artefact payload. */
  body: string;
}

/**
 * Uniform bundle returned by every cloud-target factory: the lifecycle
 * adapter, the buffering transport behind it, and an artefact renderer the
 * API layer can call after commit to surface the deployable output.
 */
export interface CloudTargetBundle {
  adapter: TargetAdapter;
  transport: BufferedTargetTransport;
  /** Resolved auth mode (e.g. "service-principal"), or "stub" when none. */
  authMode: string;
  renderArtifact(): CloudArtifact;
}

export interface BufferedWrite {
  entity: string;
  /** Monotonic write sequence across all entities (preserved order). */
  seq: number;
  /** Surrogate id (sink-provided when live, synthetic when stub). */
  targetId: string;
  row: SampledRow;
}

/**
 * Live sink: invoked once per row when the transport is in live mode. May
 * return a backend-assigned id; when it returns void the synthetic id stands.
 */
export type CloudSink = (
  entity: string,
  row: SampledRow,
  seq: number,
) => Promise<string | void>;

export interface BufferedTargetTransportOptions {
  /** Prefix for synthetic surrogate ids. Defaults to "row". */
  idPrefix?: string;
  /** When present the transport is in live mode and forwards each write. */
  sink?: CloudSink;
}

export class BufferedTargetTransport implements TargetTransport {
  private seq = 0;
  private readonly writes: BufferedWrite[] = [];
  private readonly byId = new Map<string, BufferedWrite>();
  private readonly idPrefix: string;
  private readonly sink: CloudSink | undefined;

  constructor(opts: BufferedTargetTransportOptions = {}) {
    this.idPrefix = opts.idPrefix ?? "row";
    this.sink = opts.sink;
  }

  /** "live" when a sink is wired, otherwise deterministic "stub". */
  get mode(): "live" | "stub" {
    return this.sink ? "live" : "stub";
  }

  async write(entity: string, row: SampledRow): Promise<string> {
    const seq = this.seq++;
    let targetId = `${this.idPrefix}-${entity}-${seq}`;
    if (this.sink) {
      const sunk = await this.sink(entity, row, seq);
      if (typeof sunk === "string" && sunk.length > 0) targetId = sunk;
    }
    const w: BufferedWrite = { entity, seq, targetId, row: { ...row } };
    this.writes.push(w);
    this.byId.set(targetId, w);
    return targetId;
  }

  async remove(_entity: string, targetId: string): Promise<void> {
    const w = this.byId.get(targetId);
    if (!w) return;
    this.byId.delete(targetId);
    const i = this.writes.indexOf(w);
    if (i >= 0) this.writes.splice(i, 1);
  }

  /** All buffered writes, in insertion order. */
  collected(): readonly BufferedWrite[] {
    return this.writes;
  }

  /** Buffered rows for a single entity, in insertion order. */
  rowsFor(entity: string): readonly SampledRow[] {
    return this.writes.filter((w) => w.entity === entity).map((w) => w.row);
  }

  /** Distinct entities, in first-seen order. */
  entities(): readonly string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of this.writes) {
      if (!seen.has(w.entity)) {
        seen.add(w.entity);
        out.push(w.entity);
      }
    }
    return out;
  }

  /** Total buffered rows. */
  get size(): number {
    return this.writes.length;
  }
}
