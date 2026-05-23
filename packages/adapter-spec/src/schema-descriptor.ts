import { z } from "zod";

export const FieldDescriptorZ = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  isKey: z.boolean(),
  codeListRef: z.string().optional(),
  dictionaryHint: z.string().optional(),
  sampleValues: z.array(z.string()).optional(),
  maxLength: z.number().optional(),
  precision: z.number().optional(),
  scale: z.number().optional(),
  defaultValue: z.string().optional(),
});

export const ResourceDescriptorZ = z.object({
  name: z.string(),
  kind: z.enum(["table", "view", "endpoint", "report", "object"]),
  description: z.string().optional(),
  rowCountHint: z.number().optional(),
  fields: z.array(FieldDescriptorZ),
});

export const SchemaDescriptorZ = z.object({
  adapter: z.string(),
  generatedAt: z.string().datetime(),
  resources: z.array(ResourceDescriptorZ),
});

export type FieldDescriptor = z.infer<typeof FieldDescriptorZ>;
export type ResourceDescriptor = z.infer<typeof ResourceDescriptorZ>;
export type SchemaDescriptor = z.infer<typeof SchemaDescriptorZ>;
