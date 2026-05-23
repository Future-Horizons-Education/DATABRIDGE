import { z } from "zod";
import type { CodeList } from "@databridge/adapter-spec";
import type { LlmAdapter } from "@databridge/platform";

/**
 * Rule severity levels aligned with HESA Data Futures validation.
 * CRITICAL → blocks HESA return submission
 * ERROR    → must be resolved before migration commit
 * WARN     → should be reviewed; does not block
 * INFO     → informational; logged for awareness
 */
export type RuleSeverity = "CRITICAL" | "ERROR" | "WARN" | "INFO";

/**
 * Rule families (F01–F13) as defined in docs/AUDIT_RULES.md
 */
export type RuleFamily =
  | "F01" | "F02" | "F03" | "F04" | "F05" | "F06"
  | "F07" | "F08" | "F09" | "F10" | "F11" | "F12" | "F13";

/**
 * Base rule definition — all rule types extend this.
 */
export interface AuditRuleBase {
  id: string;              // e.g. "F01-01"
  family: RuleFamily;
  name: string;
  description: string;
  severity: RuleSeverity;
  ucisa_benchmark_ref?: string;
  /** Tags for filtering, e.g. ["hesa-df", "sits", "migration"] */
  tags?: string[];
  /** Whether this rule is enabled by default for new tenants */
  enabledByDefault: boolean;
}

/**
 * Deterministic SQL rule — executes a SQL query against the canonical store.
 * Rows returned by the query are AuditFindings.
 */
export interface SqlAuditRule extends AuditRuleBase {
  type: "sql";
  /**
   * SQL template. Can reference:
   *   :tenantId  → bound parameter
   *   :entityTable  → resolved canonical entity table name
   * Returns rows; each row maps to one AuditFinding.
   * The row MUST include a `subject_id` column (the affected record's id).
   */
  sql: string;
  /** Human-readable template for finding message. Use {{fieldName}} for row values. */
  messageTemplate: string;
}

/**
 * Code-list conformance rule — checks a field value against a known code list.
 */
export interface CodelistAuditRule extends AuditRuleBase {
  type: "codelist";
  /** Canonical entity field path, e.g. "Student.sexId" */
  fieldPath: string;
  /** Code-list id to validate against, e.g. "HESA.SEXID" */
  codelistId: string;
  /** Whether null/empty values should be flagged (depends on field mandatory status) */
  flagNulls: boolean;
}

/**
 * Statistical anomaly rule — compares field statistics against expected thresholds.
 */
export interface StatisticalAuditRule extends AuditRuleBase {
  type: "statistical";
  fieldPath: string;
  /** Max acceptable null percentage (0–100) */
  maxNullPct?: number;
  /** Max acceptable cardinality for low-cardinality fields */
  maxCardinality?: number;
  /** Min acceptable cardinality */
  minCardinality?: number;
  /** Statistical outlier z-score threshold for numeric fields */
  outlierZScore?: number;
}

/**
 * LLM-judged rule — defers to an AI agent for ambiguous cases.
 * ALWAYS has human-approval requirement before any action is taken.
 */
export interface LlmAuditRule extends AuditRuleBase {
  type: "llm";
  /** Prompt template. Use {{fieldValue}}, {{context}} placeholders. */
  promptTemplate: string;
  /** Expected output schema name */
  outputSchema: "anomaly-finding" | "cleansing-proposal";
}

export type AuditRule =
  | SqlAuditRule
  | CodelistAuditRule
  | StatisticalAuditRule
  | LlmAuditRule;

/**
 * Runtime context injected into every rule evaluation.
 */
export interface RuleEvalContext {
  tenantId: string;
  connectionId: string;
  /** Resolved code lists for codelist rules */
  codeLists: Map<string, CodeList>;
  /** LLM adapter (optional, only needed for llm rules) */
  llm?: LlmAdapter;
  /** Abort signal for long-running evaluations */
  signal: AbortSignal;
}
