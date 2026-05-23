import type { AuditRule } from "./types.js";

/**
 * RuleRegistry — in-memory registry of all loaded rules.
 * Profiles register their rules here at boot.
 */
export class RuleRegistry {
  private readonly rules = new Map<string, AuditRule>();

  register(rule: AuditRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    this.rules.set(rule.id, rule);
  }

  registerMany(rules: AuditRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  get(id: string): AuditRule | undefined {
    return this.rules.get(id);
  }

  getAll(): AuditRule[] {
    return Array.from(this.rules.values());
  }

  getByFamily(family: string): AuditRule[] {
    return this.getAll().filter((r) => r.family === family);
  }

  getByTag(tag: string): AuditRule[] {
    return this.getAll().filter((r) => r.tags?.includes(tag));
  }

  getBySeverity(severity: string): AuditRule[] {
    return this.getAll().filter((r) => r.severity === severity);
  }

  size(): number {
    return this.rules.size;
  }
}

/** Singleton registry — used when running inside the API process. */
export const globalRuleRegistry = new RuleRegistry();
