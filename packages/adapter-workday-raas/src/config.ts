import { z } from "zod";

/**
 * Config for the Workday RaaS (Reports-as-a-Service) adapter.
 * Each "resource" is a published RaaS report endpoint.
 */
export const WorkdayRaasConfigSchema = z.object({
  /** Workday tenant root, e.g. https://wd5-impl-services1.workday.com/ccx/service/{tenant}/customreport2 */
  tenantUrl: z.string().url(),
  /** Workday ISU username. */
  username: z.string().min(1),
  /** Secrets-vault key for the ISU password. */
  passwordSecretKey: z.string().min(1),
  /** Output format. Default json. */
  format: z.enum(["json", "csv", "xml"]).default("json"),
  /** Request timeout ms (RaaS reports can be slow). */
  timeoutMs: z.number().int().positive().default(120_000),
});

export type WorkdayRaasConfig = z.infer<typeof WorkdayRaasConfigSchema>;
