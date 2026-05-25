import { z } from "zod";

/**
 * Config for the SITS Web Services (REST) adapter.
 * SITS exposes a JSON/XML web-services layer on top of SITS:Vision.
 */
export const SitsApiConfigSchema = z.object({
  /** Root URL e.g. https://sits.uni.ac.uk/urd/sits.urd/run/SIW_WSV */
  baseUrl: z.string().url(),
  /** Secret key (in secrets vault) for the bearer token. */
  bearerSecretKey: z.string().min(1),
  /** Optional namespace path for tenants on a shared SITS install. */
  namespace: z.string().optional(),
  /** Request timeout ms. Default 30s. */
  timeoutMs: z.number().int().positive().default(30_000),
  /** Pagination page size. Default 500. */
  pageSize: z.number().int().min(1).max(5000).default(500),
});

export type SitsApiConfig = z.infer<typeof SitsApiConfigSchema>;
