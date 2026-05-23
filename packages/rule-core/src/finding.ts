import { z } from "zod";
import type { RuleSeverity } from "./types.js";

export const AuditFindingStatusZ = z.enum([
  "open",
  "in_review",
  "resolved",
  "accepted_risk",
  "false_positive",
]);
export type AuditFindingStatus = z.infer<typeof AuditFindingStatusZ>;

export interface AuditFinding {
  id: string;
  tenantId: string;
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  /** Canonical entity type, e.g. "Student", "Enrolment" */
  entityType: string;
  /** ID of the affected canonical record */
  subjectId: string;
  /** Human-readable finding message */
  message: string;
  /** Supporting evidence (field values, stats, etc.) */
  evidence: Record<string, unknown>;
  status: AuditFindingStatus;
  /** ISO 8601 timestamp */
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  /** Source row lineage reference */
  lineageEdgeId?: string;
}

/** Factory — creates an AuditFinding from a SQL rule row. */
export function findingFromSqlRow(
  params: {
    ruleId: string;
    ruleName: string;
    severity: RuleSeverity;
    entityType: string;
    row: Record<string, unknown>;
    messageTemplate: string;
    tenantId: string;
  }
): AuditFinding {
  const message = params.messageTemplate.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => String(params.row[key] ?? "")
  );

  return {
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    ruleId: params.ruleId,
    ruleName: params.ruleName,
    severity: params.severity,
    entityType: params.entityType,
    subjectId: String(params.row["subject_id"] ?? ""),
    message,
    evidence: params.row,
    status: "open",
    detectedAt: new Date().toISOString(),
  };
}
