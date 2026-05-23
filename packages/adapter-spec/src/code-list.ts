import { z } from "zod";

export const CodeListEntryZ = z.object({
  code: z.string(),
  description: z.string(),
  shortDescription: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().optional(),
  attributes: z.record(z.string()).optional(),
});

export const CodeListZ = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  source: z.string(),
  version: z.string().optional(),
  entries: z.array(CodeListEntryZ),
  snapshotAt: z.string().datetime(),
});

export type CodeListEntry = z.infer<typeof CodeListEntryZ>;
export type CodeList = z.infer<typeof CodeListZ>;
