/**
 * @databridge/audit-pack-techone-fin1-native
 *
 * Source-native Technology One Finance One integrity audit pack —
 * 13 rules from TECHONE_DATA_STRUCTURES.md §19. Family:
 * `TECHONE-FIN1-INTEGRITY`.
 *
 * The rules themselves live alongside the TechOne FinanceOne adapter so
 * the rule pack stays in lock-step with the adapter's resource
 * catalogue. This package is the public, consumer-facing entry point —
 * load the pack here, not from `@databridge/adapter-techone-financeone`.
 * Functionally identical, semantically cleaner.
 */
export {
  TECHONE_FIN1_NATIVE_RULES,
  TECHONE_FIN1_NATIVE_AUDIT_PACK,
  type TechOneFin1RuleId,
} from "@databridge/adapter-techone-financeone";
