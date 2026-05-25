/**
 * In-memory AuditReport store.
 *
 * Phase E1 deliberately ships without a persistent store — the goal is to
 * land a working /audits endpoint that exercises the new AuditEngine end
 * to end. A pg-backed store comes in a later phase (E2/E3 work) once we
 * have the schema migration story in place.
 *
 * The store is also responsible for tracking RUNNING audits, so a caller
 * can hit GET /audits/:id immediately after POST and see "running" instead
 * of 404. We do not currently expose cancellation; that lands when the
 * route layer learns about audit jobs proper.
 */

import type { AuditReport } from "@databridge/rule-core";

export type AuditStatus = "queued" | "running" | "succeeded" | "failed";

export interface AuditRecord {
  auditId: string;
  tenantId: string;
  profileId: string;
  status: AuditStatus;
  createdAt: string;
  updatedAt: string;
  /** Present only when status === "succeeded". */
  report?: AuditReport;
  /** Present only when status === "failed". */
  error?: string;
}

export class AuditStore {
  private readonly byId = new Map<string, AuditRecord>();

  create(record: Omit<AuditRecord, "createdAt" | "updatedAt">): AuditRecord {
    const now = new Date().toISOString();
    const full: AuditRecord = { ...record, createdAt: now, updatedAt: now };
    this.byId.set(full.auditId, full);
    return full;
  }

  update(
    auditId: string,
    patch: Partial<Omit<AuditRecord, "auditId" | "createdAt">>,
  ): AuditRecord | undefined {
    const existing = this.byId.get(auditId);
    if (!existing) return undefined;
    const updated: AuditRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.byId.set(auditId, updated);
    return updated;
  }

  get(auditId: string): AuditRecord | undefined {
    return this.byId.get(auditId);
  }

  list(filter?: { tenantId?: string }): AuditRecord[] {
    const all = Array.from(this.byId.values());
    const filtered = filter?.tenantId
      ? all.filter((r) => r.tenantId === filter.tenantId)
      : all;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  clear(): void {
    this.byId.clear();
  }
}

/** Module-level singleton — apps/api keeps one store per process. */
export const auditStore = new AuditStore();
