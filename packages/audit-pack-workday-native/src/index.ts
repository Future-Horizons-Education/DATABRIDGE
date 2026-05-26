/**
 * @databridge/audit-pack-workday-native
 *
 * Source-native Workday Student integrity audit pack — 16 rules
 * spanning identity, programme, registration, marks, awards, HESA, BPs,
 * and finance surfaces. Family: `WORKDAY-INTEGRITY`.
 *
 * The rules themselves live alongside the Workday RaaS adapter so the
 * rule pack stays in lock-step with the adapter's resource catalogue.
 * This package is the public, consumer-facing entry point — load the
 * pack here, not from `@databridge/adapter-workday-raas`. Functionally
 * identical, semantically cleaner.
 */
export {
  WORKDAY_NATIVE_RULES,
  WORKDAY_NATIVE_AUDIT_PACK,
  type WorkdayNativeRuleId,
} from "@databridge/adapter-workday-raas";
