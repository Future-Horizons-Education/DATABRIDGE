/**
 * Audit progress emitter — in-process pub/sub keyed by auditId.
 *
 * The runner publishes status transitions ({queued, running, succeeded,
 * failed, cancelled}); the SSE endpoint subscribes per audit and forwards
 * events to the connected client until the audit reaches a terminal state.
 *
 * Scope (F3): status transitions only. Future work could thread row-level
 * progress into the engine and publish AuditEngineEvent payloads here too;
 * the emitter shape is deliberately generic enough to carry whatever JSON
 * payload the runner cares to push.
 *
 * This is intentionally process-local. Multi-node deployments would need a
 * Redis pubsub or Postgres LISTEN/NOTIFY backplane — layer that on later if
 * scale demands it.
 */
import { EventEmitter } from "node:events";
import type { AuditStatus } from "./audit-store.js";

export interface AuditProgressEvent {
  auditId: string;
  /** Wall-clock ISO timestamp. */
  ts: string;
  /** Coarse phase. */
  status: AuditStatus;
  /** Optional message (e.g. error text for status='failed'). */
  message?: string;
  /** Free-form numbers a future runner may attach (rows, findings, ...). */
  metrics?: Record<string, number>;
}

class AuditProgressEmitter {
  private readonly bus = new EventEmitter();
  /** Replay buffer per audit so late subscribers still see prior events. */
  private readonly history = new Map<string, AuditProgressEvent[]>();
  /** Cap on history length to bound memory. */
  private readonly historyCap = 200;

  constructor() {
    // Audits can fan out to many SSE connections; raise the default 10 limit.
    this.bus.setMaxListeners(0);
  }

  publish(ev: AuditProgressEvent): void {
    const list = this.history.get(ev.auditId) ?? [];
    list.push(ev);
    if (list.length > this.historyCap) list.splice(0, list.length - this.historyCap);
    this.history.set(ev.auditId, list);
    this.bus.emit(`audit:${ev.auditId}`, ev);
  }

  /**
   * Subscribe to events for one audit. The listener is invoked synchronously
   * with any buffered history before live events start flowing.
   * Returns an unsubscribe function.
   */
  subscribe(auditId: string, listener: (ev: AuditProgressEvent) => void): () => void {
    const history = this.history.get(auditId);
    if (history) {
      for (const ev of history) listener(ev);
    }
    const wrapped = (ev: AuditProgressEvent): void => listener(ev);
    this.bus.on(`audit:${auditId}`, wrapped);
    return () => {
      this.bus.off(`audit:${auditId}`, wrapped);
    };
  }

  /** Drop buffered history for an audit (call after the run is terminal). */
  forget(auditId: string): void {
    this.history.delete(auditId);
  }

  /** Test helpers. */
  _historyFor(auditId: string): AuditProgressEvent[] {
    return [...(this.history.get(auditId) ?? [])];
  }
  _clearAll(): void {
    this.history.clear();
    this.bus.removeAllListeners();
  }
}

/**
 * Process-singleton. Routes import the same instance as the runner so they
 * share an in-memory channel without explicit DI.
 */
export const auditProgress = new AuditProgressEmitter();

const TERMINAL = new Set<AuditStatus>(["succeeded", "failed", "cancelled"]);

export function isTerminalStatus(s: AuditStatus): boolean {
  return TERMINAL.has(s);
}
